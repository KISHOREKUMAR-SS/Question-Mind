"""
mobile_service.py

Entry point for all Python operations called from Kotlin/React Native.
Wraps AI services, parsers, and Excel export for mobile app.

Call this module from PythonBridge.kt to execute Python functions.

Example (Kotlin):
    val result = pyObject.callAttr("generate_questions", subjectId, coverage, configs)
"""

import json
import os
import sys
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

# Import services from backend (adjust paths as needed for Chaquopy)
try:
    from ai_service import AIService
    from excel_service import ExcelService
    from cdap_parser import CDAPParser
    from syllabus_parser import SyllabusParser
except ImportError as e:
    print(f"Warning: Could not import services: {e}")

# ==================== Configuration ====================

# Get app data directory (Chaquopy provides this at runtime)
APP_DATA_DIR = os.path.expanduser("~/.questionmind")
DB_PATH = os.path.join(APP_DATA_DIR, "questions.db")
CACHE_DIR = os.path.join(APP_DATA_DIR, "cache")

# Ensure directories exist
Path(APP_DATA_DIR).mkdir(parents=True, exist_ok=True)
Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)

# ==================== AI Question Generation ====================

def generate_questions(
    subject_id: str,
    syllabus_coverage: List[Dict[str, Any]],
    part_configs: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Generate questions using native Python AI service.
    
    Args:
        subject_id: UUID of subject
        syllabus_coverage: List of units/topics to cover
        part_configs: Question part configurations
        
    Returns:
        {
            "success": bool,
            "questions": [{ id, text, options, answer, btl, unit, part }, ...],
            "error": str (if success=False)
        }
    """
    try:
        print(f"[mobile_service] Generating questions for subject {subject_id}")
        
        # Initialize AI service with multi-provider fallback
        ai_service = AIService(
            groq_api_key=os.getenv("GROQ_API_KEY"),
            cerebras_api_key=os.getenv("CEREBRAS_API_KEY"),
            nvidia_api_key=os.getenv("NVIDIA_API_KEY"),
            openrouter_api_key=os.getenv("OPENROUTER_API_KEY")
        )
        
        # Call the main generation method
        questions = ai_service.generate_questions(
            subject_id=subject_id,
            units=syllabus_coverage,
            part_configs=part_configs
        )
        
        # Save to local SQLite for offline access
        _save_questions_to_db(subject_id, questions)
        
        return {
            "success": True,
            "questions": questions,
            "count": len(questions),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"[mobile_service] Error generating questions: {e}")
        return {
            "success": False,
            "error": str(e),
            "questions": []
        }

# ==================== Excel Export ====================

def export_questions_excel(
    questions: List[Dict[str, Any]],
    output_path: str
) -> Dict[str, Any]:
    """
    Export questions to Excel file.
    
    Args:
        questions: List of question objects
        output_path: Full path for output Excel file
        
    Returns:
        {
            "success": bool,
            "file_path": str,
            "file_size": int,
            "error": str (if success=False)
        }
    """
    try:
        print(f"[mobile_service] Exporting {len(questions)} questions to {output_path}")
        
        excel_service = ExcelService()
        excel_service.export_to_excel(
            questions=questions,
            output_path=output_path
        )
        
        # Get file size
        file_size = os.path.getsize(output_path)
        
        return {
            "success": True,
            "file_path": output_path,
            "file_size": file_size,
            "file_name": os.path.basename(output_path)
        }
        
    except Exception as e:
        print(f"[mobile_service] Error exporting to Excel: {e}")
        return {
            "success": False,
            "error": str(e),
            "file_path": None
        }

# ==================== Document Parsing ====================

def parse_cdap_file(file_path: str) -> Dict[str, Any]:
    """
    Parse CDAP (Curriculum Design & Assessment Plan) document.
    
    Supports PDF and Excel formats.
    
    Args:
        file_path: Path to CDAP file
        
    Returns:
        {
            "success": bool,
            "courses": [...],
            "units": [...],
            "assessment_plan": {...},
            "error": str (if success=False)
        }
    """
    try:
        print(f"[mobile_service] Parsing CDAP from {file_path}")
        
        parser = CDAPParser()
        result = parser.parse_file(file_path)
        
        return {
            "success": True,
            "courses": result.get("courses", []),
            "units": result.get("units", []),
            "assessment_plan": result.get("assessment_plan", {}),
            "raw": result
        }
        
    except Exception as e:
        print(f"[mobile_service] Error parsing CDAP: {e}")
        return {
            "success": False,
            "error": str(e)
        }

def parse_syllabus_file(file_path: str) -> Dict[str, Any]:
    """
    Parse syllabus document.
    
    Extracts units, topics, learning outcomes, and assessment patterns.
    
    Args:
        file_path: Path to syllabus file (Excel or PDF)
        
    Returns:
        {
            "success": bool,
            "units": [{ id, name, topics, outcomes }, ...],
            "error": str (if success=False)
        }
    """
    try:
        print(f"[mobile_service] Parsing syllabus from {file_path}")
        
        parser = SyllabusParser()
        result = parser.parse_file(file_path)
        
        return {
            "success": True,
            "units": result.get("units", []),
            "course_name": result.get("course_name"),
            "course_code": result.get("course_code"),
            "raw": result
        }
        
    except Exception as e:
        print(f"[mobile_service] Error parsing syllabus: {e}")
        return {
            "success": False,
            "error": str(e)
        }

# ==================== SQLite Local Storage ====================

def execute_sqlite_query(
    query: str,
    params: List[Any] = None
) -> Dict[str, Any]:
    """
    Execute SQLite query on local database.
    
    Args:
        query: SQL query string
        params: Query parameters
        
    Returns:
        {
            "success": bool,
            "rows": [...],
            "changes": int,
            "error": str (if success=False)
        }
    """
    if params is None:
        params = []
        
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row  # Return rows as dicts
        cursor = conn.cursor()
        
        cursor.execute(query, params)
        
        # Check if it's a SELECT query
        if query.strip().upper().startswith("SELECT"):
            rows = [dict(row) for row in cursor.fetchall()]
            return {
                "success": True,
                "rows": rows,
                "count": len(rows)
            }
        else:
            # INSERT, UPDATE, DELETE
            conn.commit()
            return {
                "success": True,
                "changes": cursor.rowcount
            }
            
    except Exception as e:
        print(f"[mobile_service] SQLite error: {e}")
        return {
            "success": False,
            "error": str(e)
        }
    finally:
        if conn:
            conn.close()

# ==================== Helper Functions ====================

def _save_questions_to_db(subject_id: str, questions: List[Dict[str, Any]]) -> None:
    """Save generated questions to local SQLite for offline access."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Create questions table if needed
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS questions (
                id TEXT PRIMARY KEY,
                subject_id TEXT,
                question_text TEXT,
                answer TEXT,
                options TEXT,
                btl_level TEXT,
                unit_id TEXT,
                part_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Insert questions
        for q in questions:
            cursor.execute('''
                INSERT OR REPLACE INTO questions
                (id, subject_id, question_text, answer, options, btl_level, unit_id, part_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                q.get("id"),
                subject_id,
                q.get("question_text"),
                q.get("answer"),
                json.dumps(q.get("options", [])),
                q.get("btl_level"),
                q.get("unit_id"),
                q.get("part_name")
            ))
        
        conn.commit()
        conn.close()
        print(f"[mobile_service] Saved {len(questions)} questions to local database")
        
    except Exception as e:
        print(f"[mobile_service] Error saving questions: {e}")

def get_cached_questions(subject_id: str) -> Dict[str, Any]:
    """Retrieve cached questions from local SQLite for offline access."""
    try:
        result = execute_sqlite_query(
            "SELECT * FROM questions WHERE subject_id = ? ORDER BY created_at DESC",
            [subject_id]
        )
        
        if result["success"]:
            # Parse JSON options field
            for row in result.get("rows", []):
                if isinstance(row.get("options"), str):
                    row["options"] = json.loads(row["options"])
            
            return {
                "success": True,
                "questions": result["rows"],
                "count": len(result["rows"])
            }
        else:
            return result
            
    except Exception as e:
        print(f"[mobile_service] Error retrieving cached questions: {e}")
        return {
            "success": False,
            "error": str(e)
        }

# ==================== Startup Check ====================

if __name__ == "__main__":
    print("[mobile_service] Python runtime initialized")
    print(f"[mobile_service] App data directory: {APP_DATA_DIR}")
    print(f"[mobile_service] Database: {DB_PATH}")
    print("[mobile_service] Ready to accept calls from Kotlin")

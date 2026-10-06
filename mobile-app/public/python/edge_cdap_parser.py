import re
from typing import List, Dict, Optional


class CDAPParser:
    """Edge CDAP parser — works on pre-extracted text from PDF/DOCX/Excel.
    
    Parses Course Delivery and Assessment Plan (CDAP) structure:
    - Units/Modules
    - Part 1 and Part 2 topics within each unit
    """

    def parse_text(self, text: str) -> List[Dict]:
        """Main entry: parse CDAP from raw text."""
        if not text or not text.strip():
            return []
        
        # Try table-style parsing first (pipe-separated rows from PDF tables)
        rows = self._extract_table_rows(text)
        if rows and len(rows) > 2:
            result = self._parse_table_rows(rows)
            if result and len(result) > 0:
                return result
        
        # Fallback to text-based parsing
        return self._extract_cdap_structure(text)

    def parse_excel_rows(self, rows: list) -> List[Dict]:
        """Parse from list-of-lists (from openpyxl worksheet)."""
        if not rows:
            return []
        return self._parse_table_rows(rows)

    # ── Table row extraction from text ──

    def _extract_table_rows(self, text: str) -> list:
        """Try to extract table rows from raw text (pipe-separated)."""
        lines = text.strip().split('\n')
        rows = []
        for line in lines:
            line = line.strip()
            if '|' in line:
                cells = [c.strip() for c in line.split('|')]
                if any(c for c in cells):
                    rows.append(cells)
            elif '\t' in line:
                cells = [c.strip() for c in line.split('\t')]
                if any(c for c in cells):
                    rows.append(cells)
        return rows

    # ── Table-based parsing ──

    def _parse_table_rows(self, rows: list) -> List[Dict]:
        """Parse table rows with auto-detected columns."""
        if not rows:
            return []
        
        units = {}
        current_unit = None
        current_unit_name = None
        
        # Find header row
        header_row_idx = 0
        for idx, row in enumerate(rows[:5]):
            row_values = [str(c).strip().upper() if c else '' for c in row]
            if any('UNIT' in v or 'PART' in v or 'TOPIC' in v for v in row_values):
                header_row_idx = idx
                break
        
        # Detect column indices from header
        col_indices = {'unit': 0, 'unit_name': 1, 'part': 3, 'topic': 4, 'subtopic': 5}
        if header_row_idx < len(rows):
            header = rows[header_row_idx]
            for idx, cell in enumerate(header):
                if cell:
                    cell_upper = str(cell).upper().replace('\n', ' ')
                    if 'UNIT' in cell_upper and 'NAME' not in cell_upper and idx < 2:
                        col_indices['unit'] = idx
                    elif 'SYLLABUS' in cell_upper or ('UNIT' in cell_upper and 'NAME' in cell_upper):
                        col_indices['unit_name'] = idx
                    elif 'PART' in cell_upper:
                        col_indices['part'] = idx
                    elif 'TOPIC' in cell_upper and 'SUB' not in cell_upper:
                        col_indices['topic'] = idx
                    elif 'SUB' in cell_upper and 'TOPIC' in cell_upper:
                        col_indices['subtopic'] = idx
        
        # Parse data rows
        for row in rows[header_row_idx + 1:]:
            if not row or all(cell is None or str(cell).strip() == '' for cell in row):
                continue
            
            row_values = [str(c).strip().replace('\n', ' ') if c is not None else '' for c in row]
            
            # Skip rows with #REF! or invalid data
            if row_values and '#REF!' in row_values[0]:
                continue
            
            part_num = None
            
            # Check column for Unit Number
            unit_col = col_indices['unit']
            if len(row_values) > unit_col and row_values[unit_col]:
                unit_val = row_values[unit_col]
                if unit_val.upper() not in ['UNIT', 'UNIT NO', 'UNIT NO.', 'UNIT NUMBER', 'NONE', '']:
                    u_match = re.search(r'(?:unit|module)?\s*[:\-]?\s*([\d.]+)', unit_val, re.IGNORECASE)
                    if u_match:
                        unit_num = int(float(u_match.group(1)))
                        current_unit = unit_num
                        unit_name_col = col_indices['unit_name']
                        if len(row_values) > unit_name_col and row_values[unit_name_col]:
                            current_unit_name = row_values[unit_name_col]
            
            if current_unit is None:
                current_unit = 1
            
            # Get Part Number
            part_col = col_indices['part']
            if len(row_values) > part_col and row_values[part_col]:
                part_val = row_values[part_col]
                if part_val.upper() not in ['PART NO', 'PART NO.', 'PART NUMBER', 'PART', 'NONE', '']:
                    if part_val in ['1', '1.0', 'Part 1', 'Part-1', 'I', 'PART I']:
                        part_num = 1
                    elif part_val in ['2', '2.0', 'Part 2', 'Part-2', 'II', 'PART II']:
                        part_num = 2
                    else:
                        p_match = re.search(r'[\d.]+', part_val)
                        if p_match:
                            part_num = int(float(p_match.group()))
            
            # Get Topic
            topic_col = col_indices['topic']
            topics_to_add = []
            if len(row_values) > topic_col and row_values[topic_col]:
                topic_val = row_values[topic_col]
                if 'TOPIC' not in topic_val.upper() or len(topic_val) > 30:
                    if len(topic_val) > 3 and topic_val.upper() != 'NONE':
                        topics_to_add.append(topic_val)
            
            # Initialize unit
            if current_unit not in units:
                unit_name = current_unit_name if current_unit_name else f"Unit {current_unit}"
                units[current_unit] = {
                    "unit_number": current_unit,
                    "unit_name": unit_name,
                    "part1_topics": [],
                    "part2_topics": []
                }
            elif current_unit_name and units[current_unit]["unit_name"] == f"Unit {current_unit}":
                units[current_unit]["unit_name"] = current_unit_name
            
            # Add topics
            for topic_text in topics_to_add:
                if topic_text:
                    subtopics = []
                    subtopic_col = col_indices.get('subtopic', 5)
                    if len(row_values) > subtopic_col and row_values[subtopic_col]:
                        subtopic_val = row_values[subtopic_col].strip()
                        if subtopic_val and len(subtopic_val) > 3 and 'SUB' not in subtopic_val.upper()[:10]:
                            subtopics.append(subtopic_val)
                    
                    target_part = part_num if part_num else 1
                    target_list = units[current_unit]["part1_topics"] if target_part == 1 else units[current_unit]["part2_topics"]
                    
                    existing_topic = next((t for t in target_list if t["topic"] == topic_text), None)
                    if existing_topic:
                        for st in subtopics:
                            if st not in existing_topic["subtopics"]:
                                existing_topic["subtopics"].append(st)
                    else:
                        target_list.append({"topic": topic_text, "subtopics": subtopics})
        
        return list(units.values())

    # ── Text-based parsing ──

    def _extract_cdap_structure(self, text: str) -> List[Dict]:
        """Extract CDAP structure from plain text."""
        units = []
        current_unit = None
        current_part = None
        
        lines = text.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Detect unit/module headers
            unit_match = re.search(
                r'(?:unit|module)\s*[-:]?\s*([IVX\d]+)(?:\s*[-:]\s*(.+))?',
                line, re.IGNORECASE
            )
            if not unit_match:
                simple_match = re.match(r'^(\d+)(?:\s+|(?:\s*[|]\s*))([A-Za-z].+)', line)
                if simple_match:
                    u_num = int(simple_match.group(1))
                    if 1 <= u_num <= 10:
                        unit_match = simple_match

            if unit_match:
                unit_num = self._roman_to_int(unit_match.group(1))
                unit_name = unit_match.group(2).strip() if unit_match.group(2) else f"Unit {unit_num}"
                
                current_unit = {
                    "unit_number": unit_num,
                    "unit_name": unit_name,
                    "part1_topics": [],
                    "part2_topics": []
                }
                units.append(current_unit)
                continue
            
            # Detect Part 1/Part 2 headers
            part1_match = re.search(r'part\s*[-:]?\s*1|part\s*i(?:\s|$)', line, re.IGNORECASE)
            part2_match = re.search(r'part\s*[-:]?\s*2|part\s*ii(?:\s|$)', line, re.IGNORECASE)
            
            if part1_match:
                current_part = 1
                continue
            elif part2_match:
                current_part = 2
                continue
            
            # Add topics
            if current_unit and current_part and self._is_valid_topic(line):
                topic = self._clean_topic(line)
                if topic:
                    topic_entry = {"topic": topic, "subtopics": []}
                    if current_part == 1:
                        if not any(t["topic"] == topic for t in current_unit["part1_topics"]):
                            current_unit["part1_topics"].append(topic_entry)
                    else:
                        if not any(t["topic"] == topic for t in current_unit["part2_topics"]):
                            current_unit["part2_topics"].append(topic_entry)
        
        return units

    # ── Helpers ──

    def _is_valid_topic(self, text: str) -> bool:
        text = text.strip()
        if len(text) < 5:
            return False
        if re.match(r'^[\d.]+$', text):
            return False
        if text.lower() in ['part 1', 'part 2', 'part i', 'part ii', 'topics']:
            return False
        return True

    def _clean_topic(self, text: str) -> str:
        text = re.sub(r'^[\d.•\-–]+\s*', '', text)
        text = ' '.join(text.split())
        return text.strip()

    def _roman_to_int(self, s: str) -> int:
        s = s.strip().upper()
        if s.isdigit():
            return int(s)
        roman = {'I': 1, 'V': 5, 'X': 10}
        result = 0
        prev = 0
        for char in reversed(s):
            val = roman.get(char, 0)
            if val < prev:
                result -= val
            else:
                result += val
            prev = val
        return result if result > 0 else 1


cdap_parser = CDAPParser()

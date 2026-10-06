from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
import os
import shutil
from datetime import datetime

from ..database import get_db
from ..models import Syllabus, Subject, User, StaffAssignment, UserRole, CDAP, QuestionBank
from ..schemas import SyllabusCreate, SyllabusUpdate, SyllabusResponse
from ..schemas.cdap import CDAPResponse, CDAPUpdate
from ..services.auth import get_current_user
from ..services.syllabus_parser import syllabus_parser
from ..services.cdap_parser import cdap_parser

router = APIRouter(prefix="/syllabus", tags=["Syllabus"])

from ..config import settings
UPLOAD_DIR = settings.upload_syllabus_dir
CDAP_UPLOAD_DIR = settings.upload_cdap_dir



def _own_subject_or_404(db: Session, subject_id: str, user: User) -> Subject:
    """Return the subject only if the current user owns it, else 404."""
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject or subject.created_by != user.id:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject

def can_upload_syllabus(db: Session, user: User, subject_id: str) -> bool:
    """A user may only upload for a subject they created."""
    subject = db.query(Subject).filter(
        Subject.id == subject_id, Subject.created_by == user.id
    ).first()
    return subject is not None

@router.get("", response_model=List[SyllabusResponse])
async def get_all_syllabus(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    # Per-user isolation: only syllabi belonging to subjects the user created
    return (
        db.query(Syllabus)
        .join(Subject, Syllabus.subject_id == Subject.id)
        .filter(Subject.created_by == user.id)
        .all()
    )

@router.get("/subject/{subject_id}", response_model=SyllabusResponse)
async def get_syllabus_by_subject(
    subject_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    _own_subject_or_404(db, subject_id, user)
    syllabus = db.query(Syllabus).filter(Syllabus.subject_id == subject_id).first()
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    return syllabus

@router.get("/{syllabus_id}", response_model=SyllabusResponse)
async def get_syllabus(
    syllabus_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    syllabus = db.query(Syllabus).filter(Syllabus.id == syllabus_id).first()
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    _own_subject_or_404(db, syllabus.subject_id, user)
    return syllabus

@router.post("/upload/{subject_id}", response_model=SyllabusResponse)
async def upload_syllabus(
    subject_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    # Check subject exists
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    # Check permission to upload
    if not can_upload_syllabus(db, user, subject_id):
        raise HTTPException(status_code=403, detail="You don't have permission to upload syllabus for this subject")
    
    # Save file
    ext = os.path.splitext(file.filename)[1]
    filename = f"{subject.code}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # Parse syllabus
    units = syllabus_parser.parse_file(filepath)
    
    # Check if syllabus exists for subject
    existing = db.query(Syllabus).filter(Syllabus.subject_id == subject_id).first()
    
    if existing:
        existing.units = units
        existing.source_file = filepath
        existing.parsed_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    else:
        syllabus = Syllabus(
            id=str(uuid.uuid4()),
            subject_id=subject_id,
            units=units,
            source_file=filepath,
            parsed_at=datetime.utcnow()
        )
        db.add(syllabus)
        db.commit()
        db.refresh(syllabus)
        return syllabus

@router.put("/{syllabus_id}", response_model=SyllabusResponse)
async def update_syllabus(
    syllabus_id: str,
    data: SyllabusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    syllabus = db.query(Syllabus).filter(Syllabus.id == syllabus_id).first()
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    _own_subject_or_404(db, syllabus.subject_id, user)

    update_data = data.dict(exclude_unset=True)
    if 'units' in update_data:
        update_data['units'] = [u.dict() if hasattr(u, 'model_dump') else u for u in update_data['units']]
    
    for key, value in update_data.items():
        setattr(syllabus, key, value)
    
    db.commit()
    db.refresh(syllabus)
    return syllabus

@router.delete("/{syllabus_id}")
async def delete_syllabus(
    syllabus_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    syllabus = db.query(Syllabus).filter(Syllabus.id == syllabus_id).first()
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    _own_subject_or_404(db, syllabus.subject_id, user)

    # Delete associated question banks first (Cascade Delete manual)
    db.query(QuestionBank).filter(QuestionBank.syllabus_id == syllabus_id).delete()
    
    # Delete source file
    if syllabus.source_file and os.path.exists(syllabus.source_file):
        try:
            os.remove(syllabus.source_file)
        except:
            pass

    db.delete(syllabus)
    db.commit()
    return {"message": "Syllabus and associated data deleted"}


# ==================== CDAP ENDPOINTS ====================

@router.post("/cdap/preview")
async def preview_cdap(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """Preview CDAP file parsing without saving to database"""
    import tempfile
    
    # Validate file type
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.pdf', '.docx', '.doc', '.xlsx', '.xls']:
        raise HTTPException(status_code=400, detail="Unsupported file type. Please upload PDF, DOCX, or Excel file.")
    
    # Save to temp file for parsing
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    
    try:
        # Parse CDAP
        units = cdap_parser.parse_file(tmp_path)
        
        if not units:
            raise HTTPException(status_code=400, detail="Could not extract any units from CDAP. Please check file format.")
        
        return {"units": units, "source_file": file.filename}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CDAP: {str(e)}")
    finally:
        # Clean up temp file
        try:
            os.remove(tmp_path)
        except:
            pass


@router.get("/cdap/{subject_id}", response_model=CDAPResponse)
async def get_cdap_by_subject(
    subject_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get CDAP for a subject"""
    _own_subject_or_404(db, subject_id, user)
    cdap = db.query(CDAP).filter(CDAP.subject_id == subject_id).first()
    if not cdap:
        raise HTTPException(status_code=404, detail="CDAP not found for this subject")
    return cdap


@router.post("/cdap/upload/{subject_id}", response_model=CDAPResponse)
async def upload_cdap(
    subject_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Upload and parse CDAP file (PDF, DOCX, or Excel)"""
    # Check subject exists
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    # Check permission (same as syllabus)
    if not can_upload_syllabus(db, user, subject_id):
        raise HTTPException(status_code=403, detail="You don't have permission to upload CDAP for this subject")
    
    # Validate file type
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.pdf', '.docx', '.doc', '.xlsx', '.xls']:
        raise HTTPException(status_code=400, detail="Unsupported file type. Please upload PDF, DOCX, or Excel file.")
    
    # Save file
    filename = f"{subject.code}_cdap_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(CDAP_UPLOAD_DIR, filename)
    
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # Parse CDAP
    try:
        units = cdap_parser.parse_file(filepath)
    except Exception as e:
        os.remove(filepath)  # Clean up on failure
        raise HTTPException(status_code=400, detail=f"Failed to parse CDAP: {str(e)}")
    
    if not units:
        os.remove(filepath)
        raise HTTPException(status_code=400, detail="Could not extract any units from CDAP. Please check file format.")
    
    # Check if CDAP exists for subject
    existing = db.query(CDAP).filter(CDAP.subject_id == subject_id).first()
    
    if existing:
        # Delete old file if different
        if existing.source_file and existing.source_file != filepath and os.path.exists(existing.source_file):
            try:
                os.remove(existing.source_file)
            except:
                pass
        existing.units = [u if isinstance(u, dict) else u for u in units]
        existing.source_file = filepath
        existing.parsed_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    else:
        cdap_record = CDAP(
            id=str(uuid.uuid4()),
            subject_id=subject_id,
            units=units,
            source_file=filepath,
            parsed_at=datetime.utcnow()
        )
        db.add(cdap_record)
        db.commit()
        db.refresh(cdap_record)
        return cdap_record


@router.delete("/cdap/{subject_id}")
async def delete_cdap(
    subject_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Delete CDAP for a subject"""
    _own_subject_or_404(db, subject_id, user)
    cdap = db.query(CDAP).filter(CDAP.subject_id == subject_id).first()
    if not cdap:
        raise HTTPException(status_code=404, detail="CDAP not found")
    
    # Delete source file
    if cdap.source_file and os.path.exists(cdap.source_file):
        try:
            os.remove(cdap.source_file)
        except:
            pass
    
    db.delete(cdap)
    db.commit()
    return {"message": "CDAP deleted"}


@router.put("/cdap/{subject_id}", response_model=CDAPResponse)
async def update_cdap(
    subject_id: str,
    data: CDAPUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Update CDAP for a subject"""
    _own_subject_or_404(db, subject_id, user)
    try:
        cdap = db.query(CDAP).filter(CDAP.subject_id == subject_id).first()
        if not cdap:
            raise HTTPException(status_code=404, detail="CDAP not found")
        
        # Update units
        # Ensure all items are proper dicts or objects
        units_data = [u.dict() if hasattr(u, 'model_dump') else u for u in data.units]
        cdap.units = units_data
        cdap.parsed_at = datetime.utcnow()
        
        db.commit()
        db.refresh(cdap)
        return cdap
    except Exception as e:
        print(f"Error updating CDAP: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update CDAP: {str(e)}")


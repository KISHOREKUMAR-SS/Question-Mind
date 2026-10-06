from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import uuid

from ..database import get_db
from ..models import Subject, User, UserRole, StaffAssignment
from ..schemas import SubjectCreate, SubjectUpdate, SubjectResponse
from ..services.auth import get_current_user

router = APIRouter(prefix="/subjects", tags=["Subjects"])

@router.get("", response_model=List[SubjectResponse])
async def get_all_subjects(
    department: str = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    # Per-user isolation: a user only ever sees the subjects they created
    query = db.query(Subject).filter(Subject.created_by == user.id)
    if department:
        query = query.filter(Subject.department == department)
    subjects = query.all()
    
    # Add staff assignments to each subject
    result = []
    for subject in subjects:
        subject_dict = SubjectResponse.from_orm(subject).dict()
        assignments = db.query(StaffAssignment).filter(
            StaffAssignment.subject_id == subject.id,
            StaffAssignment.is_active == True
        ).all()
        subject_dict['assigned_staff'] = [
            {
                'id': a.id,
                'staff_email': a.staff_email,
                'staff_name': a.staff_name,
                'can_edit_pattern': a.can_edit_pattern,
                'can_generate_questions': a.can_generate_questions,
                'can_approve': a.can_approve
            }
            for a in assignments
        ]
        result.append(subject_dict)
    
    return result

@router.get("/{subject_id}", response_model=SubjectResponse)
async def get_subject(
    subject_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject or subject.created_by != user.id:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject

@router.post("", response_model=SubjectResponse)
async def create_subject(
    data: SubjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    # Any authenticated user can create subjects now
    
    # Check duplicate code
    existing = db.query(Subject).filter(Subject.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Subject code already exists")
    
    subject = Subject(
        id=str(uuid.uuid4()),
        code=data.code,
        name=data.name,
        semester=data.semester,
        department=data.department or user.department,
        credits=data.credits,
        nature=data.nature.value if data.nature else "THEORY",
        configuration=data.configuration.dict() if data.configuration else None,
        created_by=user.id
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)
    
    # Automatically assign the creator to the subject so they can manage it
    assignment = StaffAssignment(
        id=str(uuid.uuid4()),
        subject_id=subject.id,
        staff_email=user.email,
        staff_name=user.name,
        can_edit_pattern=True,
        can_generate_questions=True,
        can_approve=True,
        is_active=True,
        assigned_by=user.id
    )
    db.add(assignment)
    db.commit()
    
    return subject

@router.put("/{subject_id}", response_model=SubjectResponse)
async def update_subject(
    subject_id: str,
    data: SubjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject or subject.created_by != user.id:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Update fields - explicitly handle each field
    if data.code is not None:
        subject.code = data.code
    if data.name is not None:
        subject.name = data.name
    if data.semester is not None:
        subject.semester = data.semester
    if data.department is not None:
        subject.department = data.department
    if data.credits is not None:
        subject.credits = data.credits
    
    # Handle nature enum
    if data.nature is not None:
        subject.nature = data.nature.value if hasattr(data.nature, 'value') else data.nature
    
    # Handle configuration - ensure proper JSON serialization
    if data.configuration is not None:
        config_dict = data.configuration.dict()
        # Make sure parts are serialized with proper BloomLevel values
        if 'parts' in config_dict:
            for part in config_dict['parts']:
                if 'allowedBTLLevels' in part:
                    part['allowedBTLLevels'] = [
                        btl.value if hasattr(btl, 'value') else btl
                        for btl in part['allowedBTLLevels']
                    ]
        subject.configuration = config_dict
    
    db.commit()
    db.refresh(subject)
    return subject

@router.delete("/{subject_id}")
async def delete_subject(
    subject_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject or subject.created_by != user.id:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    db.delete(subject)
    db.commit()
    return {"message": "Subject deleted"}

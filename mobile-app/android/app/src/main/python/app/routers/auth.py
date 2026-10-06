from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from ..database import get_db
from ..models import User, UserRole
from ..schemas import (
    UserCreate,
    UserLogin,
    UserResponse,
    TokenResponse,
    PublicPasswordResetRequest,
    UserUpdateRequest,
    PasswordResetRequest
)
from ..services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_role
)
from ..services.email_service import (
    send_user_welcome_email,
    send_user_update_email,
    send_user_password_reset_email
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    
    if not user or not verify_password(data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    
    return TokenResponse(
        access_token=token,
        user=UserResponse.from_orm(user)
    )

@router.post("/reset-password-direct")
async def reset_password_direct(data: PublicPasswordResetRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found with this email")
    user_email = user.email
    user_name = user.name

    user.password = hash_password(data.new_password)
    db.commit()
    
    # Send email notification
    background_tasks.add_task(
        send_user_password_reset_email,
        recipient_email=user_email,
        name=user_name,
        new_password=data.new_password
    )
        
    return {"message": "Password updated successfully"}

@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse.from_orm(user)



@router.get("/users", response_model=List[UserResponse])
async def get_all_users(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMIN.value))
):
    """Admin only: get all users"""
    users = db.query(User).all()
    return [UserResponse.from_orm(u) for u in users]

@router.post("/users", response_model=UserResponse)
async def create_user(
    data: UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.ADMIN.value))
):
    """Admin only: create a single user manually"""
    if data.role.value == UserRole.ADMIN.value:
        raise HTTPException(status_code=400, detail="Cannot assign or create ADMIN role")

    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user = User(
        id=str(uuid.uuid4()),
        email=data.email,
        password=hash_password(data.password),
        name=data.name,
        role=UserRole(data.role.value),
        department=data.department
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Send welcome email notification
    background_tasks.add_task(
        send_user_welcome_email,
        recipient_email=user.email,
        name=user.name,
        password=data.password,
        role=user.role,
        department=user.department
    )
    
    return UserResponse.from_orm(user)

@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    data: UserUpdateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.ADMIN.value))
):
    """Admin only: update any user's details"""
    user_to_update = db.query(User).filter(User.id == user_id).first()
    if not user_to_update:
        raise HTTPException(status_code=404, detail="User not found")
    
    changes = {}
    
    if data.name is not None and data.name != user_to_update.name:
        changes["name"] = (user_to_update.name, data.name)
        user_to_update.name = data.name
        
    if data.email is not None and data.email != user_to_update.email:
        # Check if email already exists
        existing = db.query(User).filter(User.email == data.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered by another user")
        changes["email"] = (user_to_update.email, data.email)
        user_to_update.email = data.email
        
    if data.role is not None and data.role.value != user_to_update.role:
        if data.role.value == UserRole.ADMIN.value:
            raise HTTPException(status_code=400, detail="Cannot assign or create ADMIN role")
        if user_to_update.role == UserRole.ADMIN.value:
            raise HTTPException(status_code=400, detail="The single admin role cannot be changed")
        changes["role"] = (user_to_update.role, data.role.value)
        user_to_update.role = data.role.value
        
    if data.department is not None and data.department != user_to_update.department:
        changes["department"] = (user_to_update.department, data.department)
        user_to_update.department = data.department

    user_email = user_to_update.email
    user_name = user_to_update.name

    db.commit()
    db.refresh(user_to_update)
    
    # If there are changes, trigger the email notification
    if changes:
        background_tasks.add_task(
            send_user_update_email,
            recipient_email=user_email,
            name=user_name,
            changes=changes
        )
        
    return UserResponse.from_orm(user_to_update)

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.ADMIN.value))
):
    """Admin only: delete a user"""
    user_to_delete = db.query(User).filter(User.id == user_id).first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Do not allow deleting oneself
    if user_to_delete.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account")
        
    db.delete(user_to_delete)
    db.commit()
    return {"message": "User deleted successfully"}

@router.put("/users/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    data: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.ADMIN.value))
):
    """Admin only: reset a user's password"""
    user_to_update = db.query(User).filter(User.id == user_id).first()
    if not user_to_update:
        raise HTTPException(status_code=404, detail="User not found")
    user_email = user_to_update.email
    user_name = user_to_update.name

    user_to_update.password = hash_password(data.new_password)
    db.commit()
    
    # Send email notification
    background_tasks.add_task(
        send_user_password_reset_email,
        recipient_email=user_email,
        name=user_name,
        new_password=data.new_password
    )
    
    return {"message": "Password reset successfully"}

import io
import openpyxl
from fastapi import UploadFile, File

@router.post("/users/bulk-upload")
async def bulk_upload_users(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.ADMIN.value))
):
    """Admin only: Bulk create users from Excel file"""
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")
    
    try:
        contents = await file.read()
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
        ws = wb.active
        
        created_count = 0
        skipped_emails = []
        
        # Assume columns: 1: Name, 2: Email, 3: Password
        # Skip header row
        for row in ws.iter_rows(min_row=2, values_only=True):
            if len(row) < 3 or not row[0] or not row[1] or not row[2]:
                continue
                
            name = str(row[0]).strip()
            email = str(row[1]).strip().lower()
            password = str(row[2]).strip()
            
            existing = db.query(User).filter(User.email == email).first()
            if existing:
                skipped_emails.append(email)
                continue
                
            user = User(
                id=str(uuid.uuid4()),
                email=email,
                password=hash_password(password),
                name=name,
                role=UserRole.FACULTY.value,
                department="General"
            )
            db.add(user)
            created_count += 1
            
            # Send welcome email notification
            background_tasks.add_task(
                send_user_welcome_email,
                recipient_email=email,
                name=name,
                password=password,
                role=UserRole.FACULTY.value,
                department="General"
            )
            
        db.commit()
        return {
            "message": f"Successfully created {created_count} users.",
            "created_count": created_count,
            "skipped_emails": skipped_emails
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to process file: {str(e)}")


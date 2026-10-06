from pydantic import BaseModel, EmailStr
from typing import Optional, List

class StaffPermissions(BaseModel):
    canEditPattern: bool = False
    canGenerateQuestions: bool = True
    canApprove: bool = False

class AssignStaffRequest(BaseModel):
    staff_email: str
    staff_name: Optional[str] = None
    permissions: StaffPermissions

class UpdatePermissionsRequest(BaseModel):
    permissions: StaffPermissions

class StaffAssignmentResponse(BaseModel):
    id: str
    subject_id: str
    staff_email: str
    staff_name: Optional[str]
    can_edit_pattern: bool
    can_generate_questions: bool
    can_approve: bool
    is_active: bool
    
    class Config:
        orm_mode = True

class MySubjectAssignment(BaseModel):
    subjectId: str
    subjectName: str
    subjectCode: str
    subjectNature: Optional[str] = None
    subjectConfiguration: Optional[dict] = None
    canEditPattern: bool
    canGenerateQuestions: bool
    canApprove: bool

class FacultyListResponse(BaseModel):
    id: str
    email: str
    name: str
    department: Optional[str] = None
    
    class Config:
        orm_mode = True

# ── HOD Excel Staff Import ────────────────────────────────────────────────────

class StaffImportRow(BaseModel):
    """Represents one row parsed from the HOD's Excel upload."""
    name: str
    email: str
    subjects: Optional[List[str]] = None   # Subject codes (optional column)

class StaffImportResult(BaseModel):
    """Summary returned after an Excel staff import."""
    created: int = 0          # New user records created
    updated: int = 0          # Existing users whose assignments were updated
    assignments_added: int = 0
    errors: List[str] = []    # Row-level error messages

# ── All Staff (HOD dashboard) ─────────────────────────────────────────────────

class AllStaffResponse(BaseModel):
    id: str
    email: str
    name: str
    department: Optional[str] = None
    is_active: bool = True
    assigned_subjects: List[str] = []   # Subject codes

    class Config:
        orm_mode = True


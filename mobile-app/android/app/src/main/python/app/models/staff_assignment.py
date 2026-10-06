from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class StaffAssignment(Base):
    __tablename__ = "staff_assignments"
    
    id = Column(String(36), primary_key=True)
    subject_id = Column(String(36), ForeignKey("subjects.id"))
    staff_email = Column(String(255), nullable=False)
    staff_name = Column(String(255))
    can_edit_pattern = Column(Boolean, default=False)
    can_generate_questions = Column(Boolean, default=True)
    can_approve = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    assigned_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    subject = relationship("Subject", back_populates="staff_assignments")

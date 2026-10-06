from sqlalchemy import Column, String, Integer, JSON, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base
import enum

class QuestionBankStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class QuestionPattern(Base):
    __tablename__ = "question_patterns"

    id = Column(String(36), primary_key=True)
    subject_id = Column(String(36), ForeignKey("subjects.id"), unique=True)
    parts = Column(JSON)  # List of PartConfiguration
    is_active = Column(Boolean, default=True)
    notes = Column(Text)
    unit_question_counts = Column(JSON, nullable=True)
    unit_configs = Column(JSON, nullable=True)
    created_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    subject = relationship("Subject", back_populates="question_pattern")

class QuestionBank(Base):
    __tablename__ = "question_banks"

    id = Column(String(36), primary_key=True)
    subject_id = Column(String(36), ForeignKey("subjects.id"))
    syllabus_id = Column(String(36), ForeignKey("syllabi.id"))
    pattern_id = Column(String(36), ForeignKey("question_patterns.id"))
    title = Column(String(255))
    questions = Column(JSON)  # Full question bank data
    status = Column(String(30), default="DRAFT")  # DRAFT, PENDING_APPROVAL, APPROVED, REJECTED
    rejection_reason = Column(Text)
    generated_by = Column(String(36), ForeignKey("users.id"))
    approved_by = Column(String(36), ForeignKey("users.id"))
    excel_path = Column(String(500))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    subject = relationship("Subject", back_populates="question_banks")

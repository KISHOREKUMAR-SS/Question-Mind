from sqlalchemy import Column, String, Integer, JSON, DateTime, Boolean, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base
import enum

class SubjectNature(str, enum.Enum):
    THEORY = "THEORY"
    PRBL = "PRBL"
    PMBL = "PMBL"
    TCPR = "TCPR"

class Subject(Base):
    __tablename__ = "subjects"
    
    id = Column(String(36), primary_key=True)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    semester = Column(Integer, nullable=False)
    department = Column(String(255))
    credits = Column(Integer, default=3)
    nature = Column(String(20), default="THEORY")  # THEORY, PRBL, PMBL, TCPR
    configuration = Column(JSON)  # SubjectConfiguration
    created_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    syllabus = relationship("Syllabus", back_populates="subject", uselist=False)
    cdap = relationship("CDAP", back_populates="subject", uselist=False)
    question_pattern = relationship("QuestionPattern", back_populates="subject", uselist=False)
    question_banks = relationship("QuestionBank", back_populates="subject")
    staff_assignments = relationship("StaffAssignment", back_populates="subject")

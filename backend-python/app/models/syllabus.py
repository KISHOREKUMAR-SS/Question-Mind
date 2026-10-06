from sqlalchemy import Column, String, JSON, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class Syllabus(Base):
    __tablename__ = "syllabi"
    
    id = Column(String(36), primary_key=True)
    subject_id = Column(String(36), ForeignKey("subjects.id"), unique=True)
    units = Column(JSON)  # List of SyllabusUnit
    academic_year = Column(String(20))
    regulation = Column(String(50))
    source_file = Column(String(500))
    parsed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    subject = relationship("Subject", back_populates="syllabus")

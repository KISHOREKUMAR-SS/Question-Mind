from sqlalchemy import Column, String, JSON, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class CDAP(Base):
    """Course Delivery and Assessment Plan - stores Part 1/Part 2 topics per unit"""
    __tablename__ = "cdaps"
    
    id = Column(String(36), primary_key=True)
    subject_id = Column(String(36), ForeignKey("subjects.id"), unique=True)
    units = Column(JSON)  # [{unit_number, unit_name, part1_topics: [], part2_topics: []}]
    source_file = Column(String(500))
    parsed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    subject = relationship("Subject", back_populates="cdap")

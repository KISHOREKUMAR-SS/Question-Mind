from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime


class CDAPTopic(BaseModel):
    """Single topic with optional subtopics"""
    topic: str
    subtopics: List[str] = []


class CDAPUnit(BaseModel):
    """Single unit in CDAP with Part 1 and Part 2 topics"""
    unit_number: int
    unit_name: str
    part1_topics: List[CDAPTopic] = []  # List of {topic, subtopics}
    part2_topics: List[CDAPTopic] = []  # List of {topic, subtopics}



class CDAPResponse(BaseModel):
    """Response schema for CDAP data"""
    id: str
    subject_id: str
    units: List[CDAPUnit] = []
    source_file: Optional[str] = None
    parsed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class CDAPCreate(BaseModel):
    """Schema for creating CDAP (used internally)"""
    subject_id: str
    units: List[CDAPUnit]
    source_file: Optional[str] = None
    
class CDAPUpdate(BaseModel):
    """Schema for updating CDAP"""
    units: List[dict]

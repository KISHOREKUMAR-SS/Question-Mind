from pydantic import BaseModel
from typing import Optional, List, Union
from datetime import datetime

class TopicConfiguration(BaseModel):
    topicName: str
    partMapping: Optional[List[str]] = None
    hours: Optional[int] = None

class SyllabusUnit(BaseModel):
    unitNumber: int
    title: str
    topics: Union[List[TopicConfiguration], List[str]]
    courseOutcome: Optional[int] = None
    coMapping: Optional[List[str]] = None
    partMapping: Optional[List[str]] = None

class SyllabusCreate(BaseModel):
    subject_id: str
    units: List[SyllabusUnit]
    academic_year: Optional[str] = None
    regulation: Optional[str] = None

class SyllabusUpdate(BaseModel):
    units: Optional[List[SyllabusUnit]] = None
    academic_year: Optional[str] = None
    regulation: Optional[str] = None

class SyllabusResponse(BaseModel):
    id: str
    subject_id: str
    units: List[dict]
    academic_year: Optional[str]
    regulation: Optional[str]
    source_file: Optional[str]
    parsed_at: Optional[datetime]
    
    class Config:
        from_attributes = True

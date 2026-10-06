from pydantic import BaseModel
from typing import Optional, List, Dict
from enum import Enum

class BloomLevel(str, Enum):
    BTL1 = "BTL1"
    BTL2 = "BTL2"
    BTL3 = "BTL3"
    BTL4 = "BTL4"
    BTL5 = "BTL5"
    BTL6 = "BTL6"

class SubjectNature(str, Enum):
    THEORY = "THEORY"
    PRBL = "PRBL"
    PMBL = "PMBL"
    TCPR = "TCPR"

class PartConfiguration(BaseModel):
    partName: str
    questionCount: int
    marksPerQuestion: int
    totalMarks: int
    allowedBTLLevels: List[BloomLevel]
    defaultBTL: Optional[BloomLevel] = None
    description: Optional[str] = None
    mcqCount: Optional[int] = None
    # Optional per-BTL question count e.g. {"BTL1": 4, "BTL2": 6}
    # If absent or all zeros → AI distributes automatically
    btlDistribution: Optional[Dict[str, int]] = None

class SubjectConfiguration(BaseModel):
    hasExam: bool = True
    parts: List[PartConfiguration] = []
    totalMarks: int = 100
    duration: Optional[int] = None
    specialInstructions: Optional[str] = None

class SubjectCreate(BaseModel):
    code: str
    name: str
    semester: int
    department: Optional[str] = None
    credits: int = 3
    nature: SubjectNature = SubjectNature.THEORY
    configuration: Optional[SubjectConfiguration] = None

class SubjectUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    semester: Optional[int] = None
    department: Optional[str] = None
    credits: Optional[int] = None
    nature: Optional[SubjectNature] = None
    configuration: Optional[SubjectConfiguration] = None

class SubjectResponse(BaseModel):
    id: str
    code: str
    name: str
    semester: int
    department: Optional[str]
    credits: int
    nature: Optional[str] = "THEORY"
    configuration: Optional[dict] = None
    assigned_staff: Optional[List[dict]] = []
    
    class Config:
        from_attributes = True

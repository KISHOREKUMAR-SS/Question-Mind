from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime
from .subject import PartConfiguration

class QuestionBankStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class GenerateQuestionsRequest(BaseModel):
    subject_id: str
    syllabus_id: str
    pattern_id: Optional[str] = None
    custom_parts: Optional[List[PartConfiguration]] = None
    selected_unit_ids: Optional[List[int]] = None  # unit numbers to include (1-based); None = all units
    # { partName -> { unitNumber -> count } }  — explicit per-unit question allocation per part
    unit_question_counts: Optional[Dict[str, Dict[int, int]]] = None
    # { unitNumber -> [PartConfiguration] }  — full per-unit config (Individual mode)
    unit_configs: Optional[Dict[str, List[PartConfiguration]]] = None
    # When False (Question Mode), only questions are generated — no answer key. This lets the
    # AI use a larger chunk size (faster, fewer API calls) and produces a single-sheet Excel.
    include_answers: bool = True
    # Prompt Mode only: when True, /generate-prompt returns one prompt PER UNIT (smaller replies
    # that web AIs won't truncate) instead of a single consolidated prompt.
    split_by_unit: bool = False

class GenerateFromResponseRequest(GenerateQuestionsRequest):
    # Same selection params as a normal generate request, plus the AI response the user
    # pasted back in Prompt Mode. The plan is rebuilt server-side from the selection params,
    # so this text is the only untrusted input and is only used for parsing.
    # Single-prompt flow uses response_text; unit-wise split flow uses unit_responses
    # ({ unitNumber(as str) -> pasted JSON for that unit }). At least one must be provided.
    response_text: Optional[str] = None
    unit_responses: Optional[Dict[str, str]] = None

class UpdatePatternRequest(BaseModel):
    parts: List[PartConfiguration]
    is_active: bool = True
    notes: Optional[str] = None
    unit_question_counts: Optional[Dict[str, Dict[int, int]]] = None
    # unit_configs: { unitNumber -> [PartConfiguration] }  full per-unit config for Individual mode
    unit_configs: Optional[Dict[str, List[PartConfiguration]]] = None

class UpdateStatusRequest(BaseModel):
    status: QuestionBankStatus
    rejection_reason: Optional[str] = None

class UpdateQuestionsRequest(BaseModel):
    questions: Dict  # expected shape: {"parts": {partName: [Question, ...]}}

class QuestionPatternResponse(BaseModel):
    id: str
    subject_id: str
    parts: List[dict]
    is_active: bool
    notes: Optional[str]
    unit_question_counts: Optional[Dict] = None
    unit_configs: Optional[Dict] = None

    class Config:
        from_attributes = True

class QuestionBankResponse(BaseModel):
    id: str
    subject_id: str
    syllabus_id: Optional[str]
    pattern_id: Optional[str]
    title: Optional[str]
    questions: Optional[dict]
    status: QuestionBankStatus
    rejection_reason: Optional[str]
    excel_path: Optional[str]
    generated_by_name: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

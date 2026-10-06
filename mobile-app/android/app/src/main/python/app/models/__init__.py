from .user import User, UserRole
from .subject import Subject
from .syllabus import Syllabus
from .cdap import CDAP
from .question_bank import QuestionBank, QuestionPattern, QuestionBankStatus
from .staff_assignment import StaffAssignment
from .help_request import HelpRequest, HelpRequestStatus

# Register SQLAlchemy event listeners to automatically deserialize JSON columns 
# loaded from SQLite databases which can return strings instead of dicts/lists.
from sqlalchemy import event
from app.utils import safe_json_load

@event.listens_for(Subject, "load")
def load_subject(target, context):
    if hasattr(target, "configuration"):
        target.configuration = safe_json_load(target.configuration)

@event.listens_for(Syllabus, "load")
def load_syllabus(target, context):
    if hasattr(target, "units"):
        target.units = safe_json_load(target.units, default=[])

@event.listens_for(CDAP, "load")
def load_cdap(target, context):
    if hasattr(target, "units"):
        target.units = safe_json_load(target.units, default=[])

@event.listens_for(QuestionPattern, "load")
def load_question_pattern(target, context):
    if hasattr(target, "parts"):
        target.parts = safe_json_load(target.parts, default=[])
    if hasattr(target, "unit_question_counts"):
        target.unit_question_counts = safe_json_load(target.unit_question_counts, default={})
    if hasattr(target, "unit_configs"):
        target.unit_configs = safe_json_load(target.unit_configs, default={})

@event.listens_for(QuestionBank, "load")
def load_question_bank(target, context):
    if hasattr(target, "questions"):
        target.questions = safe_json_load(target.questions, default={})

__all__ = [
    "User", "UserRole",
    "Subject",
    "Syllabus",
    "CDAP",
    "QuestionBank", "QuestionPattern", "QuestionBankStatus",
    "StaffAssignment",
    "HelpRequest", "HelpRequestStatus"
]

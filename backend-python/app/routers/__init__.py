from .auth import router as auth_router
from .subjects import router as subjects_router
from .syllabus import router as syllabus_router
from .question_bank import router as question_bank_router
from .staff import router as staff_router

auth = auth_router
subjects = subjects_router
syllabus = syllabus_router
question_bank = question_bank_router
staff = staff_router

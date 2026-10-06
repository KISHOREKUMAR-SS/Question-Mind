from sqlalchemy import Column, String, Enum, DateTime, Boolean
from sqlalchemy.sql import func
from ..database import Base
import enum

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    HOD = "HOD"
    FACULTY = "FACULTY"

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    role = Column(String(20), default="FACULTY")  # HOD or FACULTY
    department = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

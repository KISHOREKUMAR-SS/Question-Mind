import os
import sys

# Add the app directory to the python path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User, UserRole
from app.services.auth import hash_password
import uuid

def seed_admin():
    db = SessionLocal()
    try:
        # Check if admin already exists
        existing = db.query(User).filter(User.email == "admin@questionmind.com").first()
        if existing:
            print("Admin user already exists!")
            return

        admin_user = User(
            id=str(uuid.uuid4()),
            email="admin@questionmind.com",
            password=hash_password("admin123"),
            name="Super Admin",
            role=UserRole.ADMIN.value,
            department="Admin Department"
        )
        db.add(admin_user)
        db.commit()
        print("Successfully created Super Admin account!")
    except Exception as e:
        print(f"Error creating admin: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_admin()

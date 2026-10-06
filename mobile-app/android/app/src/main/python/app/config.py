import os
from pydantic import BaseSettings
from functools import lru_cache

def get_default_dirs():
    try:
        from com.chaquo.python import Python
        android_context = Python.getPlatform().getApplication()
        data_dir = android_context.getFilesDir().getAbsolutePath()
        cache_dir = android_context.getCacheDir().getAbsolutePath()
    except (ImportError, ModuleNotFoundError):
        data_dir = os.path.abspath("data")
        cache_dir = os.path.abspath("cache")
    return data_dir, cache_dir

default_data_dir, default_cache_dir = get_default_dirs()

class Settings(BaseSettings):
    DATA_DIR: str = default_data_dir
    CACHE_DIR: str = default_cache_dir

    @property
    def upload_syllabus_dir(self) -> str:
        d = os.path.join(self.DATA_DIR, "uploads", "syllabus")
        os.makedirs(d, exist_ok=True)
        return d

    @property
    def upload_cdap_dir(self) -> str:
        d = os.path.join(self.DATA_DIR, "uploads", "cdap")
        os.makedirs(d, exist_ok=True)
        return d

    @property
    def upload_question_banks_dir(self) -> str:
        d = os.path.join(self.DATA_DIR, "uploads", "question-banks")
        os.makedirs(d, exist_ok=True)
        return d

    @property
    def upload_images_dir(self) -> str:
        d = os.path.join(self.DATA_DIR, "data", "images")
        os.makedirs(d, exist_ok=True)
        return d

    # ── Database (Neon PostgreSQL) ─────────────────────────
    # Use remote Neon PostgreSQL so website and mobile app share the same DB
    DATABASE_URL: str = "postgresql+pg8000://neondb_owner:npg_S6KIdlx7uLpq@ep-broad-snow-aokn7t8z.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

    # JWT
    JWT_SECRET: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24

    # AI Services (set at least one)
    GEMINI_API_KEY: str = ""
    NVIDIA_API_KEY: str = ""
    CEREBRAS_API_KEY: str = ""
    CEREBRAS_API_KEY_2: str = ""
    GROQ_API_KEY: str = ""
    GROQ_API_KEY_2: str = ""
    GROQ_API_KEY_3: str = ""
    OPENROUTER_API_KEY: str = ""

    # CORS — allowed frontend origins
    FRONTEND_URL: str = "http://localhost:5174"
    # Render deployment URL (set after deploying)
    RENDER_EXTERNAL_URL: str = ""

    # ── Email / SMTP ──────────────────────────────────────────────────────
    EMAIL_PROVIDER: str = "local" # 'local' or 'brevo'
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""          # Brevo SMTP key ('xsmtpsib-...') — used for the SMTP fallback only
    FROM_EMAIL: str = ""
    FROM_NAME: str = "Question Mind"
    # Brevo REST API key ('xkeysib-...') — required for the HTTP API path used on
    # Render (which blocks outbound SMTP ports). This is a DIFFERENT credential
    # from the SMTP key above. Get it from Brevo → SMTP & API → API Keys.
    BREVO_API_KEY: str = ""

    # Point LOGO_URL at a PUBLICLY reachable copy of the logo
    # We use the raw GitHub URL for the newly pushed email_logo.png so it works immediately.
    LOGO_URL: str = "https://raw.githubusercontent.com/Krish-CS/QUESTION-MIND/main/frontend/public/email_logo.png"



    class Config:
        env_file = ".env"
        extra = "ignore"

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()

from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # ── Database (Aiven PostgreSQL) ─────────────────────────
    # Connection string from Aiven console.
    # Format: postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=require
    DATABASE_URL: str = "postgresql://root@localhost:5432/question_mind?sslmode=disable"

    # JWT
    JWT_SECRET: str = "your-super-secret-jwt-key-change-in-production"
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

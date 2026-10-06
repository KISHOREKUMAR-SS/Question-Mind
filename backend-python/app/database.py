from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

import sys
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

db_url = settings.DATABASE_URL
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

engine = None
SessionLocal = None

def init_db():
    global engine, SessionLocal
    
    # Attempt to connect to PostgreSQL if configured
    if db_url and db_url.startswith("postgresql"):
        connect_args = {
            "connect_timeout": 15,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5
        }
        if sys.platform.startswith("win"):
            connect_args["sslrootcert"] = "NUL"
            # Solve Windows IPv6 dual-stack timeout bug by resolving hostname to IPv4 address dynamically.
            try:
                parsed = urlparse(db_url)
                if parsed.hostname and parsed.hostname not in ("localhost", "127.0.0.1"):
                    port = parsed.port or 5432
                    addr_info = socket.getaddrinfo(parsed.hostname, port, family=socket.AF_INET, type=socket.SOCK_STREAM)
                    ipv4_addresses = list(set([info[4][0] for info in addr_info]))
                    if ipv4_addresses:
                        connect_args["hostaddr"] = ipv4_addresses[0]
                        print(f"[INFO] Windows optimization: Resolved hostname {parsed.hostname} to IPv4 {ipv4_addresses[0]} to bypass IPv6 timeouts.")
            except Exception as dns_err:
                print(f"[WARNING] Windows optimization: Failed to resolve hostname to IPv4: {dns_err}")
            
        try:
            print("[INFO] Attempting to connect to Cloud PostgreSQL (Neon)...")
            temp_engine = create_engine(db_url, connect_args=connect_args)
            with temp_engine.connect() as conn:
                print("[SUCCESS] Successfully connected to PostgreSQL.")
            
            # Connection succeeded, create production engine
            engine = create_engine(
                db_url,
                connect_args=connect_args,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=10,
                pool_recycle=1800,
            )
            SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
            return
        except Exception as e:
            print(f"[ERROR] PostgreSQL connection failed: {e}")
            print("[INFO] Falling back to local SQLite database...")

    # Fallback or default to SQLite
    print("[INFO] Initializing SQLite database...")
    sqlite_url = "sqlite:///./question_mind_fallback.db"
    
    # If the user's .env specifically requested sqlite, use that URL instead of fallback name
    if db_url and db_url.startswith("sqlite"):
        sqlite_url = db_url

    engine = create_engine(
        sqlite_url,
        connect_args={"check_same_thread": False}
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

init_db()
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

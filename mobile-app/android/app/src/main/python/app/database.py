from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

import os
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
    global engine, SessionLocal, db_url
    
    # Attempt to connect to PostgreSQL if configured
    if db_url and db_url.startswith("postgresql"):
        import ssl
        # Strip query parameters for pg8000 compatibility
        if "?" in db_url:
            db_url = db_url.split("?")[0]
            
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        connect_args = {
            "ssl_context": ssl_context,
            "timeout": 15
        }
        
        # Solve dual-stack DNS IPv6 latency and timeout delays on all platforms (especially Android/mobile networks)
        # by resolving the hostname to its IPv4 address and connecting to the IP directly.
        try:
            parsed = urlparse(db_url)
            if parsed.hostname and parsed.hostname not in ("localhost", "127.0.0.1"):
                port = parsed.port or 5432
                addr_info = socket.getaddrinfo(parsed.hostname, port, family=socket.AF_INET, type=socket.SOCK_STREAM)
                ipv4_addresses = list(set([info[4][0] for info in addr_info]))
                if ipv4_addresses:
                    resolved_ip = ipv4_addresses[0]
                    netloc = resolved_ip
                    if parsed.port:
                        netloc = f"{netloc}:{parsed.port}"
                    if parsed.username:
                        auth = parsed.username
                        if parsed.password:
                            auth = f"{auth}:{parsed.password}"
                        netloc = f"{auth}@{netloc}"
                    
                    db_url = db_url.replace(parsed.netloc, netloc, 1)
                    print(f"[INFO] DNS Optimization: Resolved hostname {parsed.hostname} to IPv4 {resolved_ip} to bypass dual-stack IPv6 connection timeouts.")
        except Exception as dns_err:
            print(f"[WARNING] DNS Optimization: Failed to resolve hostname: {dns_err}")
            
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
    sqlite_url = f"sqlite:///{os.path.join(settings.DATA_DIR, 'question_mind_fallback.db')}"
    
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

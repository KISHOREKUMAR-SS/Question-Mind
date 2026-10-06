import logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from app.routers import auth, subjects, syllabus, question_bank, staff

# Create tables (PostgreSQL will create them if they don't exist)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Question Mind API",
    description="AI-powered Question Bank Generator",
    version="2.0.0"
)

# ── CORS — allow all origins (website + Capacitor mobile app + local dev) ──
# Credentials are disabled, so a wildcard origin is safe here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global handler for unhandled exceptions. Without this, an unhandled 500 is produced by
# Starlette's outermost error middleware (outside CORSMiddleware), so the response lacks the
# Access-Control-Allow-Origin header and the browser misreports it as a CORS error. Handling it
# here keeps CORS headers on the response and surfaces the real error to the client/logs.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.getLogger("app").exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
        headers={"Access-Control-Allow-Origin": "*"},
    )

# Include routers
app.include_router(auth, prefix="/api")
app.include_router(subjects, prefix="/api")
app.include_router(syllabus, prefix="/api")
app.include_router(question_bank, prefix="/api")
app.include_router(staff, prefix="/api")

import os
from fastapi.staticfiles import StaticFiles
os.makedirs("data/images", exist_ok=True)
app.mount("/api/static/images", StaticFiles(directory="data/images"), name="images")

@app.get("/")
async def root():
    return {"message": "Question Mind API v2.0 - FastAPI + PostgreSQL"}

@app.get("/api/health")
async def health():
    return {"status": "ok"}

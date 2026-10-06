from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import httpx
import logging

from ..services.auth import get_current_user
from ..models import User
from ..config import settings
from ..services.local_model_service import LocalModelService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-settings", tags=["AI Settings"])

class TestKeyRequest(BaseModel):
    provider: str
    api_key: str

@router.get("/status")
async def get_status(user: User = Depends(get_current_user)):
    """Returns availability and configuration statuses of LLM providers"""
    providers = [
        {
            "name": "groq",
            "status": "available" if settings.GROQ_API_KEY else "unavailable",
            "configured": bool(settings.GROQ_API_KEY),
            "can_use_custom": True,
            "error": None
        },
        {
            "name": "cerebras",
            "status": "available" if settings.CEREBRAS_API_KEY else "unavailable",
            "configured": bool(settings.CEREBRAS_API_KEY),
            "can_use_custom": True,
            "error": None
        },
        {
            "name": "nvidia",
            "status": "available" if settings.NVIDIA_API_KEY else "unavailable",
            "configured": bool(settings.NVIDIA_API_KEY),
            "can_use_custom": True,
            "error": None
        },
        {
            "name": "openrouter",
            "status": "available" if settings.OPENROUTER_API_KEY else "unavailable",
            "configured": bool(settings.OPENROUTER_API_KEY),
            "can_use_custom": True,
            "error": None
        }
    ]
    return providers

@router.post("/test-key")
async def test_key(data: TestKeyRequest, user: User = Depends(get_current_user)):
    """Validates custom LLM API key by probing the provider's models endpoint"""
    provider_urls = {
        "groq": "https://api.groq.com/openai/v1",
        "cerebras": "https://api.cerebras.ai/v1",
        "openrouter": "https://openrouter.ai/api/v1",
        "nvidia": "https://integrate.api.nvidia.com/v1"
    }
    
    url = provider_urls.get(data.provider.lower())
    if not url:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {data.provider}")
        
    try:
        headers = {"Authorization": f"Bearer {data.api_key}"}
        if data.provider.lower() == "openrouter":
            headers["HTTP-Referer"] = "http://localhost:5173"
            headers["X-Title"] = "Question Mind"
            
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{url}/models", headers=headers)
            
        if response.status_code == 200:
            res_data = response.json()
            models = [m["id"] for m in res_data.get("data", []) if "id" in m]
            return {
                "success": True,
                "message": f"Connection to {data.provider.upper()} successful.",
                "models": models
            }
        else:
            return {
                "success": False,
                "message": f"Validation failed: HTTP {response.status_code} - {response.text[:200]}"
            }
    except Exception as e:
        logger.error(f"Error testing key for {data.provider}: {e}")
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}"
        }

@router.get("/device-capabilities")
async def get_device_capabilities(user: User = Depends(get_current_user)):
    """Queries device hardware configurations and offline model details"""
    try:
        service = LocalModelService()
        info = await service._get_device_info()
        caps = LocalModelService.get_device_capabilities()
        
        return {
            "platform": caps.get("platform", "android"),
            "supports_local_models": caps.get("supported", False),
            "available_memory_mb": info.get("available_memory_mb", 2048),
            "available_storage_mb": info.get("available_storage_mb", 2048),
            "available_models": [
                {
                    "name": m["name"],
                    "label": m["label"],
                    "description": m["description"],
                    "memory_mb": m["memory_mb"],
                    "storage_mb": m["storage_mb"]
                }
                for m in caps.get("available_models", [])
            ]
        }
    except Exception as e:
        logger.error(f"Error reading capabilities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

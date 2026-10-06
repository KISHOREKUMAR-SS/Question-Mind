"""
Local Model Service - Supports Ollama and on-device inference
For mobile: uses Chaquopy to run quantized models locally
For web: can use Ollama server
"""

import asyncio
import json
import os
from typing import Dict, Any, Optional
from datetime import datetime

def _log(tag: str, msg: str):
    """Structured logging"""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] [{tag}] {msg}")

class LocalModelService:
    """
    Manages local model inference:
    - Gemma 2B (mobile)
    - Llama 2 (larger devices)
    - Ollama endpoint (web)
    """
    
    SUPPORTED_MODELS = {
        "gemma2b": {
            "name": "Gemma 2B",
            "memory_required_mb": 2048,
            "storage_required_mb": 2048,
            "supported_platforms": ["android", "web"],
            "description": "Lightweight, fast, good for education Q&A"
        },
        "llama2_7b": {
            "name": "Llama 2 7B",
            "memory_required_mb": 8192,
            "storage_required_mb": 4096,
            "supported_platforms": ["web"],
            "description": "More powerful, better quality"
        },
        "mistral_7b": {
            "name": "Mistral 7B",
            "memory_required_mb": 8192,
            "storage_required_mb": 4096,
            "supported_platforms": ["web"],
            "description": "Fast and efficient"
        },
    }

    def __init__(self, model_name: str = "gemma2b"):
        self.model_name = model_name
        self.model_info = self.SUPPORTED_MODELS.get(model_name, {})
        self.platform = self._detect_platform()
        _log("LocalModelService", f"Initialized with model: {model_name} on {self.platform}")

    def _detect_platform(self) -> str:
        """Detect platform: android, ios, web"""
        if os.environ.get("ANDROID_APP_PATH"):
            return "android"
        elif os.environ.get("IS_IOS"):
            return "ios"
        else:
            return "web"

    async def is_available(self) -> bool:
        """Check if model is available and can run"""
        
        _log("LocalModelService", f"Checking availability for {self.model_name}")
        
        # Check if model is supported on this platform
        if self.platform not in self.model_info.get("supported_platforms", []):
            _log("LocalModelService", f"Model not supported on {self.platform}")
            return False
        
        # Check device capabilities
        device_info = await self._get_device_info()
        
        required_memory = self.model_info.get("memory_required_mb", 2048)
        required_storage = self.model_info.get("storage_required_mb", 2048)
        
        if device_info["available_memory_mb"] < required_memory:
            _log("LocalModelService", f"Insufficient memory: {device_info['available_memory_mb']}MB < {required_memory}MB")
            return False
        
        if device_info["available_storage_mb"] < required_storage:
            _log("LocalModelService", f"Insufficient storage: {device_info['available_storage_mb']}MB < {required_storage}MB")
            return False
        
        # Check if model is downloaded
        if self.platform == "android":
            return await self._check_model_downloaded_android()
        elif self.platform == "web":
            return await self._check_ollama_available()
        
        return False

    async def generate(self, prompt: str) -> Dict[str, Any]:
        """Generate text using local model"""
        
        _log("LocalModelService", f"Generating with {self.model_name}")
        
        if self.platform == "android":
            return await self._generate_android(prompt)
        elif self.platform == "web":
            return await self._generate_ollama(prompt)
        else:
            raise Exception(f"Unsupported platform: {self.platform}")

    async def _generate_android(self, prompt: str) -> Dict[str, Any]:
        """Generate using Chaquopy on Android"""
        
        try:
            from android_service import generate_with_local_model
            result = await generate_with_local_model(self.model_name, prompt)
            return result
        except ImportError:
            raise Exception("Chaquopy not available on this Android device")

    async def _generate_ollama(self, prompt: str) -> Dict[str, Any]:
        """Generate using Ollama endpoint"""
        
        ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
        
        try:
            import httpx
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{ollama_url}/api/generate",
                    json={
                        "model": self.model_name,
                        "prompt": prompt,
                        "temperature": 0.7,
                        "stream": False,
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                # Parse response into questions
                text = data.get("response", "")
                return self._parse_model_output(text)
                
        except Exception as e:
            _log("LocalModelService", f"Ollama error: {str(e)}")
            raise

    def _parse_model_output(self, text: str) -> Dict[str, Any]:
        """Parse model output into question format"""
        
        # Try to extract JSON
        try:
            # Look for JSON in the response
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                json_str = text[start:end]
                data = json.loads(json_str)
                return data
        except:
            pass
        
        # Fallback: return structured response
        return {
            "questions": [
                {
                    "question_text": "Generated via local model",
                    "options": [],
                    "answer": "",
                    "btl_level": "BTL2",
                }
            ]
        }

    async def _get_device_info(self) -> Dict[str, Any]:
        """Get device memory and storage information"""
        
        if self.platform == "android":
            return await self._get_device_info_android()
        else:
            return self._get_device_info_web()

    async def _get_device_info_android(self) -> Dict[str, Any]:
        """Get Android device info via Chaquopy"""
        
        try:
            from android_service import get_device_info
            return await get_device_info()
        except:
            return {
                "available_memory_mb": 2048,
                "available_storage_mb": 2048,
                "platform": "android"
            }

    def _get_device_info_web(self) -> Dict[str, Any]:
        """Get web device info"""
        
        import psutil
        
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        
        return {
            "available_memory_mb": int(memory.available / 1024 / 1024),
            "available_storage_mb": int(disk.free / 1024 / 1024),
            "total_memory_mb": int(memory.total / 1024 / 1024),
            "platform": "web"
        }

    async def _check_model_downloaded_android(self) -> bool:
        """Check if model is downloaded on Android"""
        
        try:
            from android_service import check_model_downloaded
            return await check_model_downloaded(self.model_name)
        except:
            return False

    async def _check_ollama_available(self) -> bool:
        """Check if Ollama server is available"""
        
        ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434")
        
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{ollama_url}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    models = data.get("models", [])
                    return any(m["name"].startswith(self.model_name) for m in models)
        except:
            pass
        
        return False

    @classmethod
    def get_device_capabilities(cls) -> Dict[str, Any]:
        """Get device capabilities for model support"""
        
        platform_map = {
            "android": "android",
            "ios": "ios",
            "web": "web",
        }
        
        # Detect platform
        if os.environ.get("ANDROID_APP_PATH"):
            platform = "android"
        elif os.environ.get("IS_IOS"):
            platform = "ios"
        else:
            platform = "web"
        
        # Get available models for platform
        available_models = [
            {
                "name": model_name,
                "label": model_info["name"],
                "description": model_info["description"],
                "memory_mb": model_info["memory_required_mb"],
                "storage_mb": model_info["storage_required_mb"],
            }
            for model_name, model_info in cls.SUPPORTED_MODELS.items()
            if platform in model_info["supported_platforms"]
        ]
        
        return {
            "platform": platform,
            "supported": len(available_models) > 0,
            "available_models": available_models,
        }

    @classmethod
    async def download_model(cls, model_name: str) -> Dict[str, Any]:
        """Download model for local use"""
        
        _log("LocalModelService", f"Downloading {model_name}")
        
        # Platform-specific download logic
        # This would handle:
        # - Android: Download to app cache, extract
        # - Web: Check Ollama availability, or show instructions
        
        return {
            "success": True,
            "model": model_name,
            "status": "downloading",
            "progress": 0,
        }

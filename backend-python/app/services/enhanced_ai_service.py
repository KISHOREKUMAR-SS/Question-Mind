"""
Enhanced AI Service with Custom API Keys + Local Model Support
Supports user-provided keys, backend keys, and local model fallback
"""

import asyncio
import httpx
import json
import os
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from ..config import settings

try:
    from json_repair import repair_json as _repair_json
except ImportError:
    _repair_json = None

def _repair(text: str) -> str:
    """Repair malformed JSON if library available"""
    if _repair_json is not None:
        return _repair_json(text, return_objects=False, ensure_ascii=False)
    return text

_K_KEYWORDS: Dict[str, str] = {
    "BTL1": "define, recall, list, identify, state, name",
    "BTL2": "explain, describe, summarize, discuss, classify",
    "BTL3": "solve, apply, calculate, demonstrate, construct",
    "BTL4": "analyze, differentiate, examine, break down, infer",
    "BTL5": "evaluate, assess, justify, judge, defend",
    "BTL6": "design, create, formulate, develop, build",
}

class ProviderError:
    """Tracks error details for each provider attempt"""
    def __init__(self, provider_name: str):
        self.provider_name = provider_name
        self.status = "pending"
        self.error_message = ""
        self.error_code = None

class AIServiceError(Exception):
    """Raised when all providers exhausted"""
    def __init__(self, message: str, provider_errors: List[ProviderError] = None):
        self.message = message
        self.provider_errors = provider_errors or []
        super().__init__(message)

def _log(tag: str, msg: str):
    """Structured logging"""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] [{tag}] {msg}")

class EnhancedAIService:
    """
    AI Service with enhanced fallback strategy:
    1. User's custom API key (if provided)
    2. Backend keys in priority order
    3. Local models (if device supports & enabled)
    """
    
    FALLBACK_STATUS_CODES = {404, 429, 503, 529}
    CHUNK_SIZE = 10

    def __init__(
        self, 
        user_id: Optional[str] = None,
        custom_api_key: Optional[str] = None,
        user_preference: str = "backend",  # "backend" | "custom" | "local"
        enable_local_models: bool = False
    ):
        """
        Args:
            user_id: User making the request (for logging/tracking)
            custom_api_key: User's own API key (takes priority)
            user_preference: Which provider strategy to prefer
            enable_local_models: Allow fallback to local models
        """
        self.user_id = user_id
        self.custom_api_key = custom_api_key
        self.user_preference = user_preference
        self.enable_local_models = enable_local_models
        
        # Build provider chain based on preference & availability
        self.provider_chain: List[Dict] = []
        self._build_provider_chain()
        
        self.provider_errors: List[ProviderError] = []

    def _build_provider_chain(self):
        """Build provider chain based on user preference and availability"""
        
        _log("AIService", f"Building provider chain for user {self.user_id}")
        
        # Add custom key first if provided and user prefers it
        if self.custom_api_key:
            self.provider_chain.append({
                "name": "custom",
                "type": "api_key",
                "api_key": self.custom_api_key,
                "base_url": self._infer_base_url_from_key(self.custom_api_key),
                "model": "auto",  # Auto-detect from endpoint
                "max_tokens": 8000,
            })
            _log("AIService", "Added custom API key to provider chain")
        
        # Add backend keys
        if settings.CEREBRAS_API_KEY:
            self.provider_chain.append({
                "name": "cerebras-1",
                "type": "api_key",
                "api_key": settings.CEREBRAS_API_KEY,
                "base_url": "https://api.cerebras.ai/v1",
                "model": "gpt-oss-120b",
                "max_tokens": 8000,
            })
        
        if settings.CEREBRAS_API_KEY_2:
            self.provider_chain.append({
                "name": "cerebras-2",
                "type": "api_key",
                "api_key": settings.CEREBRAS_API_KEY_2,
                "base_url": "https://api.cerebras.ai/v1",
                "model": "gpt-oss-120b",
                "max_tokens": 8000,
            })
        
        if settings.GROQ_API_KEY:
            self.provider_chain.append({
                "name": "groq",
                "type": "api_key",
                "api_key": settings.GROQ_API_KEY,
                "base_url": "https://api.groq.com/openai/v1",
                "model": "mixtral-8x7b-32768",
                "max_tokens": 8000,
            })
        
        if settings.GROQ_API_KEY_2:
            self.provider_chain.append({
                "name": "groq-2",
                "type": "api_key",
                "api_key": settings.GROQ_API_KEY_2,
                "base_url": "https://api.groq.com/openai/v1",
                "model": "mixtral-8x7b-32768",
                "max_tokens": 8000,
            })
        
        if settings.GROQ_API_KEY_3:
            self.provider_chain.append({
                "name": "groq-3",
                "type": "api_key",
                "api_key": settings.GROQ_API_KEY_3,
                "base_url": "https://api.groq.com/openai/v1",
                "model": "mixtral-8x7b-32768",
                "max_tokens": 8000,
            })
        
        if settings.NVIDIA_API_KEY:
            self.provider_chain.append({
                "name": "nvidia",
                "type": "api_key",
                "api_key": settings.NVIDIA_API_KEY,
                "base_url": "https://integrate.api.nvidia.com/v1",
                "model": "meta/llama2-70b",
                "max_tokens": 4096,
            })
        
        if settings.OPENROUTER_API_KEY:
            self.provider_chain.append({
                "name": "openrouter",
                "type": "api_key",
                "api_key": settings.OPENROUTER_API_KEY,
                "base_url": "https://openrouter.ai/api/v1",
                "model": "auto",
                "max_tokens": 8000,
            })
        
        # Add local model option if enabled
        if self.enable_local_models:
            self.provider_chain.append({
                "name": "local",
                "type": "local_model",
                "model": "gemma2b",
                "max_tokens": 4000,
            })
            _log("AIService", "Local model available as fallback")
        
        _log("AIService", f"Provider chain has {len(self.provider_chain)} providers")

    def _infer_base_url_from_key(self, api_key: str) -> str:
        """Try to infer API provider from key format"""
        if api_key.startswith("gsk-"):
            return "https://api.groq.com/openai/v1"
        elif api_key.startswith("sk-"):
            return "https://api.cerebras.ai/v1"
        else:
            return "https://api.openai.com/v1"  # Default fallback

    async def generate_questions(
        self,
        subject_id: str,
        units: List[Dict[str, Any]],
        part_configs: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Generate questions with fallback strategy:
        1. Try each provider in chain
        2. Track errors for each
        3. Return error with fallback options if all fail
        """
        
        _log("GenerateQuestions", f"Generating for subject {subject_id}, {len(units)} units")
        
        questions: List[Dict[str, Any]] = []
        self.provider_errors = []
        
        # Try each provider in the chain
        for provider in self.provider_chain:
            try:
                _log("GenerateQuestions", f"Trying provider: {provider['name']}")
                
                if provider["type"] == "api_key":
                    result = await self._generate_with_api_key(
                        provider, subject_id, units, part_configs
                    )
                elif provider["type"] == "local_model":
                    result = await self._generate_with_local_model(
                        provider, subject_id, units, part_configs
                    )
                
                if result:
                    _log("GenerateQuestions", f"✓ Success with {provider['name']}")
                    return result
                    
            except Exception as e:
                error_entry = ProviderError(provider["name"])
                error_entry.status = "failed"
                error_entry.error_message = str(e)
                if hasattr(e, "response"):
                    error_entry.error_code = e.response.status_code
                
                self.provider_errors.append(error_entry)
                _log("GenerateQuestions", f"✗ {provider['name']} failed: {str(e)[:100]}")
                continue
        
        # All providers failed
        raise AIServiceError(
            "All AI providers exhausted or unavailable",
            provider_errors=self.provider_errors
        )

    async def _generate_with_api_key(
        self,
        provider: Dict[str, Any],
        subject_id: str,
        units: List[Dict[str, Any]],
        part_configs: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Generate questions using API key provider"""
        
        # Prepare prompt
        prompt = self._build_question_prompt(subject_id, units, part_configs)
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{provider['base_url']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {provider['api_key']}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": provider["model"],
                    "messages": [
                        {"role": "system", "content": "You are an expert question generator."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.7,
                    "max_tokens": provider["max_tokens"],
                }
            )
            
            if response.status_code in self.FALLBACK_STATUS_CODES:
                raise Exception(f"Provider error: HTTP {response.status_code}")
            
            response.raise_for_status()
            data = response.json()
            
            # Parse response
            if "choices" in data and len(data["choices"]) > 0:
                content = data["choices"][0]["message"]["content"]
                content = _repair(content)
                result = json.loads(content)
                return result.get("questions", [])
            
            return []

    async def _generate_with_local_model(
        self,
        provider: Dict[str, Any],
        subject_id: str,
        units: List[Dict[str, Any]],
        part_configs: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Generate questions using local model (via Chaquopy/Ollama)"""
        
        from .local_model_service import LocalModelService
        
        service = LocalModelService(provider["model"])
        prompt = self._build_question_prompt(subject_id, units, part_configs)
        
        result = await service.generate(prompt)
        return result.get("questions", [])

    def _build_question_prompt(
        self,
        subject_id: str,
        units: List[Dict[str, Any]],
        part_configs: List[Dict[str, Any]]
    ) -> str:
        """Build the prompt for question generation"""
        
        units_text = "\n".join([
            f"- {u['name']}: {', '.join(u.get('topics', []))}"
            for u in units
        ])
        
        parts_text = "\n".join([
            f"- {p['name']}: {p['count']} questions, BTL levels {p.get('btlLevels', [])}"
            for p in part_configs
        ])
        
        return f"""Generate exam questions for subject {subject_id}.

Units to cover:
{units_text}

Required question breakdown:
{parts_text}

Return as JSON with this structure:
{{
    "questions": [
        {{
            "question_text": "...",
            "options": ["A", "B", "C", "D"],
            "answer": "A",
            "btl_level": "BTL2",
            "unit": "..."
        }},
        ...
    ]
}}"""

    def get_error_response(self) -> Dict[str, Any]:
        """Format detailed error response with fallback options"""
        
        fallback_options = []
        
        if not self.custom_api_key:
            fallback_options.append({
                "action": "add_api_key",
                "label": "Add Your Own API Key",
                "description": "Use your Groq, Cerebras, or other API key"
            })
        
        if self.enable_local_models:
            fallback_options.append({
                "action": "check_local_model",
                "label": "Enable Local Offline Model",
                "description": "Run Gemma2B locally (requires 2GB RAM)"
            })
        else:
            fallback_options.append({
                "action": "enable_local_model",
                "label": "Enable Local Model Option",
                "description": "Download Gemma2B for offline use"
            })
        
        return {
            "success": False,
            "error": "All AI providers unavailable",
            "details": {
                "providers_tried": [
                    {
                        "name": err.provider_name,
                        "status": err.status,
                        "error": err.error_message,
                        "code": err.error_code,
                    }
                    for err in self.provider_errors
                ],
                "backend_keys_configured": len([p for p in self.provider_chain if p.get("type") == "api_key"]),
                "custom_key_provided": bool(self.custom_api_key),
                "local_models_enabled": self.enable_local_models,
            },
            "fallback_options": fallback_options,
            "next_steps": [
                {
                    "action": opt["action"],
                    "label": opt["label"],
                    "url": "/settings/ai"
                }
                for opt in fallback_options
            ]
        }


# Backward compatibility
class AIService(EnhancedAIService):
    """For backward compatibility, AIService is now EnhancedAIService"""
    pass

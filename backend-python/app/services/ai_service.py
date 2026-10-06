import asyncio
import httpx
import json
import re
import time
import sys
from datetime import datetime
from typing import List, Dict, Any, Optional
from ..config import settings

# Force UTF-8 encoding for standard streams on Windows to prevent UnicodeEncodeErrors with emojis
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

try:
    from json_repair import repair_json as _repair_json
except ImportError:
    _repair_json = None  # graceful fallback if not installed


def _repair(text: str) -> str:
    """Thin wrapper — uses json_repair library if available, else returns text unchanged."""
    if _repair_json is not None:
        return _repair_json(text, return_objects=False, ensure_ascii=False)
    return text


# K-Level / BTL keyword guide for AI prompts (K1=BTL1 … K6=BTL6)
# Keywords from Bloom's Taxonomy — compact form only
_K_KEYWORDS: Dict[str, str] = {
    "BTL1": "define, recall, list, identify, state, name",
    "BTL2": "explain, describe, summarize, discuss, classify",
    "BTL3": "solve, apply, calculate, demonstrate, construct",
    "BTL4": "analyze, differentiate, examine, break down, infer",
    "BTL5": "evaluate, assess, justify, judge, defend",
    "BTL6": "design, create, formulate, develop, build",
}


class AIServiceError(Exception):
    """
    Raised when all AI providers are exhausted or fail unrecoverably.
    The caller (router) should surface this as HTTP 503 to the user.
    """
    pass


def _log(tag: str, msg: str):
    """Structured log helper with timestamp."""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] [{tag}] {msg}")


class AIService:
    """AI Service with automatic provider fallback: Groq → Cerebras → NVIDIA → Gemini (stable last resort)"""

    # HTTP codes that trigger provider fallback (rate limit, overload, model not found, payload too large)
    FALLBACK_STATUS_CODES = {404, 413, 429, 503, 529}

    # Max questions per single AI call — keeps prompts well within token limits
    CHUNK_SIZE = 10
    # Question-only mode omits answers, so each item is far smaller — allow a larger chunk
    # (fewer/faster API calls, less likely to exhaust providers).
    CHUNK_SIZE_QUESTION_ONLY = 22

    def __init__(self):
        # Build ordered provider chain from available API keys
        self.provider_chain: List[Dict] = []

        # Priority 1: Groq — openai/gpt-oss-20b (60K TPM, handles large prompts, very fast)
        if settings.GROQ_API_KEY:
            self.provider_chain.append({
                "name": "groq",
                "api_key": settings.GROQ_API_KEY,
                "base_url": "https://api.groq.com/openai/v1",
                "model": "openai/gpt-oss-20b",  # ✅ 60K TPM — handles all prompt sizes
                "max_tokens": 8000,
            })

        if settings.GROQ_API_KEY_2:
            self.provider_chain.append({
                "name": "groq-2",
                "api_key": settings.GROQ_API_KEY_2,
                "base_url": "https://api.groq.com/openai/v1",
                "model": "openai/gpt-oss-20b",
                "max_tokens": 8000,
            })

        if settings.GROQ_API_KEY_3:
            self.provider_chain.append({
                "name": "groq-3",
                "api_key": settings.GROQ_API_KEY_3,
                "base_url": "https://api.groq.com/openai/v1",
                "model": "openai/gpt-oss-20b",
                "max_tokens": 8000,
            })

        # Priority 2: Cerebras key 1 — gpt-oss-120b (ultra-fast inference)
        if settings.CEREBRAS_API_KEY:
            self.provider_chain.append({
                "name": "cerebras",
                "api_key": settings.CEREBRAS_API_KEY,
                "base_url": "https://api.cerebras.ai/v1",
                "model": "gpt-oss-120b",  # ✅ Only GPT model available on Cerebras
                "max_tokens": 8000,
            })

        # Priority 3: Cerebras key 2 — gpt-oss-120b (separate quota)
        if settings.CEREBRAS_API_KEY_2:
            self.provider_chain.append({
                "name": "cerebras-2",
                "api_key": settings.CEREBRAS_API_KEY_2,
                "base_url": "https://api.cerebras.ai/v1",
                "model": "gpt-oss-120b",  # ✅ Only GPT model available on Cerebras (key 2)
                "max_tokens": 8000,
            })

        # Priority 4: NVIDIA NIM — openai/gpt-oss-20b (available on NVIDIA)
        if settings.NVIDIA_API_KEY:
            self.provider_chain.append({
                "name": "nvidia",
                "api_key": settings.NVIDIA_API_KEY,
                "base_url": "https://integrate.api.nvidia.com/v1",
                "model": "openai/gpt-oss-20b",  # ✅ Live-verified on NVIDIA NIM
                "max_tokens": 4096,
            })

        # Priority 5: OpenRouter (mid-range fallback)
        if settings.OPENROUTER_API_KEY:
            self.provider_chain.append({
                "name": "openrouter",
                "api_key": settings.OPENROUTER_API_KEY,
                "base_url": "https://openrouter.ai/api/v1",
                "model": "openai/gpt-oss-20b",  # GPT-OSS 20B via OpenRouter
                "max_tokens": 8000,
            })

        # Priority 6 & 7: Google Gemini (LAST — stable but slower, subject to rate limits)
        # Reliable guarantee that generation succeeds even if all others are exhausted.
        if settings.GEMINI_API_KEY:
            self.provider_chain.append({
                "name": "gemini",
                "api_key": settings.GEMINI_API_KEY,
                "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
                "model": "gemini-2.5-flash",
                "max_tokens": 8192,
            })
            self.provider_chain.append({
                "name": "gemini-lite",
                "api_key": settings.GEMINI_API_KEY,
                "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
                "model": "gemini-2.5-flash-lite",
                "max_tokens": 8192,
            })

        # Keep a convenience shortcut for the primary provider (first in chain)
        if self.provider_chain:
            self.provider = self.provider_chain[0]["name"]
        else:
            self.provider = "fallback"

        # ── Startup banner ─────────────────────────────────────────────────
        print("")
        print("=" * 60)
        if not self.provider_chain:
            print("  ⚠  AI PROVIDER : NONE (fallback mode — no API key found)")
            print("     Configure GROQ_API_KEY / CEREBRAS_API_KEY / NVIDIA_API_KEY in .env")
        else:
            print(f"  ✅  PRIMARY PROVIDER  : {self.provider_chain[0]['name'].upper()}")
            print(f"  🤖  MODEL             : {self.provider_chain[0]['model']}")
            print(f"  🌐  BASE URL          : {self.provider_chain[0]['base_url']}")
            mk = self.provider_chain[0]['api_key']
            print(f"  🔑  API KEY           : {mk[:12]}...{mk[-4:]}")
            if len(self.provider_chain) > 1:
                print(f"  🔀  FALLBACK CHAIN    : ", end="")
                print(" → ".join(
                    f"{p['name'].upper()} ({p['model']})"
                    for p in self.provider_chain[1:]
                ))
        print(f"  📦  CHUNK SIZE        : {self.CHUNK_SIZE} questions per API call")
        print("=" * 60)
        print("")

    async def _call_provider(self, prov: Dict, prompt: str, attempt: int, total: int) -> Optional[str]:
        """
        Make a single API call to one provider.
        Returns:
          - content string on success
          - None  → rate-limited / empty → caller should try next provider
          - '__FATAL__' → auth error / bad request → stop chain
        """
        p_name  = prov["name"]
        p_url   = prov["base_url"]
        p_model = prov["model"]
        p_key   = prov["api_key"]

        _log("AI", f"🚀  [{attempt}/{total}] Trying {p_name.upper()} | Model: {p_model}")

        headers = {
            "Authorization": f"Bearer {p_key}",
            "Content-Type": "application/json"
        }
        if p_name == "openrouter":
            headers["HTTP-Referer"] = "http://localhost:5173"
            headers["X-Title"] = "Question Mind"

        provider_max_tokens = prov.get("max_tokens", 6000)
        t_start = time.time()
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{p_url}/chat/completions",
                headers=headers,
                json={
                    "model": p_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are an academic exam question paper setter. You understand Bloom's Taxonomy (BTL1-BTL6), subject domains, and exam design. Always respond with ONLY a valid JSON array — no markdown, no explanation, no extra text before or after."
                        },
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.7,
                    "max_tokens": provider_max_tokens
                }
            )

        elapsed = time.time() - t_start
        _log("AI", f"⏱  Response in {elapsed:.2f}s | HTTP {response.status_code} | {p_name.upper()}")

        if response.status_code == 200:
            data = response.json()
            choices  = data.get("choices") or []
            message  = choices[0].get("message", {}) if choices else {}

            # gpt-oss models are reasoning models: the visible answer is in
            # `content` when tokens are sufficient, but may be in `reasoning`
            # when `content` is null/empty (especially with low max_tokens).
            content   = message.get("content") or ""
            reasoning = message.get("reasoning") or ""

            # Use reasoning as the answer text if content is empty
            if not content.strip() and reasoning.strip():
                _log("AI", f"ℹ️  {p_name.upper()} returned reasoning field — using as content")
                content = reasoning

            content = content.strip()

            usage = data.get("usage", {})
            if usage:
                _log("AI", f"🔢  Tokens — prompt: {usage.get('prompt_tokens', '?')} | "
                           f"completion: {usage.get('completion_tokens', '?')} | "
                           f"total: {usage.get('total_tokens', '?')}")

            if not content:
                _log("AI", f"⚠  {p_name.upper()} returned empty content — trying next provider")
                return None  # Trigger fallback to next provider

            _log("AI", f"📄  Response length: {len(content):,} chars")
            return content

        elif response.status_code == 429:
            # Rate-limited — try next provider (caller will sleep before switching)
            _log("AI", f"⚡  {p_name.upper()} rate-limited (HTTP 429)")
            _log("AI", f"    Detail: {response.text[:200]}")
            return "__RATE_LIMITED__"

        elif response.status_code in self.FALLBACK_STATUS_CODES:
            _log("AI", f"⚡  {p_name.upper()} overloaded/unavailable (HTTP {response.status_code})")
            _log("AI", f"    Detail: {response.text[:200]}")
            return None  # Try next provider

        elif response.status_code == 401:
            # Bad API key — this provider is permanently unusable this session
            _log("AI", f"🔑  {p_name.upper()} auth failed (HTTP 401) — skipping this provider")
            _log("AI", f"    Detail: {response.text[:200]}")
            return "__BAD_KEY__"

        else:
            # Other HTTP errors (400, 402, 500 etc.) — skip this provider, try others
            _log("AI", f"❌  {p_name.upper()} HTTP {response.status_code} — skipping")
            _log("AI", f"    Detail: {response.text[:400]}")
            return None


    async def _call_with_fallback(self, prompt: str, provider_chain: List[Dict], prov_start_idx: int = 0) -> Optional[str]:
        """
        Try every provider in the chain starting at prov_start_idx.
        - Rate-limited providers get a brief backoff before the next attempt.
        - Bad-key / auth providers are skipped permanently for this call.
        - Timeouts and unexpected exceptions continue to the next provider.
        Returns content string, or None if every provider failed.
        """
        if not provider_chain:
            return None

        num          = len(provider_chain)
        bad_keys     = set()   # providers whose API key is invalid this session
        rate_limited = set()   # providers that returned 429 this round

        for i in range(num):
            idx  = (prov_start_idx + i) % num
            prov = provider_chain[idx]
            p_name = prov["name"]

            if p_name in bad_keys:
                _log("AI", f"⏭  Skipping {p_name.upper()} — bad API key")
                continue

            # Brief cooldown when this provider was already rate-limited this round
            if p_name in rate_limited:
                _log("AI", f"⏳  {p_name.upper()} was rate-limited — waiting 2s before retry")
                await asyncio.sleep(2)

            try:
                content = await self._call_provider(prov, prompt, i + 1, num)

                if content == "__BAD_KEY__":
                    bad_keys.add(p_name)
                    _log("AI", f"🔁  Continuing to next provider after bad-key on {p_name.upper()}")
                    continue

                if content == "__RATE_LIMITED__":
                    rate_limited.add(p_name)
                    _log("AI", f"🔁  Continuing to next provider after rate-limit on {p_name.upper()}")
                    await asyncio.sleep(1)  # 1s before hitting next provider
                    continue

                if content is None:
                    if i + 1 < num:
                        next_idx  = (prov_start_idx + i + 1) % num
                        next_name = provider_chain[next_idx]["name"].upper()
                        _log("AI", f"🔁  Switching to next provider: {next_name} ...")
                    continue

                return content   # ✅ success

            except Exception as e:
                _log("AI", f"💥  {p_name.upper()} unexpected error: {type(e).__name__}: {e} — trying next provider")
                continue

        _log("AI", "🚫  All providers in chain exhausted — no content returned")
        return None

    async def generate_questions(
        self,
        syllabus_units: List[Dict],
        part_config: Dict,
        subject_name: str,
        cdap_units: Optional[List[Dict]] = None,
        include_answers: bool = True
    ) -> List[Dict]:
        """
        Unit-assignment strategy with Slot-based exact BTL mapping:
          1. Pre-assign questions to units deterministically (round-robin).
          2. Group units into focused chunks — no unit split across chunks.
          3. Within each chunk, create detailed Slots specifying which unit, topic,
             isMCQ, and exact BTL target cognitive level is expected.
          4. Prompt the AI slot-by-slot with direct verb prescriptions.
          5. Force-stamp the slot properties on parsed questions in post-processing.
        """
        part_name  = part_config.get("partName", "Part")
        q_count    = part_config.get("questionCount", 5)
        marks      = part_config.get("marksPerQuestion", 2)
        btl_levels = part_config.get("allowedBTLLevels", [])
        mcq_count  = part_config.get("mcqCount", 0)

        provider_chain = self.provider_chain
        if not provider_chain:
            _log("AI", "⚠  No AI provider configured — returning placeholder questions")
            return self._generate_fallback(part_config, syllabus_units, cdap_units)

        _log("AI", "-" * 56)
        _log("AI", f"📋  Generating: {part_name} | Subject: {subject_name}")
        _log("AI", f"📊  Questions: {q_count} | Marks each: {marks} | BTL: {', '.join(btl_levels)}")
        _log("AI", f"📚  Units: {len(syllabus_units)} | CDAP: {'Yes' if cdap_units else 'No'}")

        # ── Dynamic chunk size: large-mark questions need more output tokens ──
        # Question-only mode omits answers, so we can fit far more per call.
        base_chunk = self.CHUNK_SIZE_QUESTION_ONLY if not include_answers else self.CHUNK_SIZE
        if marks >= 13:
            effective_chunk = 5 if include_answers else 10
        elif marks >= 8:
            effective_chunk = 7 if include_answers else 14
        else:
            effective_chunk = base_chunk

        # Step 1: pre-assign questions to units (round-robin)
        unit_assignments = self._assign_questions_to_units(q_count, syllabus_units, mcq_count)

        # Split any assignments that exceed the effective chunk size to avoid AI truncation
        split_assignments = []
        for ua in unit_assignments:
            u_count = ua["count"]
            u_mcq = ua["mcq"]
            if u_count > effective_chunk:
                num_parts = (u_count + effective_chunk - 1) // effective_chunk
                parts_counts = [u_count // num_parts + (1 if i < (u_count % num_parts) else 0) for i in range(num_parts)]
                parts_mcqs = self._allocate_exact_counts(parts_counts, u_mcq)
                for i in range(num_parts):
                    split_assignments.append({
                        "unit": ua["unit"],
                        "count": parts_counts[i],
                        "mcq": parts_mcqs[i],
                        "part_index": i,
                        "total_parts": num_parts,
                    })
            else:
                split_assignments.append({
                    **ua,
                    "part_index": 0,
                    "total_parts": 1,
                })
        unit_assignments = split_assignments

        # Step 2: group into focused chunks — each chunk owns its own units
        chunks = self._group_unit_assignments_into_chunks(unit_assignments, effective_chunk)
        num_chunks = len(chunks)

        _log("AI", f"🔀  Unit-assignment: {q_count} Qs → {num_chunks} chunk(s) | "
                   f"qs/chunk: {[sum(ua['count'] for ua in c) for c in chunks]}")

        # ── BTL budget tracker: allocate exact BTL counts across chunks upfront ──
        orig_dist    = part_config.get("btlDistribution") or {}
        allowed_btls = set(part_config.get("allowedBTLLevels") or [])
        btl_targets  = {
            k: int(v) for k, v in orig_dist.items()
            if k in allowed_btls and v and int(v) > 0
        } if orig_dist else {}

        chunk_btl_budgets: List[Dict[str, int]] = []
        if btl_targets and num_chunks > 1:
            chunk_sizes = [sum(ua["count"] for ua in c) for c in chunks]
            for level, level_total in btl_targets.items():
                per_chunk = self._allocate_exact_counts(chunk_sizes, level_total)
                for ci, cnt in enumerate(per_chunk):
                    if len(chunk_btl_budgets) <= ci:
                        chunk_btl_budgets.append({})
                    if cnt > 0:
                        chunk_btl_budgets[ci][level] = cnt
        elif btl_targets and num_chunks == 1:
            chunk_btl_budgets = [dict(btl_targets)]
        else:
            chunk_btl_budgets = [{} for _ in chunks]

        while len(chunk_btl_budgets) < num_chunks:
            chunk_btl_budgets.append({})

        _log("AI", f"🎯  BTL budget per chunk: {chunk_btl_budgets}")

        all_questions: List[Dict] = []

        for chunk_idx, chunk_units in enumerate(chunks):
            chunk_total = sum(ua["count"] for ua in chunk_units)
            chunk_mcq   = sum(ua["mcq"]   for ua in chunk_units)
            chunk_desc  = chunk_total - chunk_mcq
            chunk_btl_dist = chunk_btl_budgets[chunk_idx] or None

            # ── Construct Slot-by-Slot Configurations for this Chunk ──
            mcq_slots = []
            desc_slots = []
            for ua in chunk_units:
                u_num = ua["unit"].get("unitNumber", 1)
                u_title = ua["unit"].get("title", "")
                all_topics = self._extract_topics(ua["unit"])
                part_idx = ua.get("part_index")
                total_parts = ua.get("total_parts")
                if part_idx is not None and total_parts is not None and len(all_topics) > 1:
                    n_topics = len(all_topics)
                    start = (part_idx * n_topics) // total_parts
                    end = ((part_idx + 1) * n_topics) // total_parts
                    chunk_topics = all_topics[start:end]
                    if not chunk_topics:
                        chunk_topics = all_topics[:4]
                    topics = ", ".join(chunk_topics[:8])
                else:
                    topics = ", ".join(all_topics[:8])

                for _ in range(ua["mcq"]):
                    mcq_slots.append({
                        "unit_num": u_num,
                        "unit_title": u_title,
                        "topics": topics,
                        "is_mcq": True
                    })
                for _ in range(ua["count"] - ua["mcq"]):
                    desc_slots.append({
                        "unit_num": u_num,
                        "unit_title": u_title,
                        "topics": topics,
                        "is_mcq": False
                    })
            slots = mcq_slots + desc_slots

            # Allocate target/allowed BTLs to slots
            btl_pool = []
            for level, lvl_cnt in (chunk_btl_dist or {}).items():
                btl_pool.extend([level] * lvl_cnt)
            
            allowed_list = [b for b in btl_levels if b]
            if not allowed_list:
                allowed_list = ["BTL1", "BTL2"]
            while len(btl_pool) < chunk_total:
                btl_pool.append(allowed_list[len(btl_pool) % len(allowed_list)])
            btl_pool = btl_pool[:chunk_total]
            
            _BTL_ORDER = ["BTL1", "BTL2", "BTL3", "BTL4", "BTL5", "BTL6"]
            btl_pool.sort(key=lambda b: _BTL_ORDER.index(b) if b in _BTL_ORDER else 99)
            
            for idx, slot in enumerate(slots):
                slot["btl"] = btl_pool[idx]

            chunk_config = {
                **part_config,
                "questionCount":   chunk_total,
                "mcqCount":        chunk_mcq,
                "btlDistribution": chunk_btl_dist,
            }

            prov_idx  = chunk_idx % len(provider_chain)
            prov_name = provider_chain[prov_idx]["name"].upper()

            unit_summary = ", ".join(
                f"U{ua['unit'].get('unitNumber','?')}({ua['count']}q)" for ua in chunk_units
            )
            _log("AI", f"📦  Chunk {chunk_idx+1}/{num_chunks} | {unit_summary} "
                       f"| MCQ:{chunk_mcq} Desc:{chunk_desc} | BTL budget:{chunk_btl_dist} | Provider: {prov_name}")

            prompt = self._build_prompt(slots, chunk_config, subject_name, cdap_units, include_answers)
            _log("AI", f"📝  Prompt length: {len(prompt):,} chars")

            content = await self._call_with_fallback(prompt, provider_chain=provider_chain, prov_start_idx=prov_idx)

            if content is None:
                retry_start = (prov_idx + 1) % len(provider_chain) if len(provider_chain) > 1 else 0
                _log("AI", f"🔄  Chunk {chunk_idx+1}: all providers failed — waiting 5s then retrying...")
                await asyncio.sleep(5)
                content = await self._call_with_fallback(prompt, provider_chain=provider_chain, prov_start_idx=retry_start)

            if content is None:
                raise AIServiceError(
                    f"All AI providers are unavailable ({part_name}, chunk {chunk_idx+1}/{num_chunks}). "
                    "Please try again in a few minutes or try again tomorrow."
                )

            # ── Parse and map directly to slots ────────────────────────────────
            try:
                questions = self._parse_questions(content, chunk_config, slots, cdap_units is not None)
            except AIServiceError:
                _log("AI", f"🔄  Chunk {chunk_idx+1}: parse failed — retrying content generation (3s)...")
                await asyncio.sleep(3)
                retry_start = (prov_idx + 1) % len(provider_chain) if len(provider_chain) > 1 else 0
                content2 = await self._call_with_fallback(prompt, provider_chain=provider_chain, prov_start_idx=retry_start)
                if content2 is None:
                    raise AIServiceError(
                        f"AI response could not be parsed and retry also failed ({part_name}, "
                        f"chunk {chunk_idx+1}/{num_chunks}). Please try again later."
                    )
                questions = self._parse_questions(content2, chunk_config, slots, cdap_units is not None)

            _log("AI", f"✅  Chunk {chunk_idx+1}: {len(questions)} questions parsed and validated")
            all_questions.extend(questions)

        _log("AI", f"🏁  Assembled {len(all_questions)} questions across {num_chunks} chunk(s)")
        actual_mcq = sum(1 for q in all_questions if q.get("isMCQ"))
        _log("AI", f"✅  Final validated count: {len(all_questions)} questions (MCQ: {actual_mcq})")
        _log("AI", "-" * 56)
        return all_questions

    # ── BTL keyword-scoring helpers ───────────────────────────────────────────

    @staticmethod
    def _btl_keyword_score(text: str, btl_level: str) -> int:
        """
        Returns how many Bloom's Taxonomy action-verb matches the question text has
        for the given BTL level. Uses an expanded set of verbs per level.
        """
        _VERB_MAP: Dict[str, List[str]] = {
            "BTL1": ["define", "list", "state", "recall", "identify", "name", "label",
                     "match", "recognize", "what is", "mention", "outline"],
            "BTL2": ["explain", "describe", "summarize", "discuss", "classify", "interpret",
                     "illustrate", "paraphrase", "translate", "give example", "how does"],
            "BTL3": ["solve", "apply", "calculate", "demonstrate", "construct", "use",
                     "implement", "show", "compute", "execute", "perform", "operate"],
            "BTL4": ["analyze", "differentiate", "examine", "break down", "infer", "compare",
                     "contrast", "distinguish", "inspect", "categorize", "decompose"],
            "BTL5": ["evaluate", "assess", "justify", "judge", "defend", "critique",
                     "argue", "recommend", "prioritize", "determine the best", "appraise"],
            "BTL6": ["design", "create", "formulate", "develop", "build", "compose",
                     "generate", "plan", "propose", "construct", "invent", "write a program"],
        }
        keywords = _VERB_MAP.get(btl_level, [])
        lower = text.lower()
        return sum(1 for kw in keywords if kw in lower)

    def _infer_btl_from_text(self, text: str, allowed_levels: List[str]) -> str:
        """
        Infer the most likely BTL level for a question by scoring its text against
        Bloom's Taxonomy action-verb lists. Falls back to the first allowed level
        if no keywords are found.
        """
        if not allowed_levels:
            return "BTL1"
        scores = {level: self._btl_keyword_score(text, level) for level in allowed_levels}
        best = max(scores, key=lambda k: scores[k])
        return best if scores[best] > 0 else allowed_levels[0]

    # ── Unit-assignment helpers ─────────────────────────────────────────────

    @staticmethod
    def _assign_questions_to_units(total_q: int, units: List[Dict], mcq_count: int) -> List[Dict]:
        """
        Round-robin distribute total_q questions across units.
        Returns [{unit: {...}, count: N, mcq: N}]
        MCQ slots are assigned proportionally and the final total stays exact.
        """
        if not units or total_q == 0:
            return []
        n = len(units)
        base = total_q // n
        remainder = total_q % n
        mcq_count = max(0, min(mcq_count, total_q))
        q_counts = [base + (1 if i < remainder else 0) for i in range(n)]
        mcq_allocations = AIService._allocate_exact_counts(q_counts, mcq_count)

        result = []
        for i, unit in enumerate(units):
            q = q_counts[i]
            if q > 0:
                result.append({
                    "unit": unit,
                    "count": q,
                    "mcq": mcq_allocations[i],
                })
        return result

    @staticmethod
    def _group_unit_assignments_into_chunks(unit_assignments: List[Dict], chunk_size: int) -> List[List[Dict]]:
        """
        Group unit assignments into chunks where total questions ≤ chunk_size.
        Keeps each unit whole — no unit is split across chunks.
        """
        chunks: List[List[Dict]] = []
        current: List[Dict] = []
        current_total = 0

        for ua in unit_assignments:
            if current_total + ua["count"] > chunk_size and current:
                chunks.append(current)
                current = []
                current_total = 0
            current.append(ua)
            current_total += ua["count"]

        if current:
            chunks.append(current)
        return chunks

    def _build_prompt(self, slots: List[Dict], part: Dict, subject: str, cdap_units: Optional[List[Dict]] = None, include_answers: bool = True) -> str:
        part_name  = part.get("partName", "Part")
        marks      = part.get("marksPerQuestion", 2)
        count      = len(slots)
        btl_levels = part.get("allowedBTLLevels", ["BTL1", "BTL2"])
        mcq_count  = sum(1 for s in slots if s["is_mcq"])
        desc_count = count - mcq_count
        has_cdap   = bool(cdap_units)

        if marks <= 2:
            answer_depth = "1-2 sentences"
        elif marks <= 8:
            answer_depth = "5-8 sentences with example"
        else:
            answer_depth = "structured ~200-300 word explanation with steps/code/examples"

        # Construct slot-by-slot specification
        slot_lines = []
        for idx, s in enumerate(slots):
            q_type = "MCQ (with options A, B, C, D)" if s["is_mcq"] else "Descriptive"
            verbs = _K_KEYWORDS.get(s["btl"], "")
            slot_lines.append(
                f"Question {idx+1} ({q_type}):\n"
                f"  - Unit: Unit {s['unit_num']} ({s['unit_title']})\n"
                f"  - Key topics: {s['topics']}\n"
                f"  - Required Cognitive Level: {s['btl']} (MUST use Bloom's Taxonomy verbs: {verbs})\n"
                f"  - Marks: {marks}"
            )
        slot_block = "\n\n".join(slot_lines)

        # CDAP: only the relevant units for this chunk
        cdap_text = ""
        if has_cdap:
            chunk_unit_nums = {s["unit_num"] for s in slots}
            cdap_lines = []
            for u in cdap_units:
                u_num = u.get("unit_number")
                if u_num not in chunk_unit_nums:
                    continue
                
                # Find corresponding assignment/slot for info
                p1 = ", ".join(t.get("topic", str(t)) if isinstance(t, dict) else str(t) for t in u.get("part1_topics", [])[:6])
                p2 = ", ".join(t.get("topic", str(t)) if isinstance(t, dict) else str(t) for t in u.get("part2_topics", [])[:6])
                if p1: cdap_lines.append(f"Unit {u_num} Part1 (CDAP Part 1): {p1}")
                if p2: cdap_lines.append(f"Unit {u_num} Part2 (CDAP Part 2): {p2}")
            if cdap_lines:
                cdap_text = "\nCDAP topics (Part1 vs Part2 list):\n" + "\n".join(cdap_lines)

        cdap_field = ', "cdap_part": 1_or_2' if has_cdap else ''
        
        cdap_rule = (
            '- "cdap_part": For each generated question, you MUST set "cdap_part" to 1 if the '
            'question is based on a topic in the Part1 list above, and set it to 2 if the question '
            'is based on a topic in the Part2 list above. This mapping must be 100% accurate.\n'
        ) if has_cdap else ''

        answer_rules = (
            f"- Answer depth: {answer_depth}\n"
            "- For code/DB topics: include relevant SQL/pseudocode in answers\n"
        ) if include_answers else (
            "- Do NOT include any answers, solutions, or correct options — generate the QUESTIONS ONLY.\n"
        )

        # Staff-authored style guidance for this part (e.g. "short answer", "scenario-based",
        # "problem-solving / numerical"). Honour it verbatim so questions match what they expect.
        desc = (part.get("description") or "").strip()
        style_rule = f"- Question STYLE for {part_name} (follow this strictly): {desc}\n" if desc else ""

        prompt = f"""Generate exactly {count} exam questions for "{subject}" ({part_name}).

SPECIFIC QUESTIONS REQUIREMENT:
You MUST generate exactly {count} questions matching the slot-by-slot specifications below:

{slot_block}
{cdap_text}

RULES:
- Marks each: {marks} marks
{style_rule}{answer_rules}- BTL3+: frame with real-world context ("Given a hospital system...", "For an e-commerce DB...")
- NEVER mention unit names or numbers inside question or answer text
{cdap_rule}"""

        if mcq_count > 0:
            if include_answers:
                mcq_obj = (f'{{"question":"...","unit":1{cdap_field},"btl":"BTL1","marks":{marks},'
                           f'"isMCQ":true,"options":{{"A":"...","B":"...","C":"...","D":"..."}},"correctOption":"A","answer":"..."}}')
                desc_obj = f'{{"question":"...","unit":1{cdap_field},"btl":"BTL2","marks":{marks},"isMCQ":false,"answer":"..."}}'
            else:
                mcq_obj = (f'{{"question":"...","unit":1{cdap_field},"btl":"BTL1","marks":{marks},'
                           f'"isMCQ":true,"options":{{"A":"...","B":"...","C":"...","D":"..."}}}}')
                desc_obj = f'{{"question":"...","unit":1{cdap_field},"btl":"BTL2","marks":{marks},"isMCQ":false}}'
            prompt += f"""\n\nOUTPUT — JSON array of EXACTLY {count} items. First {mcq_count} MCQ, rest descriptive.
The BTL levels in the output JSON array must match the slot specifications above exactly:
[{mcq_obj},
 {desc_obj}]"""
        else:
            if include_answers:
                desc_obj = f'{{"question":"...","unit":1{cdap_field},"btl":"BTL2","marks":{marks},"answer":"..."}}'
            else:
                desc_obj = f'{{"question":"...","unit":1{cdap_field},"btl":"BTL2","marks":{marks}}}'
            prompt += f"""\n\nOUTPUT — JSON array of EXACTLY {count} items:
The BTL levels in the output JSON array must match the slot specifications above exactly:
[{desc_obj}]"""

        prompt += '\nReturn ONLY the JSON array. No markdown. Escape internal quotes as \\" and newlines as \\n.'
        return prompt

    # ── Manual (copy-paste) prompt mode ──────────────────────────────────────
    # These power "Prompt Mode": build one consolidated prompt the user can paste
    # into any external AI, then parse the pasted-back response. They reuse the
    # same slot construction and the same 5-attempt parser as the automatic flow.

    @staticmethod
    def _norm_key(k: str) -> str:
        """Normalize a part-name key for tolerant matching (case/spacing/punctuation-insensitive)."""
        return re.sub(r'[^a-z0-9]', '', str(k).lower())

    def _build_part_slots(self, part_config: Dict, syllabus_units: List[Dict]) -> List[Dict]:
        """
        Build the complete ordered slot list for ONE part across all its units in a single pass
        (no chunking). Mirrors the per-chunk slot construction in generate_questions but for the
        full questionCount. Each slot = {unit_num, unit_title, topics, is_mcq, btl}.
        """
        q_count   = int(part_config.get("questionCount", 5) or 0)
        mcq_count = int(part_config.get("mcqCount", 0) or 0)
        btl_levels = part_config.get("allowedBTLLevels", []) or []

        if q_count <= 0 or not syllabus_units:
            return []

        # Round-robin assign questions (and MCQs) to units
        unit_assignments = self._assign_questions_to_units(q_count, syllabus_units, mcq_count)

        # Build MCQ-first, then descriptive slots
        mcq_slots, desc_slots = [], []
        for ua in unit_assignments:
            u_num = ua["unit"].get("unitNumber", 1)
            u_title = ua["unit"].get("title", "")
            topics = ", ".join(self._extract_topics(ua["unit"])[:8])
            for _ in range(ua["mcq"]):
                mcq_slots.append({"unit_num": u_num, "unit_title": u_title, "topics": topics, "is_mcq": True})
            for _ in range(ua["count"] - ua["mcq"]):
                desc_slots.append({"unit_num": u_num, "unit_title": u_title, "topics": topics, "is_mcq": False})
        slots = mcq_slots + desc_slots
        total = len(slots)

        # Allocate BTL pool from btlDistribution (targets) within allowed levels, fill remainder
        orig_dist = part_config.get("btlDistribution") or {}
        allowed_btls = set(btl_levels)
        btl_targets = {
            k: int(v) for k, v in orig_dist.items()
            if k in allowed_btls and v and int(v) > 0
        } if orig_dist else {}

        btl_pool: List[str] = []
        for level, lvl_cnt in btl_targets.items():
            btl_pool.extend([level] * lvl_cnt)

        allowed_list = [b for b in btl_levels if b] or ["BTL1", "BTL2"]
        while len(btl_pool) < total:
            btl_pool.append(allowed_list[len(btl_pool) % len(allowed_list)])
        btl_pool = btl_pool[:total]

        _BTL_ORDER = ["BTL1", "BTL2", "BTL3", "BTL4", "BTL5", "BTL6"]
        btl_pool.sort(key=lambda b: _BTL_ORDER.index(b) if b in _BTL_ORDER else 99)

        for idx, slot in enumerate(slots):
            slot["btl"] = btl_pool[idx]

        return slots

    def build_manual_prompt(self, plan: Dict[str, Dict], subject_name: str,
                            cdap_units: Optional[List[Dict]] = None,
                            include_answers: bool = True,
                            scope_label: str = "") -> str:
        """
        Build ONE consolidated copy-paste prompt covering the whole question bank.
        plan = {part_name: {"part_config": {...}, "slots": [...]}}
        The AI is asked to return a single JSON object keyed by exact part name.
        When include_answers is False (Question Mode), answers are omitted — shorter prompt
        and a shorter AI reply (less likely to truncate).
        scope_label (e.g. "Unit 1: Basics") marks this as one batch of a larger bank and tells
        the AI to finish this batch without stopping/asking.
        """
        has_cdap = bool(cdap_units)
        part_sections: List[str] = []
        all_part_names = [pn for pn, e in plan.items() if e.get("slots")]

        for part_name in all_part_names:
            entry = plan[part_name]
            part  = entry["part_config"]
            slots = entry["slots"]
            marks = part.get("marksPerQuestion", 2)
            count = len(slots)
            mcq_count = sum(1 for s in slots if s["is_mcq"])

            if marks <= 2:
                answer_depth = "1-2 sentences"
            elif marks <= 8:
                answer_depth = "5-8 sentences with example"
            else:
                answer_depth = "structured ~200-300 word explanation with steps/code/examples"

            slot_lines = []
            for idx, s in enumerate(slots):
                q_type = "MCQ (with options A, B, C, D)" if s["is_mcq"] else "Descriptive"
                verbs = _K_KEYWORDS.get(s["btl"], "")
                slot_lines.append(
                    f"  Question {idx+1} ({q_type}):\n"
                    f"    - Unit: Unit {s['unit_num']} ({s['unit_title']})\n"
                    f"    - Key topics: {s['topics']}\n"
                    f"    - Required Cognitive Level: {s['btl']} (MUST use Bloom's Taxonomy verbs: {verbs})\n"
                    f"    - Marks: {marks}"
                )
            slot_block = "\n\n".join(slot_lines)
            depth_line = f"Answer depth: {answer_depth}\n" if include_answers else ""
            # Staff-authored question style for this part (e.g. short answer / scenario-based / numerical)
            desc = (part.get("description") or "").strip()
            style_line = f"Question STYLE (follow strictly): {desc}\n" if desc else ""
            part_sections.append(
                f'═══ "{part_name}" — {count} questions '
                f'({mcq_count} MCQ, {count - mcq_count} descriptive), {marks} marks each ═══\n'
                f"{style_line}{depth_line}\n"
                f"{slot_block}"
            )

        parts_joined = "\n\n\n".join(part_sections)

        # CDAP block (whole bank)
        cdap_text = cdap_field = cdap_rule = ""
        if has_cdap:
            cdap_lines = []
            for u in cdap_units:
                u_num = u.get("unit_number")
                p1 = ", ".join(t.get("topic", str(t)) if isinstance(t, dict) else str(t) for t in u.get("part1_topics", [])[:6])
                p2 = ", ".join(t.get("topic", str(t)) if isinstance(t, dict) else str(t) for t in u.get("part2_topics", [])[:6])
                if p1: cdap_lines.append(f"Unit {u_num} Part1 (CDAP Part 1): {p1}")
                if p2: cdap_lines.append(f"Unit {u_num} Part2 (CDAP Part 2): {p2}")
            if cdap_lines:
                cdap_text = "\nCDAP topics (Part1 vs Part2 list):\n" + "\n".join(cdap_lines) + "\n"
            cdap_field = ', "cdap_part": 1_or_2'
            cdap_rule = ('- "cdap_part": set to 1 if the question is based on a Part1 topic above, '
                         '2 if Part2. Be 100% accurate.\n')

        answer_tail = ',"isMCQ":false,"answer":"..."' if include_answers else ',"isMCQ":false'
        example_keys = ",\n  ".join(
            f'"{pn}": [ {{"question":"...","unit":1{cdap_field},"btl":"BTL1",'
            f'"marks":{plan[pn]["part_config"].get("marksPerQuestion", 2)}{answer_tail}}} ]'
            for pn in all_part_names
        )

        if include_answers:
            answer_global_rules = (
                "- For code/DB topics, include relevant SQL/pseudocode in answers.\n"
                '- MCQ questions MUST include "options" (with keys A, B, C, D) and "correctOption".\n'
            )
        else:
            answer_global_rules = (
                "- Generate QUESTIONS ONLY — do NOT include any \"answer\", \"correctOption\", or solutions.\n"
                '- MCQ questions MUST include "options" (with keys A, B, C, D) but NO "correctOption".\n'
            )

        total_q = sum(len(plan[pn]["slots"]) for pn in all_part_names)
        scope_note = (
            f"\nThis is ONE batch of a larger question bank. Generate ALL {total_q} questions for THIS "
            f"batch below — do not stop early, do not ask to continue, do not summarise.\n"
        ) if scope_label else ""
        batch_title = f' — {scope_label}' if scope_label else ''

        prompt = f"""You are an academic exam question paper setter who understands Bloom's Taxonomy (BTL1-BTL6).
Generate exam questions for the subject "{subject_name}"{batch_title} following the EXACT specifications below.
{scope_note}{cdap_text}
{parts_joined}


GLOBAL RULES:
- Generate EXACTLY the number of questions specified in each part, matching each slot's unit, type, BTL level and marks.
- Generate EVERY question in one reply. Do NOT stop early, do NOT say "I'll continue", do NOT ask permission.
- Output JSON ONLY. No greeting, no explanation, no markdown fences, no text before or after the JSON.
{answer_global_rules}- For BTL3+ questions, frame with real-world context (e.g. "Given a hospital system...").
- NEVER mention unit names or numbers inside the question or answer text.
{cdap_rule}
OUTPUT FORMAT — return ONLY a single valid JSON object (no markdown, no commentary) where each key is the
EXACT part name and each value is a JSON array of that part's question objects, in slot order:
{{
  {example_keys}
}}

Escape internal quotes as \\" and newlines as \\n. Return ONLY the JSON object — nothing else."""
        return prompt

    @staticmethod
    def split_plan_by_unit(plan: Dict[str, Dict]) -> Dict[int, Dict]:
        """
        Split a generation plan into per-unit sub-plans, preserving slot order within each part.
        Returns { unit_number: { part_name: {"part_config": {...}, "slots": [...]} } }, ordered by
        unit number. Each sub-plan has the same shape as the full plan, so build_manual_prompt and
        parse_manual_response work on it unchanged.
        """
        per_unit: Dict[int, Dict] = {}
        for part_name, entry in plan.items():
            part_config = entry["part_config"]
            for slot in entry["slots"]:
                u = slot.get("unit_num", 1)
                sub = per_unit.setdefault(u, {})
                if part_name not in sub:
                    sub[part_name] = {"part_config": part_config, "slots": []}
                sub[part_name]["slots"].append(slot)
        # Return ordered by unit number
        return {u: per_unit[u] for u in sorted(per_unit.keys())}

    def parse_manual_response(self, content: str, plan: Dict[str, Dict],
                              has_cdap: bool = False) -> Dict[str, List[Dict]]:
        """
        Parse a pasted external-AI response (a JSON object keyed by part name) into the questions
        dict. Reuses _parse_questions (with its 5-attempt repair + slot matching) per part.
        """
        if not content or not content.strip():
            raise AIServiceError("Empty response. Please paste the AI's JSON output.")

        text = content.strip()
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)

        parsed = None
        try:
            parsed = json.loads(text)
        except Exception:
            try:
                parsed = json.loads(_repair(text))
            except Exception:
                parsed = None

        part_names = list(plan.keys())

        # Map the parsed structure to {part_name: array}
        part_arrays: Dict[str, list] = {}
        if isinstance(parsed, dict):
            norm = {self._norm_key(k): v for k, v in parsed.items()}
            for pn in part_names:
                val = parsed.get(pn)
                if val is None:
                    val = norm.get(self._norm_key(pn))
                if isinstance(val, list):
                    part_arrays[pn] = val
            # Positional fallback if no keys matched
            if not part_arrays:
                list_vals = [v for v in parsed.values() if isinstance(v, list)]
                for pn, val in zip(part_names, list_vals):
                    part_arrays[pn] = val
        elif isinstance(parsed, list) and len(part_names) == 1:
            part_arrays[part_names[0]] = parsed

        if not part_arrays:
            raise AIServiceError(
                "Could not find question arrays in the pasted response. Make sure you pasted the full "
                "JSON object the AI produced (keyed by part name)."
            )

        questions: Dict[str, List[Dict]] = {}
        for pn in part_names:
            entry = plan[pn]
            slots = entry["slots"]
            if not slots:
                questions[pn] = []
                continue
            arr = part_arrays.get(pn)
            sub_json = json.dumps(arr if isinstance(arr, list) else [])
            # _parse_questions tolerates an empty array by filling placeholders from slots
            questions[pn] = self._parse_questions(sub_json, entry["part_config"], slots, has_cdap)

        return questions

    def _get_btl_guidelines(self, btl_levels, marks, subject):
        """Kept for compatibility — no longer injected into prompts."""
        return ""

    def _get_scenario_requirements(self, marks, btl_levels, part_name):
        """Kept for compatibility — no longer injected into prompts."""
        return ""

    def _get_subject_specific_guidelines(self, subject, marks):
        """Kept for compatibility — no longer injected into prompts."""
        return ""

    def _extract_topics(self, unit: Dict) -> List[str]:
        topics = unit.get("topics", [])
        if not topics:
            return [unit.get("title", "General")]
        
        result = []
        for t in topics:
            if isinstance(t, str):
                result.append(t)
            elif isinstance(t, dict):
                result.append(t.get("topicName", str(t)))
        return result
    
    @staticmethod
    def _clean_markdown(text: str) -> str:
        """Strip AI markdown noise (**bold**, *italic*, ## headers) from answer text."""
        if not isinstance(text, str):
            return text
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text, flags=re.DOTALL)
        text = re.sub(r'__(.+?)__', r'\1', text, flags=re.DOTALL)
        text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', text, flags=re.DOTALL)
        text = re.sub(r'(?<!_)_(?!_)(.+?)(?<!_)_(?!_)', r'\1', text, flags=re.DOTALL)
        text = re.sub(r'^#{1,6}\s*', '', text, flags=re.MULTILINE)
        text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), text)
        return text.strip()

    @staticmethod
    def _remove_unit_references(text: str) -> str:
        """Remove any phrases that reference unit numbers from question/answer text."""
        if not isinstance(text, str):
            return text
        patterns = [
            r'\b[Ii]n [Uu]nit\s*\d+[,:]?\s*',
            r'\b[Aa]s (discussed|covered|described|mentioned|stated|explained) in [Uu]nit\s*\d+[,:]?\s*',
            r'\b[Aa]ccording to [Uu]nit\s*\d+[,:]?\s*',
            r'\b[Ii]n the context of [Uu]nit\s*\d+[,:]?\s*',
            r'\b[Ff]rom [Uu]nit\s*\d+[,:]?\s*',
            r'\b\([Uu]nit\s*\d+\)\s*',
            r'\b[Uu]nit\s*\d+\s*[-–:]\s*',
        ]
        for pattern in patterns:
            text = re.sub(pattern, '', text)
        text = re.sub(r'  +', ' ', text).strip()
        return text

    def _clean_questions(self, questions: list) -> list:
        """Apply markdown cleanup and unit-reference stripping to question and answer text fields."""
        text_fields = ("question", "answer", "hint", "explanation")
        for q in questions:
            for field in text_fields:
                if field in q and isinstance(q[field], str):
                    q[field] = self._clean_markdown(q[field])
                    q[field] = self._remove_unit_references(q[field])
        return questions

    @staticmethod
    def _repair_truncated_json(text: str) -> str:
        """
        Attempt to close a JSON array that was cut off mid-stream.
        Strips incomplete trailing object and closes the array.
        """
        last_brace = text.rfind('}')
        if last_brace == -1:
            return text
        truncated = text[:last_brace + 1]
        truncated = truncated.rstrip().rstrip(',')
        return truncated + "\n]"

    @staticmethod
    def _allocate_exact_counts(weights: List[int], total: int) -> List[int]:
        """Split `total` across buckets while keeping the final sum exact."""
        if total <= 0 or not weights:
            return [0 for _ in weights]

        clean_weights = [max(0, int(w or 0)) for w in weights]
        weight_sum = sum(clean_weights)

        if weight_sum <= 0:
            base = total // len(weights)
            remainder = total % len(weights)
            return [base + (1 if i < remainder else 0) for i in range(len(weights))]

        raw_values = [w * total / weight_sum for w in clean_weights]
        counts = [int(v) for v in raw_values]
        remaining = total - sum(counts)

        remainders = sorted(
            range(len(raw_values)),
            key=lambda i: (raw_values[i] - counts[i], -i),
            reverse=True,
        )
        for idx in remainders[:remaining]:
            counts[idx] += 1

        return counts

    @classmethod
    def _scale_distribution_exact(
        cls,
        distribution: Dict[str, int],
        total: int,
        allowed_levels: Optional[List[str]] = None,
    ) -> Dict[str, int]:
        """Scale a level distribution so it matches `total` exactly."""
        if not distribution or total <= 0:
            return {}

        allowed = set(allowed_levels or [])
        items = [
            (level, max(0, int(count or 0)))
            for level, count in distribution.items()
            if max(0, int(count or 0)) > 0 and (not allowed or level in allowed)
        ]

        if not items:
            return {}

        levels = [level for level, _ in items]
        weights = [count for _, count in items]
        allocated = cls._allocate_exact_counts(weights, total)
        return {level: count for level, count in zip(levels, allocated) if count > 0}

    def _parse_questions(self, content: str, part: Dict, slots: List[Dict], has_cdap: bool = False) -> List[Dict]:
        marks      = part.get("marksPerQuestion", 2)

        def _finalise(questions: list) -> list:
            questions = [q for q in questions if isinstance(q, dict)]
            
            # Align with slots
            if len(questions) < len(slots):
                shortfall = len(slots) - len(questions)
                for i in range(shortfall):
                    src = questions[i % len(questions)] if questions else {}
                    questions.append(dict(src))
            elif len(questions) > len(slots):
                questions = questions[:len(slots)]

            # Analyze actual/inferred BTL and unit for each question
            all_btl_list = ["BTL1", "BTL2", "BTL3", "BTL4", "BTL5", "BTL6"]
            processed_qs = []
            for q in questions:
                q_text = q.get("question", "")
                
                # Infer true BTL based on content verbs
                inferred = self._infer_btl_from_text(q_text, all_btl_list)
                ai_btl = q.get("btl")
                actual_btl = ai_btl if ai_btl in all_btl_list else inferred
                
                # Verify unit number
                try:
                    actual_unit = int(q.get("unit", 0))
                except Exception:
                    actual_unit = 0
                
                # Verify MCQ status
                has_opts = isinstance(q.get("options"), dict) and any(str(v).strip() for v in q["options"].values() if v)
                has_corr = q.get("correctOption") in {"A", "B", "C", "D"}
                is_actually_mcq = q.get("isMCQ") is True or (q.get("isMCQ") is not False and (has_opts or has_corr))

                processed_qs.append({
                    "original": q,
                    "btl": actual_btl,
                    "unit": actual_unit,
                    "is_mcq": is_actually_mcq
                })

            # Optimal slot matching
            matched_questions = [None] * len(slots)
            used_q_indices = set()

            for slot_idx, slot in enumerate(slots):
                best_q_idx = -1
                best_score = -1000000
                
                for q_idx, pq in enumerate(processed_qs):
                    if q_idx in used_q_indices:
                        continue
                    
                    score = 0
                    # MCQ match is critical
                    if pq["is_mcq"] == slot["is_mcq"]:
                        score += 10000
                    else:
                        score -= 10000
                        
                    # BTL level match
                    if pq["btl"] == slot["btl"]:
                        score += 1000
                        
                    # Unit match
                    if pq["unit"] == slot["unit_num"]:
                        score += 100
                        
                    if score > best_score:
                        best_score = score
                        best_q_idx = q_idx
                
                if best_q_idx != -1:
                    used_q_indices.add(best_q_idx)
                    q = dict(processed_qs[best_q_idx]["original"])
                    
                    # Stamp properties from slot
                    q["unit"] = slot["unit_num"]
                    
                    # Stamp the actual verified/inferred BTL to prevent labeling mistakenly
                    q["btl"] = processed_qs[best_q_idx]["btl"]
                    
                    if "marks" not in q:
                        q["marks"] = marks
                    if has_cdap and "cdap_part" not in q:
                        q["cdap_part"] = 1
                        
                    # Clean options
                    if not slot["is_mcq"]:
                        q["isMCQ"] = False
                        q.pop("options", None)
                        q.pop("correctOption", None)
                    else:
                        q["isMCQ"] = True
                        opts = q.get("options")
                        if not isinstance(opts, dict) or not any(
                            str(v).strip() for v in opts.values() if v
                        ):
                            ans = q.get("answer", "")
                            q["options"] = {
                                "A": ans.strip() if isinstance(ans, str) and ans.strip() else "Option A",
                                "B": "Option B",
                                "C": "Option C",
                                "D": "Option D",
                            }
                        if q.get("correctOption") not in {"A", "B", "C", "D"}:
                            q["correctOption"] = "A"
                            
                    matched_questions[slot_idx] = q

            # Fallback for unmatched slots
            for idx in range(len(slots)):
                if matched_questions[idx] is None:
                    slot = slots[idx]
                    q = {
                        "question": f"Question about Unit {slot['unit_num']}",
                        "unit": slot["unit_num"],
                        "btl": slot["btl"],
                        "isMCQ": slot["is_mcq"],
                        "marks": marks,
                        "answer": "Answer"
                    }
                    if slot["is_mcq"]:
                        q["options"] = {"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"}
                        q["correctOption"] = "A"
                    matched_questions[idx] = q

            return self._clean_questions(matched_questions)

        try:
            content = content.strip()
            # Strip markdown code fences
            content = re.sub(r'^```(?:json)?\s*', '', content)
            content = re.sub(r'\s*```$', '', content)

            # Locate the outermost JSON array
            json_match = re.search(r'\[[\s\S]*', content)
            if not json_match:
                _log("PARSE", "⚠  No JSON array found in response")
                raise ValueError("No array")

            json_str = json_match.group()
            # Trim to last ']' if present
            last_bracket = json_str.rfind(']')
            if last_bracket != -1:
                json_str = json_str[:last_bracket + 1]

            # ── Attempt 1: Direct parse ───────────────────────
            try:
                questions = json.loads(json_str)
                _log("PARSE", f"✅  Attempt 1 (direct) — {len(questions)} questions")
                return _finalise(questions)
            except json.JSONDecodeError as e1:
                _log("PARSE", f"⚠  Attempt 1 failed: {e1}")

            # ── Attempt 2: json-repair on extracted array ─────────────
            # Handles unescaped quotes, raw newlines, truncation, trailing commas, etc.
            try:
                repaired_str = _repair(json_str)
                questions = json.loads(repaired_str)
                if isinstance(questions, list) and questions:
                    _log("PARSE", f"✅  Attempt 2 (json-repair) — {len(questions)} questions")
                    return _finalise(questions)
                raise ValueError(f"json-repair returned {type(questions).__name__}")
            except Exception as e2:
                _log("PARSE", f"⚠  Attempt 2 failed: {e2}")

            # ── Attempt 3: json-repair on full raw content ────────────
            try:
                repaired_str = _repair(content)
                parsed = json.loads(repaired_str)
                if isinstance(parsed, list):
                    questions = parsed
                elif isinstance(parsed, dict):
                    questions = next((v for v in parsed.values() if isinstance(v, list) and v), None)
                    if questions is None:
                        raise ValueError("No list found in repaired dict")
                else:
                    raise ValueError(f"Unexpected type: {type(parsed).__name__}")
                if questions:
                    _log("PARSE", f"✅  Attempt 3 (json-repair full) — {len(questions)} questions")
                    return _finalise(questions)
            except Exception as e3:
                _log("PARSE", f"⚠  Attempt 3 failed: {e3}")

            # ── Attempt 4: Truncation recovery + json-repair ─────────
            try:
                recovered = self._repair_truncated_json(json_str)
                repaired_str = _repair(recovered)
                questions = json.loads(repaired_str)
                if isinstance(questions, list) and questions:
                    _log("PARSE", f"✅  Attempt 4 (truncate+repair) — {len(questions)} questions")
                    return _finalise(questions)
            except Exception as e4:
                _log("PARSE", f"⚠  Attempt 4 failed: {e4}")

            # ── Attempt 5: Salvage individual objects + json-repair each ──
            try:
                obj_pattern = r'\{(?:[^{}]|\{[^{}]*\})*"question"(?:[^{}]|\{[^{}]*\})*\}'
                matches = re.findall(obj_pattern, json_str, re.DOTALL)
                if matches:
                    questions = []
                    for m in matches:
                        try:
                            questions.append(json.loads(m))
                        except Exception:
                            try:
                                fixed = _repair(m)
                                questions.append(json.loads(fixed))
                            except Exception:
                                pass
                    if questions:
                        _log("PARSE", f"✅  Attempt 5 (salvage+repair) — {len(questions)} questions")
                        return _finalise(questions)
                _log("PARSE", "❌  Attempt 5 yielded nothing")
            except Exception as e5:
                _log("PARSE", f"⚠  Attempt 5 error: {e5}")

        except Exception as e:
            _log("PARSE", f"💥  Unexpected parse error: {type(e).__name__}: {e}")
            import traceback; traceback.print_exc()

        _log("PARSE", "❌  All 5 parse attempts failed — cannot recover AI response")
        raise AIServiceError("AI response could not be parsed after 5 attempts. The model may have produced malformed output.")
    
    def _generate_fallback(self, part: Dict, units: List[Dict], cdap_units: Optional[List[Dict]] = None) -> List[Dict]:
        """Generate placeholder questions if AI fails"""
        questions = []
        count = part.get("questionCount", 5)
        marks = part.get("marksPerQuestion", 2)
        btl_levels = part.get("allowedBTLLevels", ["BTL1", "BTL2"])
        mcq_count = part.get("mcqCount", 0)
        has_cdap = cdap_units is not None and len(cdap_units) > 0
        
        num_units = max(len(units), 5)
        
        for i in range(count):
            unit_num = (i % num_units) + 1
            btl = btl_levels[i % len(btl_levels)]
            is_mcq = i < mcq_count
            
            # Get topic if available
            topic = "the subject"
            if units and i < len(units):
                unit = units[i % len(units)]
                topics = unit.get("topics", [])
                if topics:
                    topic = topics[0] if isinstance(topics[0], str) else topics[0].get("topicName", "the topic")
            
            q = {
                "question": f"[AI Unavailable] Write a {marks}-mark question about {topic} (Unit {unit_num})",
                "unit": unit_num,
                "btl": btl,
                "marks": marks,
                "answer": "Please configure an AI API key (GROQ_API_KEY, CEREBRAS_API_KEY, or NVIDIA_API_KEY) in backend-python/.env to generate actual questions."
            }
            
            # Add cdap_part if CDAP is available
            if has_cdap:
                q["cdap_part"] = 1 if i % 2 == 0 else 2
            
            if is_mcq:
                q["isMCQ"] = True
                q["options"] = {"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"}
                q["correctOption"] = "A"
            
            questions.append(q)
        
        return questions
    
    async def generate_full_question_bank(
        self,
        syllabus_units: List[Dict],
        parts: List[Dict],
        subject_name: str,
        cdap_units: Optional[List[Dict]] = None,
        include_answers: bool = True
    ) -> Dict[str, List[Dict]]:
        """Generate questions for all parts"""
        result = {}
        total_start = time.time()

        provider_chain = self.provider_chain
        primary_model = provider_chain[0]["model"] if provider_chain else "none"
        primary_name = provider_chain[0]["name"] if provider_chain else "fallback"

        _log("QB", "=" * 56)
        _log("QB", f"🎓  Starting full question bank generation")
        _log("QB", f"    Subject : {subject_name}")
        _log("QB", f"    Parts   : {len(parts)} ({', '.join(p.get('partName', '?') for p in parts)})")
        _log("QB", f"    Provider: {primary_name.upper()} | Model: {primary_model}")
        _log("QB", "=" * 56)

        for i, part in enumerate(parts, 1):
            part_name = part.get("partName", "Part")
            part_start = time.time()
            _log("QB", f"[{i}/{len(parts)}] Starting {part_name} ...")
            questions = await self.generate_questions(syllabus_units, part, subject_name, cdap_units, include_answers)
            part_elapsed = time.time() - part_start
            result[part_name] = questions
            _log("QB", f"[{i}/{len(parts)}] {part_name} done — {len(questions)} questions in {part_elapsed:.2f}s")

        total_elapsed = time.time() - total_start
        total_q = sum(len(v) for v in result.values())
        _log("QB", "=" * 56)
        _log("QB", f"🏁  Generation complete! Total: {total_q} questions across {len(parts)} parts in {total_elapsed:.2f}s")
        _log("QB", "=" * 56)

        return result


ai_service = AIService()

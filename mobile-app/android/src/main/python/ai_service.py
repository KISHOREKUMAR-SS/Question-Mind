import asyncio
import httpx
import json
import re
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from ..config import settings

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
    """AI Service with automatic provider fallback: Groq → Cerebras → NVIDIA → OpenRouter"""

    # HTTP codes that trigger provider fallback (rate limit, overload, model not found)
    FALLBACK_STATUS_CODES = {404, 429, 503, 529}

    # Max questions per single AI call — keeps prompts well within token limits
    CHUNK_SIZE = 10

    def __init__(self):
        # Build ordered provider chain from available API keys
        self.provider_chain: List[Dict] = []

        # Priority 1: Cerebras key 1 (primary)
        if settings.CEREBRAS_API_KEY:
            self.provider_chain.append({
                "name": "cerebras",
                "api_key": settings.CEREBRAS_API_KEY,
                "base_url": "https://api.cerebras.ai/v1",
                "model": "gpt-oss-120b",
                "max_tokens": 8000,
            })

        # Priority 1b: Cerebras key 2 (second account — rotates after key 1)
        if settings.CEREBRAS_API_KEY_2:
            self.provider_chain.append({
                "name": "cerebras-2",
                "api_key": settings.CEREBRAS_API_KEY_2,
                "base_url": "https://api.cerebras.ai/v1",
                "model": "gpt-oss-120b",
                "max_tokens": 8000,
            })

        # Priority 2: Groq
        if settings.GROQ_API_KEY:
            self.provider_chain.append({
                "name": "groq",
                "api_key": settings.GROQ_API_KEY,
                "base_url": "https://api.groq.com/openai/v1",
                "model": "openai/gpt-oss-120b",  # GPT OSS 120B — 500 tok/s on Groq
                "max_tokens": 8000,
            })

        # Priority 3: NVIDIA
        if settings.NVIDIA_API_KEY:
            self.provider_chain.append({
                "name": "nvidia",
                "api_key": settings.NVIDIA_API_KEY,
                "base_url": "https://integrate.api.nvidia.com/v1",
                "model": "openai/gpt-oss-120b",  # GPT OSS 120B on NVIDIA NIM
                "max_tokens": 4096,  # NVIDIA free tier cap
            })

        # Priority 4: OpenRouter
        if settings.OPENROUTER_API_KEY:
            self.provider_chain.append({
                "name": "openrouter",
                "api_key": settings.OPENROUTER_API_KEY,
                "base_url": "https://openrouter.ai/api/v1",
                "model": "openai/gpt-oss-120b",  # GPT OSS 120B via OpenRouter
                "max_tokens": 8000,
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
            print("     Configure CEREBRAS_API_KEY / NVIDIA_API_KEY in .env")
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
            # Guard: reasoning models (e.g. gpt-oss-120b) can return content=null
            # when the actual text is in a separate reasoning field — treat as empty.
            choices  = data.get("choices") or []
            content  = (choices[0].get("message", {}).get("content") if choices else None) or ""
            content  = content.strip()

            usage = data.get("usage", {})
            if usage:
                _log("AI", f"🔢  Tokens — prompt: {usage.get('prompt_tokens', '?')} | "
                           f"completion: {usage.get('completion_tokens', '?')} | "
                           f"total: {usage.get('total_tokens', '?')}")

            if not content:
                _log("AI", f"⚠  {p_name.upper()} returned empty/null content — trying next provider")
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

    async def _call_with_fallback(self, prompt: str, prov_start_idx: int = 0) -> Optional[str]:
        """
        Try every provider in the chain starting at prov_start_idx.
        - Rate-limited providers get a brief backoff before the next attempt.
        - Bad-key / auth providers are skipped permanently for this call.
        - Timeouts and unexpected exceptions continue to the next provider.
        Returns content string, or None if every provider failed.
        """
        if not self.provider_chain:
            return None

        num          = len(self.provider_chain)
        bad_keys     = set()   # providers whose API key is invalid this session
        rate_limited = set()   # providers that returned 429 this round

        for i in range(num):
            idx  = (prov_start_idx + i) % num
            prov = self.provider_chain[idx]
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
                        next_name = self.provider_chain[next_idx]["name"].upper()
                        _log("AI", f"🔁  Switching to next provider: {next_name} ...")
                    continue

                return content   # ✅ success

            except httpx.TimeoutException:
                _log("AI", f"⏰  {p_name.upper()} timed out after 120s — trying next provider")
                continue
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
        cdap_units: Optional[List[Dict]] = None
    ) -> List[Dict]:
        """
        Unit-assignment strategy for even topic coverage:
          1. Pre-assign questions to units deterministically (round-robin).
          2. Group units into focused chunks — no unit split across chunks.
          3. Each AI call owns specific units with exact counts → guaranteed coverage.
          4. After parsing, unit numbers are stamped from assignment (overrides AI field).
        """
        part_name  = part_config.get("partName", "Part")
        q_count    = part_config.get("questionCount", 5)
        marks      = part_config.get("marksPerQuestion", 2)
        btl_levels = part_config.get("allowedBTLLevels", [])
        mcq_count  = part_config.get("mcqCount", 0)

        if not self.provider_chain:
            _log("AI", "⚠  No AI provider configured — returning placeholder questions")
            return self._generate_fallback(part_config, syllabus_units, cdap_units)

        _log("AI", "-" * 56)
        _log("AI", f"📋  Generating: {part_name} | Subject: {subject_name}")
        _log("AI", f"📊  Questions: {q_count} | Marks each: {marks} | BTL: {', '.join(btl_levels)}")
        _log("AI", f"📚  Units: {len(syllabus_units)} | CDAP: {'Yes' if cdap_units else 'No'}")

        # ── Dynamic chunk size: large-mark questions need more output tokens ──
        if marks >= 13:
            effective_chunk = 5
        elif marks >= 8:
            effective_chunk = 7
        else:
            effective_chunk = self.CHUNK_SIZE

        # Step 1: pre-assign questions to units (round-robin)
        unit_assignments = self._assign_questions_to_units(q_count, syllabus_units, mcq_count)

        # Step 2: group into focused chunks — each chunk owns its own units
        chunks = self._group_unit_assignments_into_chunks(unit_assignments, effective_chunk)
        num_chunks = len(chunks)

        _log("AI", f"🔀  Unit-assignment: {q_count} Qs → {num_chunks} chunk(s) | "
                   f"qs/chunk: {[sum(ua['count'] for ua in c) for c in chunks]}")

        all_questions: List[Dict] = []

        for chunk_idx, chunk_units in enumerate(chunks):
            chunk_total = sum(ua["count"] for ua in chunk_units)
            chunk_mcq   = sum(ua["mcq"]   for ua in chunk_units)
            chunk_desc  = chunk_total - chunk_mcq

            # Scale btlDistribution to match this chunk's question count.
            # Without scaling, the prompt would demand e.g. BTL1=4q, BTL2=6q but
            # only need to generate chunk_total (e.g. 5) questions — contradictory.
            part_total   = part_config.get("questionCount", 1) or 1
            orig_dist    = part_config.get("btlDistribution") or {}
            allowed_btls = set(part_config.get("allowedBTLLevels") or [])
            if orig_dist and chunk_total < part_total:
                scaled_dist = {
                    k: round(v * chunk_total / part_total)
                    for k, v in orig_dist.items() if v and int(v) > 0
                }
                scaled_dist = {k: v for k, v in scaled_dist.items() if v > 0 and k in allowed_btls}
            else:
                scaled_dist = orig_dist or None

            chunk_config = {
                **part_config,
                "questionCount":   chunk_total,
                "mcqCount":        chunk_mcq,
                "btlDistribution": scaled_dist,
            }

            # Rotate providers across chunks for load balancing
            prov_idx  = chunk_idx % len(self.provider_chain)
            prov_name = self.provider_chain[prov_idx]["name"].upper()

            unit_summary = ", ".join(
                f"U{ua['unit'].get('unitNumber','?')}({ua['count']}q)" for ua in chunk_units
            )
            _log("AI", f"📦  Chunk {chunk_idx+1}/{num_chunks} | {unit_summary} "
                       f"| MCQ:{chunk_mcq} Desc:{chunk_desc} | Provider: {prov_name}")

            prompt = self._build_prompt(chunk_units, chunk_config, subject_name, cdap_units)
            _log("AI", f"📝  Prompt length: {len(prompt):,} chars")

            content = await self._call_with_fallback(prompt, prov_start_idx=prov_idx)

            # ── First attempt failed: wait briefly and retry with a different lead provider ──
            if content is None:
                retry_start = (prov_idx + 1) % len(self.provider_chain) if len(self.provider_chain) > 1 else 0
                _log("AI", f"🔄  Chunk {chunk_idx+1}: all providers failed — waiting 5s then retrying...")
                await asyncio.sleep(5)
                content = await self._call_with_fallback(prompt, prov_start_idx=retry_start)

            if content is None:
                raise AIServiceError(
                    f"All AI providers are unavailable ({part_name}, chunk {chunk_idx+1}/{num_chunks}). "
                    "Please try again in a few minutes or try again tomorrow."
                )

            # ── Parse ─────────────────────────────────────────────────────────
            try:
                questions = self._parse_questions(content, chunk_config, cdap_units is not None)
            except AIServiceError:
                # Parse failed after all repair attempts — retry the API call once more
                _log("AI", f"🔄  Chunk {chunk_idx+1}: parse failed — retrying content generation (3s)...")
                await asyncio.sleep(3)
                retry_start = (prov_idx + 1) % len(self.provider_chain) if len(self.provider_chain) > 1 else 0
                content2 = await self._call_with_fallback(prompt, prov_start_idx=retry_start)
                if content2 is None:
                    raise AIServiceError(
                        f"AI response could not be parsed and retry also failed ({part_name}, "
                        f"chunk {chunk_idx+1}/{num_chunks}). Please try again later."
                    )
                questions = self._parse_questions(content2, chunk_config, cdap_units is not None)

            # Stamp each question with its correct unit number based on assignment
            q_ptr = 0
            for ua in chunk_units:
                unit_num = ua["unit"].get("unitNumber", 1)
                for _ in range(ua["count"]):
                    if q_ptr < len(questions):
                        questions[q_ptr]["unit"] = unit_num
                        q_ptr += 1
            _log("AI", f"✅  Chunk {chunk_idx+1}: {len(questions)} questions parsed")
            all_questions.extend(questions)

        _log("AI", f"🏁  Assembled {len(all_questions)} questions across {num_chunks} chunk(s)")
        _log("AI", "-" * 56)
        return all_questions

    
    # ── Unit-assignment helpers ─────────────────────────────────────────────

    @staticmethod
    def _assign_questions_to_units(total_q: int, units: List[Dict], mcq_count: int) -> List[Dict]:
        """
        Round-robin distribute total_q questions across units.
        Returns [{unit: {...}, count: N, mcq: N}]
        MCQ slots are assigned to the first N units (front-loaded).
        """
        if not units or total_q == 0:
            return []
        n = len(units)
        base = total_q // n
        remainder = total_q % n
        mcq_ratio = mcq_count / total_q if total_q else 0

        result = []
        for i, unit in enumerate(units):
            q = base + (1 if i < remainder else 0)
            if q > 0:
                result.append({
                    "unit": unit,
                    "count": q,
                    "mcq": round(mcq_ratio * q),
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

    def _build_prompt(self, unit_assignments: List[Dict], part: Dict, subject: str, cdap_units: Optional[List[Dict]] = None) -> str:
        part_name  = part.get("partName", "Part")
        marks      = part.get("marksPerQuestion", 2)
        count      = part.get("questionCount", 5)
        btl_levels = part.get("allowedBTLLevels", ["BTL1", "BTL2"])
        mcq_count  = part.get("mcqCount", 0)
        desc_count = count - mcq_count
        has_cdap   = bool(cdap_units)

        if marks <= 2:
            answer_depth = "1-2 sentences"
        elif marks <= 8:
            answer_depth = "5-8 sentences with example"
        else:
            answer_depth = "structured ~200-300 word explanation with steps/code/examples"

        # Focused unit coverage — only the units this chunk owns, with exact counts
        unit_lines = []
        for ua in unit_assignments:
            u      = ua["unit"]
            q_for  = ua["count"]
            topics = ", ".join(self._extract_topics(u)[:8])
            unit_lines.append(f"- {q_for}q from: {u.get('title', '')} | {topics}")
        unit_block = "\n".join(unit_lines)

        # CDAP: only the relevant units for this chunk
        cdap_text = ""
        if has_cdap:
            chunk_unit_nums = {ua["unit"].get("unitNumber") for ua in unit_assignments}
            cdap_lines = []
            for u in cdap_units:
                if u.get("unit_number") not in chunk_unit_nums:
                    continue
                def _fmt(tlist):
                    return ", ".join(
                        (t.get("topic", str(t)) if isinstance(t, dict) else str(t))
                        for t in tlist[:6]
                    )
                p1 = _fmt(u.get("part1_topics", []))
                p2 = _fmt(u.get("part2_topics", []))
                un = u.get("unit_number", "?")
                if p1: cdap_lines.append(f"Part1: {p1}")
                if p2: cdap_lines.append(f"Part2: {p2}")
            if cdap_lines:
                cdap_text = "\nCDAP topics:\n" + "\n".join(cdap_lines)

        cdap_field = ', "cdap_part": 1_or_2' if has_cdap else ''
        cdap_rule  = '- "cdap_part": alternate 1 and 2\n' if has_cdap else ''

        # ── BTL / K-level keyword guide (only levels used in this part) ─
        _BTL_ORDER = ["BTL1", "BTL2", "BTL3", "BTL4", "BTL5", "BTL6"]
        k_pairs = [
            f"{btl}/K{_BTL_ORDER.index(btl)+1}: {_K_KEYWORDS[btl]}"
            for btl in _BTL_ORDER if btl in btl_levels
        ]
        k_keywords_line = " | ".join(k_pairs)

        # ── BTL distribution line (if the user set exact counts per level) ─
        btl_dist_raw = part.get("btlDistribution") or {}
        btl_dist = {k: v for k, v in btl_dist_raw.items() if k in btl_levels and v and int(v) > 0}
        if btl_dist:
            dist_parts = ", ".join(
                f"{k}/K{_BTL_ORDER.index(k)+1}={v}q"
                for k, v in btl_dist.items()
            )
            dist_rule = f"- EXACT BTL/K distribution required: {dist_parts} (counts are mandatory)\n"
        elif len(btl_levels) > 1:
            # No explicit distribution set — instruct AI to spread evenly across allowed levels
            dist_rule = (
                f"- Distribute the {count} questions as evenly as possible across "
                f"these BTL levels: {', '.join(btl_levels)}\n"
            )
        else:
            dist_rule = ""

        prompt = f"""Generate exactly {count} exam questions for "{subject}" ({part_name}).

UNIT COVERAGE — generate EXACTLY the count specified from each topic set:
{unit_block}{cdap_text}

RULES:
- {mcq_count} MCQ + {desc_count} descriptive | {marks} marks each | BTL: {', '.join(btl_levels)}
- K-level keywords: {k_keywords_line}
{dist_rule}- Answer depth: {answer_depth}
- For code/DB topics: include relevant SQL/pseudocode in answers
- BTL3+: frame with real-world context ("Given a hospital system...", "For an e-commerce DB...")
- NEVER mention unit names or numbers inside question or answer text
{cdap_rule}"""

        if mcq_count > 0:
            prompt += f"""OUTPUT — JSON array of EXACTLY {count} items. First {mcq_count} MCQ, rest descriptive:
[{{"question":"...","unit":1{cdap_field},"btl":"BTL1","marks":{marks},"isMCQ":true,"options":{{"A":"...","B":"...","C":"...","D":"..."}},"correctOption":"A","answer":"..."}},
 {{"question":"...","unit":1{cdap_field},"btl":"BTL2","marks":{marks},"isMCQ":false,"answer":"..."}}]"""
        else:
            prompt += f"""OUTPUT — JSON array of EXACTLY {count} items:
[{{"question":"...","unit":1{cdap_field},"btl":"BTL2","marks":{marks},"answer":"..."}}]"""

        prompt += "\nReturn ONLY the JSON array. No markdown. Escape internal quotes as \\\" and newlines as \\\\n."
        return prompt

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
        return result  # Send all topics
    
    @staticmethod
    def _clean_markdown(text: str) -> str:
        """Strip AI markdown noise (**bold**, *italic*, ## headers) from answer text."""
        if not isinstance(text, str):
            return text
        # Remove bold: **text** or __text__
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text, flags=re.DOTALL)
        text = re.sub(r'__(.+?)__', r'\1', text, flags=re.DOTALL)
        # Remove italic: *text* or _text_  (single star/underscore)
        text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', text, flags=re.DOTALL)
        text = re.sub(r'(?<!_)_(?!_)(.+?)(?<!_)_(?!_)', r'\1', text, flags=re.DOTALL)
        # Remove markdown headers (## Step 1  → Step 1)
        text = re.sub(r'^#{1,6}\s*', '', text, flags=re.MULTILINE)
        # Remove horizontal rules
        text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
        # Collapse 3+ consecutive blank lines to 2
        text = re.sub(r'\n{3,}', '\n\n', text)
        # Decode any literal \uXXXX unicode escape sequences left by the AI (e.g. \u2192 → →)
        text = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), text)
        return text.strip()

    @staticmethod
    def _remove_unit_references(text: str) -> str:
        """Remove any phrases that reference unit numbers from question/answer text."""
        if not isinstance(text, str):
            return text
        # Remove phrases like "In Unit 1,", "As discussed in Unit 2", "According to Unit 3", etc.
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
        # Clean up any double spaces left behind
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
        # Find the last complete object — look for the last '}' before any truncation
        last_brace = text.rfind('}')
        if last_brace == -1:
            return text
        truncated = text[:last_brace + 1]
        # Strip trailing comma if present then close array
        truncated = truncated.rstrip().rstrip(',')
        return truncated + "\n]"

    def _parse_questions(self, content: str, part: Dict, has_cdap: bool = False) -> List[Dict]:
        marks = part.get("marksPerQuestion", 2)

        def _finalise(questions: list) -> list:
            # Filter out non-dict entries — json-repair can return strings for malformed objects
            questions = [q for q in questions if isinstance(q, dict)]
            for q in questions:
                if "marks" not in q:
                    q["marks"] = marks
                if has_cdap and "cdap_part" not in q:
                    q["cdap_part"] = 1
            return self._clean_questions(questions)

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
                "answer": "Please configure an AI API key (GROQ_API_KEY, CEREBRAS_API_KEY, or OPENROUTER_API_KEY) in backend-python/.env to generate actual questions."
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
        cdap_units: Optional[List[Dict]] = None
    ) -> Dict[str, List[Dict]]:
        """Generate questions for all parts"""
        result = {}
        total_start = time.time()

        _log("QB", "=" * 56)
        _log("QB", f"🎓  Starting full question bank generation")
        _log("QB", f"    Subject : {subject_name}")
        _log("QB", f"    Parts   : {len(parts)} ({', '.join(p.get('partName', '?') for p in parts)})")
        primary_model = self.provider_chain[0]["model"] if self.provider_chain else "none"
        _log("QB", f"    Provider: {self.provider.upper()} | Model: {primary_model}")
        _log("QB", "=" * 56)

        for i, part in enumerate(parts, 1):
            part_name = part.get("partName", "Part")
            part_start = time.time()
            _log("QB", f"[{i}/{len(parts)}] Starting {part_name} ...")
            questions = await self.generate_questions(syllabus_units, part, subject_name, cdap_units)
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


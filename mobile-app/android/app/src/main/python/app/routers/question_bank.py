from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import uuid
import os
import shutil
import tempfile
import logging

logger = logging.getLogger(__name__)

from ..database import get_db
from ..models import QuestionBank, QuestionPattern, Subject, Syllabus, User, UserRole, StaffAssignment, CDAP
from ..models.question_bank import QuestionBankStatus
from ..schemas import (
    GenerateQuestionsRequest, GenerateFromResponseRequest, UpdatePatternRequest, UpdateStatusRequest, UpdateQuestionsRequest,
    QuestionPatternResponse, QuestionBankResponse, GenerateOfflineRequest, SyncOfflineRequest, ExportBytesRequest
)
from ..services.auth import get_current_user
from ..services.ai_service import ai_service, AIServiceError, AIService
from ..services.excel_service import excel_service
from ..services.email_service import send_share_notification


router = APIRouter(prefix="/question-bank", tags=["Question Bank"])

def normalize_parts(parts_raw) -> list:
    """Ensure all part configs are plain dicts with correct types for the AI service."""
    normalized = []
    if not parts_raw:
        return normalized

    import json
    if isinstance(parts_raw, str):
        try:
            parts_raw = json.loads(parts_raw)
        except Exception:
            return normalized

    if not isinstance(parts_raw, list):
        return normalized

    for p in parts_raw:
        if isinstance(p, str):
            try:
                p = json.loads(p)
            except Exception:
                continue

        if not isinstance(p, dict):
            if hasattr(p, 'model_dump'):
                p = p.dict()
            elif hasattr(p, 'dict'):
                p = p.dict()
            else:
                try:
                    p = dict(p)
                except Exception:
                    continue
        else:
            p = dict(p)  # copy

        # Serialize BTL enum values to plain strings
        btl = p.get('allowedBTLLevels', [])
        p['allowedBTLLevels'] = [b.value if hasattr(b, 'value') else str(b) for b in btl]

        # defaultBTL enum → string
        if p.get('defaultBTL') and hasattr(p['defaultBTL'], 'value'):
            p['defaultBTL'] = p['defaultBTL'].value

        # mcqCount: None → 0
        if p.get('mcqCount') is None:
            p['mcqCount'] = 0

        # Ensure required numeric fields have sensible defaults
        p.setdefault('questionCount', 5)
        p.setdefault('marksPerQuestion', 2)
        p.setdefault('totalMarks', p['questionCount'] * p['marksPerQuestion'])
        p.setdefault('partName', 'Part')

        normalized.append(p)
    return normalized


def _get_subject_descriptions(subject) -> dict:
    """Extract mapping of partName -> description from subject configuration."""
    if not subject or not subject.configuration:
        return {}
    
    cfg = subject.configuration
    if hasattr(cfg, 'model_dump'):
        cfg = cfg.dict()
    elif hasattr(cfg, 'dict'):
        cfg = cfg.dict()
        
    if not isinstance(cfg, dict):
        return {}
        
    parts = cfg.get('parts', [])
    if not isinstance(parts, list):
        return {}
    
    mapping = {}
    for p in parts:
        if hasattr(p, 'model_dump'):
            p_dict = p.dict()
        elif hasattr(p, 'dict'):
            p_dict = p.dict()
        elif isinstance(p, dict):
            p_dict = p
        else:
            try:
                p_dict = dict(p)
            except Exception:
                continue
                
        name = p_dict.get('partName')
        desc = p_dict.get('description')
        if name and desc:
            mapping[name] = desc
    return mapping


def _merge_subject_descriptions(subject, parts_data: list):
    """Merge descriptions from subject configuration into a list of normalized parts."""
    desc_map = _get_subject_descriptions(subject)
    if not desc_map:
        return
    
    for p in parts_data:
        p_name = p.get("partName")
        if p_name in desc_map:
            p["description"] = desc_map[p_name]


def _part_value(part, field, default=None):
    """Read a part field from either a validated Pydantic model or a plain dict."""
    if isinstance(part, dict):
        return part.get(field, default)
    return getattr(part, field, default)


def _resolve_owned_context(db: Session, user: User, data):
    """Fetch subject/syllabus/cdap/pattern with per-user ownership enforced.
    Shared by the Prompt Mode endpoints. Raises HTTPException on any access failure."""
    subject = db.query(Subject).filter(Subject.id == data.subject_id).first()
    if not subject or subject.created_by != user.id:
        raise HTTPException(status_code=404, detail="Subject not found")

    syllabus = db.query(Syllabus).filter(Syllabus.id == data.syllabus_id).first()
    if not syllabus or syllabus.subject_id != subject.id:
        raise HTTPException(status_code=404, detail="Syllabus not found")

    cdap = db.query(CDAP).filter(CDAP.subject_id == data.subject_id).first()
    pattern = db.query(QuestionPattern).filter(QuestionPattern.subject_id == data.subject_id).first()
    return subject, syllabus, cdap, pattern


def build_generation_plan(data, subject, syllabus, cdap, pattern):
    """
    Resolve parts/units/modes (read-only, deterministic) and build a Prompt-Mode plan.
    Returns (plan, parts_data) where plan = {part_name: {"part_config": {...}, "slots": [...]}}.
    Mirrors the 3-mode resolution in generate_questions() but builds slots via
    ai_service._build_part_slots instead of calling the AI — so both Prompt-Mode endpoints
    rebuild the identical plan from the same selection params (the plan never has to be trusted
    from the client).
    """
    cfg = subject.configuration
    if isinstance(cfg, str):
        import json
        try:
            cfg = json.loads(cfg)
        except Exception:
            cfg = {}
    parts = data.custom_parts or (
        pattern.parts if pattern else cfg.get('parts', []) if cfg else []
    )
    if not parts:
        raise HTTPException(status_code=400, detail="No question pattern defined")
    parts_data = normalize_parts(parts)
    _merge_subject_descriptions(subject, parts_data)

    all_units = syllabus.units or []
    if data.selected_unit_ids:
        selected_units = [u for u in all_units if u.get('unitNumber') in data.selected_unit_ids]
        if not selected_units:
            raise HTTPException(status_code=400, detail="None of the selected units found in syllabus")
    else:
        selected_units = all_units

    unit_q_counts = data.unit_question_counts
    if not unit_q_counts and pattern and getattr(pattern, 'unit_question_counts', None):
        unit_q_counts = pattern.unit_question_counts
    unit_q_counts = unit_q_counts or {}

    unit_cfg = data.unit_configs
    if not unit_cfg and pattern and getattr(pattern, 'unit_configs', None):
        unit_cfg = pattern.unit_configs

    plan: dict = {}

    def _add(part_name, part_config, slots):
        if part_name not in plan:
            plan[part_name] = {"part_config": part_config, "slots": []}
        plan[part_name]["slots"].extend(slots)

    if unit_cfg:
        # ── INDIVIDUAL FULL CONFIG: each unit has its own PartConfiguration[] ──
        for unit in selected_units:
            unit_num_str = str(unit.get("unitNumber"))
            if unit_num_str not in unit_cfg:
                continue
            raw_unit_parts = unit_cfg[unit_num_str]
            lacks_mcq = {
                _part_value(rp, "partName"): True
                for rp in raw_unit_parts
                if _part_value(rp, "partName") and _part_value(rp, "mcqCount") is None
            }
            unit_parts = normalize_parts(raw_unit_parts)
            _merge_subject_descriptions(subject, unit_parts)
            global_mcq_map = {p["partName"]: p.get("mcqCount", 0) for p in parts_data}
            for up in unit_parts:
                if lacks_mcq.get(up["partName"]):
                    inherited = global_mcq_map.get(up["partName"], 0)
                    if inherited:
                        up["mcqCount"] = inherited
                _add(up["partName"], up, ai_service._build_part_slots(up, [unit]))

    elif unit_q_counts:
        # ── INDIVIDUAL MODE: per-unit per-part counts ──
        for part in parts_data:
            part_name = part["partName"]
            part_counts = unit_q_counts.get(part_name, {})

            unit_rows = []
            for unit in selected_units:
                unit_num = unit.get("unitNumber")
                count = part_counts.get(unit_num, part_counts.get(str(unit_num), 0)) if isinstance(part_counts, dict) else 0
                if count > 0:
                    unit_rows.append((unit, count))
            if not unit_rows:
                continue

            q_counts = [c for _, c in unit_rows]
            mcq_total = min(sum(q_counts), max(0, int(part.get("mcqCount", 0) or 0)))
            mcq_allocations = AIService._allocate_exact_counts(q_counts, mcq_total)

            orig_dist = part.get("btlDistribution") or {}
            allowed_levels = [lvl for lvl in (part.get("allowedBTLLevels") or []) if lvl in orig_dist]
            per_level_allocations = {}
            for level, level_count in orig_dist.items():
                if level_count and int(level_count) > 0 and (not allowed_levels or level in allowed_levels):
                    per_level_allocations[level] = AIService._allocate_exact_counts(q_counts, int(level_count))

            for idx, (unit, count) in enumerate(unit_rows):
                unit_btl_dist = {
                    level: alloc[idx] for level, alloc in per_level_allocations.items() if alloc[idx] > 0
                } or None
                unit_part_config = {
                    **part,
                    "questionCount": count,
                    "mcqCount": mcq_allocations[idx],
                    "btlDistribution": unit_btl_dist,
                }
                _add(part_name, part, ai_service._build_part_slots(unit_part_config, [unit]))

    else:
        # ── COMBINED MODE: even distribution across selected units ──
        for part in parts_data:
            _add(part["partName"], part, ai_service._build_part_slots(part, selected_units))

    return plan, parts_data


def _finalize_question_bank(db, user, subject, syllabus, pattern, cdap, parts_data, questions, include_answers=True):
    """Generate the Excel, persist the QuestionBank (auto-approved), and auto-email it.
    Shared by /generate and /generate-from-response."""
    excel_path = excel_service.generate_question_bank_excel(
        questions=questions,
        subject_name=subject.name,
        subject_code=subject.code,
        parts_config=parts_data,
        department=subject.department or "CSE",
        semester=subject.semester or 1,
        has_cdap=cdap is not None,
        include_answers=include_answers
    )

    qb = QuestionBank(
        id=str(uuid.uuid4()),
        subject_id=subject.id,
        syllabus_id=syllabus.id,
        pattern_id=pattern.id if pattern else None,
        title=f"{subject.code} Question Bank",
        # Persist include_answers so re-download / edit regenerate the Excel in the same mode
        questions={"parts": questions, "include_answers": include_answers},
        status=QuestionBankStatus.APPROVED,
        generated_by=user.id,
        excel_path=excel_path
    )
    db.add(qb)
    db.commit()
    db.refresh(qb)

    try:
        send_share_notification(
            recipients=[user.email],
            bank_title=f"{subject.code} Question Bank",
            subject_name=subject.name,
            subject_code=subject.code,
            sender_name="Krish Academia",
            excel_path=excel_path
        )
    except Exception as e:
        print(f"[QB] ⚠️ Failed to auto-email generated question bank to {user.email}: {e}")

    return qb

@router.get("", response_model=List[QuestionBankResponse])
async def get_all_question_banks(
    status: str = None,
    subject_id: str = None,
    own_only: bool = True,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    query = db.query(QuestionBank).outerjoin(User, QuestionBank.generated_by == User.id)

    if status:
        query = query.filter(QuestionBank.status == status)
    if subject_id:
        query = query.filter(QuestionBank.subject_id == subject_id)

    # Per-user isolation: a user only ever sees the question banks they generated.
    # The own_only flag is intentionally ignored — scoping is always enforced.
    query = query.filter(QuestionBank.generated_by == user.id)

    banks = query.order_by(QuestionBank.created_at.desc()).all()
    
    # Add staff names
    result = []
    for bank in banks:
        bank_dict = QuestionBankResponse.from_orm(bank).dict()
        if bank.generated_by:
            creator = db.query(User).filter(User.id == bank.generated_by).first()
            if creator:
                bank_dict['generated_by_name'] = creator.name
        result.append(bank_dict)
    
    return result

@router.get("/pattern/{subject_id}", response_model=QuestionPatternResponse)
async def get_pattern(
    subject_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    # Ownership gate: the subject must belong to the current user
    owned_subject = db.query(Subject).filter(
        Subject.id == subject_id, Subject.created_by == user.id
    ).first()
    if not owned_subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    pattern = db.query(QuestionPattern).filter(QuestionPattern.subject_id == subject_id).first()
    if not pattern:
        # Fall back to subject.configuration so pages stay in sync even before
        # a dedicated pattern row has been created
        subject = owned_subject
        if subject and subject.configuration and subject.configuration.get("parts"):
            # Synthesize a pattern-like response from the subject configuration
            return {
                "id": f"subject-{subject_id}",
                "subject_id": subject_id,
                "parts": subject.configuration["parts"],
                "is_active": True,
                "notes": None,
                "unit_question_counts": None,
                "unit_configs": None,
            }
        raise HTTPException(status_code=404, detail="Pattern not found")
    return pattern


@router.put("/pattern/{subject_id}", response_model=QuestionPatternResponse)
async def update_pattern(
    subject_id: str,
    data: UpdatePatternRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    # Check subject exists AND belongs to the current user
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject or subject.created_by != user.id:
        raise HTTPException(status_code=404, detail="Subject not found")
    
    # Get or create pattern
    pattern = db.query(QuestionPattern).filter(QuestionPattern.subject_id == subject_id).first()
    
    parts_data = [p.dict() if hasattr(p, 'model_dump') else p for p in data.parts]
    
    # Convert unit_configs values (lists of PartConfiguration) to plain dicts
    unit_configs_data = None
    if data.unit_configs:
        unit_configs_data = {
            k: [p.dict() if hasattr(p, 'model_dump') else p for p in v]
            for k, v in data.unit_configs.items()
        }
    
    if pattern:
        pattern.parts = parts_data
        pattern.is_active = data.is_active
        pattern.notes = data.notes
        pattern.unit_question_counts = data.unit_question_counts
        pattern.unit_configs = unit_configs_data
    else:
        pattern = QuestionPattern(
            id=str(uuid.uuid4()),
            subject_id=subject_id,
            parts=parts_data,
            is_active=data.is_active,
            notes=data.notes,
            unit_question_counts=data.unit_question_counts,
            unit_configs=unit_configs_data,
            created_by=user.id
        )
        db.add(pattern)
    
    db.commit()
    db.refresh(pattern)
    return pattern

@router.post("/generate", response_model=QuestionBankResponse)
async def generate_questions(
    data: GenerateQuestionsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    # Get subject (must belong to the current user)
    subject = db.query(Subject).filter(Subject.id == data.subject_id).first()
    if not subject or subject.created_by != user.id:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Get syllabus (must belong to the same owned subject)
    syllabus = db.query(Syllabus).filter(Syllabus.id == data.syllabus_id).first()
    if not syllabus or syllabus.subject_id != subject.id:
        raise HTTPException(status_code=404, detail="Syllabus not found")
    
    # Get CDAP for Part 1/Part 2 topic segregation
    cdap = db.query(CDAP).filter(CDAP.subject_id == data.subject_id).first()
    cdap_units = cdap.units if cdap else None
    
    # Get pattern
    pattern = db.query(QuestionPattern).filter(QuestionPattern.subject_id == data.subject_id).first()
    cfg = subject.configuration
    if isinstance(cfg, str):
        import json
        try:
            cfg = json.loads(cfg)
        except Exception:
            cfg = {}
    parts = data.custom_parts or (pattern.parts if pattern else cfg.get('parts', []) if cfg else [])
    
    if not parts:
        raise HTTPException(status_code=400, detail="No question pattern defined")
    
    parts_data = normalize_parts(parts)
    _merge_subject_descriptions(subject, parts_data)

    # Log normalized parts for debugging
    print("[QB] Normalized parts config:")
    for p in parts_data:
        print(f"  [{p['partName']}] count={p['questionCount']} marks={p['marksPerQuestion']} "
              f"btl={p['allowedBTLLevels']} mcq={p['mcqCount']}")

    # Filter syllabus units by selected unit IDs (if provided)
    all_units = syllabus.units or []
    if data.selected_unit_ids:
        selected_units = [
            u for u in all_units
            if u.get('unitNumber') in data.selected_unit_ids
        ]
        if not selected_units:
            raise HTTPException(status_code=400, detail="None of the selected units found in syllabus")
        print(f"[QB] Unit filter: {len(selected_units)}/{len(all_units)} units selected "
              f"(units: {[u.get('unitNumber') for u in selected_units]})")
    else:
        selected_units = all_units
        print(f"[QB] Using all {len(all_units)} units")

    unit_q_counts = data.unit_question_counts
    # Auto-use pattern's stored per-unit counts when not explicitly provided in the request
    if not unit_q_counts and pattern and getattr(pattern, 'unit_question_counts', None):
        unit_q_counts = pattern.unit_question_counts
    unit_q_counts = unit_q_counts or {}

    # Resolve unit_configs (full per-unit PartConfiguration[])
    unit_cfg = data.unit_configs
    if not unit_cfg and pattern and getattr(pattern, 'unit_configs', None):
        unit_cfg = pattern.unit_configs

    try:
        if unit_cfg:
            # ── INDIVIDUAL FULL CONFIG: each unit has its own complete PartConfiguration[] ──
            print("[QB] Mode: INDIVIDUAL FULL CONFIG (per-unit parts)")
            questions: dict = {}

            for unit in selected_units:
                unit_num_str = str(unit.get("unitNumber"))
                if unit_num_str not in unit_cfg:
                    print(f"[QB]   Unit {unit_num_str}: excluded by user")
                    continue  # user deleted/excluded this unit

                raw_unit_parts = unit_cfg[unit_num_str]
                # Identify which parts in the raw unit config actually lack mcqCount (i.e. is undefined/None)
                lacks_mcq = {}
                for rp in raw_unit_parts:
                    p_name = _part_value(rp, "partName")
                    if p_name and _part_value(rp, "mcqCount") is None:
                        lacks_mcq[p_name] = True

                unit_parts = normalize_parts(raw_unit_parts)
                _merge_subject_descriptions(subject, unit_parts)

                # Inherit mcqCount from global parts config ONLY when per-unit config lacks it entirely
                global_mcq_map = {p["partName"]: p.get("mcqCount", 0) for p in parts_data}
                for up in unit_parts:
                    p_name = up["partName"]
                    if lacks_mcq.get(p_name):
                        inherited = global_mcq_map.get(p_name, 0)
                        if inherited:
                            up["mcqCount"] = inherited
                            print(f"[QB]   Inherited mcqCount={inherited} for {p_name} from global config")

                print(f"[QB]   Unit {unit_num_str}: {len(unit_parts)} parts")
                for p in unit_parts:
                    print(f"     [{p['partName']}] count={p['questionCount']} marks={p['marksPerQuestion']} "
                          f"btl={p['allowedBTLLevels']} mcq={p['mcqCount']}")

                unit_questions = await ai_service.generate_full_question_bank(
                    syllabus_units=[unit],
                    parts=unit_parts,
                    subject_name=subject.name,
                    cdap_units=cdap_units,
                    include_answers=data.include_answers,
                )
                for part_name, qs in unit_questions.items():
                    for q in qs:
                        q.setdefault("unit", unit.get("unitNumber"))
                    questions.setdefault(part_name, []).extend(qs)

        elif unit_q_counts:
            # ── INDIVIDUAL MODE: generate per-unit per-part, combine by part ──
            print("[QB] Mode: INDIVIDUAL (unit-wise question counts)")
            questions: dict = {}

            for part in parts_data:
                part_name = part["partName"]
                part_counts = unit_q_counts.get(part_name, {})
                part_results: list = []

                unit_rows = []
                for unit in selected_units:
                    unit_num = unit.get("unitNumber")
                    if isinstance(part_counts, dict):
                        count = part_counts.get(unit_num, part_counts.get(str(unit_num), 0))
                    else:
                        count = 0
                    if count > 0:
                        unit_rows.append((unit, count))

                if not unit_rows:
                    questions[part_name] = part_results
                    print(f"[QB]   {part_name} total: {len(part_results)} questions")
                    continue

                q_counts = [count for _, count in unit_rows]
                mcq_total = min(sum(q_counts), max(0, int(part.get("mcqCount", 0) or 0)))
                mcq_allocations = AIService._allocate_exact_counts(q_counts, mcq_total)

                orig_dist = part.get("btlDistribution") or {}
                allowed_levels = [lvl for lvl in (part.get("allowedBTLLevels") or []) if lvl in orig_dist]
                per_level_allocations = {}
                for level, level_count in orig_dist.items():
                    if level_count and int(level_count) > 0 and (not allowed_levels or level in allowed_levels):
                        per_level_allocations[level] = AIService._allocate_exact_counts(q_counts, int(level_count))

                for idx, (unit, count) in enumerate(unit_rows):
                    unit_num = unit.get("unitNumber")
                    unit_btl_dist = {
                        level: alloc[idx]
                        for level, alloc in per_level_allocations.items()
                        if alloc[idx] > 0
                    } or None

                    unit_part_config = {
                        **part,
                        "questionCount": count,
                        "mcqCount": mcq_allocations[idx],
                        "btlDistribution": unit_btl_dist,
                    }
                    print(f"[QB]   {part_name} | Unit {unit_num}: {count} questions | "
                          f"mcq={mcq_allocations[idx]} btlDist={unit_btl_dist}")

                    unit_questions = await ai_service.generate_questions(
                        syllabus_units=[unit],
                        part_config=unit_part_config,
                        subject_name=subject.name,
                        cdap_units=cdap_units,
                        include_answers=data.include_answers,
                    )
                    for q in unit_questions:
                        q.setdefault("unit", unit_num)
                    part_results.extend(unit_questions)

                questions[part_name] = part_results
                print(f"[QB]   {part_name} total: {len(part_results)} questions")
        else:
            # ── COMBINED MODE: even distribution across selected units ──
            print("[QB] Mode: COMBINED (even distribution across selected units)")
            questions = await ai_service.generate_full_question_bank(
                syllabus_units=selected_units,
                parts=parts_data,
                subject_name=subject.name,
                cdap_units=cdap_units,
                include_answers=data.include_answers,
            )

    except AIServiceError as e:
        print(f"[QB] ⚠️  AIServiceError: {e}")
        raise HTTPException(
            status_code=503,
            detail=(
                "Sorry, all AI providers are currently unavailable or rate-limited. "
                "We were unable to generate the question bank. "
                "Please try again in a few minutes or try again tomorrow."
            ),
        )

    # Generate Excel, persist, and auto-email (shared with Prompt Mode)
    qb = _finalize_question_bank(db, user, subject, syllabus, pattern, cdap, parts_data, questions,
                                 include_answers=data.include_answers)
    return qb


# ── Prompt Mode (copy-paste fallback for API limits) ────────────────────────────

@router.post("/generate-prompt")
async def generate_prompt(
    data: GenerateQuestionsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Build a prompt the user can copy into any external AI. No AI provider is called.
    - Default: ONE consolidated prompt for the whole bank.
    - split_by_unit=True: one prompt PER UNIT so web AIs don't truncate large replies.
    """
    subject, syllabus, cdap, pattern = _resolve_owned_context(db, user, data)
    plan, _parts_data = build_generation_plan(data, subject, syllabus, cdap, pattern)

    total_questions = sum(len(e["slots"]) for e in plan.values())
    if total_questions == 0:
        raise HTTPException(
            status_code=400,
            detail="No questions to generate. Check your pattern counts and selected units."
        )

    cdap_units = cdap.units if cdap else None
    num_parts = sum(1 for e in plan.values() if e["slots"])

    if data.split_by_unit:
        # Build a per-unit prompt. Unit titles come from the syllabus.
        unit_titles = {u.get("unitNumber"): u.get("title", "") for u in (syllabus.units or [])}
        per_unit = ai_service.split_plan_by_unit(plan)
        unit_prompts = []
        for unit_num, sub_plan in per_unit.items():
            u_total = sum(len(e["slots"]) for e in sub_plan.values())
            title = unit_titles.get(unit_num, "")
            label = f"Unit {unit_num}" + (f": {title}" if title else "")
            sub_cdap = [u for u in cdap_units if u.get("unit_number") == unit_num] if cdap_units else None
            unit_prompts.append({
                "unit_number": unit_num,
                "unit_title": title,
                "total_questions": u_total,
                "prompt": ai_service.build_manual_prompt(
                    sub_plan, subject.name, sub_cdap,
                    include_answers=data.include_answers, scope_label=label
                ),
            })
        return {
            "split_by_unit": True,
            "total_questions": total_questions,
            "num_parts": num_parts,
            "unit_prompts": unit_prompts,
        }

    prompt = ai_service.build_manual_prompt(plan, subject.name, cdap_units,
                                            include_answers=data.include_answers)
    return {
        "split_by_unit": False,
        "prompt": prompt,
        "total_questions": total_questions,
        "num_parts": num_parts,
    }


@router.post("/generate-from-response", response_model=QuestionBankResponse)
async def generate_from_response(
    data: GenerateFromResponseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Parse responses the user pasted back from an external AI (Prompt Mode) and produce
    the Excel + question bank. The plan is rebuilt server-side from the same selection params,
    so the pasted text is the only untrusted input.
    - Single flow: response_text (one JSON object for the whole bank).
    - Split flow: unit_responses ({ unitNumber -> JSON for that unit }), merged by part.
    """
    subject, syllabus, cdap, pattern = _resolve_owned_context(db, user, data)
    plan, parts_data = build_generation_plan(data, subject, syllabus, cdap, pattern)

    if sum(len(e["slots"]) for e in plan.values()) == 0:
        raise HTTPException(
            status_code=400,
            detail="No questions to generate. Check your pattern counts and selected units."
        )

    has_cdap = cdap is not None

    if data.unit_responses:
        # ── Split flow: parse each unit's response against its sub-plan, then merge by part ──
        per_unit = ai_service.split_plan_by_unit(plan)
        merged: dict = {}
        missing = []
        parsed_any = False
        for unit_num, sub_plan in per_unit.items():
            resp = data.unit_responses.get(str(unit_num)) or data.unit_responses.get(unit_num)
            if not resp or not resp.strip():
                missing.append(unit_num)
                continue
            try:
                unit_questions = ai_service.parse_manual_response(resp, sub_plan, has_cdap=has_cdap)
            except AIServiceError as e:
                raise HTTPException(status_code=422, detail=f"Unit {unit_num}: {e}")
            parsed_any = True
            for part_name, qs in unit_questions.items():
                merged.setdefault(part_name, []).extend(qs)

        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"Missing pasted response for unit(s): {', '.join('Unit ' + str(m) for m in missing)}. "
                       "Paste each unit's AI response before generating."
            )
        if not parsed_any:
            raise HTTPException(status_code=422, detail="No unit responses were provided.")
        questions = merged
    else:
        # ── Single flow ──
        if not data.response_text or not data.response_text.strip():
            raise HTTPException(status_code=422, detail="Please paste the AI's JSON response.")
        try:
            questions = ai_service.parse_manual_response(
                data.response_text, plan, has_cdap=has_cdap
            )
        except AIServiceError as e:
            raise HTTPException(status_code=422, detail=str(e))

    qb = _finalize_question_bank(db, user, subject, syllabus, pattern, cdap, parts_data, questions,
                                 include_answers=data.include_answers)
    return qb

# ── Image upload ──────────────────────────────────────────────────────────────

@router.post("/upload-image")
async def upload_question_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """Upload an image for a question to local storage. Returns a URL to reference in imageData."""
    allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use JPEG, PNG, GIF, or WebP.")

    ext = os.path.splitext(file.filename or ".png")[1] or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"
    
    # Save directly to data/images folder
    from ..config import settings
    dest_dir = settings.upload_images_dir

    dest = os.path.join(dest_dir, filename)

    try:
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
            
        # Return URL pointing to static files mount
        # e.g., /api/static/images/12345.png
        url = f"/api/static/images/{filename}"
        return {"url": url}
    except Exception as e:
        logger.error(f"Failed to save image: {e}")
        raise HTTPException(status_code=500, detail="Failed to save image locally.")


@router.put("/{qb_id}/questions", response_model=QuestionBankResponse)
async def update_questions(
    qb_id: str,
    data: UpdateQuestionsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Update the questions in a question bank (creator or HOD only)."""
    qb = db.query(QuestionBank).filter(QuestionBank.id == qb_id).first()
    if not qb:
        raise HTTPException(status_code=404, detail="Question bank not found")

    # Per-user isolation: only the creator may edit their question bank
    if qb.generated_by != user.id:
        raise HTTPException(status_code=404, detail="Question bank not found")

    # Save updated questions
    questions_dict = data.questions if isinstance(data.questions, dict) else dict(data.questions)
    qb.questions = questions_dict

    # Regenerate Excel
    try:
        subject = db.query(Subject).filter(Subject.id == qb.subject_id).first()
        parts_data: list = []

        # Try to load parts config from the associated pattern
        if qb.pattern_id:
            pattern = db.query(QuestionPattern).filter(QuestionPattern.id == qb.pattern_id).first()
            if pattern and pattern.parts:
                parts_data = normalize_parts(pattern.parts)

        # Fall back to subject configuration
        if not parts_data and subject and subject.configuration:
            cfg = subject.configuration
            if isinstance(cfg, str):
                import json
                try:
                    cfg = json.loads(cfg)
                except Exception:
                    cfg = {}
            if hasattr(cfg, 'model_dump'):
                cfg = cfg.dict()
            elif hasattr(cfg, 'dict'):
                cfg = cfg.dict()
            parts_data = normalize_parts(cfg.get('parts', []))

        if not parts_data:
            parts_data = []

        # Strip imageData (base64 blobs) before passing to excel service — handled separately
        parts_questions: dict = questions_dict.get('parts', {})
        # Preserve the original Question/With-Answer mode (default True for legacy banks)
        include_answers = questions_dict.get('include_answers', True)

        # Delete old Excel file if it exists
        if qb.excel_path and os.path.exists(qb.excel_path):
            try:
                os.remove(qb.excel_path)
            except OSError:
                pass

        new_excel_path = excel_service.generate_question_bank_excel(
            questions=parts_questions,
            subject_name=subject.name if subject else "Unknown",
            subject_code=subject.code if subject else "SUBJ",
            parts_config=parts_data,
            department=subject.department or "CSE" if subject else "CSE",
            semester=subject.semester or 1 if subject else 1,
            include_answers=include_answers,
        )
        qb.excel_path = new_excel_path
    except Exception:
        # Excel regeneration is best-effort; don't fail the whole update
        pass

    db.commit()
    db.refresh(qb)
    return qb

@router.get("/{qb_id}", response_model=QuestionBankResponse)
async def get_question_bank(
    qb_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    qb = db.query(QuestionBank).filter(QuestionBank.id == qb_id).first()
    if not qb or qb.generated_by != user.id:
        raise HTTPException(status_code=404, detail="Question bank not found")
    return qb

@router.get("/{qb_id}/download")
async def download_excel(
    qb_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    qb = db.query(QuestionBank).filter(QuestionBank.id == qb_id).first()
    if not qb or qb.generated_by != user.id:
        raise HTTPException(status_code=404, detail="Question bank not found")

    excel_path = qb.excel_path
    if not excel_path or not os.path.exists(excel_path):
        # Regenerate the Excel file on the fly if it was deleted from ephemeral disk
        subject = db.query(Subject).filter(Subject.id == qb.subject_id).first()
        cdap = db.query(CDAP).filter(CDAP.subject_id == qb.subject_id).first()
        
        # Determine parts_raw, fallback to subject pattern if qb.pattern_id is missing/empty
        parts_raw = []
        pattern = None
        if qb.pattern_id:
            pattern = db.query(QuestionPattern).filter(QuestionPattern.id == qb.pattern_id).first()
        if not pattern and qb.subject_id:
            pattern = db.query(QuestionPattern).filter(QuestionPattern.subject_id == qb.subject_id).first()
            
        if pattern and pattern.parts:
            parts_raw = pattern.parts
        
        if not parts_raw and subject and subject.configuration:
            cfg = subject.configuration
            if isinstance(cfg, str):
                import json
                try:
                    cfg = json.loads(cfg)
                except Exception:
                    cfg = {}
            parts_raw = cfg.get('parts', []) if isinstance(cfg, dict) else []
            
        parts_data = normalize_parts(parts_raw)
        
        # Safely deserialize questions_data if it's a JSON string
        questions_data = qb.questions or {}
        if isinstance(questions_data, str):
            try:
                import json
                questions_data = json.loads(questions_data)
            except Exception:
                pass
                
        parts_questions = {}
        include_answers = True
        if isinstance(questions_data, dict):
            parts_questions = questions_data.get("parts", {})
            include_answers = questions_data.get("include_answers", True)
            if not parts_questions:
                parts_questions = questions_data

        try:
            excel_path = excel_service.generate_question_bank_excel(
                questions=parts_questions,
                subject_name=subject.name if subject else "Unknown",
                subject_code=subject.code if subject else "SUBJ",
                parts_config=parts_data,
                department=subject.department or "CSE" if subject else "CSE",
                semester=subject.semester or 1 if subject else 1,
                has_cdap=cdap is not None,
                include_answers=include_answers
            )
            qb.excel_path = excel_path
            db.add(qb)
            db.commit()
        except Exception as e:
            print(f"[QB Download] Error regenerating Excel: {e}")
            raise HTTPException(
                status_code=404, 
                detail=f"Excel file not found and could not be regenerated: {str(e)}"
            )
    
    return FileResponse(
        excel_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=os.path.basename(excel_path)
    )

@router.post("/{qb_id}/share")
async def share_question_bank(
    qb_id: str,
    data: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Share a question bank with one or more recipients.

    Body: { "recipient_emails": ["a@x.com", "b@x.com"] }

    Steps:
      1. Verify the caller is the creator, HOD, or Faculty
      2. Send a styled email to each recipient with the Excel attached
      3. Return { shared_with, email_result }
    """
    qb = db.query(QuestionBank).filter(QuestionBank.id == qb_id).first()
    if not qb:
        raise HTTPException(status_code=404, detail="Question bank not found")

    # Per-user isolation: only the creator may share their question bank
    if qb.generated_by != user.id:
        raise HTTPException(status_code=404, detail="Question bank not found")

    recipient_emails: list = data.get("recipient_emails", [])
    if not recipient_emails:
        raise HTTPException(status_code=400, detail="No recipient emails provided")

    # Get subject info
    subject = db.query(Subject).filter(Subject.id == qb.subject_id).first()
    subject_name = subject.name if subject else "Unknown Subject"
    subject_code = subject.code if subject else "SUBJ"

    # Get sender name
    sender = db.query(User).filter(User.id == user.id).first()
    sender_name = sender.name if sender else "A colleague"

    # ── Step 1: Send email notifications ─────────────────────────────────────
    email_result = send_share_notification(
        recipients=recipient_emails,
        bank_title=qb.title,
        subject_name=subject_name,
        subject_code=subject_code,
        sender_name=sender_name,
        excel_path=qb.excel_path if qb.excel_path and os.path.exists(qb.excel_path) else None,
    )

    return {
        "message": "Question bank shared successfully",
        "shared_with": email_result.get("sent", []),
        "failed": email_result.get("failed", []),
        "skipped_email": email_result.get("skipped", False),
        "bank_title": qb.title,
        "subject": f"{subject_code} — {subject_name}",
    }


@router.delete("/{qb_id}")
async def delete_question_bank(
    qb_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    qb = db.query(QuestionBank).filter(QuestionBank.id == qb_id).first()
    if not qb:
        raise HTTPException(status_code=404, detail="Question bank not found")
    
    # Per-user isolation: only the creator may delete their question bank
    if qb.generated_by != user.id:
        raise HTTPException(status_code=404, detail="Question bank not found")
    
    db.delete(qb)
    db.commit()
    return {"message": "Question bank deleted"}

@router.post("/generate-offline")
async def generate_offline(
    data: GenerateOfflineRequest,
    user: User = Depends(get_current_user)
):
    try:
        syllabus_units = data.syllabus_units
        parts_data = normalize_parts(data.parts)
        
        questions = await ai_service.generate_full_question_bank(
            syllabus_units=syllabus_units,
            parts=parts_data,
            subject_name=data.subject_name,
            cdap_units=data.cdap_units,
            include_answers=data.include_answers,
            preferred_provider=data.preferred_provider,
            custom_keys=data.custom_keys,
            custom_models=data.custom_models,
            use_local_models=data.use_local_models
        )
        return {"success": True, "questions": questions}
    except Exception as e:
        print(f"[QB Offline] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sync-offline", response_model=QuestionBankResponse)
async def sync_offline(
    data: SyncOfflineRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    subject = db.query(Subject).filter(Subject.id == data.subject_id).first()
    if not subject or subject.created_by != user.id:
        raise HTTPException(status_code=404, detail="Subject not found")

    syllabus = db.query(Syllabus).filter(Syllabus.id == data.syllabus_id).first()
    if not syllabus or syllabus.subject_id != subject.id:
        raise HTTPException(status_code=404, detail="Syllabus not found")
        
    cdap = db.query(CDAP).filter(CDAP.subject_id == data.subject_id).first()
    
    pattern = None
    if data.pattern_id:
        pattern = db.query(QuestionPattern).filter(QuestionPattern.id == data.pattern_id).first()
    if not pattern:
        pattern = db.query(QuestionPattern).filter(QuestionPattern.subject_id == data.subject_id).first()
        
    parts_raw = []
    if pattern and pattern.parts:
        parts_raw = pattern.parts
    if not parts_raw and subject.configuration:
        cfg = subject.configuration
        if isinstance(cfg, str):
            import json
            try:
                cfg = json.loads(cfg)
            except Exception:
                cfg = {}
        parts_raw = cfg.get('parts', []) if isinstance(cfg, dict) else []
        
    parts_data = normalize_parts(parts_raw)
    _merge_subject_descriptions(subject, parts_data)
    
    excel_path = excel_service.generate_question_bank_excel(
        questions=data.questions,
        subject_name=subject.name,
        subject_code=subject.code,
        parts_config=parts_data,
        department=subject.department or "CSE",
        semester=subject.semester or 1,
        has_cdap=cdap is not None,
        include_answers=data.include_answers
    )
    
    qb = QuestionBank(
        id=str(uuid.uuid4()),
        subject_id=data.subject_id,
        syllabus_id=data.syllabus_id,
        pattern_id=pattern.id if pattern else None,
        title=data.title,
        questions={"parts": data.questions, "include_answers": data.include_answers},
        status=QuestionBankStatus.APPROVED,
        generated_by=user.id,
        excel_path=excel_path
    )
    db.add(qb)
    db.commit()
    db.refresh(qb)
    
    try:
        send_share_notification(
            recipients=[user.email],
            bank_title=data.title,
            subject_name=subject.name,
            subject_code=subject.code,
            sender_name="Krish Academia",
            excel_path=excel_path
        )
    except Exception as e:
        print(f"[QB Sync] Failed to email synced bank: {e}")
        
    return qb

from fastapi.responses import Response

@router.post("/export-bytes")
async def export_bytes(
    data: ExportBytesRequest,
    user: User = Depends(get_current_user)
):
    try:
        parts_data = normalize_parts(data.parts_config)
        
        excel_path = excel_service.generate_question_bank_excel(
            questions=data.questions,
            subject_name=data.subject_name,
            subject_code=data.subject_code,
            parts_config=parts_data,
            department="CSE",
            semester=1,
            has_cdap=False,
            include_answers=data.include_answers
        )
        
        if excel_path and os.path.exists(excel_path):
            with open(excel_path, "rb") as f:
                content = f.read()
            try:
                os.remove(excel_path)
            except:
                pass
            return Response(
                content=content,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f"attachment; filename={data.subject_code}_Question_Bank.xlsx"
                }
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to compile offline Excel file.")
    except Exception as e:
        print(f"[QB Export] Error compiling Excel bytes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

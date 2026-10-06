import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { subjectsApi, syllabusApi, questionBankApi, staffApi } from '../lib/api';
import { useAuthStore, useUiStore } from '../lib/store';
import {
  Sparkles,
  Loader2,
  Download,
  Eye,
  Send,
  Trash2,
  BookOpen,
  AlertCircle,
  ChevronDown,
  Settings,
  Save,
  Check,
  Pencil,
  X,
  Share2,
  Copy,
  ClipboardCheck,
  ClipboardPaste,
  FileText,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { Subject, Syllabus, QuestionBank, MySubjectAssignment, PartConfiguration, BloomLevel, ALL_BTL_LEVELS } from '../types';
import QuestionBankViewModal from '../components/QuestionBankViewModal';
import AILogosBackground from '../components/AILogosBackground';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import chatGptLogo from '../assets/AI LOGOS/chat_gpt.png';
import geminiLogo from '../assets/AI LOGOS/gemini.png';
import claudeLogo from '../assets/AI LOGOS/claude.png';
import deepseekLogo from '../assets/AI LOGOS/DeepSeek.png';
import grokLogo from '../assets/AI LOGOS/Grok.png';
import kimiLogo from '../assets/AI LOGOS/KIMI.png';
import qwenLogo from '../assets/AI LOGOS/qwen.png';

const AI_OPTIONS = [
  { name: 'ChatGPT', logo: chatGptLogo, url: 'https://chatgpt.com/' },
  { name: 'Gemini', logo: geminiLogo, url: 'https://gemini.google.com/app' },
  { name: 'Claude', logo: claudeLogo, url: 'https://claude.ai/new' },
  { name: 'DeepSeek', logo: deepseekLogo, url: 'https://chat.deepseek.com/' },
  { name: 'Grok', logo: grokLogo, url: 'https://x.com/i/grok' },
  { name: 'KIMI', logo: kimiLogo, url: 'https://kimi.moonshot.cn/' },
  { name: 'Qwen', logo: qwenLogo, url: 'https://chat.qwenlm.ai/' },
];

export default function QuestionBanks() {
  const { user } = useAuthStore();
  const { setGlobalLoading } = useUiStore();
  const isHOD = user?.role === 'HOD';
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [myAssignments, setMyAssignments] = useState<MySubjectAssignment[]>([]);
  const [syllabi, setSyllabi] = useState<Record<string, Syllabus>>({});
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [viewingBank, setViewingBank] = useState<QuestionBank | null>(null);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [selectedSubjectPattern, setSelectedSubjectPattern] = useState<any>(null);
  const [qbMode, setQbMode] = useState<'combined' | 'individual' | 'prompt'>('combined');
  // Within Prompt mode, which generation style to use (mirrors Combined/Individual)
  const [promptSubMode, setPromptSubMode] = useState<'combined' | 'individual'>('combined');
  // Global answer mode — applies to all 3 generation modes. Default Question (no answer key)
  // so the AI can use a larger chunk size (faster, fewer API calls).
  const [includeAnswers, setIncludeAnswers] = useState(false);
  // ── Prompt Mode (copy-paste fallback) state ──
  const [promptText, setPromptText] = useState('');
  const [promptResponse, setPromptResponse] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [parsingResponse, setParsingResponse] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  // Split-by-unit: default ON so large banks don't get truncated by web AIs
  const [splitByUnit, setSplitByUnit] = useState(true);
  // Per-unit prompts from the backend: [{ unit_number, unit_title, prompt, total_questions }]
  const [unitPrompts, setUnitPrompts] = useState<{ unit_number: number; unit_title: string; prompt: string; total_questions: number }[]>([]);
  // Per-unit pasted responses, keyed by unit number (as string)
  const [unitResponses, setUnitResponses] = useState<Record<string, string>>({});
  // Which unit's prompt was last copied (for per-card "Copied!" feedback)
  const [copiedUnit, setCopiedUnit] = useState<number | null>(null);
  // Recommendation popup when a single prompt is very large
  const [showSplitSuggestion, setShowSplitSuggestion] = useState(false);
  // Inline-editable copies of pattern data
  const [localParts, setLocalParts] = useState<PartConfiguration[]>([]);
  const [localUnitCfg, setLocalUnitCfg] = useState<Record<string, PartConfiguration[]>>({});
  const [patternDirty, setPatternDirty] = useState(false);
  const [patternSaving, setPatternSaving] = useState(false);
  const [patternSaved, setPatternSaved] = useState(false);
  const [isEditingPattern, setIsEditingPattern] = useState(false);
  const [btlCustomization, setBtlCustomization] = useState(false);
  const [btlWarning, setBtlWarning] = useState('');
  const [latestBankId, setLatestBankId] = useState<string | null>(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successBank, setSuccessBank] = useState<QuestionBank | null>(null);

  // Confirmation state for deleting question bank, etc.
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
    confirmText?: string;
    alertOnly?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });




  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!btlWarning) return;
    const timeout = setTimeout(() => setBtlWarning(''), 4000);
    return () => clearTimeout(timeout);
  }, [btlWarning]);

  // Invalidate and reset prompt mode states when prompt inputs change
  useEffect(() => {
    setPromptText('');
    setPromptResponse('');
    setUnitPrompts([]);
    setUnitResponses({});
  }, [
    promptSubMode,
    splitByUnit,
    includeAnswers,
    selectedUnitIds,
    selectedSubjectId
  ]);

  const loadData = async () => {
    try {
      const promises: Promise<any>[] = [
        syllabusApi.getAll(),
        questionBankApi.getAll({ own_only: true }),
        subjectsApi.getAll(),
      ];

      const results = await Promise.all(promises);
      const [syllabusRes, banksRes, subjectsRes] = results;

      const syllabusMap: Record<string, Syllabus> = {};
      syllabusRes.data.forEach((s: Syllabus) => { syllabusMap[s.subject_id] = s; });
      setSyllabi(syllabusMap);
      setQuestionBanks(banksRes.data);
      setSubjects(subjectsRes.data || []);

      try {
        const assignmentsRes = await staffApi.getMySubjects();
        setMyAssignments(assignmentsRes.data || []);
      } catch (err) {
        // Ignored
      }
    } catch (err: any) {
      console.error(err);
      if (!err.response) {
        setError('Server is unreachable. Please check your connection (Not fetchable).');
      } else if (err.response.status === 404) {
        setError('Data is currently empty or not found.');
      } else {
        setError(err.response?.data?.detail || err.message || 'Failed to load data.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSubjectId) {
      fetchSubjectPattern(selectedSubjectId);
      
      // Reset UI on explicitly changing subject
      setQbMode('combined');
      const syllabus = syllabi[selectedSubjectId];
      const syllabusUnits: any[] = syllabus?.units || [];
      if (syllabusUnits.length > 0) {
        setSelectedUnitIds(syllabusUnits.map((u: any) => u.unitNumber));
      } else {
        setSelectedUnitIds([]);
      }
    } else {
      setSelectedSubjectPattern(null);
    }
  }, [selectedSubjectId]);

  // Refetch pattern when window regains focus (e.g. user edited pattern in another tab)
  useEffect(() => {
    const handleFocus = () => {
      if (selectedSubjectId && !isEditingPattern && !patternDirty) {
        fetchSubjectPattern(selectedSubjectId);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [selectedSubjectId, isEditingPattern, patternDirty]);

  /**
   * Build a localUnitCfg from a parts array applied to every syllabus unit.
   * Mirrors initUnitConfigs in Patterns.tsx so both pages share the same defaults.
   * Per-unit mcqCount and btlDistribution are zeroed since they weren't explicitly customised.
   */
  const buildUnitCfgFromParts = (units: any[], parts: PartConfiguration[]): Record<string, PartConfiguration[]> => {
    const result: Record<string, PartConfiguration[]> = {};
    for (const unit of units) {
      result[String(unit.unitNumber)] = parts.map(p => ({ ...p, mcqCount: 0, btlDistribution: {} }));
    }
    return result;
  };

  /** Migrate legacy unit_question_counts into per-unit PartConfiguration arrays */
  const migrateUqcToUnitCfg = (units: any[], parts: PartConfiguration[], uqc: Record<string, Record<number, number>>): Record<string, PartConfiguration[]> => {
    const result: Record<string, PartConfiguration[]> = {};
    for (const unit of units) {
      result[String(unit.unitNumber)] = parts.map(p => {
        const count = (uqc[p.partName] ?? {})[unit.unitNumber] ?? p.questionCount;
        return { ...p, questionCount: count, totalMarks: count * p.marksPerQuestion };
      });
    }
    return result;
  };

  const applyPatternToLocalState = (pattern: any, syllabusUnits: any[]) => {
    // Deep copy pattern to prevent mutating selectedSubjectPattern by reference
    const copiedPattern = pattern ? JSON.parse(JSON.stringify(pattern)) : null;

    // Clamp mcqCount so it never exceeds questionCount (guards stale data)
    const loadedParts: PartConfiguration[] = copiedPattern?.parts
      ? copiedPattern.parts.map((p: any) => {
        const mcq = p.mcqCount ?? 0;
        return mcq > p.questionCount ? { ...p, mcqCount: 0 } : { ...p };
      })
      : [];
    setLocalParts(loadedParts);

    if (copiedPattern?.unit_configs && Object.keys(copiedPattern.unit_configs).length > 0) {
      // Full per-unit configs saved — use directly, clamping stale mcqCount
      setLocalUnitCfg(Object.fromEntries(
        Object.entries(copiedPattern.unit_configs).map(([k, v]) => [k, (v as any[]).map((p: any) => {
          const mcq = p.mcqCount ?? 0;
          return mcq > p.questionCount ? { ...p, mcqCount: 0 } : { ...p };
        })])
      ));
    } else if (copiedPattern?.unit_question_counts && Object.keys(copiedPattern.unit_question_counts).length > 0 && syllabusUnits.length > 0) {
      // Legacy counts — migrate to full per-unit format
      setLocalUnitCfg(migrateUqcToUnitCfg(syllabusUnits, loadedParts, copiedPattern.unit_question_counts));
    } else if (loadedParts.length > 0 && syllabusUnits.length > 0) {
      // Combined mode only — spread parts to every unit, zeroing per-unit mcq/btl
      setLocalUnitCfg(buildUnitCfgFromParts(syllabusUnits, loadedParts));
    } else {
      setLocalUnitCfg({});
    }

    setPatternDirty(false);
    setPatternSaved(false);
    setIsEditingPattern(false);
  };

  const fetchSubjectPattern = async (subjectId: string) => {
    let pattern: any = null;
    const syllabus = syllabi[subjectId];
    const syllabusUnits: any[] = syllabus?.units || [];
    try {
      const response = await questionBankApi.getPattern(subjectId);
      pattern = response.data;
      setSelectedSubjectPattern(JSON.parse(JSON.stringify(pattern)));
      applyPatternToLocalState(pattern, syllabusUnits);
    } catch (err) {
      console.error('Failed to fetch fresh pattern', err);
      const subject = subjects.find(s => s.id === subjectId);
      if (subject?.configuration) {
        pattern = subject.configuration;
        setSelectedSubjectPattern(JSON.parse(JSON.stringify(pattern)));
        applyPatternToLocalState(pattern, syllabusUnits);
      }
    }
  };

  const sanitizePartConfig = (p: PartConfiguration, includeBTLDist: boolean = true): any => {
    const qCount = String(p.questionCount) === '' ? 0 : Number(p.questionCount || 0);
    const marks = String(p.marksPerQuestion) === '' ? 0 : Number(p.marksPerQuestion || 0);
    const mcq = String(p.mcqCount) === '' ? 0 : Number(p.mcqCount || 0);
    const dist = (includeBTLDist && p.btlDistribution)
      ? Object.fromEntries(
        Object.entries(p.btlDistribution).map(([lvl, val]) => [
          lvl,
          String(val) === '' ? 0 : Number(val || 0),
        ])
      )
      : undefined;
    return {
      ...p,
      questionCount: qCount,
      marksPerQuestion: marks,
      totalMarks: qCount * marks,
      mcqCount: mcq,
      btlDistribution: dist,
    };
  };

  const saveLocalPattern = async () => {
    if (!selectedSubjectId || patternSaving) return;
    setPatternSaving(true);
    try {
      const hasUnitCfgs = Object.keys(localUnitCfg).length > 0;
      const sanitizedParts = localParts.map(p => sanitizePartConfig(p, btlCustomization));

      let unitCfgsToSave: Record<string, any> | null = null;
      if (hasUnitCfgs) {
        if (qbMode === 'combined') {
          const syllabusUnits: any[] = syllabi[selectedSubjectId]?.units || [];
          unitCfgsToSave = Object.fromEntries(
            syllabusUnits.map((unit: any) => {
              const key = String(unit.unitNumber);
              const existingParts = localUnitCfg[key] || [];
              return [key, localParts.map((p, i) => {
                const prev = existingParts[i];
                const pQCount = String(p.questionCount) === '' ? 0 : Number(p.questionCount);
                const prevMcq = String(prev?.mcqCount) === '' ? 0 : Number(prev?.mcqCount ?? 0);
                const mcq = Math.min(prevMcq, pQCount);
                const dist = prev?.btlDistribution
                  ? Object.fromEntries(
                    Object.entries(prev.btlDistribution).filter(([lvl]) =>
                      (p.allowedBTLLevels ?? []).includes(lvl as any)
                    )
                  )
                  : {};
                return sanitizePartConfig({ ...p, mcqCount: mcq, btlDistribution: dist }, btlCustomization);
              })];
            })
          );
        } else {
          unitCfgsToSave = Object.fromEntries(
            Object.entries(localUnitCfg).map(([unitNum, parts]) => [
              unitNum,
              parts.map(p => sanitizePartConfig(p, btlCustomization))
            ])
          );
        }
      }
      await questionBankApi.updatePattern(selectedSubjectId, {
        parts: sanitizedParts,
        is_active: true,
        unit_configs: unitCfgsToSave,
        unit_question_counts: null,
      });
      const refreshed = await questionBankApi.getPattern(selectedSubjectId);
      const refreshedPattern = refreshed.data;
      setSelectedSubjectPattern(JSON.parse(JSON.stringify(refreshedPattern)));
      const syllabusUnits: any[] = syllabi[selectedSubjectId]?.units || [];
      applyPatternToLocalState(refreshedPattern, syllabusUnits);
      setPatternSaved(true);
      setIsEditingPattern(false);
      setTimeout(() => setPatternSaved(false), 3000);
    } catch (e) {
      setError('Failed to save pattern');
    } finally {
      setPatternSaving(false);
    }
  };

  const handleCancelPatternEdit = () => {
    const syllabusUnits: any[] = syllabi[selectedSubjectId]?.units || [];
    applyPatternToLocalState(selectedSubjectPattern, syllabusUnits);
    setIsEditingPattern(false);
    setPatternDirty(false);
  };

  const updateLocalPart = (idx: number, field: keyof PartConfiguration, value: any) => {
    setLocalParts(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === 'questionCount' || field === 'marksPerQuestion') {
        const qVal = String(next[idx].questionCount) === '' ? 0 : Number(next[idx].questionCount || 0);
        const mVal = String(next[idx].marksPerQuestion) === '' ? 0 : Number(next[idx].marksPerQuestion || 0);
        next[idx].totalMarks = qVal * mVal;
      }
      return next;
    });
    setPatternDirty(true);
    setPatternSaved(false);
  };

  const toggleLocalPartBTL = (idx: number, level: BloomLevel) => {
    setLocalParts(prev => {
      const next = [...prev];
      const cur = next[idx].allowedBTLLevels || [];
      if (cur.includes(level)) {
        const dist = { ...(next[idx].btlDistribution || {}) };
        delete dist[level];
        next[idx] = { ...next[idx], allowedBTLLevels: cur.filter(l => l !== level), btlDistribution: dist };
      } else {
        next[idx] = { ...next[idx], allowedBTLLevels: [...cur, level] };
      }
      return next;
    });
    setPatternDirty(true);
    setPatternSaved(false);
  };

  const updateLocalPartBTLDist = (idx: number, level: BloomLevel, count: any) => {
    setLocalParts(prev => {
      const next = [...prev];
      const pc = next[idx];
      const existing = pc.btlDistribution || {};
      const levels = pc.allowedBTLLevels || [];
      const qCount = String(pc.questionCount) === '' ? 0 : Number(pc.questionCount || 0);
      const newCount = String(count) === '' ? 0 : Number(count);
      
      const newSum = levels.reduce((s, btl) => {
        const val = btl === level ? newCount : (String(existing[btl]) === '' ? 0 : Number(existing[btl] || 0));
        return s + val;
      }, 0);
      
      if (newSum > qCount) {
        setBtlWarning(`Cannot exceed ${qCount} questions. Adjust other values first.`);
        setTimeout(() => setBtlWarning(''), 4000);
        return prev;
      }
      
      next[idx] = {
        ...next[idx],
        btlDistribution: { ...existing, [level]: count },
      };
      return next;
    });
    setPatternDirty(true);
    setPatternSaved(false);
  };

  const updateLocalUnitPart = (unitNum: string, partIdx: number, field: keyof PartConfiguration, value: any) => {
    setLocalUnitCfg(prev => {
      const parts = [...(prev[unitNum] || [])];
      if (field === 'mcqCount') {
        const total = String(parts[partIdx]?.questionCount) === '' ? 0 : Number(parts[partIdx]?.questionCount ?? 0);
        const valNum = String(value) === '' ? 0 : Number(value);
        if (valNum > total) return prev;
      }
      parts[partIdx] = { ...parts[partIdx], [field]: value };
      // Auto-clamp mcqCount when questionCount is reduced below it
      if (field === 'questionCount') {
        const mcq = String(parts[partIdx].mcqCount) === '' ? 0 : Number(parts[partIdx].mcqCount ?? 0);
        const valNum = String(value) === '' ? 0 : Number(value);
        if (mcq > valNum) {
          parts[partIdx] = { ...parts[partIdx], mcqCount: value }; // Keep empty if it was empty, or clamp
        }
      }
      if (field === 'questionCount' || field === 'marksPerQuestion') {
        const qVal = String(parts[partIdx].questionCount) === '' ? 0 : Number(parts[partIdx].questionCount || 0);
        const mVal = String(parts[partIdx].marksPerQuestion) === '' ? 0 : Number(parts[partIdx].marksPerQuestion || 0);
        parts[partIdx].totalMarks = qVal * mVal;
      }
      return { ...prev, [unitNum]: parts };
    });
    setPatternDirty(true);
    setPatternSaved(false);
  };

  const updateLocalUnitBTLDist = (unitNum: string, partIdx: number, level: BloomLevel, count: any) => {
    setLocalUnitCfg(prev => {
      const parts = [...(prev[unitNum] || [])];
      const pc = parts[partIdx];
      const existing = pc.btlDistribution || {};
      const levels = pc.allowedBTLLevels || [];
      const qCount = String(pc.questionCount) === '' ? 0 : Number(pc.questionCount || 0);
      const newCount = String(count) === '' ? 0 : Number(count);
      // Calculate sum with the new value replacing the old one for this level
      const newSum = levels.reduce((s, btl) => {
        const val = btl === level ? newCount : (String(existing[btl]) === '' ? 0 : Number(existing[btl] || 0));
        return s + val;
      }, 0);
      if (newSum > qCount) {
        setBtlWarning(`Cannot exceed ${qCount} questions. Adjust other values first.`);
        setTimeout(() => setBtlWarning(''), 4000);
        return prev;
      }
      parts[partIdx] = {
        ...parts[partIdx],
        btlDistribution: { ...existing, [level]: count },
      };
      return { ...prev, [unitNum]: parts };
    });
    setPatternDirty(true);
    setPatternSaved(false);
  };

  const toggleLocalUnitBTL = (unitNum: string, partIdx: number, level: BloomLevel) => {
    setLocalUnitCfg(prev => {
      const parts = [...(prev[unitNum] || [])];
      const cur = parts[partIdx].allowedBTLLevels || [];
      if (cur.includes(level)) {
        // Deactivating: remove level and clear its distribution count
        const dist = { ...(parts[partIdx].btlDistribution || {}) };
        delete dist[level];
        parts[partIdx] = { ...parts[partIdx], allowedBTLLevels: cur.filter(l => l !== level), btlDistribution: dist };
      } else {
        parts[partIdx] = { ...parts[partIdx], allowedBTLLevels: [...cur, level] };
      }
      return { ...prev, [unitNum]: parts };
    });
    setPatternDirty(true);
    setPatternSaved(false);
  };

  const toggleUnit = (unitNumber: number) => {
    setSelectedUnitIds(prev =>
      prev.includes(unitNumber)
        ? prev.filter(id => id !== unitNumber)
        : [...prev, unitNumber]
    );
  };

  const toggleAllUnits = () => {
    const syllabus = syllabi[selectedSubjectId];
    const allIds = syllabus?.units?.map((u: any) => u.unitNumber) || [];
    const next = selectedUnitIds.length === allIds.length ? [] : allIds;
    setSelectedUnitIds(next);
  };

  /**
   * Build the shared generate payload from the current selection/pattern state.
   * Used by Combined/Individual (auto) generate AND by Prompt Mode (prompt + parse).
   * `forPrompt` treats prompt-mode unit selection like combined-mode selection.
   */
  const buildGeneratePayload = (syllabus: Syllabus) => {
    // In Prompt mode the effective generation style is the prompt sub-mode (combined/individual)
    const effMode = qbMode === 'prompt' ? promptSubMode : qbMode;
    const allUnitIds = (syllabus.units || []).map((u: any) => u.unitNumber);
    const isAllSelected = selectedUnitIds.length === allUnitIds.length;

    // Individual mode: unit_configs (full per-unit config) takes priority over legacy unit_question_counts
    const hasUnitCfg = effMode === 'individual' && localUnitCfg
      && Object.keys(localUnitCfg).length > 0;

    const unitCfg = effMode !== 'individual' ? undefined : (hasUnitCfg
      ? Object.fromEntries(
        Object.entries(localUnitCfg)
          .filter(([unitNum]) => selectedUnitIds.includes(Number(unitNum)))
          .map(([unitNum, parts]) => [unitNum, parts.map(p => sanitizePartConfig(p, btlCustomization))])
      )
      : undefined);

    const uqc = !hasUnitCfg && effMode === 'individual' && selectedSubjectPattern?.unit_question_counts
      && Object.keys(selectedSubjectPattern.unit_question_counts).length > 0
      ? Object.fromEntries(
        Object.entries(selectedSubjectPattern.unit_question_counts).map(([partName, unitCounts]) => [
          partName,
          Object.fromEntries(
            Object.entries(unitCounts as Record<string, number>).filter(([unitNum]) => selectedUnitIds.includes(Number(unitNum)))
          ),
        ])
      )
      : undefined;

    // Combined (and combined-style Prompt) pass an explicit unit filter (round-robin distribution)
    const useUnitFilter = effMode !== 'individual' && !isAllSelected;

    return {
      subject_id: selectedSubjectId,
      syllabus_id: syllabus.id,
      custom_parts: localParts,
      selected_unit_ids: useUnitFilter ? selectedUnitIds : undefined,
      unit_configs: unitCfg,
      unit_question_counts: uqc,
      include_answers: includeAnswers,
    };
  };

  const onBankCreated = (newBank: QuestionBank) => {
    setQuestionBanks(prev => [newBank, ...prev]);
    setLatestBankId(newBank.id);
    setSuccessBank(newBank);
    setShowSuccessPopup(true);
    setTimeout(() => setLatestBankId(null), 12000);
    setSelectedSubjectId('');
    setSelectedUnitIds([]);
    setQbMode('combined');
    setPromptText('');
    setPromptResponse('');
    setUnitPrompts([]);
    setUnitResponses({});
  };

  const handleGenerate = async () => {
    if (!selectedSubjectId) return;
    const syllabus = syllabi[selectedSubjectId];
    if (!syllabus) { setError('Please upload syllabus first'); return; }
    if (selectedUnitIds.length === 0) { setError('Please select at least one unit'); return; }
    setGenerating(true);
    setGlobalLoading(true, 'Generating Question Bank');
    setError('');

    try {
      const response = await questionBankApi.generate(buildGeneratePayload(syllabus));
      onBankCreated(response.data as QuestionBank);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate questions');
    } finally {
      setGenerating(false);
      setGlobalLoading(false);
    }
  };

  const handleGeneratePrompt = async () => {
    if (!selectedSubjectId) return;
    const syllabus = syllabi[selectedSubjectId];
    if (!syllabus) { setError('Please upload syllabus first'); return; }
    if (selectedUnitIds.length === 0) { setError('Please select at least one unit'); return; }
    setPromptLoading(true);
    setError('');
    try {
      const response = await questionBankApi.generatePrompt({
        ...buildGeneratePayload(syllabus),
        split_by_unit: splitByUnit,
      });
      const data = response.data;
      if (data.split_by_unit) {
        setUnitPrompts(data.unit_prompts || []);
        setUnitResponses({});
        setPromptText('');
      } else {
        setPromptText(data.prompt || '');
        setUnitPrompts([]);
        // If a single prompt is very large, recommend switching to split mode
        if ((data.prompt || '').length > 12000) setShowSplitSuggestion(true);
      }
      setPromptCopied(false);
      setCopiedUnit(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to build prompt');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    } catch {
      setError('Could not copy automatically — please select the prompt text and copy manually.');
    }
  };

  // Copy text, then open the chosen AI in a new tab. True auto-paste into another site's
  // chatbox is impossible (browser cross-origin security), so the user just presses Ctrl/Cmd+V.
  const handleOpenAI = async (url: string, text?: string, unitNum?: number) => {
    const toCopy = text ?? promptText;
    if (!toCopy) return;
    try {
      await navigator.clipboard.writeText(toCopy);
      if (unitNum != null) { setCopiedUnit(unitNum); setTimeout(() => setCopiedUnit(null), 2500); }
      else { setPromptCopied(true); setTimeout(() => setPromptCopied(false), 2500); }
    } catch {
      // Even if copy fails, still open the AI; user can copy manually from the box.
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyUnitPrompt = async (text: string, unitNum: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUnit(unitNum);
      setTimeout(() => setCopiedUnit(null), 2500);
    } catch {
      setError('Could not copy automatically — please select the prompt text and copy manually.');
    }
  };

  const handleGenerateFromResponse = async () => {
    if (!selectedSubjectId) return;
    const syllabus = syllabi[selectedSubjectId];
    if (!syllabus) { setError('Please upload syllabus first'); return; }

    const isSplit = unitPrompts.length > 0;
    if (isSplit) {
      const missing = unitPrompts.filter(up => !(unitResponses[String(up.unit_number)] || '').trim());
      if (missing.length > 0) {
        setError(`Please paste the AI response for: ${missing.map(m => `Unit ${m.unit_number}`).join(', ')}`);
        return;
      }
    } else if (!promptResponse.trim()) {
      setError('Please paste the AI response first');
      return;
    }

    setParsingResponse(true);
    setGlobalLoading(true, 'Building Question Bank from response');
    setError('');
    try {
      const response = await questionBankApi.generateFromResponse({
        ...buildGeneratePayload(syllabus),
        ...(isSplit ? { unit_responses: unitResponses } : { response_text: promptResponse }),
      });
      onBankCreated(response.data as QuestionBank);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to parse the pasted response');
    } finally {
      setParsingResponse(false);
      setGlobalLoading(false);
    }
  };

  const handleDownload = async (bank: QuestionBank) => {
    setGlobalLoading(true, 'Downloading');
    try {
      const response = await questionBankApi.download(bank.id);
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bank.title || 'question_bank'}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download');
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Question Bank',
      message: 'Are you sure you want to delete this question bank? This action cannot be undone.',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await questionBankApi.delete(id);
          setQuestionBanks(questionBanks.filter(b => b.id !== id));
        } catch (err) {
          setError('Failed to delete');
        }
      },
    });
  };

  const handleDirectShare = async (bank: QuestionBank) => {
    setGlobalLoading(true, 'Preparing to share...');
    try {
      const response = await questionBankApi.download(bank.id);
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const fileName = `${bank.title || 'question_bank'}.xlsx`;
      const file = new File([blob], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      // Try native file sharing (works on Android Chrome, iOS Safari, some desktop browsers)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: bank.title || 'Question Bank',
            text: `Question Bank: ${bank.title || 'Question Bank'}`,
          });
          // Shared successfully — nothing else needed
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            // User cancelled — that's fine
            return;
          }
          // Share failed for another reason — fall through to download fallback
          console.warn('navigator.share failed, falling back to download:', shareErr);
        }
      }

      // Fallback: trigger a download (desktop browsers, unsupported mobile browsers)
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setConfirmState({
        isOpen: true,
        title: 'Sharing Fallback',
        message: "Excel file downloaded!\n\nYour browser doesn't support direct file sharing. Please share the downloaded file manually via WhatsApp or Email.",
        alertOnly: true,
        confirmText: 'OK',
        onConfirm: () => {},
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Sharing failed:', err);
        setError('Failed to share Question Bank.');
      }
    } finally {
      setGlobalLoading(false);
    }
  };


  const getSubjectName = (subjectId: string) =>
    subjects.find(s => s.id === subjectId)?.name || 'Unknown';

  const getSelectedSubject = () => subjects.find(s => s.id === selectedSubjectId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-pink-600 dark:text-pink-400 animate-spin" />
      </div>
    );
  }

  const selectedSubject = getSelectedSubject();
  const availableSubjects = subjects.filter(s => syllabi[s.id] && s.configuration?.hasExam !== false);
  // In Prompt mode the unit/pattern UI follows the chosen prompt sub-mode (combined/individual)
  const effectiveMode = qbMode === 'prompt' ? promptSubMode : qbMode;

  return (
    <div className="space-y-6">
      {/* BTL overflow warning toast */}
      {btlWarning && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-start gap-3 px-5 py-4 bg-rose-600 text-white rounded-xl shadow-2xl shadow-rose-500/40 max-w-md w-full animate-in fade-in slide-in-from-top-3 duration-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium leading-snug">{btlWarning}</p>
          <button onClick={() => setBtlWarning('')} className="ml-auto text-white/70 hover:text-white transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-pink-600 dark:text-pink-400">📋 Question Banks</h1>
        <p className="text-purple-700 dark:text-purple-300 mt-1 font-medium">Generate and manage AI-powered question banks</p>
      </div>

      {error && createPortal(
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setError('')}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center border-2 border-rose-300 dark:border-rose-700 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="text-xl font-bold text-rose-600 dark:text-rose-400 mb-2">Error Occurred</h3>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-6 leading-relaxed whitespace-pre-wrap">
              {error}
            </p>
            <button
              onClick={() => setError('')}
              className="btn bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 rounded-xl transition-all font-semibold shadow-lg shadow-rose-500/25 active:scale-95"
            >
              Dismiss
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* No subjects warning */}
      {subjects.length === 0 && (
        <div className="card dark:!bg-slate-900 text-center py-12">
          <div className="w-16 h-16 bg-pink-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-pink-600 dark:text-pink-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Subjects Found</h3>
          <p className="text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            You haven't created any subjects yet. Head over to the Subjects page to create one before generating question banks.
          </p>
        </div>
      )}

      {/* ── Generator Card ── */}
      {subjects.length > 0 && (
        <div className="card dark:!bg-slate-900 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Generate New Question Bank</h2>
            {/* ── Global Output toggle: Question only vs With Answer Key (applies to all modes) ── */}
            <div className="flex flex-col items-start sm:items-end gap-1">
              <div className="relative grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full max-w-[340px] isolate">
                <div
                  className={`absolute inset-y-1 w-[calc(50%-0.25rem)] bg-gradient-to-r from-pink-500 to-purple-600 rounded-md shadow-md transition-all duration-300 ease-out -z-10 ${
                    !includeAnswers ? 'left-1' : 'left-[calc(100%-0.25rem)] -translate-x-full'
                  }`}
                />
                <button
                  onClick={() => { setIncludeAnswers(false); setPromptText(''); }}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-300 ${!includeAnswers
                      ? 'text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                  <HelpCircle className="w-4 h-4" /> Question Only
                </button>
                <button
                  onClick={() => { setIncludeAnswers(true); setPromptText(''); }}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-300 ${includeAnswers
                      ? 'text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                  <CheckCircle2 className="w-4 h-4" /> With Answer Key
                </button>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-[340px] text-center sm:text-right mt-1">
                {includeAnswers
                  ? 'Excel has 2 sheets (Questions + Answer Key)'
                  : 'Faster — only a Question sheet, no answers'}
              </p>
            </div>
          </div>

          <div className="space-y-4">

            {/* Subject Dropdown + Generate Button */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <div className="relative" onMouseLeave={() => setIsDropdownOpen(false)}>
                  <div
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="input pl-12 pr-10 cursor-pointer bg-white dark:bg-slate-950 hover:border-pink-300 dark:hover:border-pink-600 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <BookOpen className="h-5 w-5 text-pink-500 dark:text-pink-400 flex-shrink-0" />
                      <span className={`truncate ${!selectedSubjectId ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {selectedSubjectId ? availableSubjects.find(s => s.id === selectedSubjectId)?.name : 'Select a subject...'}
                      </span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {isDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                      <div className="absolute z-20 w-full mt-2 bg-white dark:bg-slate-900 border-2 border-pink-100 dark:border-pink-700 rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                        {availableSubjects.map(s => (
                          <div
                            key={s.id}
                            onClick={() => { setSelectedSubjectId(s.id); setIsDropdownOpen(false); }}
                            className={`px-4 py-3 cursor-pointer transition-colors flex items-center justify-between group ${selectedSubjectId === s.id
                              ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300'
                              : 'hover:bg-pink-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                          >
                            <span className="font-medium">{s.name}</span>
                            <span className="text-xs text-slate-400 group-hover:text-pink-500 dark:text-slate-500 transition-colors">{s.code}</span>
                          </div>
                        ))}
                        {availableSubjects.length === 0 && (
                          <div className="p-4 text-center text-slate-500 dark:text-slate-400 text-sm">No subjects available</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {qbMode !== 'prompt' && (
                <button
                  onClick={handleGenerate}
                  disabled={!selectedSubjectId || generating}
                  title=''
                  className="btn w-full md:w-auto bg-gradient-to-r from-pink-600 via-rose-500 to-orange-500 text-white shadow-lg shadow-pink-500/40 hover:shadow-pink-500/60 hover:scale-105 active:scale-95 transition-all duration-300 font-extrabold tracking-wide border-0 disabled:opacity-90 disabled:cursor-not-allowed"
                >
                  {generating
                    ? <><Loader2 className="w-5 h-5 animate-spin" />Generating...</>
                    : <><Sparkles className="w-5 h-5 animate-pulse" />Generate</>
                  }
                </button>
              )}
            </div>

            {selectedSubjectId && !syllabi[selectedSubjectId] && (
              <p className="text-amber-700 dark:text-amber-200 text-sm">
                ⚠️ Please upload syllabus for this subject first
              </p>
            )}

            {/* ── Generation Mode Toggle ── gradient style like Syllabus/CDAP */}
            {selectedSubjectId && syllabi[selectedSubjectId] && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Generation Mode</p>
                <div className="relative grid grid-cols-3 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full isolate">
                  <div
                    className={`absolute inset-y-1 w-[calc(33.333%-0.167rem)] bg-gradient-to-r from-pink-500 to-purple-600 rounded-md shadow-md transition-all duration-300 ease-out -z-10 ${
                      qbMode === 'combined' ? 'left-1' :
                      qbMode === 'individual' ? 'left-1/2 -translate-x-1/2' :
                      'left-[calc(100%-0.25rem)] -translate-x-full'
                    }`}
                  />
                  <button
                    onClick={() => setQbMode('combined')}
                    className={`flex-1 text-center py-2 rounded-md text-sm font-semibold transition-colors duration-300 ${qbMode === 'combined'
                        ? 'text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    🔀 Combined
                  </button>
                  <button
                    onClick={() => setQbMode('individual')}
                    className={`flex-1 text-center py-2 rounded-md text-sm font-semibold transition-colors duration-300 ${qbMode === 'individual'
                        ? 'text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    🎯 Individual
                  </button>
                  <button
                    onClick={() => setQbMode('prompt')}
                    className={`flex-1 text-center py-2 rounded-md text-sm font-semibold transition-colors duration-300 ${qbMode === 'prompt'
                        ? 'text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    📋 Prompt
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  {qbMode === 'combined'
                    ? 'AI distributes questions evenly across the units you select'
                    : qbMode === 'individual'
                      ? 'Uses exact per-unit counts from the pattern — select which units to include'
                      : 'No API needed — copy a ready-made prompt into any AI (ChatGPT, Gemini, Claude), then paste its response back here to build the Excel'}
                </p>
              </div>
            )}

            {qbMode === 'prompt' && selectedSubjectId && syllabi[selectedSubjectId] && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300 mb-6">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Generation Style</p>
                <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full">
                  <button
                    onClick={() => { setPromptSubMode('combined'); setPromptText(''); setUnitPrompts([]); setUnitResponses({}); }}
                    className={`flex-1 text-center py-2.5 rounded-lg text-sm font-bold transition-all ${promptSubMode === 'combined'
                        ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    🔀 Combined
                  </button>
                  <button
                    onClick={() => { setPromptSubMode('individual'); setPromptText(''); setUnitPrompts([]); setUnitResponses({}); }}
                    className={`flex-1 text-center py-2.5 rounded-lg text-sm font-bold transition-all ${promptSubMode === 'individual'
                        ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    🎯 Individual
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  {promptSubMode === 'combined'
                    ? 'Even distribution across the units you select'
                    : 'Uses exact per-unit counts from the pattern — same as the main Individual mode'}
                </p>
              </div>
            )}

            {/* COMBINED (and combined-style PROMPT): unit checkboxes */}
            {effectiveMode === 'combined' && selectedSubjectId && (syllabi[selectedSubjectId]?.units?.length ?? 0) > 0 && (
              <div className="p-4 bg-white rounded-lg border-2 border-pink-200 dark:bg-slate-900 dark:border-pink-700 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">📚 Select Units</h3>
                  <button onClick={toggleAllUnits} className="text-xs text-pink-600 dark:text-pink-300 hover:underline font-medium">
                    {selectedUnitIds.length === syllabi[selectedSubjectId].units.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {syllabi[selectedSubjectId].units.map((unit: any) => (
                    <label
                      key={unit.unitNumber}
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${selectedUnitIds.includes(unit.unitNumber)
                        ? 'bg-pink-50 border-pink-400 dark:bg-pink-900/20 dark:border-pink-500'
                        : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-600 hover:border-pink-200 dark:hover:border-pink-700'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUnitIds.includes(unit.unitNumber)}
                        onChange={() => toggleUnit(unit.unitNumber)}
                        className="mt-0.5 accent-pink-600"
                      />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium whitespace-normal break-words leading-snug ${selectedUnitIds.includes(unit.unitNumber) ? 'text-pink-700 dark:text-pink-300' : 'text-slate-700 dark:text-slate-300'}`}>
                          Unit {unit.unitNumber}: {unit.title}
                        </p>
                        {unit.topics?.length > 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {unit.topics.slice(0, 3).map((t: any) => typeof t === 'string' ? t : t.topicName).join(', ')}
                            {unit.topics.length > 3 ? ` +${unit.topics.length - 3} more` : ''}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {selectedUnitIds.length} of {syllabi[selectedSubjectId].units.length} unit(s) selected
                </p>
              </div>
            )}

            {/* INDIVIDUAL: unit selection + detailed per-unit × per-part table */}
            {effectiveMode === 'individual' && selectedSubjectId && syllabi[selectedSubjectId] && (() => {
              const hasUnitCfg = Object.keys(localUnitCfg).length > 0;
              const uqc: Record<string, Record<string, number>> = selectedSubjectPattern?.unit_question_counts || {};
              const hasUqc = !hasUnitCfg && Object.values(uqc).some(p => Object.values(p).some(v => v > 0));
              const hasConfig = hasUnitCfg || hasUqc;
              const allUnits: any[] = syllabi[selectedSubjectId]?.units || [];
              // Only show units that are both selected AND have a config entry
              const visibleUnits = allUnits.filter((u: any) =>
                selectedUnitIds.includes(u.unitNumber) && (!hasUnitCfg || localUnitCfg[String(u.unitNumber)])
              );
              const parts: any[] = localParts.length > 0 ? localParts : (selectedSubjectPattern?.parts || []);
              return (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  {/* Unit checkboxes — pink themed */}
                  <div className="p-4 bg-white rounded-lg border-2 border-pink-200 dark:bg-slate-900 dark:border-pink-700">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        🎯 Select Units
                        <span className="ml-2 text-xs font-normal text-pink-500 dark:text-pink-400">Only selected units will be generated</span>
                      </h3>
                      <button onClick={toggleAllUnits} className="text-xs text-pink-600 dark:text-pink-300 hover:underline font-medium">
                        {selectedUnitIds.length === allUnits.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {allUnits.map((unit: any) => {
                        const isSelected = selectedUnitIds.includes(unit.unitNumber);
                        return (
                          <label
                            key={unit.unitNumber}
                            className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${isSelected
                                ? 'bg-pink-50 border-pink-400 dark:bg-pink-900/20 dark:border-pink-500'
                                : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-600 hover:border-pink-200 dark:hover:border-pink-700'
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleUnit(unit.unitNumber)}
                              className="mt-0.5 accent-pink-600"
                            />
                            <p className={`text-sm font-medium whitespace-normal break-words leading-snug ${isSelected ? 'text-pink-700 dark:text-pink-300' : 'text-slate-700 dark:text-slate-300'
                              }`}>
                              CO{unit.unitNumber}: {unit.title}
                            </p>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      {selectedUnitIds.length} of {allUnits.length} unit(s) selected
                    </p>
                  </div>

                  {/* Detailed per-unit × per-part breakdown table */}
                  {hasConfig ? (
                    <div className="bg-white dark:bg-slate-900 rounded-lg border-2 border-pink-200 dark:border-pink-700 overflow-hidden">
                      <div className="flex flex-col md:flex-row md:items-center justify-between px-4 py-3 bg-pink-50 dark:bg-pink-900/20 border-b border-pink-100 dark:border-pink-900 gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">📊 Questions to be Generated</h3>
                          {/* BTL Customization toggle */}
                          <button
                            type="button"
                            onClick={() => setBtlCustomization(prev => !prev)}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${btlCustomization
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/40 scale-105'
                                : 'bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:from-purple-50 hover:to-pink-50 dark:hover:from-purple-900/30 dark:hover:to-pink-900/30 hover:border-purple-300 dark:hover:border-purple-600 hover:text-purple-700 dark:hover:text-purple-300'
                              }`}
                          >
                            <Settings className="w-4 h-4" />
                            BTL Customization&nbsp;<span className={`px-1.5 py-0.5 rounded-md text-xs font-extrabold ${btlCustomization ? 'bg-white/20' : 'bg-slate-300/60 dark:bg-slate-600/60'}`}>{btlCustomization ? 'ON' : 'OFF'}</span>
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {patternSaved && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                              <Check className="w-3.5 h-3.5" /> Saved
                            </span>
                          )}
                          {isEditingPattern ? (
                            <>
                              {patternDirty && (
                                <button
                                  type="button"
                                  onClick={saveLocalPattern}
                                  disabled={patternSaving}
                                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-60"
                                >
                                  {patternSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                  Save Pattern
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={handleCancelPatternEdit}
                                className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" /> Cancel
                              </button>

                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsEditingPattern(true)}
                              className="btn btn-secondary text-xs px-3 py-1.5 gap-1.5"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit Pattern
                            </button>
                          )}
                        </div>
                      </div>
                      {visibleUnits.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">Select units above to see the breakdown</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Unit</th>
                                {parts.map((p: any) => (
                                  <th key={p.partName} className="text-center px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                    {p.partName}
                                    <span className="block text-xs font-normal text-slate-400">{p.marksPerQuestion} marks per question</span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleUnits.map((unit: any, idx: number) => {
                                const uStr = String(unit.unitNumber);
                                const unitParts: PartConfiguration[] = localUnitCfg[uStr] || [];
                                return (
                                  <tr key={unit.unitNumber} className={`border-b border-slate-100 dark:border-slate-800 ${idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/20'}`}>
                                    <td className="px-2 py-2.5 align-top">
                                      <div className="flex flex-col gap-0.5 min-w-[120px] max-w-[180px]">
                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 text-xs font-bold whitespace-nowrap">
                                          CO{unit.unitNumber}
                                        </span>
                                        <span className="text-slate-700 dark:text-slate-300 text-[10px] font-medium leading-tight whitespace-normal break-words">{unit.title}</span>
                                      </div>
                                    </td>
                                    {parts.map((_p: any, pIdx: number) => {
                                      const pc: any = unitParts[pIdx] || { partName: '', questionCount: 0, marksPerQuestion: 0, totalMarks: 0, allowedBTLLevels: [] };
                                      const qCount = String(pc.questionCount) === '' ? 0 : Number(pc.questionCount);
                                      const mcqVal = String(pc.mcqCount) === '' ? 0 : Number(pc.mcqCount);
                                      const mcq = String(pc.mcqCount) === '' ? '' : (pc.mcqCount ?? 0);
                                      const desc = Math.max(0, qCount - mcqVal);
                                      const levels = pc.allowedBTLLevels || [];
                                      const dist: Record<string, number> = (pc.btlDistribution as any) || {};
                                      return (
                                        <td key={pIdx} className="px-3 py-2 text-center align-top">
                                          <div className="space-y-2">
                                            {btlCustomization ? (
                                              <>
                                                {/* MCQ / Descriptive mini-table */}
                                                <table className="w-full text-xs border border-pink-100 dark:border-pink-900/40 rounded-md overflow-hidden mb-1">
                                                  <thead>
                                                    <tr className="bg-pink-50 dark:bg-pink-900/20">
                                                      <th className="px-1.5 py-1 text-center font-semibold text-slate-500 dark:text-slate-400 text-[9px] uppercase tracking-wide">Total Questions</th>
                                                      <th className="px-1.5 py-1 text-center font-semibold text-pink-500 dark:text-pink-400 text-[9px] uppercase tracking-wide">MCQ Count</th>
                                                      <th className="px-1.5 py-1 text-center font-semibold text-slate-500 dark:text-slate-400 text-[9px] uppercase tracking-wide">Descriptive</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    <tr className="bg-white dark:bg-slate-800/40">
                                                      <td className="px-1.5 py-1.5 text-center">
                                                        {isEditingPattern ? (
                                                          <input
                                                            type="number" min={0}
                                                            value={pc.questionCount}
                                                            onChange={e => updateLocalUnitPart(uStr, pIdx, 'questionCount', e.target.value === '' ? '' : Number(e.target.value))}
                                                            className="w-12 text-center text-sm font-bold text-slate-800 dark:text-white border border-pink-200 dark:border-pink-800 rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-400 py-0.5"
                                                          />
                                                        ) : pc.questionCount === 0 ? (
                                                          <span className="text-xs italic text-slate-400 dark:text-slate-500">auto</span>
                                                        ) : (
                                                          <span className="text-sm font-bold text-slate-800 dark:text-white">{pc.questionCount}</span>
                                                        )}
                                                      </td>
                                                      <td className="px-1.5 py-1.5 text-center">
                                                        {isEditingPattern ? (
                                                          <input
                                                            type="number" min={0} max={pc.questionCount === '' ? undefined : Number(pc.questionCount)}
                                                            value={mcq}
                                                            onChange={e => updateLocalUnitPart(uStr, pIdx, 'mcqCount', e.target.value === '' ? '' : Number(e.target.value))}
                                                            className="w-12 text-center text-xs font-semibold border border-pink-200 dark:border-pink-800 rounded-md bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 py-0.5"
                                                          />
                                                        ) : (
                                                          <span className="text-xs font-semibold text-pink-700 dark:text-pink-300">{Number(mcq) > 0 ? mcq : '—'}</span>
                                                        )}
                                                      </td>
                                                      <td className="px-1.5 py-1.5 text-center">
                                                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{desc > 0 ? desc : '—'}</span>
                                                      </td>
                                                    </tr>
                                                  </tbody>
                                                </table>
                                                <div className="flex flex-wrap gap-1.5 justify-center">
                                                  {ALL_BTL_LEVELS.map((btl, i) => {
                                                    const active = levels.includes(btl);
                                                    const val = dist[btl] ?? 0;
                                                    return (
                                                      <div
                                                        key={btl}
                                                        onClick={() => { if (isEditingPattern) toggleLocalUnitBTL(uStr, pIdx, btl); }}
                                                        title={isEditingPattern ? (active ? `Disable ${btl}` : `Enable ${btl}`) : undefined}
                                                        className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg font-bold border transition-all ${isEditingPattern ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
                                                          } ${active
                                                            ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700'
                                                            : `bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 ${isEditingPattern ? 'opacity-40 hover:opacity-70' : 'opacity-40'}`
                                                          }`}
                                                      >
                                                        <span className={`text-xs font-bold ${active ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`}>
                                                          {btl}/K{i + 1}
                                                        </span>
                                                        {isEditingPattern && active ? (
                                                          <input
                                                            type="number" min={0}
                                                            value={val}
                                                            onClick={e => e.stopPropagation()}
                                                            onChange={e => updateLocalUnitBTLDist(uStr, pIdx, btl, e.target.value === '' ? '' : Number(e.target.value))}
                                                            className="w-12 text-center text-sm font-bold border border-purple-300 dark:border-purple-700 rounded bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-400 py-0.5"
                                                            placeholder="0"
                                                          />
                                                        ) : isEditingPattern && !active ? (
                                                          <span className="text-xs text-slate-400 font-normal">+ add</span>
                                                        ) : (
                                                          <span className={`text-sm font-bold ${active ? 'text-purple-700 dark:text-purple-300' : 'text-slate-400'}`}>
                                                            {active ? (val || '—') : '—'}
                                                          </span>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                                {/* Sum validation — no warning triangles; just show count */}
                                                {(() => {
                                                  const sum = levels.reduce((s: number, btl: BloomLevel) => s + (String(dist[btl]) === '' ? 0 : Number(dist[btl] || 0)), 0);
                                                  if (sum === 0) return null;
                                                  const ok = qCount > 0 && sum === qCount;
                                                  if (ok) return (
                                                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                                                      {sum}/{qCount} ✓
                                                    </div>
                                                  );
                                                  return (
                                                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                                                      {sum} specified{qCount > 0 ? ` / ${qCount} total` : ''}
                                                    </div>
                                                  );
                                                })()}
                                              </>
                                            ) : (
                                              <>
                                                {/* Standard inner stats table: Total Questions | MCQ Count | Descriptive */}
                                                <table className="w-full text-xs border border-pink-100 dark:border-pink-900/40 rounded-md overflow-hidden">
                                                  <thead>
                                                    <tr className="bg-pink-50 dark:bg-pink-900/20">
                                                      <th className="px-1.5 py-1 text-center font-semibold text-slate-500 dark:text-slate-400 text-[9px] uppercase tracking-wide">Total Questions</th>
                                                      <th className="px-1.5 py-1 text-center font-semibold text-pink-500 dark:text-pink-400 text-[9px] uppercase tracking-wide">MCQ Count</th>
                                                      <th className="px-1.5 py-1 text-center font-semibold text-slate-500 dark:text-slate-400 text-[9px] uppercase tracking-wide">Descriptive</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    <tr className="bg-white dark:bg-slate-800/40">
                                                      <td className="px-1.5 py-1.5 text-center">
                                                        {isEditingPattern ? (
                                                          <input
                                                            type="number" min={0}
                                                            value={pc.questionCount}
                                                            onChange={e => updateLocalUnitPart(uStr, pIdx, 'questionCount', e.target.value === '' ? '' : Number(e.target.value))}
                                                            className="w-12 text-center text-sm font-bold text-slate-800 dark:text-white border border-pink-200 dark:border-pink-800 rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-400 py-0.5"
                                                          />
                                                        ) : pc.questionCount === 0 ? (
                                                          <span className="text-xs italic text-slate-400 dark:text-slate-500">auto</span>
                                                        ) : (
                                                          <span className="text-sm font-bold text-slate-800 dark:text-white">{pc.questionCount}</span>
                                                        )}
                                                      </td>
                                                      <td className="px-1.5 py-1.5 text-center">
                                                        {isEditingPattern ? (
                                                          <input
                                                            type="number" min={0} max={pc.questionCount === '' ? undefined : Number(pc.questionCount)}
                                                            value={mcq}
                                                            onChange={e => updateLocalUnitPart(uStr, pIdx, 'mcqCount', e.target.value === '' ? '' : Number(e.target.value))}
                                                            className="w-12 text-center text-xs font-semibold border border-pink-200 dark:border-pink-800 rounded-md bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 py-0.5"
                                                          />
                                                        ) : (
                                                          <span className="text-xs font-semibold text-pink-700 dark:text-pink-300">{Number(mcq) > 0 ? mcq : '—'}</span>
                                                        )}
                                                      </td>
                                                      <td className="px-1.5 py-1.5 text-center">
                                                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{desc > 0 ? desc : '—'}</span>
                                                      </td>
                                                    </tr>
                                                  </tbody>
                                                </table>
                                                {/* BTL level flat toggle pills */}
                                                <div className="flex flex-wrap gap-0.5 justify-center">
                                                  {ALL_BTL_LEVELS.map((btl, i) => {
                                                    const active = levels.includes(btl);
                                                    return (
                                                      <button
                                                        key={btl}
                                                        type="button"
                                                        onClick={() => isEditingPattern && toggleLocalUnitBTL(uStr, pIdx, btl)}
                                                        disabled={!isEditingPattern}
                                                        className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${active
                                                            ? 'bg-purple-600 text-white border-transparent shadow-sm'
                                                            : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-600 opacity-50'
                                                          } ${!isEditingPattern ? 'cursor-default' : 'cursor-pointer hover:opacity-90'}`}
                                                      >
                                                        {btl}<span className="opacity-70">/K{i + 1}</span>
                                                      </button>
                                                    );
                                                  })}
                                                </div>
                                              </>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-pink-50 dark:bg-pink-900/20 border-t-2 border-pink-200 dark:border-pink-800">
                                <td className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">Total (selected)</td>
                                {parts.map((_p: any, pIdx: number) => {
                                  let total = 0, totalMcq = 0;
                                  visibleUnits.forEach((u: any) => {
                                    const uCfg = localUnitCfg[String(u.unitNumber)];
                                    if (uCfg) {
                                      total += uCfg[pIdx]?.questionCount ?? 0;
                                      totalMcq += uCfg[pIdx]?.mcqCount ?? 0;
                                    }
                                  });
                                  const totalDesc = Math.max(0, total - totalMcq);
                                  const hasDataError = totalMcq > total;
                                  // Count how many visible units have an explicit (non-zero) questionCount for this part
                                  const autoCount = visibleUnits.filter((u: any) => {
                                    const uCfg = localUnitCfg[String(u.unitNumber)];
                                    return !uCfg || (uCfg[pIdx]?.questionCount ?? 0) === 0;
                                  }).length;
                                  const allAuto = autoCount === visibleUnits.length;
                                  return (
                                    <td key={pIdx} className="px-3 py-2.5 text-center">
                                      {allAuto ? (
                                        <span className="text-sm italic text-slate-400 dark:text-slate-500">auto</span>
                                      ) : (
                                        <>
                                          <span className="font-bold text-pink-700 dark:text-pink-300 text-base">{total}</span>
                                          <span className="text-xs text-slate-400 ml-1">Questions</span>
                                          {autoCount > 0 && (
                                            <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">+{autoCount} auto</span>
                                          )}
                                        </>
                                      )}
                                      {btlCustomization && !allAuto ? null : !btlCustomization && hasDataError ? (
                                        <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 font-medium">
                                          MCQ count ({totalMcq}) exceeds total — edit to correct
                                        </div>
                                      ) : !btlCustomization && totalMcq > 0 && !allAuto ? (
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                          {totalMcq} MCQ + {totalDesc} Descriptive
                                        </div>
                                      ) : null}
                                    </td>
                                  );
                                })}
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        ⚠️ No per-unit counts in pattern. Configure in Patterns page or switch to Combined mode.
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate('/patterns')}
                        className="flex items-center gap-1.5 text-xs font-semibold text-pink-600 dark:text-pink-300 bg-white dark:bg-slate-800 border border-pink-300 dark:border-pink-700 rounded-lg px-3 py-1.5 whitespace-nowrap flex-shrink-0 hover:bg-pink-50 transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" /> Configure Pattern
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Pattern Summary Table (Combined / combined-style Prompt) ── */}
            {effectiveMode === 'combined' && selectedSubject && localParts.length > 0 && (
              <div className="bg-white rounded-lg border-2 border-pink-200 dark:bg-slate-900 dark:border-pink-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex flex-col md:flex-row md:items-center justify-between px-4 py-3 bg-pink-50 dark:bg-pink-900/20 border-b border-pink-100 dark:border-pink-900 gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">📊 Questions to be Generated</h3>
                    <button
                      type="button"
                      onClick={() => setBtlCustomization(prev => !prev)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${btlCustomization
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/40 scale-105'
                          : 'bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:from-purple-50 hover:to-pink-50 dark:hover:from-purple-900/30 dark:hover:to-pink-900/30 hover:border-purple-300 dark:hover:border-purple-600 hover:text-purple-700 dark:hover:text-purple-300'
                        }`}
                    >
                      <Settings className="w-4 h-4" />
                      BTL Customization&nbsp;<span className={`px-1.5 py-0.5 rounded-md text-xs font-extrabold ${btlCustomization ? 'bg-white/20' : 'bg-slate-300/60 dark:bg-slate-600/60'}`}>{btlCustomization ? 'ON' : 'OFF'}</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {patternSaved && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                        <Check className="w-3.5 h-3.5" /> Saved
                      </span>
                    )}
                    {isEditingPattern ? (
                      <>
                        {patternDirty && (
                          <button
                            type="button"
                            onClick={saveLocalPattern}
                            disabled={patternSaving}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-60"
                          >
                            {patternSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save Pattern
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleCancelPatternEdit}
                          className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" /> Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingPattern(true)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-pink-600 dark:text-pink-300 bg-white dark:bg-slate-800 border border-pink-300 dark:border-pink-700 rounded-lg px-3 py-1.5 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit Pattern
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Part</th>
                        <th className="text-center px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Marks per Question</th>
                        <th className="text-center px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Total Questions</th>
                        <th className="text-center px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">MCQ Count</th>
                        <th className="text-center px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Descriptive Count</th>
                        <th className="text-left px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">BTL Levels</th>
                      </tr>
                    </thead>
                    <tbody>
                      {localParts.map((part: PartConfiguration, idx: number) => {
                        const mcq = String(part.mcqCount) === '' ? '' : (part.mcqCount ?? 0);
                        const qCount = String(part.questionCount) === '' ? 0 : Number(part.questionCount);
                        const mcqVal = String(part.mcqCount) === '' ? 0 : Number(part.mcqCount);
                        const desc = Math.max(0, qCount - mcqVal);
                        const dist: Record<string, number> = (part.btlDistribution as any) || {};
                        const hasDist = Object.values(dist).some((v: any) => (v || 0) > 0);
                        const levels: BloomLevel[] = part.allowedBTLLevels || [];
                        return (
                          <tr key={idx} className={`border-b border-slate-100 dark:border-slate-800 ${idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/20'}`}>
                            <td className="px-4 py-3">
                              <span className="font-semibold text-pink-700 dark:text-pink-300">{part.partName}</span>
                              {part.description && <p className="text-xs text-slate-400 italic mt-0.5">{part.description}</p>}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {isEditingPattern ? (
                                <input
                                  type="number" min={0}
                                  value={part.marksPerQuestion}
                                  onChange={e => updateLocalPart(idx, 'marksPerQuestion', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-14 text-center font-mono font-semibold text-slate-700 dark:text-white border border-pink-200 dark:border-pink-800 rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-400 py-0.5 text-sm"
                                />
                              ) : (
                                <span className="font-mono font-semibold text-slate-700 dark:text-white">{part.marksPerQuestion}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {isEditingPattern ? (
                                <input
                                  type="number" min={0}
                                  value={part.questionCount}
                                  onChange={e => updateLocalPart(idx, 'questionCount', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-14 text-center font-bold text-slate-800 dark:text-white border border-pink-200 dark:border-pink-800 rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-pink-400 py-0.5 text-sm"
                                />
                              ) : (
                                <span className="font-bold text-slate-800 dark:text-white">{part.questionCount}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {isEditingPattern ? (
                                <input
                                  type="number" min={0} max={String(part.questionCount) === '' ? undefined : Number(part.questionCount)}
                                  value={mcq}
                                  onChange={e => updateLocalPart(idx, 'mcqCount', e.target.value === '' ? '' : Number(e.target.value))}
                                  className="w-14 text-center text-xs font-semibold border border-pink-200 dark:border-pink-800 rounded-md bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 py-0.5"
                                />
                              ) : (
                                <span className="text-xs font-semibold text-pink-700 dark:text-pink-300">{Number(mcq) > 0 ? mcq : '—'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {desc > 0
                                ? <span className="inline-block bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded px-2 py-0.5 text-xs font-semibold">{desc}</span>
                                : <span className="text-slate-300 dark:text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {ALL_BTL_LEVELS.map(btl => {
                                  const active = levels.includes(btl);
                                  const kNum = btl.replace('BTL', '');
                                  const count = dist[btl];
                                  return btlCustomization ? (
                                    <div
                                      key={btl}
                                      onClick={() => { if (isEditingPattern) toggleLocalPartBTL(idx, btl); }}
                                      title={isEditingPattern ? (active ? `Disable ${btl}` : `Enable ${btl}`) : undefined}
                                      className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg font-bold border transition-all ${isEditingPattern ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
                                        } ${active
                                          ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700'
                                          : `bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 ${isEditingPattern ? 'opacity-40 hover:opacity-70' : 'opacity-40'}`
                                        }`}
                                    >
                                      <span className={`text-xs font-bold ${active ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`}>
                                        {btl}/K{kNum}
                                      </span>
                                      {isEditingPattern && active ? (
                                        <input
                                          type="number" min={0}
                                          value={count ?? ''}
                                          onClick={e => e.stopPropagation()}
                                          onChange={e => updateLocalPartBTLDist(idx, btl, e.target.value === '' ? '' : Number(e.target.value))}
                                          className="w-12 text-center text-sm font-bold border border-purple-300 dark:border-purple-700 rounded bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-400 py-0.5"
                                          placeholder="0"
                                        />
                                      ) : isEditingPattern && !active ? (
                                        <span className="text-xs text-slate-400 font-normal">+ add</span>
                                      ) : (
                                        <span className={`text-sm font-bold ${active ? 'text-purple-700 dark:text-purple-300' : 'text-slate-400'}`}>
                                          {active ? (count || '—') : '—'}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      key={btl}
                                      type="button"
                                      onClick={() => isEditingPattern && toggleLocalPartBTL(idx, btl)}
                                      disabled={!isEditingPattern}
                                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold border transition-all ${active
                                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                          : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-600 opacity-40'
                                        } ${!isEditingPattern ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}
                                    >
                                      {btl}<span className="opacity-60">/K{kNum}</span>
                                      {btlCustomization && active && hasDist && (count || 0) > 0 && (
                                        <span className="ml-0.5 bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 rounded-full px-1 font-bold text-[10px]">{count}</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-pink-50 dark:bg-pink-900/20 border-t-2 border-pink-200 dark:border-pink-800">
                        <td className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">Total</td>
                        <td />
                        <td className="px-4 py-2.5 text-center">
                          <span className="font-bold text-pink-700 dark:text-pink-300 text-base">
                            {localParts.reduce((s, p) => s + p.questionCount, 0)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-pink-600 dark:text-pink-400">
                          {(() => {
                            const t = localParts.reduce((s, p) => s + (p.mcqCount || 0), 0);
                            return t > 0 ? t : '—';
                          })()}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-600 dark:text-slate-400">
                          {localParts.reduce((s, p) => s + p.questionCount - (p.mcqCount || 0), 0)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500 border-t border-pink-100 dark:border-pink-900/50">
                  Questions will be distributed evenly across all selected units
                </p>
              </div>
            )}

            {/* ── PROMPT MODE: copy prompt → paste response panel ── */}
            {qbMode === 'prompt' && selectedSubjectId && syllabi[selectedSubjectId] && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">

                {/* Single / Split — big full-width segmented control */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Prompt Delivery</p>
                  <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full">
                    <button
                      onClick={() => { setSplitByUnit(true); setPromptText(''); setUnitPrompts([]); setUnitResponses({}); }}
                      className={`flex-1 text-center py-2.5 rounded-lg text-sm font-bold transition-all ${splitByUnit
                          ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      🧩 Split by Unit
                    </button>
                    <button
                      onClick={() => { setSplitByUnit(false); setPromptText(''); setUnitPrompts([]); setUnitResponses({}); }}
                      className={`flex-1 text-center py-2.5 rounded-lg text-sm font-bold transition-all ${!splitByUnit
                          ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      📄 Single Prompt
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    {splitByUnit
                      ? 'One small prompt per unit — best for large banks (AIs won’t cut off the reply)'
                      : 'One prompt for the whole bank — fine for small banks'}
                  </p>
                </div>

                {/* ── SPLIT BY UNIT: one prompt + paste box per unit ── */}
                {splitByUnit && (
                  <div className="bg-white dark:bg-slate-900 rounded-lg border-2 border-pink-200 dark:border-pink-700 overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-pink-50 dark:bg-pink-900/20 border-b border-pink-100 dark:border-pink-900">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-pink-500 text-white text-xs font-bold">1</span>
                        Generate prompts (one per unit)
                      </h3>
                      <button
                        type="button"
                        onClick={handleGeneratePrompt}
                        disabled={promptLoading || selectedUnitIds.length === 0}
                        className="btn bg-gradient-to-r from-pink-600 to-purple-600 text-white text-sm px-4 py-2 gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {promptLoading
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Building...</>
                          : <><FileText className="w-4 h-4" /> {unitPrompts.length > 0 ? 'Rebuild' : 'Generate Prompts'}</>}
                      </button>
                    </div>
                    {unitPrompts.length > 0 ? (
                      <div className="p-4 space-y-4">
                        {unitPrompts.map(up => {
                          const key = String(up.unit_number);
                          const hasResp = (unitResponses[key] || '').trim().length > 0;
                          return (
                            <div key={key} className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                                <span className="text-sm font-bold text-pink-700 dark:text-pink-300 flex items-center gap-2">
                                  Unit {up.unit_number}{up.unit_title ? `: ${up.unit_title}` : ''}
                                  <span className="text-[10px] font-medium text-slate-400">{up.total_questions} Qs</span>
                                  {hasResp && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyUnitPrompt(up.prompt, up.unit_number)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${copiedUnit === up.unit_number
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-300 border border-pink-300 dark:border-pink-700 hover:bg-pink-50 dark:hover:bg-pink-900/20'}`}
                                >
                                  {copiedUnit === up.unit_number ? <><ClipboardCheck className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                                </button>
                              </div>
                              <div className="p-3 space-y-2">
                                <textarea
                                  readOnly
                                  value={up.prompt}
                                  rows={4}
                                  onClick={e => (e.target as HTMLTextAreaElement).select()}
                                  className="w-full text-[11px] font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-400 resize-y"
                                />
                                {/* Beautiful Animated AI Row */}
                                <div className="relative overflow-hidden rounded-2xl border border-pink-200 dark:border-pink-900/50 p-6 shadow-inner my-4">
                                  {/* Dedicated AI Logos Background */}
                                  <div className="absolute inset-0 z-0 pointer-events-none">
                                    <AILogosBackground />
                                  </div>
                                  
                                  <div className="relative z-10 flex flex-wrap items-center justify-center gap-6 md:gap-10">
                                    {AI_OPTIONS.map(ai => (
                                      <button
                                        key={ai.name}
                                        type="button"
                                        onClick={() => handleOpenAI(ai.url, up.prompt, up.unit_number)}
                                        title={`Copy & open ${ai.name}`}
                                        className="ai-logo-btn group relative flex items-center justify-center transition-all duration-500 hover:scale-[1.15] focus:outline-none"
                                      >
                                        {/* Clean white glow behind the logo */}
                                        <div className="absolute inset-[-10%] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl rounded-full bg-white/70 dark:bg-white/40 pointer-events-none" />
                                        <div className="absolute inset-[-5%] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-md rounded-full bg-white dark:bg-white/60 pointer-events-none" />
                                        
                                        <img 
                                          src={ai.logo} 
                                          alt={ai.name} 
                                          className="h-10 w-auto object-contain drop-shadow-sm group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.9)] transition-all duration-500 relative z-10" 
                                        />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <textarea
                                  value={unitResponses[key] || ''}
                                  onChange={e => setUnitResponses(prev => ({ ...prev, [key]: e.target.value }))}
                                  rows={4}
                                  placeholder={`Paste Unit ${up.unit_number}'s AI JSON response here…`}
                                  className="w-full text-[11px] font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-y"
                                />
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <ClipboardPaste className="w-3.5 h-3.5" />
                          Copy each unit's prompt into any AI, paste its reply in that unit's box, then click Generate below.
                        </p>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
                        Select your units &amp; pattern above, then click <span className="font-semibold">Generate Prompts</span>.
                      </div>
                    )}
                  </div>
                )}

                {/* Step 1: Generate & copy prompt (SINGLE) */}
                {!splitByUnit && (
                <div className="bg-white dark:bg-slate-900 rounded-lg border-2 border-pink-200 dark:border-pink-700 overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-pink-50 dark:bg-pink-900/20 border-b border-pink-100 dark:border-pink-900">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-pink-500 text-white text-xs font-bold">1</span>
                      Generate the prompt
                    </h3>
                    <button
                      type="button"
                      onClick={handleGeneratePrompt}
                      disabled={promptLoading || selectedUnitIds.length === 0}
                      className="btn bg-gradient-to-r from-pink-600 to-purple-600 text-white text-sm px-4 py-2 gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {promptLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Building...</>
                        : <><FileText className="w-4 h-4" /> {promptText ? 'Rebuild Prompt' : 'Generate Prompt'}</>}
                    </button>
                  </div>

                  {promptText ? (
                    <div className="p-4 space-y-3">
                      <div className="relative">
                        <textarea
                          readOnly
                          value={promptText}
                          rows={10}
                          onClick={e => (e.target as HTMLTextAreaElement).select()}
                          className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-400 resize-y"
                        />
                        <button
                          type="button"
                          onClick={handleCopyPrompt}
                          className={`absolute top-2 right-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all ${promptCopied
                              ? 'bg-emerald-500 text-white'
                              : 'bg-white dark:bg-slate-800 text-pink-600 dark:text-pink-300 border border-pink-300 dark:border-pink-700 hover:bg-pink-50 dark:hover:bg-pink-900/20'
                            }`}
                        >
                          {promptCopied ? <><ClipboardCheck className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>{promptText.length.toLocaleString()} characters</span>
                        {promptText.length > 12000 && (
                          <button type="button" onClick={() => setShowSplitSuggestion(true)} className="text-amber-600 dark:text-amber-400 font-medium underline decoration-dotted">
                            ⚠️ Large prompt — switch to Split by Unit?
                          </button>
                        )}
                      </div>
                      {/* One-click: copy prompt + open the chosen AI in a new tab (then Ctrl/Cmd+V) */}
                      <div className="pt-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 text-center">
                          Click an AI below — we&apos;ll <span className="font-semibold text-pink-500">copy the prompt</span> and open it. Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-mono mx-1">Ctrl/Cmd + V</kbd> to paste!
                        </p>
                        
                        {/* Beautiful Animated AI Row */}
                        <div className="relative overflow-hidden rounded-2xl border border-pink-200 dark:border-pink-900/50 p-6 shadow-inner">
                          {/* Dedicated AI Logos Background */}
                          <div className="absolute inset-0 z-0 pointer-events-none">
                            <AILogosBackground />
                          </div>
                          
                          <div className="relative z-10 flex flex-wrap items-center justify-center gap-6 md:gap-10">
                            {AI_OPTIONS.map(ai => (
                              <button
                                key={ai.name}
                                type="button"
                                onClick={() => handleOpenAI(ai.url)}
                                title={`Open ${ai.name}`}
                                className="ai-logo-btn group relative flex items-center justify-center transition-all duration-500 hover:scale-[1.15] focus:outline-none"
                              >
                                {/* Clean white glow behind the logo */}
                                <div className="absolute inset-[-10%] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl rounded-full bg-white/70 dark:bg-white/40 pointer-events-none" />
                                <div className="absolute inset-[-5%] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-md rounded-full bg-white dark:bg-white/60 pointer-events-none" />
                                
                                <img 
                                  src={ai.logo} 
                                  alt={ai.name} 
                                  className="h-10 md:h-12 w-auto object-contain drop-shadow-sm group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.9)] transition-all duration-500 relative z-10" 
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
                      Select your units &amp; pattern above, then click <span className="font-semibold">Generate Prompt</span>.
                    </div>
                  )}
                </div>
                )}

                {/* Step 2: Build Excel (single = paste box here; split = uses per-unit boxes above) */}
                <div className="bg-white dark:bg-slate-900 rounded-lg border-2 border-pink-200 dark:border-pink-700 overflow-hidden">
                  <div className="px-4 py-3 bg-pink-50 dark:bg-pink-900/20 border-b border-pink-100 dark:border-pink-900">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-pink-500 text-white text-xs font-bold">2</span>
                      {splitByUnit ? 'Build the Excel (merges all units)' : "Paste the AI's response"}
                    </h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {!splitByUnit && (
                      <textarea
                        value={promptResponse}
                        onChange={e => setPromptResponse(e.target.value)}
                        rows={8}
                        placeholder='Paste the AI&apos;s JSON response here, e.g. {"Part A": [ ... ], "Part B": [ ... ]}'
                        className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-pink-400 resize-y"
                      />
                    )}
                    <div className="flex flex-col gap-4 items-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5 text-center w-full">
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        {splitByUnit
                          ? 'Once every unit above has a pasted response, click Generate — they’re merged into one Excel.'
                          : 'The Excel is built from your pattern — minor formatting issues in the response are auto-repaired.'}
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerateFromResponse}
                        disabled={parsingResponse || (splitByUnit ? unitPrompts.length === 0 : !promptResponse.trim())}
                        className="btn bg-gradient-to-r from-pink-600 via-rose-500 to-orange-500 text-white text-sm px-8 py-3 gap-1.5 font-bold disabled:opacity-60 disabled:cursor-not-allowed w-full max-w-sm justify-center"
                      >
                        {parsingResponse
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Building Excel...</>
                          : <><Sparkles className="w-4 h-4" /> Generate Excel{splitByUnit ? ' from All Units' : ' from Response'}</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Your Question Banks */}
      <div className="card dark:!bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          {isHOD ? 'My Question Banks (HOD)' : 'Your Question Banks'}
        </h2>
        {isHOD && (
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Question banks you have generated. These are separate from staff submissions.
          </p>
        )}
        {!isHOD && (
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Your generated question banks.
          </p>
        )}
        {questionBanks.length === 0 ? (
          <p className="text-slate-600 dark:text-slate-300">No question banks generated yet.</p>
        ) : (
          <div className="space-y-3">
            {questionBanks.map(bank => (
              <div
                key={bank.id}
                onClick={() => setViewingBank(bank)}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 border-2 rounded-xl cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group ${bank.id === latestBankId
                    ? 'border-pink-400 dark:border-pink-500 shadow-xl shadow-pink-200/50 dark:shadow-pink-900/50 ring-2 ring-pink-300 dark:ring-pink-700 ring-offset-2'
                    : 'border-pink-100 dark:border-pink-800/80 hover:border-pink-300 dark:hover:border-pink-700'
                  }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors break-words">
                      {bank.title || 'Untitled'}
                    </p>
                    {bank.id === latestBankId && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-pink-500 to-rose-500 text-white animate-pulse shadow-sm shadow-pink-500/20">
                        ✓ Generated
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{getSubjectName(bank.subject_id)}</span>
                    <span className="mx-2 text-slate-300 dark:text-slate-700">•</span>
                    <span>{new Date(bank.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3 sm:mt-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setViewingBank(bank)} className="btn btn-secondary p-2.5 rounded-xl hover:text-pink-600 dark:hover:text-pink-400 transition-colors" title="View">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditingBankId(bank.id); setViewingBank(bank); }} className="btn btn-secondary p-2.5 rounded-xl hover:text-pink-600 dark:hover:text-pink-400 transition-colors" title="Edit Questions">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDownload(bank)} className="btn btn-secondary p-2.5 rounded-xl hover:text-pink-600 dark:hover:text-pink-400 transition-colors" title="Download Excel">
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDirectShare(bank)}
                    className="btn btn-secondary p-2.5 rounded-xl hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                    title="Share Excel directly via WhatsApp/Mail"
                  >
                    <Share2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </button>
                  <button onClick={() => handleDelete(bank.id)} className="btn btn-danger p-2.5 rounded-xl transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Modal */}
      {viewingBank && (
        <QuestionBankViewModal
          key={`${viewingBank.id}-${editingBankId === viewingBank.id ? 'edit' : 'view'}`}
          bank={viewingBank}
          subjectName={getSubjectName(viewingBank.subject_id)}
          initialEditMode={editingBankId === viewingBank.id}
          onClose={() => { setViewingBank(null); setEditingBankId(null); }}
          onDownload={() => handleDownload(viewingBank)}
          onUpdate={(updatedBank) => {
            setViewingBank(updatedBank);
            setQuestionBanks(prev => prev.map(b => b.id === updatedBank.id ? updatedBank : b));
          }}
        />
      )}

      {/* Split recommendation popup (large single prompt) */}
      {showSplitSuggestion && createPortal(
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowSplitSuggestion(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-7 max-w-md w-full mx-4 text-center border-2 border-amber-300 dark:border-amber-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-4xl mb-2">🧩</div>
            <h2 className="text-lg font-bold text-amber-600 dark:text-amber-400 mb-1">This prompt is large</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
              Big single prompts often get <span className="font-semibold">cut off</span> by free AI chats (they stop early or refuse).
              <span className="block mt-2">Switch to <span className="font-semibold">Split by Unit</span> — one small prompt per unit that the AI can finish, merged into one Excel.</span>
            </p>
            <div className="flex gap-3 justify-center">
              <button
                className="btn bg-gradient-to-r from-pink-600 to-purple-600 text-white px-5 py-2"
                onClick={() => {
                  setShowSplitSuggestion(false);
                  setSplitByUnit(true);
                  setPromptText('');
                  setUnitPrompts([]);
                  setUnitResponses({});
                }}
              >
                Switch to Split by Unit
              </button>
              <button className="btn btn-secondary px-5 py-2" onClick={() => setShowSplitSuggestion(false)}>
                Keep single
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Generation Success Popup */}
      {showSuccessPopup && successBank && createPortal(
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowSuccessPopup(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center border-2 border-pink-300 dark:border-pink-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-xl font-bold text-pink-600 dark:text-pink-400 mb-1">Question Bank Generated!</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-1 font-medium">{successBank.title || 'Untitled'}</p>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-6">Created successfully • {new Date(successBank.created_at).toLocaleString()}</p>
            <div className="flex gap-3 justify-center">
              <button
                className="btn btn-primary px-5 py-2"
                onClick={() => { setShowSuccessPopup(false); setViewingBank(successBank); }}
              >
                View Now
              </button>
              <button
                className="btn btn-secondary px-5 py-2"
                onClick={() => setShowSuccessPopup(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}


      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        isDangerous={confirmState.isDangerous}
        confirmText={confirmState.confirmText}
        alertOnly={confirmState.alertOnly}
      />
    </div>
  );
}

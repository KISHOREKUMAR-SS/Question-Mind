import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { subjectsApi, questionBankApi, staffApi, syllabusApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import {
  Save,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  CheckCircle2,
  X,
  BookOpen,
} from 'lucide-react';
import {
  Subject,
  QuestionPattern,
  PartConfiguration,
  BloomLevel,
  Syllabus,
  BTL_LABELS,
  ALL_BTL_LEVELS,
  createDefaultPart,
  MySubjectAssignment,
} from '../types';

export default function Patterns() {
  const { user } = useAuthStore();
  const isHOD = user?.role === 'HOD';

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [_pattern, setPattern] = useState<QuestionPattern | null>(null);
  const [editedParts, setEditedParts] = useState<PartConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [staffAssignments, setStaffAssignments] = useState<MySubjectAssignment[]>([]);
  // Tracks which part cards have the BTL distribution panel open
  const [showDistributions, setShowDistributions] = useState<Set<number>>(new Set());
  // Pattern mode tabs: 'combined' = part config editor, 'individual' = per-unit full config
  const [patternTab, setPatternTab] = useState<'combined' | 'individual'>('combined');
  const [syllabusForSubject, setSyllabusForSubject] = useState<Syllabus | null>(null);
  // unit_configs: string unitNumber → PartConfiguration[] (full per-unit config)
  const [unitConfigs, setUnitConfigs] = useState<Record<string, PartConfiguration[]>>({});
  // which [unitNum][partIdx] distribution panels are open
  const [showUnitDistributions, setShowUnitDistributions] = useState<Record<string, Set<number>>>({});
  // Warning toast when MCQ > total questions
  const [mcqWarning, setMcqWarning] = useState('');
  const [btlWarning, setBtlWarning] = useState('');

  const showMcqWarning = (max: number) => {
    setMcqWarning(`MCQ count can't exceed total questions (${max}). Reduce total questions first, then adjust MCQ count.`);
    setTimeout(() => setMcqWarning(''), 4000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const subjectsRes = await subjectsApi.getAll();
      const examSubjects = subjectsRes.data.filter(
        (s: Subject) => s.configuration?.hasExam !== false
      );

      setSubjects(examSubjects);
      try {
        const assignmentsRes = await staffApi.getMySubjects();
        setStaffAssignments(assignmentsRes.data || []);
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
        setError(err.response?.data?.detail || err.message || 'Failed to load subjects.');
      }
    } finally {
      setLoading(false);
    }
  };

  /** Initialize unitConfigs: copy parts template for every unit, zeroing per-unit customisation fields */
  const initUnitConfigs = (units: any[], parts: PartConfiguration[]): Record<string, PartConfiguration[]> => {
    const result: Record<string, PartConfiguration[]> = {};
    for (const unit of units) {
      result[String(unit.unitNumber)] = parts.map(p => ({ ...p, mcqCount: 0, btlDistribution: {} }));
    }
    return result;
  };

  /**
   * Merge updated global parts into existing unitConfigs.
   * Updates questionCount / marksPerQuestion / allowedBTLLevels from the global parts,
   * but PRESERVES per-unit mcqCount (clamped to new questionCount) and btlDistribution
   * (entries for BTL levels that are still active in the new global allowedBTLLevels).
   * Used when saving from Combined tab so QB-page per-unit customisations are not wiped.
   */
  const mergePartsIntoUnitConfigs = (
    units: any[],
    parts: PartConfiguration[],
    existing: Record<string, PartConfiguration[]>
  ): Record<string, PartConfiguration[]> => {
    const result: Record<string, PartConfiguration[]> = {};
    for (const unit of units) {
      const key = String(unit.unitNumber);
      const existingParts = existing[key];
      result[key] = parts.map((p, i) => {
        const prev = existingParts?.[i];
        const mcq = Math.min(prev?.mcqCount ?? 0, p.questionCount);
        const dist = prev?.btlDistribution
          ? Object.fromEntries(
              Object.entries(prev.btlDistribution).filter(([lvl]) =>
                (p.allowedBTLLevels ?? []).includes(lvl as any)
              )
            )
          : {};
        return { ...p, mcqCount: mcq, btlDistribution: dist };
      });
    }
    return result;
  };

  /** Migrate old unit_question_counts to new unit_configs by copying global parts and patching counts */
  const migrateFromUnitQuestionCounts = (
    units: any[],
    parts: PartConfiguration[],
    uqc: Record<string, Record<number, number>>
  ): Record<string, PartConfiguration[]> => {
    const result: Record<string, PartConfiguration[]> = {};
    for (const unit of units) {
      const uNum = unit.unitNumber;
      result[String(uNum)] = parts.map(p => {
        const count = (uqc[p.partName] ?? {})[uNum] ?? p.questionCount;
        return { ...p, questionCount: count, totalMarks: count * p.marksPerQuestion };
      });
    }
    return result;
  };

  const handleSubjectSelect = async (subject: Subject) => {
    setSelectedSubject(subject);
    setPattern(null);
    setError('');
    setShowSuccessModal(false);
    setSyllabusForSubject(null);
    setPatternTab('combined');
    setUnitConfigs({});
    setShowUnitDistributions({});

    let loadedParts: PartConfiguration[] = subject.configuration?.parts || [createDefaultPart(0)];
    // Reset mcqCount to 0 if it exceeds questionCount (stale/invalid data)
    loadedParts = loadedParts.map(p => {
      const mcq = p.mcqCount ?? 0;
      return mcq > p.questionCount ? { ...p, mcqCount: 0 } : p;
    });
    let loadedUnitConfigs: Record<string, PartConfiguration[]> = {};

    try {
      const response = await questionBankApi.getPattern(subject.id);
      setPattern(response.data);
      loadedParts = response.data.parts.map((p: PartConfiguration) => {
        const mcq = p.mcqCount ?? 0;
        return mcq > p.questionCount ? { ...p, mcqCount: 0 } : p;
      });
      setEditedParts(loadedParts);
      if (response.data.unit_configs && Object.keys(response.data.unit_configs).length > 0) {
        // Clamp stale mcqCount in saved per-unit configs
        loadedUnitConfigs = Object.fromEntries(
          Object.entries(response.data.unit_configs).map(([k, v]) => [
            k,
            (v as PartConfiguration[]).map(p => {
              const mcq = p.mcqCount ?? 0;
              return mcq > p.questionCount ? { ...p, mcqCount: 0 } : { ...p };
            }),
          ])
        );
        setPatternTab('individual');
      } else if (response.data.unit_question_counts &&
          Object.keys(response.data.unit_question_counts).length > 0) {
        // Legacy: will be migrated after syllabus loads
        loadedUnitConfigs = { __legacy__: response.data.unit_question_counts } as any;
        setPatternTab('individual');
      }
    } catch {
      setEditedParts(loadedParts);
    }

    // Load syllabus
    try {
      const syllabusRes = await syllabusApi.getBySubject(subject.id);
      const syllabusData = Array.isArray(syllabusRes.data) ? syllabusRes.data[0] : syllabusRes.data;
      if (syllabusData) {
        setSyllabusForSubject(syllabusData);
        const units = syllabusData.units || [];
        if ((loadedUnitConfigs as any).__legacy__) {
          // Migrate old unit_question_counts format
          const uqc = (loadedUnitConfigs as any).__legacy__ as Record<string, Record<number, number>>;
          loadedUnitConfigs = migrateFromUnitQuestionCounts(units, loadedParts, uqc);
        } else if (Object.keys(loadedUnitConfigs).length === 0) {
          loadedUnitConfigs = initUnitConfigs(units, loadedParts);
        }
      }
    } catch {
      // No syllabus yet — Individual tab will show a warning
      if ((loadedUnitConfigs as any).__legacy__) {
        loadedUnitConfigs = {};
      }
    }

    setUnitConfigs(loadedUnitConfigs);
  };

  const updatePart = (index: number, field: keyof PartConfiguration, value: any) => {
    const newParts = [...editedParts];
    if (field === 'mcqCount') {
      const total = newParts[index].questionCount;
      if (Number(value) > total) { showMcqWarning(total); return; }
    }
    newParts[index] = { ...newParts[index], [field]: value };
    // Auto-clamp mcqCount when questionCount is reduced below it
    if (field === 'questionCount') {
      const mcq = newParts[index].mcqCount ?? 0;
      if (mcq > Number(value)) {
        newParts[index] = { ...newParts[index], mcqCount: Number(value) };
      }
    }
    if (field === 'questionCount' || field === 'marksPerQuestion') {
      newParts[index].totalMarks = newParts[index].questionCount * newParts[index].marksPerQuestion;
    }
    setEditedParts(newParts);
  };

  const toggleBTL = (partIndex: number, level: BloomLevel) => {
    const newParts = [...editedParts];
    const current = newParts[partIndex].allowedBTLLevels || [];
    if (current.includes(level)) {
      newParts[partIndex].allowedBTLLevels = current.filter((l) => l !== level);
      // Remove its entry from distribution too
      if (newParts[partIndex].btlDistribution) {
        const dist = { ...newParts[partIndex].btlDistribution };
        delete dist[level];
        newParts[partIndex] = { ...newParts[partIndex], btlDistribution: dist };
      }
    } else {
      newParts[partIndex].allowedBTLLevels = [...current, level];
    }
    setEditedParts(newParts);
  };

  const updateBTLDistribution = (partIndex: number, level: BloomLevel, count: number) => {
    const part = editedParts[partIndex];
    const current = part.btlDistribution || {};
    const levels = part.allowedBTLLevels || [];
    const newSum = levels.reduce((s, btl) => s + (btl === level ? count : (current[btl] || 0)), 0);
    if (newSum > part.questionCount) {
      setBtlWarning(`Cannot exceed ${part.questionCount} questions. Adjust other values first.`);
      setTimeout(() => setBtlWarning(''), 4000);
      return;
    }
    const newParts = [...editedParts];
    newParts[partIndex] = {
      ...newParts[partIndex],
      btlDistribution: { ...current, [level]: count },
    };
    setEditedParts(newParts);
  };

  const hasNonzeroDistribution = (part: PartConfiguration): boolean =>
    Object.values(part.btlDistribution || {}).some((v) => (v || 0) > 0);

  const toggleDistributionPanel = (index: number) => {
    setShowDistributions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  /** Build a zeroed-out unit×part count grid (kept for legacy compat) */
  const _distributeEqually = (units: any[], parts: PartConfiguration[]) => {
    const result: Record<string, Record<number, number>> = {};
    for (const p of parts) result[p.partName ?? 'Part'] = Object.fromEntries(units.map((u: any) => [u.unitNumber, 0]));
    return result;
  };
  void _distributeEqually; // suppress unused warning

  const hasUnitConfigs = (): boolean => Object.keys(unitConfigs).length > 0;

  // ── Per-unit config helpers ──────────────────────────────────────────────────

  const updateUnitPart = (unitNum: string, partIdx: number, field: keyof PartConfiguration, value: any) => {
    setUnitConfigs(prev => {
      const unitParts = [...(prev[unitNum] || [])];
      if (field === 'mcqCount') {
        const total = unitParts[partIdx]?.questionCount ?? 0;
        if (Number(value) > total) { showMcqWarning(total); return prev; }
      }
      unitParts[partIdx] = { ...unitParts[partIdx], [field]: value };
      // Auto-clamp mcqCount when questionCount is reduced below it
      if (field === 'questionCount') {
        const mcq = unitParts[partIdx].mcqCount ?? 0;
        if (mcq > Number(value)) {
          unitParts[partIdx] = { ...unitParts[partIdx], mcqCount: Number(value) };
        }
      }
      if (field === 'questionCount' || field === 'marksPerQuestion') {
        unitParts[partIdx].totalMarks = unitParts[partIdx].questionCount * unitParts[partIdx].marksPerQuestion;
      }
      return { ...prev, [unitNum]: unitParts };
    });
  };

  const toggleUnitBTL = (unitNum: string, partIdx: number, level: BloomLevel) => {
    setUnitConfigs(prev => {
      const unitParts = [...(prev[unitNum] || [])];
      const current = unitParts[partIdx].allowedBTLLevels || [];
      if (current.includes(level)) {
        const dist = { ...(unitParts[partIdx].btlDistribution || {}) };
        delete dist[level];
        unitParts[partIdx] = { ...unitParts[partIdx], allowedBTLLevels: current.filter(l => l !== level), btlDistribution: dist };
      } else {
        unitParts[partIdx] = { ...unitParts[partIdx], allowedBTLLevels: [...current, level] };
      }
      return { ...prev, [unitNum]: unitParts };
    });
  };

  const updateUnitBTLDistribution = (unitNum: string, partIdx: number, level: BloomLevel, count: number) => {
    setUnitConfigs(prev => {
      const unitParts = [...(prev[unitNum] || [])];
      const pc = unitParts[partIdx];
      const existing = pc.btlDistribution || {};
      const levels = pc.allowedBTLLevels || [];
      const newSum = levels.reduce((s, btl) => s + (btl === level ? count : (existing[btl] || 0)), 0);
      if (newSum > pc.questionCount) {
        setBtlWarning(`Cannot exceed ${pc.questionCount} questions. Adjust other values first.`);
        setTimeout(() => setBtlWarning(''), 4000);
        return prev;
      }
      unitParts[partIdx] = {
        ...unitParts[partIdx],
        btlDistribution: { ...(unitParts[partIdx].btlDistribution || {}), [level]: count },
      };
      return { ...prev, [unitNum]: unitParts };
    });
  };

  const toggleUnitDistributionPanel = (unitNum: string, partIdx: number) => {
    setShowUnitDistributions(prev => {
      const cur = new Set(prev[unitNum] || []);
      if (cur.has(partIdx)) cur.delete(partIdx); else cur.add(partIdx);
      return { ...prev, [unitNum]: cur };
    });
  };

  const deleteUnit = (unitNum: string) => {
    setUnitConfigs(prev => {
      const next = { ...prev };
      delete next[unitNum];
      return next;
    });
  };

  const restoreUnit = (unitNum: string) => {
    setUnitConfigs(prev => {
      if (prev[unitNum]) return prev;
      return { ...prev, [unitNum]: editedParts.map(p => ({ ...p })) };
    });
  };

  const addPart = () => {
    const newPart = createDefaultPart(editedParts.length);
    setEditedParts(prev => [...prev, newPart]);
    // Sync new part to every unit's config
    setUnitConfigs(prev => {
      const updated: Record<string, PartConfiguration[]> = {};
      for (const [unitNum, parts] of Object.entries(prev)) {
        updated[unitNum] = [...parts, { ...newPart }];
      }
      return updated;
    });
  };

  const removePart = (index: number) => {
    setEditedParts(prev => prev.filter((_, i) => i !== index));
    // Remove same part index from every unit's config
    setUnitConfigs(prev => {
      const updated: Record<string, PartConfiguration[]> = {};
      for (const [unitNum, parts] of Object.entries(prev)) {
        updated[unitNum] = parts.filter((_, i) => i !== index);
      }
      return updated;
    });
  };

  const handleSave = async () => {
    if (!selectedSubject) return;

    setSaving(true);
    setError('');
    setShowSuccessModal(false);

    try {
      // When saving from Combined tab, merge updated global parts into existing per-unit configs.
      // This propagates new questionCount / marks / BTL levels while preserving per-unit
      // MCQ counts and BTL distributions (clamped/filtered to stay valid).
      const configsToSave = patternTab === 'combined' && syllabusForSubject?.units
        ? mergePartsIntoUnitConfigs(syllabusForSubject.units, editedParts, unitConfigs)
        : (hasUnitConfigs() ? unitConfigs : null);

      await questionBankApi.updatePattern(selectedSubject.id, {
        parts: editedParts,
        is_active: true,
        unit_configs: configsToSave,
        unit_question_counts: null,
      } as any);

      // Mirror parts back into Subject.configuration so Subjects page stays in sync
      try {
        const partsMapped = editedParts.map(p => ({
          partName: p.partName,
          questionCount: p.questionCount,
          marksPerQuestion: p.marksPerQuestion,
          totalMarks: p.questionCount * p.marksPerQuestion,
          allowedBTLLevels: p.allowedBTLLevels,
          description: p.description || '',
          mcqCount: p.mcqCount || 0,
        }));
        await subjectsApi.update(selectedSubject.id, {
          ...selectedSubject,
          configuration: {
            ...(selectedSubject.configuration || {}),
            parts: partsMapped,
            totalMarks: partsMapped.reduce((s, p) => s + p.totalMarks, 0),
          },
        });
      } catch {
        // Sync is best-effort — pattern is already saved
      }

      setSuccessMessage('Pattern saved successfully!');
      setShowSuccessModal(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save pattern');
    } finally {
      setSaving(false);
    }
  };

  const hasAccess = isHOD || staffAssignments.some((a) => a.canEditPattern);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-pink-600 dark:text-pink-400 animate-spin" />
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="card dark:!bg-slate-900 text-center py-12">
        <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Subjects Found</h3>
        <p className="text-slate-600 dark:text-slate-300">You haven't created any subjects yet. Head over to the Subjects page to create one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* MCQ overflow warning toast — rendered via portal so it appears above the pattern editor modal */}
      {mcqWarning && createPortal(
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[2147483647] flex items-start gap-3 px-5 py-4 bg-rose-600 text-white rounded-xl shadow-2xl shadow-rose-500/40 max-w-md w-full animate-in fade-in slide-in-from-top-3 duration-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium leading-snug">{mcqWarning}</p>
          <button onClick={() => setMcqWarning('')} className="ml-auto text-white/70 hover:text-white transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>,
        document.body
      )}
      {/* BTL overflow warning toast — rendered via portal so it appears above the pattern editor modal */}
      {btlWarning && createPortal(
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[2147483647] flex items-start gap-3 px-5 py-4 bg-rose-600 text-white rounded-xl shadow-2xl shadow-rose-500/40 max-w-md w-full animate-in fade-in slide-in-from-top-3 duration-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium leading-snug">{btlWarning}</p>
          <button onClick={() => setBtlWarning('')} className="ml-auto text-white/70 hover:text-white transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>,
        document.body
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-pink-600 dark:text-pink-400">🎨 Question Patterns</h1>
        <p className="text-purple-700 dark:text-purple-300 mt-1 font-medium">
          Configure question patterns for each subject (marks, count, Bloom's levels)
        </p>
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

      {/* Success Modal */}
      {showSuccessModal && createPortal(
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center border-2 border-emerald-100 dark:border-emerald-900 transform scale-100 transition-all">
            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Updated Successfully!
            </h3>
            <p className="text-slate-600 dark:text-slate-300 mb-8">
              {successMessage || 'The question pattern has been saved.'}
            </p>
            <button
              onClick={() => { setShowSuccessModal(false); setSelectedSubject(null); setSyllabusForSubject(null); setUnitConfigs({}); setShowUnitDistributions({}); setPatternTab('combined'); }}
              className="btn btn-primary w-full justify-center py-3 text-lg"
            >
              Okay, Got it
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Subject Selection - Always visible so modal pops over it */}
      <div className="card dark:!bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Select Subject</h2>
        {subjects.length === 0 ? (
          <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-900 dark:border-amber-800">
            <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-300 flex-shrink-0" />
            <div>
              <h3 className="text-amber-700 dark:text-amber-200 font-medium">No Subjects Found</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                You haven't created any subjects yet. Head over to the Subjects page to create one.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {subjects.map((subject) => (
              <button
                key={subject.id}
                onClick={() => handleSubjectSelect(subject)} // This sets selectedSubject, triggering the modal
                className="p-4 rounded-xl text-left transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg bg-white border-2 border-pink-200 hover:border-pink-400 dark:bg-slate-900 dark:border-slate-700 dark:hover:border-pink-500"
              >
                <p className="font-semibold text-slate-900 dark:text-white">{subject.name}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 font-mono">{subject.code}</p>
                {subject.configuration?.parts && (
                  <p className="text-xs text-slate-500 dark:text-slate-300 mt-2">
                    <span className="pill bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                      {subject.configuration.parts.length} parts
                    </span>
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pattern Editor Modal - Full Screen Popup */}
      {selectedSubject && createPortal(
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-black/60">
          {/* Modal Container */}
          <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-3xl max-h-[85vh] lg:max-h-[90vh] flex flex-col shadow-2xl border border-pink-200 dark:border-pink-700 overflow-hidden">

            {/* Modal Header */}
            <div className="flex-none bg-white dark:bg-slate-900 rounded-t-xl border-b border-pink-200 dark:border-pink-500">
              <div className="flex justify-between items-start px-6 pt-5 pb-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-2 sm:gap-3">
                    Pattern for {selectedSubject.name}
                    <span className="text-sm font-normal text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/30 px-3 py-1 rounded-full border border-pink-200 dark:border-pink-800 font-mono">
                      {selectedSubject.code}
                    </span>
                  </h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 mt-1 flex-shrink-0">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn btn-primary shadow-lg shadow-pink-500/20 py-2 px-4 text-sm"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save
                  </button>
                  <button
                    onClick={() => { setSelectedSubject(null); setSyllabusForSubject(null); setUnitConfigs({}); setShowUnitDistributions({}); setPatternTab('combined'); }}
                    className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors p-1"
                    title="Close"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              {/* Tab switcher moved outside of the flex justify-between header to allow 100% width on mobile */}
              <div className="px-4 sm:px-6 pb-4">
                <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full">
                  <button
                    onClick={() => setPatternTab('combined')}
                    className={`flex-1 text-center py-1.5 rounded-md text-sm font-semibold transition-all ${
                      patternTab === 'combined'
                        ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    🔀 Combined
                  </button>
                  <button
                    onClick={() => setPatternTab('individual')}
                    className={`flex-1 text-center py-1.5 rounded-md text-sm font-semibold transition-all ${
                      patternTab === 'individual'
                        ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    🎯 Individual
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Editor Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-900">
              {/* COMBINED TAB: part configuration editor */}
              {patternTab === 'combined' && (
                <div className="space-y-6">
              {editedParts.map((part, index) => (
                <div key={index} className="p-4 bg-white dark:bg-slate-900 border-2 border-pink-200 dark:border-pink-700 shadow-sm rounded-lg space-y-4 hover:shadow-md transition-shadow relative group">

                  {/* Part Header */}
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex items-center gap-3">
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-lg font-bold text-lg">
                        Part {String.fromCharCode(65 + index)}
                      </span>
                      <input
                        type="text"
                        value={part.description || ''}
                        onChange={(e) => updatePart(index, 'description', e.target.value)}
                        placeholder="e.g. Short Answer Questions"
                        className="bg-transparent border-none focus:ring-0 text-slate-600 dark:text-slate-400 p-0 text-sm w-64 placeholder:text-slate-400"
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      {editedParts.length > 1 && (
                        <button
                          onClick={() => removePart(index)}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Remove Part"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inputs Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Marks per Question</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={part.marksPerQuestion === 0 ? '' : part.marksPerQuestion}
                          onChange={(e) =>
                            updatePart(index, 'marksPerQuestion', e.target.value === '' ? 0 : Number(e.target.value))
                          }
                          className="input w-full pl-4 pr-4 py-2 font-mono text-lg"
                          min="1"
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">pts</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Questions</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={part.questionCount === 0 ? '' : part.questionCount}
                          onChange={(e) =>
                            updatePart(index, 'questionCount', e.target.value === '' ? 0 : Number(e.target.value))
                          }
                          className="input w-full pl-4 pr-4 py-2 font-mono text-lg"
                          min="1"
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">qs</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">MCQ Count</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={!part.mcqCount ? '' : part.mcqCount}
                          onChange={(e) => updatePart(index, 'mcqCount', e.target.value === '' ? 0 : Number(e.target.value))}
                          className={`input w-full pl-4 pr-4 py-2 font-mono text-lg ${(part.mcqCount ?? 0) > part.questionCount ? 'border-rose-500 ring-rose-500' : ''}`}
                          min="0"
                          max={part.questionCount}
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">mcqs</span>
                      </div>
                      {(part.mcqCount ?? 0) > 0 && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          {Number(part.mcqCount)} MCQ + {Number(part.questionCount) - Number(part.mcqCount)} Descriptive
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bloom's Taxonomy / K-Levels */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Bloom's Levels
                        <span className="ml-2 text-indigo-500 font-normal normal-case text-xs">(BTL = K-Level)</span>
                      </label>
                    </div>

                    {/* BTL / K-Level toggle buttons — rectangular */}
                    <div className="flex flex-wrap gap-2">
                      {ALL_BTL_LEVELS.map((btl, i) => {
                        const kLabel = `K${i + 1}`;
                        const active = part.allowedBTLLevels?.includes(btl);
                        return (
                          <button
                            key={btl}
                            onClick={() => toggleBTL(index, btl)}
                            title={BTL_LABELS[btl]}
                            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                              active
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30 hover:bg-purple-700 hover:shadow-lg hover:scale-105 active:scale-95'
                                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 hover:border-purple-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-700'
                            }`}
                          >
                            <span className="font-bold">{btl}</span>
                            <span className={`text-xs font-medium ${active ? 'opacity-80' : 'opacity-50'}`}>· {kLabel}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Distribution panel toggle */}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => toggleDistributionPanel(index)}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                          showDistributions.has(index)
                            ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-pink-500/30 hover:scale-105 active:scale-95'
                            : 'bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow shadow-pink-400/30 hover:from-pink-500 hover:to-purple-600 hover:shadow-md hover:scale-105 active:scale-95'
                        }`}
                      >
                        <span>{showDistributions.has(index) ? '▲' : '▼'}</span>
                        {showDistributions.has(index) ? 'Hide BTL Distribution' : 'Set BTL Distribution'}
                        {hasNonzeroDistribution(part) && !showDistributions.has(index) && (
                          <span className="ml-1 bg-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">set</span>
                        )}
                      </button>
                    </div>

                    {/* Distribution inputs */}
                    {showDistributions.has(index) && (
                      <div className="mt-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Set exact question count per BTL/K level — leave blank for automatic
                          </p>
                          {hasNonzeroDistribution(part) && (
                            <button
                              onClick={() => updatePart(index, 'btlDistribution' as keyof PartConfiguration, {})}
                              className="text-xs text-rose-500 hover:underline ml-2 whitespace-nowrap"
                            >
                              Clear all
                            </button>
                          )}
                        </div>

                        {(part.allowedBTLLevels?.length || 0) > 0 ? (
                          <div className="flex flex-wrap gap-3 items-center">
                            {part.allowedBTLLevels?.map((btl) => {
                              const kNum = ALL_BTL_LEVELS.indexOf(btl) + 1;
                              return (
                                <div key={btl} className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                                    {btl}/K{kNum}
                                  </span>
                                  <input
                                    type="number"
                                    value={part.btlDistribution?.[btl] || ''}
                                    onChange={(e) =>
                                      updateBTLDistribution(index, btl, e.target.value === '' ? 0 : Number(e.target.value))
                                    }
                                    className="!w-24 input text-sm py-1 px-2 text-center"
                                    min="0"
                                    max={part.questionCount}
                                    placeholder="auto"
                                  />
                                </div>
                              );
                            })}
                            {/* Running total validation */}
                            {(() => {
                              const total = part.allowedBTLLevels?.reduce(
                                (s, btl) => s + (part.btlDistribution?.[btl] || 0), 0
                              ) || 0;
                              if (total === 0) return null;
                              const auto = part.questionCount - total;
                              if (total === part.questionCount) {
                                return (
                                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    {total}/{part.questionCount} ✓
                                  </span>
                                );
                              }
                              return (
                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                  {total} specified + {auto} auto
                                </span>
                              );
                            })()}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Select BTL levels above first</p>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              ))}

              <button onClick={addPart} className="btn w-full justify-center py-6 border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-pink-500 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/10 rounded-xl transition-all group">
                <div className="flex flex-col items-center gap-2">
                  <Plus className="w-8 h-8 group-hover:scale-110 transition-transform" />
                  <span className="font-semibold">Add Another Part</span>
                </div>
              </button>

              <div className="h-8"></div> {/* Spacer */}
                </div>
              )}

              {/* INDIVIDUAL TAB: one full "Combined-style" card per CO/unit */}
              {patternTab === 'individual' && (
                <div className="space-y-6">
                  {!syllabusForSubject ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-900/20 dark:border-amber-800">
                      <p className="text-amber-700 dark:text-amber-300 text-sm font-medium">
                        ⚠️ No syllabus uploaded for this subject yet. Upload a syllabus first to configure per-unit patterns.
                      </p>
                    </div>
                  ) : (syllabusForSubject.units?.length ?? 0) === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No units found in the syllabus.</p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Each CO/unit has its own marks, question counts, MCQ count and BTL levels. Delete a unit to exclude it from generation.
                      </p>

                      {/* Active unit cards */}
                      {syllabusForSubject.units
                        .filter((unit: any) => !!unitConfigs[String(unit.unitNumber)])
                        .map((unit: any) => {
                          const unitNum = String(unit.unitNumber);
                          const unitParts = unitConfigs[unitNum] || [];
                          return (
                            <div key={unitNum} className="p-4 bg-white dark:bg-slate-900 border-2 border-pink-200 dark:border-pink-700 shadow-sm rounded-lg space-y-4 hover:shadow-md transition-shadow relative group">
                              {/* Unit card header */}
                              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4">
                                <div className="flex items-center gap-3">
                                  <span className="bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 px-3 py-1 rounded-lg font-bold text-lg">
                                    CO{unit.unitNumber}
                                  </span>
                                  <span className="font-semibold text-slate-800 dark:text-white text-sm">{unit.title}</span>
                                </div>
                                <button
                                  onClick={() => deleteUnit(unitNum)}
                                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                  title="Exclude this unit from question generation"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </div>

                              {/* Per-part configuration rows */}
                              {unitParts.map((part, pIdx) => (
                                <div key={pIdx} className="border border-slate-100 dark:border-slate-800 rounded-lg p-3 space-y-3">
                                  {/* Part label */}
                                  <div className="flex items-center gap-2">
                                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-bold text-xs">
                                      {part.partName}
                                    </span>
                                    {part.description && (
                                      <span className="text-xs text-slate-400 italic">{part.description}</span>
                                    )}
                                  </div>

                                  {/* 3-column grid: Marks per Question, Total Questions, MCQ Count */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Marks per Question</label>
                                      <div className="relative">
                                        <input
                                          type="number"
                                          value={part.marksPerQuestion === 0 ? '' : part.marksPerQuestion}
                                          onChange={e => updateUnitPart(unitNum, pIdx, 'marksPerQuestion', e.target.value === '' ? 0 : Number(e.target.value))}
                                          className="input w-full pl-3 pr-7 py-1.5 font-mono text-base"
                                          min="1" placeholder="0"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">pts</span>
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Questions</label>
                                      <div className="relative">
                                        <input
                                          type="number"
                                          value={part.questionCount === 0 ? '' : part.questionCount}
                                          onChange={e => updateUnitPart(unitNum, pIdx, 'questionCount', e.target.value === '' ? 0 : Number(e.target.value))}
                                          className="input w-full pl-3 pr-7 py-1.5 font-mono text-base"
                                          min="0" placeholder="0"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">qs</span>
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">MCQ Count</label>
                                      <div className="relative">
                                        <input
                                          type="number"
                                          value={!part.mcqCount ? '' : part.mcqCount}
                                          onChange={e => updateUnitPart(unitNum, pIdx, 'mcqCount', e.target.value === '' ? 0 : Number(e.target.value))}
                                          className="input w-full pl-3 pr-10 py-1.5 font-mono text-base"
                                          min="0" max={part.questionCount} placeholder="0"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">mcqs</span>
                                      </div>
                                      {(part.mcqCount ?? 0) > 0 && (
                                        <p className="text-xs text-blue-600 dark:text-blue-400">
                                          {part.mcqCount} MCQ + {part.questionCount - (part.mcqCount ?? 0)} Descriptive
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* BTL buttons */}
                                  <div className="flex flex-wrap gap-1.5">
                                    {ALL_BTL_LEVELS.map((btl, i) => {
                                      const kLabel = `K${i + 1}`;
                                      const active = part.allowedBTLLevels?.includes(btl);
                                      return (
                                        <button
                                          key={btl}
                                          onClick={() => toggleUnitBTL(unitNum, pIdx, btl)}
                                          title={BTL_LABELS[btl]}
                                          className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                                            active
                                              ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30 hover:bg-purple-700 hover:scale-105 active:scale-95'
                                              : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 hover:border-purple-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-700'
                                          }`}
                                        >
                                          <span className="font-bold">{btl}</span>
                                          <span className={`font-medium ${active ? 'opacity-80' : 'opacity-50'}`}>· {kLabel}</span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* BTL distribution toggle */}
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => toggleUnitDistributionPanel(unitNum, pIdx)}
                                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                                        showUnitDistributions[unitNum]?.has(pIdx)
                                          ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-pink-500/30 hover:scale-105 active:scale-95'
                                          : 'bg-gradient-to-r from-pink-400 to-purple-500 text-white shadow shadow-pink-400/30 hover:from-pink-500 hover:to-purple-600 hover:shadow-md hover:scale-105 active:scale-95'
                                      }`}
                                    >
                                      <span>{showUnitDistributions[unitNum]?.has(pIdx) ? '▲' : '▼'}</span>
                                      {showUnitDistributions[unitNum]?.has(pIdx) ? 'Hide BTL Distribution' : 'Set BTL Distribution'}
                                      {hasNonzeroDistribution(part) && !showUnitDistributions[unitNum]?.has(pIdx) && (
                                        <span className="ml-1 bg-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">set</span>
                                      )}
                                    </button>
                                  </div>

                                  {/* Distribution inputs */}
                                  {showUnitDistributions[unitNum]?.has(pIdx) && (
                                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800">
                                      <div className="flex flex-wrap gap-2 items-center">
                                        {ALL_BTL_LEVELS.map((btl, i) => {
                                          const active = part.allowedBTLLevels?.includes(btl);
                                          const kNum = i + 1;
                                          return (
                                            <div
                                              key={btl}
                                              onClick={() => toggleUnitBTL(unitNum, pIdx, btl)}
                                              title={active ? `Click to disable ${btl}` : `Click to enable ${btl}`}
                                              className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg font-bold border cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                                                active
                                                  ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700'
                                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-40 hover:opacity-70'
                                              }`}
                                            >
                                              <span className={`text-xs font-bold ${active ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`}>
                                                {btl}/K{kNum}
                                              </span>
                                              {active ? (
                                                <input
                                                  type="number"
                                                  value={part.btlDistribution?.[btl] || ''}
                                                  onClick={e => e.stopPropagation()}
                                                  onChange={e => updateUnitBTLDistribution(unitNum, pIdx, btl, e.target.value === '' ? 0 : Number(e.target.value))}
                                                  className="w-16 text-center text-sm font-bold border border-purple-300 dark:border-purple-700 rounded bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-400 py-0.5"
                                                  min="0" max={part.questionCount} placeholder="auto"
                                                />
                                              ) : (
                                                <span className="text-xs text-slate-400 font-normal">+ add</span>
                                              )}
                                            </div>
                                          );
                                        })}
                                        {(() => {
                                          const activeLevels = part.allowedBTLLevels || [];
                                          const total = activeLevels.reduce((s, btl) => s + (part.btlDistribution?.[btl] || 0), 0);
                                          if (total === 0) return null;
                                          const auto = part.questionCount - total;
                                          if (total === part.questionCount) {
                                            return (
                                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                {total}/{part.questionCount} ✓
                                              </span>
                                            );
                                          }
                                          return (
                                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                              {total} specified + {auto} auto
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}

                      {/* Excluded units — restore buttons */}
                      {(() => {
                        const excluded = syllabusForSubject.units.filter((unit: any) => !unitConfigs[String(unit.unitNumber)]);
                        if (excluded.length === 0) return null;
                        return (
                          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                              Excluded Units (no questions generated)
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {excluded.map((unit: any) => (
                                <button
                                  key={unit.unitNumber}
                                  onClick={() => restoreUnit(String(unit.unitNumber))}
                                  className="text-xs px-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-full text-slate-600 dark:text-slate-300 hover:border-pink-400 hover:text-pink-600 dark:hover:text-pink-400 transition-all"
                                  title="Restore this unit"
                                >
                                  + CO{unit.unitNumber}: {unit.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Add Part — syncs to Combined tab and all unit configs */}
                      <button onClick={addPart} className="btn w-full justify-center py-6 border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-pink-500 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/10 rounded-xl transition-all group">
                        <div className="flex flex-col items-center gap-2">
                          <Plus className="w-8 h-8 group-hover:scale-110 transition-transform" />
                          <span className="font-semibold">Add Another Part</span>
                          <span className="text-xs font-normal opacity-70">Also adds to Combined mode</span>
                        </div>
                      </button>

                      <div className="h-4" />
                    </>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}

    </div >
  );
}

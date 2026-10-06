import { useState, useRef, useCallback, useMemo } from 'react';
import { questionBankApi } from '../lib/api';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../lib/store';
import {
    Loader2,
    CheckCircle,
    CheckCircle2,
    XCircle,
    Send,
    X,
    Download,
    Pencil,
    Save,
    Plus,
    Trash2,
    ImagePlus,
} from 'lucide-react';
import { QuestionBank, Question, BloomLevel, ALL_BTL_LEVELS } from '../types';
import FormattedAnswer from './FormattedAnswer';

interface QuestionBankViewModalProps {
    bank: QuestionBank;
    subjectName: string;
    onClose: () => void;
    onDownload: () => void;
    onUpdate?: (updatedBank: QuestionBank) => void;
    initialEditMode?: boolean;
}

function makeBlankQuestion(unit: number): Question {
    return { question: '', unit, btl: 'BTL1', marks: 2, answer: '', isMCQ: false };
}

export default function QuestionBankViewModal({
    bank,
    subjectName,
    onClose,
    onDownload,
    onUpdate,
    initialEditMode = false,
}: QuestionBankViewModalProps) {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState<'questions' | 'answers'>('questions');

    // Part + Unit tab navigation (view & edit)
    const parts = bank.questions?.parts || {};
    const partNames = Object.keys(parts);
    const [activePart, setActivePart] = useState<string>(partNames[0] || '');

    // Unit sub-tabs — computed per part from current questions
    const getUnitNumbers = (qs: Question[]) => {
        const units = Array.from(new Set(qs.map(q => q.unit || 1))).sort((a, b) => a - b);
        return units.length > 0 ? units : [1];
    };

    // Edit mode state
    const [isEditing, setIsEditing] = useState(initialEditMode);
    const [editedParts, setEditedParts] = useState<Record<string, Question[]>>(() => {
        if (!initialEditMode) return {};
        const src: Record<string, any> = bank.questions?.parts || bank.questions || {};
        return JSON.parse(JSON.stringify(src));
    });
    const [activeUnitByPart, setActiveUnitByPart] = useState<Record<string, number>>({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);

    const canEdit = user?.id === bank.generated_by || user?.role === 'HOD';

    // ---- Edit mode helpers ----
    const enterEdit = () => {
        const clone: Record<string, Question[]> = {};
        for (const [p, qs] of Object.entries(parts)) {
            clone[p] = (qs as Question[]).map(q => ({ ...q, options: q.options ? { ...q.options } : undefined }));
        }
        setEditedParts(clone);
        setSaveError('');
        setIsEditing(true);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setEditedParts({});
        setSaveError('');
    };

    const updateQuestion = (partName: string, idx: number, field: keyof Question, value: any) => {
        setEditedParts(prev => {
            const updated = [...(prev[partName] || [])];
            updated[idx] = { ...updated[idx], [field]: value };
            // If unit changed, keep question in the same part array — unit sub-tab will update automatically
            return { ...prev, [partName]: updated };
        });
    };

    const updateOption = (partName: string, idx: number, opt: 'A' | 'B' | 'C' | 'D', value: string) => {
        setEditedParts(prev => {
            const updated = [...(prev[partName] || [])];
            const q = { ...updated[idx] };
            q.options = { A: '', B: '', C: '', D: '', ...(q.options || {}), [opt]: value };
            updated[idx] = q;
            return { ...prev, [partName]: updated };
        });
    };

    const toggleMCQ = (partName: string, idx: number, isMCQ: boolean) => {
        setEditedParts(prev => {
            const updated = [...(prev[partName] || [])];
            const q = { ...updated[idx], isMCQ };
            if (isMCQ && !q.options) q.options = { A: '', B: '', C: '', D: '' };
            updated[idx] = q;
            return { ...prev, [partName]: updated };
        });
    };

    const deleteQuestion = (partName: string, idx: number) => {
        setEditedParts(prev => {
            const updated = (prev[partName] || []).filter((_, i) => i !== idx);
            return { ...prev, [partName]: updated };
        });
    };

    const addQuestion = (partName: string, unit: number) => {
        setEditedParts(prev => ({
            ...prev,
            [partName]: [...(prev[partName] || []), makeBlankQuestion(unit)],
        }));
    };

    // Image upload per question
    const handleImageUpload = useCallback((partName: string, idx: number, file: File) => {
        questionBankApi.uploadImage(file)
            .then(res => { updateQuestion(partName, idx, 'imageData', res.data.url); })
            .catch(() => {
                const reader = new FileReader();
                reader.onload = () => { updateQuestion(partName, idx, 'imageData', reader.result as string); };
                reader.readAsDataURL(file);
            });
    }, []);

    // Save edited questions
    const handleSave = async () => {
        setSaving(true);
        setSaveError('');
        try {
            const response = await questionBankApi.updateQuestions(bank.id, {
                questions: { parts: editedParts },
            });
            const updatedBank: QuestionBank = response.data;
            setIsEditing(false);
            setEditedParts({});
            if (onUpdate) onUpdate(updatedBank);
            setShowSuccessPopup(true);
        } catch (err: any) {
            setSaveError(err?.response?.data?.detail || 'Failed to save changes. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const displayParts: Record<string, Question[]> = isEditing ? editedParts : parts;
    const currentPartQuestions: Question[] = displayParts[activePart] || [];
    const unitNumbers = useMemo(() => getUnitNumbers(currentPartQuestions), [currentPartQuestions]);
    const activeUnit = activeUnitByPart[activePart] ?? unitNumbers[0] ?? 1;
    // Ensure activeUnit is always valid for the current part
    const safeActiveUnit = unitNumbers.includes(activeUnit) ? activeUnit : (unitNumbers[0] ?? 1);
    const visibleQuestions = currentPartQuestions.filter(q => (q.unit || 1) === safeActiveUnit);
    // Global indices in the part array for visible questions (needed for edits)
    const visibleIndices = currentPartQuestions
        .map((q, i) => ({ q, i }))
        .filter(({ q }) => (q.unit || 1) === safeActiveUnit)
        .map(({ i }) => i);

    return createPortal(
        <>
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-4xl max-h-[85vh] lg:max-h-[90vh] flex flex-col shadow-2xl border border-pink-200 dark:border-pink-700 transform transition-all scale-100 opacity-100">

                {/* Fixed Header */}
                <div className="flex-none flex justify-between items-center p-6 border-b border-pink-200 dark:border-pink-700 bg-white dark:bg-slate-900 rounded-t-xl z-10">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{bank.title}</h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{subjectName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Questions/Answers tab toggle — view mode only */}
                        {!isEditing && (
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                <button
                                    onClick={() => setActiveTab('questions')}
                                    className={`px-3 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'questions'
                                        ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                >Questions</button>
                                <button
                                    onClick={() => setActiveTab('answers')}
                                    className={`px-3 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'answers'
                                        ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                >With Answers</button>
                            </div>
                        )}
                        {canEdit && !isEditing && (
                            <button onClick={enterEdit} className="btn btn-secondary px-3 py-2 gap-1.5 text-sm">
                                <Pencil className="w-4 h-4" />Edit
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-all">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Part tabs */}
                {partNames.length > 1 && (
                    <div className="flex-none flex gap-1 px-6 pt-4 pb-0 bg-white dark:bg-slate-900 border-b border-pink-100 dark:border-pink-900 overflow-x-auto">
                        {partNames.map(p => (
                            <button
                                key={p}
                                onClick={() => setActivePart(p)}
                                className={`px-5 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all whitespace-nowrap ${activePart === p
                                    ? 'border-pink-500 text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                            >{p}</button>
                        ))}
                    </div>
                )}

                {/* Unit sub-tabs */}
                {unitNumbers.length > 0 && (
                    <div className="flex-none flex gap-1 px-6 pt-3 pb-0 bg-white dark:bg-slate-900 overflow-x-auto">
                        {unitNumbers.map(u => (
                            <button
                                key={u}
                                onClick={() => setActiveUnitByPart(prev => ({ ...prev, [activePart]: u }))}
                                className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap ${safeActiveUnit === u
                                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-purple-100 dark:hover:bg-purple-900/30'}`}
                            >Unit {u}</button>
                        ))}
                    </div>
                )}

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50 dark:bg-slate-950/30">
                    {/* Part heading */}
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{isEditing ? '✏️' : activeTab === 'questions' ? '📖' : '📝'}</span>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white border-b-2 border-pink-200 dark:border-pink-800 pb-1 pr-4">
                            {activePart} — Unit {safeActiveUnit}
                        </h3>
                    </div>

                    {visibleQuestions.length === 0 && (
                        <p className="text-slate-400 dark:text-slate-500 text-sm italic py-8 text-center">No questions in this unit yet.</p>
                    )}

                    {visibleQuestions.map((q, localIdx) => {
                        const globalIdx = visibleIndices[localIdx];
                        return isEditing
                            ? <EditableQuestionCard
                                key={globalIdx}
                                q={q}
                                idx={localIdx}
                                partName={activePart}
                                allUnits={unitNumbers}
                                onUpdate={(field, val) => {
                                    updateQuestion(activePart, globalIdx, field, val);
                                    // If unit changed, switch the active unit sub-tab to follow the question
                                    if (field === 'unit') {
                                        setActiveUnitByPart(prev => ({ ...prev, [activePart]: val as number }));
                                    }
                                }}
                                onOptionUpdate={(opt, val) => updateOption(activePart, globalIdx, opt, val)}
                                onToggleMCQ={(isMCQ) => toggleMCQ(activePart, globalIdx, isMCQ)}
                                onDelete={() => deleteQuestion(activePart, globalIdx)}
                                onImageUpload={(file) => handleImageUpload(activePart, globalIdx, file)}
                              />
                            : <ReadonlyQuestionCard
                                key={globalIdx}
                                q={q}
                                idx={localIdx}
                                activeTab={activeTab}
                              />;
                    })}

                    {isEditing && (
                        <button
                            onClick={() => addQuestion(activePart, safeActiveUnit)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all text-sm font-medium mt-2"
                        >
                            <Plus className="w-4 h-4" />
                            Add Question to {activePart} — Unit {safeActiveUnit}
                        </button>
                    )}

                </div>

                {/* Fixed Footer */}
                <div className="flex-none border-t border-pink-200 dark:border-pink-700 p-6 bg-white dark:bg-slate-900 rounded-b-xl z-10">
                    {isEditing ? (
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                                {saveError && <p className="text-sm text-rose-600 dark:text-rose-400">{saveError}</p>}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={cancelEdit} disabled={saving}
                                    className="px-4 py-2 rounded-lg text-slate-800 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100 transition-colors text-sm font-medium">Cancel</button>
                                <button onClick={handleSave} disabled={saving}
                                    className="btn bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30 hover:scale-105 active:scale-95 transition-all">
                                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-end">
                            <button onClick={onDownload}
                                className="btn bg-gradient-to-r from-pink-500 via-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/30 hover:scale-105 active:scale-95 transition-all">
                                <Download className="w-5 h-5" />Download Excel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Success popup */}
        {showSuccessPopup && createPortal(
            <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-black/60">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center border-2 border-emerald-100 dark:border-emerald-900 transform scale-100 transition-all">
                    <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Saved Successfully!</h3>
                    <p className="text-slate-600 dark:text-slate-300 mb-8">Your question bank has been updated.</p>
                    <button
                        onClick={() => { setShowSuccessPopup(false); onClose(); }}
                        className="btn btn-primary w-full justify-center py-3 text-lg"
                    >Okay, Got it</button>
                </div>
            </div>,
            document.body
        )}
        </>,
        document.body
    );
}

// ---- Read-only question card ----
function ReadonlyQuestionCard({ q, idx, activeTab }: { q: Question; idx: number; activeTab: 'questions' | 'answers' }) {
    return (
        <div className="p-5 bg-white dark:bg-slate-900 border border-pink-200 dark:border-pink-700/50 rounded-xl hover:shadow-md hover:border-pink-300 dark:hover:border-pink-500 transition-all duration-300">
            <div className="flex justify-between items-start mb-3">
                <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400 font-bold text-sm shadow-sm ring-1 ring-pink-100 dark:ring-pink-900">
                    Q{idx + 1}
                </span>
                <div className="flex gap-2 flex-wrap justify-end">
                    <span className="px-2.5 py-1 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 text-xs font-medium rounded-md border border-purple-100 dark:border-purple-800">
                        Unit {q.unit}
                    </span>
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 text-xs font-medium rounded-md border border-indigo-100 dark:border-indigo-800">
                        {q.btl}
                    </span>
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 text-xs font-medium rounded-md border border-emerald-100 dark:border-emerald-800">
                        {q.marks} marks
                    </span>
                    {q.isMCQ && (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 text-xs font-medium rounded-md border border-amber-100 dark:border-amber-800">
                            MCQ
                        </span>
                    )}
                </div>
            </div>

            {/* Question image */}
            {q.imageData && (
                <div className="pl-10 mb-3">
                    <img
                        src={q.imageData.startsWith('/api/') ? `${import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000'}${q.imageData}` : q.imageData}
                        alt="Question diagram"
                        className="max-h-48 rounded-lg border border-slate-200 dark:border-slate-700 object-contain"
                    />
                </div>
            )}

            <p className="text-slate-800 dark:text-slate-200 leading-relaxed text-[15px] font-medium pl-10">
                {q.question}
            </p>

            {q.isMCQ && q.options && (
                <div className="mt-4 pl-10 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(q.options).map(([key, value]) => (
                        <div
                            key={key}
                            className={`p-3 rounded-lg text-sm border transition-colors ${activeTab === 'answers' && q.correctOption === key
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800 font-medium'
                                : 'bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-800'
                                }`}
                        >
                            <span className="font-bold mr-2">{key})</span> {value}
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'answers' && q.answer && (
                <div className="mt-4 pl-10 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Answer</div>
                    <FormattedAnswer answer={q.answer} />
                </div>
            )}
        </div>
    );
}

// ---- Editable question card ----
interface EditableCardProps {
    q: Question;
    idx: number;
    partName: string;
    allUnits: number[];
    onUpdate: (field: keyof Question, value: any) => void;
    onOptionUpdate: (opt: 'A' | 'B' | 'C' | 'D', value: string) => void;
    onToggleMCQ: (isMCQ: boolean) => void;
    onDelete: () => void;
    onImageUpload: (file: File) => void;
}

function EditableQuestionCard({ q, idx, allUnits, onUpdate, onOptionUpdate, onToggleMCQ, onDelete, onImageUpload }: EditableCardProps) {
    const fileRef = useRef<HTMLInputElement>(null);

    return (
        <div className="p-5 bg-white dark:bg-slate-900 border-2 border-purple-200 dark:border-purple-700/60 rounded-xl shadow-sm">
            {/* Card header: Q number + delete */}
            <div className="flex justify-between items-center mb-4">
                <span className="w-8 h-8 flex items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-bold text-sm">
                    Q{idx + 1}
                </span>
                <button
                    onClick={onDelete}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                    title="Delete question"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Meta row: unit, btl, marks */}
            <div className="flex flex-wrap gap-3 mb-4">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                    Unit
                    <select
                        value={q.unit || 1}
                        onChange={e => onUpdate('unit', parseInt(e.target.value) || 1)}
                        className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    >
                        {allUnits.map(u => <option key={u} value={u}>Unit {u}</option>)}
                        {/* Allow moving to a new unit number too */}
                        {!allUnits.includes((q.unit || 1)) && (
                            <option value={q.unit || 1}>Unit {q.unit || 1}</option>
                        )}
                    </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                    BTL
                    <select
                        value={q.btl}
                        onChange={e => onUpdate('btl', e.target.value as BloomLevel)}
                        className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    >
                        {ALL_BTL_LEVELS.map(lvl => (
                            <option key={lvl} value={lvl}>{lvl}</option>
                        ))}
                    </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                    Marks
                    <input
                        type="number"
                        min={1}
                        value={q.marks}
                        onChange={e => onUpdate('marks', parseInt(e.target.value) || 1)}
                        className="w-16 px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!q.isMCQ}
                        onChange={e => onToggleMCQ(e.target.checked)}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    MCQ
                </label>
            </div>

            {/* Question textarea */}
            <textarea
                value={q.question}
                onChange={e => onUpdate('question', e.target.value)}
                placeholder="Enter question text..."
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y mb-3"
            />

            {/* Image upload */}
            <div className="mb-3">
                {q.imageData ? (
                    <div className="relative inline-block">
                        <img
                            src={q.imageData}
                            alt="Question diagram"
                            className="max-h-40 rounded-lg border border-slate-200 dark:border-slate-700 object-contain"
                        />
                        <button
                            onClick={() => onUpdate('imageData', undefined)}
                            className="absolute top-1 right-1 p-1 bg-rose-600 text-white rounded-full shadow hover:bg-rose-700 transition-colors"
                            title="Remove image"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => fileRef.current?.click()}
                        className="btn btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg"
                    >
                        <ImagePlus className="w-3.5 h-3.5" />
                        Attach Image
                    </button>
                )}
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) onImageUpload(file);
                        e.target.value = '';
                    }}
                />
            </div>

            {/* MCQ options */}
            {q.isMCQ && (
                <div className="mb-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Options</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {(['A', 'B', 'C', 'D'] as const).map(opt => (
                            <div key={opt} className="flex items-center gap-2">
                                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs">{opt}</span>
                                <input
                                    type="text"
                                    value={q.options?.[opt] ?? ''}
                                    onChange={e => onOptionUpdate(opt, e.target.value)}
                                    placeholder={`Option ${opt}`}
                                    className="flex-1 px-2 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                                />
                            </div>
                        ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 mt-2">
                        Correct option:
                        <select
                            value={q.correctOption || ''}
                            onChange={e => onUpdate('correctOption', e.target.value as any)}
                            className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                        >
                            <option value="">— select —</option>
                            {(['A', 'B', 'C', 'D'] as const).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </label>
                </div>
            )}

            {/* Answer textarea */}
            <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Answer / Expected Answer</p>
                <textarea
                    value={q.answer || ''}
                    onChange={e => onUpdate('answer', e.target.value)}
                    placeholder="Enter expected answer (markdown supported)..."
                    rows={4}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y font-mono"
                />
            </div>
        </div>
    );
}

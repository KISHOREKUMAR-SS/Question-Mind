import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { subjectsApi, staffApi, questionBankApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { Combobox } from '../components/Combobox';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  BookOpen,
  Search,
  X,
  Users,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';
import {
  Subject,
  PartConfiguration,
  BloomLevel,
  ALL_BTL_LEVELS,
  BTL_LABELS,
  SubjectNature,
  SUBJECT_NATURE_LABELS,
  DEFAULT_PATTERNS,
  StaffAssignment,
  FacultyMember,
} from '../types';

export default function Subjects() {
  const { user } = useAuthStore();
  const isHOD = user?.role === 'HOD';

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  // Confirmation state for deleting subjects
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });

  useEffect(() => {
    loadSubjects();
  }, []);

  const loadSubjects = async () => {
    try {
      const response = await subjectsApi.getAll();
      setSubjects(response.data);
    } catch (err: any) {
      console.error(err);
      if (!err.response) {
        setError('Server is unreachable. Please check your connection (Not fetchable).');
      } else if (err.response.status === 404) {
        setSubjects([]);
      } else {
        setError(err.response?.data?.detail || err.message || 'Failed to load subjects.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Subject',
      message: 'Are you sure you want to delete this subject? associated Syllabus and Question Banks will also be permanently deleted. This action cannot be undone.',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await subjectsApi.delete(id);
          setSubjects(prev => prev.filter((s) => s.id !== id));
        } catch (err) {
          setError('Failed to delete subject');
        }
      },
    });
  };

  const filteredSubjects = subjects.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedSubjects = filteredSubjects.reduce((acc, subject) => {
    const sem = `Semester ${subject.semester}`;
    if (!acc[sem]) acc[sem] = [];
    acc[sem].push(subject);
    return acc;
  }, {} as Record<string, Subject[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-pink-600 dark:text-pink-400">📚 Subjects</h1>
          <p className="text-purple-700 dark:text-purple-300 mt-1 font-medium">Manage subjects and their exam configurations</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => {
              setEditingSubject(null);
              setShowModal(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5" />
            Add Subject
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full md:w-96">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-pink-500 dark:text-pink-400 pointer-events-none z-10" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search subjects..."
          className="input !pl-16 w-full dark:!bg-slate-950 dark:!text-white dark:!border-slate-800"
        />
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

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
        </div>
      ) : subjects.length === 0 ? (
        <div className="card dark:!bg-slate-900 text-center py-12">
          <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Subjects</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6">Get started by adding your first subject</p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary mx-auto">
            <Plus className="w-5 h-5" />
            Add Subject
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedSubjects)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([semester, semSubjects]) => (
              <div key={semester}>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 bg-gradient-to-br from-pink-100 to-purple-100 dark:from-slate-800 dark:to-slate-900 text-pink-700 dark:text-pink-300 rounded-lg flex items-center justify-center text-sm font-bold">
                    {semester.split(' ')[1]}
                  </span>
                  {semester}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {semSubjects.map((subject) => (
                    <SubjectCard
                      key={subject.id}
                      subject={subject}
                      isHOD={isHOD}
                      onEdit={() => {
                        setEditingSubject(subject);
                        setShowModal(true);
                      }}
                      onDelete={() => handleDelete(subject.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <SubjectModal
          subject={editingSubject}
          onClose={() => {
            setShowModal(false);
            setEditingSubject(null);
          }}
          onSave={() => {
            loadSubjects();
            setShowModal(false);
            setEditingSubject(null);
          }}
        />
      )}

      {showImportModal && (
        <StaffImportModal onClose={() => setShowImportModal(false)} />
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        isDangerous={confirmState.isDangerous}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}

function SubjectCard({
  subject,
  isHOD,
  onEdit,
  onDelete,
}: {
  subject: Subject;
  isHOD: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {

  const partsCount = subject.configuration?.parts?.length || 0;
  const hasExam = subject.configuration?.hasExam !== false;
  const natureLabel = subject.nature ? (SUBJECT_NATURE_LABELS[subject.nature] || subject.nature) : 'Theory';

  const natureColors: Record<string, string> = {
    THEORY: 'bg-gradient-to-r from-pink-100 to-purple-100 text-pink-800 border-2 border-pink-300 dark:from-slate-800 dark:to-slate-900 dark:text-pink-100 dark:border-pink-600',
    PRBL: 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-800 border-2 border-emerald-300 dark:from-emerald-900 dark:to-teal-950 dark:text-emerald-100 dark:border-emerald-600',
    PMBL: 'bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-800 border-2 border-purple-300 dark:from-slate-900 dark:to-slate-900 dark:text-purple-100 dark:border-purple-600',
    TCPR: 'bg-gradient-to-r from-orange-100 to-amber-100 text-orange-800 border-2 border-orange-300 dark:from-slate-900 dark:to-orange-900 dark:text-orange-100 dark:border-orange-600',
  };

  return (
    <div className="card dark:!bg-slate-900 p-6 hover:border-pink-300 dark:hover:border-pink-500 transition-all hover:shadow-pink-200/50 dark:hover:shadow-pink-500/20">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">{subject.name}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{subject.code}</p>
        </div>
        <span className={`px-2 py-1 text-xs rounded-lg ${natureColors[subject.nature] || 'bg-slate-100 text-slate-600 border-2 border-pink-200 dark:bg-slate-900 dark:text-slate-300 dark:border-pink-700'}`}>
          {natureLabel}
        </span>
      </div>

      <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
        <p>Credits: {subject.credits}</p>
        {hasExam && subject.nature !== 'PRBL' ? (
          <>
            <p>Parts: {partsCount}</p>
          </>
        ) : (
          <p className="text-amber-700 dark:text-amber-300">No Exam (Project Based)</p>
        )}
      </div>

      <div className="flex gap-2 mt-4 pt-4 border-t border-pink-200 dark:border-pink-700">
        <button onClick={onEdit} className="btn btn-secondary flex-1 justify-center">
          <Edit2 className="w-4 h-4" />
          Edit
        </button>
        <button onClick={onDelete} className="btn btn-danger">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function SubjectModal({
  subject,
  onClose,
  onSave,
}: {
  subject: Subject | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 2;
  const stepNames = ['Subject Details', 'Question Pattern'];
  const [formData, setFormData] = useState({
    code: subject?.code || '',
    name: subject?.name || '',
    semester: subject?.semester || 1,
    department: subject?.department || '',
    credits: subject?.credits || 3,
    nature: (subject?.nature || 'THEORY') as SubjectNature,
    hasExam: subject?.configuration?.hasExam ?? true,
    parts: subject?.configuration?.parts || [...DEFAULT_PATTERNS.THEORY],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Staff assignment state
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [assignedStaff, setAssignedStaff] = useState<Array<{
    email: string;
    name: string;
    canEditPattern: boolean;
    canGenerateQuestions: boolean;
    canApprove: boolean;
  }>>([]);
  const [loadingFaculty, setLoadingFaculty] = useState(false);

  // Autocomplete state
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load faculty list on mount - use empty array dependency to only run once
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoadingFaculty(true);
      try {
        const response = await staffApi.getFacultyList();
        if (mounted) {
          setFacultyList(response.data);
        }
      } catch (err) {
        console.error('Failed to load faculty list');
      } finally {
        if (mounted) {
          setLoadingFaculty(false);
        }
      }

      // Load existing assignments if editing
      if (subject && mounted) {
        try {
          const response = await staffApi.getSubjectStaff(subject.id);
          if (mounted) {
            const assignments = response.data.map((a: StaffAssignment) => ({
              email: a.staff_email,
              name: a.staff_name || '',
              canEditPattern: a.can_edit_pattern,
              canGenerateQuestions: a.can_generate_questions,
              canApprove: a.can_approve,
            }));
            setAssignedStaff(assignments);
          }
        } catch (err) {
          console.error('Failed to load staff assignments');
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []); // Empty dependency - only run once on mount

  // Initialize parts based on nature when editing
  useEffect(() => {
    if (subject && subject.configuration?.parts) {
      setFormData(prev => ({
        ...prev,
        parts: subject.configuration?.parts || [...DEFAULT_PATTERNS[subject.nature || 'THEORY']],
      }));
    }
  }, []);

  // Update parts when nature changes
  const handleNatureChange = (nature: SubjectNature) => {
    const defaultParts = [...DEFAULT_PATTERNS[nature]];
    const hasExam = nature !== 'PRBL';
    setFormData({
      ...formData,
      nature,
      hasExam,
      parts: defaultParts,
    });
  };

  // Autocomplete filtered suggestions
  const filteredFaculty = facultyList.filter(
    (f) =>
      !assignedStaff.some((a) => a.email === f.email) &&
      (f.name.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
        f.email.toLowerCase().includes(staffSearchQuery.toLowerCase()))
  );

  const addStaffFromSearch = (faculty: FacultyMember) => {
    setAssignedStaff([
      ...assignedStaff,
      {
        email: faculty.email,
        name: faculty.name,
        canEditPattern: false,
        canGenerateQuestions: true,
        canApprove: false,
      },
    ]);
    setStaffSearchQuery('');
    setShowSuggestions(false);
  };

  const removeStaff = (email: string) => {
    setAssignedStaff(assignedStaff.filter((s) => s.email !== email));
  };

  const updateStaffPermission = (email: string, permission: string, value: boolean) => {
    setAssignedStaff(
      assignedStaff.map((s) =>
        s.email === email ? { ...s, [permission]: value } : s
      )
    );
  };

  const handleSubmit = async () => {
    if (loading) return; // Prevent double submission

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Build configuration object properly
      const configuration = {
        hasExam: formData.hasExam,
        parts: formData.parts.map(p => ({
          partName: p.partName,
          questionCount: p.questionCount,
          marksPerQuestion: p.marksPerQuestion,
          totalMarks: p.questionCount * p.marksPerQuestion,
          allowedBTLLevels: p.allowedBTLLevels,
          description: p.description || '',
          mcqCount: p.mcqCount || 0,
        })),
        totalMarks: formData.parts.reduce((sum, p) => sum + (p.questionCount * p.marksPerQuestion), 0),
      };

      const data = {
        code: formData.code,
        name: formData.name,
        semester: formData.semester,
        department: formData.department,
        credits: formData.credits,
        nature: formData.nature,
        configuration,
      };

      let subjectId = subject?.id;

      if (subject) {
        await subjectsApi.update(subject.id, data);
      } else {
        const response = await subjectsApi.create(data);
        subjectId = response.data.id;
      }

      // Sync the QuestionPattern table so Patterns page stays up-to-date
      if (subjectId && formData.hasExam && formData.parts.length > 0) {
        try {
          await questionBankApi.updatePattern(subjectId, {
            parts: configuration.parts,
            is_active: true,
          });
        } catch {
          // Pattern sync is best-effort — don't fail subject save if it errors
        }
      }

      // Show success message before closing
      setSuccess(subject ? 'Subject updated successfully!' : 'Subject created successfully!');
      setTimeout(() => {
        onSave();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save subject');
      setLoading(false);
    }
  };

  const addPart = () => {
    const newPart: PartConfiguration = {
      partName: `Part ${String.fromCharCode(65 + formData.parts.length)}`,
      questionCount: 5,
      marksPerQuestion: 10,
      totalMarks: 50,
      allowedBTLLevels: ['BTL2', 'BTL3'],
    };
    setFormData({
      ...formData,
      parts: [...formData.parts, newPart],
    });
  };

  const updatePart = (index: number, field: keyof PartConfiguration, value: any) => {
    const newParts = [...formData.parts];
    newParts[index] = { ...newParts[index], [field]: value };
    if (field === 'questionCount' || field === 'marksPerQuestion') {
      newParts[index].totalMarks = newParts[index].questionCount * newParts[index].marksPerQuestion;
    }
    setFormData({ ...formData, parts: newParts });
  };

  const removePart = (index: number) => {
    setFormData({
      ...formData,
      parts: formData.parts.filter((_, i) => i !== index),
    });
  };

  const toggleBTL = (partIndex: number, btl: BloomLevel) => {
    const newParts = [...formData.parts];
    const current = newParts[partIndex].allowedBTLLevels;
    if (current.includes(btl)) {
      newParts[partIndex].allowedBTLLevels = current.filter((b) => b !== btl);
    } else {
      newParts[partIndex].allowedBTLLevels = [...current, btl];
    }
    setFormData({ ...formData, parts: newParts });
  };



  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-4xl max-h-[85vh] lg:max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-pink-200 dark:border-pink-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-pink-200 dark:border-pink-700">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {subject ? 'Edit Subject' : 'Create Subject'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Step Indicators */}
        <div className="px-6 py-4 border-b border-pink-200 dark:border-pink-700 bg-pink-50 dark:bg-slate-900 flex justify-center">
          <div className="flex items-center justify-between w-full max-w-md">
            {stepNames.map((name, idx) => {
              const stepNum = idx + 1;
              const isActive = currentStep === stepNum;
              const isCompleted = currentStep > stepNum;
              return (
                <button
                  key={name}
                  onClick={() => {
                    // Start basic validation for step 1 if trying to skip
                    if (currentStep === 1 && stepNum > 1) {
                      if (!formData.code.trim() || !formData.name.trim()) {
                        setError('Please fill in Subject Code and Name first');
                        return;
                      }
                    }
                    setError('');
                    setCurrentStep(stepNum);
                  }}
                  className={`flex items-center group focus:outline-none ${idx < totalSteps - 1 ? 'flex-1' : 'flex-none'}`}
                >
                  <div className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${isActive
                        ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg'
                        : isCompleted
                          ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                    >
                      {isCompleted ? '✓' : stepNum}
                    </div>
                    <span
                      className={`ml-2 text-sm font-medium ${isActive
                        ? 'text-pink-700 dark:text-pink-300'
                        : isCompleted
                          ? 'text-pink-700 dark:text-pink-300'
                          : 'text-slate-500 dark:text-slate-400'
                        }`}
                    >
                      {name}
                    </span>
                  </div>
                  {idx < totalSteps - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-4 ${isCompleted ? 'bg-gradient-to-r from-pink-500 to-purple-500' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm dark:bg-rose-900 dark:border-rose-800 dark:text-rose-200">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm flex items-center gap-2 dark:bg-emerald-900 dark:border-emerald-800 dark:text-emerald-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {success}
              </div>
            )}

            {/* Step 1: Details */}
            {currentStep === 1 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Subject Code</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="input"
                      placeholder="CS101"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Subject Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input"
                      placeholder="Data Structures"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Semester</label>
                    <Combobox
                      options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => `Semester ${s}`)}
                      value={formData.semester ? `Semester ${formData.semester}` : ''}
                      onChange={(val) => {
                        const num = parseInt(val.replace('Semester ', ''));
                        setFormData({ ...formData, semester: isNaN(num) ? 0 : num });
                      }}
                      placeholder="Select or type semester..."
                    />
                  </div>
                  <div>
                    <label className="label">Department</label>
                    <Combobox
                      options={['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'AI&DS']}
                      value={formData.department}
                      onChange={(val) => setFormData({ ...formData, department: val })}
                      placeholder="Select or type department..."
                    />
                  </div>
                </div>

                {/* Subject Nature */}
                <div>
                  <label className="label">Subject Nature / Type</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {(Object.keys(SUBJECT_NATURE_LABELS) as SubjectNature[]).map((nature) => (
                      <button
                        key={nature}
                        type="button"
                        onClick={() => handleNatureChange(nature)}
                        className={`p-3 rounded-lg border text-sm transition-all ${formData.nature === nature
                          ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm dark:bg-blue-900 dark:border-blue-800 dark:text-blue-100'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-slate-900 dark:border-pink-700 dark:text-slate-200'
                          }`}
                      >
                        <div className="font-medium">{nature}</div>
                        <div className="text-xs opacity-75">{SUBJECT_NATURE_LABELS[nature]}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* PRBL Warning */}
                {formData.nature === 'PRBL' && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 dark:bg-amber-900 dark:border-amber-800">
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-300 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-700 dark:text-amber-200 font-medium">Project Based Learning</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        This subject type does not have examinations. Question banks cannot be generated.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 2: Pattern */}
            {currentStep === 2 && (
              <>
                {formData.nature === 'PRBL' ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center dark:bg-amber-900 dark:border-amber-800">
                    <AlertCircle className="w-8 h-8 text-amber-600 mx-auto mb-2 dark:text-amber-300" />
                    <p className="text-amber-700 font-medium dark:text-amber-200">No Exam Pattern</p>
                    <p className="text-sm text-slate-600 mt-1 dark:text-slate-300">
                      PRBL subjects don't have examinations
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-medium text-slate-900 dark:text-white">Question Parts</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Configure exam question pattern</p>
                      </div>
                      <button type="button" onClick={addPart} className="btn btn-secondary text-sm">
                        <Plus className="w-4 h-4" />
                        Add Part
                      </button>
                    </div>

                    {formData.parts.map((part, index) => (
                      <PartEditor
                        key={index}
                        part={part}
                        index={index}
                        partsCount={formData.parts.length}
                        onUpdate={updatePart}
                        onRemove={removePart}
                        onToggleBTL={toggleBTL}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Step 3: Staff - Autocomplete Search */}
            {currentStep === 3 && (
              <div className="space-y-4">
                {/* Search Input with Autocomplete */}
                <div className="relative">
                  <label className="label">Search and Add Faculty</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={staffSearchQuery}
                      onChange={(e) => {
                        setStaffSearchQuery(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => {
                        // Delay hiding to allow click on suggestions
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      placeholder="Type to search faculty by name or email..."
                      className="input !pl-12 w-full"
                    />
                  </div>

                  {/* Autocomplete Suggestions Dropdown */}
                  {showSuggestions && staffSearchQuery && (
                    <div className="absolute z-20 mt-1 w-full bg-white rounded-lg shadow-lg border-2 border-pink-200 max-h-60 overflow-y-auto dark:bg-slate-900 dark:border-pink-700">
                      {loadingFaculty ? (
                        <div className="p-4 text-center text-slate-500 dark:text-slate-300">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                        </div>
                      ) : filteredFaculty.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 dark:text-slate-300">
                          No faculty found matching "{staffSearchQuery}"
                        </div>
                      ) : (
                        filteredFaculty.map((faculty) => (
                          <button
                            key={faculty.id}
                            type="button"
                            onClick={() => addStaffFromSearch(faculty)}
                            className="w-full px-4 py-3 text-left hover:bg-pink-50 dark:hover:bg-slate-800 flex items-center justify-between transition-colors"
                          >
                            <div>
                              <p className="text-slate-900 font-medium dark:text-slate-50">{faculty.name}</p>
                              <p className="text-sm text-slate-500 dark:text-slate-300">{faculty.email}</p>
                            </div>
                            {faculty.department && (
                              <span className="text-xs px-2 py-1 bg-pink-100 rounded text-pink-700 dark:bg-slate-900 dark:text-pink-200">
                                {faculty.department}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Assigned Staff List */}
                <div>
                  <h3 className="font-medium text-slate-900 dark:text-white mb-3">
                    Assigned Staff ({assignedStaff.length})
                  </h3>

                  {assignedStaff.length === 0 ? (
                    <div className="p-6 bg-white rounded-lg text-center border-2 border-pink-200 dark:bg-slate-900 dark:border-pink-700">
                      <Users className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      <p className="text-slate-600 dark:text-slate-300">No staff assigned yet</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Search and add faculty above</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {assignedStaff.map((staff) => (
                        <div
                          key={staff.email}
                          className="p-4 bg-white rounded-lg border-2 border-pink-200 dark:bg-slate-900 dark:border-pink-700"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="text-slate-900 font-medium dark:text-slate-50">{staff.name}</p>
                              <p className="text-sm text-slate-500 dark:text-slate-300">{staff.email}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeStaff(staff.email)}
                              className="text-rose-600 hover:text-rose-500 p-1 dark:text-rose-300 dark:hover:text-rose-200"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <label className="flex items-center gap-2.5 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={staff.canGenerateQuestions}
                                onChange={(e) =>
                                  updateStaffPermission(staff.email, 'canGenerateQuestions', e.target.checked)
                                }
                                className="w-5 h-5 rounded border-2 border-pink-300 dark:border-pink-600 text-pink-600 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 cursor-pointer transition-all hover:border-pink-500 dark:hover:border-pink-500 checked:bg-gradient-to-br checked:from-pink-500 checked:to-purple-600"
                                style={{ accentColor: '#EC4899' }}
                              />
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">Generate Questions</span>
                            </label>
                            <label className="flex items-center gap-2.5 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={staff.canEditPattern}
                                onChange={(e) =>
                                  updateStaffPermission(staff.email, 'canEditPattern', e.target.checked)
                                }
                                className="w-5 h-5 rounded border-2 border-pink-300 dark:border-pink-600 text-pink-600 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 cursor-pointer transition-all hover:border-pink-500 dark:hover:border-pink-500 checked:bg-gradient-to-br checked:from-pink-500 checked:to-purple-600"
                                style={{ accentColor: '#EC4899' }}
                              />
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">Edit Pattern</span>
                            </label>
                            <label className="flex items-center gap-2.5 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={staff.canApprove}
                                onChange={(e) =>
                                  updateStaffPermission(staff.email, 'canApprove', e.target.checked)
                                }
                                className="w-5 h-5 rounded border-2 border-pink-300 dark:border-pink-600 text-pink-600 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 cursor-pointer transition-all hover:border-pink-500 dark:hover:border-pink-500 checked:bg-gradient-to-br checked:from-pink-500 checked:to-purple-600"
                                style={{ accentColor: '#EC4899' }}
                              />
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">Approve</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer with Step Navigation */}
          <div className="p-6 border-t border-pink-200 bg-pink-50 flex gap-3 dark:border-pink-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>

            <div className="flex-1" />

            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep(currentStep - 1)}
                className="btn btn-secondary"
              >
                ← Previous
              </button>
            )}

            {currentStep < totalSteps ? (
              <button
                type="button"
                onClick={() => {
                  // Validate before moving to next step
                  if (currentStep === 1) {
                    if (!formData.code.trim() || !formData.name.trim()) {
                      setError('Please fill in Subject Code and Name');
                      return;
                    }
                  }
                  setError('');
                  setCurrentStep(currentStep + 1);
                }}
                className="btn btn-primary"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={handleSubmit}
                className="btn btn-success"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {subject ? 'Update Subject' : 'Create Subject'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PartEditor({
  part,
  index,
  partsCount,
  onUpdate,
  onRemove,
  onToggleBTL,
}: {
  part: PartConfiguration;
  index: number;
  partsCount: number;
  onUpdate: (index: number, field: keyof PartConfiguration, value: any) => void;
  onRemove: (index: number) => void;
  onToggleBTL: (index: number, btl: BloomLevel) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="p-4 bg-white rounded-lg border-2 border-pink-200 dark:bg-slate-900 dark:border-pink-700">
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-slate-900 font-medium dark:text-slate-50"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span className="text-blue-700 dark:text-blue-300">{part.partName}</span>
        </button>
        <div className="flex items-center gap-3">

          {partsCount > 1 && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="text-rose-600 hover:text-rose-500 dark:text-rose-300 dark:hover:text-rose-200"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">Part Name</label>
              <input
                type="text"
                value={part.partName}
                onChange={(e) => onUpdate(index, 'partName', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">Questions</label>
              <input
                type="number"
                value={part.questionCount}
                onChange={(e) => onUpdate(index, 'questionCount', Number(e.target.value))}
                className="input"
                min="1"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">Marks Each</label>
              <input
                type="number"
                value={part.marksPerQuestion}
                onChange={(e) => onUpdate(index, 'marksPerQuestion', Number(e.target.value))}
                className="input"
                min="1"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">MCQ Count</label>
              <input
                type="number"
                value={part.mcqCount || 0}
                onChange={(e) => onUpdate(index, 'mcqCount', Number(e.target.value))}
                className="input"
                min="0"
                max={part.questionCount}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-2 block">Description</label>
            <input
              type="text"
              value={part.description || ''}
              onChange={(e) => onUpdate(index, 'description', e.target.value)}
              className="input"
              placeholder="e.g., MCQ / Short Answer"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-2 block">Bloom's Levels (BTL)</label>
            <div className="flex flex-wrap gap-2">
              {ALL_BTL_LEVELS.map((btl) => (
                <button
                  key={btl}
                  type="button"
                  onClick={() => onToggleBTL(index, btl)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-all ${part.allowedBTLLevels.includes(btl)
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-600'
                    }`}
                >
                  {btl} - {BTL_LABELS[btl]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





// ── HOD Staff Import Modal ────────────────────────────────────────────────────
function StaffImportModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; assignments_added: number; errors: string[] } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const res = await staffApi.importExcel(file);
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Import failed. Please check your file and try again.');
    } finally {
      setImporting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-pink-200 dark:border-pink-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-pink-100 dark:border-pink-800 bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Import Staff from Excel</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Bulk-add faculty members via Excel upload</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!result ? (
            <>
              {/* File upload */}
              <div>
                <div
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    file
                      ? 'border-pink-400 bg-pink-50 dark:bg-pink-900/20 dark:border-pink-600'
                      : 'border-slate-300 dark:border-slate-600 hover:border-pink-300 dark:hover:border-pink-700 hover:bg-pink-50/50 dark:hover:bg-pink-900/10'
                  }`}
                >
                  <Upload className={`w-8 h-8 mx-auto mb-3 ${file ? 'text-pink-500' : 'text-slate-400'}`} />
                  {file ? (
                    <>
                      <p className="font-semibold text-pink-700 dark:text-pink-300">{file.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB • Click to change</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-slate-600 dark:text-slate-300">Click to upload Excel file</p>
                      <p className="text-xs text-slate-400 mt-1">.xlsx or .xls format</p>
                    </>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
                <button
                  onClick={handleImport}
                  disabled={!file || importing}
                  className="btn btn-primary flex-1 disabled:opacity-50"
                >
                  {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><Upload className="w-4 h-4" /> Import Staff</>}
                </button>
              </div>
            </>
          ) : (
            /* Result view */
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{result.created}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">New Staff Created</p>
                </div>
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{result.updated}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Existing Updated</p>
                </div>
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{result.assignments_added}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Subjects Assigned</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <p className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4" /> {result.errors.length} row(s) had issues:
                  </p>
                  <ul className="space-y-1">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-amber-600 dark:text-amber-400">• {e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.errors.length === 0 && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                    Import completed successfully with no errors!
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-400 dark:text-slate-500">
                Default password for new staff: <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">Welcome@123</code> (they should change it on first login)
              </p>

              <button onClick={onClose} className="btn btn-primary w-full">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

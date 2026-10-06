import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { subjectsApi, syllabusApi, staffApi, cdapApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import {
  Upload,
  Loader2,
  Eye,
  X,
  Edit2,
  Save,
  Trash2,
  AlertCircle,
  UploadCloud,
  BookOpen,
  Layers,
  Plus,
} from 'lucide-react';
import { Subject, Syllabus, SyllabusUnit, MySubjectAssignment, CDAP } from '../types';
import ConfirmationModal from '../components/ui/ConfirmationModal';

// Helper to clean text artifacts
function cleanText(text?: string): string {
  if (!text) return '';
  return text
    .replace(/â€¢/g, '•')
    .replace(/â€“/g, '-')
    .replace(/â€”/g, '--')
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€¦/g, '...')
    .replace(/Â/g, '')
    .replace(/Ã—/g, 'x')
    .trim();
}

export default function SyllabusPage(): JSX.Element {
  const { user } = useAuthStore();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [myAssignments, setMyAssignments] = useState<MySubjectAssignment[]>([]);
  const [syllabi, setSyllabi] = useState<Record<string, Syllabus>>({});
  const [cdaps, setCdaps] = useState<Record<string, CDAP>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadingCdap, setUploadingCdap] = useState<string | null>(null);
  const [viewingDetails, setViewingDetails] = useState<{
    syllabus?: Syllabus;
    cdap?: CDAP;
    initialTab: 'syllabus' | 'cdap';
    showTabs?: boolean;
  } | null>(null);
  const [error, setError] = useState('');

  // Confirmation state for top-level actions
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
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        syllabusApi.getAll(),
        subjectsApi.getAll()
      ];

      const results = await Promise.all(promises);
      const [syllabusRes, subjectsRes] = results;

      const syllabusMap: Record<string, Syllabus> = {};
      (syllabusRes.data || []).forEach((s: Syllabus) => {
        if (s && s.subject_id) syllabusMap[s.subject_id] = s;
      });
      setSyllabi(syllabusMap);
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

  const canUploadSyllabus = (subjectId: string): boolean => {
    return true;
  };

  // Fetch CDAPs for subjects
  const fetchCdaps = async (subjectIds: string[]) => {
    const cdapMap: Record<string, CDAP> = {};
    await Promise.all(
      subjectIds.map(async (sid) => {
        try {
          const res = await cdapApi.getBySubject(sid);
          if (res?.data) cdapMap[sid] = res.data;
        } catch {
          // ignore subjects without cdap
        }
      })
    );
    setCdaps(cdapMap);
  };

  useEffect(() => {
    if (subjects.length > 0) {
      fetchCdaps(subjects.map((s) => s.id));
    }
  }, [subjects]);

  const handleUpload = async (subjectId: string, file: File, inputElement?: HTMLInputElement) => {
    setUploading(subjectId);
    setError('');
    try {
      const response = await syllabusApi.upload(subjectId, file);
      const updatedSyllabus: Syllabus = response.data;
      setSyllabi((prev) => ({ ...prev, [subjectId]: updatedSyllabus }));

      if (viewingDetails?.syllabus && viewingDetails.syllabus.subject_id === subjectId) {
        setViewingDetails((prev) => (prev ? { ...prev, syllabus: updatedSyllabus } : prev));
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || 'Failed to upload syllabus');
    } finally {
      setUploading(null);
      if (inputElement) inputElement.value = '';
    }
  };

  const handleCdapUpload = async (subjectId: string, file: File, inputElement?: HTMLInputElement) => {
    setUploadingCdap(subjectId);
    setError('');
    try {
      const response = await cdapApi.upload(subjectId, file);
      const updatedCdap: CDAP = response.data;
      setCdaps((prev) => ({ ...prev, [subjectId]: updatedCdap }));

      if (viewingDetails && (viewingDetails.syllabus?.subject_id === subjectId || viewingDetails.cdap?.subject_id === subjectId)) {
        setViewingDetails((prev) => (prev ? { ...prev, cdap: updatedCdap } : prev));
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || 'Failed to upload CDAP');
    } finally {
      setUploadingCdap(null);
      if (inputElement) inputElement.value = '';
    }
  };

  const handleDeleteResource = async (resourceId: string, subjectId: string, type: 'syllabus' | 'cdap') => {
    setConfirmState({
      isOpen: true,
      title: `Delete ${type === 'syllabus' ? 'Syllabus' : 'CDAP'}`,
      message:
        type === 'syllabus'
          ? 'Are you sure you want to delete this syllabus? associated Question Banks will also be permanently deleted. This action cannot be undone.'
          : 'Are you sure you want to delete this CDAP? This action cannot be undone.',
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          if (type === 'syllabus') {
            await syllabusApi.delete(resourceId);
            setSyllabi((prev) => {
              const copy = { ...prev };
              delete copy[subjectId];
              return copy;
            });
            // Close the details viewer if it's showing the deleted syllabus
            setViewingDetails(prev => (prev?.syllabus?.subject_id === subjectId ? null : prev));
          } else {
            await cdapApi.delete(subjectId);
            setCdaps((prev) => {
              const copy = { ...prev };
              delete copy[subjectId];
              return copy;
            });
            // Remove CDAP from the details viewer; close it if no syllabus remains
            setViewingDetails(prev => {
              if (!prev || prev.cdap?.subject_id !== subjectId) return prev;
              return prev.syllabus ? { ...prev, cdap: undefined, showTabs: false } : null;
            });
          }
        } catch (err) {
          console.error(err);
          setError(`Failed to delete ${type}`);
        } finally {
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-pink-600 dark:text-pink-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-pink-600 dark:text-pink-400">📄 Syllabus Management</h1>
        <p className="text-purple-700 dark:text-purple-300 mt-1 font-medium">Upload and manage subject syllabi</p>
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

      {/* No subjects warning for staff */}
      {subjects.length === 0 && (
        <div className="card dark:!bg-slate-900 p-6">
          <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-900 dark:border-amber-800">
            <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-300 flex-shrink-0" />
            <div>
              <h3 className="text-amber-700 dark:text-amber-200 font-medium">No Subjects Found</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                You haven't created any subjects yet. Head over to the Subjects page to create one.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Subjects grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((subject) => {
          const syllabus = syllabi[subject.id];
          const isUploading = uploading === subject.id;
          const canUpload = canUploadSyllabus(subject.id);

          return (
            <div key={subject.id} className="card dark:!bg-slate-900 p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{subject.name}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{subject.code}</p>
                </div>
              </div>

              {/* Unified View if both exist */}
              {syllabus && cdaps[subject.id] && (
                <div className="mb-6">
                  {(syllabus.parsed_at || cdaps[subject.id].parsed_at) && (
                    <p className="text-sm text-left text-slate-600 dark:text-slate-300 mb-2">
                      Updated: {new Date(syllabus.parsed_at || cdaps[subject.id].parsed_at || Date.now()).toLocaleDateString()}
                    </p>
                  )}
                  <button
                    onClick={() => setViewingDetails({ syllabus, cdap: cdaps[subject.id], initialTab: 'syllabus', showTabs: true })}
                    className="w-full btn btn-primary bg-gradient-to-r from-pink-500 to-purple-600 border-none text-white shadow-md shadow-purple-500/20 group flex flex-col items-center py-2 h-auto"
                  >
                    <div className="flex items-center justify-center gap-2 group-hover:scale-105 transition-transform font-semibold">
                      <BookOpen className="w-4 h-4" />
                      <span>View Syllabus & CDAP</span>
                    </div>
                  </button>
                </div>
              )}

              {/* Syllabus Section */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-4 h-4 text-pink-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Syllabus</span>
                  {syllabus && (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs rounded-lg dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-800">
                      {(syllabus.units?.length) || 0} units
                    </span>
                  )}
                </div>

                {syllabus ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Uploaded: {syllabus.parsed_at ? new Date(syllabus.parsed_at).toLocaleDateString() : 'Unknown'}
                    </p>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewingDetails({ syllabus, cdap: cdaps[subject.id], initialTab: 'syllabus', showTabs: false })}
                        className="btn btn-secondary flex-1 justify-center text-sm"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Syllabus
                      </button>
                      <button
                        onClick={() => handleDeleteResource(syllabus.id, subject.id, 'syllabus')}
                        className="btn bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 p-2 rounded-lg transition-colors border-none"
                        title="Delete Syllabus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {canUpload && (
                      <label className="btn btn-secondary w-full justify-center cursor-pointer text-sm">
                        {isUploading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            Re-upload Syllabus
                          </>
                        )}
                        <input
                          type="file"
                          name={`reupload-syllabus-${subject.id}`}
                          accept=".pdf,.doc,.docx"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(subject.id, file, e.target);
                          }}
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">No syllabus uploaded</p>

                    {canUpload ? (
                      <label className="btn w-full justify-center cursor-pointer bg-pink-50 text-pink-700 hover:bg-pink-100 border border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800 dark:hover:bg-pink-900/50 shadow-sm transition-all md:text-sm">
                        {isUploading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            Upload Syllabus (PDF/DOCX)
                          </>
                        )}
                        <input
                          type="file"
                          name={`upload-syllabus-${subject.id}`}
                          accept=".pdf,.doc,.docx"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(subject.id, file, e.target);
                          }}
                        />
                      </label>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-300">Contact HOD to upload syllabus</p>
                    )}
                  </div>
                )}
              </div>

              {/* CDAP Section */}
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">CDAP</span>
                  {cdaps[subject.id] && (
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 text-xs rounded-lg dark:bg-purple-900 dark:text-purple-200 dark:border-purple-800">
                      {(cdaps[subject.id].units?.length) || 0} units
                    </span>
                  )}
                </div>

                {cdaps[subject.id] ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                      Uploaded: {cdaps[subject.id].parsed_at ? new Date(cdaps[subject.id].parsed_at!).toLocaleDateString() : 'Unknown'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewingDetails({ syllabus: syllabi[subject.id], cdap: cdaps[subject.id], initialTab: 'cdap', showTabs: false })}
                        className="btn btn-secondary flex-1 justify-center text-sm"
                      >
                        <BookOpen className="w-4 h-4 mr-2" />
                        View CDAP
                      </button>
                      <button
                        onClick={() => handleDeleteResource(cdaps[subject.id].id, subject.id, 'cdap')}
                        className="btn bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 p-2 rounded-lg transition-colors border-none"
                        title="Delete CDAP"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {canUpload && (
                      <label className="btn btn-secondary w-full justify-center cursor-pointer text-sm">
                        {uploadingCdap === subject.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            Re-upload CDAP
                          </>
                        )}
                        <input
                          type="file"
                          name={`reupload-cdap-${subject.id}`}
                          accept=".pdf,.doc,.docx,.xlsx,.xls"
                          className="hidden"
                          disabled={uploadingCdap === subject.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleCdapUpload(subject.id, file, e.target);
                          }}
                        />
                      </label>
                    )}
                  </div>
                ) : canUpload ? (
                  <label className="btn btn-secondary w-full justify-center cursor-pointer text-sm">
                    {uploadingCdap === subject.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload CDAP (PDF/EXCEL)
                      </>
                    )}
                    <input
                      type="file"
                      name={`upload-cdap-${subject.id}`}
                      accept=".pdf,.doc,.docx,.xlsx,.xls"
                      className="hidden"
                      disabled={uploadingCdap === subject.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleCdapUpload(subject.id, file, e.target);
                      }}
                    />
                  </label>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No CDAP uploaded</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unified Subject Details Modal */}
      {viewingDetails && (
        <SubjectDetailsModal
          syllabus={viewingDetails.syllabus}
          cdap={viewingDetails.cdap}
          initialTab={viewingDetails.initialTab}
          showTabs={viewingDetails.showTabs}
          onClose={() => setViewingDetails(null)}
          onUpdateSyllabus={(updated) => {
            setSyllabi((prev) => ({ ...prev, [updated.subject_id]: updated }));
            setViewingDetails((prev) => (prev ? { ...prev, syllabus: updated } : prev));
          }}
          onUploadSyllabusFile={(file) => {
            if (viewingDetails?.syllabus) {
              handleUpload(viewingDetails.syllabus.subject_id, file);
            }
          }}
          onUploadCdapFile={(file) => {
            if (viewingDetails?.syllabus) {
              handleCdapUpload(viewingDetails.syllabus.subject_id, file);
            } else if (viewingDetails?.cdap) {
              handleCdapUpload(viewingDetails.cdap.subject_id, file);
            }
          }}
          onUpdateCdap={(updated) => {
            setCdaps((prev) => ({ ...prev, [updated.subject_id]: updated }));
            setViewingDetails((prev) => (prev ? { ...prev, cdap: updated } : prev));
          }}
        />
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

/* ---------- SubjectDetailsModal component ---------- */

type SubjectDetailsModalProps = {
  syllabus?: Syllabus;
  cdap?: CDAP;
  initialTab?: 'syllabus' | 'cdap';
  showTabs?: boolean;
  onClose: () => void;
  onUpdateSyllabus: (s: Syllabus) => void;
  onUploadSyllabusFile: (file: File) => void;
  onUploadCdapFile: (file: File) => void;
  onUpdateCdap: (c: CDAP) => void;
};

function SubjectDetailsModal({
  syllabus,
  cdap,
  initialTab = 'syllabus',
  showTabs = true,
  onClose,
  onUpdateSyllabus,
  onUploadSyllabusFile,
  onUploadCdapFile,
  onUpdateCdap,
}: SubjectDetailsModalProps): JSX.Element | null {
  const [activeTab, setActiveTab] = useState<'syllabus' | 'cdap'>(initialTab);

  // Syllabus
  const [editing, setEditing] = useState(false);
  const [units, setUnits] = useState<SyllabusUnit[]>(syllabus?.units || []);
  const [saving, setSaving] = useState(false);
  const [syllabusTexts, setSyllabusTexts] = useState<Record<number, string>>({});

  // CDAP
  const [cdapUnitIdx, setCdapUnitIdx] = useState(0);
  const [cdapPartTab, setCdapPartTab] = useState<'part1' | 'part2'>('part1');
  const [editingCdap, setEditingCdap] = useState(false);
  const [localCdapUnits, setLocalCdapUnits] = useState<any[]>(cdap?.units || []);

  // Re-upload preview state

  const [previewingCdap, setPreviewingCdap] = useState(false);
  const [pendingCdapFile, setPendingCdapFile] = useState<File | null>(null);

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
    setUnits(syllabus?.units || []);
    if (syllabus?.units) {
      const texts: Record<number, string> = {};
      syllabus.units.forEach((unit, idx) => {
        texts[idx] = Array.isArray(unit.topics)
          ? unit.topics.map((t: any) => typeof t === 'string' ? t : t.topicName).join('\n')
          : '';
      });
      setSyllabusTexts(texts);
    }
  }, [syllabus]);

  // Sync / reset texts on edit-toggle
  useEffect(() => {
    if (syllabus?.units) {
      const texts: Record<number, string> = {};
      syllabus.units.forEach((unit, idx) => {
        texts[idx] = Array.isArray(unit.topics)
          ? unit.topics.map((t: any) => typeof t === 'string' ? t : t.topicName).join('\n')
          : '';
      });
      setSyllabusTexts(texts);
    }
  }, [editing, syllabus]);

  useEffect(() => {
    setLocalCdapUnits(cdap?.units || []);
  }, [cdap]);

  const triggerReupload = () => {
    const input = document.getElementById('reupload-syllabus-input') as HTMLInputElement | null;
    if (input) input.click();
  };

  const triggerCdapReupload = () => {
    const input = document.getElementById('reupload-cdap-input') as HTMLInputElement | null;
    if (input) input.click();
  };

  const handleSaveSyllabus = async () => {
    if (!syllabus) return;
    setSaving(true);
    try {
      // Clean up the units topics: filter out any empty lines or whitespace-only lines before sending to the server
      const cleanedUnits = units.map((u) => ({
        ...u,
        topics: (u.topics || [])
          .map((t: any) => {
            const name = typeof t === 'string' ? t : t.topicName;
            return { topicName: name?.trim() || '' };
          })
          .filter((t) => t.topicName !== '')
      }));

      const response = await syllabusApi.update(syllabus.id, { units: cleanedUnits });
      onUpdateSyllabus(response.data);
      setEditing(false);
    } catch (err) {
      console.error('Failed to save syllabus', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCdap = async () => {
    if (!cdap) return;
    setSaving(true);
    try {
      if (pendingCdapFile) {
        // upload file first
        await onUploadCdapFile(pendingCdapFile);
      }

      const cleanedUnits = localCdapUnits.map((u: any) => ({
        ...u,
        part1_topics: (u.part1_topics || []).filter((t: any) => {
          if (typeof t === 'string') return t.trim();
          return Boolean(t && (t.topic || t.topicName));
        }),
        part2_topics: (u.part2_topics || []).filter((t: any) => {
          if (typeof t === 'string') return t.trim();
          return Boolean(t && (t.topic || t.topicName));
        }),
      }));

      const response = await cdapApi.update(cdap.subject_id, { units: cleanedUnits });
      onUpdateCdap(response.data);

      setPendingCdapFile(null);

      setEditingCdap(false);
    } catch (err) {
      console.error('Failed to save CDAP', err);
    } finally {
      setSaving(false);
    }
  };

  // Modal portal guard (SSR-safe)
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-xl w-[95%] md:w-full max-w-4xl max-h-[85vh] lg:max-h-[90vh] flex flex-col shadow-2xl border border-pink-200 dark:border-pink-700 overflow-hidden transform transition-all">
        {/* Header */}
        <div className="flex-none flex flex-col sm:flex-row justify-between items-center p-4 border-b border-pink-200 dark:border-pink-500 bg-white dark:bg-slate-900 gap-4">
          <div className="flex items-center gap-4 w-full sm:w-auto overflow-x-auto no-scrollbar">
            {showTabs ? (
              <>
                <h2 className="text-lg md:text-xl font-semibold text-slate-900 dark:text-white truncate flex-shrink-0">
                  Subject Details
                </h2>

                <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <button
                    onClick={() => setActiveTab('syllabus')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'syllabus'
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    Syllabus
                  </button>
                  <button
                    onClick={() => setActiveTab('cdap')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'cdap'
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    CDAP
                  </button>
                </div>
              </>
            ) : (
              <h2 className="text-lg md:text-xl font-semibold text-slate-900 dark:text-white truncate flex-shrink-0 flex items-center gap-2">
                {activeTab === 'syllabus' ? (
                  <>
                    <BookOpen className="w-5 h-5 text-pink-500" />
                    Syllabus Details
                  </>
                ) : (
                  <>
                    <Layers className="w-5 h-5 text-purple-500" />
                    CDAP Details
                  </>
                )}
              </h2>
            )}
          </div>

          <div className="flex gap-2 items-center flex-shrink-0 self-end sm:self-center">
            {activeTab === 'cdap' && cdap && (
              <>
                <button onClick={triggerCdapReupload} className="btn btn-secondary text-xs sm:text-sm px-3 py-1.5 gap-1.5" title="Re-upload CDAP">
                  <UploadCloud className="w-4 h-4" />
                  <span className="hidden sm:inline">Re-upload</span>
                </button>

                {editingCdap ? (
                  <>
                    <button onClick={handleSaveCdap} disabled={saving} className="btn btn-primary text-xs sm:text-sm px-3 py-1.5 gap-1.5 shadow-lg shadow-pink-500/20">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span className="hidden sm:inline">Update</span>
                    </button>
                    <button
                      onClick={() => {
                        setEditingCdap(false);
                        setLocalCdapUnits(cdap.units || []);
                      }}
                      className="btn btn-secondary text-xs sm:text-sm px-3 py-1.5"
                    >
                      <X className="w-4 h-4" />
                      <span className="hidden sm:inline">Cancel</span>
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditingCdap(true)} className="btn btn-secondary text-xs sm:text-sm px-3 py-1.5 gap-1.5">
                    <Edit2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                )}
              </>
            )}

            {activeTab === 'syllabus' && syllabus && (
              <>
                <button onClick={triggerReupload} className="btn btn-secondary text-xs sm:text-sm px-3 py-1.5 gap-1.5" title="Re-upload Syllabus">
                  <UploadCloud className="w-4 h-4" />
                  <span className="hidden sm:inline">Re-upload</span>
                </button>

                {editing ? (
                  <>
                    <button onClick={handleSaveSyllabus} disabled={saving} className="btn btn-primary text-xs sm:text-sm px-3 py-1.5 gap-1.5 shadow-lg shadow-pink-500/20">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span className="hidden sm:inline">Update</span>
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false);
                        setUnits(syllabus.units || []);
                      }}
                      className="btn btn-secondary text-xs sm:text-sm px-3 py-1.5"
                    >
                      <X className="w-4 h-4" />
                      <span className="hidden sm:inline">Cancel</span>
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditing(true)} className="btn btn-secondary text-xs sm:text-sm px-3 py-1.5 gap-1.5">
                    <Edit2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                )}
              </>
            )}

            <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hidden file inputs for re-uploading */}
        <input
          id="reupload-syllabus-input"
          name="reupload-syllabus-input"
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setConfirmState({
                isOpen: true,
                title: 'Re-upload Syllabus?',
                message: 'This will replace the current syllabus content. Are you sure you want to continue?',
                confirmText: 'Re-upload',
                onConfirm: () => {
                  onUploadSyllabusFile(file);
                  setConfirmState((prev) => ({ ...prev, isOpen: false }));
                  setEditing(true);
                },
              });
            }
          }}
        />

        <input
          id="reupload-cdap-input"
          name="reupload-cdap-input"
          type="file"
          accept=".pdf,.doc,.docx,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            // show confirm then preview
            setConfirmState({
              isOpen: true,
              title: 'Re-upload CDAP?',
              message: 'This will replace the current CDAP content with the newly parsed file. Are you sure you want to continue?',
              confirmText: 'Re-upload',
              onConfirm: async () => {
                setConfirmState((prev) => ({ ...prev, isOpen: false }));
                setPreviewingCdap(true);
                setPendingCdapFile(file);
                try {
                  const response = await cdapApi.preview(file);

                  setLocalCdapUnits(response.data.units || []);
                  setEditingCdap(true);
                  setCdapUnitIdx(0);
                } catch (err: any) {
                  console.error('Preview failed:', err);
                  setTimeout(() => {
                    setConfirmState({
                      isOpen: true,
                      title: 'Preview Failed',
                      message: err?.response?.data?.detail || 'Failed to parse CDAP file. Please check the file format.',
                      confirmText: 'OK',
                      onConfirm: () => setConfirmState((prev) => ({ ...prev, isOpen: false })),
                    });
                  }, 100);
                  setPendingCdapFile(null);
                } finally {
                  setPreviewingCdap(false);
                }
              },
            });
            // reset input value so same file can be chosen again if needed
            if (e.target) e.target.value = '';
          }}
        />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/30 dark:bg-black/20">
          {/* SYLLABUS VIEW */}
          {activeTab === 'syllabus' && (
            <>
              {syllabus ? (
                <div className="space-y-6">
                  {units.map((unit, index) => (
                    <div key={index} className="p-4 bg-white rounded-xl shadow-sm border border-pink-200 dark:bg-slate-800 dark:border-pink-900/50 group transition-all hover:shadow-md hover:border-pink-300 dark:hover:border-pink-700">
                      <div className="flex justify-between items-start mb-3 gap-2">
                        {editing ? (
                          <input
                            type="text"
                            value={unit.title}
                            onChange={(e) => {
                              const newUnits = [...units];
                              newUnits[index] = { ...newUnits[index], title: e.target.value };
                              setUnits(newUnits);
                            }}
                            className="input flex-1 mr-2 min-w-0"
                          />
                        ) : (
                          <h3 className="font-semibold text-slate-900 dark:text-white text-base md:text-lg break-words leading-tight">
                            <span className="text-pink-600 dark:text-pink-400 mr-2 font-bold whitespace-nowrap">Unit {unit.unitNumber}:</span>
                            {unit.title}
                          </h3>
                        )}
                        {editing && units.length > 1 && (
                          <button
                            onClick={() => {
                              const newUnits = units.filter((_, i) => i !== index);
                              setUnits(newUnits);
                            }}
                            className="flex-shrink-0 p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                        <div>
                          {editing ? (
                            <textarea
                              value={syllabusTexts[index] !== undefined ? syllabusTexts[index] : ''}
                              onChange={(e) => {
                                const newText = e.target.value;
                                setSyllabusTexts((prev) => ({ ...prev, [index]: newText }));
                                
                                const newUnits = [...units];
                                newUnits[index] = {
                                  ...newUnits[index],
                                  topics: newText.split('\n').map((line) => ({ topicName: line })),
                                };
                                setUnits(newUnits);
                              }}
                              className="input h-32 resize-none text-sm leading-relaxed w-full font-sans border-slate-200 focus:border-pink-500"
                              placeholder="One topic per line. Press Enter to start a new topic."
                            />
                          ) : (
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                              {(unit.topics || []).map((topic: any, i: number) => (
                                <li key={i} className="text-slate-700 dark:text-slate-300 text-sm flex items-start gap-2.5 p-1 rounded hover:bg-pink-50 dark:hover:bg-slate-700/50 transition-colors break-words">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-pink-400 mt-1.5 flex-shrink-0" />
                                  <span>{cleanText(typeof topic === 'string' ? topic : topic.topicName)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                  ))}

                  {editing && (
                    <button
                      onClick={() => setUnits([...units, { unitNumber: units.length + 1, title: 'New Unit', topics: [] } as SyllabusUnit])}
                      className="btn btn-secondary w-full justify-center border-dashed border-2 hover:border-pink-300 dark:hover:border-pink-700 py-4 bg-transparent"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-semibold">+ Add Unit</span>
                        <span className="text-xs font-normal opacity-70">Create a new unit section</span>
                      </div>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 dark:text-slate-400">
                  <BookOpen className="w-12 h-12 mb-4 opacity-20" />
                  <p>No syllabus content available.</p>
                </div>
              )}
            </>
          )}

          {/* CDAP VIEW */}
          {activeTab === 'cdap' && (
            <>
              {cdap ? (
                <div className="space-y-6">
                  {/* Preview Banner */}
                  {pendingCdapFile && (
                    <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3 flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">📄 Previewing: {pendingCdapFile.name}</p>
                        <p className="text-xs text-blue-600 dark:text-blue-300">Review the parsed content below. Click "Update" to save changes.</p>
                      </div>
                      <button
                        onClick={() => {
                          setPendingCdapFile(null);

                          setLocalCdapUnits(cdap.units || []);
                          setEditingCdap(false);
                        }}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-300 text-sm underline"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {previewingCdap && (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
                      <span className="ml-3 text-slate-600 dark:text-slate-400">Parsing CDAP file...</span>
                    </div>
                  )}

                  {/* Unit Tabs */}
                  <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto scrollbar-hide bg-slate-50/50 dark:bg-slate-900/50 rounded-lg">
                    {((editingCdap ? localCdapUnits : cdap.units) || []).map((unit: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setCdapUnitIdx(idx);
                          setCdapPartTab('part1');
                        }}
                        className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${cdapUnitIdx === idx
                          ? 'text-purple-600 border-b-2 border-purple-600 dark:text-purple-400 bg-white dark:bg-slate-800'
                          : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
                          }`}
                      >
                        Unit {unit.unit_number ?? unit.unitNumber ?? idx + 1}
                      </button>
                    ))}
                  </div>

                  {/* Content */}
                  {((editingCdap ? localCdapUnits : cdap.units) || [])[cdapUnitIdx] ? (
                    <div>
                      {editingCdap ? (
                        <input
                          type="text"
                          value={localCdapUnits[cdapUnitIdx]?.unit_name || ''}
                          onChange={(e) => {
                            const newUnits = [...localCdapUnits];
                            newUnits[cdapUnitIdx] = { ...newUnits[cdapUnitIdx], unit_name: e.target.value };
                            setLocalCdapUnits(newUnits);
                          }}
                          className="input w-full text-lg font-semibold text-slate-900 dark:text-white mb-4"
                          placeholder="Unit Name"
                        />
                      ) : (
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 break-words">
                          {cdap.units?.[cdapUnitIdx]?.unit_name || 'Unit'}
                        </h3>
                      )}

                      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                        <button
                          onClick={() => setCdapPartTab('part1')}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${cdapPartTab === 'part1'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                        >
                          Part 1 ({((editingCdap ? localCdapUnits : cdap.units)?.[cdapUnitIdx]?.part1_topics?.length) || 0})
                        </button>
                        <button
                          onClick={() => setCdapPartTab('part2')}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${cdapPartTab === 'part2'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                        >
                          Part 2 ({((editingCdap ? localCdapUnits : cdap.units)?.[cdapUnitIdx]?.part2_topics?.length) || 0})
                        </button>
                      </div>

                      <div className="space-y-2">
                        {editingCdap ? (
                          <div className="h-96 overflow-y-auto pr-1 space-y-4 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent pb-4">
                            {((cdapPartTab === 'part1'
                              ? localCdapUnits[cdapUnitIdx]?.part1_topics
                              : localCdapUnits[cdapUnitIdx]?.part2_topics) || []
                            ).map((t: any, idx: number) => {
                              const topicText = typeof t === 'string' ? t : t?.topic || t?.topicName || '';


                              return (
                                <div key={idx} className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm relative group transition-all hover:border-purple-300 dark:hover:border-purple-700">
                                  <button
                                    onClick={() => {
                                      const newUnits = [...localCdapUnits];
                                      const currentTopics = [...(cdapPartTab === 'part1' ? newUnits[cdapUnitIdx].part1_topics : newUnits[cdapUnitIdx].part2_topics)];
                                      currentTopics.splice(idx, 1);
                                      if (cdapPartTab === 'part1') newUnits[cdapUnitIdx].part1_topics = currentTopics;
                                      else newUnits[cdapUnitIdx].part2_topics = currentTopics;
                                      setLocalCdapUnits(newUnits);
                                    }}
                                    className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                                    title="Remove Topic"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Topic {idx + 1}</label>
                                      <input
                                        id={`cdap-topic-input-${idx}`}
                                        type="text"
                                        value={topicText}
                                        onChange={(e) => {
                                          const newUnits = [...localCdapUnits];
                                          const currentTopics = [...(cdapPartTab === 'part1' ? newUnits[cdapUnitIdx].part1_topics : newUnits[cdapUnitIdx].part2_topics)];
                                          const newVal = e.target.value;
                                          if (typeof currentTopics[idx] === 'string') {
                                            currentTopics[idx] = { topic: newVal, subtopics: [] };
                                          } else {
                                            currentTopics[idx] = { ...currentTopics[idx], topic: newVal };
                                          }
                                          if (cdapPartTab === 'part1') newUnits[cdapUnitIdx].part1_topics = currentTopics;
                                          else newUnits[cdapUnitIdx].part2_topics = currentTopics;
                                          setLocalCdapUnits(newUnits);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const newUnits = [...localCdapUnits];
                                            const currentTopics = [...(cdapPartTab === 'part1' ? newUnits[cdapUnitIdx].part1_topics : newUnits[cdapUnitIdx].part2_topics)];
                                            const newTopic = { topic: '', subtopics: [] };
                                            currentTopics.splice(idx + 1, 0, newTopic);
                                            if (cdapPartTab === 'part1') newUnits[cdapUnitIdx].part1_topics = currentTopics;
                                            else newUnits[cdapUnitIdx].part2_topics = currentTopics;
                                            setLocalCdapUnits(newUnits);
                                            
                                            // Auto-focus the new input
                                            setTimeout(() => {
                                              const nextInput = document.getElementById(`cdap-topic-input-${idx + 1}`);
                                              if (nextInput) {
                                                (nextInput as HTMLInputElement).focus();
                                              }
                                            }, 50);
                                          } else if (e.key === 'Backspace' && topicText === '') {
                                            const newUnits = [...localCdapUnits];
                                            const currentTopics = [...(cdapPartTab === 'part1' ? newUnits[cdapUnitIdx].part1_topics : newUnits[cdapUnitIdx].part2_topics)];
                                            if (currentTopics.length > 1) {
                                              e.preventDefault();
                                              currentTopics.splice(idx, 1);
                                              if (cdapPartTab === 'part1') newUnits[cdapUnitIdx].part1_topics = currentTopics;
                                              else newUnits[cdapUnitIdx].part2_topics = currentTopics;
                                              setLocalCdapUnits(newUnits);
                                              
                                              // Focus previous input
                                              setTimeout(() => {
                                                const prevInput = document.getElementById(`cdap-topic-input-${idx - 1}`);
                                                if (prevInput) {
                                                  (prevInput as HTMLInputElement).focus();
                                                }
                                              }, 50);
                                            }
                                          }
                                        }}
                                        className="input w-full font-medium text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-600 focus:border-purple-500"
                                        placeholder="Topic Name"
                                      />
                                    </div>

                                    <div>
                                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Sub-topics <span className="text-[10px] opacity-70">(one per line)</span></label>
                                      <textarea
                                        value={(Array.isArray((cdapPartTab === 'part1' ? localCdapUnits[cdapUnitIdx]?.part1_topics : localCdapUnits[cdapUnitIdx]?.part2_topics)?.[idx]?.subtopics) ? (cdapPartTab === 'part1' ? localCdapUnits[cdapUnitIdx]?.part1_topics : localCdapUnits[cdapUnitIdx]?.part2_topics)?.[idx].subtopics.join('\n') : '') || ''}
                                        onChange={(e) => {
                                          const newUnits = [...localCdapUnits];
                                          const currentTopics = [...(cdapPartTab === 'part1' ? newUnits[cdapUnitIdx].part1_topics : newUnits[cdapUnitIdx].part2_topics)];
                                          const lines = e.target.value.split('\n');
                                          const cleanLines = lines.map((l) => l.replace(/^[-*•]\s*/, ''));
                                          if (typeof currentTopics[idx] === 'string') {
                                            currentTopics[idx] = { topic: currentTopics[idx], subtopics: cleanLines };
                                          } else {
                                            currentTopics[idx] = { ...currentTopics[idx], subtopics: cleanLines };
                                          }
                                          if (cdapPartTab === 'part1') newUnits[cdapUnitIdx].part1_topics = currentTopics;
                                          else newUnits[cdapUnitIdx].part2_topics = currentTopics;
                                          setLocalCdapUnits(newUnits);
                                        }}
                                        className="input w-full text-sm min-h-[80px] font-mono text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 focus:border-purple-500"
                                        placeholder="Sub-topic 1&#10;Sub-topic 2"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            <button
                              onClick={() => {
                                const newUnits = [...localCdapUnits];
                                const currentTopics = [...(cdapPartTab === 'part1' ? newUnits[cdapUnitIdx].part1_topics : newUnits[cdapUnitIdx].part2_topics)];
                                currentTopics.push({ topic: '', subtopics: [] });
                                if (cdapPartTab === 'part1') newUnits[cdapUnitIdx].part1_topics = currentTopics;
                                else newUnits[cdapUnitIdx].part2_topics = currentTopics;
                                setLocalCdapUnits(newUnits);
                              }}
                              className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-slate-500 hover:text-purple-600 hover:border-purple-400 dark:hover:border-purple-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all flex items-center justify-center gap-2 font-medium"
                            >
                              <Plus className="w-4 h-4" />
                              Add New Topic
                            </button>
                          </div>
                        ) : (
                          <div className="h-96 overflow-y-auto pr-2 space-y-4 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-2">
                              {((cdapPartTab === 'part1' ? cdap.units?.[cdapUnitIdx]?.part1_topics : cdap.units?.[cdapUnitIdx]?.part2_topics) || []).map(
                                (topicItem: any, idx: number) => {
                                  const topicText = typeof topicItem === 'string' ? topicItem : topicItem?.topic || topicItem?.topicName || '';
                                  const subtopics = typeof topicItem === 'object' ? (topicItem?.subtopics || []) : [];
                                  const topicParts = topicText.split(',').map((p: string) => p.trim()).filter((p: string) => p);

                                  return (
                                    <li key={idx} className="flex items-start gap-3 p-3 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors">
                                      {/* Main Gradient Dot */}
                                      <div className="mt-2.5 w-2.5 h-2.5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shadow-md shadow-purple-500/30 flex-shrink-0" />

                                      <div className="flex-1 space-y-3">
                                        {/* Main Topic Content */}
                                        {topicParts.length > 0 ? (
                                          <div className="space-y-2">
                                            {topicParts.map((part: string, pIdx: number) => (
                                              <p key={pIdx} className="text-lg font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                                                {cleanText(part)}
                                              </p>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="text-lg font-medium text-slate-800 dark:text-slate-200 leading-relaxed">{cleanText(topicText)}</p>
                                        )}

                                        {/* Sub-topics */}
                                        {subtopics.length > 0 && (
                                          <ul className="space-y-2 mt-2">
                                            {subtopics.flatMap((sub: string) => sub.split(',').map(s => s.trim()).filter(Boolean)).map((sub: string, subIdx: number) => (
                                              <li key={subIdx} className="text-base text-slate-600 dark:text-slate-400 flex items-start gap-3 pl-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 dark:bg-purple-500 mt-2.5 flex-shrink-0" />
                                                <span className="leading-relaxed">{cleanText(sub)}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    </li>
                                  );
                                }
                              )}
                            </ul>

                            {/* No Topics Message */}
                            {(
                              (cdapPartTab === 'part1' && !((editingCdap ? localCdapUnits : cdap.units)?.[cdapUnitIdx]?.part1_topics?.length)) ||
                              (cdapPartTab === 'part2' && !((editingCdap ? localCdapUnits : cdap.units)?.[cdapUnitIdx]?.part2_topics?.length))
                            ) && (
                                <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 h-full flex items-center justify-center">
                                  <p className="text-sm text-slate-500 dark:text-slate-400 italic">No topics found for this part</p>
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 dark:text-slate-400">
                      <Layers className="w-12 h-12 mb-4 opacity-20" />
                      <p>No CDAP content available.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500 dark:text-slate-400">
                  <Layers className="w-12 h-12 mb-4 opacity-20" />
                  <p>No CDAP content available.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        isDangerous={confirmState.isDangerous}
      />
    </div>,
    document.body
  );
}

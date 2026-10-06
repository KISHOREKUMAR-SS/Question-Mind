import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useUiStore } from '../lib/store';
import { subjectsApi, questionBankApi, staffApi } from '../lib/api';
import {
  BookOpen,
  FileQuestion,
  CheckCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { Subject, QuestionBank, MySubjectAssignment } from '../types';
import QuestionBankViewModal from '../components/QuestionBankViewModal';

export default function Dashboard() {
  const { user } = useAuthStore();
  const { setGlobalLoading } = useUiStore();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSubjects: 0,
    totalQuestionBanks: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [recentBanks, setRecentBanks] = useState<QuestionBank[]>([]);
  const [myAssignments, setMyAssignments] = useState<MySubjectAssignment[]>([]);
  const [viewingBank, setViewingBank] = useState<QuestionBank | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [subjectsRes, banksRes] = await Promise.all([
        subjectsApi.getAll(),
        questionBankApi.getAll({ own_only: true }),
      ]);

      const subjectsList: Subject[] = subjectsRes.data;
      setSubjects(subjectsList);
      const banks: QuestionBank[] = banksRes.data;

      setStats({
        totalSubjects: subjectsList.length,
        totalQuestionBanks: banks.length,
      });

      setRecentBanks(banks.slice(0, 5));

      try {
        const assignmentsRes = await staffApi.getMySubjects();
        setMyAssignments(assignmentsRes.data);
      } catch (err) {
        // Ignored
      }
    } catch (err: any) {
      console.error('Failed to load dashboard', err);
      if (!err.response) {
        setError('Server is unreachable. Please check your connection (Not fetchable).');
      } else if (err.response.status === 404) {
        setError('No data found for your dashboard.');
      } else {
        setError(err.response?.data?.detail || err.message || 'Failed to load dashboard data.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getSubjectName = (subjectId: string) => {
    return subjects.find((s) => s.id === subjectId)?.name || 'Unknown';
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
      console.error('Failed to download');
    } finally {
      setGlobalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-pink-600 dark:text-pink-400 animate-spin" />
          <p className="text-purple-700 dark:text-purple-300 font-medium animate-pulse">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="card dark:!bg-slate-900 p-8">
        <h1 className="text-3xl font-bold text-pink-600 dark:text-pink-400 mb-2">
          {user?.role === 'HOD' ? `${user?.name} (Academic HOD)` : `Welcome back, ${user?.name}! ✨`}
        </h1>
        <p className="text-purple-700 dark:text-purple-300 font-medium">
          Generate and manage question banks with streamlined AI support.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard
          icon={BookOpen}
          label="Total Subjects"
          value={stats.totalSubjects}
          color="pink"
          onClick={() => navigate('/subjects')}
        />
        <StatCard
          icon={FileQuestion}
          label="Question Banks"
          value={stats.totalQuestionBanks}
          color="purple"
          onClick={() => navigate('/question-banks')}
        />
      </div>

      {/* Staff assignments */}
      {myAssignments.length > 0 && (
        <div className="card dark:!bg-slate-900 p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="text-2xl">📚</span> My Assigned Subjects
          </h2>
          <div className="space-y-3">
            {myAssignments.map((a) => (
              <div
                key={a.subjectId}
                className="group rounded-xl border-2 border-pink-200 dark:border-pink-700 bg-white dark:bg-slate-900 p-5 transition hover:border-pink-300 hover:shadow-md dark:hover:border-pink-600"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-lg">{a.subjectName}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-mono">{a.subjectCode}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Question Banks */}
      <div className="card dark:!bg-slate-900 p-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">🔥</span> Recent Question Banks
        </h2>
        {recentBanks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto rounded-full bg-pink-100 dark:bg-slate-900 flex items-center justify-center mb-4">
              <FileQuestion className="w-10 h-10 text-pink-600 dark:text-pink-400" />
            </div>
            <p className="text-slate-900 dark:text-white text-base font-semibold">No question banks generated yet.</p>
            <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">Start creating your first question bank.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentBanks.map((bank) => (
              <div
                key={bank.id}
                onClick={() => setViewingBank(bank)}
                className="group rounded-xl border-2 border-pink-200 dark:border-pink-700 bg-white dark:bg-slate-900 p-5 transition hover:border-pink-300 hover:shadow-md dark:hover:border-pink-600 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-lg">
                      {bank.title || 'Untitled Question Bank'}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      📅 {new Date(bank.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewingBank && (
        <QuestionBankViewModal
          bank={viewingBank}
          subjectName={getSubjectName(viewingBank.subject_id)}
          onClose={() => setViewingBank(null)}
          onDownload={() => handleDownload(viewingBank)}
          onUpdate={(updatedBank) => {
            setViewingBank(updatedBank);
            setRecentBanks(prev => prev.map(b => b.id === updatedBank.id ? updatedBank : b));
          }}
        />
      )}

      {error && createPortal(
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setError(null)}
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
              onClick={() => setError(null)}
              className="btn bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 rounded-xl transition-all font-semibold shadow-lg shadow-rose-500/25 active:scale-95"
            >
              Dismiss
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  onClick,
}: {
  icon: any;
  label: string;
  value: number;
  color: 'pink' | 'purple' | 'orange' | 'green';
  onClick?: () => void;
}) {
  const softBg: Record<typeof color, string> = {
    pink: 'bg-pink-100 text-pink-800 dark:bg-slate-900 dark:text-pink-100',
    purple: 'bg-purple-100 text-purple-800 dark:bg-slate-900 dark:text-purple-100',
    orange: 'bg-orange-100 text-orange-800 dark:bg-slate-900 dark:text-orange-100',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
  };

  const cardClass: Record<typeof color, string> = {
    pink: 'stat-card dark:!bg-slate-900',
    purple: 'stat-card stat-card-info dark:!bg-slate-900',
    orange: 'stat-card stat-card-warning dark:!bg-slate-900',
    green: 'stat-card stat-card-success dark:!bg-slate-900',
  };

  return (
    <div
      className={`${cardClass[color]} cursor-pointer transition-transform hover:scale-105 active:scale-95`}
      onClick={onClick}
    >
      <div className="relative z-10 flex items-center gap-4">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center ring-2 ring-pink-200 dark:ring-pink-700 ${softBg[color]}`}>
          <Icon className="w-7 h-7" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{value}</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-1">{label}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700',
    PENDING_APPROVAL: 'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-900 dark:text-amber-100 dark:border-amber-800',
    APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-emerald-900 dark:text-emerald-100 dark:border-emerald-800',
    REJECTED: 'bg-rose-50 text-rose-800 border-rose-100 dark:bg-rose-900 dark:text-rose-100 dark:border-rose-800',
  };

  const icons: Record<string, string> = {
    DRAFT: '📝',
    PENDING_APPROVAL: '⏳',
    APPROVED: '✅',
    REJECTED: '❌',
  };

  return (
    <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${styles[status] || styles.DRAFT} flex items-center gap-2`}>
      <span>{icons[status]}</span>
      {status.replace('_', ' ')}
    </span>
  );
}








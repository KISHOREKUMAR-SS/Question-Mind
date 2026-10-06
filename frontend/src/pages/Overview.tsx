import { useEffect, useState, useRef } from 'react';
import { subjectsApi, questionBankApi } from '../lib/api';
import { useUiStore } from '../lib/store';
import {
  Users,
  CheckCircle2,
  Clock,
  BookOpen,
  FileQuestion,
  TrendingUp,
  AlertCircle,
  Eye,
  Search,
  Filter,
  X,
} from 'lucide-react';
import { QuestionBank } from '../types';
import QuestionBankViewModal from '../components/QuestionBankViewModal';
import ConfirmationModal from '../components/ui/ConfirmationModal';

interface StaffAssignment {
  id: string;
  staff_name: string;
  staff_email: string;
  can_edit_pattern: boolean;
  can_generate_questions: boolean;
  can_approve: boolean;
}

// Interface removed to use the imported one from ../types
// interface QuestionBank { ... }

interface SubjectOverview {
  id: string;
  code: string;
  name: string;
  assigned_staff: StaffAssignment[];
  question_banks: QuestionBank[];
  approved_count: number;
  pending_count: number;
  total_count: number;
}

export default function Overview() {
  const { setGlobalLoading } = useUiStore();
  const [subjects, setSubjects] = useState<SubjectOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingBank, setViewingBank] = useState<QuestionBank | null>(null);
  
  // Confirmation state for alerts
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    alertOnly?: boolean;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });
  const [stats, setStats] = useState({
    totalSubjects: 0,
    totalStaff: 0,
    totalBanks: 0,
    pendingApprovals: 0,
  });
  const [staffFilter, setStaffFilter] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterScope, setFilterScope] = useState<'all' | 'staff' | 'subject' | 'code'>('all'); // NEW: Scope state

  // Refs for scrolling
  const subjectsRef = useRef<HTMLDivElement>(null);
  const staffRef = useRef<HTMLDivElement>(null);
  const banksRef = useRef<HTMLDivElement>(null); // To Recent Submissions
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchOverviewData();
  }, []);

  const fetchOverviewData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch the current user's own subjects and question banks
      const [subjectsRes, banksRes] = await Promise.all([
        subjectsApi.getAll(),
        questionBankApi.getAll({ own_only: true }),
      ]);

      const subjectsData = subjectsRes.data;
      const banksData = banksRes.data;

      // Aggregate data by subject
      const overviewData: SubjectOverview[] = subjectsData.map((subject: any) => {
        const subjectBanks = banksData.filter((bank: any) => bank.subject_id === subject.id);
        const approvedBanks = subjectBanks.filter((bank: any) => bank.status === 'APPROVED');
        const pendingBanks = subjectBanks.filter((bank: any) => bank.status === 'PENDING_APPROVAL');

        return {
          id: subject.id,
          code: subject.code,
          name: subject.name,
          assigned_staff: subject.assigned_staff || [],
          question_banks: subjectBanks,
          approved_count: approvedBanks.length,
          pending_count: pendingBanks.length,
          total_count: subjectBanks.length,
        };
      });

      setSubjects(overviewData);

      // Calculate overall stats
      const uniqueStaff = new Set();
      overviewData.forEach(subject => {
        subject.assigned_staff.forEach(staff => uniqueStaff.add(staff.staff_email));
      });

      setStats({
        totalSubjects: overviewData.length,
        totalStaff: uniqueStaff.size,
        totalBanks: banksData.length,
        pendingApprovals: banksData.filter((bank: any) => bank.status === 'PENDING_APPROVAL').length,
      });
    } catch (error: any) {
      console.error('Failed to fetch overview data:', error);
      setError(error.response?.data?.detail || 'Failed to load overview data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // derived staff list for the new section
  const allStaff = subjects.flatMap(s => s.assigned_staff.map(staff => ({ ...staff, subjectCode: s.code, subjectName: s.name })));

  // Filtering Logic
  // Check if string matches query
  const matchesQuery = (text: string) => text.toLowerCase().includes(staffFilter.toLowerCase());

  const uniqueStaffList = Array.from(new Map(allStaff.map(s => [s.staff_email, s])).values())
    .filter(s => {
      if (!staffFilter) return true;
      const query = staffFilter.toLowerCase();
      // Helper to match against specific string or combined Code - Name
      // We need to check if ANY of this staff's subjects match the query in the expected format

      const staffSubjects = allStaff.filter(as => as.staff_email === s.staff_email);

      if (filterScope === 'staff') return s.staff_name.toLowerCase().includes(query) || s.staff_email.toLowerCase().includes(query);

      if (filterScope === 'code') {
        return staffSubjects.some(sub => {
          const combined = `${sub.subjectCode} - ${sub.subjectName}`.toLowerCase();
          return sub.subjectCode.toLowerCase().includes(query) || combined.includes(query);
        });
      }

      if (filterScope === 'subject') {
        return staffSubjects.some(sub => {
          const combined = `${sub.subjectCode} - ${sub.subjectName}`.toLowerCase();
          return sub.subjectName.toLowerCase().includes(query) || combined.includes(query);
        });
      }

      // Default 'all'
      return s.staff_name.toLowerCase().includes(query) ||
        s.staff_email.toLowerCase().includes(query) ||
        staffSubjects.some(sub => {
          const combined = `${sub.subjectCode} - ${sub.subjectName}`.toLowerCase();
          return sub.subjectCode.toLowerCase().includes(query) ||
            sub.subjectName.toLowerCase().includes(query) ||
            combined.includes(query);
        });
    });

  // Filtered Subject List for Breakdown Section
  const filteredSubjects = subjects.filter(subject => {
    if (!staffFilter) return true;
    const combined = `${subject.code} - ${subject.name}`;
    if (filterScope === 'code') return matchesQuery(subject.code) || matchesQuery(combined);
    if (filterScope === 'subject') return matchesQuery(subject.name) || matchesQuery(combined);
    if (filterScope === 'staff') return subject.assigned_staff.some(s => matchesQuery(s.staff_name) || matchesQuery(s.staff_email));
    // Default 'all'
    return matchesQuery(subject.name) ||
      matchesQuery(subject.code) ||
      matchesQuery(combined) ||
      subject.assigned_staff.some(s => matchesQuery(s.staff_name) || matchesQuery(s.staff_email));
  });


  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-16 h-16 border-4 border-pink-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <p className="text-red-600 dark:text-red-400 text-lg font-medium">{error}</p>
        <button
          onClick={fetchOverviewData}
          className="mt-4 px-6 py-2 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-lg hover:from-pink-700 hover:to-purple-700 transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 via-purple-600 to-orange-500 bg-clip-text text-transparent">
          Overview Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Comprehensive view of all subjects, staff assignments, and question bank approvals
        </p>
      </div>

      {/* Stats Grid - Clickable */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          onClick={() => scrollToSection(subjectsRef)}
          className="card !bg-gradient-to-br from-pink-500 to-pink-600 text-white dark:!bg-gradient-to-br dark:!from-pink-600 dark:!to-pink-700 p-6 cursor-pointer transform hover:scale-105 transition-transform"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-pink-100 text-sm font-medium">Total Subjects</p>
              <p className="text-3xl font-bold mt-2">{stats.totalSubjects}</p>
            </div>
            <div className="bg-white/20 p-3 rounded-lg">
              <BookOpen className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div
          onClick={() => scrollToSection(staffRef)}
          className="card !bg-gradient-to-br from-purple-500 to-purple-600 text-white dark:!bg-gradient-to-br dark:!from-purple-600 dark:!to-purple-700 p-6 cursor-pointer transform hover:scale-105 transition-transform"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Active Staff</p>
              <p className="text-3xl font-bold mt-2">{stats.totalStaff}</p>
            </div>
            <div className="bg-white/20 p-3 rounded-lg">
              <Users className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div
          onClick={() => scrollToSection(banksRef)}
          className="card !bg-gradient-to-br from-orange-500 to-orange-600 text-white dark:!bg-gradient-to-br dark:!from-orange-600 dark:!to-orange-700 p-6 cursor-pointer transform hover:scale-105 transition-transform"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Question Banks</p>
              <p className="text-3xl font-bold mt-2">{stats.totalBanks}</p>
            </div>
            <div className="bg-white/20 p-3 rounded-lg">
              <FileQuestion className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div
          onClick={() => scrollToSection(banksRef)} // Navigate to recent/pending
          className="card !bg-gradient-to-br from-amber-500 to-amber-600 text-white dark:!bg-gradient-to-br dark:!from-amber-600 dark:!to-amber-700 p-6 cursor-pointer transform hover:scale-105 transition-transform"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-sm font-medium">Pending Approvals</p>
              <p className="text-3xl font-bold mt-2">{stats.pendingApprovals}</p>
            </div>
            <div className="bg-white/20 p-3 rounded-lg">
              <Clock className="w-8 h-8" />
            </div>
          </div>
        </div>
      </div>

      {/* Staff Directory Section */}
      <div ref={staffRef} className="scroll-mt-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h2 className="text-2xl font-bold text-pink-600 dark:text-pink-400 flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-600" />
            Staff Directory
          </h2>
          <div className="flex items-center gap-2 w-full md:w-auto relative">
            <div className="relative w-full md:w-64 group">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-pink-400 w-4 h-4 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={filterScope === 'all' ? "Filter staff or subject..." : `Filter by ${filterScope}...`}
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-white dark:bg-slate-900 border-2 border-pink-300 dark:border-pink-700 rounded-xl text-sm font-medium text-pink-600 dark:text-pink-300 placeholder:text-pink-400 focus:outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all shadow-lg shadow-pink-500/5 hover:border-pink-400"
              />
              {staffFilter && (
                <button
                  onClick={() => setStaffFilter("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-pink-400 hover:text-pink-600 transition-colors"
                  title="Clear filter"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              {/* FILTER SUGGESTIONS DROPDOWN (Dynamic List) - Now INSIDE the group div */}
              {filterScope !== 'all' && (
                <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto invisible group-focus-within:visible opacity-0 group-focus-within:opacity-100 transition-all duration-200">
                  <div className="py-1">
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                      Available {filterScope}s
                    </div>
                    {(() => {
                      let options: string[] = [];
                      // For Staff, just names
                      if (filterScope === 'staff') {
                        options = Array.from(new Set(allStaff.map(s => s.staff_name)));
                      }
                      // For Code or Subject, use "Code - Name" format from MAIN subjects list
                      else if (filterScope === 'code' || filterScope === 'subject') {
                        options = Array.from(new Set(subjects.map(s => `${s.code} - ${s.name}`)));
                      }

                      const filteredOptions = options.sort().filter(opt => opt.toLowerCase().includes(staffFilter.toLowerCase()));

                      if (filteredOptions.length === 0) return <div className="px-4 py-2 text-sm text-gray-500">No matches found</div>;

                      return filteredOptions.map(opt => (
                        <button
                          key={opt}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setStaffFilter(opt);
                            searchInputRef.current?.blur();
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors ${staffFilter === opt ? 'bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-300'}`}
                        >
                          {opt}
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Filter Toggle Button */}
            <div className="relative">
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`p-2 rounded-xl border transition-all shadow-sm hover:shadow-md ${isFilterOpen || filterScope !== 'all'
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-transparent text-white'
                  : 'bg-purple-50 border-purple-100 text-purple-600 hover:bg-purple-100 dark:bg-slate-800 dark:border-slate-700 dark:text-purple-400'
                  }`}
                title="Filter Options"
              >
                <Filter className="w-5 h-5" />
              </button>

              {/* Filter Dropdown Menu - Simplified Categories Only */}
              {isFilterOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="py-1">
                      {['all', 'staff', 'code', 'subject'].map((scope) => (
                        <button
                          key={scope}
                          onClick={() => { setFilterScope(scope as any); setIsFilterOpen(false); }}
                          className={`w-full text-left px-4 py-2 text-sm capitalize transition-colors flex items-center justify-between ${filterScope === scope
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 font-medium'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                            }`}
                        >
                          {scope === 'all' ? 'All Categories' : scope}
                          {filterScope === scope && <CheckCircle2 className="w-4 h-4" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {uniqueStaffList.length === 0 ? (
          <div className="card p-8 text-center dark:!bg-slate-900 border-2 dark:border-slate-800">
            <p className="text-gray-500 dark:text-gray-400">No active staff found matching your filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {uniqueStaffList.map((staff, idx) => {
              const assignedSubjects = allStaff.filter(s => s.staff_email === staff.staff_email);
              return (
                <div key={idx} className="card p-5 dark:!bg-slate-900 border-2 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-600 transition-colors group">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-110 transition-transform">
                      {staff.staff_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-white truncate" title={staff.staff_name}>{staff.staff_name}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={staff.staff_email}>{staff.staff_email}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Assigned Subjects:</p>
                    <div className="flex flex-col gap-1.5">
                      {assignedSubjects.map((s, i) => (
                        <div key={i} className="flex flex-col items-center gap-1 text-xs px-2 py-2 bg-purple-50 dark:bg-slate-800 rounded border border-purple-100 dark:border-slate-700 text-center">
                          <span className="font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 tracking-wide">{s.subjectCode}</span>
                          <span className="text-purple-700 dark:text-purple-200 font-semibold leading-tight break-words w-full text-center">{s.subjectName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subjects Overview */}
      <div ref={subjectsRef} className="scroll-mt-6 space-y-6">
        <h2 className="text-2xl font-bold text-pink-600 dark:text-pink-400 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-pink-600" />
          Subject-wise Breakdown
        </h2>

        {filteredSubjects.length === 0 ? (
          <div className="card p-12 text-center dark:!bg-slate-900 border-2 dark:border-slate-800">
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No subjects found matching your filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredSubjects.map((subject, idx) => (
              <div key={subject.id} className="card p-6 space-y-4 dark:!bg-slate-900 border-2 dark:border-slate-800">
                {/* Subject Header */}
                <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {subject.code}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">{subject.name}</p>
                </div>

                {/* Assigned Staff */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-pink-600" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Assigned Staff ({subject.assigned_staff.length})
                    </h4>
                  </div>
                  {subject.assigned_staff.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 pl-6">
                      No staff assigned yet
                    </p>
                  ) : (
                    <div className="space-y-2 pl-6">
                      {subject.assigned_staff.map((staff) => (
                        <div
                          key={staff.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-500"></div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {staff.staff_name}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            ({staff.staff_email})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Question Banks Stats */}
                <div ref={idx === 0 ? banksRef : null} className="scroll-mt-24">
                  {/* Ref placed here to catch recent banks roughly */}
                  <div className="flex items-center gap-2 mb-3">
                    <FileQuestion className="w-4 h-4 text-purple-600" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Question Banks
                    </h4>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pl-6">
                    <div className="bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                        {subject.total_count}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {subject.approved_count}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Approved</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                        {subject.pending_count}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Pending</p>
                    </div>
                  </div>
                </div>

                {/* Recent Submissions */}
                {subject.question_banks.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-orange-600" />
                      <h4 className="font-semibold text-gray-900 dark:text-white">
                        Recent Submissions
                      </h4>
                    </div>
                    <div className="space-y-2 pl-6">
                      {subject.question_banks
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .slice(0, 3)
                        .map((bank) => (
                          <div
                            key={bank.id}
                            className="flex items-start justify-between gap-3 text-sm bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group border border-transparent hover:border-pink-200 dark:hover:border-slate-700"
                            onClick={() => setViewingBank(bank)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white truncate">
                                {bank.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                by {bank.generated_by_name || 'Unknown'}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                {formatDate(bank.created_at)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingBank(bank);
                                }}
                                title="View Details"
                              >
                                <Eye className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                              </button>
                              {bank.status === 'APPROVED' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Approved
                                </span>
                              ) : bank.status === 'PENDING_APPROVAL' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">
                                  <Clock className="w-3 h-3" />
                                  Pending
                                </span>
                              ) : bank.status === 'DRAFT' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 rounded-full text-xs font-medium">
                                  <FileQuestion className="w-3 h-3" />
                                  Draft
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">
                                  <AlertCircle className="w-3 h-3" />
                                  Rejected
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Modal */}
      {viewingBank && (
        <QuestionBankViewModal
          bank={viewingBank}
          subjectName={subjects.find(s => s.id === viewingBank.subject_id)?.name || 'Unknown'}
          onClose={() => setViewingBank(null)}
          onDownload={() => {
            /* Logic handled inside modal now or we can pass a handler if we want specific behavior */
            /* But the shared component has its own onDownload prop usage or internal logic if we pass it */
            /* Wait, shared component expects onDownload prop. */
            /* Overview.tsx has handleDownload logic inside the local modal. I need to replicate it or use api directly */
            // Since we don't have a simple handleDownload in Overview scope for *any* bank (it was inside the component),
            // I'll inline the logic or just pass a simple one.
            // Actually, let's just use the API directly here.
            (async () => {
              setGlobalLoading(true, 'Downloading');
              try {
                const response = await questionBankApi.download(viewingBank.id);
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `${viewingBank.title}.xlsx`);
                document.body.appendChild(link);
                link.click();
                link.parentNode?.removeChild(link);
              } catch (e) {
                setConfirmState({
                  isOpen: true,
                  title: 'Download Error',
                  message: 'Failed to download the Question Bank Excel file. Please try again.',
                  alertOnly: true,
                  confirmText: 'OK',
                  onConfirm: () => {},
                });
              } finally {
                setGlobalLoading(false);
              }
            })()
          }}
        />
      )}
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        alertOnly={confirmState.alertOnly}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}





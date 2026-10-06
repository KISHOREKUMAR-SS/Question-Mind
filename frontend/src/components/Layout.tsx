import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../lib/store';
import { useThemeStore } from '../lib/themeStore';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Settings,
  FileQuestion,
  CheckCircle,
  LogOut,
  Menu,
  X,
  Brain,
  Moon,
  Sun,
  BarChart3,
  Zap,
  HelpCircle,
  Paperclip,
  Loader2,
  Upload,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import logo from '../assets/logo.png';

import profile1 from '../assets/Profile Logos/1.jpeg';
import profile2 from '../assets/Profile Logos/2.jpeg';
import profile3 from '../assets/Profile Logos/3.jpeg';
import profile4 from '../assets/Profile Logos/4.jpeg';
import profile5 from '../assets/Profile Logos/5.jpeg';
import profile6 from '../assets/Profile Logos/6.jpeg';
import profile7 from '../assets/Profile Logos/7.jpeg';
import profile8 from '../assets/Profile Logos/8.jpeg';
import profile9 from '../assets/Profile Logos/9.jpeg';
import profile10 from '../assets/Profile Logos/10.jpeg';

const profileLogos = [
  profile1,
  profile2,
  profile3,
  profile4,
  profile5,
  profile6,
  profile7,
  profile8,
  profile9,
  profile10
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoIndex, setLogoIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLogoIndex((prev) => (prev + 1) % 10);
    }, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, []);

  const isHOD = user?.role === 'HOD';

  const isAdmin = user?.role === 'ADMIN';

  const navItems = isAdmin
    ? [{ path: '/admin', icon: Settings, label: 'Admin Console' }]
    : [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        ...(isHOD ? [{ path: '/overview', icon: BarChart3, label: 'Overview' }] : []),
        { path: '/subjects', icon: BookOpen, label: 'Subjects' },
        { path: '/syllabus', icon: FileText, label: 'Syllabus' },
        { path: '/patterns', icon: Brain, label: 'Patterns' },
        { path: '/question-banks', icon: FileQuestion, label: 'Question Banks' },
        { path: '/quick-checks', icon: Zap, label: 'Quick Checks' },
      ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black">

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 px-4 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-pink-100 dark:border-pink-900 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>



          <Link to={isAdmin ? "/admin" : "/"} className="flex items-center gap-2">
            <img src={logo} alt="Logo" className="h-10 w-auto object-contain" />
          </Link>
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-gradient-to-b from-pink-50 via-purple-50 to-orange-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-950 border-r-4 border-pink-300 dark:border-pink-600 transform transition-transform duration-300 z-40 shadow-2xl shadow-pink-200/50 dark:shadow-purple-900/50 flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* Sidebar Header */}
        <div className="p-6 border-b-2 border-pink-300 dark:border-pink-600 flex items-center justify-between bg-gradient-to-br from-pink-100 via-purple-100 to-orange-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 flex-shrink-0">
          <Link to={isAdmin ? "/admin" : "/"} className="flex items-center justify-center w-full group">
            <img src={logo} alt="Logo" className="h-16 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <X className="w-6 h-6" />
          </button>
          <button
            onClick={toggleTheme}
            className="hidden lg:flex p-2.5 bg-gradient-to-br from-orange-400 to-amber-500 hover:from-orange-500 hover:to-amber-600 text-white rounded-xl transition-all duration-300 hover:scale-110 active:scale-95 shadow-md hover:shadow-lg"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group
                  ${isActive
                    ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-orange-500 text-white shadow-lg transform scale-105 ring-2 ring-pink-300 dark:ring-pink-500'
                    : 'text-purple-700 dark:text-pink-300 hover:bg-gradient-to-r hover:from-pink-100 hover:to-purple-100 dark:hover:from-purple-800 dark:hover:to-pink-800 hover:text-purple-900 dark:hover:text-pink-100 border border-transparent hover:scale-102 hover:shadow-md'
                  }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'animate-pulse' : ''}`} strokeWidth={2.5} />
                <span className="font-bold">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Contact Option */}
        <div className="px-4 py-2 border-t border-pink-200/50 dark:border-pink-900/50 flex-shrink-0">
          <Link
            to="/support"
            onClick={() => setSidebarOpen(false)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 border-2 border-dashed font-bold hover:scale-102 hover:shadow-md
              ${location.pathname === '/support'
                ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-orange-500 text-white border-transparent shadow-lg shadow-pink-500/20'
                : 'text-purple-700 dark:text-pink-300 hover:bg-gradient-to-r hover:from-pink-100 hover:to-purple-100 dark:hover:from-purple-800 dark:hover:to-pink-800 hover:text-purple-900 dark:hover:text-pink-100 border-pink-300 dark:border-pink-600'
              }`}
          >
            <HelpCircle className={`w-5 h-5 ${location.pathname === '/support' ? 'text-white' : 'text-pink-500'}`} strokeWidth={2.5} />
            <span>Contact & Support</span>
          </Link>
        </div>

        {/* User */}
        <div className="p-4 border-t-2 border-pink-300 dark:border-pink-600 bg-gradient-to-r from-pink-100/90 via-purple-100/90 to-orange-100/90 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 backdrop-blur flex-shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-md flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-tr from-pink-500 via-purple-500 to-orange-500 rounded-full animate-[spin_4s_linear_infinite] z-0" />
              <div className="absolute inset-[2.5px] rounded-full bg-white dark:bg-slate-900 z-10 flex items-center justify-center overflow-hidden">
                <img 
                  key={logoIndex}
                  src={profileLogos[logoIndex]} 
                  alt="User Profile" 
                  className="w-full h-full object-cover rounded-full animate-profile-flip"
                />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate capitalize font-semibold">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white dark:bg-slate-800 rounded-xl font-semibold hover:bg-slate-800 dark:hover:bg-slate-700 transition"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      {/* NOTE: no z-index here — a positioned z-index would create a stacking context that traps
          modal `fixed` overlays below the sidebar (z-40), so popup blur only covered part of the
          screen. `relative` (without z-index) keeps offset-parent behavior without that trap. */}
      <main className={`transition-all duration-300 ${sidebarOpen ? 'lg:ml-72' : 'lg:ml-72'} relative pt-16 lg:pt-0`}>
        <div className="p-6 lg:p-10">
          {children}
        </div>
      </main>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

    </div>
  );
}



import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { WifiOff } from 'lucide-react';
import { useAuthStore } from './lib/store';
import Layout from './components/Layout';
import Login from './pages/Login';

import Dashboard from './pages/Dashboard';
import Overview from './pages/Overview';
import Subjects from './pages/Subjects';
import Syllabus from './pages/Syllabus';
import Patterns from './pages/Patterns';
import QuestionBanks from './pages/QuestionBanks';
import QuickChecks from './pages/QuickChecks';
import AdminDashboard from './pages/AdminDashboard';
import Support from './pages/Support';
import GlobalLoader from './components/GlobalLoader';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}


function OfflineOverlay() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border border-pink-200 dark:border-pink-900 transform transition-all">
        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <WifiOff className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">No Internet Connection</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Please connect to the internet to use Question Mind. The application will automatically resume once your connection is restored.
        </p>
        <div className="flex justify-center items-center gap-2 text-pink-500 font-semibold">
          <span className="animate-pulse">Waiting for connection...</span>
        </div>
      </div>
    </div>
  );
}


export default function App() {
  const { loadFromStorage, user } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const isAdmin = user?.role === 'ADMIN';

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Toaster 
        position="top-center" 
        toastOptions={{ 
          duration: 4000, 
          style: { 
            background: 'linear-gradient(to right, #4c1d95, #701a75)', // Deep purple to dark pink gradient
            color: '#fff',
            border: '1px solid #d946ef', // Fuchsia border
            boxShadow: '0 4px 14px 0 rgba(217, 70, 239, 0.39)',
            fontWeight: '600'
          },
          success: {
            iconTheme: {
              primary: '#fdf4ff', // Light fuchsia
              secondary: '#d946ef', // Fuchsia
            },
          },
          error: {
            iconTheme: {
              primary: '#fff1f2', // Light rose
              secondary: '#f43f5e', // Rose
            },
          }
        }} 
      />
      <OfflineOverlay />
      <GlobalLoader />
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  {isAdmin ? (
                    <>
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/support" element={<Support />} />
                      <Route path="*" element={<Navigate to="/admin" replace />} />
                    </>
                  ) : (
                    <>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/overview" element={<Overview />} />
                      <Route path="/subjects" element={<Subjects />} />
                      <Route path="/syllabus" element={<Syllabus />} />
                      <Route path="/patterns" element={<Patterns />} />
                      <Route path="/question-banks" element={<QuestionBanks />} />
                      <Route path="/quick-checks" element={<QuickChecks />} />
                      <Route path="/support" element={<Support />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </>
                  )}
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </HashRouter>
  );
}

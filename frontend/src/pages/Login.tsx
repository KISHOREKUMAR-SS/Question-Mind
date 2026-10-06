import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { authApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { Loader2, ArrowLeft } from 'lucide-react';
import logo from '../assets/logo.png';
import SaraswathiIntro from '../components/SaraswathiIntro';
import AuroraBackground from '../components/AuroraBackground';

type BackendStatus = 'checking' | 'connected' | 'offline';

export default function Login() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');
  const [backendMessage, setBackendMessage] = useState('Checking backend connection...');
  const [showIntro, setShowIntro] = useState(true);
  const [introVisualDone, setIntroVisualDone] = useState(false);
  const [renderCanvas, setRenderCanvas] = useState(true);

  useEffect(() => {
    if (backendStatus === 'connected') {
      const timer = setTimeout(() => {
        setRenderCanvas(false);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setRenderCanvas(true);
    }
  }, [backendStatus]);

  // Forgot Password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotError, setForgotError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const checkBackend = async () => {
      try {
        await api.get('/health', { timeout: 4000 });
        if (!cancelled) {
          setBackendStatus('connected');
          setBackendMessage('Backend connected. You can sign in now.');
        }
      } catch {
        if (!cancelled) {
          setBackendStatus('offline');
          setBackendMessage('Backend is not connected yet. Please wait for the server to wake up.');
        }
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (backendStatus !== 'connected') {
        setError('Backend is not connected yet. Please wait and try again.');
        return;
      }

      setLoading(true);
      const response = await authApi.login(email, password);
      setAuth(response.data.user, response.data.access_token);
      if (response.data.user.role === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (!err.response || [502, 503, 504].includes(status)) {
        setBackendStatus('offline');
        setBackendMessage('Backend is not connected yet. Please wait for the server to wake up.');
        setError('Backend is not connected yet. Please wait and then Try Now.');
      } else {
        setError(err.response?.data?.detail || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');

    try {
      await authApi.resetPasswordDirect(forgotEmail, newPassword);
      setForgotSuccess('Password updated successfully! You can now sign in.');
      setEmail(forgotEmail);
      setPassword('');
      // Show success message, then switch back to login after 2 seconds
      setTimeout(() => {
        setShowForgot(false);
        setForgotSuccess('');
      }, 2000);
    } catch (err: any) {
      setForgotError(err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden">
      {/* Saraswathi Splash Intro Overlay */}
      {showIntro && (
        <SaraswathiIntro
          onVisualComplete={() => {
            setIntroVisualDone(true);
          }}
          onAudioComplete={() => {
            setShowIntro(false);
          }}
        />
      )}

      {/* Render Login Page contents if not showing intro OR if visual animation is finished */}
      {(!showIntro || introVisualDone) && (
        <>
          {/* Aurora Background Canvas */}
          {renderCanvas && (
            <div className="fixed inset-0 -z-10 animate-fade-in">
              <AuroraBackground isConnected={backendStatus === 'connected'} />
            </div>
          )}

          {/* Normal Gradient Background (shows when canvas is gone or fading out) */}
          <div
            className={`fixed inset-0 -z-20 bg-gradient-to-br from-pink-50 via-purple-50 to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-black transition-opacity duration-1000 animate-fade-in ${
              backendStatus === 'connected' ? 'opacity-100' : 'opacity-40'
            }`}
          />

          <div className="w-full max-w-md space-y-6 relative z-10 animate-fade-in">

        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <img src={logo} alt="Logo" className="h-24 w-auto object-contain hover:scale-105 transition-transform duration-300" />
          </div>
        </div>

        {/* Form / Forgot Password Card */}
        <div className="card dark:!bg-slate-900 p-8">
          {showForgot ? (
            <>
              <h2 className="text-2xl font-bold gradient-text text-center mb-2">Reset Password</h2>
              <p className="text-sm text-purple-600 dark:text-pink-300 text-center mb-6 font-medium">
                Enter your email and new password to reset it immediately.
              </p>

              {forgotError && (
                <div className="mt-4 mb-4 rounded-xl border-2 border-rose-300 bg-gradient-to-r from-rose-100 to-red-100 px-4 py-3 text-sm font-semibold text-rose-800 dark:border-rose-700 dark:from-rose-900 dark:to-red-950 dark:text-rose-100">
                  ❌ {forgotError}
                </div>
              )}

              {forgotSuccess && (
                <div className="mt-4 mb-4 rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-100 to-green-100 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-700 dark:from-emerald-900 dark:to-green-950 dark:text-emerald-100">
                  ✅ {forgotSuccess}
                </div>
              )}

              <form onSubmit={handleForgotSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="input"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="label">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input"
                    placeholder="••••••••"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="btn btn-primary w-full justify-center text-base"
                >
                  {forgotLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Resetting password...
                    </>
                  ) : (
                    <>
                      <span>Update Password</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-purple-700 dark:text-pink-300 font-semibold border border-purple-200 dark:border-pink-850 hover:bg-purple-50 dark:hover:bg-slate-800 rounded-xl transition animate-pulse-once"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Sign In</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold gradient-text text-center mb-2">Sign in</h2>
              <p className="text-sm text-purple-600 dark:text-pink-300 text-center mb-6 font-medium">
                Welcome back! Please enter your details. 👋
              </p>

              {error && (
                <p className={`mb-4 text-sm font-semibold ${
                  error.includes('Backend is not connected')
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-rose-700 dark:text-rose-300'
                }`}>
                  {error}
                </p>
              )}

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgot(true);
                        setForgotError('');
                        setForgotSuccess('');
                        setForgotEmail('');
                        setNewPassword('');
                      }}
                      className="text-xs font-semibold text-pink-600 dark:text-pink-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    placeholder="••••••••"
                    required
                  />
                </div>

                <div className={`rounded-xl border px-4 py-3 text-sm ${
                  backendStatus === 'connected'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                    : backendStatus === 'offline'
                      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
                      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      backendStatus === 'connected'
                        ? 'bg-emerald-500'
                        : backendStatus === 'offline'
                          ? 'bg-amber-500'
                          : 'bg-slate-400 animate-pulse'
                    }`} />
                    <span>{backendMessage}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || backendStatus !== 'connected'}
                  className="btn btn-primary w-full justify-center text-base"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Signing in...
                    </>
                  ) : backendStatus === 'connected' ? (
                    <span>Sign In</span>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}







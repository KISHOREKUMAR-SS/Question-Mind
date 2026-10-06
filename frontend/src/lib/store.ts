import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

const getInitialAuthState = () => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      return { user, token, isAuthenticated: true };
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }
  return { user: null, token: null, isAuthenticated: false };
};

const initialAuthState = getInitialAuthState();

export const useAuthStore = create<AuthState>((set) => ({
  ...initialAuthState,

  setAuth: (user, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadFromStorage: () => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true });
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        set({ user: null, token: null, isAuthenticated: false });
      }
    } else {
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));

interface UiState {
  isGlobalLoading: boolean;
  globalLoadingText: string;
  setGlobalLoading: (isLoading: boolean, text?: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isGlobalLoading: false,
  globalLoadingText: 'Loading...',
  setGlobalLoading: (isLoading, text = 'Loading...') => set({ isGlobalLoading: isLoading, globalLoadingText: text }),
}));

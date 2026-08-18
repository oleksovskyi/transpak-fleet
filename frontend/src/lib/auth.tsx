import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, getToken, setToken } from './api';
import { User } from '../types';

const USER_KEY = 'transpak_user';

interface LoginResponse {
  token: string;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw || !getToken()) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadStoredUser);

  async function login(email: string, password: string) {
    const data = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }

  // Токен прострочився/недійсний на бекенді (401) — примусово розлогінити,
  // щоб RequireAuth відразу редіректнув на /login замість сирої помилки в UI.
  useEffect(() => {
    window.addEventListener('transpak:unauthorized', logout);
    return () => window.removeEventListener('transpak:unauthorized', logout);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth має використовуватись всередині AuthProvider');
  return ctx;
}

'use client';

/**
 * Auth context: holds the signed-in user and exposes login/logout.
 *
 * `useSyncExternalStore` keeps `user` reactive to localStorage changes, so
 * logging into a different account updates the UI immediately (no refresh),
 * while remaining hydration-safe (getServerSnapshot returns null, matching
 * the server-rendered HTML).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { AuthUser, LoginDto, Role } from '../types';
import { api, AUTH_CHANGE_EVENT, storage } from '../services/api';
import { initRealtime } from '../services/realtime';

interface AuthContextValue {
  user: AuthUser | null;
  login: (dto: LoginDto) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function subscribeToAuthChange(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(AUTH_CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function useAuthUser(): AuthUser | null {
  return useSyncExternalStore(
    subscribeToAuthChange,
    () => storage.getUser(),
    () => null,
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useAuthUser();

  useEffect(() => {
    initRealtime();
  }, []);

  const login = useCallback(async (dto: LoginDto) => {
    const auth = await api.login(dto);
    storage.save(auth);
    return auth.user;
  }, []);

  const logout = useCallback(async () => {
    const refresh = storage.getRefresh();
    try {
      if (refresh) await api.logout();
    } catch {
      // ignore network errors on logout
    } finally {
      storage.clear();
    }
  }, []);

  const value = useMemo(
    () => ({ user, login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export function canAccess(role: Role | undefined, roles: Role[]): boolean {
  return role !== undefined && roles.includes(role);
}
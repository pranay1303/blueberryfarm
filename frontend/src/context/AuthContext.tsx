import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setAccessToken, setUnauthorizedHandler } from '../services/api';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  serverOffline: boolean;
  login: (username: string, password: string) => Promise<void>;
  setupOwner: (payload: { username: string; full_name: string; email?: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [serverOffline, setServerOffline] = useState(false);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setServerOffline(false);
    try {
      const setupRes = await api.get('/auth/setup-status');
      const need = Boolean(setupRes.data?.needs_initial_setup);
      setNeedsSetup(need);
      if (!need) {
        try {
          const refRes = await api.post('/auth/refresh', {});
          if (refRes.data?.access_token && refRes.data?.user) {
            setAccessToken(refRes.data.access_token);
            setUser(refRes.data.user);
          } else {
            setUser(null);
          }
        } catch {
          setAccessToken(null);
          setUser(null);
        }
      }
    } catch {
      setServerOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAccessToken(null);
      setUser(null);
    });
    void bootstrap();
  }, [bootstrap]);

  const login = async (username: string, password: string) => {
    const res = await api.post('/auth/login', { username, password });
    setAccessToken(res.data.access_token);
    setUser(res.data.user);
    setNeedsSetup(false);
  };

  const setupOwner = async (payload: { username: string; full_name: string; email?: string; password: string }) => {
    const res = await api.post('/auth/setup-owner', payload);
    setAccessToken(res.data.access_token);
    setUser(res.data.user);
    setNeedsSetup(false);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  const hasPermission = useCallback(
    (perm: string) => {
      if (!user) return false;
      if (user.role === 'OWNER_ADMIN' || user.permissions.includes('*')) return true;
      return user.permissions.includes(perm);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        needsSetup,
        serverOffline,
        login,
        setupOwner,
        logout,
        hasPermission,
        refreshSession: bootstrap,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}


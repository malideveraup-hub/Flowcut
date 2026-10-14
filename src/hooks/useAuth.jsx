import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { getMeRequest, logoutRequest } from '../api/authApi';
import { unregisterQueuePushSubscription } from './queueBrowserAlerts';
import { createAuthRequestGuard } from './authRequestGuard';

const AuthContext = createContext(null);

const normalizeRole = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const ROLE_HOME = {
  customer: '/',
  barber: '/barber',
  shop_admin: '/admin',
  super_admin: '/super-admin',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const authRequestGuard = useRef(null);
  if (!authRequestGuard.current) authRequestGuard.current = createAuthRequestGuard();

  const updateUser = useCallback((nextUser) => {
    authRequestGuard.current.invalidate();
    setAuthError(null);
    setUser(nextUser);
  }, []);

  const refreshUser = useCallback(async () => {
    const request = authRequestGuard.current.begin();
    try {
      const { data } = await getMeRequest();
      const nextUser = data?.user ? { ...data.user, role: normalizeRole(data.user.role) } : null;
      if (!authRequestGuard.current.isCurrent(request)) return null;
      updateUser(nextUser);
      return nextUser;
    } catch (error) {
      if (!authRequestGuard.current.isCurrent(request)) return null;
      if (error.status === 401) updateUser(null);
      else setAuthError(error);
      return null;
    }
  }, [updateUser]);

  useEffect(() => {
    let active = true;

    refreshUser().finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [refreshUser]);

  async function logout() {
    // Invalidate pending session checks before awaiting service-worker or
    // network work so an older /auth/me response cannot restore the user.
    authRequestGuard.current.invalidate();
    try {
      await unregisterQueuePushSubscription();
      await logoutRequest();
    } finally {
      setAuthError(null);
      updateUser(null);
    }
  }

  const value = {
    user,
    role: normalizeRole(user?.role),
    name: user?.name || '',
    shopId: user?.shopId || null,
    consentCurrent: user ? user.consentCurrent === true : true,
    loading,
    authError,
    setUser: updateUser,
    refreshUser,
    logout,
    homeFor: (r) => ROLE_HOME[normalizeRole(r)] || '/',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ROLE_HOME, normalizeRole };

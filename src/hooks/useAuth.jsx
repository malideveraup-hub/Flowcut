import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { getMeRequest, logoutRequest } from '../api/authApi';
import { unregisterQueuePushSubscription } from './queueBrowserAlerts';

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

  const updateUser = useCallback((nextUser) => {
    setAuthError(null);
    setUser(nextUser);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await getMeRequest();
      const nextUser = data?.user ? { ...data.user, role: normalizeRole(data.user.role) } : null;
      setAuthError(null);
      setUser(nextUser);
      return nextUser;
    } catch (error) {
      setAuthError(error.status === 401 ? null : error);
      if (error.status === 401) setUser(null);
      return null;
    }
  }, []);

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
    try {
      await unregisterQueuePushSubscription();
      await logoutRequest();
    } finally {
      setAuthError(null);
      setUser(null);
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

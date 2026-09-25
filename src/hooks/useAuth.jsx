import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { getMeRequest, logoutRequest } from '../api/authApi';

const AuthContext = createContext(null);

const ROLE_HOME = {
  customer: '/',
  barber: '/barber',
  shop_admin: '/admin',
  super_admin: '/super-admin',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
  console.log('[AUTH] refreshUser START');

  try {
    const { data } = await getMeRequest();

    console.log('[AUTH] refreshUser SUCCESS', data.user);

    setUser(data.user);
    return data.user;
  } catch (err) {
    console.log('[AUTH] refreshUser FAILED', err);

    setUser(null);
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
      await logoutRequest();
    } finally {
      setUser(null);
    }
  }

  const value = {
    user,
    role: user?.role || null,
    name: user?.name || '',
    shopId: user?.shopId || null,
    consentCurrent: user ? user.consentCurrent === true : true,
    loading,
    setUser,
    refreshUser,
    logout,
    homeFor: (r) => ROLE_HOME[r] || '/',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ROLE_HOME };
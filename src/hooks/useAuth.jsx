import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { getMeRequest, logoutRequest } from '../api/authApi';
import { unregisterQueuePushSubscription } from './queueBrowserAlerts';
import { createAuthRequestGuard } from './authRequestGuard';
import {
  AUTH_SESSION_ACTIVITY_EVENT,
  AUTH_SESSION_EVENT,
  createAuthSessionSync,
} from '../api/authSessionSync';
import { useToast } from '../components/ui/ToastContext';

const AuthContext = createContext(null);
const SESSION_EXPIRED_MESSAGE = 'Your session has expired for your security. Please log in again.';
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

const normalizeRole = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const ROLE_HOME = {
  customer: '/',
  barber: '/barber',
  shop_admin: '/admin',
  super_admin: '/super-admin',
};

export function AuthProvider({ children, router }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const showToast = useToast();
  const [authRequestGuard] = useState(createAuthRequestGuard);
  const userRef = useRef(null);
  const syncRef = useRef(null);
  const deadlineTimer = useRef(null);
  const deadlineRef = useRef(null);
  const pendingTiming = useRef(null);
  const noticeShown = useRef(false);
  const clearSessionDeadline = useCallback(() => {
    if (deadlineTimer.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(deadlineTimer.current);
    }
    deadlineTimer.current = null;
    deadlineRef.current = null;
    pendingTiming.current = null;
  }, []);

  const updateUserInternal = useCallback((nextUser) => {
    authRequestGuard.invalidate();
    setAuthError(null);
    userRef.current = nextUser;
    setUser(nextUser);
    if (nextUser) noticeShown.current = false;
    else clearSessionDeadline();
  }, [authRequestGuard, clearSessionDeadline]);

  const navigateToLogin = useCallback(() => {
    const current = router?.state?.location;
    if (!router?.navigate || current?.pathname === '/login') return;
    const from = current?.pathname
      ? { pathname: current.pathname, search: current.search || '', hash: current.hash || '' }
      : undefined;
    router.navigate('/login', { replace: true, state: from ? { from } : undefined });
  }, [router]);

  const expireSession = useCallback(({ broadcast = true, notify = true } = {}) => {
    authRequestGuard.invalidate();
    updateUserInternal(null);
    if (broadcast) syncRef.current?.publish({ type: 'expired' });
    if (notify && !noticeShown.current) {
      noticeShown.current = true;
      showToast(SESSION_EXPIRED_MESSAGE, 'error');
    }
    navigateToLogin();
  }, [authRequestGuard, navigateToLogin, showToast, updateUserInternal]);

  const applySessionTiming = useCallback((timing, { broadcast = true } = {}) => {
    const { idleExpiresAt, absoluteExpiresAt, idleRemainingMs, absoluteRemainingMs } = timing || {};
    if (![idleExpiresAt, absoluteExpiresAt, idleRemainingMs, absoluteRemainingMs]
      .every((value) => typeof value === 'number' && Number.isFinite(value))) return;
    const previous = deadlineRef.current;
    if (previous && (absoluteExpiresAt < previous.absoluteExpiresAt ||
      (absoluteExpiresAt === previous.absoluteExpiresAt && idleExpiresAt < previous.idleExpiresAt))) return;
    const deadline = {
      idleExpiresAt,
      absoluteExpiresAt,
      receivedAt: monotonicNow(),
      remainingMs: Math.min(idleRemainingMs, absoluteRemainingMs),
    };
    deadlineRef.current = deadline;
    if (broadcast) syncRef.current?.publish({
      type: 'activity', idleExpiresAt, absoluteExpiresAt, idleRemainingMs, absoluteRemainingMs,
    });
    if (deadlineTimer.current !== null && typeof window !== 'undefined') window.clearTimeout(deadlineTimer.current);

    async function checkDeadline() {
      try {
        await getMeRequest();
      } catch (error) {
        if (error.status === 401 && (userRef.current || deadlineRef.current)) {
          expireSession();
        } else {
          setAuthError(error);
          deadlineTimer.current = window.setTimeout(scheduleCheck, 60_000);
        }
      }
    }

    function scheduleCheck() {
      const remaining = deadline.remainingMs - (monotonicNow() - deadline.receivedAt);
      if (remaining <= 0) {
        deadlineTimer.current = window.setTimeout(checkDeadline, 0);
        return;
      }
      deadlineTimer.current = window.setTimeout(scheduleCheck, Math.min(remaining, 2147483647));
    }

    scheduleCheck();
  }, [expireSession]);

  const consumePendingTiming = useCallback(() => {
    if (!pendingTiming.current) return;
    const timing = pendingTiming.current;
    pendingTiming.current = null;
    applySessionTiming(timing);
  }, [applySessionTiming]);

  const refreshUser = useCallback(async () => {
    const request = authRequestGuard.begin();
    try {
      const { data } = await getMeRequest();
      const nextUser = data?.user ? { ...data.user, role: normalizeRole(data.user.role) } : null;
      if (!authRequestGuard.isCurrent(request)) return null;
      updateUserInternal(nextUser);
      if (nextUser) consumePendingTiming();
      return nextUser;
    } catch (error) {
      if (!authRequestGuard.isCurrent(request)) return null;
      if (error.status === 401) updateUserInternal(null);
      else setAuthError(error);
      return null;
    }
  }, [authRequestGuard, consumePendingTiming, updateUserInternal]);

  useEffect(() => {
    const sync = createAuthSessionSync();
    syncRef.current = sync;
    const unsubscribe = sync.subscribe((message) => {
      if (message.type === 'updated') {
        refreshUser();
      } else if (message.type === 'activity') {
        applySessionTiming(message, { broadcast: false });
      } else if (message.type === 'expired') {
        expireSession({ broadcast: false, notify: true });
      } else if (message.type === 'logout') {
        expireSession({ broadcast: false, notify: false });
      }
    });
    const onActivity = (event) => {
      if (userRef.current) applySessionTiming(event.detail);
      else pendingTiming.current = event.detail;
    };
    const onExpired = (event) => {
      if (event.detail?.code === 'SESSION_EXPIRED' || userRef.current) expireSession();
    };
    window.addEventListener(AUTH_SESSION_ACTIVITY_EVENT, onActivity);
    window.addEventListener(AUTH_SESSION_EVENT, onExpired);
    return () => {
      unsubscribe();
      sync.close();
      syncRef.current = null;
      window.removeEventListener(AUTH_SESSION_ACTIVITY_EVENT, onActivity);
      window.removeEventListener(AUTH_SESSION_EVENT, onExpired);
      if (deadlineTimer.current !== null) window.clearTimeout(deadlineTimer.current);
    };
  }, [applySessionTiming, expireSession, refreshUser]);

  useEffect(() => {
    let active = true;

    refreshUser().finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [refreshUser]);

  const setUserAndBroadcast = useCallback((nextUser) => {
    updateUserInternal(nextUser);
    if (nextUser) consumePendingTiming();
    syncRef.current?.publish({ type: nextUser ? 'updated' : 'logout' });
  }, [consumePendingTiming, updateUserInternal]);

  const logout = useCallback(async () => {
    authRequestGuard.invalidate();
    try { await unregisterQueuePushSubscription(); } catch { /* Sign-out must continue if push cleanup fails. */ }
    try { await logoutRequest(); } catch { /* Clear local state even when the API cannot be reached. */ }
    updateUserInternal(null);
    syncRef.current?.publish({ type: 'logout' });
  }, [authRequestGuard, updateUserInternal]);

  const value = {
    user,
    role: normalizeRole(user?.role),
    name: user?.name || '',
    shopId: user?.shopId || null,
    consentCurrent: user ? user.consentCurrent === true : true,
    loading,
    authError,
    setUser: setUserAndBroadcast,
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

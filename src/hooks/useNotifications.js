import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from '../api/shopApi';
import {
  enableQueueBrowserAlerts,
  getBrowserAlertPermission,
  registerQueueAlertServiceWorker,
  showQueueBrowserAlert,
} from './queueBrowserAlerts';

const POLL_INTERVAL_MS = 15_000;
const RECENT_ALERT_WINDOW_MS = 2 * 60_000;
const BROWSER_ALERT_TYPES = new Set(['NEAR_TURN', 'ARRIVE_SOON']);

function recentQueueAlerts(notifications) {
  const cutoff = Date.now() - RECENT_ALERT_WINDOW_MS;
  return notifications
    .filter((item) => BROWSER_ALERT_TYPES.has(item.type) && new Date(item.createdAt).getTime() >= cutoff)
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

export function useNotifications(enabled = true) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [browserAlertPermission, setBrowserAlertPermission] = useState(getBrowserAlertPermission);
  const [browserAlertSoundEnabled, setBrowserAlertSoundEnabled] = useState(false);
  const [browserAlertBusy, setBrowserAlertBusy] = useState(false);
  const [browserAlertError, setBrowserAlertError] = useState('');
  const requestInFlight = useRef(false);
  const knownNotificationIds = useRef(null);

  useEffect(() => {
    if (!enabled || browserAlertPermission === 'unsupported') return undefined;
    void registerQueueAlertServiceWorker().catch(() => {});

    const syncPermission = () => setBrowserAlertPermission(getBrowserAlertPermission());
    window.addEventListener('focus', syncPermission);
    return () => window.removeEventListener('focus', syncPermission);
  }, [enabled, browserAlertPermission]);

  const refresh = useCallback(async () => {
    if (!enabled || requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const result = await fetchMyNotifications();
      const nextNotifications = result.notifications || [];
      const nextIds = new Set(nextNotifications.map((item) => item.id));
      const knownIds = knownNotificationIds.current;
      knownNotificationIds.current = nextIds;

      const queueAlerts = knownIds
        ? nextNotifications.filter((item) => !knownIds.has(item.id) && BROWSER_ALERT_TYPES.has(item.type))
        : recentQueueAlerts(nextNotifications);
      queueAlerts.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
      for (const item of queueAlerts) {
        try {
          await showQueueBrowserAlert(item);
        } catch {
          // The in-app notification remains available if Chrome alerts are blocked.
        }
      }

      setNotifications(nextNotifications);
      setUnreadCount(result.unreadCount || 0);
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [enabled]);

  const enableBrowserAlerts = useCallback(async () => {
    setBrowserAlertBusy(true);
    setBrowserAlertError('');
    try {
      const result = await enableQueueBrowserAlerts();
      setBrowserAlertPermission(result.permission);
      setBrowserAlertSoundEnabled(result.soundEnabled);
      setBrowserAlertError(result.registrationError);

      if ((result.permission === 'granted' || result.soundEnabled) && !requestInFlight.current) {
        requestInFlight.current = true;
        try {
          const current = await fetchMyNotifications();
          const currentNotifications = current.notifications || [];
          knownNotificationIds.current = new Set(currentNotifications.map((item) => item.id));
          setNotifications(currentNotifications);
          setUnreadCount(current.unreadCount || 0);
          for (const item of recentQueueAlerts(currentNotifications)) {
            await showQueueBrowserAlert(item);
          }
        } catch {
          // Enabling alerts should succeed even if the notification list is temporarily unavailable.
        } finally {
          requestInFlight.current = false;
        }
      }
    } catch (error) {
      setBrowserAlertPermission(getBrowserAlertPermission());
      setBrowserAlertError(error.message || 'Could not enable browser alerts.');
    } finally {
      setBrowserAlertBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const load = async () => {
      if (!active) return;
      try {
        await refresh();
      } catch {
        // Keep the last successful state while the API is temporarily unavailable.
      }
    };
    void load();
    const timer = window.setInterval(load, POLL_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [enabled, refresh]);

  const markRead = useCallback(async (notificationId) => {
    const wasUnread = notifications.some((item) => item.id === notificationId && !item.read);
    await markMyNotificationRead(notificationId);
    setNotifications((current) => current.map((item) => (
      item.id === notificationId ? { ...item, read: true } : item
    )));
    if (wasUnread) setUnreadCount((current) => Math.max(0, current - 1));
  }, [notifications]);

  const markAllRead = useCallback(async () => {
    await markAllMyNotificationsRead();
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
    browserAlertPermission,
    browserAlertSoundEnabled,
    browserAlertBusy,
    browserAlertError,
    enableBrowserAlerts,
  };
}

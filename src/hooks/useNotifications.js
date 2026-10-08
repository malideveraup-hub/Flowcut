import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from '../api/shopApi';

const POLL_INTERVAL_MS = 15_000;

export function useNotifications(enabled = true) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const requestInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const result = await fetchMyNotifications();
      setNotifications(result.notifications || []);
      setUnreadCount(result.unreadCount || 0);
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [enabled]);

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
    return () => {
      active = false;
      window.clearInterval(timer);
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

  return { notifications, unreadCount, loading, refresh, markRead, markAllRead };
}

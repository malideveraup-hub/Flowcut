import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPushConfiguration,
  fetchMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
  saveMyPushSubscription,
} from '../api/shopApi';
import {
  enableQueueBrowserAlerts,
  getBrowserAlertPermission,
  requiresHomeScreenForPush,
  registerQueueAlertServiceWorker,
  showQueueBrowserAlert,
  urlBase64ToUint8Array,
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
  const [browserPushEnabled, setBrowserPushEnabled] = useState(false);
  const [browserPushConfigured, setBrowserPushConfigured] = useState(null);
  const requestInFlight = useRef(false);
  const knownNotificationIds = useRef(null);
  const pushConfiguration = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;

    fetchPushConfiguration()
      .then((configuration) => {
        if (!active) return;
        pushConfiguration.current = configuration;
        setBrowserPushConfigured(configuration.enabled === true);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || browserAlertPermission === 'unsupported') return undefined;
    void registerQueueAlertServiceWorker().catch(() => {});

    const syncPermission = () => {
      const permission = getBrowserAlertPermission();
      setBrowserAlertPermission(permission);
      if (permission !== 'granted') setBrowserPushEnabled(false);
    };
    window.addEventListener('focus', syncPermission);
    return () => window.removeEventListener('focus', syncPermission);
  }, [enabled, browserAlertPermission]);

  useEffect(() => {
    if (!enabled || browserAlertPermission !== 'granted') return undefined;
    let active = true;

    async function syncExistingSubscription() {
      try {
        const configuration = pushConfiguration.current || await fetchPushConfiguration();
        pushConfiguration.current = configuration;
        setBrowserPushConfigured(configuration.enabled === true);
        if (!configuration.enabled) return;

        const registration = await registerQueueAlertServiceWorker();
        const subscription = await registration.pushManager?.getSubscription();
        if (!subscription) return;
        await saveMyPushSubscription(subscription.toJSON());
        if (active) setBrowserPushEnabled(true);
      } catch {
        // The in-page reminder still works if background push cannot sync.
      }
    }

    void syncExistingSubscription();
    return () => {
      active = false;
    };
  }, [enabled, browserAlertPermission]);

  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return undefined;

    function handlePushMessage(event) {
      if (event.data?.type !== 'FLOWCUT_QUEUE_PUSH' || !event.data.notification) return;
      const responsePort = event.ports?.[0];
      void showQueueBrowserAlert(event.data.notification, { showSystemNotification: false })
        .then((soundPlayed) => responsePort?.postMessage({ soundPlayed }))
        .catch(() => responsePort?.postMessage({ soundPlayed: false }))
        .finally(() => responsePort?.close());
    }

    navigator.serviceWorker.addEventListener('message', handlePushMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handlePushMessage);
  }, [enabled]);

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
          await showQueueBrowserAlert(item, { showSystemNotification: !browserPushEnabled });
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
  }, [enabled, browserPushEnabled]);

  const enableBrowserAlerts = useCallback(async () => {
    setBrowserAlertBusy(true);
    setBrowserAlertError('');
    try {
      const result = await enableQueueBrowserAlerts();
      setBrowserAlertPermission(result.permission);
      setBrowserAlertSoundEnabled(result.soundEnabled);
      setBrowserAlertError(result.registrationError);

      if (result.registrationAvailable && result.permission === 'granted') {
        let configuration = pushConfiguration.current;
        if (!configuration) {
          configuration = await fetchPushConfiguration();
          pushConfiguration.current = configuration;
          setBrowserPushConfigured(configuration.enabled === true);
        }

        if (!configuration.enabled || !configuration.publicKey) {
          throw new Error('Closed-browser alerts are not configured on this server yet. Page sound and alerts work while FlowCut is open.');
        }

        const registration = await registerQueueAlertServiceWorker();
        if (!registration.pushManager) {
          throw new Error('This browser does not support background push alerts. Page sound works while FlowCut is open.');
        }

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(configuration.publicKey),
          });
        }
        await saveMyPushSubscription(subscription.toJSON());
        setBrowserPushEnabled(true);
        setBrowserPushConfigured(true);
        setBrowserAlertError('');
      }

      if ((result.permission === 'granted' || result.soundEnabled) && !requestInFlight.current) {
        requestInFlight.current = true;
        try {
          const current = await fetchMyNotifications();
          const currentNotifications = current.notifications || [];
          knownNotificationIds.current = new Set(currentNotifications.map((item) => item.id));
          setNotifications(currentNotifications);
          setUnreadCount(current.unreadCount || 0);
          for (const item of recentQueueAlerts(currentNotifications)) {
            await showQueueBrowserAlert(item, { showSystemNotification: !browserPushEnabled });
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
  }, [browserPushEnabled]);

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
    browserPushEnabled,
    browserPushConfigured,
    browserPushNeedsHomeScreen: requiresHomeScreenForPush(),
    enableBrowserAlerts,
  };
}

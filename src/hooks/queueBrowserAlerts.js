let serviceWorkerRegistrationPromise;
let alertAudioContext;
const SHOWN_ALERTS_STORAGE_KEY = 'flowcut:shown-queue-browser-alerts';

function readShownAlertIds() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SHOWN_ALERTS_STORAGE_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function rememberShownAlert(id) {
  try {
    const shownIds = readShownAlertIds();
    shownIds.add(id);
    window.localStorage.setItem(SHOWN_ALERTS_STORAGE_KEY, JSON.stringify([...shownIds].slice(-100)));
  } catch {
    // Browser privacy settings can disable storage; in-memory polling still deduplicates alerts.
  }
}

export function getBrowserAlertPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
}

export function registerQueueAlertServiceWorker() {
  if (typeof window === 'undefined' || !window.isSecureContext || !('serviceWorker' in navigator)) {
    return Promise.reject(new Error('Browser notifications need HTTPS and service worker support.'));
  }

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
      .catch((error) => {
        serviceWorkerRegistrationPromise = null;
        throw error;
      });
  }

  return serviceWorkerRegistrationPromise;
}

async function unlockAlertSound() {
  if (typeof window === 'undefined') return false;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  try {
    alertAudioContext ||= new AudioContextClass();
    if (alertAudioContext.state !== 'running') await alertAudioContext.resume();
    return alertAudioContext.state === 'running';
  } catch {
    return false;
  }
}

export async function enableQueueBrowserAlerts() {
  // Start both operations directly in the button's user gesture so Chrome can
  // show its permission prompt and unlock audio playback.
  const permissionRequest = getBrowserAlertPermission() === 'default'
    ? window.Notification.requestPermission()
    : Promise.resolve(getBrowserAlertPermission());
  const soundRequest = unlockAlertSound();

  const [permission, soundEnabled] = await Promise.all([permissionRequest, soundRequest]);
  let registrationAvailable = false;
  let registrationError = '';

  if (permission === 'granted') {
    try {
      await registerQueueAlertServiceWorker();
      registrationAvailable = true;
    } catch (error) {
      registrationError = error.message || 'Could not prepare browser notifications.';
    }
  }

  return { permission, soundEnabled, registrationAvailable, registrationError };
}

function playAlertSound() {
  if (!alertAudioContext || alertAudioContext.state !== 'running') return false;

  const startAt = alertAudioContext.currentTime;
  [784, 988].forEach((frequency, index) => {
    const start = startAt + index * 0.2;
    const oscillator = alertAudioContext.createOscillator();
    const volume = alertAudioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
    oscillator.connect(volume);
    volume.connect(alertAudioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.18);
  });
  return true;
}

export async function showQueueBrowserAlert(notification) {
  if (readShownAlertIds().has(notification.id)) return false;

  let displayed = false;
  const pageIsVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
  const pageSoundReady = pageIsVisible && alertAudioContext?.state === 'running';

  if (getBrowserAlertPermission() === 'granted') {
    const options = {
      body: notification.message,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: `flowcut-queue-${notification.id}`,
      renotify: true,
      silent: pageSoundReady,
      ...(!pageSoundReady && { vibrate: [160, 90, 160] }),
      data: { url: '/my-queue' },
    };

    try {
      const registration = await registerQueueAlertServiceWorker();
      await navigator.serviceWorker.ready;
      await registration.showNotification(notification.title, options);
      displayed = true;
    } catch {
      // Keep the reminder sound available if browser notification display fails.
    }
  }

  const soundPlayed = pageIsVisible && playAlertSound();
  if (displayed || soundPlayed) rememberShownAlert(notification.id);

  return displayed || soundPlayed;
}

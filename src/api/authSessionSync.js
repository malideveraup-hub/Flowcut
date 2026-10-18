export const AUTH_SESSION_EVENT = 'flowcut:session-expired';
export const AUTH_SESSION_ACTIVITY_EVENT = 'flowcut:session-activity';
const STORAGE_KEY = 'flowcut-auth-session-event';

export function createAuthSessionSync({ windowRef = globalThis.window, channelFactory } = {}) {
  if (!windowRef) return { publish() {}, subscribe() { return () => {}; }, close() {} };

  const createChannel = channelFactory || ((name) => {
    const Channel = windowRef.BroadcastChannel || globalThis.BroadcastChannel;
    return Channel ? new Channel(name) : null;
  });
  let channel = null;
  try { channel = createChannel('flowcut-auth-state'); } catch { /* Storage events remain available as fallback. */ }

  function safeMessage(message) {
    if (!message || !['updated', 'logout', 'expired', 'activity'].includes(message.type)) return null;
    const result = { type: message.type, sentAt: Date.now() };
    if (message.type === 'activity') {
      const { idleExpiresAt, absoluteExpiresAt, idleRemainingMs, absoluteRemainingMs } = message;
      if (![idleExpiresAt, absoluteExpiresAt, idleRemainingMs, absoluteRemainingMs]
        .every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
      result.idleExpiresAt = idleExpiresAt;
      result.absoluteExpiresAt = absoluteExpiresAt;
      result.idleRemainingMs = idleRemainingMs;
      result.absoluteRemainingMs = absoluteRemainingMs;
    }
    return result;
  }

  function publish(message) {
    const nextMessage = safeMessage(message);
    if (!nextMessage) return;
    if (channel) {
      channel.postMessage(nextMessage);
      return;
    }
    try {
      windowRef.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMessage));
      windowRef.localStorage.removeItem(STORAGE_KEY);
    } catch { /* Private browsing may disable localStorage. */ }
  }

  function subscribe(listener) {
    const onMessage = (message) => {
      const cleaned = safeMessage(message);
      if (cleaned) listener(cleaned);
    };
    const onChannelMessage = (event) => onMessage(event.data);
    const onStorage = (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { onMessage(JSON.parse(event.newValue)); } catch { /* Ignore malformed cross-tab events. */ }
    };
    channel?.addEventListener('message', onChannelMessage);
    if (!channel) windowRef.addEventListener('storage', onStorage);
    return () => {
      channel?.removeEventListener('message', onChannelMessage);
      if (!channel) windowRef.removeEventListener('storage', onStorage);
    };
  }

  return { publish, subscribe, close: () => channel?.close() };
}

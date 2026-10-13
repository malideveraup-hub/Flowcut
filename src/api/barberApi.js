import { apiRequest } from './httpClient';

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0;
    return (character === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
  });
}

export function fetchBarberDashboard() {
  return apiRequest('/api/barber/dashboard');
}

export function setMyAvailability(availability, requestId = createRequestId()) {
  return apiRequest('/api/barber/availability', { method: 'PATCH', body: { availability, requestId } }).then((d) => d.barber);
}

export function startService(entryId, requestId = createRequestId()) {
  return apiRequest(`/api/barber/queue/${entryId}/start`, { method: 'PATCH', body: { requestId } });
}

export function finishService(entryId, requestId = createRequestId()) {
  return apiRequest(`/api/barber/queue/${entryId}/finish`, { method: 'PATCH', body: { requestId } });
}

export function applyDelay(entryId, minutes, requestId = createRequestId()) {
  return apiRequest(`/api/barber/queue/${entryId}/delay`, { method: 'PATCH', body: { minutes, requestId } });
}

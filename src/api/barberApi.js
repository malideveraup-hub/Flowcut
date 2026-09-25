import { apiRequest } from './httpClient';

export function fetchBarberDashboard() {
  return apiRequest('/api/barber/dashboard');
}

export function setMyAvailability(availability) {
  return apiRequest('/api/barber/availability', { method: 'PATCH', body: { availability } }).then((d) => d.barber);
}

export function startService(entryId) {
  return apiRequest(`/api/barber/queue/${entryId}/start`, { method: 'PATCH' });
}

export function finishService(entryId) {
  return apiRequest(`/api/barber/queue/${entryId}/finish`, { method: 'PATCH' });
}

export function applyDelay(entryId, minutes) {
  return apiRequest(`/api/barber/queue/${entryId}/delay`, { method: 'PATCH', body: { minutes } });
}

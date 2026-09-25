import { apiRequest } from './httpClient';

// ---- Own shop ----

export function fetchOwnShop() {
  return apiRequest('/api/shop-admin/shop').then((d) => d.shop);
}

export function updateOwnShop(fields) {
  return apiRequest('/api/shop-admin/shop', { method: 'PATCH', body: fields }).then((d) => d.shop);
}

// ---- Services ----

export function fetchOwnServices() {
  return apiRequest('/api/shop-admin/services').then((d) => d.services);
}

export function createService(fields) {
  return apiRequest('/api/shop-admin/services', { method: 'POST', body: fields }).then((d) => d.service);
}

export function updateService(serviceId, fields) {
  return apiRequest(`/api/shop-admin/services/${serviceId}`, { method: 'PATCH', body: fields }).then((d) => d.service);
}

export function setServiceStatus(serviceId, status) {
  return apiRequest(`/api/shop-admin/services/${serviceId}/status`, { method: 'PATCH', body: { status } }).then(
    (d) => d.service
  );
}

// ---- Barbers ----

export function fetchShopBarbers() {
  return apiRequest('/api/shop-admin/barbers').then((d) => d.barbers);
}

export function createBarber(fields) {
  return apiRequest('/api/shop-admin/barbers', { method: 'POST', body: fields }).then((d) => d.barber);
}

export function updateBarberStatus(barberId, fields) {
  return apiRequest(`/api/shop-admin/barbers/${barberId}`, { method: 'PATCH', body: fields }).then((d) => d.barber);
}

// ---- Queue ----

export function fetchShopQueue() {
  return apiRequest('/api/shop-admin/queue').then((d) => d.queue);
}

export function addWalkIn(fields) {
  return apiRequest('/api/shop-admin/queue', { method: 'POST', body: fields });
}

export function skipQueueEntry(entryId) {
  return apiRequest(`/api/shop-admin/queue/${entryId}/skip`, { method: 'PATCH' });
}

export function cancelQueueEntry(entryId) {
  return apiRequest(`/api/shop-admin/queue/${entryId}/cancel`, { method: 'PATCH' });
}

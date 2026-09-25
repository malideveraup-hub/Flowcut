import { apiRequest } from './httpClient';

// ---- Public ----

export function fetchPublicShops() {
  return apiRequest('/api/shops').then((d) => d.shops);
}

export function fetchPublicShop(shopId) {
  return apiRequest(`/api/shops/${shopId}`).then((d) => d.shop);
}

export function fetchPublicServices(shopId) {
  return apiRequest(`/api/shops/${shopId}/services`).then((d) => d.services);
}

export function fetchPublicQueue(shopId) {
  return apiRequest(`/api/shops/${shopId}/queue`).then((d) => d.queue);
}

// ---- Shop application (any authenticated user) ----

export function submitShopApplication(fields) {
  return apiRequest('/api/shops', { method: 'POST', body: fields }).then((d) => d.shop);
}

export function fetchMyShopApplication() {
  return apiRequest('/api/shops/my-application').then((d) => d.shop);
}
// ---- Customer queue actions ----

export function joinShopQueue(shopId, serviceId) {
  return apiRequest(`/api/shops/${shopId}/queue`, { method: 'POST', body: { serviceId } });
}

export function fetchMyQueue() {
  return apiRequest('/api/queue/my').then((d) => d.entry);
}

export function cancelMyQueue() {
  return apiRequest('/api/queue/my', { method: 'DELETE' });
}

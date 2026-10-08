import { apiRequest } from './httpClient';

export function fetchAllShops() {
  return apiRequest('/api/admin/shops').then((d) => d.shops);
}

export function approveShop(shopId) {
  return apiRequest(`/api/admin/shops/${shopId}/approve`, { method: 'PATCH' }).then((d) => d.shop);
}

export function rejectShop(shopId, reason) {
  return apiRequest(`/api/admin/shops/${shopId}/reject`, { method: 'PATCH', body: { reason } }).then((d) => d.shop);
}

export function generateShopQueueQr(shopId) {
  return apiRequest(`/api/admin/shops/${shopId}/queue-qr`, { method: 'POST' }).then((d) => d.shop);
}

export function regenerateShopQueueQr(shopId) {
  return apiRequest(`/api/admin/shops/${shopId}/queue-qr/regenerate`, { method: 'POST' }).then((d) => d.shop);
}

export function setShopQueueQrStatus(shopId, status) {
  return apiRequest(`/api/admin/shops/${shopId}/queue-qr`, { method: 'PATCH', body: { status } }).then((d) => d.shop);
}

export function fetchAllUsers() {
  return apiRequest('/api/admin/users').then((d) => d.users);
}

export function fetchBasicAnalytics() {
  return apiRequest('/api/admin/analytics/basic');
}

export function fetchCompletedServiceAnalytics() {
  return apiRequest('/api/admin/analytics/completed-services').then((data) => data.services);
}

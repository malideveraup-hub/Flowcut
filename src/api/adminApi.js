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

export function fetchAllUsers() {
  return apiRequest('/api/admin/users').then((d) => d.users);
}

export function fetchBasicAnalytics() {
  return apiRequest('/api/admin/analytics/basic');
}

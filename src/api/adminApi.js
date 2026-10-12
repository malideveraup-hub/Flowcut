import { apiBlobRequest, apiRequest, apiUploadRequest } from './httpClient';

export function fetchAdminMapImages() {
  return apiRequest('/api/shop-admin/map-images').then((data) => data.images);
}

export function createMapImageDraft(details) {
  return apiRequest('/api/shop-admin/map-images', { method: 'POST', body: details }).then((data) => data.image);
}

export function updateMapImage(imageId, details) {
  return apiRequest(`/api/shop-admin/map-images/${imageId}`, { method: 'PATCH', body: details }).then((data) => data.image);
}

export function uploadMapImageFile(imageId, file, onProgress) {
  return apiUploadRequest(
    `/api/shop-admin/map-images/${imageId}/image`,
    file,
    { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) },
    onProgress
  ).then((data) => data.image);
}

export function setMapImagePublished(imageId, published) {
  return apiRequest(`/api/shop-admin/map-images/${imageId}/publication`, {
    method: 'PATCH',
    body: { published },
  }).then((data) => data.image);
}

export function deleteMapImage(imageId) {
  return apiRequest(`/api/shop-admin/map-images/${imageId}`, { method: 'DELETE' });
}

export function fetchAdminMapImage(imageUrl) {
  return apiBlobRequest(imageUrl);
}

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

import { apiBlobRequest, apiRequest, apiUploadRequest } from './httpClient';

// ---- Public ----

export function fetchPublicShops() {
  return apiRequest('/api/shops').then((d) => d.shops);
}

export function fetchPublicShop(shopId) {
  return apiRequest(`/api/shops/${shopId}`).then((d) => d.shop);
}

export function fetchPublicShopByQueueQr(token) {
  return apiRequest(`/api/shops/queue-qr/${encodeURIComponent(token)}`).then((d) => d.shop);
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

export function saveMyShopApplicationDraft(application) {
  return apiRequest('/api/shops/my-application/draft', { method: 'POST', body: application }).then((d) => d.application);
}

export function submitMyShopRegistration(application) {
  return apiRequest('/api/shops/my-application/submit', { method: 'POST', body: application }).then((d) => d.application);
}

export function uploadMyShopApplicationDocument(key, file, onProgress) {
  const extension = file.name.split('.').pop().toLowerCase();
  const fallbackType = extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';
  return apiUploadRequest(
    `/api/shops/my-application/documents/${encodeURIComponent(key)}`,
    file,
    {
      'Content-Type': file.type || fallbackType,
      'X-File-Name': encodeURIComponent(file.name),
    },
    onProgress
  ).then((d) => d.document);
}

export function removeMyShopApplicationDocument(key) {
  return apiRequest(`/api/shops/my-application/documents/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

export function fetchMyShopApplicationDocument(key) {
  return apiBlobRequest(`/api/shops/my-application/documents/${encodeURIComponent(key)}`);
}

export function fetchAdminShopApplicationDocument(shopId, key) {
  return apiBlobRequest(`/api/admin/shops/${encodeURIComponent(shopId)}/documents/${encodeURIComponent(key)}`);
}
// ---- Customer queue actions ----

export function joinShopQueue(shopId, serviceId) {
  return apiRequest(`/api/shops/${shopId}/queue`, { method: 'POST', body: { serviceId } });
}

export function fetchMyQueue() {
  return apiRequest('/api/queue/my').then((d) => d.entry);
}

export function checkInMyQueue() {
  return apiRequest('/api/queue/my/check-in', { method: 'POST' }).then((d) => d.entry);
}

export function fetchMyQueueHistory(page = 1, limit = 5) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest(`/api/queue/my/history?${query}`);
}

export function cancelMyQueue() {
  return apiRequest('/api/queue/my', { method: 'DELETE' });
}

export function fetchMyFavorites() {
  return apiRequest('/api/shops/favorites').then((d) => d.shops);
}

export function addMyFavorite(shopId) {
  return apiRequest(`/api/shops/favorites/${shopId}`, { method: 'PUT' });
}

export function removeMyFavorite(shopId) {
  return apiRequest(`/api/shops/favorites/${shopId}`, { method: 'DELETE' });
}

export function fetchMyNotifications(limit = 30) {
  return apiRequest(`/api/notifications?limit=${encodeURIComponent(limit)}`);
}

export function markMyNotificationRead(notificationId) {
  return apiRequest(`/api/notifications/${notificationId}/read`, { method: 'PATCH' });
}

export function markAllMyNotificationsRead() {
  return apiRequest('/api/notifications/read-all', { method: 'PATCH' });
}

export const QR_APP_ORIGIN = import.meta.env.VITE_QR_APP_ORIGIN || window.location.origin;

export function getQrAppUrl(payload) {
  return new URL(payload, QR_APP_ORIGIN).href;
}

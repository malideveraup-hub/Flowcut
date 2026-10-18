export function noStoreApiResponse(_req, res, next) {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
}

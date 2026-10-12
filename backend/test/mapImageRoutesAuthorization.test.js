import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

test('map image management endpoints reject unauthenticated requests before touching storage', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const imageId = '507f1f77bcf86cd799439011';
  const requests = [
    ['GET', '/api/shop-admin/map-images'],
    ['GET', '/api/shops/507f1f77bcf86cd799439011/rating'],
    ['PUT', '/api/shops/507f1f77bcf86cd799439011/rating', { rating: 5 }],
    ['POST', '/api/shop-admin/map-images', { title: 'No access' }],
    ['GET', `/api/shop-admin/map-images/${imageId}/image`],
    ['POST', `/api/shop-admin/map-images/${imageId}/image`, Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'],
    ['PATCH', `/api/shop-admin/map-images/${imageId}`, { title: 'No access' }],
    ['PATCH', `/api/shop-admin/map-images/${imageId}/publication`, { published: true }],
    ['DELETE', `/api/shop-admin/map-images/${imageId}`],
  ];

  for (const [method, path, body, contentType = 'application/json'] of requests) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': contentType },
      ...(body === undefined ? {} : { body: contentType === 'application/json' ? JSON.stringify(body) : Buffer.from([0xff, 0xd8, 0xff]) }),
    });
    assert.equal(response.status, 401, `${method} ${path} should require authentication`);
  }
});

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import Barber from '../src/models/Barber.js';
import Service from '../src/models/Service.js';
import QueueEntry from '../src/models/QueueEntry.js';
import { AUTH_COOKIE_NAME } from '../src/utils/cookies.js';
import { signToken } from '../src/utils/tokens.js';
import { createService } from '../src/services/serviceManagementService.js';
import { updateBarberStatus } from '../src/services/barberManagementService.js';

const testUsers = {
  barberA: { _id: 'barber-user-a', name: 'Barber A', role: 'barber', shopId: 'shop-a', emailVerified: true },
  barberB: { _id: 'barber-user-b', name: 'Barber B', role: 'barber', shopId: 'shop-b', emailVerified: true },
  adminA: { _id: 'admin-user-a', name: 'Shop Admin A', role: 'shop_admin', shopId: 'shop-a', emailVerified: true },
  customer: { _id: 'customer-user', name: 'Customer', role: 'customer', shopId: null, emailVerified: true },
};

function setStatic(model, name, value, restores) {
  const descriptor = Object.getOwnPropertyDescriptor(model, name);
  model[name] = value;
  restores.push(() => {
    if (descriptor) Object.defineProperty(model, name, descriptor);
    else delete model[name];
  });
}

test('barber service endpoints enforce shop scope, admin parity, and no barber deletion', async (t) => {
  const restores = [];
  const created = [];
  let serviceListFilter;
  let deleteCalls = 0;

  setStatic(User, 'findById', async (userId) => Object.values(testUsers).find((user) => user._id === userId) || null, restores);
  setStatic(Barber, 'findOne', async ({ userId, shopId }) => {
    const user = Object.values(testUsers).find((candidate) => candidate._id === userId);
    if (!user || user.role !== 'barber' || user.shopId !== shopId) return null;
    return { _id: 'barber-profile-' + userId, shopId, userId, status: 'ACTIVE' };
  }, restores);
  setStatic(Service, 'create', async (fields) => {
    if (fields.name === 'Existing Service') throw Object.assign(new Error('duplicate key'), { code: 11000 });
    created.push(fields);
    return { _id: 'service-' + created.length, ...fields };
  }, restores);
  setStatic(Service, 'find', (filter) => {
    serviceListFilter = filter;
    return { sort: async () => [] };
  }, restores);
  setStatic(Service, 'deleteOne', async () => {
    deleteCalls += 1;
    return { deletedCount: 1 };
  }, restores);
  t.after(() => restores.reverse().forEach((restore) => restore()));

  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = 'http://127.0.0.1:' + server.address().port;
  const authHeaders = (userId) => ({
    cookie: AUTH_COOKIE_NAME + '=' + signToken({ id: userId }),
    'Content-Type': 'application/json',
  });
  const postService = (userId, fields) => fetch(base + '/api/barber/services', {
    method: 'POST',
    headers: userId ? authHeaders(userId) : { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });

  assert.equal((await postService(null, { name: 'Cut', estimatedDuration: 30, price: 25 })).status, 401);
  assert.equal((await postService(testUsers.customer._id, { name: 'Cut', estimatedDuration: 30, price: 25 })).status, 403);

  const fields = { name: 'Barber Cut', estimatedDuration: 30, price: 25, shopId: 'shop-b' };
  const response = await postService(testUsers.barberA._id, fields);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.data.service.shopId, 'shop-a');
  assert.equal(result.data.service.status, 'ACTIVE');
  assert.equal(created[0].shopId, 'shop-a');

  assert.equal((await postService(testUsers.barberB._id, { ...fields, name: 'Shop B Cut', shopId: 'shop-a' })).status, 201);
  assert.equal(created[1].shopId, 'shop-b');
  assert.equal((await fetch(base + '/api/barber/services', { headers: authHeaders(testUsers.barberA._id) })).status, 200);
  assert.deepEqual(serviceListFilter, { shopId: 'shop-a' });

  assert.equal((await postService(testUsers.barberA._id, { name: '<script>', estimatedDuration: 30.5, price: -1 })).status, 400);
  assert.equal(created.length, 2);
  assert.equal((await postService(testUsers.barberA._id, { name: 'Existing Service', estimatedDuration: 30, price: 25 })).status, 409);
  assert.equal((await postService(testUsers.adminA._id, fields)).status, 403);

  const directDelete = await fetch(base + '/api/barber/services/507f1f77bcf86cd799439011', {
    method: 'DELETE',
    headers: authHeaders(testUsers.barberA._id),
  });
  assert.equal(directDelete.status, 404);
  const shopAdminDelete = await fetch(base + '/api/shop-admin/services/507f1f77bcf86cd799439011', {
    method: 'DELETE',
    headers: authHeaders(testUsers.barberA._id),
  });
  assert.equal(shopAdminDelete.status, 403);
  assert.equal(deleteCalls, 0);

  const adminCreate = await fetch(base + '/api/shop-admin/services', {
    method: 'POST',
    headers: authHeaders(testUsers.adminA._id),
    body: JSON.stringify({ ...fields, name: 'Admin Created', shopId: 'shop-b' }),
  });
  assert.equal(adminCreate.status, 201);
  assert.equal(created[2].shopId, 'shop-a');
});

test('shared service creation validates before saving and maps duplicate-name conflicts', async (t) => {
  const restores = [];
  const writes = [];
  setStatic(Service, 'create', async (fields) => {
    if (fields.name === 'Duplicate') throw Object.assign(new Error('duplicate key'), { code: 11000 });
    writes.push(fields);
    return fields;
  }, restores);
  t.after(() => restores.reverse().forEach((restore) => restore()));

  await assert.rejects(
    createService('shop-a', { name: 'x', estimatedDuration: 30.5, price: -2 }),
    (error) => Boolean(error.statusCode === 400 && error.errors.name && error.errors.estimatedDuration && error.errors.price)
  );
  assert.equal(writes.length, 0);
  await assert.rejects(
    createService('shop-a', { name: 'Duplicate', estimatedDuration: 30, price: 25 }),
    (error) => error.statusCode === 409
  );
  await createService('shop-b', { name: 'Valid', estimatedDuration: 20, price: 0 });
  assert.equal(writes[0].shopId, 'shop-b');
  assert.equal(writes[0].status, 'ACTIVE');
});

test('barber deactivation preserves assigned queue work and moves safe deactivations offline', async (t) => {
  const restores = [];
  let queueExists = true;
  let savedUpdate = null;
  let savedFilter = null;
  setStatic(Barber, 'findOne', async () => ({ _id: 'barber-a', shopId: 'shop-a', status: 'ACTIVE', availability: 'AVAILABLE' }), restores);
  setStatic(QueueEntry, 'exists', async (filter) => {
    assert.deepEqual(filter, { shopId: 'shop-a', barberId: 'barber-a', status: { $in: [
      'JOINED', 'WAITING', 'CALLED', 'IN_SERVICE', 'DELAYED', 'PAUSED',
    ] } });
    return queueExists;
  }, restores);
  setStatic(Barber, 'findOneAndUpdate', async (filter, update) => {
    savedFilter = filter;
    savedUpdate = update;
    return { _id: 'barber-a', ...update.$set };
  }, restores);
  t.after(() => restores.reverse().forEach((restore) => restore()));

  await assert.rejects(
    updateBarberStatus('shop-a', 'barber-a', { status: 'INACTIVE' }),
    (error) => error.statusCode === 409
  );
  assert.equal(savedUpdate, null);

  queueExists = false;
  const result = await updateBarberStatus('shop-a', 'barber-a', { status: 'INACTIVE' });
  assert.deepEqual(savedFilter, { _id: 'barber-a', shopId: 'shop-a', status: 'ACTIVE', availability: { $ne: 'BUSY' } });
  assert.deepEqual(savedUpdate, { $set: { status: 'INACTIVE', availability: 'OFFLINE' } });
  assert.equal(result.status, 'INACTIVE');
  assert.equal(result.availability, 'OFFLINE');
});

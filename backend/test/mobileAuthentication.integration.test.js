import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const enabled = process.env.FLOWCUT_DB_INTEGRATION === '1';

test('mobile and desktop origins keep authenticated queue and role access working', { skip: !enabled }, async () => {
  process.env.NODE_ENV = 'development';
  dotenv.config();

  const { env } = await import('../src/config/env.js');
  mongoose.set('autoIndex', false);
  const { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } = await import('../src/validation/consentValidation.js');
  const { User, Shop, Service, Barber, QueueEntry } = await import('../src/models/index.js');
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;
  const jwt = (await import('jsonwebtoken')).default;

  const databaseName = `fc_mobile_auth_${Date.now().toString(36)}_${randomUUID().replaceAll('-', '').slice(0, 6)}`;
  const unique = randomUUID().replaceAll('-', '');
  const password = 'FlowCutTest123!';
  const desktopOrigin = 'http://localhost:5173';
  const mobileOrigin = 'http://192.168.1.42:5173';
  let connected = false;
  let apiServer = null;
  let stage = 'connecting to isolated database';

  try {
    try {
      await mongoose.connect(env.mongoUri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
      connected = true;
    } catch (error) {
      assert.fail(`Could not connect to the isolated mobile auth test database (${error.name}).`);
    }

    stage = 'seeding customer, staff, shop, and service records';
    const passwordHash = await bcrypt.hash(password, 4);
    const createUser = (name, role, suffix, extra = {}) => User.create({
      name,
      email: `mobile-${suffix}-${unique}@gmail.com`,
      passwordHash,
      emailVerified: true,
      role,
      ...extra,
    });

    const shopAdmin = await createUser('Mobile Test Admin', 'shop_admin', 'admin');
    const shop = await Shop.create({
      name: `Mobile Auth Shop ${unique.slice(0, 8)}`,
      address: '1 Test Street',
      contact: { phone: '09123456789' },
      ownerId: shopAdmin._id,
      status: 'APPROVED',
    });
    shopAdmin.shopId = shop._id;
    await shopAdmin.save();

    const customer = await createUser('Mobile Test Customer', 'customer', 'customer', {
      lastName: 'FlowCut',
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
      privacyAccepted: true,
      privacyAcceptedAt: new Date(),
      privacyVersion: CURRENT_PRIVACY_VERSION,
    });
    const barberUser = await createUser('Mobile Test Barber', 'barber', 'barber', { shopId: shop._id });
    const superAdmin = await createUser('Mobile Test Super Admin', 'super_admin', 'superadmin');
    await Barber.create({
      userId: barberUser._id,
      shopId: shop._id,
      name: barberUser.name,
      status: 'ACTIVE',
      availability: 'AVAILABLE',
    });
    const service = await Service.create({
      shopId: shop._id,
      name: 'Mobile Test Cut',
      estimatedDuration: 25,
      price: 0,
      status: 'ACTIVE',
    });

    apiServer = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      apiServer.once('listening', resolve);
      apiServer.once('error', reject);
    });
    const apiRoot = `http://127.0.0.1:${apiServer.address().port}`;

    async function login(email, origin) {
      const response = await fetch(`${apiRoot}/api/auth/login`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(response.status, 200, `login from ${origin} should succeed`);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
      const setCookie = response.headers.get('set-cookie') || '';
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Lax/i);
      return setCookie.split(';', 1)[0];
    }

    async function get(path, cookie, origin = mobileOrigin) {
      return fetch(`${apiRoot}${path}`, {
        headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
      });
    }

    async function send(path, cookie, origin, method, body) {
      return fetch(`${apiRoot}${path}`, {
        method,
        headers: {
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }

    stage = 'browsing public shop and service data from the phone origin';
    const publicShops = await get('/api/shops', null, mobileOrigin);
    assert.equal(publicShops.status, 200);
    assert.ok((await publicShops.json()).data.shops.some((item) => item.id === String(shop._id)));
    const publicServices = await get(`/api/shops/${shop._id}/services`, null, mobileOrigin);
    assert.equal(publicServices.status, 200);
    assert.equal((await publicServices.json()).data.services.length, 1);

    stage = 'signing in through desktop and phone origins';
    const mobileCookie = await login(customer.email, mobileOrigin);
    const desktopCookie = await login(customer.email, desktopOrigin);

    stage = 'restoring the customer session after a page reload';
    const refreshedSession = await get('/api/auth/me', mobileCookie, mobileOrigin);
    assert.equal(refreshedSession.status, 200);
    assert.equal((await refreshedSession.json()).data.user.role, 'customer');
    const desktopSession = await get('/api/auth/me', desktopCookie, desktopOrigin);
    assert.equal(desktopSession.status, 200);
    assert.equal((await desktopSession.json()).data.user.role, 'customer');

    stage = 'using customer profile, favorites, and ratings';
    const profileUpdate = await send('/api/auth/me', mobileCookie, mobileOrigin, 'PATCH', { name: 'Updated Test Customer' });
    assert.equal(profileUpdate.status, 200);
    assert.equal((await profileUpdate.json()).data.user.name, 'Updated Test Customer');
    const addFavorite = await send(`/api/shops/favorites/${shop._id}`, mobileCookie, mobileOrigin, 'PUT');
    assert.equal(addFavorite.status, 200);
    const favorites = await get('/api/shops/favorites', mobileCookie, mobileOrigin);
    assert.equal(favorites.status, 200);
    assert.ok((await favorites.json()).data.shops.some((item) => item.id === String(shop._id)));
    const saveRating = await send(`/api/shops/${shop._id}/rating`, mobileCookie, mobileOrigin, 'PUT', { rating: 5 });
    assert.equal(saveRating.status, 200);

    stage = 'joining a queue from the phone origin and retrying safely';
    const join = await fetch(`${apiRoot}/api/shops/${shop._id}/queue`, {
      method: 'POST',
      headers: { Origin: mobileOrigin, Cookie: mobileCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: String(service._id), customerId: String(barberUser._id) }),
    });
    assert.equal(join.status, 201);
    assert.equal(join.headers.get('access-control-allow-origin'), mobileOrigin);
    const joined = await join.json();
    assert.ok(joined.data.queueEntryId);

    const duplicate = await fetch(`${apiRoot}/api/shops/${shop._id}/queue`, {
      method: 'POST',
      headers: { Origin: mobileOrigin, Cookie: mobileCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: String(service._id) }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(await QueueEntry.countDocuments({ customerId: customer._id }), 1);

    const desktopQueue = await get('/api/queue/my', desktopCookie, desktopOrigin);
    assert.equal(desktopQueue.status, 200);
    assert.equal((await desktopQueue.json()).data.entry.id, joined.data.queueEntryId);
    const storedEntry = await QueueEntry.findById(joined.data.queueEntryId);
    assert.equal(String(storedEntry.customerId), String(customer._id));

    const checkIn = await send('/api/queue/my/check-in', mobileCookie, mobileOrigin, 'POST');
    assert.equal(checkIn.status, 200);
    const leaveQueue = await send('/api/queue/my', mobileCookie, mobileOrigin, 'DELETE');
    assert.equal(leaveQueue.status, 200);

    stage = 'distinguishing missing, expired, and insufficient-role access';
    assert.equal((await get('/api/queue/my', null)).status, 401);
    const expiredCookie = `flowcut_token=${jwt.sign({ id: String(customer._id) }, env.jwtSecret, { expiresIn: -1 })}`;
    assert.equal((await get('/api/queue/my', expiredCookie)).status, 401);

    for (const path of ['/api/barber/dashboard', '/api/shop-admin/shop', '/api/admin/shops']) {
      assert.equal((await get(path, mobileCookie)).status, 403, `customer must be forbidden from ${path}`);
    }

    const barberCookie = await login(barberUser.email, mobileOrigin);
    const barberDashboard = await get('/api/barber/dashboard', barberCookie);
    assert.equal(barberDashboard.status, 200);

    const adminCookie = await login(shopAdmin.email, desktopOrigin);
    assert.equal((await get('/api/shop-admin/shop', adminCookie, desktopOrigin)).status, 200);

    const superAdminCookie = await login(superAdmin.email, desktopOrigin);
    assert.equal((await get('/api/admin/shops', superAdminCookie, desktopOrigin)).status, 200);

    const logout = await send('/api/auth/logout', mobileCookie, mobileOrigin, 'POST');
    assert.equal(logout.status, 200);
    assert.equal((await get('/api/auth/me', null, mobileOrigin)).status, 401);
  } catch (error) {
    error.message = `Mobile authentication integration failure during ${stage}: ${error.message}`;
    throw error;
  } finally {
    if (apiServer) await new Promise((resolve) => apiServer.close(resolve));
    try {
      if (connected) await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  }
});

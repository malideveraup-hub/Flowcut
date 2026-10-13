import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const enabled = process.env.FLOWCUT_DB_INTEGRATION === '1';

// Opt-in: uses a unique database name and drops that isolated database afterward.
test('repeat and different-customer services each get independent timer records', { skip: !enabled }, async () => {
  dotenv.config();
  const { env } = await import('../src/config/env.js');
  const { default: User } = await import('../src/models/User.js');
  const { default: Shop } = await import('../src/models/Shop.js');
  const { default: Service } = await import('../src/models/Service.js');
  const { default: Barber } = await import('../src/models/Barber.js');
  const { default: QueueEntry } = await import('../src/models/QueueEntry.js');
  const { default: ServiceLog } = await import('../src/models/ServiceLog.js');
  const {
    finishService,
    getBarberDashboard,
    getMyActiveQueueEntry,
    getMyQueueHistory,
    joinQueue,
    applyDelay,
    startService,
  } = await import('../src/services/queueService.js');

  const testDatabaseName = `fc_timer_${Date.now().toString(36)}_${randomUUID().replaceAll('-', '').slice(0, 6)}`;
  let connected = false;
  let apiServer = null;
  let stage = 'connecting to isolated database';
  try {
    try {
      await mongoose.connect(env.mongoUri, { dbName: testDatabaseName, serverSelectionTimeoutMS: 5000 });
      connected = true;
    } catch (error) {
      assert.fail(`Could not connect to the isolated timer test database (${error.name}).`);
    }

    stage = 'seeding isolated shop and accounts';
    const unique = randomUUID();
    const owner = await User.create({ name: 'Timer Test Owner', role: 'shop_admin', passwordHash: unique });
    const customerA = await User.create({
      name: 'Customer A', lastName: 'Timer Test', email: `timer-a-${unique}@example.test`,
      role: 'customer', passwordHash: unique,
    });
    const customerB = await User.create({
      name: 'Customer B', lastName: 'Timer Test', email: `timer-b-${unique}@example.test`,
      role: 'customer', passwordHash: unique,
    });
    const barberUser = await User.create({ name: 'Timer Test Barber', role: 'barber', passwordHash: unique });
    const shop = await Shop.create({
      name: `Timer Test Shop ${unique.slice(0, 8)}`,
      address: '1 Test Street',
      contact: { phone: '09123456789' },
      ownerId: owner._id,
      status: 'APPROVED',
    });
    barberUser.shopId = shop._id;
    await barberUser.save();
    const barber = await Barber.create({
      userId: barberUser._id,
      shopId: shop._id,
      name: barberUser.name,
      status: 'ACTIVE',
      availability: 'AVAILABLE',
    });
    const service = await Service.create({
      shopId: shop._id,
      name: 'Timer Test Cut',
      estimatedDuration: 27,
      price: 0,
      status: 'ACTIVE',
    });

    async function joinAssignedCustomer(customer) {
      const entry = await joinQueue(String(customer._id), String(shop._id), String(service._id));
      await QueueEntry.updateOne({ _id: entry._id }, { $set: { barberId: barber._id } });
      return entry;
    }

    stage = 'starting, extending, and finishing the first session';
    const firstEntry = await joinAssignedCustomer(customerA);
    const firstStartRequest = randomUUID();
    await startService(shop._id, barber._id, firstEntry._id, firstStartRequest);
    await ServiceLog.findOneAndUpdate(
      { queueEntryId: firstEntry._id },
      { $set: { startTime: new Date(Date.now() - 12 * 60_000) } }
    );
    await applyDelay(shop._id, barber._id, firstEntry._id, 10, randomUUID());

    const firstFinishRequest = randomUUID();
    await finishService(shop._id, barber._id, firstEntry._id, firstFinishRequest);
    const finishedAt = (await ServiceLog.findOne({ queueEntryId: firstEntry._id })).endTime;
    await finishService(shop._id, barber._id, firstEntry._id, firstFinishRequest);
    assert.equal((await QueueEntry.findById(firstEntry._id)).status, 'COMPLETED');
    assert.equal((await ServiceLog.findOne({ queueEntryId: firstEntry._id })).endTime.getTime(), finishedAt.getTime());
    assert.equal(await getMyActiveQueueEntry(customerA._id), null);

    stage = 'immediate repeat join and timer refresh';
    const secondEntry = await joinAssignedCustomer(customerA);
    assert.notEqual(String(secondEntry._id), String(firstEntry._id));
    await startService(shop._id, barber._id, secondEntry._id, randomUUID());

    const firstLog = await ServiceLog.findOne({ queueEntryId: firstEntry._id });
    const secondLog = await ServiceLog.findOne({ queueEntryId: secondEntry._id });
    const secondQueueEntry = await QueueEntry.findById(secondEntry._id);
    assert.ok(secondLog.startTime > firstLog.endTime);
    assert.equal(secondQueueEntry.baseMinutes, 27);
    assert.equal(secondQueueEntry.delayMinutes, 0);
    assert.equal(secondLog.endTime, null);

    const customerRefresh = await getMyActiveQueueEntry(customerA._id);
    const barberRefresh = await getBarberDashboard(shop._id, barber._id);
    assert.equal(customerRefresh.id, String(secondEntry._id));
    assert.equal(customerRefresh.status, 'IN_SERVICE');
    assert.equal(barberRefresh.current.id, String(secondEntry._id));
    assert.equal(new Date(barberRefresh.current.startedAt).getTime(), secondLog.startTime.getTime());
    assert.ok(customerRefresh.wait.remainingMinutes > 0 && customerRefresh.wait.remainingMinutes <= 27);

    stage = 'different customer session and completed history';
    await finishService(shop._id, barber._id, secondEntry._id, randomUUID());
    const secondCustomerEntry = await joinAssignedCustomer(customerB);
    await startService(shop._id, barber._id, secondCustomerEntry._id, randomUUID());
    const thirdLog = await ServiceLog.findOne({ queueEntryId: secondCustomerEntry._id });
    const differentCustomerRefresh = await getBarberDashboard(shop._id, barber._id);
    assert.equal(differentCustomerRefresh.current.id, String(secondCustomerEntry._id));
    assert.equal(differentCustomerRefresh.current.extraMinutes, 0);
    assert.notEqual(thirdLog.startTime.getTime(), secondLog.startTime.getTime());

    const { createApp } = await import('../src/app.js');
    const { signToken } = await import('../src/utils/tokens.js');
    apiServer = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      apiServer.once('listening', resolve);
      apiServer.once('error', reject);
    });
    const apiRoot = `http://127.0.0.1:${apiServer.address().port}`;
    async function getPageData(path, user) {
      const response = await fetch(`${apiRoot}${path}`, {
        headers: { Cookie: `flowcut_token=${signToken({ id: String(user._id) })}` },
      });
      return { status: response.status, cacheControl: response.headers.get('cache-control'), body: await response.json() };
    }

    const [customerPage, barberPage] = await Promise.all([
      getPageData('/api/queue/my', customerB),
      getPageData('/api/barber/dashboard', barberUser),
    ]);
    assert.equal(customerPage.status, 200);
    assert.equal(barberPage.status, 200);
    assert.equal(customerPage.cacheControl, 'private, no-store');
    assert.equal(barberPage.cacheControl, 'private, no-store');
    assert.equal(customerPage.body.data.entry.id, String(secondCustomerEntry._id));
    assert.equal(barberPage.body.data.current.id, String(secondCustomerEntry._id));

    const history = await getMyQueueHistory(customerA._id, { page: 1, pageSize: 20 });
    assert.equal(history.items.length, 2);
    assert.ok(history.items.every((item) => item.status === 'COMPLETED'));
  } catch (error) {
    error.message = `Lifecycle integration failure during ${stage}: ${error.message}`;
    throw error;
  } finally {
    if (apiServer) {
      await new Promise((resolve) => apiServer.close(resolve));
    }
    try {
      if (connected) await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  }
});

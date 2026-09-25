// Idempotent development/testing seed script (Section 20 of the Phase 4
// brief). Run manually with:
//
//   npm run seed
//
// It NEVER runs automatically on server start (server.js does not import
// this file), and it NEVER overwrites an account that already exists —
// every account is created only if its mobile number isn't already
// registered. Credentials come entirely from environment variables; if a
// given account's variables are left blank in .env, that account is
// simply skipped rather than created with a made-up password.
//
// This is a development convenience, not a production provisioning tool.
// Passwords are still hashed exactly the same way real registration
// hashes them (bcrypt, 12 rounds) — there is no "seed-only" shortcut that
// weakens how these accounts are stored.

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User, Shop, Barber } from '../models/index.js';
import { validateMobileNumber, normalizeMobileNumber, validateEmail, normalizeEmail } from '../validation/authValidation.js';

const SALT_ROUNDS = 12;

// Seeded accounts intentionally do NOT pre-fill termsAccepted/
// privacyAccepted — they default to false on the User model, exactly
// like any account that never went through the registration consent
// screen. Logging into a seeded account for the first time correctly
// routes through /consent before reaching any protected page. This is
// the same gate a real Shop-Admin-created Barber account hits — not a
// special case for seeded data.

async function upsertUserIfAbsent({ label, name, lastName, email, mobileNumber, password, role, shopId = null }) {
  if (!name || !mobileNumber || !password) {
    console.log(`[seed] Skipping ${label}: name/mobile/password not fully set in .env.`);
    return null;
  }

  if (role === 'customer' && (!lastName || !email || validateEmail(email))) {
    console.log(`[seed] Skipping ${label}: customer last name and Gmail are required in .env.`);
    return null;
  }

  const mobileErr = validateMobileNumber(mobileNumber);
  if (mobileErr) {
    console.warn(`[seed] Skipping ${label}: ${mobileErr}`);
    return null;
  }

  const normalizedMobile = normalizeMobileNumber(mobileNumber);
  const existing = await User.findOne({ mobileNumber: normalizedMobile });
  if (existing) {
    if (email && (!existing.email || existing.email !== normalizeEmail(email))) {
      existing.email = normalizeEmail(email);
      existing.emailVerified = true;
      await existing.save({ validateBeforeSave: false });
      console.log(`[seed] Updated ${label} with verified Gmail login.`);
    }
    console.log(`[seed] ${label} already exists (${normalizedMobile}) — not modified.`);
    return existing;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({
    name,
    lastName: role === 'customer' ? lastName : undefined,
    mobileNumber: normalizedMobile,
    email: email ? normalizeEmail(email) : undefined,
    emailVerified: Boolean(email),
    passwordHash,
    role,
    shopId,
    mobileVerified: false,
  });
  console.log(`[seed] Created ${label}: ${normalizedMobile} (role: ${role})`);
  return user;
}

async function run() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log(`[seed] Connected to MongoDB (${mongoose.connection.name})`);

  // 1. Super Admin — a controlled, one-time setup step (Section 20 of
  // Phase 3), not something the public API can ever create.
  await upsertUserIfAbsent({
    label: 'Super Admin',
    name: process.env.SUPER_ADMIN_NAME,
    email: process.env.SUPER_ADMIN_EMAIL,
    mobileNumber: process.env.SUPER_ADMIN_MOBILE,
    password: process.env.SUPER_ADMIN_PASSWORD,
    role: 'super_admin',
  });

  // 2. Test Customer — an ordinary account, just pre-created for
  // convenience so a tester doesn't have to register one by hand.
  await upsertUserIfAbsent({
    label: 'Test Customer',
    name: process.env.TEST_CUSTOMER_NAME,
    lastName: process.env.TEST_CUSTOMER_LAST_NAME,
    email: process.env.TEST_CUSTOMER_EMAIL,
    mobileNumber: process.env.TEST_CUSTOMER_MOBILE,
    password: process.env.TEST_CUSTOMER_PASSWORD,
    role: 'customer',
  });

  // 3. Test Shop + its Shop Admin. Created as an already-APPROVED shop
  // directly (skipping the public application/approval flow) — this is
  // a seed script, not a stand-in for that flow, which is still fully
  // testable separately via the real /api/shops (apply) and
  // /api/admin/shops/:id/approve (approve) endpoints.
  const shopName = process.env.TEST_SHOP_NAME;
  const shopAdminName = process.env.TEST_SHOP_ADMIN_NAME;
  const shopAdminEmail = process.env.TEST_SHOP_ADMIN_EMAIL;
  const shopAdminMobile = process.env.TEST_SHOP_ADMIN_MOBILE;
  const shopAdminPassword = process.env.TEST_SHOP_ADMIN_PASSWORD;

  let shop = null;
  if (shopName && shopAdminName && shopAdminMobile && shopAdminPassword) {
    const normalizedMobile = normalizeMobileNumber(shopAdminMobile);
    let shopAdminUser = await User.findOne({ mobileNumber: normalizedMobile });

    shop = await Shop.findOne({ name: shopName });
    if (shop) {
      console.log(`[seed] Test Shop "${shopName}" already exists — not modified.`);
    }

    if (!shopAdminUser) {
      // Create the shop first (temporarily self-owned is not possible —
      // ownerId is required — so create the Shop Admin user first with
      // shopId null, then the shop, then link them together).
      shopAdminUser = await upsertUserIfAbsent({
        label: 'Test Shop Admin',
        name: shopAdminName,
        email: shopAdminEmail,
        mobileNumber: shopAdminMobile,
        password: shopAdminPassword,
        role: 'shop_admin',
      });

      if (shopAdminUser && !shop) {
        shop = await Shop.create({
          name: shopName,
          address: '123 Sample Street, Quezon City',
          contact: { phone: '09171234567' },
          operatingHours: { openingTime: '09:00', closingTime: '19:00' },
          status: 'APPROVED',
          ownerId: shopAdminUser._id,
        });
        shopAdminUser.shopId = shop._id;
        await shopAdminUser.save();
        console.log(`[seed] Created Test Shop "${shopName}" (APPROVED) and linked it to the Shop Admin.`);
      }
    } else {
      console.log(`[seed] Test Shop Admin already exists (${normalizedMobile}) — not modified.`);
      shop = shop || (shopAdminUser.shopId ? await Shop.findById(shopAdminUser.shopId) : null);
    }
  } else {
    console.log('[seed] Skipping Test Shop/Shop Admin: TEST_SHOP_* env vars not fully set.');
  }

  // 4. Test Barber — needs the test shop to exist first.
  if (shop) {
    const barberUser = await upsertUserIfAbsent({
      label: 'Test Barber',
      name: process.env.TEST_BARBER_NAME,
      email: process.env.TEST_BARBER_EMAIL,
      mobileNumber: process.env.TEST_BARBER_MOBILE,
      password: process.env.TEST_BARBER_PASSWORD,
      role: 'barber',
      shopId: shop._id,
    });

    if (barberUser) {
      const existingProfile = await Barber.findOne({ userId: barberUser._id });
      if (!existingProfile) {
        await Barber.create({
          shopId: shop._id,
          userId: barberUser._id,
          name: barberUser.name,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
        });
        console.log('[seed] Created Barber operational profile for Test Barber.');
      } else {
        console.log('[seed] Barber operational profile already exists — not modified.');
      }
    }
  } else if (process.env.TEST_BARBER_MOBILE) {
    console.log('[seed] Skipping Test Barber: no test shop available to assign them to.');
  }

  console.log('[seed] Done. No plaintext passwords are stored or logged — use the values from your own .env to log in.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});

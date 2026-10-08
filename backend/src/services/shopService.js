import { randomBytes } from 'node:crypto';
import { Shop, User, AuditLog, Barber, Service } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { toPublicShop } from '../utils/publicSerializers.js';
import { computeLiveWaitEstimate } from '../utils/waitEstimate.js';
import {
  validateShopName,
  validateAddress,
  validateContactPhone,
  validateOperatingHours,
} from '../validation/shopValidation.js';

function validateShopFields({ name, address, contactPhone, openingTime, closingTime }) {
  const errors = {};
  const nameErr = validateShopName(name);
  if (nameErr) errors.name = nameErr;
  const addressErr = validateAddress(address);
  if (addressErr) errors.address = addressErr;
  const contactErr = validateContactPhone(contactPhone);
  if (contactErr) errors.contactPhone = contactErr;
  const hoursErr = validateOperatingHours(openingTime, closingTime);
  if (hoursErr) errors.operatingHours = hoursErr;
  return errors;
}

/**
 * Section 25: the applicant must already be an authenticated user
 * (ownerId comes from req.user.id in the controller, never the body).
 * A single account may not have more than one PENDING/APPROVED shop —
 * prevents someone silently accumulating multiple shops through repeated
 * applications while a decision is still pending.
 */
export async function submitShopApplication(ownerId, fields) {
  const errors = validateShopFields(fields);
  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'Please fix the highlighted fields.', errors);
  }

  const existing = await Shop.findOne({
  ownerId,
  status: { $in: ['PENDING', 'APPROVED', 'SUSPENDED'] },
});

if (existing) {
  throw new AppError(
    409,
    'You already have a pending or active shop application.'
  );
}

  const shop = await Shop.create({
    name: fields.name.trim(),
    address: fields.address.trim(),
    contact: { phone: fields.contactPhone.trim() },
    operatingHours: { openingTime: fields.openingTime, closingTime: fields.closingTime },
    status: 'PENDING', // always — never accepted from the client
    ownerId, // always from the authenticated session — never accepted from the client
  });

  return shop;
}

export async function getPublicShops() {
  const shops = await Shop.find({ status: 'APPROVED' }).sort({ name: 1 });
  const withEstimates = await Promise.all(
    shops.map(async (shop) => {
      const [wait, activeBarbers] = await Promise.all([
        computeLiveWaitEstimate(shop._id),
        Barber.countDocuments({ shopId: shop._id, status: 'ACTIVE', availability: { $in: ['AVAILABLE', 'BUSY'] } }),
      ]);
      return { ...toPublicShop(shop), waitMin: wait.min, waitMax: wait.max, waiting: wait.waitingCount, activeBarbers };
    })
  );
  return withEstimates;
}

/**
 * Only APPROVED shops are publicly visible — a PENDING or REJECTED shop
 * returns null (surfaced as 404 by the controller) rather than exposing
 * that a shop application with that id even exists.
 */
export async function getPublicShopById(shopId) {
  const shop = await Shop.findOne({ _id: shopId, status: 'APPROVED' });
  if (!shop) return null;
  const [wait, activeBarbers] = await Promise.all([
    computeLiveWaitEstimate(shop._id),
    Barber.countDocuments({ shopId: shop._id, status: 'ACTIVE', availability: { $in: ['AVAILABLE', 'BUSY'] } }),
  ]);
  return { ...toPublicShop(shop), waitMin: wait.min, waitMax: wait.max, waiting: wait.waitingCount, activeBarbers };
}

export async function getMyFavoriteShops(userId) {
  const user = await User.findById(userId).select('favoriteShopIds');
  if (!user) throw new AppError(404, 'Account not found.');
  const favoriteIds = user.favoriteShopIds || [];
  if (favoriteIds.length === 0) return [];

  const shops = await Shop.find({ _id: { $in: favoriteIds }, status: 'APPROVED' });
  const shopIds = shops.map((shop) => shop._id);
  const [services, barbers] = await Promise.all([
    Service.find({ shopId: { $in: shopIds }, status: 'ACTIVE' }).sort({ name: 1 }).select('shopId name'),
    Barber.find({ shopId: { $in: shopIds }, status: 'ACTIVE', availability: { $in: ['AVAILABLE', 'BUSY'] } }).select('shopId'),
  ]);
  const serviceByShop = new Map();
  for (const service of services) {
    const key = String(service.shopId);
    if (!serviceByShop.has(key)) serviceByShop.set(key, service.name);
  }
  const barberCounts = new Map();
  for (const barber of barbers) {
    const key = String(barber.shopId);
    barberCounts.set(key, (barberCounts.get(key) || 0) + 1);
  }
  const shopsById = new Map(shops.map((shop) => [String(shop._id), shop]));

  const favorites = await Promise.all(favoriteIds.map(async (favoriteId) => {
    const shop = shopsById.get(String(favoriteId));
    if (!shop) return null;
    const wait = await computeLiveWaitEstimate(shop._id);
    return {
      ...toPublicShop(shop),
      serviceName: serviceByShop.get(String(shop._id)) || null,
      waitMinutes: wait.waitingCount === 0 ? 0 : wait.min,
      waitingCount: wait.waitingCount,
      activeBarbers: barberCounts.get(String(shop._id)) || 0,
      rating: null,
      distanceMiles: null,
    };
  }));
  return favorites.filter(Boolean);
}

export async function addFavoriteShop(userId, shopId) {
  const shop = await Shop.findOne({ _id: shopId, status: 'APPROVED' }).select('_id');
  if (!shop) throw new AppError(404, 'Shop not found.');
  const user = await User.findByIdAndUpdate(userId, { $addToSet: { favoriteShopIds: shop._id } }, { new: true }).select('_id');
  if (!user) throw new AppError(404, 'Account not found.');
}

export async function removeFavoriteShop(userId, shopId) {
  const user = await User.findByIdAndUpdate(userId, { $pull: { favoriteShopIds: shopId } }, { new: true }).select('_id');
  if (!user) throw new AppError(404, 'Account not found.');
}

/**
 * The authenticated Shop Admin's own shop — shopId comes from
 * req.user.shopId (see controller), never a client-supplied id.
 */
export async function getOwnShop(shopId) {
  const shop = await Shop.findById(shopId);
  if (!shop) throw new AppError(404, 'Shop not found.');
  return shop;
}

export async function updateOwnShop(shopId, fields) {
  const update = {};
  const errors = {};

  if (fields.name !== undefined) {
    const err = validateShopName(fields.name);
    if (err) errors.name = err;
    else update.name = fields.name.trim();
  }
  if (fields.address !== undefined) {
    const err = validateAddress(fields.address);
    if (err) errors.address = err;
    else update.address = fields.address.trim();
  }
  if (fields.contactPhone !== undefined) {
    const err = validateContactPhone(fields.contactPhone);
    if (err) errors.contactPhone = err;
    else update['contact.phone'] = fields.contactPhone.trim();
  }
  if (fields.openingTime !== undefined || fields.closingTime !== undefined) {
    const shop = await Shop.findById(shopId);
    if (!shop) throw new AppError(404, 'Shop not found.');
    const opening = fields.openingTime ?? shop.operatingHours.openingTime;
    const closing = fields.closingTime ?? shop.operatingHours.closingTime;
    const err = validateOperatingHours(opening, closing);
    if (err) errors.operatingHours = err;
    else {
      update['operatingHours.openingTime'] = opening;
      update['operatingHours.closingTime'] = closing;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'Please fix the highlighted fields.', errors);
  }
  if (Object.keys(update).length === 0) {
    throw new AppError(400, 'Nothing to update.');
  }

  const shop = await Shop.findByIdAndUpdate(shopId, { $set: update }, { new: true, runValidators: true });
  if (!shop) throw new AppError(404, 'Shop not found.');
  return shop;
}

// ---- Super Admin ----

export async function getAllShopsForAdmin() {
  return Shop.find().sort({ createdAt: -1 });
}

export async function getShopForAdmin(shopId) {
  const shop = await Shop.findById(shopId);
  if (!shop) throw new AppError(404, 'Shop not found.');
  return shop;
}

function createQueueQrToken() {
  return `fq_${randomBytes(24).toString('base64url')}`;
}

function createQueueQrId() {
  return `FC-QR-${randomBytes(3).toString('hex').toUpperCase()}`;
}

async function requireApprovedShopForQr(shopId) {
  const shop = await Shop.findById(shopId);
  if (!shop) throw new AppError(404, 'Shop not found.');
  if (shop.status !== 'APPROVED') throw new AppError(409, 'Queue QR codes are available only for approved shops.');
  return shop;
}

export async function generateQueueQr(shopId, assignedBy) {
  const shop = await requireApprovedShopForQr(shopId);
  if (shop.queueQr?.token) throw new AppError(409, 'This shop already has a queue QR code.');
  shop.queueQr = { token: createQueueQrToken(), codeId: createQueueQrId(), status: 'active', assignedBy, createdAt: new Date() };
  await shop.save();
  return shop;
}

export async function regenerateQueueQr(shopId, assignedBy) {
  const shop = await requireApprovedShopForQr(shopId);
  shop.queueQr = { token: createQueueQrToken(), codeId: createQueueQrId(), status: 'active', assignedBy, createdAt: new Date() };
  await shop.save();
  return shop;
}

export async function setQueueQrStatus(shopId, status) {
  const shop = await requireApprovedShopForQr(shopId);
  if (!shop.queueQr?.token) throw new AppError(404, 'Generate a queue QR code before changing its status.');
  if (!['active', 'disabled'].includes(status)) throw new AppError(400, 'QR status must be active or disabled.');
  shop.queueQr.status = status;
  await shop.save();
  return shop;
}

export async function getShopByActiveQueueQr(token) {
  if (typeof token !== 'string' || !/^fq_[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const shop = await Shop.findOne({
    status: 'APPROVED',
    'queueQr.token': token,
    'queueQr.status': 'active',
  }).select('_id name address status');
  if (!shop) return null;
  return { id: shop._id.toString(), name: shop.name, address: shop.address };
}

export async function getOwnShopQueueQr(shopId) {
  const shop = await Shop.findById(shopId).populate('queueQr.assignedBy', 'name');
  if (!shop) throw new AppError(404, 'Shop not found.');

  const qr = shop.queueQr?.token
    ? {
        id: shop.queueQr.codeId || `FC-QR-${shop.queueQr.token.slice(-6).toUpperCase()}`,
        payload: `/join-queue?shop=${encodeURIComponent(shop.queueQr.token)}`,
        status: shop.queueQr.status,
        assignedBy: shop.queueQr.assignedBy?.name || 'Super Admin',
        assignedAt: shop.queueQr.createdAt,
      }
    : null;

  return {
    shop: { id: shop._id.toString(), name: shop.name, address: shop.address },
    qr,
  };
}

/**
 * Approving a shop does three things atomically-in-spirit (best effort —
 * see README limitation on the lack of a MongoDB transaction here):
 * marks the shop APPROVED, promotes the owner's account to shop_admin
 * and links their shopId, and writes an AuditLog entry. A Super Admin can
 * never approve a shop they themselves own (Section 25).
 */
export async function approveShop(shopId, approverId) {
  const shop = await Shop.findById(shopId);
  if (!shop) throw new AppError(404, 'Shop not found.');
  if (shop.status !== 'PENDING') {
    throw new AppError(409, `This shop is already ${shop.status}.`);
  }
  if (String(shop.ownerId) === String(approverId)) {
    // Defense in depth: role checks already prevent a non-super_admin
    // from reaching this function, but a Super Admin applying for their
    // own shop and approving it themselves is still a conflict of
    // interest worth blocking outright.
    throw new AppError(403, 'You cannot approve your own shop application.');
  }

  shop.status = 'APPROVED';
  await shop.save();

  await User.findByIdAndUpdate(shop.ownerId, { $set: { role: 'shop_admin', shopId: shop._id } });

  await AuditLog.create({
    userId: approverId,
    shopId: shop._id,
    action: 'SHOP_APPROVED',
    targetType: 'Shop',
    targetId: shop._id,
    metadata: { previousStatus: 'PENDING' },
  });

  return shop;
}

export async function rejectShop(shopId, approverId, reason) {
  const shop = await Shop.findById(shopId);
  if (!shop) throw new AppError(404, 'Shop not found.');
  if (shop.status !== 'PENDING') {
    throw new AppError(409, `This shop is already ${shop.status}.`);
  }

  shop.status = 'REJECTED';
  await shop.save();

  await AuditLog.create({
    userId: approverId,
    shopId: shop._id,
    action: 'SHOP_REJECTED',
    targetType: 'Shop',
    targetId: shop._id,
    metadata: { previousStatus: 'PENDING', reason: reason || null },
  });

  return shop;
}
export async function getMyShopApplication(ownerId) {
  const shop = await Shop.findOne({ ownerId }).sort({ createdAt: -1 });

  if (!shop) return null;

  return {
    id: shop._id.toString(),
    name: shop.name,
    status: shop.status,
  };
}

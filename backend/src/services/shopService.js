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
  validateShopRegistration,
} from '../validation/shopValidation.js';
import {
  deleteShopDocument,
  findShopDocument,
  openShopDocumentDownload,
  storeShopDocument,
} from './shopDocumentStorage.js';

const REGISTRATION_DOCUMENT_NAMES = {
  mayor: "Business / Mayor's Permit",
  brgy: 'Barangay Business Clearance',
  dti: 'DTI Certificate of Business Name Registration',
  sec: 'SEC Certificate of Registration',
  bir: 'BIR Certificate of Registration',
  sanitary: 'Sanitary Permit',
  fsic: 'Fire Safety Inspection Certificate',
};

const DOCUMENT_MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function sanitizeDocumentFilename(filename) {
  const source = typeof filename === 'string' ? filename : 'document';
  const safe = Array.from(source, (character) => {
    const code = character.charCodeAt(0);
    return character === '/' || character === '\\' || code < 32 || code === 127 ? '_' : character;
  }).join('').trim().slice(0, 255);
  return safe || 'document';
}

function applicationDocumentKeys(shop) {
  return (shop.registrationDocuments || []).filter((document) => document.fileId && document.fileName).map((document) => document.key);
}

async function deleteShopDocumentIfUnused(fileId) {
  if (!fileId) return;
  try {
    const references = await Shop.countDocuments({ 'registrationDocuments.fileId': fileId });
    if (references === 0) await deleteShopDocument(fileId);
  } catch {
    // Metadata changes have already committed; leave an inaccessible orphan
    // rather than reporting that a successful owner action failed.
    console.error('Shop registration document cleanup failed.');
  }
}

function serializeShopApplication(shop) {
  if (!shop) return null;
  const fields = {
    owner: shop.ownerName || '',
    shop: shop.name || '',
    phone: shop.contact?.phone || '',
    email: shop.contact?.email || '',
    street: shop.addressDetails?.street || '',
    barangay: shop.addressDetails?.barangay || '',
    city: shop.addressDetails?.city || '',
    province: shop.addressDetails?.province || '',
    lat: shop.location?.latitude == null ? '' : String(shop.location.latitude),
    lng: shop.location?.longitude == null ? '' : String(shop.location.longitude),
    confirmed: shop.location?.confirmed === true,
  };
  const documents = Object.create(null);
  for (const doc of shop.registrationDocuments || []) {
    documents[doc.key] = {
      number: doc.number || '',
      issue: doc.issueDate ? new Date(doc.issueDate).toISOString().slice(0, 10) : '',
      expiry: doc.expiryDate ? new Date(doc.expiryDate).toISOString().slice(0, 10) : '',
      file: doc.fileId && doc.fileName
        ? { name: doc.fileName, size: doc.size || 0, mimeType: doc.mimeType || '', status: 'uploaded' }
        : null,
    };
  }
  return {
    id: shop._id.toString(),
    name: shop.name || '',
    status: shop.status,
    fields,
    businessType: shop.businessType || 'sole',
    documents,
    savedAt: shop.updatedAt,
    submittedAt: shop.status === 'PENDING' ? shop.updatedAt : null,
  };
}

function applyRegistrationFields(shop, fields) {
  shop.applicationVersion = 2;
  shop.contact ||= {};
  for (const [input, target] of [['owner', 'ownerName'], ['shop', 'name']]) {
    if (Object.hasOwn(fields, input)) shop[target] = fields[input].trim();
  }
  if (Object.hasOwn(fields, 'phone')) shop.contact.phone = fields.phone.trim();
  if (Object.hasOwn(fields, 'email')) shop.contact.email = fields.email.trim().toLowerCase();

  const addressFields = ['street', 'barangay', 'city', 'province'];
  if (addressFields.some((key) => Object.hasOwn(fields, key))) {
    shop.addressDetails = Object.fromEntries(addressFields.map((key) => [key, (fields[key] || '').trim()]));
    shop.address = addressFields.map((key) => fields[key]?.trim()).filter(Boolean).join(', ');
  }
  if (Object.hasOwn(fields, 'businessType')) shop.businessType = fields.businessType;
  if (Object.hasOwn(fields, 'lat') || Object.hasOwn(fields, 'lng') || Object.hasOwn(fields, 'confirmed')) {
    const latitude = typeof fields.lat === 'string' ? fields.lat.trim() : '';
    const longitude = typeof fields.lng === 'string' ? fields.lng.trim() : '';
    const hasPin = Boolean(latitude && longitude);
    shop.location = hasPin
      ? { latitude: Number(latitude), longitude: Number(longitude), confirmed: fields.confirmed === true }
      : { confirmed: false };
  }
  if (isPlainRecord(fields.documents)) {
    for (const [key, metadata] of Object.entries(fields.documents)) {
      let doc = shop.registrationDocuments.find((item) => item.key === key);
      if (!doc) {
        doc = { key, name: REGISTRATION_DOCUMENT_NAMES[key] || key };
        shop.registrationDocuments.push(doc);
      }
      if (Object.hasOwn(metadata, 'number')) doc.number = metadata.number.trim();
      if (Object.hasOwn(metadata, 'issue')) doc.issueDate = metadata.issue ? new Date(`${metadata.issue}T00:00:00.000Z`) : null;
      if (Object.hasOwn(metadata, 'expiry')) doc.expiryDate = metadata.expiry ? new Date(`${metadata.expiry}T00:00:00.000Z`) : null;
    }
  }
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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

  const draft = await Shop.findOne({ ownerId, status: 'DRAFT' });
  if (draft) throw new AppError(409, 'Continue and submit your saved shop application from the registration page.');

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

async function getOrCreateShopApplicationDraft(ownerId) {
  const active = await Shop.findOne({ ownerId, status: { $in: ['PENDING', 'APPROVED', 'SUSPENDED'] } });
  if (active) throw new AppError(409, 'You already have a pending or active shop application.');

  let draft = await Shop.findOne({ ownerId, status: 'DRAFT' }).sort({ updatedAt: -1 });
  if (draft) return draft;
  const rejected = await Shop.findOne({ ownerId, status: 'REJECTED', applicationVersion: 2 }).sort({ updatedAt: -1 });
  try {
    return await Shop.create(rejected ? {
      ownerId,
      status: 'DRAFT',
      applicationVersion: 2,
      name: rejected.name,
      address: rejected.address,
      ownerName: rejected.ownerName,
      contact: { phone: rejected.contact?.phone, email: rejected.contact?.email },
      businessType: rejected.businessType,
      addressDetails: rejected.addressDetails?.toObject?.() || rejected.addressDetails,
      location: rejected.location?.toObject?.() || rejected.location,
      registrationDocuments: rejected.registrationDocuments.map((document) => document.toObject?.() || document),
    } : { ownerId, status: 'DRAFT', applicationVersion: 2 });
  } catch (error) {
    if (error.code !== 11000) throw error;
    draft = await Shop.findOne({ ownerId, status: 'DRAFT' });
    if (!draft) throw error;
    return draft;
  }
}

export async function saveShopApplicationDraft(ownerId, fields) {
  const errors = validateShopRegistration(fields, { draft: true });
  if (Object.keys(errors).length) throw new AppError(400, 'Please fix the highlighted fields.', errors);
  const draft = await getOrCreateShopApplicationDraft(ownerId);
  applyRegistrationFields(draft, fields);
  await draft.save();
  return serializeShopApplication(draft);
}

export async function submitShopRegistration(ownerId, fields) {
  const draft = await getOrCreateShopApplicationDraft(ownerId);
  const draftErrors = validateShopRegistration(fields, { draft: true });
  if (Object.keys(draftErrors).length) throw new AppError(400, 'Please fix the highlighted fields.', draftErrors);
  applyRegistrationFields(draft, fields);
  await draft.save();

  const errors = validateShopRegistration(fields, {
    uploadedDocuments: applicationDocumentKeys(draft),
  });
  if (Object.keys(errors).length) throw new AppError(400, 'Please fix the highlighted fields.', errors);

  draft.status = 'PENDING';
  draft.applicationVersion = 2;
  await draft.save();
  return serializeShopApplication(draft);
}

function validateUploadedShopDocument({ key, filename, contentType, buffer }) {
  if (!REGISTRATION_DOCUMENT_NAMES[key]) throw new AppError(400, 'Choose a valid document type.');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new AppError(400, 'This file is empty.');
  if (buffer.length > 5 * 1024 * 1024) throw new AppError(413, 'The file limit is 5 MB.');
  const safeFilename = sanitizeDocumentFilename(filename);
  const extension = safeFilename.split('.').pop().toLowerCase();
  const expectedType = DOCUMENT_MIME_BY_EXTENSION[extension];
  if (!expectedType || expectedType !== contentType) throw new AppError(400, 'Upload a PDF, JPG or PNG with a matching file type.');
  const signature = extension === 'pdf'
    ? buffer.subarray(0, 4).equals(Buffer.from('%PDF'))
    : extension === 'png'
      ? buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (!signature) throw new AppError(400, 'This file does not look like a real PDF, JPG or PNG.');
  return { safeFilename };
}

export async function uploadShopApplicationDocument(ownerId, key, { filename, contentType, buffer }) {
  const { safeFilename } = validateUploadedShopDocument({ key, filename, contentType, buffer });
  const draft = await getOrCreateShopApplicationDraft(ownerId);
  const fileId = await storeShopDocument(buffer, safeFilename, contentType, {
    ownerId: String(ownerId),
    shopId: String(draft._id),
    documentKey: key,
  });
  const previous = draft.registrationDocuments.find((document) => document.key === key);
  const previousFileId = previous?.fileId;
  if (previous) {
    previous.fileId = fileId;
    previous.fileName = safeFilename;
    previous.mimeType = contentType;
    previous.size = buffer.length;
    previous.name = REGISTRATION_DOCUMENT_NAMES[key];
  } else {
    draft.registrationDocuments.push({
      key,
      name: REGISTRATION_DOCUMENT_NAMES[key],
      fileId,
      fileName: safeFilename,
      mimeType: contentType,
      size: buffer.length,
    });
  }
  try {
    await draft.save();
  } catch (error) {
    await deleteShopDocument(fileId).catch(() => {});
    throw error;
  }
  if (previousFileId) await deleteShopDocumentIfUnused(previousFileId);
  return { key, name: REGISTRATION_DOCUMENT_NAMES[key], fileName: safeFilename, mimeType: contentType, size: buffer.length, status: 'uploaded' };
}

export async function removeShopApplicationDocument(ownerId, key) {
  const draft = await Shop.findOne({ ownerId, status: 'DRAFT' });
  if (!draft) throw new AppError(404, 'Draft application not found.');
  const index = draft.registrationDocuments.findIndex((document) => document.key === key);
  if (index < 0) return { removed: true };
  const [document] = draft.registrationDocuments.splice(index, 1);
  await draft.save();
  if (document.fileId) await deleteShopDocumentIfUnused(document.fileId);
  return { removed: true };
}

async function findAuthorizedShopDocument(shop, key) {
  const document = shop?.registrationDocuments?.find((item) => item.key === key && item.fileId);
  if (!document) throw new AppError(404, 'Document not found.');
  const file = await findShopDocument(document.fileId);
  if (!file || String(file.metadata?.ownerId) !== String(shop.ownerId) || file.metadata?.documentKey !== key) {
    throw new AppError(404, 'Document not found.');
  }
  return { document, file, stream: openShopDocumentDownload(document.fileId) };
}

export async function getMyShopApplicationDocument(ownerId, key) {
  const shop = await Shop.findOne({ ownerId, status: { $in: ['DRAFT', 'PENDING', 'REJECTED', 'APPROVED', 'SUSPENDED'] } }).sort({ updatedAt: -1 });
  if (!shop) throw new AppError(404, 'Document not found.');
  return findAuthorizedShopDocument(shop, key);
}

export async function getAdminShopApplicationDocument(shopId, key) {
  const shop = await Shop.findOne({ _id: shopId, status: { $ne: 'DRAFT' } });
  if (!shop) throw new AppError(404, 'Document not found.');
  return findAuthorizedShopDocument(shop, key);
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
  return Shop.find({ status: { $ne: 'DRAFT' } }).sort({ createdAt: -1 });
}

export async function getShopForAdmin(shopId) {
  const shop = await Shop.findOne({ _id: shopId, status: { $ne: 'DRAFT' } });
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
  const shop = await Shop.findOne({ ownerId, status: 'DRAFT' }).sort({ updatedAt: -1 })
    || await Shop.findOne({ ownerId }).sort({ updatedAt: -1 });
  return serializeShopApplication(shop);
}

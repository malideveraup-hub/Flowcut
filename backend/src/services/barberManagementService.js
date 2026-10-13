import bcrypt from 'bcryptjs';
import { User, Barber, QueueEntry } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  validateName,
  validateMobileNumber,
  normalizeMobileNumber,
  validatePassword,
} from '../validation/authValidation.js';
import { validateRequestId } from '../validation/queueValidation.js';

const SALT_ROUNDS = 12;
const BARBER_STATUSES = ['ACTIVE', 'INACTIVE'];
const BARBER_AVAILABILITY = ['AVAILABLE', 'BUSY', 'ON_BREAK', 'OFFLINE'];

export async function getShopBarbers(shopId) {
  return Barber.find({ shopId }).sort({ name: 1 });
}

/**
 * There is no self-service "become a barber" registration (Phase 3,
 * Section 17 of this phase) — a Shop Admin creates the account AND the
 * operational profile together in one step. Both writes happen here;
 * if the Barber profile creation fails after the User was already
 * created, the User is rolled back manually (best effort — see the
 * README note on the lack of a real multi-document transaction).
 */
export async function createBarber(shopId, { name, mobileNumber, password }) {
  const errors = {};
  const nameErr = validateName(name);
  if (nameErr) errors.name = nameErr;
  const mobileErr = validateMobileNumber(mobileNumber);
  if (mobileErr) errors.mobileNumber = mobileErr;
  const passwordErr = validatePassword(password);
  if (passwordErr) errors.password = passwordErr;

  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'Please fix the highlighted fields.', errors);
  }

  const normalizedMobile = normalizeMobileNumber(mobileNumber);
  const existing = await User.findOne({ mobileNumber: normalizedMobile });
  if (existing) {
    throw new AppError(409, 'This mobile number is already registered.', { mobileNumber: 'Already registered.' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let user;
  try {
    user = await User.create({
      name: name.trim(),
      mobileNumber: normalizedMobile,
      passwordHash,
      role: 'barber', // set here, server-side, by an already-authorized Shop Admin — never client input
      shopId, // the Shop Admin's own shop, from their session — never client input
      mobileVerified: false,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError(409, 'This mobile number is already registered.');
    }
    throw err;
  }

  try {
    const barber = await Barber.create({
      shopId,
      userId: user._id,
      name: name.trim(),
      status: 'ACTIVE',
      availability: 'OFFLINE',
    });
    return barber;
  } catch (err) {
    // Roll back the User we just created so a failed Barber profile
    // doesn't leave an orphaned account with no operational profile.
    await User.findByIdAndDelete(user._id);
    throw err;
  }
}

async function requireOwnBarber(shopId, barberId) {
  const barber = await Barber.findOne({ _id: barberId, shopId });
  if (!barber) throw new AppError(404, 'Barber not found.');
  return barber;
}

export async function updateBarberStatus(shopId, barberId, { status, availability }) {
  await requireOwnBarber(shopId, barberId);

  const update = {};
  if (status !== undefined) {
    if (!BARBER_STATUSES.includes(status)) throw new AppError(400, 'Invalid barber status.');
    update.status = status;
  }
  if (availability !== undefined) {
    if (!BARBER_AVAILABILITY.includes(availability)) throw new AppError(400, 'Invalid availability value.');
    update.availability = availability;
  }
  if (Object.keys(update).length === 0) {
    throw new AppError(400, 'Nothing to update.');
  }

  return Barber.findOneAndUpdate({ _id: barberId, shopId }, { $set: update }, { new: true });
}

/**
 * A barber updating THEIR OWN availability (e.g. "take a break" from
 * their own dashboard) — resolved from the authenticated session
 * (userId + shopId), never a barberId the client picks.
 */
export async function getOwnBarberProfile(userId, shopId) {
  const barber = await Barber.findOne({ userId, shopId });
  if (!barber) throw new AppError(404, 'Barber profile not found for this account.');
  return barber;
}

export async function setOwnAvailability(userId, shopId, availability, requestId) {
  if (!['AVAILABLE', 'ON_BREAK'].includes(availability)) throw new AppError(400, 'Availability can only be set to available or on break.');
  const requestIdError = validateRequestId(requestId);
  if (requestIdError) throw new AppError(400, requestIdError);
  const barber = await getOwnBarberProfile(userId, shopId);
  const priorReceipt = barber.actionReceipts?.find((item) => item.requestId === requestId);
  if (priorReceipt) {
    if (priorReceipt.action !== 'availability' || priorReceipt.availability !== availability) {
      throw new AppError(409, 'This request ID was already used for a different action.');
    }
    return barber;
  }

  const update = {
    $set: { availability },
    $push: {
      actionReceipts: {
        $each: [{ requestId, action: 'availability', availability, createdAt: new Date() }],
        $slice: -50,
      },
    },
  };

  if (availability === 'ON_BREAK') {
    const activeService = await QueueEntry.exists({
      shopId,
      barberId: barber._id,
      status: { $in: ['IN_SERVICE', 'DELAYED', 'PAUSED'] },
    });
    if (activeService || barber.availability === 'BUSY') {
      throw new AppError(409, 'Finish your current service before taking a break.');
    }
    const updated = await Barber.findOneAndUpdate(
      {
        _id: barber._id,
        shopId,
        availability: { $in: ['AVAILABLE', 'OFFLINE', 'ON_BREAK'] },
        'actionReceipts.requestId': { $ne: requestId },
      },
      update,
      { new: true }
    );
    if (updated) return updated;
    const latest = await Barber.findOne({ _id: barber._id, shopId });
    const receipt = latest?.actionReceipts?.find((item) => item.requestId === requestId);
    if (receipt?.action === 'availability' && receipt.availability === availability) return latest;
    throw new AppError(409, 'Your availability changed. Refresh the workspace and try again.');
  }

  const activeService = await QueueEntry.exists({
    shopId,
    barberId: barber._id,
    status: { $in: ['IN_SERVICE', 'DELAYED', 'PAUSED'] },
  });
  if (activeService || barber.availability === 'BUSY') {
    throw new AppError(409, 'Finish your current service before changing availability.');
  }

  const updated = await Barber.findOneAndUpdate(
    {
      _id: barber._id,
      shopId,
      availability: barber.availability,
      'actionReceipts.requestId': { $ne: requestId },
    },
    update,
    { new: true }
  );
  if (updated) return updated;
  const latest = await Barber.findOne({ _id: barber._id, shopId });
  const receipt = latest?.actionReceipts?.find((item) => item.requestId === requestId);
  if (receipt?.action === 'availability' && receipt.availability === availability) return latest;
  throw new AppError(409, 'Your availability changed. Refresh the workspace and try again.');
}

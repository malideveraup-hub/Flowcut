import bcrypt from 'bcryptjs';
import { User, Barber } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  validateName,
  validateMobileNumber,
  normalizeMobileNumber,
  validatePassword,
} from '../validation/authValidation.js';

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

export async function setOwnAvailability(userId, shopId, availability) {
  if (!BARBER_AVAILABILITY.includes(availability)) throw new AppError(400, 'Invalid availability value.');
  const barber = await getOwnBarberProfile(userId, shopId);
  barber.availability = availability;
  await barber.save();
  return barber;
}

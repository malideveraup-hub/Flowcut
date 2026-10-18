import { Service } from '../models/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { toPublicService } from '../utils/publicSerializers.js';
import {
  validateServiceName,
  validateDescription,
  validateEstimatedDuration,
  validatePrice,
} from '../validation/serviceValidation.js';

function validateServiceFields({ name, description, estimatedDuration, price }, { partial = false } = {}) {
  const errors = {};
  if (!partial || name !== undefined) {
    const err = validateServiceName(name);
    if (err) errors.name = err;
  }
  if (description !== undefined) {
    const err = validateDescription(description);
    if (err) errors.description = err;
  }
  if (!partial || estimatedDuration !== undefined) {
    const err = validateEstimatedDuration(estimatedDuration);
    if (err) errors.estimatedDuration = err;
  }
  if (!partial || price !== undefined) {
    const err = validatePrice(price);
    if (err) errors.price = err;
  }
  return errors;
}

export async function getPublicServices(shopId) {
  const services = await Service.find({ shopId, status: 'ACTIVE' }).sort({ name: 1 });
  return services.map(toPublicService);
}

// Shop Admin's own view — includes INACTIVE services too, since they
// still need to manage/reactivate them.
export async function getShopServices(shopId) {
  return Service.find({ shopId }).sort({ name: 1 });
}

export async function createService(shopId, fields) {
  const errors = validateServiceFields(fields);
  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'Please fix the highlighted fields.', errors);
  }

  try {
    return await Service.create({
      shopId, // always from the authenticated Shop Admin's session — never the request body
      name: fields.name.trim(),
      description: (fields.description || '').trim(),
      estimatedDuration: Number(fields.estimatedDuration),
      price: Number(fields.price),
      status: 'ACTIVE',
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError(409, 'This shop already has a service with that name.');
    }
    throw err;
  }
}

/**
 * Verifies the service belongs to shopId BEFORE returning/modifying it —
 * this is the actual shop-isolation enforcement for services (Section 13).
 * A malformed/missing service also surfaces as 404 either way, so a Shop
 * Admin probing another shop's service ids can't distinguish
 * "doesn't exist" from "exists but isn't yours."
 */
async function requireOwnService(shopId, serviceId) {
  const service = await Service.findOne({ _id: serviceId, shopId });
  if (!service) throw new AppError(404, 'Service not found.');
  return service;
}

export async function updateService(shopId, serviceId, fields) {
  await requireOwnService(shopId, serviceId);

  const errors = validateServiceFields(fields, { partial: true });
  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'Please fix the highlighted fields.', errors);
  }

  const update = {};
  if (fields.name !== undefined) update.name = fields.name.trim();
  if (fields.description !== undefined) update.description = fields.description.trim();
  if (fields.estimatedDuration !== undefined) update.estimatedDuration = Number(fields.estimatedDuration);
  if (fields.price !== undefined) update.price = Number(fields.price);

  if (Object.keys(update).length === 0) {
    throw new AppError(400, 'Nothing to update.');
  }

  try {
    return await Service.findOneAndUpdate({ _id: serviceId, shopId }, { $set: update }, { new: true, runValidators: true });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError(409, 'This shop already has a service with that name.');
    }
    throw err;
  }
}

/**
 * Deactivate rather than delete — queue history (past QueueEntry/
 * ServiceLog rows) can still reference this service by id afterwards.
 */
export async function setServiceStatus(shopId, serviceId, status) {
  if (!['ACTIVE', 'INACTIVE'].includes(status)) {
    throw new AppError(400, 'status must be ACTIVE or INACTIVE.');
  }
  await requireOwnService(shopId, serviceId);
  return Service.findOneAndUpdate({ _id: serviceId, shopId }, { $set: { status } }, { new: true });
}

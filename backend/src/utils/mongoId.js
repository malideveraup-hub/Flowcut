import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';

export function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

/**
 * Express middleware factory: validates that req.params[paramName] looks
 * like a real MongoDB ObjectId BEFORE any controller/service tries to
 * query with it. Without this, a request like GET /api/shops/not-an-id
 * would reach Mongoose and throw a raw CastError, which — if not caught
 * precisely — risks leaking an internal error shape instead of a clean
 * 400 (Section 16/17).
 */
export function validateObjectIdParam(paramName) {
  return function (req, res, next) {
    const value = req.params[paramName];
    if (!isValidObjectId(value)) {
      return next(new AppError(400, `Invalid ${paramName}.`));
    }
    next();
  };
}

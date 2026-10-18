import { AppError } from '../middleware/errorHandler.js';

export function validateShopRating(input) {
  const rating = input?.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AppError(400, 'Choose a whole-star rating from 1 to 5.');
  }
  return rating;
}

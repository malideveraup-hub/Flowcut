import Shop from '../models/Shop.js';
import { AppError } from '../middleware/errorHandler.js';
import { getCustomerShopRating, saveCustomerShopRating } from '../services/shopRatingService.js';
import { validateShopRating } from '../validation/shopRatingValidation.js';

async function requirePublicShop(shopId) {
  const shop = await Shop.findOne({ _id: shopId, status: 'APPROVED' }).select('_id');
  if (!shop) throw new AppError(404, 'Shop not found.');
  return shop._id;
}

export async function getMyShopRating(req, res, next) {
  try {
    const shopId = await requirePublicShop(req.params.shopId);
    const rating = await getCustomerShopRating(shopId, req.user.id);
    res.json({ success: true, data: rating });
  } catch (error) {
    next(error);
  }
}

export async function saveMyShopRating(req, res, next) {
  try {
    const ratingValue = validateShopRating(req.body);
    const shopId = await requirePublicShop(req.params.shopId);
    const rating = await saveCustomerShopRating(shopId, req.user.id, ratingValue);
    res.json({ success: true, data: rating });
  } catch (error) {
    next(error);
  }
}

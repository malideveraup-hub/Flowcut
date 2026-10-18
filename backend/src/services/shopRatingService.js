import mongoose from 'mongoose';
import ShopRating from '../models/ShopRating.js';

function summarize(result) {
  const count = result?.count || 0;
  return {
    rating: count ? Math.round(result.average * 10) / 10 : null,
    ratingCount: count,
  };
}

export async function getShopRatingSummaries(shopIds) {
  if (!shopIds.length) return new Map();
  const summaries = await ShopRating.aggregate([
    { $match: { shopId: { $in: shopIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $group: { _id: '$shopId', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return new Map(summaries.map((result) => [String(result._id), summarize(result)]));
}

export async function getShopRatingSummary(shopId) {
  const [result] = await ShopRating.aggregate([
    { $match: { shopId: new mongoose.Types.ObjectId(shopId) } },
    { $group: { _id: '$shopId', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return summarize(result);
}

export async function getCustomerShopRating(shopId, customerId) {
  const [rating, summary] = await Promise.all([
    ShopRating.findOne({ shopId, customerId }).select('rating').lean(),
    getShopRatingSummary(shopId),
  ]);
  return { myRating: rating?.rating ?? null, ...summary };
}

export async function saveCustomerShopRating(shopId, customerId, rating) {
  try {
    await ShopRating.updateOne(
      { shopId, customerId },
      { $set: { rating } },
      { upsert: true, runValidators: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    await ShopRating.updateOne({ shopId, customerId }, { $set: { rating } }, { runValidators: true });
  }
  return getCustomerShopRating(shopId, customerId);
}

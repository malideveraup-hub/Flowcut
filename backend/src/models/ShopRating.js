import mongoose from 'mongoose';

const shopRatingSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
}, { timestamps: true });

shopRatingSchema.index({ shopId: 1, customerId: 1 }, { unique: true });
shopRatingSchema.index({ shopId: 1 });

export default mongoose.model('ShopRating', shopRatingSchema, 'shop_ratings');

import mongoose from 'mongoose';

export const MAP_IMAGE_STATUSES = ['DRAFT', 'PUBLISHED'];

const mapImageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
  },
  locationName: { type: String, trim: true, maxlength: 500, default: '' },
  // Legacy field retained so existing map image documents remain readable.
  description: { type: String, trim: true, maxlength: 500, default: '' },
  fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  imageUrl: { type: String, trim: true, maxlength: 300, default: null },
  fileName: { type: String, trim: true, maxlength: 255, default: '' },
  mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], default: null },
  size: { type: Number, min: 0, max: 5 * 1024 * 1024, default: 0 },
  uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  status: { type: String, enum: MAP_IMAGE_STATUSES, default: 'DRAFT' },
  publishedAt: { type: Date, default: null },
  uploadedAt: { type: Date, default: null },
  location: {
    x: { type: Number, min: 0, max: 100 },
    y: { type: Number, min: 0, max: 100 },
  },
}, { timestamps: true });

mapImageSchema.index({ status: 1, createdAt: -1 });
mapImageSchema.index({ shopId: 1, status: 1, publishedAt: -1 });

export default mongoose.model('MapImage', mapImageSchema, 'map_images');

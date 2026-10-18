import mongoose from 'mongoose';

const geminiRequestCounterSchema = new mongoose.Schema({
  _id: { type: String },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, timestamps: false, collection: 'gemini_request_counters' });

geminiRequestCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('GeminiRequestCounter', geminiRequestCounterSchema);

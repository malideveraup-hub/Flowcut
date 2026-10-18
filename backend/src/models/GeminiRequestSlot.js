import mongoose from 'mongoose';

const geminiRequestSlotSchema = new mongoose.Schema({
  _id: { type: String },
  owner: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, timestamps: false, collection: 'gemini_request_slots' });

export default mongoose.model('GeminiRequestSlot', geminiRequestSlotSchema);

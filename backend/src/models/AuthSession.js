import mongoose from 'mongoose';

const authSessionSchema = new mongoose.Schema({
  jti: { type: String, required: true, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true },
  lastActivityAt: { type: Date, required: true },
  absoluteExpiresAt: { type: Date, required: true, immutable: true },
  revokedAt: { type: Date, default: null },
}, { versionKey: false });

authSessionSchema.index({ jti: 1 }, { unique: true });
authSessionSchema.index({ userId: 1 });
// This only reclaims old records. Every request independently checks the
// absoluteExpiresAt value, so MongoDB's periodic TTL cleanup is not relied on
// for authorization.
authSessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AuthSession', authSessionSchema, 'auth_sessions');

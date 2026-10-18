import mongoose from 'mongoose';

// Provided as a reference list for later phases to import from (so
// everyone spells "SHOP_APPROVED" the same way), but deliberately NOT
// enforced as a hard schema `enum` — see the design-decision note in the
// Phase 2 report. New audit actions will keep getting added as features
// ship (service management, queue moderation, etc.), and a strict enum
// here would mean editing this model file every time that happens.
export const KNOWN_AUDIT_ACTIONS = [
  'SHOP_APPROVED',
  'SHOP_REJECTED',
  'SHOP_SUSPENDED',
  'USER_ROLE_CHANGED',
  'SERVICE_CREATED',
  'SERVICE_UPDATED',
  'SERVICE_DEACTIVATED',
  'QUEUE_CANCELLED',
];

// Loose format guard (SCREAMING_SNAKE_CASE) so at least garbage strings
// can't slip in, without hard-locking the exact list of allowed actions.
const ACTION_FORMAT = /^[A-Z][A-Z0-9_]*$/;

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      default: null,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [ACTION_FORMAT, 'action must be SCREAMING_SNAKE_CASE, e.g. SHOP_APPROVED'],
    },
    // What kind of thing this action was performed on, e.g. "Shop",
    // "Service", "User" — kept as a plain string rather than a ref
    // because a single AuditLog collection intentionally points at many
    // different target model types.
    targetType: {
      type: String,
      required: true,
      trim: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // Free-form context (e.g. { previousStatus: 'PENDING', newStatus:
    // 'APPROVED' }). Never store passwordHash or other sensitive fields
    // in here even though this is a Mixed type — audit logs are for
    // administrative accountability, not a general-purpose data dump.
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ shopId: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema, 'auditlogs');

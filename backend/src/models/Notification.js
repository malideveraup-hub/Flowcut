import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'QUEUE_JOINED',
  'QUEUE_POSITION_CHANGED',
  'WAIT_ESTIMATE_CHANGED',
  'NEAR_TURN',
  'YOU_ARE_NEXT',
  'SERVICE_STARTED',
  'QUEUE_CANCELLED',
  'SHOP_STATUS_CHANGED',
];

// SMS is modeled now so the shape doesn't need to change when a provider
// (e.g. Twilio) is wired up later — but nothing in this phase sends
// anything through either channel.
export const NOTIFICATION_CHANNELS = ['WEB', 'SMS'];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Nullable: not every notification is shop-specific (unlikely today,
    // but keeps the door open without a schema change later).
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      default: null,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    channel: {
      type: String,
      enum: NOTIFICATION_CHANNELS,
      default: 'WEB',
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Powers the notification bell's unread count / list.
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema, 'notifications');

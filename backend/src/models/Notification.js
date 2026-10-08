import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'QUEUE_JOINED',
  'QUEUE_POSITION_CHANGED',
  'ARRIVE_SOON',
  'WAIT_ESTIMATE_CHANGED',
  'NEAR_TURN',
  'YOU_ARE_NEXT',
  'QUEUE_LEFT',
  'QUEUE_REMOVED',
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
    queueEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QueueEntry',
      default: null,
    },
    eventKey: {
      type: String,
      trim: true,
      default: null,
    },
    previousPosition: {
      type: Number,
      default: null,
    },
    position: {
      type: Number,
      default: null,
    },
    arrivalDeadlineAt: {
      type: Date,
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
notificationSchema.index({ userId: 1, eventKey: 1 }, {
  unique: true,
  partialFilterExpression: { eventKey: { $type: 'string' } },
});

export default mongoose.model('Notification', notificationSchema, 'notifications');

// Convenience re-export so later phases can do:
//   import { User, Shop, QueueEntry } from '../models/index.js';
// instead of one import line per model. Importing this file registers
// every schema with Mongoose but performs no queries and writes no data.

export { default as User, USER_ROLES } from './User.js';
export { default as Shop, SHOP_STATUSES } from './Shop.js';
export { default as Service, SERVICE_STATUSES } from './Service.js';
export { default as Barber, BARBER_STATUSES, BARBER_AVAILABILITY } from './Barber.js';
export { default as QueueEntry, QUEUE_STATUSES } from './QueueEntry.js';
export { default as ServiceLog, ALLOWED_DELAY_MINUTES } from './ServiceLog.js';
export { default as WaitingEstimate } from './WaitingEstimate.js';
export { default as Notification, NOTIFICATION_TYPES, NOTIFICATION_CHANNELS } from './Notification.js';
export { default as AuditLog, KNOWN_AUDIT_ACTIONS } from './AuditLog.js';

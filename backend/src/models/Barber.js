import mongoose from 'mongoose';

export const BARBER_STATUSES = ['ACTIVE', 'INACTIVE'];
export const BARBER_AVAILABILITY = ['AVAILABLE', 'BUSY', 'ON_BREAK', 'OFFLINE'];

const barberSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
    },
    // The User account this barber logs in as. Kept separate from `name`
    // below so the operational profile (status/availability/which shop)
    // can exist independently of account details like mobile number.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    // ACTIVE/INACTIVE = employment status at this shop (set by Shop
    // Admin). Separate from `availability`, which changes many times a
    // day as the barber actually works.
    status: {
      type: String,
      enum: BARBER_STATUSES,
      default: 'ACTIVE',
    },
    availability: {
      type: String,
      enum: BARBER_AVAILABILITY,
      default: 'OFFLINE',
    },
  },
  { timestamps: true }
);

// Powers "list this shop's barbers" and "who is available right now".
barberSchema.index({ shopId: 1 });

// Design decision: one User account maps to exactly one Barber profile.
// If FlowCut ever needs one person to work at multiple shops under a
// single login, this unique constraint would need to be revisited
// (likely a compound { shopId, userId } unique index instead).
barberSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model('Barber', barberSchema, 'barbers');

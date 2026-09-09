import mongoose, { Document, Schema } from 'mongoose';

export interface INotice extends Document {
  title: string;
  filename: string;
  isRecurring: boolean;
  isActive: boolean;
  order: number;
  duration: number; // Duration in seconds
  createdAt: Date;
}

const NoticeSchema: Schema = new Schema({
  title: { type: String, default: '' },
  filename: { type: String, required: true },
  isRecurring: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  duration: { type: Number, default: 10 },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<INotice>('Notice', NoticeSchema);

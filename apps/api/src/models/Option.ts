import mongoose, { Document, Schema } from 'mongoose';

export interface IOption extends Document {
  title: string;
  category: string;
  slidesCount: number;
  filePath: string;
  originalFileName: string;
  images: string[];
  createdAt: Date;
}

const OptionSchema: Schema = new Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  slidesCount: { type: Number, required: true, default: 1 },
  filePath: { type: String, required: true },
  originalFileName: { type: String, required: true },
  images: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IOption>('Option', OptionSchema);

import mongoose, { Document, Schema } from 'mongoose';

export interface ITemplate extends Document {
  position: number;
  imageUrl: string;
}

const TemplateSchema: Schema = new Schema({
  position: { type: Number, required: true, unique: true },
  imageUrl: { type: String, required: true }
});

export default mongoose.model<ITemplate>('Template', TemplateSchema);

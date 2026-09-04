import mongoose, { Document, Schema } from 'mongoose';

export interface ISelection extends Document {
  songs: string[]; // Array de IDs das opções (Option)
  status: 'pending' | 'processed';
  createdAt: Date;
}

const SelectionSchema: Schema = new Schema({
  songs: {
    type: [String],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'processed'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<ISelection>('Selection', SelectionSchema);

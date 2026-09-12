import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  conflictId: { type: String, unique: true, index: true },
  severity: { type: String, enum: ['CRITICAL','HIGH','MEDIUM','LOW'], default: 'MEDIUM' },
  type: { type: String, required: true },
  courseId: String,
  courseName: String,
  facultyIds: [String],
  facultyNames: [String],
  description: String,
  status: { type: String, enum: ['open','resolved'], default: 'open' },
  resolution: String
}, { timestamps: true });

export default mongoose.model('Conflict', schema);

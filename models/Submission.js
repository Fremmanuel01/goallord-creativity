const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  assignment:  { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  batch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  content:     { type: String, default: '' },
  fileUrl:     { type: String, default: '' },
  submittedAt: { type: Date, default: Date.now },
  isLate:      { type: Boolean, default: false },
  score:       { type: Number, default: null },
  feedback:    { type: String, default: '' },
  scoredBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lecturer' },
  scoredAt:    { type: Date }
});

submissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('Submission', submissionSchema);

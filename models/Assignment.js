const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  batch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  lecturer:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lecturer', required: true },
  title:       { type: String, required: true },
  description: { type: String, required: true },
  week:        { type: Number, required: true },
  topic:       { type: String, default: '' },
  deadline:    { type: Date, required: true },
  maxScore:    { type: Number, default: 100 },
  published:   { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('Assignment', assignmentSchema);

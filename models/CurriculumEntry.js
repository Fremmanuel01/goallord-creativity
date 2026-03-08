const mongoose = require('mongoose');

const curriculumEntrySchema = new mongoose.Schema({
  batch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  week:       { type: Number, required: true },
  day:        { type: String, enum: ['Tuesday', 'Wednesday', 'Thursday'], required: true },
  topic:      { type: String, required: true },
  subtopics:  [{ type: String }],
  objectives: { type: String, default: '' },
  resources:  [{ type: String }],
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Lecturer' },
  updatedAt:  { type: Date, default: Date.now }
});

curriculumEntrySchema.index({ batch: 1, week: 1, day: 1 }, { unique: true });

module.exports = mongoose.model('CurriculumEntry', curriculumEntrySchema);

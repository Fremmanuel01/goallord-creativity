const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true }, // e.g. "Batch 100"
  number:    { type: Number, required: true, unique: true }, // 100, 101, etc.
  track:     { type: String, enum: ['Web Design', 'WordPress', 'Digital Marketing', 'Brand Identity', 'Other'] },
  isActive:  { type: Boolean, default: false },
  startDate: { type: Date },
  endDate:   { type: Date },
  totalWeeks:{ type: Number, default: 12 },
  classDays: [{ type: String, enum: ['Tuesday', 'Wednesday', 'Thursday'] }],
  notes:     { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Batch', batchSchema);

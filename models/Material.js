const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  batch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  lecturer:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lecturer', required: true },
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  type:        { type: String, enum: ['pdf', 'image', 'url', 'video'], required: true },
  fileUrl:     { type: String, default: '' },
  linkUrl:     { type: String, default: '' },
  week:        { type: Number, required: true },
  topic:       { type: String, default: '' },
  published:   { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now }
});

materialSchema.index({ batch: 1, week: 1 });

module.exports = mongoose.model('Material', materialSchema);

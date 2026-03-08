const mongoose = require('mongoose');

const flashcardSetSchema = new mongoose.Schema({
  batch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  lecturer:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lecturer', required: true },
  title:       { type: String, required: true },
  topic:       { type: String, default: '' },
  week:        { type: Number, required: true },
  generatedBy: { type: String, enum: ['manual', 'ai'], default: 'manual' },
  published:   { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('FlashcardSet', flashcardSetSchema);

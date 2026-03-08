const mongoose = require('mongoose');

const flashcardResponseSchema = new mongoose.Schema({
  set:         { type: mongoose.Schema.Types.ObjectId, ref: 'FlashcardSet', required: true },
  flashcard:   { type: mongoose.Schema.Types.ObjectId, ref: 'Flashcard', required: true },
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  batch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  answer:      { type: String, required: true },
  isCorrect:   { type: Boolean, required: true },
  attemptedAt: { type: Date, default: Date.now }
});

flashcardResponseSchema.index({ set: 1, student: 1 });

module.exports = mongoose.model('FlashcardResponse', flashcardResponseSchema);

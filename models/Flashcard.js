const mongoose = require('mongoose');

const flashcardSchema = new mongoose.Schema({
  set:           { type: mongoose.Schema.Types.ObjectId, ref: 'FlashcardSet', required: true },
  batch:         { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  question:      { type: String, required: true },
  correctAnswer: { type: String, required: true },
  options:       [{ type: String }],
  explanation:   { type: String, default: '' },
  topic:         { type: String, default: '' },
  week:          { type: Number },
  order:         { type: Number, default: 0 },
  createdAt:     { type: Date, default: Date.now }
});

module.exports = mongoose.model('Flashcard', flashcardSchema);

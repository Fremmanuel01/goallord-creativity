const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  body:      { type: String, required: true },
  sentBy:    { type: String, default: 'Admin' },
  sentAt:    { type: Date, default: Date.now }
});

const contactSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true, maxlength: 100 },
  email:   { type: String, required: true, lowercase: true, trim: true, maxlength: 150, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  service: { type: String, default: '' },
  budget:  { type: String, default: '' },
  message: { type: String, default: '', maxlength: 2000 },
  source:  { type: String, default: 'Contact Form' },
  status:  { type: String, enum: ['New', 'Read', 'Replied'], default: 'New' },
  replies: [replySchema]
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema);

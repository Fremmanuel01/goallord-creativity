const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, lowercase: true },
  phone:     { type: String },
  company:   { type: String },
  service:   { type: String },
  budget:    { type: String },
  timeline:  { type: String },
  message:   { type: String },
  status:    { type: String, enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'], default: 'Pending' },
  notes:     { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Client', clientSchema);

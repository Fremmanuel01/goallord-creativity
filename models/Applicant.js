const mongoose = require('mongoose');

const applicantSchema = new mongoose.Schema({
  fullName:   { type: String, required: true },
  email:      { type: String, required: true, lowercase: true },
  phone:      { type: String },
  location:   { type: String },
  track:      { type: String, enum: ['Web Design', 'WordPress', 'Digital Marketing', 'Brand Identity', 'Other'] },
  experience: { type: String },
  schedule:   { type: String },
  howFound:   { type: String },
  goal:       { type: String },
  why:        { type: String },
  background: { type: String },
  status:     { type: String, enum: ['Pending', 'Reviewed', 'Accepted', 'Rejected'], default: 'Pending' },
  notes:      { type: String, default: '' },
  createdAt:  { type: Date, default: Date.now }
});

module.exports = mongoose.model('Applicant', applicantSchema);

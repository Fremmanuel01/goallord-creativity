const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  fullName:     { type: String, required: true },
  email:        { type: String, required: true, unique: true, lowercase: true },
  password:     { type: String, required: true },
  phone:        { type: String },
  track:        { type: String, enum: ['Web Design', 'WordPress', 'Digital Marketing', 'Brand Identity', 'Other'], required: true },
  cohort:       { type: String, required: true }, // e.g. "March 2026"
  status:       { type: String, enum: ['Active', 'Suspended', 'Graduated'], default: 'Active' },
  applicantRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Applicant' },
  notes:        { type: String, default: '' },
  enrolledAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('Student', studentSchema);

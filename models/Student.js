const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  fullName:           { type: String, required: true },
  email:              { type: String, required: true, unique: true, lowercase: true },
  password:           { type: String, required: true },
  phone:              { type: String },
  track:              { type: String, enum: ['Web Design', 'WordPress', 'Digital Marketing', 'Brand Identity', 'Other'], required: true },
  cohort:             { type: String }, // legacy string field, kept for backwards compat
  batch:              { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  profilePicture:     { type: String, default: '' },
  paymentPlan:        { type: String, enum: ['monthly', 'full_upfront'], default: 'monthly' },
  paymentStatus:      { type: String, enum: ['pending', 'paid', 'partially_paid', 'overdue', 'failed', 'fully_paid'], default: 'pending' },
  applicationFeePaid: { type: Boolean, default: false },
  totalTuitionMonths: { type: Number, default: 3 },
  status:             { type: String, enum: ['Active', 'Suspended', 'Graduated'], default: 'Active' },
  applicantRef:       { type: mongoose.Schema.Types.ObjectId, ref: 'Applicant' },
  notes:              { type: String, default: '' },
  enrolledAt:         { type: Date, default: Date.now }
});

module.exports = mongoose.model('Student', studentSchema);

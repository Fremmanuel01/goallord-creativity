const mongoose = require('mongoose');

const applicantSchema = new mongoose.Schema({
  fullName:   { type: String, required: true, trim: true, maxlength: 100 },
  email:      { type: String, required: true, lowercase: true, unique: true, trim: true, maxlength: 150, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  phone:      { type: String, maxlength: 20 },
  location:   { type: String, maxlength: 200 },
  track:      { type: String, enum: ['Web Design', 'WordPress', 'Digital Marketing', 'Brand Identity', 'Other'] },
  experience: { type: String, maxlength: 1000 },
  schedule:   { type: String, maxlength: 200 },
  howFound:   { type: String, maxlength: 200 },
  goal:       { type: String, maxlength: 1000 },
  why:        { type: String, maxlength: 2000 },
  background: { type: String, maxlength: 1000 },
  status:              { type: String, enum: ['Pending', 'Reviewed', 'Accepted', 'Rejected'], default: 'Pending' },
  notes:               { type: String, default: '' },
  emailVerified:       { type: Boolean, default: false },
  emailVerifyToken:    { type: String },
  emailVerifyExpires:  { type: Date },
  applicationFeePaid:   { type: Boolean, default: false },
  applicationFeeRef:    { type: String, default: '' },
  pendingPaymentPlan:   { type: String, default: '' }, // 'full' | 'monthly'
  profilePhoto:        { type: String, default: '' },
  createdAt:           { type: Date, default: Date.now }
});

module.exports = mongoose.model('Applicant', applicantSchema);

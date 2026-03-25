const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  fullName:           { type: String, required: true, trim: true, maxlength: 200 },
  email:              { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 150 },
  password:           { type: String, required: true },
  phone:              { type: String, maxlength: 30 },
  track:              { type: String, enum: ['Web Design', 'WordPress', 'Digital Marketing', 'Brand Identity', 'Other'], required: true },
  batch:              { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  profilePicture:     { type: String, default: '', maxlength: 500 },
  paymentPlan:        { type: String, enum: ['monthly', 'full_upfront'], default: 'monthly' },
  paymentStatus:      { type: String, enum: ['pending', 'paid', 'partially_paid', 'overdue', 'failed', 'fully_paid'], default: 'pending' },
  applicationFeePaid: { type: Boolean, default: false },
  totalTuitionMonths: { type: Number, default: 3 },
  status:             { type: String, enum: ['Active', 'Suspended', 'Graduated'], default: 'Active' },
  applicantRef:       { type: mongoose.Schema.Types.ObjectId, ref: 'Applicant' },
  notes:              { type: String, default: '', maxlength: 2000 },
  enrolledAt:         { type: Date, default: Date.now },
  resetToken:         { type: String },
  resetExpires:       { type: Date }
});

module.exports = mongoose.model('Student', studentSchema);

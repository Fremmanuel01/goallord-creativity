const mongoose = require('mongoose');

const lecturerSchema = new mongoose.Schema({
  fullName:       { type: String, required: true, trim: true, maxlength: 200 },
  email:          { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 150 },
  password:       { type: String, required: true },
  phone:          { type: String, default: '', maxlength: 30 },
  profilePicture: { type: String, default: '', maxlength: 500 },
  bio:            { type: String, default: '', maxlength: 2000 },
  specialization: { type: String, default: '', maxlength: 200 },
  batches:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],
  status:         { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt:      { type: Date, default: Date.now },
  resetToken:     { type: String },
  resetExpires:   { type: Date }
});

module.exports = mongoose.model('Lecturer', lecturerSchema);

const mongoose = require('mongoose');

const lecturerSchema = new mongoose.Schema({
  fullName:       { type: String, required: true },
  email:          { type: String, required: true, unique: true, lowercase: true },
  password:       { type: String, required: true },
  phone:          { type: String, default: '' },
  profilePicture: { type: String, default: '' },
  bio:            { type: String, default: '' },
  specialization: { type: String, default: '' },
  batches:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],
  status:         { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt:      { type: Date, default: Date.now }
});

module.exports = mongoose.model('Lecturer', lecturerSchema);

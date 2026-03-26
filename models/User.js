const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true },
  role:      { type: String, enum: ['admin', 'staff', 'agent'], default: 'staff' },
  permissions: {
    projects:   { type: Boolean, default: true },
    tasks:      { type: Boolean, default: true },
    checkins:   { type: Boolean, default: true },
    cms:        { type: Boolean, default: false },
    blog:       { type: Boolean, default: false },
    analytics:  { type: Boolean, default: false },
    clients:    { type: Boolean, default: false },
    store:      { type: Boolean, default: false },
    affiliate:  { type: Boolean, default: false },
    settings:   { type: Boolean, default: false },
    applicants: { type: Boolean, default: false },
    academy:    { type: Boolean, default: false }
  },
  avatar:    { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  resetToken:   { type: String },
  resetExpires: { type: Date }
});

module.exports = mongoose.model('User', userSchema);

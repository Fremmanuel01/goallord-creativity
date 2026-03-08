const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient:     { type: mongoose.Schema.Types.ObjectId, required: true }, // Student or Lecturer _id
  recipientType: { type: String, enum: ['Student', 'Lecturer', 'Admin'], required: true },
  type:          { type: String, required: true }, // 'assignment', 'payment_due', 'material', 'attendance', etc.
  title:         { type: String, required: true },
  message:       { type: String, required: true },
  link:          { type: String, default: '' },
  read:          { type: Boolean, default: false },
  createdAt:     { type: Date, default: Date.now }
});

notificationSchema.index({ recipient: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);

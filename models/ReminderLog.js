const mongoose = require('mongoose');

const reminderLogSchema = new mongoose.Schema({
  task:          { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  taskTitle:     { type: String },
  recipient:     { type: String },
  recipientName: { type: String },
  project:       { type: String },
  sentAt:        { type: Date, default: Date.now },
  status:        { type: String, enum: ['sent', 'failed'], default: 'sent' },
  error:         { type: String }
});

reminderLogSchema.index({ sentAt: -1 });

module.exports = mongoose.model('ReminderLog', reminderLogSchema);

const mongoose = require('mongoose');

const reminderSettingsSchema = new mongoose.Schema({
  frequency: { type: Number, default: 2 },
  enabled:   { type: Boolean, default: true },
  sendTime:  { type: String, default: '08:00' }
});

// Single-document pattern
reminderSettingsSchema.statics.get = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('ReminderSettings', reminderSettingsSchema);

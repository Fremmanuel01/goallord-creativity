const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  name:        { type: String, required: true },
  destination: { type: String, required: true },
  category:    { type: String, default: 'General' },
  description: { type: String, default: '' },
  totalClicks: { type: Number, default: 0 },
  active:      { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('AffiliateLink', schema);

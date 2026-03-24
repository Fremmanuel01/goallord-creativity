const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  linkSlug: { type: String, required: true, index: true },
  postSlug: { type: String, default: '' },
  device:   { type: String, default: 'desktop', enum: ['desktop', 'mobile', 'tablet'] },
  country:  { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('AffiliateClick', schema);

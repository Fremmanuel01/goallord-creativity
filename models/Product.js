const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  category:    { type: String, enum: ['Application Fee', 'Template', 'Plugin', 'Web App', 'Course'], required: true },
  price:       { type: Number, required: true },
  currency:    { type: String, enum: ['USD', 'NGN'], default: 'USD' },
  description: { type: String },
  type:        { type: String, default: '' },        // e.g. "HTML/CSS", "WordPress Theme", "React App"
  demoUrl:     { type: String, default: '' },
  features:    [String],
  downloadUrl: { type: String, default: '' },
  stock:       { type: Number, default: -1 },  // -1 = unlimited
  active:      { type: Boolean, default: true },
  image:       { type: String, default: '' },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);

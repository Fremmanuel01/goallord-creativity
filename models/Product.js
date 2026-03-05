const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  category:    { type: String, enum: ['Application Fee', 'Template', 'Course'], required: true },
  price:       { type: Number, required: true },
  currency:    { type: String, enum: ['EUR', 'NGN'], default: 'EUR' },
  description: { type: String },
  stock:       { type: Number, default: -1 },  // -1 = unlimited
  active:      { type: Boolean, default: true },
  image:       { type: String, default: '' },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId:     { type: String, unique: true },
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  buyerName:   { type: String, required: true },
  buyerEmail:  { type: String, required: true, lowercase: true },
  amount:      { type: Number, required: true },
  currency:    { type: String, default: 'EUR' },
  category:    { type: String },
  status:      { type: String, enum: ['Paid', 'Pending', 'Refunded'], default: 'Pending' },
  createdAt:   { type: Date, default: Date.now }
});

orderSchema.pre('save', async function(next) {
  if (!this.orderId) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderId = 'ORD-' + String(count + 1).padStart(4, '0');
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);

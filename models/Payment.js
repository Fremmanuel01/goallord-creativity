const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  month:      { type: String, required: true }, // format: "2026-03"
  amountDue:  { type: Number, default: 100000 },
  amountPaid: { type: Number, default: 0 },
  status:     { type: String, enum: ['Unpaid', 'Partial', 'Paid'], default: 'Unpaid' },
  paidAt:     { type: Date },
  method:     { type: String, default: '' }, // e.g. 'Bank Transfer', 'Cash', 'POS'
  reference:  { type: String, default: '' },
  notes:      { type: String, default: '' },
  recordedBy: { type: String, default: 'Admin' },
  createdAt:  { type: Date, default: Date.now }
});

paymentSchema.index({ student: 1, month: 1 }, { unique: true });

// Auto-compute status before save
paymentSchema.pre('save', function(next) {
  if (this.amountPaid >= this.amountDue) {
    this.status = 'Paid';
    if (!this.paidAt) this.paidAt = new Date();
  } else if (this.amountPaid > 0) {
    this.status = 'Partial';
  } else {
    this.status = 'Unpaid';
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);

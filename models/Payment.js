const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  student:        { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  batch:          { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  category:       {
    type: String,
    enum: ['application_fee', 'tuition_month_1', 'tuition_month_2', 'tuition_month_3', 'full_tuition_payment'],
    required: true
  },
  amountDue:      { type: Number, required: true },
  amountPaid:     { type: Number, default: 0 },
  status:         {
    type: String,
    enum: ['pending', 'paid', 'partially_paid', 'overdue', 'failed', 'fully_paid'],
    default: 'pending'
  },
  dueDate:        { type: Date },
  paidAt:         { type: Date },
  method:         { type: String, default: '' },
  reference:      { type: String, default: '' },
  notes:          { type: String, default: '' },
  recordedBy:     { type: String, default: 'Admin' },
  reminderSentAt: { type: Date },
  createdAt:      { type: Date, default: Date.now }
});

paymentSchema.index({ student: 1, category: 1 }, { unique: true });

paymentSchema.pre('save', function(next) {
  const now = new Date();
  if (this.category === 'full_tuition_payment' && this.amountPaid >= this.amountDue) {
    this.status = 'fully_paid';
    if (!this.paidAt) this.paidAt = now;
  } else if (this.amountPaid >= this.amountDue) {
    this.status = 'paid';
    if (!this.paidAt) this.paidAt = now;
  } else if (this.amountPaid > 0) {
    this.status = 'partially_paid';
  } else if (this.dueDate && this.dueDate < now) {
    this.status = 'overdue';
  }
  next();
});

// Sync student.paymentStatus after payment save
paymentSchema.post('save', async function() {
  try {
    const Student = mongoose.model('Student');
    const payments = await mongoose.model('Payment').find({ student: this.student });
    const allPaid = payments.every(p => p.status === 'paid' || p.status === 'fully_paid');
    const anyOverdue = payments.some(p => p.status === 'overdue');
    const anyPartial = payments.some(p => p.status === 'partially_paid');
    let newStatus = 'pending';
    if (allPaid) newStatus = 'paid';
    else if (anyOverdue) newStatus = 'overdue';
    else if (anyPartial) newStatus = 'partially_paid';
    await Student.findByIdAndUpdate(this.student, { paymentStatus: newStatus });
  } catch (e) {
    console.error('Failed to sync student paymentStatus:', e.message);
  }
});

module.exports = mongoose.model('Payment', paymentSchema);

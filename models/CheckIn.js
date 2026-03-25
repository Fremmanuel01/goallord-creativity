const mongoose = require('mongoose');

const checkInSchema = new mongoose.Schema({
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date:      { type: String, required: true }, // YYYY-MM-DD
    yesterday: { type: String, default: '' },
    today:     { type: String, default: '' },
    blockers:  { type: String, default: '' }
}, { timestamps: true });

// One check-in per user per day
checkInSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('CheckIn', checkInSchema);

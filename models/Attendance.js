const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  batch:           { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  week:            { type: Number, required: true },
  day:             { type: String, enum: ['Tuesday', 'Wednesday', 'Thursday'], required: true },
  classDate:       { type: Date, required: true },
  topic:           { type: String, default: '' },
  sessionOpenedAt: { type: Date },
  sessionClosedAt: { type: Date },
  isOpen:          { type: Boolean, default: false },
  takenBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'Lecturer' },
  presentStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  absentStudents:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  notes:           { type: String, default: '' },
  createdAt:       { type: Date, default: Date.now }
});

attendanceSchema.index({ batch: 1, week: 1, day: 1 }, { unique: true });
attendanceSchema.index({ presentStudents: 1 });
attendanceSchema.index({ absentStudents: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);

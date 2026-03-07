const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  cohort:          { type: String, required: true },
  classDate:       { type: Date, required: true },
  track:           { type: String },
  presentStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  absentStudents:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  takenBy:         { type: String, default: 'Admin' },
  notes:           { type: String, default: '' },
  createdAt:       { type: Date, default: Date.now }
});

attendanceSchema.index({ cohort: 1, classDate: 1 }, { unique: true });
attendanceSchema.index({ presentStudents: 1 });
attendanceSchema.index({ absentStudents: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);

const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    project:     { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    assignee:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status:      { type: String, enum: ['todo','in-progress','review','done'], default: 'todo' },
    priority:    { type: String, enum: ['low','medium','high','urgent'], default: 'medium' },
    dueDate:     { type: Date },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);

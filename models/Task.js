const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    project:     { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    assignee:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status:      { type: String, enum: ['todo','in-progress','review','done'], default: 'todo' },
    priority:    { type: String, enum: ['low','medium','high','urgent'], default: 'medium' },
    dueDate:     { type: Date },
    estimated:   { type: Number, default: 0 },
    spent:       { type: Number, default: 0 },
    comments: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    }],
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

taskSchema.index({ project: 1 });
taskSchema.index({ assignee: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ dueDate: 1 });

module.exports = mongoose.model('Task', taskSchema);

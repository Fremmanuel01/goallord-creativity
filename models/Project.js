const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    name:        { type: String, required: true, trim: true },
    client:      { type: String, default: '' },
    description: { type: String, default: '' },
    status:      { type: String, enum: ['not-started','in-progress','review','completed'], default: 'not-started' },
    priority:    { type: String, enum: ['low','medium','high','urgent'], default: 'medium' },
    deadline:    { type: Date },
    members:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    color:       { type: String, default: '#D66A1F' },
    budget:      { type: Number, default: 0 },
    spent:       { type: Number, default: 0 },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

projectSchema.index({ status: 1 });
projectSchema.index({ createdBy: 1 });
projectSchema.index({ members: 1 });

module.exports = mongoose.model('Project', projectSchema);

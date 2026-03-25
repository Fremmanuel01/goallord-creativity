const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
    name:        { type: String, required: true, trim: true },
    role:        { type: String, required: true, trim: true },
    photo:       { type: String, default: '' },
    photoId:     { type: String, default: '' },
    linkedin:    { type: String, default: '' },
    github:      { type: String, default: '' },
    twitter:     { type: String, default: '' },
    order:       { type: Number, default: 0 },
    visible:     { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('TeamMember', teamMemberSchema);

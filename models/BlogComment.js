const mongoose = require('mongoose');

const blogCommentSchema = new mongoose.Schema({
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogPost', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 150 },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    approved: { type: Boolean, default: true },
    token: { type: String } // simple auth token for the commenter
}, { timestamps: true });

module.exports = mongoose.model('BlogComment', blogCommentSchema);

const mongoose = require('mongoose');

const clientLogoSchema = new mongoose.Schema({
    name:    { type: String, required: true, trim: true },
    image:   { type: String, required: true },
    imageId: { type: String, default: '' },
    order:   { type: Number, default: 0 },
    visible: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('ClientLogo', clientLogoSchema);

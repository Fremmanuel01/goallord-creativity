const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  title:       { type: String, required: true },
  excerpt:     { type: String, default: '' },
  content:     { type: String, default: '' }, // HTML string
  coverImage:  { type: String, default: '' },
  category:    { type: String, default: 'General' },
  tags:        { type: [String], default: [] },
  author:      { type: String, default: 'The Goallord Team' },
  authorAvatar: { type: String, default: '' },
  readTime:    { type: String, default: '5 min read' },
  featured:     { type: Boolean, default: false },
  published:    { type: Boolean, default: true },
  publishedAt:  { type: Date, default: Date.now },
  views:        { type: Number, default: 0 },
  hasAffiliate: { type: Boolean, default: false },
  affiliateCta: {
    text:  { type: String, default: '' },
    url:   { type: String, default: '' },
    label: { type: String, default: '' },
  },
}, { timestamps: true });

module.exports = mongoose.model('BlogPost', blogPostSchema);

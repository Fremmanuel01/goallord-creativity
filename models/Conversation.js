const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant', 'agent'], required: true },
  content:   { type: String, required: true },
  agentName: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const ConversationSchema = new mongoose.Schema({
  sessionId:      { type: String, required: true, unique: true },
  mode:           { type: String, enum: ['ai', 'human'], default: 'ai' },
  status:         { type: String, enum: ['active', 'closed'], default: 'active' },
  messages:       [MessageSchema],
  agentId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agentName:      { type: String },
  unreadByAgent:  { type: Number, default: 0 },
  visitorPage:    { type: String, default: '/' },
  createdAt:      { type: Date, default: Date.now },
  updatedAt:      { type: Date, default: Date.now }
});

ConversationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Conversation', ConversationSchema);

const mongoose = require('mongoose');

const layerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  visible: { type: Boolean, default: true },
  locked: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  elements: [{ type: mongoose.Schema.Types.Mixed }]
}, { timestamps: true });

const memberSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  role: { type: String, enum: ['viewer', 'commenter', 'editor'], default: 'viewer' },
  status: { type: String, enum: ['invited', 'active', 'removed'], default: 'invited' },
  invitedAt: { type: Date },
  joinedAt: { type: Date },
}, { _id: false });

const commentSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, default: '' },
  text: { type: String, required: true },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  resolved: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => Date.now() },
}, { _id: false });

const boardSchema = new mongoose.Schema({
  name: { type: String, required: true, default: 'Untitled Board' },
  ownerId: { type: String, required: true },
  collaborators: [{ type: String }],
  members: [memberSchema],
  comments: [commentSchema],
  layers: [layerSchema],
  width: { type: Number, default: 3000 },
  height: { type: Number, default: 2000 },
  backgroundColor: { type: String, default: '#ffffff' }
}, { timestamps: true });

module.exports = mongoose.model('Board', boardSchema);

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
  username: { type: String, default: '' },
  // viewer: 只读; commenter: 查看 + 评论; editor: 查看 + 评论 + 编辑
  role: { type: String, enum: ['viewer', 'commenter', 'editor'], default: 'viewer' },
  // pending: 邀请未完成; active: 已接受/在协作中; removed: 已被移出
  status: { type: String, enum: ['pending', 'active', 'removed'], default: 'pending' },
  invitedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date }
}, { _id: false });

const commentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, default: '' },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const boardSchema = new mongoose.Schema({
  name: { type: String, required: true, default: 'Untitled Board' },
  ownerId: { type: String, required: true },
  // Kept for backwards compatibility; mirrors the active members of the board.
  collaborators: [{ type: String }],
  members: { type: [memberSchema], default: [] },
  comments: { type: [commentSchema], default: [] },
  layers: [layerSchema],
  width: { type: Number, default: 3000 },
  height: { type: Number, default: 2000 },
  backgroundColor: { type: String, default: '#ffffff' }
}, { timestamps: true });

// A single membership record per user per board, so repeated or unfinished
// invitations can never create duplicate member records.
boardSchema.index({ _id: 1, 'members.userId': 1 }, { unique: true });

module.exports = mongoose.model('Board', boardSchema);

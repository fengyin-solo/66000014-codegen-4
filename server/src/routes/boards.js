const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { Board, normalizeBoard } = require('../storage');
const {
  ROLES,
  canEdit,
  canComment,
  canManage,
  withAccess,
  upsertMember,
  setMemberStatus,
  removeMember,
} = require('../permissions');
const realtime = require('../realtime');

// Get all boards visible to a user (owned / active member / pending invite).
// Removed members are not listed here; opening such a board directly is read-only.
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const boards = await Board.findAllForUser(userId);
    const result = boards.map((b) => withAccess(b, userId));
    console.log(`[Boards] Fetched ${result.length} boards for user ${userId}`);
    res.json(result);
  } catch (err) {
    console.error('[Boards] Error fetching boards:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a single board. The response always carries the requester's resolved
// access snapshot, including read-only access for removed members.
router.get('/:id', async (req, res) => {
  try {
    const userId = req.query.userId;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(withAccess(board, userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new board
router.post('/', async (req, res) => {
  try {
    const { name, ownerId, width, height, backgroundColor, layers } = req.body;

    if (!ownerId) {
      return res.status(400).json({ error: 'ownerId is required' });
    }

    const boardData = {
      name: name || 'Untitled Board',
      ownerId,
      width: width || 3000,
      height: height || 2000,
      backgroundColor: backgroundColor || '#ffffff',
      members: [],
      comments: [],
    };

    if (layers && Array.isArray(layers)) {
      boardData.layers = layers.map((layer) => ({
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        order: layer.order,
        elements: layer.elements,
      }));
    } else {
      boardData.layers = [{ name: 'Layer 1', visible: true, locked: false, order: 0, elements: [] }];
    }

    const board = new Board(boardData);
    const savedBoard = await board.save();
    console.log(`[Boards] Created board: ${savedBoard._id}, name: ${savedBoard.name}, layers: ${savedBoard.layers.length}`);
    res.status(201).json(withAccess(normalizeBoard(savedBoard), ownerId));
  } catch (err) {
    console.error('[Boards] Error creating board:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update board content (rename, layers, ...). Only editors (and the owner) may.
router.put('/:id', async (req, res) => {
  try {
    const { userId, ...updates } = req.body;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    if (!userId || !canEdit(board, userId)) {
      return res.status(403).json({ error: '没有编辑权限，当前为只读模式' });
    }

    // Membership is managed through dedicated endpoints only.
    delete updates.members;
    delete updates.comments;
    delete updates.ownerId;
    delete updates.collaborators;

    const updated = await Board.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(withAccess(updated, userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a board (creator only)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.query.userId;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    if (!userId || !canManage(board, userId)) {
      return res.status(403).json({ error: '只有画板创建者可以删除画板' });
    }

    await Board.findByIdAndDelete(req.params.id);
    res.json({ message: 'Board deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Member permission center
// ---------------------------------------------------------------------------

// List members (owner only)
router.get('/:id/members', async (req, res) => {
  try {
    const { userId } = req.query;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    if (!userId || !canManage(board, userId)) {
      return res.status(403).json({ error: '只有画板创建者可以管理成员' });
    }
    res.json(board.members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Invite a member or update an existing member's role.
// Idempotent: an unfinished or repeated invitation never duplicates records.
router.post('/:id/members', async (req, res) => {
  try {
    const { userId, memberUserId, username, role } = req.body;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    if (!userId || !canManage(board, userId)) {
      return res.status(403).json({ error: '只有画板创建者可以邀请成员' });
    }
    if (!memberUserId || typeof memberUserId !== 'string') {
      return res.status(400).json({ error: 'memberUserId is required' });
    }
    if (memberUserId === board.ownerId) {
      return res.status(400).json({ error: '创建者已是画板所有者，无需邀请' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'role must be one of viewer, commenter, editor' });
    }

    const result = await Board.updateMembership(req.params.id, (b) => {
      const { member } = upsertMember(b, { userId: memberUserId, username, role });
      return member;
    });
    if (!result) return res.status(404).json({ error: 'Board not found' });

    console.log(`[Boards] Invite/upsert member ${memberUserId} (${role}) on board ${req.params.id}`);
    realtime.emitMembersChanged(req.params.id, result.board.members);
    realtime.emitPermissionChanged(
      req.params.id,
      memberUserId,
      withAccess(result.board, memberUserId).access
    );
    res.status(201).json({ member: result.outcome, members: result.board.members });
  } catch (err) {
    console.error('[Boards] Error inviting member:', err);
    res.status(500).json({ error: err.message });
  }
});

// Accept an invitation: pending -> active
router.post('/:id/members/:memberUserId/accept', async (req, res) => {
  try {
    const { userId } = req.body;
    const { memberUserId } = req.params;
    if (!userId || userId !== memberUserId) {
      return res.status(403).json({ error: '只能接受发给自己的邀请' });
    }

    const result = await Board.updateMembership(req.params.id, (b) =>
      setMemberStatus(b, memberUserId, 'active')
    );
    if (!result) return res.status(404).json({ error: 'Board not found' });
    if (!result.outcome) return res.status(404).json({ error: '未找到邀请记录' });

    realtime.emitMembersChanged(req.params.id, result.board.members);
    res.json({ member: result.outcome, board: withAccess(result.board, userId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change a member's role (owner only)
router.put('/:id/members/:memberUserId/role', async (req, res) => {
  try {
    const { userId, role } = req.body;
    const { memberUserId } = req.params;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    if (!userId || !canManage(board, userId)) {
      return res.status(403).json({ error: '只有画板创建者可以调整权限' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'role must be one of viewer, commenter, editor' });
    }

    const result = await Board.updateMembership(req.params.id, (b) => {
      // Re-use upsert semantics, preserving active status for active members.
      const { member } = upsertMember(b, { userId: memberUserId, role });
      return member;
    });
    if (!result) return res.status(404).json({ error: 'Board not found' });

    realtime.emitMembersChanged(req.params.id, result.board.members);
    realtime.emitPermissionChanged(
      req.params.id,
      memberUserId,
      withAccess(result.board, memberUserId).access
    );
    res.json({ member: result.outcome, members: result.board.members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a member (owner only). The membership is retained as "removed" so a
// later re-entry shows a read-only notice instead of restoring access.
router.delete('/:id/members/:memberUserId', async (req, res) => {
  try {
    const { userId } = req.body;
    const { memberUserId } = req.params;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    if (!userId || !canManage(board, userId)) {
      return res.status(403).json({ error: '只有画板创建者可以移出成员' });
    }

    const result = await Board.updateMembership(req.params.id, (b) =>
      removeMember(b, memberUserId)
    );
    if (!result) return res.status(404).json({ error: 'Board not found' });
    if (!result.outcome) return res.status(404).json({ error: '未找到该成员' });

    realtime.emitMembersChanged(req.params.id, result.board.members);
    realtime.emitPermissionChanged(
      req.params.id,
      memberUserId,
      withAccess(result.board, memberUserId).access
    );
    realtime.emitRemovedFromBoard(req.params.id, memberUserId);
    res.json({ member: result.outcome, members: result.board.members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Comments (commenter role and above)
// ---------------------------------------------------------------------------

router.get('/:id/comments', async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board.comments || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/comments', async (req, res) => {
  try {
    const { userId, username, x, y, text } = req.body;
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    if (!userId || !canComment(board, userId)) {
      return res.status(403).json({ error: '当前权限不能发表评论' });
    }
    if (typeof x !== 'number' || typeof y !== 'number' || !text || !text.trim()) {
      return res.status(400).json({ error: 'x, y and text are required' });
    }

    const comment = {
      id: uuidv4(),
      userId,
      username: username || '',
      x,
      y,
      text: String(text).trim(),
      createdAt: new Date().toISOString(),
    };

    const updated = await Board.persist({ ...board, comments: [...(board.comments || []), comment] });
    realtime.emitCommentAdded(req.params.id, comment);
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

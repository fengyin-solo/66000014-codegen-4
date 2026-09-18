const express = require('express');
const router = express.Router();
const { Board } = require('../storage');
const {
  ROLES,
  ROLE_LABELS,
  isValidRole,
  normalizeMembers,
  activeMemberUserIds,
  resolveRole,
  canOpenBoard,
  canManageMembers,
  canComment,
} = require('../permissions');

// Load board or produce a standard error response.
const loadBoard = async (res, id) => {
  const board = await Board.findById(id);
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return null;
  }
  return board;
};

// Recompute the derived collaborators array before saving.
const syncMembers = (board) => {
  board.members = normalizeMembers(board.members, board.ownerId, board.collaborators);
  board.collaborators = activeMemberUserIds(board.members);
  return board;
};

// Invite one or more members. Idempotent: an existing active/pending member
// is updated in place and never produces a duplicate record. Re-inviting a
// previously removed member reactivates them.
// POST /api/boards/:id/members/invitations  { ownerId, members: [{ userId, role }] }
router.post('/:id/members/invitations', async (req, res) => {
  try {
    const board = await loadBoard(res, req.params.id);
    if (!board) return;

    const { ownerId, members } = req.body;
    if (!canManageMembers(board, ownerId)) {
      return res.status(403).json({ error: '只有画板创建者可以邀请成员' });
    }

    const incoming = Array.isArray(members) ? members : [];
    const results = [];
    const seen = new Set();

    for (const item of incoming) {
      const userId = (item && String(item.userId || '').trim()) || null;
      const role = item && isValidRole(item.role) ? item.role : 'viewer';

      // Ignore blank rows and repeated rows within the same request.
      if (!userId || userId === board.ownerId || seen.has(userId)) {
        continue;
      }
      seen.add(userId);

      const existing = board.members.find((m) => m.userId === userId);
      let status;
      let reactivated = false;

      if (existing) {
        existing.role = role;
        status = existing.status === 'removed' ? 'invited' : existing.status;
        existing.status = status;
        existing.invitedAt = new Date().toISOString();
        reactivated = status === 'invited' && existing.joinedAt === null;
      } else {
        board.members.push({
          userId,
          role,
          status: 'invited',
          invitedAt: new Date().toISOString(),
          joinedAt: null,
        });
      }

      results.push({
        userId,
        role,
        status: existing ? status : 'invited',
        reactivated,
        duplicate: Boolean(existing),
      });
    }

    if (results.length === 0) {
      return res.status(400).json({
        error: '邀请未完成：请填写有效的成员（不能邀请创建者本人，也不能重复空邀请）',
      });
    }

    syncMembers(board);
    const saved = await Board.persist(board);

    if (req.app.get('broadcastMembersChanged')) {
      req.app.get('broadcastMembersChanged')(saved);
    }

    console.log(`[Members] Invited ${results.length} member(s) to board ${board._id}`);
    res.status(201).json({ members: saved.members, invited: results });
  } catch (err) {
    console.error('[Members] Error inviting members:', err);
    res.status(500).json({ error: err.message });
  }
});

// Change a member's role (viewer / commenter / editor).
// PUT /api/boards/:id/members/:userId  { ownerId, role }
router.put('/:id/members/:userId', async (req, res) => {
  try {
    const board = await loadBoard(res, req.params.id);
    if (!board) return;

    const { ownerId, role } = req.body;
    if (!canManageMembers(board, ownerId)) {
      return res.status(403).json({ error: '只有画板创建者可以修改成员权限' });
    }
    if (!isValidRole(role)) {
      return res.status(400).json({ error: `角色必须是：${ROLES.join('、')}` });
    }

    const member = board.members.find((m) => m.userId === req.params.userId);
    if (!member) {
      return res.status(404).json({ error: '该成员不存在或尚未被邀请' });
    }

    member.role = role;
    // A removed record keeps its removed status; role applies if re-invited later.
    syncMembers(board);
    const saved = await Board.persist(board);

    if (req.app.get('broadcastMembersChanged')) {
      req.app.get('broadcastMembersChanged')(saved);
    }

    res.json({ member, members: saved.members });
  } catch (err) {
    console.error('[Members] Error updating member:', err);
    res.status(500).json({ error: err.message });
  }
});

// Remove a member. The record is retained with status "removed" so a later
// re-entry is read-only and a re-invite never duplicates the member record.
// DELETE /api/boards/:id/members/:userId  body/query: { ownerId }
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const board = await loadBoard(res, req.params.id);
    if (!board) return;

    const ownerId = req.body.ownerId || req.query.ownerId;
    if (!canManageMembers(board, ownerId)) {
      return res.status(403).json({ error: '只有画板创建者可以移出成员' });
    }

    const member = board.members.find((m) => m.userId === req.params.userId);
    if (!member) {
      return res.status(404).json({ error: '该成员不存在' });
    }

    member.status = 'removed';
    member.removedAt = new Date().toISOString();
    syncMembers(board);
    const saved = await Board.persist(board);

    // Updates the roster and forces the removed user's live sessions read-only.
    if (req.app.get('broadcastMembersChanged')) {
      req.app.get('broadcastMembersChanged')(saved);
    }

    console.log(`[Members] Removed member ${member.userId} from board ${board._id}`);
    res.json({ members: saved.members, removedUserId: member.userId });
  } catch (err) {
    console.error('[Members] Error removing member:', err);
    res.status(500).json({ error: err.message });
  }
});

// Resolve the current user's effective permission when opening a board.
// GET /api/boards/:id/access?userId=...
router.get('/:id/access', async (req, res) => {
  try {
    const board = await loadBoard(res, req.params.id);
    if (!board) return;

    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const role = resolveRole(board, userId);
    res.json({
      boardId: board._id,
      userId,
      role,
      roleLabel: ROLE_LABELS[role] || '无权限',
      canOpen: canOpenBoard(board, userId),
      canEdit: ['owner', 'editor'].includes(role),
      canComment: ['owner', 'editor', 'commenter'].includes(role),
      readOnly: !['owner', 'editor'].includes(role),
      memberCount: activeMemberUserIds(board.members).length + 1,
    });
  } catch (err) {
    console.error('[Members] Error resolving access:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Comments: the concrete capability behind the "commenter" role ----

// POST /api/boards/:id/comments  { userId, username, text, x, y }
router.post('/:id/comments', async (req, res) => {
  try {
    const board = await loadBoard(res, req.params.id);
    if (!board) return;

    const { userId, username, text, x, y } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: '评论内容不能为空' });
    }
    if (!canComment(board, userId)) {
      return res.status(403).json({ error: '当前权限不能发表评论' });
    }

    const now = new Date().toISOString();
    const comment = {
      _id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      username: username || userId,
      text: String(text).trim(),
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      resolved: false,
      createdAt: now,
    };
    board.comments = board.comments || [];
    board.comments.push(comment);
    const saved = await Board.persist(board);

    if (req.app.get('io')) {
      req.app.get('io').to(`board:${board._id}`).emit('comment-added-broadcast', {
        boardId: board._id,
        comment,
      });
    }
    res.status(201).json({ comment, comments: saved.comments });
  } catch (err) {
    console.error('[Comments] Error adding comment:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/boards/:id/comments/:commentId  body/query: { userId }
router.delete('/:id/comments/:commentId', async (req, res) => {
  try {
    const board = await loadBoard(res, req.params.id);
    if (!board) return;

    const userId = req.body.userId || req.query.userId;
    const comment = (board.comments || []).find((c) => c._id === req.params.commentId);
    if (!comment) return res.status(404).json({ error: '评论不存在' });

    // Comment author or the board owner may delete a comment.
    if (comment.userId !== userId && !canManageMembers(board, userId)) {
      return res.status(403).json({ error: '只能删除自己的评论' });
    }

    board.comments = (board.comments || []).filter((c) => c._id !== req.params.commentId);
    const saved = await Board.persist(board);

    if (req.app.get('io')) {
      req.app.get('io').to(`board:${board._id}`).emit('comment-deleted', {
        boardId: board._id,
        commentId: comment._id,
      });
    }
    res.json({ comments: saved.comments });
  } catch (err) {
    console.error('[Comments] Error deleting comment:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

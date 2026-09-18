const { v4: uuidv4 } = require('uuid');
const { Board } = require('../storage');
const { canEdit, canComment, withAccess } = require('../permissions');
const realtime = require('../realtime');

const activeUsers = new Map(); // boardId -> Set of socket ids
const cursorPositions = new Map(); // socketId -> { x, y, username, userId, boardId }

// Mutation events that change board content and therefore require edit access.
const EDIT_EVENTS = [
  ['draw-element', 'element-added'],
  ['update-element', 'element-updated'],
  ['delete-element', 'element-deleted'],
  ['add-sticky-note', 'sticky-note-added'],
  ['add-shape', 'shape-added'],
  ['layer-update', 'layers-updated'],
];

const setupSocketHandlers = (io) => {
  realtime.setIo(io);

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-board', async ({ boardId, userId, username }) => {
      socket.join(realtime.room(boardId));

      if (!activeUsers.has(boardId)) {
        activeUsers.set(boardId, new Set());
      }
      activeUsers.get(boardId).add(socket.id);

      cursorPositions.set(socket.id, { x: 0, y: 0, username, userId, boardId });

      // Resolve this user's effective open mode for the board. A removed member
      // or an uninvited user still joins, but only in read-only mode.
      const board = await Board.findById(boardId);
      const access = board
        ? withAccess(board, userId).access
        : { role: 'none', status: 'none', canEdit: false, canComment: false, canManage: false };

      socket.emit('board-access', { boardId, access, exists: !!board });

      // Notify others in the room
      socket.to(realtime.room(boardId)).emit('user-joined', { socketId: socket.id, username, userId });

      // Send current active users to the joiner
      const users = [];
      for (const [sid, data] of cursorPositions) {
        if (data.boardId === boardId && sid !== socket.id) {
          users.push({ socketId: sid, username: data.username, userId: data.userId, x: data.x, y: data.y });
        }
      }
      socket.emit('active-users', users);
      if (board) {
        socket.emit('comments-sync', { boardId, comments: board.comments || [] });
      }
    });

    socket.on('cursor-move', ({ boardId, x, y }) => {
      const pos = cursorPositions.get(socket.id);
      if (pos) {
        pos.x = x;
        pos.y = y;
        socket.to(realtime.room(boardId)).emit('cursor-update', {
          socketId: socket.id,
          username: pos.username,
          userId: pos.userId,
          x, y
        });
      }
    });

    // Content mutations: relay only if the sender currently has edit access.
    EDIT_EVENTS.forEach(([incoming, outgoing]) => {
      socket.on(incoming, async (payload, ack) => {
        const { boardId } = payload || {};
        const pos = cursorPositions.get(socket.id);
        const userId = pos?.userId || payload?.userId;
        const board = boardId ? await Board.findById(boardId) : null;

        if (!board || !userId || !canEdit(board, userId)) {
          socket.emit('permission-denied', {
            action: incoming,
            message: '当前为只读模式，不能修改画板内容',
          });
          if (typeof ack === 'function') ack({ ok: false, error: 'forbidden' });
          return;
        }

        // Strip the helper field before relaying.
        const { userId: _uid, ...relayPayload } = payload || {};
        socket.to(realtime.room(boardId)).emit(outgoing, relayPayload);
        if (typeof ack === 'function') ack({ ok: true });
      });
    });

    // Comments require commenter access or above.
    socket.on('comment-add', async ({ boardId, x, y, text }, ack) => {
      const pos = cursorPositions.get(socket.id);
      const userId = pos?.userId;
      const username = pos?.username;
      const board = boardId ? await Board.findById(boardId) : null;

      if (!board || !userId || !canComment(board, userId)) {
        socket.emit('permission-denied', {
          action: 'comment-add',
          message: '当前权限不能发表评论',
        });
        if (typeof ack === 'function') ack({ ok: false, error: 'forbidden' });
        return;
      }

      if (typeof x !== 'number' || typeof y !== 'number' || !text || !String(text).trim()) {
        if (typeof ack === 'function') ack({ ok: false, error: 'invalid comment' });
        return;
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
      realtime.emitCommentAdded(boardId, comment);
      if (typeof ack === 'function') ack({ ok: true, comment });
    });

    socket.on('canvas-transform', ({ boardId, transform }) => {
      socket.to(realtime.room(boardId)).emit('canvas-transformed', { transform });
    });

    // Live permission push: if the creator changes roles while members are on
    // the board, each affected client reconfigures its open mode immediately.
    socket.on('disconnect', () => {
      const pos = cursorPositions.get(socket.id);
      if (pos) {
        const { boardId, username } = pos;
        const users = activeUsers.get(boardId);
        if (users) {
          users.delete(socket.id);
          if (users.size === 0) activeUsers.delete(boardId);
        }
        cursorPositions.delete(socket.id);
        socket.to(realtime.room(boardId)).emit('user-left', { socketId: socket.id, username });
      }
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};

module.exports = { setupSocketHandlers };

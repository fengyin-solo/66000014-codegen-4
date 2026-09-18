const { Board } = require('../storage');
const {
  ROLE_LABELS,
  resolveRole,
  canOpenBoard,
  activeMemberUserIds,
} = require('../permissions');

// socket.id -> { boardId, username, userId, role }
const sessions = new Map();
// boardId -> Set<socket.id>
const activeUsers = new Map();
// socketId -> { x, y, username, boardId }
const cursorPositions = new Map();

const EDIT_ROLES = ['owner', 'editor'];
const COMMENT_ROLES = ['owner', 'editor', 'commenter'];

// Content mutation events are forwarded only when the socket's resolved role
// permits editing. This is the server-side enforcement that backs the UI gates.
const CONTENT_HANDLERS = [
  { event: 'draw-element', outgoing: 'element-added', build: (d) => ({ element: d.element, layerIndex: d.layerIndex }) },
  { event: 'update-element', outgoing: 'element-updated', build: (d) => ({ elementId: d.elementId, updates: d.updates, layerIndex: d.layerIndex }) },
  { event: 'delete-element', outgoing: 'element-deleted', build: (d) => ({ elementId: d.elementId, layerIndex: d.layerIndex }) },
  { event: 'add-sticky-note', outgoing: 'sticky-note-added', build: (d) => ({ note: d.note, layerIndex: d.layerIndex }) },
  { event: 'add-shape', outgoing: 'shape-added', build: (d) => ({ shape: d.shape, layerIndex: d.layerIndex }) },
  { event: 'layer-update', outgoing: 'layers-updated', build: (d) => ({ layers: d.layers }) },
];

const leaveRoom = (socket) => {
  const session = sessions.get(socket.id);
  if (!session) return;
  const { boardId, username } = session;
  const users = activeUsers.get(boardId);
  if (users) {
    users.delete(socket.id);
    if (users.size === 0) activeUsers.delete(boardId);
  }
  cursorPositions.delete(socket.id);
  sessions.delete(socket.id);
  socket.leave(`board:${boardId}`);
  socket.to(`board:${boardId}`).emit('user-left', { socketId: socket.id, username });
};

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-board', async ({ boardId, username, userId } = {}) => {
      leaveRoom(socket);

      if (!boardId) {
        socket.emit('board-error', { message: '缺少画板标识' });
        return;
      }

      const board = await Board.findById(boardId);
      if (!board) {
        socket.emit('board-error', { message: '画板不存在' });
        return;
      }

      const effectiveUserId = userId || `anon-${socket.id}`;
      let role = resolveRole(board, effectiveUserId);

      // Uninvited visitors may open the board but get read-only access.
      if (role === 'unknown') role = 'viewer';
      if (!canOpenBoard(board, effectiveUserId) && role !== 'viewer') {
        socket.emit('board-error', { message: '你暂时无法访问该画板' });
        return;
      }

      // A pending invitation is consumed the first time the member enters.
      let updated = board;
      const member = (board.members || []).find((m) => m.userId === effectiveUserId);
      if (member && member.status === 'invited') {
        member.status = 'active';
        member.joinedAt = new Date().toISOString();
        board.collaborators = activeMemberUserIds(board.members);
        updated = await Board.persist(board);
        role = resolveRole(updated, effectiveUserId);
      }

      socket.join(`board:${boardId}`);
      if (!activeUsers.has(boardId)) activeUsers.set(boardId, new Set());
      activeUsers.get(boardId).add(socket.id);

      sessions.set(socket.id, { boardId, username, userId: effectiveUserId, role });
      cursorPositions.set(socket.id, { x: 0, y: 0, username, boardId });

      // Drives how the board opens (editable / comment-only / read-only) and
      // which collaboration channels this socket is allowed to use.
      socket.emit('permission-state', {
        boardId,
        userId: effectiveUserId,
        role,
        roleLabel: ROLE_LABELS[role] || '仅查看',
        readOnly: !EDIT_ROLES.includes(role),
        canEdit: EDIT_ROLES.includes(role),
        canComment: COMMENT_ROLES.includes(role),
        members: updated.members || [],
      });

      socket.to(`board:${boardId}`).emit('user-joined', { socketId: socket.id, username });

      const users = [];
      for (const [sid, data] of cursorPositions) {
        if (data.boardId === boardId && sid !== socket.id) {
          users.push({ socketId: sid, username: data.username, x: data.x, y: data.y });
        }
      }
      socket.emit('active-users', users);
    });

    socket.on('cursor-move', ({ x, y } = {}) => {
      const session = sessions.get(socket.id);
      const pos = cursorPositions.get(socket.id);
      if (!session || !pos) return;
      pos.x = x;
      pos.y = y;
      socket.to(`board:${session.boardId}`).emit('cursor-update', {
        socketId: socket.id, username: session.username, x, y,
      });
    });

    CONTENT_HANDLERS.forEach(({ event, outgoing, build }) => {
      socket.on(event, (data = {}) => {
        const session = sessions.get(socket.id);
        if (!session) return;
        if (!EDIT_ROLES.includes(session.role)) {
          // Viewers/commenters/removed members can never mutate content.
          socket.emit('permission-denied', {
            action: event,
            message: '当前为只读模式，无法修改画板内容',
          });
          return;
        }
        socket.to(`board:${session.boardId}`).emit(outgoing, build(data));
      });
    });

    // Live fan-out for comments; REST is the authoritative permission check.
    socket.on('add-comment', (data = {}) => {
      const session = sessions.get(socket.id);
      if (!session || !data.comment) return;
      if (!COMMENT_ROLES.includes(session.role)) {
        socket.emit('permission-denied', {
          action: 'add-comment',
          message: '当前权限不能发表评论',
        });
        return;
      }
      socket.to(`board:${session.boardId}`).emit('comment-added-live', { comment: data.comment });
    });

    // Canvas pan/zoom is local navigation: allowed for everyone but only
    // editors' navigation is shared so viewers never disrupt collaborators.
    socket.on('canvas-transform', ({ transform } = {}) => {
      const session = sessions.get(socket.id);
      if (!session || !EDIT_ROLES.includes(session.role)) return;
      socket.to(`board:${session.boardId}`).emit('canvas-transformed', { transform });
    });

    socket.on('disconnect', () => {
      leaveRoom(socket);
      console.log(`User disconnected: ${socket.id}`);
    });
  });
}

// Push a member/permission change to every live session of that board.
// Affected users receive their new effective role; everyone gets the roster.
function broadcastMembersChanged(io, board) {
  const boardId = board._id;
  const members = board.members || [];
  io.to(`board:${boardId}`).emit('members-changed', { boardId, members });

  sessions.forEach((session, sid) => {
    if (session.boardId !== boardId) return;
    const role = resolveRole(board, session.userId);
    if (!['owner', 'editor', 'commenter', 'viewer', 'removed'].includes(role)) {
      // Uninvited but connected visitors keep read-only.
      session.role = 'viewer';
    } else {
      session.role = role;
    }
    const effectiveRole = session.role;
    const socket = io.sockets.sockets.get(sid);
    if (!socket) return;
    socket.emit('permission-state', {
      boardId,
      userId: session.userId,
      role: effectiveRole,
      roleLabel: ROLE_LABELS[effectiveRole] || '仅查看',
      readOnly: !['owner', 'editor'].includes(effectiveRole),
      canEdit: ['owner', 'editor'].includes(effectiveRole),
      canComment: ['owner', 'editor', 'commenter'].includes(effectiveRole),
      members,
    });
  });
}

module.exports = { setupSocketHandlers, broadcastMembersChanged };

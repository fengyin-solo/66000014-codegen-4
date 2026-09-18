// Tiny bridge so REST membership changes can notify live socket sessions,
// without creating a circular dependency between routes and socket handlers.
let ioInstance = null;

const setIo = (io) => {
  ioInstance = io;
};

const room = (boardId) => `board:${boardId}`;

// Broadcast the updated member list to everyone currently on the board.
const emitMembersChanged = (boardId, members) => {
  if (ioInstance) {
    ioInstance.to(room(boardId)).emit('members-changed', { boardId, members });
  }
};

// Tell a specific user (possibly connected from multiple tabs) that their
// permission on a board changed, so their open mode updates immediately.
const emitPermissionChanged = (boardId, userId, access) => {
  if (ioInstance) {
    ioInstance.to(room(boardId)).emit('permission-changed', { boardId, userId, access });
  }
};

// Force-remove a user's collaboration connection from the room when they are
// moved out of the board; their client falls back to the read-only notice.
const emitRemovedFromBoard = (boardId, userId) => {
  if (ioInstance) {
    ioInstance.to(room(boardId)).emit('removed-from-board', { boardId, userId });
  }
};

const emitCommentAdded = (boardId, comment) => {
  if (ioInstance) {
    ioInstance.to(room(boardId)).emit('comment-added', { boardId, comment });
  }
};

module.exports = {
  setIo,
  room,
  emitMembersChanged,
  emitPermissionChanged,
  emitRemovedFromBoard,
  emitCommentAdded,
};

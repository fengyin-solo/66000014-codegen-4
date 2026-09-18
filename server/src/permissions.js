// Board membership / permission helpers shared by REST routes and socket handlers.
//
// Roles (granted by the board creator):
//   owner     -> full control (the board creator)
//   editor    -> view + comment + edit content
//   commenter -> view + leave comments
//   viewer    -> read-only
//
// Member status:
//   active  -> currently a collaborator
//   pending -> invited but invitation not completed yet
//   removed -> was removed from the board; re-entry is read-only
//
// Anyone else (not owner, not invited) is treated as an outside viewer.

const ROLES = ['viewer', 'commenter', 'editor'];

const normalizeMember = (raw) => {
  const member = {
    userId: raw.userId,
    username: raw.username || '',
    role: ROLES.includes(raw.role) ? raw.role : 'viewer',
    status: ['pending', 'active', 'removed'].includes(raw.status) ? raw.status : 'active',
    invitedAt: raw.invitedAt || new Date().toISOString(),
    respondedAt: raw.respondedAt || null,
  };
  return member;
};

// Make sure legacy boards (which only had a collaborators: string[] array)
// keep collaborating: old collaborators become active editors.
const normalizeMembers = (board) => {
  const members = Array.isArray(board.members) ? board.members.map(normalizeMember) : [];
  const byUser = new Map(members.map((m) => [m.userId, m]));

  if (Array.isArray(board.collaborators)) {
    board.collaborators.forEach((userId) => {
      if (userId && userId !== board.ownerId && !byUser.has(userId)) {
        byUser.set(userId, {
          userId,
          username: '',
          role: 'editor',
          status: 'active',
          invitedAt: board.createdAt || new Date().toISOString(),
          respondedAt: board.createdAt || new Date().toISOString(),
        });
      }
    });
  }

  return Array.from(byUser.values());
};

const findMember = (board, userId) =>
  normalizeMembers(board).find((m) => m.userId === userId) || null;

// Resolve the effective access level of a user against a board.
// Returns { role: 'owner'|'editor'|'commenter'|'viewer'|'none', status, member }.
const resolveAccess = (board, userId) => {
  if (!userId) return { role: 'none', status: 'none', member: null };
  if (board.ownerId === userId) return { role: 'owner', status: 'active', member: null };

  const member = findMember(board, userId);
  if (!member) return { role: 'none', status: 'none', member: null };

  if (member.status === 'removed') {
    return { role: 'viewer', status: 'removed', member };
  }
  if (member.status === 'pending') {
    return { role: member.role, status: 'pending', member };
  }
  return { role: member.role, status: 'active', member };
};

const RANK = { none: -1, viewer: 0, commenter: 1, editor: 2, owner: 3 };

const canEdit = (board, userId) => RANK[resolveAccess(board, userId).role] >= RANK.editor;
const canComment = (board, userId) => RANK[resolveAccess(board, userId).role] >= RANK.commenter;
const canView = (board, userId) => resolveAccess(board, userId).role !== 'none';
const canManage = (board, userId) => board.ownerId === userId;

// Boards a user should see on their dashboard: boards they own, plus boards
// where an invitation is pending or they are an active collaborator.
// Removed members do not get the board listed, but direct re-entry is read-only.
const isBoardVisibleTo = (board, userId) => {
  if (board.ownerId === userId) return true;
  const member = findMember(board, userId);
  return !!member && member.status !== 'removed';
};

// Idempotently upsert a membership so unfinished or repeated invitations never
// produce more than one record per user. Returns { member, boardChanged }.
const upsertMember = (board, { userId, username, role }) => {
  if (!role || !ROLES.includes(role)) {
    throw new Error('role must be one of viewer, commenter, editor');
  }
  const members = normalizeMembers(board);
  const now = new Date().toISOString();
  const existing = members.find((m) => m.userId === userId);

  if (existing) {
    const changed = existing.role !== role || existing.status === 'removed';
    existing.role = role;
    if (username) existing.username = username;
    // Re-inviting a removed member or re-issuing a pending invitation restarts
    // the invitation flow; an active member's role is simply updated.
    if (existing.status === 'removed') {
      existing.status = 'pending';
      existing.invitedAt = now;
      existing.respondedAt = null;
    }
    board.members = members;
    syncCollaborators(board);
    return { member: existing, boardChanged: changed };
  }

  const member = {
    userId,
    username: username || '',
    role,
    status: 'pending',
    invitedAt: now,
    respondedAt: null,
  };
  members.push(member);
  board.members = members;
  syncCollaborators(board);
  return { member, boardChanged: true };
};

const setMemberStatus = (board, userId, status) => {
  const members = normalizeMembers(board);
  const member = members.find((m) => m.userId === userId);
  if (!member) return null;
  member.status = status;
  member.respondedAt = new Date().toISOString();
  board.members = members;
  syncCollaborators(board);
  return member;
};

const removeMember = (board, userId) => {
  const members = normalizeMembers(board);
  const member = members.find((m) => m.userId === userId);
  if (!member) return null;
  member.status = 'removed';
  member.respondedAt = new Date().toISOString();
  board.members = members;
  syncCollaborators(board);
  return member;
};

// Keep the legacy collaborators array in sync with active (non-removed,
// non-pending) members so existing collaboration code keeps working.
const syncCollaborators = (board) => {
  board.collaborators = normalizeMembers(board)
    .filter((m) => m.status === 'active')
    .map((m) => m.userId);
};

// Attach the requester's resolved permission snapshot to an outgoing board.
const withAccess = (board, userId) => {
  const plain = typeof board.toObject === 'function' ? board.toObject() : { ...board };
  plain.members = normalizeMembers(plain);
  syncCollaborators(plain);
  plain.comments = Array.isArray(plain.comments) ? plain.comments : [];
  const access = resolveAccess(plain, userId);
  plain.access = {
    role: access.role,
    status: access.status,
    canEdit: canEdit(plain, userId),
    canComment: canComment(plain, userId),
    canManage: canManage(plain, userId),
  };
  return plain;
};

module.exports = {
  ROLES,
  normalizeMembers,
  findMember,
  resolveAccess,
  canEdit,
  canComment,
  canView,
  canManage,
  isBoardVisibleTo,
  upsertMember,
  setMemberStatus,
  removeMember,
  syncCollaborators,
  withAccess,
};

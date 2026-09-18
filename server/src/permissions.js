// Board member permission model and helpers.
//
// Roles:
//   owner    - board creator, full control including member management
//   editor   - can change existing content and add new elements/layers
//   commenter- can read and leave comments, but cannot change board content
//   viewer   - strictly read-only
//
// Effective roles (returned by resolveRole):
//   owner | editor | commenter | viewer | removed | unknown
//
// Member status:
//   active   - invitation accepted / member already participating
//   invited  - invitation sent but not yet entered the board
//   removed  - member was removed from the board; re-entering is read-only

const ROLES = ['viewer', 'commenter', 'editor'];
const ROLE_OWNER = 'owner';
const STATUSES = ['invited', 'active', 'removed'];

const ROLE_LABELS = {
  owner: '创建者',
  editor: '可编辑',
  commenter: '可评论',
  viewer: '仅查看',
};

const isValidRole = (role) => ROLES.includes(role);

const normalizeMembers = (members, ownerId, legacyCollaborators) => {
  const map = new Map();

  // Existing structured records are the source of truth.
  if (Array.isArray(members)) {
    members.forEach((m) => {
      if (!m || !m.userId) return;
      map.set(m.userId, {
        userId: m.userId,
        role: isValidRole(m.role) ? m.role : 'viewer',
        status: STATUSES.includes(m.status) ? m.status : 'active',
        invitedAt: m.invitedAt || new Date().toISOString(),
        joinedAt: m.joinedAt || null,
      });
    });
  }

  // Backward compatibility: legacy string collaborators become editors.
  if (Array.isArray(legacyCollaborators)) {
    legacyCollaborators.forEach((userId) => {
      if (userId && userId !== ownerId && !map.has(userId)) {
        map.set(userId, {
          userId,
          role: 'editor',
          status: 'active',
          invitedAt: new Date().toISOString(),
          joinedAt: null,
        });
      }
    });
  }

  return Array.from(map.values());
};

// Active member list (kept in sync with the legacy collaborators field).
const activeMemberUserIds = (members) =>
  (Array.isArray(members) ? members : [])
    .filter((m) => m && m.userId && m.status !== 'removed')
    .map((m) => m.userId);

// Effective role of a user on a board, regardless of invitation state.
const resolveRole = (board, userId) => {
  if (!board || !userId) return 'unknown';
  if (board.ownerId === userId) return ROLE_OWNER;
  const member = (board.members || []).find((m) => m.userId === userId);
  if (!member) return 'unknown';
  if (member.status === 'removed') return 'removed';
  // invited and active share the granted role.
  return member.role || 'viewer';
};

const isOwner = (board, userId) => board && board.ownerId === userId;

// Entering the board: removed members and uninvited users are read-only,
// pending invitations become active on first entry.
const canOpenBoard = (board, userId) => {
  const role = resolveRole(board, userId);
  return ['owner', 'editor', 'commenter', 'viewer', 'removed'].includes(role);
};

const canEditContent = (board, userId) => ['owner', 'editor'].includes(resolveRole(board, userId));
const canComment = (board, userId) => ['owner', 'editor', 'commenter'].includes(resolveRole(board, userId));
const canView = (board, userId) => resolveRole(board, userId) !== 'unknown';
const canManageMembers = (board, userId) => isOwner(board, userId);

// Read-only state (cannot mutate existing or new content).
const isReadOnly = (board, userId) => !canEditContent(board, userId);

module.exports = {
  ROLES,
  ROLE_OWNER,
  STATUSES,
  ROLE_LABELS,
  isValidRole,
  normalizeMembers,
  activeMemberUserIds,
  resolveRole,
  isOwner,
  canOpenBoard,
  canView,
  canEditContent,
  canComment,
  canManageMembers,
  isReadOnly,
};

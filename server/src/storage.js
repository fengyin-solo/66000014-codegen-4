const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const permissions = require('./permissions');

const DATA_DIR = path.join(__dirname, '../data');
const BOARDS_FILE = path.join(DATA_DIR, 'boards.json');

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const readBoards = () => {
  ensureDataDir();
  if (!fs.existsSync(BOARDS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(BOARDS_FILE, 'utf8');
    const boards = JSON.parse(data);
    return Array.isArray(boards) ? boards : [];
  } catch (error) {
    console.error('[Storage] Error reading boards file:', error);
    return [];
  }
};

const writeBoards = (boards) => {
  ensureDataDir();
  try {
    fs.writeFileSync(BOARDS_FILE, JSON.stringify(boards, null, 2), 'utf8');
  } catch (error) {
    console.error('[Storage] Error writing boards file:', error);
    throw error;
  }
};

const defaultLayer = () => ({ name: 'Layer 1', visible: true, locked: false, order: 0, elements: [] });

// Normalize a raw board record: fill new permission fields and migrate legacy
// collaborator-only boards so they keep collaborating.
const normalizeBoard = (raw) => {
  const board = {
    _id: raw._id || uuidv4(),
    name: raw.name || 'Untitled Board',
    ownerId: raw.ownerId,
    collaborators: Array.isArray(raw.collaborators) ? raw.collaborators : [],
    members: permissions.normalizeMembers(raw),
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    layers: Array.isArray(raw.layers) && raw.layers.length ? raw.layers : [defaultLayer()],
    width: raw.width || 3000,
    height: raw.height || 2000,
    backgroundColor: raw.backgroundColor || '#ffffff',
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
  permissions.syncCollaborators(board);
  return board;
};

class LocalBoard {
  constructor(data) {
    const normalized = normalizeBoard({
      ...data,
      _id: data._id || uuidv4(),
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    });
    Object.assign(this, normalized);
  }

  toObject() {
    return {
      _id: this._id,
      name: this.name,
      ownerId: this.ownerId,
      collaborators: this.collaborators,
      members: this.members,
      comments: this.comments,
      layers: this.layers,
      width: this.width,
      height: this.height,
      backgroundColor: this.backgroundColor,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    permissions.syncCollaborators(this);
    const boards = readBoards();
    const existingIndex = boards.findIndex((b) => b._id === this._id);

    if (existingIndex >= 0) {
      boards[existingIndex] = this.toObject();
    } else {
      boards.unshift(this.toObject());
    }

    writeBoards(boards);
    console.log(`[Storage] Saved board: ${this._id}, name: ${this.name}`);
    return this.toObject();
  }

  // Legacy query helper retained for compatibility.
  static find(query = {}) {
    const boards = readBoards().map(normalizeBoard);
    let result = [...boards];

    if (query.$or) {
      result = result.filter((board) => {
        return query.$or.some((condition) => {
          if (condition.ownerId !== undefined) {
            return board.ownerId === condition.ownerId;
          }
          if (condition.collaborators !== undefined) {
            return board.collaborators.includes(condition.collaborators);
          }
          if (condition['members.userId'] !== undefined) {
            return board.members.some(
              (m) => m.userId === condition['members.userId'] && m.status !== 'removed'
            );
          }
          return true;
        });
      });
    } else if (query.ownerId !== undefined) {
      result = result.filter((b) => b.ownerId === query.ownerId);
    } else if (query._id !== undefined) {
      result = result.filter((b) => b._id === query._id);
    }

    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return {
      sort: () => ({
        exec: async () => result,
        then: (resolve) => Promise.resolve(result).then(resolve),
      }),
      exec: async () => result,
      then: (resolve) => Promise.resolve(result).then(resolve),
    };
  }

  // All boards a user can see on their dashboard.
  static async findAllForUser(userId) {
    return readBoards()
      .map(normalizeBoard)
      .filter((b) => permissions.isBoardVisibleTo(b, userId))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  static async findById(id) {
    const boards = readBoards();
    const board = boards.find((b) => b._id === id);
    return board ? normalizeBoard(board) : null;
  }

  // Persist an already-normalized plain board object.
  static async persist(board) {
    const normalized = normalizeBoard(board);
    normalized.updatedAt = new Date().toISOString();
    const boards = readBoards();
    const index = boards.findIndex((b) => b._id === normalized._id);
    if (index < 0) {
      boards.unshift(normalized);
    } else {
      boards[index] = normalized;
    }
    writeBoards(boards);
    return normalizeBoard(normalized);
  }

  // Read-modify-write membership under a single file lock (synchronous fs calls)
  // so concurrent invitations never create duplicate member records.
  static async updateMembership(id, mutator) {
    const boards = readBoards();
    const index = boards.findIndex((b) => b._id === id);
    if (index < 0) return null;

    const board = normalizeBoard(boards[index]);
    const outcome = mutator(board);
    board.updatedAt = new Date().toISOString();
    boards[index] = board;
    writeBoards(boards);
    return { board: normalizeBoard(board), outcome };
  }

  static async findByIdAndUpdate(id, updates, options = {}) {
    const boards = readBoards();
    const index = boards.findIndex((b) => b._id === id);

    if (index < 0) {
      return null;
    }

    const next = normalizeBoard({ ...boards[index], ...updates });
    next.updatedAt = new Date().toISOString();
    boards[index] = next;

    writeBoards(boards);
    console.log(`[Storage] Updated board: ${id}`);
    return options.new ? next : null;
  }

  static async findByIdAndDelete(id) {
    const boards = readBoards();
    const index = boards.findIndex((b) => b._id === id);

    if (index < 0) {
      return null;
    }

    const deleted = boards[index];
    boards.splice(index, 1);
    writeBoards(boards);
    console.log(`[Storage] Deleted board: ${id}`);
    return deleted;
  }
}

// Seed the three scenario boards on first run so permission changes can be
// experienced across 产品需求评审 / 团队脑暴会 / 架构设计讨论.
const seedBoardsIfEmpty = () => {
  const boards = readBoards();
  if (boards.length > 0) return;

  const now = new Date().toISOString();
  const demoMembers = [
    { userId: 'user-2', username: '李评审', role: 'editor', status: 'active', invitedAt: now, respondedAt: now },
    { userId: 'user-3', username: '王评论', role: 'commenter', status: 'active', invitedAt: now, respondedAt: now },
    { userId: 'user-4', username: '张查看', role: 'viewer', status: 'active', invitedAt: now, respondedAt: now },
    { userId: 'user-5', username: '赵待加入', role: 'editor', status: 'pending', invitedAt: now, respondedAt: null },
    { userId: 'user-6', username: '孙已移出', role: 'editor', status: 'removed', invitedAt: now, respondedAt: now },
  ];

  const scenarios = [
    { name: '产品需求评审', bg: '#f5f5f5' },
    { name: '团队脑暴会', bg: '#fff8e1' },
    { name: '架构设计讨论', bg: '#ffffff' },
  ];

  scenarios.forEach((scenario, i) => {
    const board = normalizeBoard({
      _id: `seed-board-${i + 1}`,
      name: scenario.name,
      ownerId: 'user-1',
      members: demoMembers.map((m) => ({ ...m })),
      comments: [],
      layers: [{
        name: '图层 1',
        visible: true,
        locked: false,
        order: 0,
        elements: [
          {
            id: `seed-el-${i + 1}`,
            type: 'sticky-note',
            x: 200,
            y: 160,
            width: 200,
            height: 140,
            fill: '#FFF59D',
            stroke: '#F9A825',
            strokeWidth: 1,
            text: `${scenario.name}：欢迎协作`,
          },
        ],
      }],
      backgroundColor: scenario.bg,
      createdAt: now,
      updatedAt: now,
    });
    boards.push(board);
  });

  writeBoards(boards);
  console.log(`[Storage] Seeded ${scenarios.length} demo boards`);
};

const initStorage = () => {
  ensureDataDir();
  seedBoardsIfEmpty();
  console.log(`[Storage] Initialized with data directory: ${DATA_DIR}`);
  const count = readBoards().length;
  console.log(`[Storage] Loaded ${count} boards from local storage`);
};

module.exports = {
  Board: LocalBoard,
  initStorage,
  normalizeBoard,
  readBoards,
  writeBoards,
};

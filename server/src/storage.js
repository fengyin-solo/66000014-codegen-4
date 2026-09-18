const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { normalizeMembers, activeMemberUserIds } = require('./permissions');

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
    return JSON.parse(data);
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

const hydrateBoard = (board) => {
  if (!board) return board;
  const hydrated = new LocalBoard(board);
  hydrated.createdAt = board.createdAt || hydrated.createdAt;
  return hydrated.toObject();
};

class LocalBoard {
  constructor(data) {
    this._id = data._id || uuidv4();
    this.name = data.name || 'Untitled Board';
    this.ownerId = data.ownerId;
    this.members = normalizeMembers(data.members, this.ownerId, data.collaborators);
    // collaborators stays populated for backward compatibility with existing clients.
    this.collaborators = activeMemberUserIds(this.members);
    this.comments = data.comments || [];
    this.layers = data.layers || [{ name: 'Layer 1', visible: true, locked: false, order: 0, elements: [] }];
    this.width = data.width || 3000;
    this.height = data.height || 2000;
    this.backgroundColor = data.backgroundColor || '#ffffff';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  toObject() {
    return {
      _id: this._id,
      name: this.name,
      ownerId: this.ownerId,
      members: this.members,
      collaborators: this.collaborators,
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

  static find(query = {}) {
    const boards = readBoards();
    let result = [...boards];

    if (query.$or) {
      result = result.filter((board) => {
        return query.$or.some((condition) => {
          if (condition.ownerId !== undefined) {
            return board.ownerId === condition.ownerId;
          }
          if (condition.collaborators !== undefined) {
            const userId = condition.collaborators;
            if (board.collaborators && board.collaborators.includes(userId)) return true;
            // Boards shared via the new member model (active members only).
            return (board.members || []).some(
              (m) => m.userId === userId && m.status !== 'removed'
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

    // Normalize any legacy records (add members/comments, sync collaborators).
    result = result.map((b) => hydrateBoard(b));

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

  static async findById(id) {
    const boards = readBoards();
    const board = boards.find((b) => b._id === id);
    return board ? hydrateBoard(board) : null;
  }

  // Persist a fully-formed board object (members, comments, layers, ...).
  static async persist(boardData) {
    const boards = readBoards();
    const index = boards.findIndex((b) => b._id === boardData._id);
    const next = { ...hydrateBoard(boardData), updatedAt: new Date().toISOString() };
    if (index >= 0) {
      boards[index] = next;
    } else {
      boards.unshift(next);
    }
    writeBoards(boards);
    return next;
  }

  static async findByIdAndUpdate(id, updates, options = {}) {
    const boards = readBoards();
    const index = boards.findIndex((b) => b._id === id);

    if (index < 0) {
      return null;
    }

    boards[index] = hydrateBoard({
      ...boards[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    writeBoards(boards);
    console.log(`[Storage] Updated board: ${id}`);
    return options.new ? boards[index] : null;
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

const initStorage = () => {
  ensureDataDir();
  console.log(`[Storage] Initialized with data directory: ${DATA_DIR}`);
  const count = readBoards().length;
  console.log(`[Storage] Loaded ${count} boards from local storage`);
};

module.exports = {
  Board: LocalBoard,
  initStorage,
};

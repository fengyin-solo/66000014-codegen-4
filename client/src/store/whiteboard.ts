import { create } from 'zustand';
import { Board, BoardElement, CursorPosition, CanvasTransform, ToolType, Layer, BoardAccess, BoardComment } from '../types';
import { socketService } from '../services/socket';
import { DEFAULT_USER } from '../services/users';

// Open-mode defaults used until the server resolves the user's access.
const NO_ACCESS: BoardAccess = {
  role: 'none',
  status: 'none',
  canEdit: false,
  canComment: false,
  canManage: false,
};

interface WhiteboardState {
  board: Board | null;
  access: BoardAccess;
  comments: BoardComment[];
  currentUserId: string;
  activeTool: ToolType;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  activeLayerIndex: number;
  cursors: Map<string, CursorPosition>;
  canvasTransform: CanvasTransform;
  username: string;

  // Actions
  setBoard: (board: Board) => void;
  setAccess: (access: BoardAccess) => void;
  setComments: (comments: BoardComment[]) => void;
  addCommentToState: (comment: BoardComment) => void;
  setMembers: (members: Board['members']) => void;
  setCurrentUser: (userId: string, username: string) => void;
  setActiveTool: (tool: ToolType) => void;
  setStrokeColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setActiveLayerIndex: (index: number) => void;
  addElement: (element: BoardElement) => boolean;
  updateElement: (elementId: string, updates: Partial<BoardElement>) => boolean;
  deleteElement: (elementId: string) => boolean;
  addLayer: (name: string) => void;
  toggleLayerVisibility: (index: number) => void;
  toggleLayerLock: (index: number) => void;
  setCanvasTransform: (transform: CanvasTransform) => void;
  updateCursor: (cursor: CursorPosition) => void;
  removeCursor: (socketId: string) => void;
  setCursors: (cursors: CursorPosition[]) => void;
  setUsername: (name: string) => void;
}

export const useWhiteboardStore = create<WhiteboardState>((set, get) => ({
  board: null,
  access: NO_ACCESS,
  comments: [],
  currentUserId: DEFAULT_USER.userId,
  activeTool: 'pen',
  strokeColor: '#000000',
  fillColor: 'transparent',
  strokeWidth: 2,
  activeLayerIndex: 0,
  cursors: new Map(),
  canvasTransform: { scale: 1, translateX: 0, translateY: 0 },
  username: DEFAULT_USER.username,

  setBoard: (board) =>
    set({
      board,
      comments: board.comments || [],
      access: board.access || NO_ACCESS,
    }),

  // Apply a server-pushed permission change without losing local canvas state.
  setAccess: (access) => {
    const { board, activeTool } = get();
    const canUseTool = (tool: ToolType) => {
      if (tool === 'comment') return access.canComment;
      return access.canEdit;
    };
    set({
      access,
      activeTool: canUseTool(activeTool) ? activeTool : 'select',
    });
    if (board && board.access) {
      set({ board: { ...board, access } });
    }
  },

  setComments: (comments) => set({ comments }),

  addCommentToState: (comment) => {
    if (get().comments.some((c) => c.id === comment.id)) return;
    set({ comments: [...get().comments, comment] });
  },

  // Live member list updates from the permission center; recompute own access.
  setMembers: (members) => {
    const { board, currentUserId } = get();
    if (!board) return;
    const nextBoard = { ...board, members };
    if (board.ownerId === currentUserId) {
      nextBoard.access = { ...get().access, canManage: true };
    }
    set({ board: nextBoard });
  },

  setCurrentUser: (userId, username) => set({ currentUserId: userId, username }),

  setActiveTool: (tool) => set({ activeTool: tool }),
  setStrokeColor: (color) => set({ strokeColor: color }),
  setFillColor: (color) => set({ fillColor: color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setActiveLayerIndex: (index) => set({ activeLayerIndex: index }),

  addElement: (element) => {
    const { board, activeLayerIndex, access } = get();
    if (!board || !access.canEdit) return false;
    const layers = [...board.layers];
    layers[activeLayerIndex] = {
      ...layers[activeLayerIndex],
      elements: [...layers[activeLayerIndex].elements, element]
    };
    set({ board: { ...board, layers } });
    socketService.drawElement(element, activeLayerIndex);
    return true;
  },

  updateElement: (elementId, updates) => {
    const { board, activeLayerIndex, access } = get();
    if (!board || !access.canEdit) return false;
    const layers = [...board.layers];
    const elements = layers[activeLayerIndex].elements.map(el =>
      el.id === elementId ? { ...el, ...updates } : el
    );
    layers[activeLayerIndex] = { ...layers[activeLayerIndex], elements };
    set({ board: { ...board, layers } });
    socketService.updateElement(elementId, updates, activeLayerIndex);
    return true;
  },

  deleteElement: (elementId) => {
    const { board, activeLayerIndex, access } = get();
    if (!board || !access.canEdit) return false;
    const layers = [...board.layers];
    const elements = layers[activeLayerIndex].elements.filter(el => el.id !== elementId);
    layers[activeLayerIndex] = { ...layers[activeLayerIndex], elements };
    set({ board: { ...board, layers } });
    socketService.deleteElement(elementId, activeLayerIndex);
    return true;
  },

  addLayer: (name) => {
    const { board, access } = get();
    if (!board || !access.canEdit) return;
    const newLayer: Layer = { name, visible: true, locked: false, order: board.layers.length, elements: [] };
    const layers = [...board.layers, newLayer];
    set({ board: { ...board, layers }, activeLayerIndex: layers.length - 1 });
    socketService.updateLayers(layers);
  },

  toggleLayerVisibility: (index) => {
    const { board, access } = get();
    if (!board || !access.canEdit) return;
    const layers = [...board.layers];
    layers[index] = { ...layers[index], visible: !layers[index].visible };
    set({ board: { ...board, layers } });
    socketService.updateLayers(layers);
  },

  toggleLayerLock: (index) => {
    const { board, access } = get();
    if (!board || !access.canEdit) return;
    const layers = [...board.layers];
    layers[index] = { ...layers[index], locked: !layers[index].locked };
    set({ board: { ...board, layers } });
    socketService.updateLayers(layers);
  },

  setCanvasTransform: (transform) => {
    set({ canvasTransform: transform });
    socketService.canvasTransform(transform);
  },

  updateCursor: (cursor) => {
    const cursors = new Map(get().cursors);
    cursors.set(cursor.socketId, cursor);
    set({ cursors });
  },

  removeCursor: (socketId) => {
    const cursors = new Map(get().cursors);
    cursors.delete(socketId);
    set({ cursors });
  },

  setCursors: (cursorsList) => {
    const cursors = new Map();
    cursorsList.forEach(c => cursors.set(c.socketId, c));
    set({ cursors });
  },

  setUsername: (name) => set({ username: name }),
}));

// Convenience selector used by tool UI: which tools the current open mode allows.
export const isToolAllowed = (tool: ToolType, access: BoardAccess): boolean => {
  if (tool === 'select') return true;
  if (tool === 'comment') return access.canComment;
  return access.canEdit;
};

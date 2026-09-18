import { create } from 'zustand';
import {
  Board,
  BoardElement,
  CursorPosition,
  CanvasTransform,
  ToolType,
  Layer,
  PermissionState,
  EffectiveRole,
  BoardComment,
  BoardMember,
} from '../types';
import { socketService } from '../services/socket';

// Stable identity used for permission resolution across reloads.
const CURRENT_USER_ID = 'user-1';

interface WhiteboardState {
  board: Board | null;
  activeTool: ToolType;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  activeLayerIndex: number;
  cursors: Map<string, CursorPosition>;
  canvasTransform: CanvasTransform;
  username: string;
  currentUserId: string;

  // Permission center state
  permission: PermissionState | null;
  comments: BoardComment[];
  permissionMessage: string | null;

  // Actions
  setBoard: (board: Board) => void;
  setActiveTool: (tool: ToolType) => void;
  setStrokeColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setActiveLayerIndex: (index: number) => void;
  addElement: (element: BoardElement) => void;
  updateElement: (elementId: string, updates: Partial<BoardElement>) => void;
  deleteElement: (elementId: string) => void;
  addLayer: (name: string) => void;
  toggleLayerVisibility: (index: number) => void;
  toggleLayerLock: (index: number) => void;
  setCanvasTransform: (transform: CanvasTransform, local?: boolean) => void;
  updateCursor: (cursor: CursorPosition) => void;
  removeCursor: (socketId: string) => void;
  setCursors: (cursors: CursorPosition[]) => void;
  setUsername: (name: string) => void;

  setPermission: (permission: PermissionState | null) => void;
  setMembers: (members: BoardMember[]) => void;
  setComments: (comments: BoardComment[]) => void;
  upsertComment: (comment: BoardComment) => void;
  removeComment: (commentId: string) => void;
  setPermissionMessage: (message: string | null) => void;
  effectiveRole: () => EffectiveRole;
  canEdit: () => boolean;
  canComment: () => boolean;
  isReadOnly: () => boolean;
}

export const useWhiteboardStore = create<WhiteboardState>((set, get) => {
  // Every content mutation goes through this gate so viewers/commenters/removed
  // members can never alter existing content, even if the UI were bypassed.
  const guardEdit = (): boolean => {
    const allowed = get().canEdit();
    if (!allowed) {
      set({ permissionMessage: '当前为只读模式，无法修改画板内容' });
    }
    return allowed;
  };

  return {
    board: null,
    activeTool: 'pen',
    strokeColor: '#000000',
    fillColor: 'transparent',
    strokeWidth: 2,
    activeLayerIndex: 0,
    cursors: new Map(),
    canvasTransform: { scale: 1, translateX: 0, translateY: 0 },
    username: `User_${Math.random().toString(36).substr(2, 6)}`,
    currentUserId: CURRENT_USER_ID,

    permission: null,
    comments: [],
    permissionMessage: null,

    setBoard: (board) =>
      set({
        board,
        comments: Array.isArray(board.comments) ? board.comments : [],
      }),
    setActiveTool: (tool) => set({ activeTool: tool }),
    setStrokeColor: (color) => set({ strokeColor: color }),
    setFillColor: (color) => set({ fillColor: color }),
    setStrokeWidth: (width) => set({ strokeWidth: width }),
    setActiveLayerIndex: (index) => set({ activeLayerIndex: index }),

    addElement: (element) => {
      const { board, activeLayerIndex } = get();
      if (!board || !guardEdit()) return;
      const layers = [...board.layers];
      layers[activeLayerIndex] = {
        ...layers[activeLayerIndex],
        elements: [...layers[activeLayerIndex].elements, element],
      };
      set({ board: { ...board, layers } });
      socketService.drawElement(element, activeLayerIndex);
    },

    updateElement: (elementId, updates) => {
      const { board, activeLayerIndex } = get();
      if (!board || !guardEdit()) return;
      const layers = [...board.layers];
      const elements = layers[activeLayerIndex].elements.map((el) =>
        el.id === elementId ? { ...el, ...updates } : el
      );
      layers[activeLayerIndex] = { ...layers[activeLayerIndex], elements };
      set({ board: { ...board, layers } });
      socketService.updateElement(elementId, updates, activeLayerIndex);
    },

    deleteElement: (elementId) => {
      const { board, activeLayerIndex } = get();
      if (!board || !guardEdit()) return;
      const layers = [...board.layers];
      const elements = layers[activeLayerIndex].elements.filter((el) => el.id !== elementId);
      layers[activeLayerIndex] = { ...layers[activeLayerIndex], elements };
      set({ board: { ...board, layers } });
      socketService.deleteElement(elementId, activeLayerIndex);
    },

    addLayer: (name) => {
      const { board } = get();
      if (!board || !guardEdit()) return;
      const newLayer: Layer = {
        name,
        visible: true,
        locked: false,
        order: board.layers.length,
        elements: [],
      };
      const layers = [...board.layers, newLayer];
      set({ board: { ...board, layers }, activeLayerIndex: layers.length - 1 });
      socketService.updateLayers(layers);
    },

    toggleLayerVisibility: (index) => {
      const { board } = get();
      if (!board || !guardEdit()) return;
      const layers = [...board.layers];
      layers[index] = { ...layers[index], visible: !layers[index].visible };
      set({ board: { ...board, layers } });
      socketService.updateLayers(layers);
    },

    toggleLayerLock: (index) => {
      const { board } = get();
      if (!board || !guardEdit()) return;
      const layers = [...board.layers];
      layers[index] = { ...layers[index], locked: !layers[index].locked };
      set({ board: { ...board, layers } });
      socketService.updateLayers(layers);
    },

    // local=true means pan/zoom for a viewer: update view only, no broadcast.
    setCanvasTransform: (transform, local = false) => {
      set({ canvasTransform: transform });
      if (!local) socketService.canvasTransform(transform);
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
      cursorsList.forEach((c) => cursors.set(c.socketId, c));
      set({ cursors });
    },

    setUsername: (name) => set({ username: name }),

    setPermission: (permission) => set({ permission }),
    setMembers: (members) => {
      const { permission, board } = get();
      if (permission) set({ permission: { ...permission, members } });
      if (board) set({ board: { ...board, members } });
    },
    setComments: (comments) => set({ comments }),
    upsertComment: (comment) => {
      const exists = get().comments.some((c) => c._id === comment._id);
      if (exists) return;
      set({ comments: [...get().comments, comment] });
      const { board } = get();
      if (board) set({ board: { ...board, comments: get().comments } });
    },
    removeComment: (commentId) => {
      const comments = get().comments.filter((c) => c._id !== commentId);
      set({ comments });
      const { board } = get();
      if (board) set({ board: { ...board, comments } });
    },
    setPermissionMessage: (message) => set({ permissionMessage: message }),

    effectiveRole: () => get().permission?.role ?? 'unknown',
    canEdit: () => Boolean(get().permission?.canEdit),
    canComment: () => Boolean(get().permission?.canComment),
    isReadOnly: () => Boolean(get().permission?.readOnly),
  };
});

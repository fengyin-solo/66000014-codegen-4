import { io, Socket } from 'socket.io-client';
import { CursorPosition, BoardElement, Layer, CanvasTransform, BoardComment, BoardAccess, BoardMember } from '../types';

const SERVER_URL = '/';

export interface JoinPayload {
  boardId: string;
  userId: string;
  username: string;
}

class SocketService {
  private socket: Socket | null = null;
  private boardId: string | null = null;
  private userId: string | null = null;

  connect(): Socket {
    if (!this.socket) {
      this.socket = io(SERVER_URL, {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        timeout: 10000,
      });
    }
    this.socket.connect();
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.boardId = null;
    this.userId = null;
  }

  joinBoard(payload: JoinPayload): void {
    this.boardId = payload.boardId;
    this.userId = payload.userId;
    this.socket?.emit('join-board', payload);
  }

  getUserId(): string | null {
    return this.userId;
  }

  moveCursor(x: number, y: number): void {
    if (this.boardId) {
      this.socket?.emit('cursor-move', { boardId: this.boardId, x, y });
    }
  }

  drawElement(element: BoardElement, layerIndex: number): void {
    if (this.boardId) {
      this.socket?.emit('draw-element', { boardId: this.boardId, element, layerIndex, userId: this.userId });
    }
  }

  updateElement(elementId: string, updates: Partial<BoardElement>, layerIndex: number): void {
    if (this.boardId) {
      this.socket?.emit('update-element', { boardId: this.boardId, elementId, updates, layerIndex, userId: this.userId });
    }
  }

  deleteElement(elementId: string, layerIndex: number): void {
    if (this.boardId) {
      this.socket?.emit('delete-element', { boardId: this.boardId, elementId, layerIndex, userId: this.userId });
    }
  }

  addStickyNote(note: BoardElement, layerIndex: number): void {
    if (this.boardId) {
      this.socket?.emit('add-sticky-note', { boardId: this.boardId, note, layerIndex, userId: this.userId });
    }
  }

  addShape(shape: BoardElement, layerIndex: number): void {
    if (this.boardId) {
      this.socket?.emit('add-shape', { boardId: this.boardId, shape, layerIndex, userId: this.userId });
    }
  }

  updateLayers(layers: Layer[]): void {
    if (this.boardId) {
      this.socket?.emit('layer-update', { boardId: this.boardId, layers, userId: this.userId });
    }
  }

  addComment(x: number, y: number, text: string, ack?: (response: { ok: boolean; comment?: BoardComment; error?: string }) => void): void {
    if (this.boardId) {
      this.socket?.emit('comment-add', { boardId: this.boardId, x, y, text }, ack);
    }
  }

  canvasTransform(transform: CanvasTransform): void {
    if (this.boardId) {
      this.socket?.emit('canvas-transform', { boardId: this.boardId, transform });
    }
  }

  onBoardAccess(callback: (data: { boardId: string; access: BoardAccess; exists: boolean }) => void): void {
    this.socket?.on('board-access', callback);
  }

  onPermissionDenied(callback: (data: { action: string; message: string }) => void): void {
    this.socket?.on('permission-denied', callback);
  }

  onPermissionChanged(callback: (data: { boardId: string; userId: string; access: BoardAccess }) => void): void {
    this.socket?.on('permission-changed', callback);
  }

  onRemovedFromBoard(callback: (data: { boardId: string; userId: string }) => void): void {
    this.socket?.on('removed-from-board', callback);
  }

  onMembersChanged(callback: (data: { boardId: string; members: BoardMember[] }) => void): void {
    this.socket?.on('members-changed', callback);
  }

  onCommentsSync(callback: (data: { boardId: string; comments: BoardComment[] }) => void): void {
    this.socket?.on('comments-sync', callback);
  }

  onCommentAdded(callback: (data: { boardId: string; comment: BoardComment }) => void): void {
    this.socket?.on('comment-added', callback);
  }

  onUserJoined(callback: (data: { socketId: string; username: string; userId?: string }) => void): void {
    this.socket?.on('user-joined', callback);
  }

  onUserLeft(callback: (data: { socketId: string; username: string }) => void): void {
    this.socket?.on('user-left', callback);
  }

  onActiveUsers(callback: (users: CursorPosition[]) => void): void {
    this.socket?.on('active-users', callback);
  }

  onCursorUpdate(callback: (data: CursorPosition) => void): void {
    this.socket?.on('cursor-update', callback);
  }

  onElementAdded(callback: (data: { element: BoardElement; layerIndex: number }) => void): void {
    this.socket?.on('element-added', callback);
  }

  onElementUpdated(callback: (data: { elementId: string; updates: Partial<BoardElement>; layerIndex: number }) => void): void {
    this.socket?.on('element-updated', callback);
  }

  onElementDeleted(callback: (data: { elementId: string; layerIndex: number }) => void): void {
    this.socket?.on('element-deleted', callback);
  }

  onStickyNoteAdded(callback: (data: { note: BoardElement; layerIndex: number }) => void): void {
    this.socket?.on('sticky-note-added', callback);
  }

  onShapeAdded(callback: (data: { shape: BoardElement; layerIndex: number }) => void): void {
    this.socket?.on('shape-added', callback);
  }

  onLayersUpdated(callback: (data: { layers: Layer[] }) => void): void {
    this.socket?.on('layers-updated', callback);
  }

  onCanvasTransformed(callback: (data: { transform: CanvasTransform }) => void): void {
    this.socket?.on('canvas-transformed', callback);
  }

  off(event: string, callback?: (...args: unknown[]) => void): void {
    this.socket?.off(event, callback);
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();

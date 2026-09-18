export interface BoardElement {
  id: string;
  type: 'path' | 'rect' | 'circle' | 'text' | 'sticky-note' | 'line' | 'image';
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  text?: string;
  points?: number[];
  rotation?: number;
  opacity?: number;
}

export interface Layer {
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
  elements: BoardElement[];
}

export type MemberRole = 'viewer' | 'commenter' | 'editor';
export type MemberStatus = 'pending' | 'active' | 'removed';
export type AccessRole = 'owner' | MemberRole | 'none';

export interface BoardMember {
  userId: string;
  username?: string;
  role: MemberRole;
  status: MemberStatus;
  invitedAt?: string;
  respondedAt?: string | null;
}

export interface BoardComment {
  id: string;
  userId: string;
  username?: string;
  x: number;
  y: number;
  text: string;
  createdAt: string;
}

// The requester's resolved open mode, returned by the server with every board.
export interface BoardAccess {
  role: AccessRole;
  status: MemberStatus | 'none';
  canEdit: boolean;
  canComment: boolean;
  canManage: boolean;
}

export interface Board {
  _id: string;
  name: string;
  ownerId: string;
  collaborators: string[];
  members: BoardMember[];
  comments?: BoardComment[];
  access?: BoardAccess;
  layers: Layer[];
  width: number;
  height: number;
  backgroundColor: string;
  createdAt: string;
  updatedAt: string;
}

export type ViewType = 'dashboard' | 'board';

export interface CursorPosition {
  socketId: string;
  username: string;
  userId?: string;
  x: number;
  y: number;
}

export interface CanvasTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export type ToolType = 'select' | 'pen' | 'rect' | 'circle' | 'line' | 'text' | 'sticky-note' | 'eraser' | 'comment';

export interface Template {
  _id: string;
  name: string;
  description: string;
  category: string;
  thumbnail: string;
  icon: string;
  width: number;
  height: number;
  backgroundColor: string;
  layers?: Layer[];
}

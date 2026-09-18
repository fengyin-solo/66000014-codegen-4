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
export type MemberStatus = 'invited' | 'active' | 'removed';
export type EffectiveRole = 'owner' | MemberRole | 'removed' | 'unknown';

export interface BoardMember {
  userId: string;
  role: MemberRole;
  status: MemberStatus;
  invitedAt?: string;
  joinedAt?: string | null;
  removedAt?: string;
}

export interface BoardComment {
  _id: string;
  userId: string;
  username: string;
  text: string;
  x: number;
  y: number;
  resolved?: boolean;
  createdAt: string;
}

export interface AccessInfo {
  boardId: string;
  userId: string;
  role: EffectiveRole;
  roleLabel: string;
  canOpen: boolean;
  canEdit: boolean;
  canComment: boolean;
  readOnly: boolean;
  memberCount: number;
}

export interface PermissionState {
  boardId: string;
  userId: string;
  role: EffectiveRole;
  roleLabel: string;
  readOnly: boolean;
  canEdit: boolean;
  canComment: boolean;
  members: BoardMember[];
}

export interface Board {
  _id: string;
  name: string;
  ownerId: string;
  collaborators: string[];
  members?: BoardMember[];
  comments?: BoardComment[];
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
  x: number;
  y: number;
}

export interface CanvasTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export type ToolType = 'select' | 'pen' | 'rect' | 'circle' | 'line' | 'text' | 'sticky-note' | 'eraser';

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

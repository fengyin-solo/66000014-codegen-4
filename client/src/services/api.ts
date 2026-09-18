import { Board, BoardMember, BoardComment, MemberRole, Template } from '../types';

const API_BASE_URL = '/api/boards';
const TEMPLATE_API_URL = '/api/templates';

export interface InvitePayload {
  memberUserId: string;
  username?: string;
  role: MemberRole;
}

export const boardApi = {
  async getBoards(userId: string): Promise<Board[]> {
    const response = await fetch(`${API_BASE_URL}?userId=${encodeURIComponent(userId)}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch boards');
    }
    return response.json();
  },

  async getBoard(boardId: string, userId?: string): Promise<Board | null> {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const response = await fetch(`${API_BASE_URL}/${boardId}${qs}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch board');
    }
    return response.json();
  },

  async createBoard(data: { name: string; ownerId: string; width?: number; height?: number }): Promise<Board | null> {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create board');
    }
    return response.json();
  },

  async deleteBoard(boardId: string, userId: string): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/${boardId}?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' });
    return response.ok;
  },

  // ----- Member permission center -----

  async listMembers(boardId: string, userId: string): Promise<BoardMember[]> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/members?userId=${encodeURIComponent(userId)}`);
    if (!response.ok) throw new Error('Failed to load members');
    return response.json();
  },

  async inviteMember(boardId: string, userId: string, payload: InvitePayload): Promise<{ member: BoardMember; members: BoardMember[] }> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '邀请失败');
    return data;
  },

  async updateMemberRole(boardId: string, userId: string, memberUserId: string, role: MemberRole): Promise<{ member: BoardMember; members: BoardMember[] }> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/members/${memberUserId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '调整权限失败');
    return data;
  },

  async removeMember(boardId: string, userId: string, memberUserId: string): Promise<{ member: BoardMember; members: BoardMember[] }> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/members/${memberUserId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '移出成员失败');
    return data;
  },

  async acceptInvite(boardId: string, userId: string): Promise<Board> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/members/${userId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '接受邀请失败');
    return data.board;
  },

  // ----- Comments -----

  async listComments(boardId: string): Promise<BoardComment[]> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/comments`);
    if (!response.ok) return [];
    return response.json();
  },

  async createComment(boardId: string, data: { userId: string; username: string; x: number; y: number; text: string }): Promise<BoardComment> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '评论失败');
    return result;
  },

  getMockBoards(): Board[] {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 86400000 * 2).toISOString();
    const lastWeek = new Date(Date.now() - 86400000 * 7).toISOString();
    const layer = (): Board['layers'][number] => ({ name: '图层 1', visible: true, locked: false, order: 0, elements: [] });

    return [
      {
        _id: 'board-1',
        name: '产品需求评审',
        ownerId: 'user-1',
        collaborators: ['user-2', 'user-3'],
        members: [
          { userId: 'user-2', role: 'editor', status: 'active' },
          { userId: 'user-3', role: 'commenter', status: 'active' },
        ],
        comments: [],
        layers: [layer()],
        width: 3000,
        height: 2000,
        backgroundColor: '#f5f5f5',
        createdAt: lastWeek,
        updatedAt: now,
      },
      {
        _id: 'board-2',
        name: '架构设计讨论',
        ownerId: 'user-1',
        collaborators: ['user-4'],
        members: [{ userId: 'user-4', role: 'viewer', status: 'active' }],
        comments: [],
        layers: [layer()],
        width: 3000,
        height: 2000,
        backgroundColor: '#ffffff',
        createdAt: lastWeek,
        updatedAt: yesterday,
      },
      {
        _id: 'board-3',
        name: '用户旅程地图',
        ownerId: 'user-2',
        collaborators: ['user-1', 'user-5'],
        members: [{ userId: 'user-1', role: 'editor', status: 'active' }],
        comments: [],
        layers: [layer()],
        width: 3000,
        height: 2000,
        backgroundColor: '#f0f8ff',
        createdAt: lastWeek,
        updatedAt: twoDaysAgo,
      },
      {
        _id: 'board-4',
        name: '团队脑暴会',
        ownerId: 'user-3',
        collaborators: ['user-1'],
        members: [{ userId: 'user-1', role: 'editor', status: 'active' }],
        comments: [],
        layers: [layer()],
        width: 3000,
        height: 2000,
        backgroundColor: '#fff8e1',
        createdAt: lastWeek,
        updatedAt: lastWeek,
      },
    ];
  },

  createMockBoard(data: { name: string; ownerId: string }): Board {
    const now = new Date().toISOString();
    return {
      _id: `board-${Date.now()}`,
      name: data.name,
      ownerId: data.ownerId,
      collaborators: [],
      members: [],
      comments: [],
      layers: [{ name: '图层 1', visible: true, locked: false, order: 0, elements: [] }],
      width: 3000,
      height: 2000,
      backgroundColor: '#ffffff',
      createdAt: now,
      updatedAt: now,
    };
  },
};

export const templateApi = {
  async getTemplates(): Promise<Template[]> {
    const response = await fetch(TEMPLATE_API_URL);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch templates');
    }
    return response.json();
  },

  async getTemplate(templateId: string): Promise<Template | null> {
    const response = await fetch(`${TEMPLATE_API_URL}/${templateId}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch template');
    }
    return response.json();
  },

  async createBoardFromTemplate(
    templateId: string,
    data: { name: string; ownerId: string }
  ): Promise<Board | null> {
    const response = await fetch(`${TEMPLATE_API_URL}/${templateId}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create board from template');
    }
    return response.json();
  },
};

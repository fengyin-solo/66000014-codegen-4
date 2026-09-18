import { Board, Template, BoardMember, BoardComment, AccessInfo, MemberRole } from '../types';

const API_BASE_URL = '/api/boards';
const TEMPLATE_API_URL = '/api/templates';

async function parseError(response: Response): Promise<Error> {
  const errorData = await response.json().catch(() => ({}));
  return new Error(errorData.error || `Request failed (${response.status})`);
}

export const boardApi = {
  async getBoards(userId: string): Promise<Board[]> {
    const response = await fetch(`${API_BASE_URL}?userId=${encodeURIComponent(userId)}`);
    if (!response.ok) throw parseError(response);
    return response.json();
  },

  async getBoard(boardId: string): Promise<Board | null> {
    const response = await fetch(`${API_BASE_URL}/${boardId}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw parseError(response);
    }
    return response.json();
  },

  async createBoard(data: { name: string; ownerId: string; width?: number; height?: number }): Promise<Board | null> {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw parseError(response);
    return response.json();
  },

  async deleteBoard(boardId: string): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/${boardId}`, { method: 'DELETE' });
    return response.ok;
  },

  // ---- Permission center ----

  async getAccess(boardId: string, userId: string): Promise<AccessInfo> {
    const response = await fetch(
      `${API_BASE_URL}/${boardId}/access?userId=${encodeURIComponent(userId)}`
    );
    if (!response.ok) throw parseError(response);
    return response.json();
  },

  // Idempotent: duplicates and pending invitations never create extra records.
  async inviteMembers(
    boardId: string,
    ownerId: string,
    members: { userId: string; role: MemberRole }[]
  ): Promise<{ members: BoardMember[]; invited: unknown[] }> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/members/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId, members }),
    });
    if (!response.ok) throw parseError(response);
    return response.json();
  },

  async updateMemberRole(
    boardId: string,
    targetUserId: string,
    ownerId: string,
    role: MemberRole
  ): Promise<{ members: BoardMember[] }> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/members/${encodeURIComponent(targetUserId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId, role }),
    });
    if (!response.ok) throw parseError(response);
    return response.json();
  },

  async removeMember(
    boardId: string,
    targetUserId: string,
    ownerId: string
  ): Promise<{ members: BoardMember[] }> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/members/${encodeURIComponent(targetUserId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId }),
    });
    if (!response.ok) throw parseError(response);
    return response.json();
  },

  // ---- Comments ----

  async addComment(
    boardId: string,
    data: { userId: string; username: string; text: string; x: number; y: number }
  ): Promise<{ comment: BoardComment; comments: BoardComment[] }> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw parseError(response);
    return response.json();
  },

  async deleteComment(
    boardId: string,
    commentId: string,
    userId: string
  ): Promise<{ comments: BoardComment[] }> {
    const response = await fetch(`${API_BASE_URL}/${boardId}/comments/${encodeURIComponent(commentId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) throw parseError(response);
    return response.json();
  },
};

export const templateApi = {
  async getTemplates(): Promise<Template[]> {
    const response = await fetch(TEMPLATE_API_URL);
    if (!response.ok) throw parseError(response);
    return response.json();
  },

  async getTemplate(templateId: string): Promise<Template | null> {
    const response = await fetch(`${TEMPLATE_API_URL}/${templateId}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw parseError(response);
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
    if (!response.ok) throw parseError(response);
    return response.json();
  },
};

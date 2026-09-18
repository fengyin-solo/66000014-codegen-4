import React, { useState, useEffect, useCallback } from 'react';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { CursorOverlay } from './components/CursorOverlay';
import { Dashboard } from './components/Dashboard';
import { PermissionCenter } from './components/PermissionCenter';
import { CommentPanel } from './components/CommentPanel';
import { useWhiteboardStore } from './store/whiteboard';
import { socketService } from './services/socket';
import { boardApi } from './services/api';
import {
  Board,
  BoardElement,
  CursorPosition,
  Layer,
  CanvasTransform,
  ViewType,
} from './types';

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  owner: { label: '创建者', color: '#6d28d9', bg: '#ede9fe' },
  editor: { label: '可编辑', color: '#1d4ed8', bg: '#dbeafe' },
  commenter: { label: '可评论', color: '#b45309', bg: '#fef3c7' },
  viewer: { label: '只读', color: '#6b7280', bg: '#f3f4f6' },
  removed: { label: '已移出 · 只读', color: '#b91c1c', bg: '#fee2e2' },
  unknown: { label: '访客 · 只读', color: '#6b7280', bg: '#f3f4f6' },
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [boardMembers, setBoardMembers] = useState<Board['members'] | undefined>(undefined);
  const {
    setBoard,
    updateCursor,
    removeCursor,
    setCursors,
    username,
    currentUserId,
    permission,
    setPermission,
    setMembers,
    upsertComment,
    removeComment,
    permissionMessage,
    setPermissionMessage,
    comments,
  } = useWhiteboardStore();

  useEffect(() => {
    if (currentView === 'board' && activeBoard) {
      setBoard(activeBoard);
      setBoardMembers(activeBoard.members);

      socketService.connect();
      socketService.joinBoard(activeBoard._id, username, currentUserId);

      socketService.onBoardError((data) => {
        console.warn('[Board]', data.message);
      });

      // Server resolves how the board opens for this user.
      socketService.onPermissionState((state) => {
        setPermission(state);
        setMembers(state.members);
        setBoardMembers(state.members);
      });

      socketService.onPermissionDenied((data) => {
        setPermissionMessage(data.message);
        window.setTimeout(() => setPermissionMessage(null), 2500);
      });

      // Permission changes (invite/role/remove) update the open board live.
      socketService.onMembersChanged(({ boardId, members: nextMembers }) => {
        if (boardId !== activeBoard._id) return;
        setMembers(nextMembers);
        setBoardMembers(nextMembers);
      });

      socketService.onUserJoined((data) => {
        console.log(`${data.username} 加入了白板`);
      });
      socketService.onUserLeft((data) => {
        removeCursor(data.socketId);
      });
      socketService.onActiveUsers((users) => {
        setCursors(users);
      });
      socketService.onCursorUpdate((data: CursorPosition) => {
        updateCursor(data);
      });

      const appendElement = (layerIndex: number, element: BoardElement) => {
        const { board: currentBoard } = useWhiteboardStore.getState();
        if (!currentBoard || !currentBoard.layers[layerIndex]) return;
        const layers = [...currentBoard.layers];
        layers[layerIndex] = {
          ...layers[layerIndex],
          elements: [...layers[layerIndex].elements, element],
        };
        setBoard({ ...currentBoard, layers });
      };

      socketService.onElementAdded((data) => appendElement(data.layerIndex, data.element));
      socketService.onStickyNoteAdded((data) => appendElement(data.layerIndex, data.note));
      socketService.onShapeAdded((data) => appendElement(data.layerIndex, data.shape));

      socketService.onElementUpdated((data) => {
        const { board: currentBoard } = useWhiteboardStore.getState();
        if (!currentBoard || !currentBoard.layers[data.layerIndex]) return;
        const layers = [...currentBoard.layers];
        layers[data.layerIndex] = {
          ...layers[data.layerIndex],
          elements: layers[data.layerIndex].elements.map((el) =>
            el.id === data.elementId ? { ...el, ...data.updates } : el
          ),
        };
        setBoard({ ...currentBoard, layers });
      });

      socketService.onElementDeleted((data) => {
        const { board: currentBoard } = useWhiteboardStore.getState();
        if (!currentBoard || !currentBoard.layers[data.layerIndex]) return;
        const layers = [...currentBoard.layers];
        layers[data.layerIndex] = {
          ...layers[data.layerIndex],
          elements: layers[data.layerIndex].elements.filter((el) => el.id !== data.elementId),
        };
        setBoard({ ...currentBoard, layers });
      });

      socketService.onLayersUpdated((data: { layers: Layer[] }) => {
        const { board: currentBoard } = useWhiteboardStore.getState();
        if (currentBoard) setBoard({ ...currentBoard, layers: data.layers });
      });

      socketService.onCanvasTransformed((data: { transform: CanvasTransform }) => {
        // Only editors follow each other's viewport; viewers keep their own.
        if (useWhiteboardStore.getState().canEdit()) {
          useWhiteboardStore.getState().setCanvasTransform(data.transform, true);
        }
      });

      socketService.onCommentAdded((data) => {
        if (data.boardId && data.boardId !== activeBoard._id) return;
        upsertComment(data.comment);
      });
      socketService.onCommentDeleted((data) => {
        if (data.boardId && data.boardId !== activeBoard._id) return;
        removeComment(data.commentId);
      });

      return () => {
        socketService.disconnect();
        setPermission(null);
        setPermissionMessage(null);
      };
    }
  }, [currentView, activeBoard, username, currentUserId, setBoard, setCursors, setMembers, setPermission, setPermissionMessage, removeComment, removeCursor, updateCursor, upsertComment]);

  const handleBoardSelect = useCallback(async (boardItem: Board) => {
    // Re-fetch so the client sees the latest members/comments before opening.
    try {
      const fresh = await boardApi.getBoard(boardItem._id);
      setActiveBoard(fresh || boardItem);
    } catch {
      setActiveBoard(boardItem);
    }
    setCurrentView('board');
  }, []);

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setActiveBoard(null);
    setPermissionOpen(false);
    setCommentsOpen(false);
  };

  if (currentView === 'dashboard') {
    return <Dashboard onBoardSelect={handleBoardSelect} />;
  }

  const role = permission?.role ?? 'unknown';
  const badge = ROLE_BADGE[role] || ROLE_BADGE.unknown;
  const isOwner = role === 'owner' || activeBoard?.ownerId === currentUserId;
  const isRemoved = role === 'removed';
  const uninvited = role === 'unknown';

  const readOnlyNotice = isRemoved
    ? '你已被移出该画板，当前只能以只读方式查看内容。如需恢复协作，请联系画板创建者重新邀请。'
    : uninvited
      ? '你尚未被邀请加入该画板，当前为访客只读模式，不能评论或修改任何内容。'
      : role === 'viewer'
        ? '你当前拥有「查看」权限：可以浏览和缩放画板，但不能评论或修改内容。'
        : role === 'commenter'
          ? '你当前拥有「评论」权限：可以浏览并发表评论，但不能修改画板内容。'
          : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <div
        style={{
          height: '48px',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleBackToDashboard}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 500,
            color: '#374151',
            background: '#f3f4f6',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          返回工作台
        </button>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
          {activeBoard?.name}
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setCommentsOpen((v) => !v)}
          title="评论"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 500,
            color: commentsOpen ? '#fff' : '#374151',
            background: commentsOpen ? '#667eea' : '#f3f4f6',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          💬 评论
          {comments.length > 0 && (
            <span
              style={{
                background: commentsOpen ? '#fff' : '#667eea',
                color: commentsOpen ? '#667eea' : '#fff',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 700,
                padding: '0 6px',
                lineHeight: '16px',
              }}
            >
              {comments.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setPermissionOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 500,
            color: isOwner ? '#fff' : '#374151',
            background: isOwner ? '#667eea' : '#f3f4f6',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          title={isOwner ? '管理成员权限' : '查看成员'}
        >
          👥 成员权限
        </button>

        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: badge.color,
            background: badge.bg,
            padding: '4px 10px',
            borderRadius: '12px',
          }}
        >
          {badge.label}
        </span>
      </div>

      {readOnlyNotice && (
        <div
          style={{
            padding: '8px 16px',
            fontSize: '12px',
            color: isRemoved ? '#b91c1c' : '#374151',
            background: isRemoved ? '#fee2e2' : '#fffbeb',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <span>{isRemoved ? '⛔' : '🔒'}</span>
          <span>{readOnlyNotice}</span>
        </div>
      )}

      {permissionMessage && (
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1500,
            background: '#111827',
            color: '#fff',
            fontSize: '13px',
            padding: '8px 16px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          {permissionMessage}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', padding: 12, gap: 12 }}>
        <Toolbar />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: '8px' }}>
          <WhiteboardCanvas />
          <CursorOverlay />
        </div>
        {commentsOpen && <CommentPanel onClose={() => setCommentsOpen(false)} />}
        <LayerPanel />
      </div>

      {activeBoard && (
        <PermissionCenter
          board={{ ...activeBoard, members: boardMembers }}
          isOpen={permissionOpen}
          onClose={() => setPermissionOpen(false)}
        />
      )}
    </div>
  );
};

export default App;

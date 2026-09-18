import React, { useState, useEffect, useCallback } from 'react';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { CursorOverlay } from './components/CursorOverlay';
import { CommentLayer } from './components/CommentLayer';
import { AccessNotice } from './components/AccessNotice';
import { PermissionCenter } from './components/PermissionCenter';
import { Dashboard } from './components/Dashboard';
import { useWhiteboardStore } from './store/whiteboard';
import { socketService } from './services/socket';
import { boardApi } from './services/api';
import { Board, BoardElement, CursorPosition, Layer, CanvasTransform, ViewType, BoardAccess, BoardComment, BoardMember } from './types';

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  owner: { label: '所有者', color: '#667eea' },
  editor: { label: '编辑者', color: '#15803d' },
  commenter: { label: '评论者', color: '#b45309' },
  viewer: { label: '查看者', color: '#6b7280' },
  none: { label: '访客', color: '#9ca3af' },
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const {
    board, access, setBoard, updateCursor, removeCursor, setCursors, setAccess,
    setComments, addCommentToState, setMembers,
    username, currentUserId
  } = useWhiteboardStore();

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    if (currentView === 'board' && activeBoard) {
      setBoard(activeBoard);

      socketService.connect();
      socketService.joinBoard({ boardId: activeBoard._id, userId: currentUserId, username });

      socketService.onBoardAccess(({ access, exists }) => {
        if (!exists) {
          showToast('画板不存在或已被删除');
          return;
        }
        setAccess(access);
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
      socketService.onElementAdded((data: { element: BoardElement; layerIndex: number }) => {
        const { board: currentBoard } = useWhiteboardStore.getState();
        if (currentBoard && currentBoard.layers[data.layerIndex]) {
          // Reflect remote edits for every open mode (editors and read-only).
          const layers = [...currentBoard.layers];
          layers[data.layerIndex] = {
            ...layers[data.layerIndex],
            elements: [...layers[data.layerIndex].elements, data.element]
          };
          setBoard({ ...currentBoard, layers });
        }
      });
      socketService.onLayersUpdated((data: { layers: Layer[] }) => {
        const { board: currentBoard } = useWhiteboardStore.getState();
        if (currentBoard) {
          setBoard({ ...currentBoard, layers: data.layers });
        }
      });
      socketService.onCanvasTransformed((data: { transform: CanvasTransform }) => {
        useWhiteboardStore.getState().setCanvasTransform(data.transform);
      });

      // Comments
      socketService.onCommentsSync((data: { comments: BoardComment[] }) => {
        setComments(data.comments || []);
      });
      socketService.onCommentAdded((data: { comment: BoardComment }) => {
        addCommentToState(data.comment);
      });

      // Live permission changes pushed by the creator from the permission center.
      socketService.onPermissionChanged(({ userId, access: nextAccess }) => {
        const { currentUserId: me } = useWhiteboardStore.getState();
        if (userId === me) {
          setAccess(nextAccess);
          const { board: b } = useWhiteboardStore.getState();
          if (b && nextAccess.status === 'removed') {
            showToast('你的协作权限已变更，当前为只读模式');
          } else {
            showToast('你的画板权限已更新');
          }
        }
      });

      socketService.onRemovedFromBoard(({ userId }) => {
        const { currentUserId: me } = useWhiteboardStore.getState();
        if (userId === me) {
          const viewerAccess: BoardAccess = {
            role: 'viewer', status: 'removed',
            canEdit: false, canComment: false, canManage: false,
          };
          setAccess(viewerAccess);
          showToast('你已被移出该画板，切换为只读模式');
        }
      });

      socketService.onMembersChanged(({ members }) => {
        setMembers(members);
      });

      socketService.onPermissionDenied(({ message }) => {
        showToast(message);
      });

      return () => {
        socketService.disconnect();
      };
    }
  }, [currentView, activeBoard, currentUserId, username]);

  const handleBoardSelect = (boardItem: Board) => {
    setActiveBoard(boardItem);
    setCurrentView('board');
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setActiveBoard(null);
    setPermissionOpen(false);
  };

  const handleAcceptInvite = async () => {
    if (!activeBoard) return;
    setAcceptingInvite(true);
    try {
      const updated = await boardApi.acceptInvite(activeBoard._id, currentUserId);
      setActiveBoard(updated);
      setBoard(updated);
      showToast('已接受邀请，开始协作吧');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '接受邀请失败');
    } finally {
      setAcceptingInvite(false);
    }
  };

  const handleMembersChange = (members: BoardMember[]) => {
    setMembers(members);
    if (activeBoard) {
      setActiveBoard({ ...activeBoard, members });
    }
  };

  if (currentView === 'dashboard') {
    return <Dashboard onBoardSelect={handleBoardSelect} />;
  }

  const badge = ROLE_BADGE[access.role] || ROLE_BADGE.none;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <div style={{
        height: '48px',
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '12px',
      }}>
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
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#e5e7eb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#f3f4f6';
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

        {/* Current open mode */}
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          color: badge.color,
          background: `${badge.color}18`,
          border: `1px solid ${badge.color}40`,
          padding: '2px 10px',
          borderRadius: '10px',
        }}>
          {badge.label}
          {access.status === 'removed' ? '·已移出' : access.status === 'pending' ? '·待接受' : ''}
        </span>

        <div style={{ flex: 1 }} />

        {/* Member permission center entry (creator only) */}
        {access.canManage && (
          <button
            onClick={() => setPermissionOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#fff',
              background: '#667eea',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            成员权限
          </button>
        )}
      </div>

      {/* Read-only / pending explanation banner */}
      {!access.canEdit && (
        <AccessNotice
          access={access}
          onAcceptInvite={handleAcceptInvite}
          accepting={acceptingInvite}
        />
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <WhiteboardCanvas />
          <CommentLayer />
          <CursorOverlay />
        </div>
        <LayerPanel />
      </div>

      {activeBoard && (
        <PermissionCenter
          board={board || activeBoard}
          currentUserId={currentUserId}
          isOpen={permissionOpen}
          onClose={() => setPermissionOpen(false)}
          onMembersChange={handleMembersChange}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(17,24,39,0.92)',
          color: '#fff',
          padding: '10px 18px',
          borderRadius: '8px',
          fontSize: '13px',
          zIndex: 3000,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
};

export default App;

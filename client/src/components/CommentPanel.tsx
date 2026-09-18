import React, { useState } from 'react';
import { useWhiteboardStore } from '../store/whiteboard';
import { boardApi } from '../services/api';
import { socketService } from '../services/socket';

interface CommentPanelProps {
  onClose: () => void;
}

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
};

export const CommentPanel: React.FC<CommentPanelProps> = ({ onClose }) => {
  const {
    board,
    comments,
    currentUserId,
    username,
    canComment,
    upsertComment,
    removeComment,
  } = useWhiteboardStore();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = canComment();

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || !board || submitting) return;
    if (!allowed) {
      setError('当前权限不能发表评论');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Comments attach to board coordinates near the visible center.
      const { canvasTransform } = useWhiteboardStore.getState();
      const x = (400 - canvasTransform.translateX) / canvasTransform.scale;
      const y = (160 - canvasTransform.translateY) / canvasTransform.scale;
      const { comment } = await boardApi.addComment(board._id, {
        userId: currentUserId,
        username,
        text: trimmed,
        x,
        y,
      });
      upsertComment(comment);
      socketService.broadcastComment(comment);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '发表评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!board) return;
    try {
      await boardApi.deleteComment(board._id, commentId, currentUserId);
      removeComment(commentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除评论失败');
    }
  };

  return (
    <div
      style={{
        width: '260px',
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxHeight: '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px' }}>评论 ({comments.length})</h3>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', color: '#6b7280' }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {comments.length === 0 && (
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
            {allowed ? '还没有评论，留下第一条吧。' : '还没有评论。'}
          </div>
        )}
        {comments.map((comment) => {
          const mine = comment.userId === currentUserId;
          const isOwner = board?.ownerId === currentUserId;
          return (
            <div
              key={comment._id}
              style={{
                background: mine ? '#eef2ff' : '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px 10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#4338ca' }}>
                  {comment.username || comment.userId}
                </span>
                <span style={{ fontSize: '10px', color: '#9ca3af' }}>{formatTime(comment.createdAt)}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#1f2937', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {comment.text}
              </div>
              {(mine || isOwner) && (
                <button
                  onClick={() => handleDelete(comment._id)}
                  style={{
                    marginTop: '4px',
                    border: 'none',
                    background: 'transparent',
                    color: '#dc2626',
                    fontSize: '11px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  删除
                </button>
              )}
            </div>
          );
        })}
      </div>

      {allowed ? (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="写下你的评论…"
            rows={3}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontSize: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              padding: '8px',
              resize: 'none',
              fontFamily: 'inherit',
            }}
          />
          {error && <div style={{ color: '#dc2626', fontSize: '11px', marginTop: '4px' }}>{error}</div>}
          <button
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            style={{
              marginTop: '6px',
              width: '100%',
              padding: '7px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#fff',
              background: '#667eea',
              border: 'none',
              borderRadius: '6px',
              cursor: submitting || !text.trim() ? 'not-allowed' : 'pointer',
              opacity: submitting || !text.trim() ? 0.6 : 1,
            }}
          >
            {submitting ? '发送中…' : '发表评论'}
          </button>
        </div>
      ) : (
        <div
          style={{
            fontSize: '11px',
            color: '#6b7280',
            background: '#f3f4f6',
            borderRadius: '6px',
            padding: '8px',
          }}
        >
          你当前为查看权限，仅可阅读评论，不能发表。
        </div>
      )}
    </div>
  );
};

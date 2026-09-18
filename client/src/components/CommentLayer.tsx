import React, { useRef, useState, useCallback } from 'react';
import { useWhiteboardStore } from '../store/whiteboard';
import { socketService } from '../services/socket';
import { BoardComment } from '../types';

interface DraftComment {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
}

export const CommentLayer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { comments, canvasTransform, activeTool, access, username } = useWhiteboardStore();
  const [draft, setDraft] = useState<DraftComment | null>(null);
  const [draftText, setDraftText] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);

  const canPlace = activeTool === 'comment' && access.canComment;

  const toBoardPoint = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, screenX: 0, screenY: 0 };
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
      x: (screenX - canvasTransform.translateX) / canvasTransform.scale,
      y: (screenY - canvasTransform.translateY) / canvasTransform.scale,
      screenX,
      screenY,
    };
  }, [canvasTransform]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canPlace) return;
    const point = toBoardPoint(e.clientX, e.clientY);
    setDraft(point);
    setDraftText('');
    setOpenId(null);
  };

  const submit = () => {
    const text = draftText.trim();
    if (!draft || !text) {
      setDraft(null);
      return;
    }
    socketService.addComment(draft.x, draft.y, text, (res) => {
      if (!res.ok) {
        setDenied(res.error === 'forbidden' ? '当前权限不能发表评论' : '评论失败');
        window.setTimeout(() => setDenied(null), 2500);
      }
    });
    setDraft(null);
    setDraftText('');
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 900,
        pointerEvents: canPlace ? 'auto' : 'none',
        cursor: canPlace ? 'crosshair' : 'default',
      }}
    >
      {comments.map((comment: BoardComment) => {
        const left = comment.x * canvasTransform.scale + canvasTransform.translateX;
        const top = comment.y * canvasTransform.scale + canvasTransform.translateY;
        const isOpen = openId === comment.id;
        return (
          <div
            key={comment.id}
            onClick={(e) => {
              if (!canPlace) {
                // Viewers still need to read comments; re-enable hit targeting.
                e.stopPropagation();
                setOpenId(isOpen ? null : comment.id);
              } else {
                e.stopPropagation();
                setOpenId(isOpen ? null : comment.id);
              }
            }}
            style={{
              position: 'absolute',
              left,
              top,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              zIndex: isOpen ? 950 : 900,
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: '#f59e0b',
                border: '2px solid #fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                color: '#fff',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              💬
            </div>
            {isOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '28px',
                  left: '0',
                  width: '220px',
                  background: '#fff',
                  borderRadius: '8px',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                  padding: '10px 12px',
                  cursor: 'default',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#b45309', marginBottom: '4px' }}>
                  {comment.username || comment.userId}
                </div>
                <div style={{ fontSize: '13px', color: '#1f2937', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {comment.text}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {draft && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: draft.screenX,
            top: draft.screenY,
            transform: 'translate(8px, 8px)',
            zIndex: 1000,
            width: '240px',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
            padding: '10px',
          }}
        >
          <textarea
            autoFocus
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder={`以 ${username} 的身份发表评论…`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape') {
                setDraft(null);
              }
            }}
            style={{
              width: '100%',
              minHeight: '64px',
              boxSizing: 'border-box',
              border: '1px solid #fcd34d',
              borderRadius: '6px',
              padding: '8px',
              fontSize: '13px',
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button onClick={() => setDraft(null)} style={{ border: 'none', background: '#f3f4f6', borderRadius: '5px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>取消</button>
            <button onClick={submit} style={{ border: 'none', background: '#f59e0b', color: '#fff', borderRadius: '5px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>评论</button>
          </div>
        </div>
      )}

      {denied && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: '#b91c1c', color: '#fff', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', pointerEvents: 'none' }}>
          {denied}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { useWhiteboardStore, isToolAllowed } from '../store/whiteboard';
import { ToolType } from '../types';

const tools: { type: ToolType; label: string; icon: string }[] = [
  { type: 'select', label: '选择', icon: '👆' },
  { type: 'pen', label: '画笔', icon: '✏️' },
  { type: 'rect', label: '矩形', icon: '⬜' },
  { type: 'circle', label: '圆形', icon: '⭕' },
  { type: 'line', label: '直线', icon: '📏' },
  { type: 'text', label: '文本', icon: '🔤' },
  { type: 'sticky-note', label: '便签', icon: '📝' },
  { type: 'eraser', label: '橡皮', icon: '🧹' },
  { type: 'comment', label: '评论', icon: '💬' },
];

export const Toolbar: React.FC = () => {
  const { activeTool, setActiveTool, strokeColor, setStrokeColor, fillColor, setFillColor, strokeWidth, setStrokeWidth, access } = useWhiteboardStore();

  const showStyleControls = access.canEdit;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '8px',
      padding: '12px', background: '#fff', borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)', width: '60px', alignItems: 'center'
    }}>
      {tools.map(tool => {
        const allowed = isToolAllowed(tool.type, access);
        const active = activeTool === tool.type;
        return (
          <button
            key={tool.type}
            onClick={() => {
              if (!allowed) return;
              setActiveTool(allowed ? tool.type : 'select');
            }}
            title={allowed ? tool.label : `${tool.label}（当前权限不可用）`}
            disabled={!allowed}
            style={{
              width: '40px', height: '40px', border: 'none', borderRadius: '6px',
              background: active ? (tool.type === 'comment' ? '#fef3c7' : '#e3f2fd') : 'transparent',
              cursor: allowed ? 'pointer' : 'not-allowed',
              fontSize: '18px', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              opacity: allowed ? 1 : 0.35,
              position: 'relative',
            }}
          >
            {tool.icon}
            {!allowed && tool.type !== 'select' && (
              <span style={{ position: 'absolute', right: 2, bottom: 2, fontSize: '8px' }}>🔒</span>
            )}
          </button>
        );
      })}
      <div style={{ width: '100%', height: '1px', background: '#ddd' }} />
      {showStyleControls ? (
        <>
          <label title="描边颜色">
            <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)}
              style={{ width: '32px', height: '32px', border: 'none', cursor: 'pointer' }} />
          </label>
          <label title="填充颜色">
            <input type="color" value={fillColor === 'transparent' ? '#ffffff' : fillColor}
              onChange={e => setFillColor(e.target.value)}
              style={{ width: '32px', height: '32px', border: 'none', cursor: 'pointer' }} />
          </label>
          <input type="range" min="1" max="20" value={strokeWidth}
            onChange={e => setStrokeWidth(Number(e.target.value))}
            title={`线宽: ${strokeWidth}`}
            style={{ width: '40px' }} />
        </>
      ) : (
        <div title="样式设置仅编辑者可用" style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center', lineHeight: 1.4 }}>
          只读
        </div>
      )}
    </div>
  );
};

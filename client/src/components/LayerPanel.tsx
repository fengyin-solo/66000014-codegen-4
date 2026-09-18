import React from 'react';
import { useWhiteboardStore } from '../store/whiteboard';

export const LayerPanel: React.FC = () => {
  const {
    board,
    activeLayerIndex,
    setActiveLayerIndex,
    toggleLayerVisibility,
    toggleLayerLock,
    addLayer,
    canEdit,
  } = useWhiteboardStore();

  if (!board) return null;
  const editable = canEdit();

  return (
    <div
      style={{
        width: '220px',
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        opacity: editable ? 1 : 0.8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px' }}>图层</h3>
        <button
          onClick={() => editable && addLayer(`图层 ${board.layers.length + 1}`)}
          disabled={!editable}
          title={editable ? '新建图层' : '只读模式下不可用'}
          style={{
            border: 'none',
            background: editable ? '#4472C4' : '#9ca3af',
            color: '#fff',
            borderRadius: '4px',
            padding: '4px 8px',
            cursor: editable ? 'pointer' : 'not-allowed',
            fontSize: '12px',
          }}
        >
          + 新建
        </button>
      </div>
      {board.layers.map((layer, index) => (
        <div
          key={index}
          onClick={() => setActiveLayerIndex(index)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px',
            borderRadius: '4px',
            cursor: 'pointer',
            background: index === activeLayerIndex ? '#e3f2fd' : '#f5f5f5',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (editable) toggleLayerVisibility(index);
            }}
            disabled={!editable}
            title={editable ? '切换可见性' : '只读模式下不可用'}
            style={{ border: 'none', background: 'none', cursor: editable ? 'pointer' : 'not-allowed', fontSize: '14px' }}
          >
            {layer.visible ? '👁' : '🚫'}
          </button>
          <span style={{ flex: 1, fontSize: '13px' }}>{layer.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (editable) toggleLayerLock(index);
            }}
            disabled={!editable}
            title={editable ? '切换锁定' : '只读模式下不可用'}
            style={{ border: 'none', background: 'none', cursor: editable ? 'pointer' : 'not-allowed', fontSize: '14px' }}
          >
            {layer.locked ? '🔒' : '🔓'}
          </button>
          <span style={{ fontSize: '11px', color: '#888' }}>{layer.elements.length}</span>
        </div>
      ))}
    </div>
  );
};

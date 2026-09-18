import React from 'react';
import { useWhiteboardStore } from '../store/whiteboard';

export const LayerPanel: React.FC = () => {
  const { board, activeLayerIndex, setActiveLayerIndex, toggleLayerVisibility, toggleLayerLock, addLayer, access } = useWhiteboardStore();

  if (!board) return null;
  const canEdit = access.canEdit;

  return (
    <div style={{
      width: '220px', background: '#fff', borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: '12px',
      display: 'flex', flexDirection: 'column', gap: '8px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px' }}>图层</h3>
        {canEdit ? (
          <button onClick={() => addLayer(`图层 ${board.layers.length + 1}`)}
            style={{ border: 'none', background: '#4472C4', color: '#fff', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}>
            + 新建
          </button>
        ) : (
          <span title="只读模式下不可管理图层" style={{ fontSize: '10px', color: '#9ca3af' }}>🔒 只读</span>
        )}
      </div>
      {board.layers.map((layer, index) => (
        <div key={index}
          onClick={() => setActiveLayerIndex(index)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px', borderRadius: '4px', cursor: 'pointer',
            background: index === activeLayerIndex ? '#e3f2fd' : '#f5f5f5'
          }}>
          <button
            onClick={(e) => { e.stopPropagation(); if (canEdit) toggleLayerVisibility(index); }}
            disabled={!canEdit}
            title={canEdit ? undefined : '只读模式'}
            style={{ border: 'none', background: 'none', cursor: canEdit ? 'pointer' : 'not-allowed', fontSize: '14px', opacity: canEdit ? 1 : 0.5 }}>
            {layer.visible ? '👁' : '🚫'}
          </button>
          <span style={{ flex: 1, fontSize: '13px' }}>{layer.name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); if (canEdit) toggleLayerLock(index); }}
            disabled={!canEdit}
            title={canEdit ? undefined : '只读模式'}
            style={{ border: 'none', background: 'none', cursor: canEdit ? 'pointer' : 'not-allowed', fontSize: '14px', opacity: canEdit ? 1 : 0.5 }}>
            {layer.locked ? '🔒' : '🔓'}
          </button>
          <span style={{ fontSize: '11px', color: '#888' }}>{layer.elements.length}</span>
        </div>
      ))}
    </div>
  );
};

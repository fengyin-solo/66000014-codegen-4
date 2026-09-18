import React, { useEffect, useMemo, useState } from 'react';
import { Board, BoardMember, MemberRole } from '../types';
import { boardApi } from '../services/api';
import { useWhiteboardStore } from '../store/whiteboard';

interface PermissionCenterProps {
  board: Board;
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_OPTIONS: { value: MemberRole; label: string; hint: string; icon: string }[] = [
  { value: 'viewer', label: '查看', hint: '只能浏览，不能评论或改动内容', icon: '👁' },
  { value: 'commenter', label: '评论', hint: '可浏览并发表评论，不能改动画板内容', icon: '💬' },
  { value: 'editor', label: '编辑', hint: '可自由绘图、添加便签与图层', icon: '✏️' },
];

const ROLE_META: Record<MemberRole, { label: string; color: string; bg: string }> = {
  viewer: { label: '查看', color: '#6b7280', bg: '#f3f4f6' },
  commenter: { label: '评论', color: '#b45309', bg: '#fef3c7' },
  editor: { label: '编辑', color: '#1d4ed8', bg: '#dbeafe' },
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17, 24, 39, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
};

const modal: React.CSSProperties = {
  width: '560px',
  maxHeight: '85vh',
  background: '#fff',
  borderRadius: '14px',
  boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export const PermissionCenter: React.FC<PermissionCenterProps> = ({ board, isOpen, onClose }) => {
  const currentUserId = useWhiteboardStore((s) => s.currentUserId);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('viewer');
  const [members, setMembers] = useState<BoardMember[]>(board.members || []);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMembers(board.members || []);
      setInviteUserId('');
      setInviteRole('viewer');
      setError(null);
      setNotice(null);
    }
  }, [isOpen, board]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.status !== 'removed'),
    [members]
  );
  const removedMembers = useMemo(
    () => members.filter((m) => m.status === 'removed'),
    [members]
  );

  const isOwner = board.ownerId === currentUserId;

  if (!isOpen) return null;

  const run = async (fn: () => Promise<{ members: BoardMember[] }>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      setMembers(result.members);
      if (success) {
        setNotice(success);
        window.setTimeout(() => setNotice(null), 2500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = () => {
    const userId = inviteUserId.trim();
    if (!userId) {
      setError('请填写要邀请的成员 ID（例如 user-2）');
      return;
    }
    if (userId === board.ownerId) {
      setError('画板创建者已是成员，无需邀请');
      return;
    }
    const existing = members.find((m) => m.userId === userId);
    const duplicateActive = existing && existing.status !== 'removed';

    run(
      () =>
        boardApi.inviteMembers(board._id, currentUserId, [{ userId, role: inviteRole }]),
      duplicateActive
        ? `成员 ${userId} 已在画板中，已将权限更新为「${ROLE_META[inviteRole].label}」，未生成重复记录`
        : existing
          ? `已重新邀请 ${userId}，权限为「${ROLE_META[inviteRole].label}」`
          : `已邀请 ${userId}，权限为「${ROLE_META[inviteRole].label}」`
    ).then(() => setInviteUserId(''));
  };

  const handleRoleChange = (userId: string, role: MemberRole) => {
    run(
      () => boardApi.updateMemberRole(board._id, userId, currentUserId, role),
      `已将 ${userId} 的权限调整为「${ROLE_META[role].label}」`
    );
  };

  const handleRemove = (userId: string) => {
    if (!window.confirm(`确定将 ${userId} 移出画板吗？再次进入将只能看到只读说明。`)) return;
    run(
      () => boardApi.removeMember(board._id, userId, currentUserId),
      `已移出 ${userId}`
    );
  };

  const renderMemberRow = (member: BoardMember) => {
    const meta = ROLE_META[member.role];
    const isSelf = member.userId === currentUserId;
    return (
      <div
        key={member.userId}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          marginBottom: '8px',
          background: member.status === 'removed' ? '#f9fafb' : '#fff',
          opacity: member.status === 'removed' ? 0.75 : 1,
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#eef2ff',
            color: '#4338ca',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {member.userId.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
            {member.userId}
            {isSelf && (
              <span style={{ marginLeft: '6px', fontSize: '11px', color: '#6b7280' }}>（你）</span>
            )}
            {member.status === 'invited' && (
              <span style={{ marginLeft: '6px', fontSize: '11px', color: '#b45309' }}>
                · 邀请待接受
              </span>
            )}
            {member.status === 'removed' && (
              <span style={{ marginLeft: '6px', fontSize: '11px', color: '#dc2626' }}>
                · 已移出（只读）
              </span>
            )}
          </div>
        </div>

        {member.status === 'removed' ? (
          <button
            disabled={busy || !isOwner}
            onClick={() =>
              run(
                () => boardApi.inviteMembers(board._id, currentUserId, [{ userId: member.userId, role: member.role }]),
                `已重新邀请 ${member.userId}`
              )
            }
            style={{
              border: '1px solid #667eea',
              background: '#fff',
              color: '#667eea',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '12px',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            重新邀请
          </button>
        ) : (
          <>
            <select
              value={member.role}
              disabled={busy || !isOwner}
              onChange={(e) => handleRoleChange(member.userId, e.target.value as MemberRole)}
              style={{
                fontSize: '12px',
                padding: '5px 8px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                color: meta.color,
                background: meta.bg,
                cursor: busy || !isOwner ? 'not-allowed' : 'pointer',
              }}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !isOwner || isSelf}
              title={isSelf ? '不能移出自己' : '移出成员'}
              onClick={() => handleRemove(member.userId)}
              style={{
                border: '1px solid #fecaca',
                background: '#fff',
                color: '#dc2626',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '12px',
                cursor: busy || !isOwner || isSelf ? 'not-allowed' : 'pointer',
              }}
            >
              移出
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>
              成员权限中心
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>
              {board.name} · 邀请成员并分别授予查看、评论或编辑能力
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '18px', cursor: 'pointer', color: '#6b7280' }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '18px 20px', overflowY: 'auto' }}>
          {!isOwner && (
            <div style={{ marginBottom: '12px', padding: '10px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', fontSize: '12px' }}>
              只有画板创建者可以管理成员，你当前仅可查看成员列表。
            </div>
          )}

          {/* Invite form */}
          {isOwner && (
            <div
              style={{
                border: '1px solid #e0e7ff',
                background: '#f8faff',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '18px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#312e81', marginBottom: '10px' }}>
                邀请新成员
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input
                  value={inviteUserId}
                  onChange={(e) => setInviteUserId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleInvite();
                  }}
                  placeholder="成员 ID，例如 user-2"
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    fontSize: '13px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                  }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                  style={{
                    padding: '8px 10px',
                    fontSize: '13px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#fff',
                  }}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.icon} {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleInvite}
                  disabled={busy}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#fff',
                    background: '#667eea',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  邀请
                </button>
              </div>
              <div style={{ fontSize: '12px', color: ROLE_META[inviteRole].color }}>
                {ROLE_OPTIONS.find((o) => o.value === inviteRole)?.hint}
              </div>
              {error && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#dc2626' }}>{error}</div>
              )}
              {notice && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#059669' }}>{notice}</div>
              )}
            </div>
          )}

          {/* Current members */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
              当前成员（{activeMembers.length + 1}）
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              marginBottom: '8px',
              background: '#fafafa',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {board.ownerId.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                {board.ownerId}
                {board.ownerId === currentUserId && (
                  <span style={{ marginLeft: '6px', fontSize: '11px', color: '#6b7280' }}>（你）</span>
                )}
              </div>
            </div>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#6d28d9',
                background: '#ede9fe',
                padding: '4px 10px',
                borderRadius: '6px',
              }}
            >
              👑 创建者
            </span>
          </div>

          {activeMembers.map(renderMemberRow)}
          {activeMembers.length === 0 && (
            <div style={{ fontSize: '12px', color: '#9ca3af', padding: '8px 2px' }}>
              暂无其他成员，在上方邀请协作者。
            </div>
          )}

          {removedMembers.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <button
                onClick={() => setShowRemoved((v) => !v)}
                style={{ border: 'none', background: 'transparent', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}
              >
                {showRemoved ? '▾' : '▸'} 已移出成员（{removedMembers.length}）
              </button>
              {showRemoved && <div style={{ marginTop: '8px' }}>{removedMembers.map(renderMemberRow)}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

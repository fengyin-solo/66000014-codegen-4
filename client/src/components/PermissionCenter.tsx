import React, { useEffect, useState } from 'react';
import { Board, BoardMember, MemberRole } from '../types';
import { boardApi } from '../services/api';
import { DEMO_USERS } from '../services/users';

interface PermissionCenterProps {
  board: Board;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onMembersChange: (members: BoardMember[]) => void;
}

const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  viewer: '只读浏览画板内容，不能评论或修改',
  commenter: '可以查看画板并发表评论，不能改动内容',
  editor: '可以查看、评论并编辑画板内容',
};

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: '协作中', color: '#15803d', bg: '#dcfce7' },
  pending: { label: '待接受', color: '#a16207', bg: '#fef9c3' },
  removed: { label: '已移出', color: '#b91c1c', bg: '#fee2e2' },
};

export const PermissionCenter: React.FC<PermissionCenterProps> = ({
  board,
  currentUserId,
  isOpen,
  onClose,
  onMembersChange,
}) => {
  const [members, setMembers] = useState<BoardMember[]>(board.members || []);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState<MemberRole>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMembers(board.members || []);
      setError(null);
    }
  }, [isOpen, board.members]);

  if (!isOpen) return null;

  const applyMembers = (next: BoardMember[]) => {
    setMembers(next);
    onMembersChange(next);
  };

  const handleInvite = async () => {
    if (!selectedUser || busy) return;
    setBusy(true);
    setError(null);
    const user = DEMO_USERS.find((u) => u.userId === selectedUser);
    try {
      const result = await boardApi.inviteMember(board._id, currentUserId, {
        memberUserId: selectedUser,
        username: user?.username,
        role: selectedRole,
      });
      applyMembers(result.members);
      setSelectedUser('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '邀请失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (memberUserId: string, role: MemberRole) => {
    setError(null);
    try {
      const result = await boardApi.updateMemberRole(board._id, currentUserId, memberUserId, role);
      applyMembers(result.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : '调整权限失败');
    }
  };

  const handleRemove = async (memberUserId: string) => {
    setError(null);
    try {
      const result = await boardApi.removeMember(board._id, currentUserId, memberUserId);
      applyMembers(result.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : '移出成员失败');
    }
  };

  const handleReinvite = async (member: BoardMember) => {
    setError(null);
    const user = DEMO_USERS.find((u) => u.userId === member.userId);
    try {
      const result = await boardApi.inviteMember(board._id, currentUserId, {
        memberUserId: member.userId,
        username: user?.username || member.username,
        role: member.role,
      });
      applyMembers(result.members);
    } catch (e) {
      setError(e instanceof Error ? e.message : '重新邀请失败');
    }
  };

  // Users available for a fresh invite exclude the owner and existing records.
  const memberUserIds = new Set(members.map((m) => m.userId));
  const invitableUsers = DEMO_USERS.filter(
    (u) => u.userId !== board.ownerId && !memberUserIds.has(u.userId)
  );

  const nameFor = (member: BoardMember) =>
    member.username || DEMO_USERS.find((u) => u.userId === member.userId)?.username || member.userId;

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '14px',
          width: '620px',
          maxWidth: '94vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#1a1a1a' }}>成员权限中心</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
              画板「{board.name}」· 邀请成员并分别授予查看、评论或编辑能力
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '20px', color: '#6b7280' }}>✕</button>
        </div>

        {/* Invite row */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={{ ...inputStyle, flex: '1', minWidth: '160px' }}
            >
              <option value="">选择要邀请的成员…</option>
              {invitableUsers.map((u) => (
                <option key={u.userId} value={u.userId}>{u.username}（{u.userId}）</option>
              ))}
            </select>
            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as MemberRole)} style={inputStyle}>
              <option value="viewer">可查看</option>
              <option value="commenter">可评论</option>
              <option value="editor">可编辑</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={!selectedUser || busy}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#fff',
                background: !selectedUser || busy ? '#a5b4fc' : '#667eea',
                border: 'none',
                borderRadius: '6px',
                cursor: !selectedUser || busy ? 'not-allowed' : 'pointer',
              }}
            >
              邀请
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#9ca3af' }}>
            重复邀请同一成员不会产生多份记录；未完成的邀请可随时改权限，移出后再次邀请会重新发起。
          </p>
        </div>

        {/* Member list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 4px', borderBottom: '1px solid #f3f4f6', fontSize: '12px', color: '#9ca3af' }}>
            <span style={{ flex: 1 }}>成员</span>
            <span style={{ width: '120px' }}>权限</span>
            <span style={{ width: '72px', textAlign: 'center' }}>状态</span>
            <span style={{ width: '88px', textAlign: 'right' }}>操作</span>
          </div>

          {/* Owner */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 4px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#667eea', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600 }}>
                {(board.ownerId === currentUserId ? '我' : '主')}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
                  {board.ownerId === currentUserId ? `${DEMO_USERS.find((u) => u.userId === board.ownerId)?.username || '创建者'}（我）` : (DEMO_USERS.find((u) => u.userId === board.ownerId)?.username || '创建者')}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>{board.ownerId}</div>
              </div>
            </div>
            <span style={{ width: '120px', fontSize: '12px', fontWeight: 600, color: '#667eea' }}>所有者</span>
            <span style={{ width: '72px', textAlign: 'center', fontSize: '11px', color: '#15803d', background: '#dcfce7', borderRadius: '10px', padding: '2px 0' }}>创建者</span>
            <span style={{ width: '88px' }} />
          </div>

          {members.map((member) => {
            const status = STATUS_STYLES[member.status] || STATUS_STYLES.active;
            const isRemoved = member.status === 'removed';
            return (
              <div key={member.userId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 4px', borderBottom: '1px solid #f3f4f6', opacity: isRemoved ? 0.7 : 1 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e5e7eb', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600 }}>
                    {nameFor(member).charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
                      {nameFor(member)}{member.userId === currentUserId ? '（我）' : ''}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>{ROLE_DESCRIPTIONS[member.role]}</div>
                  </div>
                </div>

                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.userId, e.target.value as MemberRole)}
                  disabled={isRemoved}
                  style={{ ...inputStyle, width: '120px' }}
                >
                  <option value="viewer">可查看</option>
                  <option value="commenter">可评论</option>
                  <option value="editor">可编辑</option>
                </select>

                <span style={{ width: '72px', textAlign: 'center', fontSize: '11px', color: status.color, background: status.bg, borderRadius: '10px', padding: '2px 0' }}>
                  {status.label}
                </span>

                <div style={{ width: '88px', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                  {isRemoved ? (
                    <button onClick={() => handleReinvite(member)} style={{ border: 'none', background: '#eef2ff', color: '#4f46e5', fontSize: '11px', padding: '4px 8px', borderRadius: '5px', cursor: 'pointer' }}>
                      重新邀请
                    </button>
                  ) : (
                    <button onClick={() => handleRemove(member.userId)} style={{ border: 'none', background: '#fef2f2', color: '#dc2626', fontSize: '11px', padding: '4px 8px', borderRadius: '5px', cursor: 'pointer' }}>
                      移出
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ margin: '0 24px 12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '12px' }}>
            {error}
          </div>
        )}

        <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 500, color: '#374151', background: '#e5e7eb', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

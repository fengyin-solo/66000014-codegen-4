import React from 'react';
import { BoardAccess } from '../types';

interface AccessNoticeProps {
  access: BoardAccess;
  onAcceptInvite?: () => void;
  accepting?: boolean;
}

const ROLE_NAME: Record<string, string> = {
  owner: '所有者',
  editor: '编辑者',
  commenter: '评论者',
  viewer: '查看者',
  none: '访客',
};

// Explains why the board is open in read-only mode. Shown for removed members,
// uninvited visitors, plain viewers, and (as an action prompt) pending invitees.
export const AccessNotice: React.FC<AccessNoticeProps> = ({ access, onAcceptInvite, accepting }) => {
  let tone: 'warn' | 'info' | 'invite' = 'info';
  let icon = '👁';
  let title = '';
  let detail = '';
  let showAccept = false;

  if (access.status === 'removed') {
    tone = 'warn';
    icon = '🚫';
    title = '只读模式：你已被移出该画板';
    detail = '你当前以只读方式浏览，不能评论或编辑内容。如需恢复协作，请联系画板创建者重新邀请。';
  } else if (access.role === 'none') {
    tone = 'warn';
    icon = '🔒';
    title = '只读模式：你尚未被邀请加入该画板';
    detail = '你可以查看当前内容，但无法评论或编辑。请联系画板创建者获取协作权限。';
  } else if (access.status === 'pending') {
    tone = 'invite';
    icon = '✉️';
    title = '你收到了一个协作邀请';
    detail = `邀请权限为「${ROLE_NAME[access.role] || access.role}」。接受邀请后将按该权限参与协作。`;
    showAccept = true;
  } else if (access.role === 'viewer') {
    tone = 'info';
    icon = '👁';
    title = '只读模式：你是查看者';
    detail = '你可以浏览画板全部内容，但不能改动已有内容或发表评论。';
  } else if (access.role === 'commenter') {
    tone = 'info';
    icon = '💬';
    title = '评论模式：你是评论者';
    detail = '你可以查看画板并在画布上发表评论，但不能改动已有内容。';
  }

  if (!title) return null;

  const palette = {
    warn: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
    info: { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
    invite: { bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
  }[tone];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 14px',
        background: palette.bg,
        borderBottom: `1px solid ${palette.border}`,
        color: palette.color,
        fontSize: '12.5px',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: '15px' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: '220px' }}>
        <strong>{title}</strong>
        <span style={{ marginLeft: '8px', opacity: 0.85 }}>{detail}</span>
      </div>
      {showAccept && onAcceptInvite && (
        <button
          onClick={onAcceptInvite}
          disabled={accepting}
          style={{
            padding: '5px 14px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#fff',
            background: accepting ? '#fcd34d' : '#d97706',
            border: 'none',
            borderRadius: '6px',
            cursor: accepting ? 'wait' : 'pointer',
          }}
        >
          {accepting ? '接受中…' : '接受邀请'}
        </button>
      )}
    </div>
  );
};

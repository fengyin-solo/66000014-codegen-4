// Lightweight demo identity directory. The app has no authentication layer, so
// the current user is switched from the dashboard to exercise all permission
// scenarios (owner / editor / commenter / viewer / removed).
export interface DemoUser {
  userId: string;
  username: string;
}

export const DEMO_USERS: DemoUser[] = [
  { userId: 'user-1', username: '创建者' },
  { userId: 'user-2', username: '李评审' },
  { userId: 'user-3', username: '王评论' },
  { userId: 'user-4', username: '张查看' },
  { userId: 'user-5', username: '赵待加入' },
  { userId: 'user-6', username: '孙已移出' },
];

export const DEFAULT_USER = DEMO_USERS[0];

export const findUser = (userId: string): DemoUser =>
  DEMO_USERS.find((u) => u.userId === userId) || { userId, username: userId };

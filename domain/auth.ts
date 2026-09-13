export type UserRole = 'employee' | 'admin';

export interface WorkspaceUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
}

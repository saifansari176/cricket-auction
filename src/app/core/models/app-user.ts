export type UserRole = 'admin' | 'user';

export interface AppUser {
  id?: string;
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  teamLimit?: number;
  playerLimit?: number;
  createdAt?: string;
  updatedAt?: string;
}

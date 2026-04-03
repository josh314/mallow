export const userRoles = ['owner', 'manager', 'employee'] as const;
export type UserRole = typeof userRoles[number];

/** Lower index = higher privilege: owner(0) > manager(1) > employee(2). */
export function roleRank( role: UserRole ): number {
  return userRoles.indexOf( role );
}

export interface User {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isSuperadmin: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type PublicUser = Omit<User, 'passwordHash'>;

/** Subset of User carried in the session and attached to req.user. */
export interface SessionUser {
  id: string;
  organizationId: string;
  role: UserRole;
  isSuperadmin: boolean;
}

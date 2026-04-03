import type { DbClient } from '../db/client';
import type { User, UserRole } from './types';

const userColumns = `
  id,
  organization_id  AS "organizationId",
  email,
  password_hash    AS "passwordHash",
  first_name       AS "firstName",
  last_name        AS "lastName",
  role,
  is_superadmin    AS "isSuperadmin",
  created_at       AS "createdAt",
  updated_at       AS "updatedAt",
  deleted_at       AS "deletedAt"
`;

export async function createUser(
  db: DbClient,
  input: {
    organizationId: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  },
): Promise<User> {

  const rows = await db.sql<User[]>`
    INSERT INTO users ( organization_id, email, password_hash, first_name, last_name, role )
    VALUES (
      ${ input.organizationId },
      ${ input.email },
      ${ input.passwordHash },
      ${ input.firstName },
      ${ input.lastName },
      ${ input.role }::user_role
    )
    RETURNING ${ db.sql.unsafe( userColumns ) }
  `;

  return rows[ 0 ];

}

export async function findUserByEmail(
  db: DbClient,
  email: string,
): Promise<User | null> {

  const rows = await db.sql<User[]>`
    SELECT ${ db.sql.unsafe( userColumns ) }
    FROM users
    WHERE email = ${ email }
      AND deleted_at IS NULL
  `;

  return rows[ 0 ] ?? null;

}

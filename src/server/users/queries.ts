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

// NOTE: organizationId should always be provided to enforce row-level data ownership.
// Only omit when the caller has already verified superadmin access at the route layer.
export async function findUserById(
  db: DbClient,
  userId: string,
  organizationId?: string,
): Promise<User | null> {

  const rows = await db.sql<User[]>`
    SELECT ${ db.sql.unsafe( userColumns ) }
    FROM users
    WHERE id = ${ userId }
      AND deleted_at IS NULL
    ${ organizationId ? db.sql`AND organization_id = ${ organizationId }` : db.sql`` }
  `;

  return rows[ 0 ] ?? null;

}

export async function listUsers(
  db: DbClient,
  params: { organizationId: string; email?: string; role?: UserRole; limit: number; offset: number },
): Promise<User[]> {

  const { organizationId, email, role, limit, offset } = params;

  return db.sql<User[]>`
    SELECT ${ db.sql.unsafe( userColumns ) }
    FROM users
    WHERE organization_id = ${ organizationId }
      AND deleted_at IS NULL
    ${ email ? db.sql`AND email ILIKE ${ '%' + email + '%' }` : db.sql`` }
    ${ role  ? db.sql`AND role = ${ role }::user_role`        : db.sql`` }
    ORDER BY last_name, first_name
    LIMIT ${ limit } OFFSET ${ offset }
  `;

}

export async function countUsers(
  db: DbClient,
  params: { organizationId: string; email?: string; role?: UserRole },
): Promise<number> {

  const { organizationId, email, role } = params;

  const rows = await db.sql<{ count: string }[]>`
    SELECT COUNT(*) AS count
    FROM users
    WHERE organization_id = ${ organizationId }
      AND deleted_at IS NULL
    ${ email ? db.sql`AND email ILIKE ${ '%' + email + '%' }` : db.sql`` }
    ${ role  ? db.sql`AND role = ${ role }::user_role`        : db.sql`` }
  `;

  return parseInt( rows[ 0 ].count, 10 );

}

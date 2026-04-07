import type { DbClient } from '../db/client';
import type { Organization } from './types';

const orgColumns = `
  id,
  name,
  slug,
  created_at  AS "createdAt",
  updated_at  AS "updatedAt",
  deleted_at  AS "deletedAt"
`;

export async function createOrganization(
  db: DbClient,
  input: { name: string; slug: string },
): Promise<Organization> {

  const rows = await db.sql<Organization[]>`
    INSERT INTO organizations ( name, slug )
    VALUES ( ${ input.name }, ${ input.slug } )
    RETURNING ${ db.sql.unsafe( orgColumns ) }
  `;

  return rows[ 0 ];

}

export async function findOrganizationById(
  db: DbClient,
  id: string,
): Promise<Organization | null> {

  const rows = await db.sql<Organization[]>`
    SELECT ${ db.sql.unsafe( orgColumns ) }
    FROM organizations
    WHERE id = ${ id }
      AND deleted_at IS NULL
  `;

  return rows[ 0 ] ?? null;

}

export async function listOrganizations(
  db: DbClient,
  params: { search?: string; limit: number; offset: number },
): Promise<Organization[]> {

  const { search, limit, offset } = params;

  return db.sql<Organization[]>`
    SELECT ${ db.sql.unsafe( orgColumns ) }
    FROM organizations
    WHERE deleted_at IS NULL
    ${ search ? db.sql`AND ( name ILIKE ${ '%' + search + '%' } OR slug ILIKE ${ '%' + search + '%' } )` : db.sql`` }
    ORDER BY name
    LIMIT ${ limit } OFFSET ${ offset }
  `;

}

export async function countOrganizations(
  db: DbClient,
  params: { search?: string },
): Promise<number> {

  const { search } = params;

  const rows = await db.sql<{ count: string }[]>`
    SELECT COUNT(*) AS count
    FROM organizations
    WHERE deleted_at IS NULL
    ${ search ? db.sql`AND ( name ILIKE ${ '%' + search + '%' } OR slug ILIKE ${ '%' + search + '%' } )` : db.sql`` }
  `;

  return parseInt( rows[ 0 ].count, 10 );

}

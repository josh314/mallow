import type { DbClient } from '../db/client';
import type { Organization } from './types';

export async function createOrganization(
  db: DbClient,
  input: { name: string; slug: string },
): Promise<Organization> {

  const rows = await db.sql<Organization[]>`
    INSERT INTO organizations ( name, slug )
    VALUES ( ${ input.name }, ${ input.slug } )
    RETURNING
      id,
      name,
      slug,
      created_at  AS "createdAt",
      updated_at  AS "updatedAt",
      deleted_at  AS "deletedAt"
  `;

  return rows[ 0 ];

}

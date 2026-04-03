/**
 * Development seed: creates a superadmin account in the Mallow organization.
 * Safe to run multiple times — existing accounts are left untouched.
 *
 * Credentials are printed to stdout on each run.
 */

import argon2 from 'argon2';
import { createDbClient } from '../../src/server/db/client';

const EMAIL    = 'admin@mallow.dev';
const PASSWORD = 'password';

async function seed() {

  const databaseUrl = process.env.DATABASE_URL ?? buildUrlFromEnv();
  const db = createDbClient( { databaseUrl, maxConnections: 1 } );

  try {

    const [ mallowOrg ] = await db.sql<{ id: string }[]>`
      SELECT id FROM organizations
      WHERE slug = 'mallow' AND deleted_at IS NULL
    `;

    if( !mallowOrg ) {
      throw new Error( 'Mallow organization not found — has V1 migration run?' );
    }

    const passwordHash = await argon2.hash( PASSWORD );

    const result = await db.sql`
      INSERT INTO users
        ( organization_id, email, password_hash, first_name, last_name, role, is_superadmin )
      VALUES
        ( ${ mallowOrg.id }, ${ EMAIL }, ${ passwordHash }, 'Dev', 'Admin', 'owner'::user_role, true )
      ON CONFLICT ( email ) DO NOTHING
    `;

    if( result.count === 0 ) {
      console.log( `Superadmin already exists: ${ EMAIL }` );
    }
    else {
      console.log( `Superadmin created: ${ EMAIL } / ${ PASSWORD }` );
    }

  }
  finally {
    await db.close();
  }

}

function buildUrlFromEnv(): string {
  const host     = process.env.POSTGRES_HOST     ?? 'localhost';
  const port     = process.env.POSTGRES_PORT     ?? '5432';
  const database = process.env.POSTGRES_DB       ?? 'mallow';
  const user     = encodeURIComponent( process.env.POSTGRES_USER     ?? 'dev' );
  const password = encodeURIComponent( process.env.POSTGRES_PASSWORD ?? '' );
  return `postgres://${ user }:${ password }@${ host }:${ port }/${ database }`;
}

seed().catch( ( err ) => {
  console.error( err );
  process.exit( 1 );
} );

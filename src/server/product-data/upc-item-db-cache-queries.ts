import type { DbClient } from '../db/client';
import type { UpcItemDbItem } from './upc-item-db-types';

export async function getCachedUpcItem(
  db: DbClient,
  upc: string,
  maxAgeMs: number,
): Promise<UpcItemDbItem | null> {

  const rows = await db.sql<{ item: UpcItemDbItem }[]>`
    SELECT item
    FROM upc_item_db_cache
    WHERE upc = ${ upc }
      AND updated_at > now() - ( ${ maxAgeMs } * INTERVAL '1 millisecond' )
  `;

  return rows[ 0 ]?.item ?? null;

}

export async function upsertCachedUpcItem(
  db: DbClient,
  upc: string,
  item: UpcItemDbItem,
): Promise<void> {

  await db.sql`
    INSERT INTO upc_item_db_cache ( upc, item )
    VALUES ( ${ upc }, ${ db.sql.json( item as unknown as import( 'postgres' ).JSONValue ) } )
    ON CONFLICT ( upc ) DO UPDATE
      SET item = EXCLUDED.item
  `;

}

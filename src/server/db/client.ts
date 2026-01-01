import postgres, { Sql } from "postgres";

import type { DbConfig } from "./config";

export interface DbClient {
  sql: Sql;
  close: () => Promise<void>;
  isReady: () => Promise<void>;
}

export function createDbClient( dbConfig: DbConfig ): DbClient {

  const sql = postgres( dbConfig.databaseUrl, {
    max: dbConfig.maxConnections,
  } );

  return {
    sql,
    close: async () => { await sql.end( { timeout: 5 } ); },
    isReady: async () => {
      await sql`select 1`;
    }
  };

}

import * as z from "zod";

import { ConfigurationError } from '../util/errors';
import { configSchema , type Config } from '@schemas';

export function getConfig( env: NodeJS.ProcessEnv = process.env ): Config {

  const raw = {

    nodeEnv: env.NODE_ENV,
    port: env.PORT,

    db: {

      databaseUrl: env.DATABASE_URL,

      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,

      maxConnections: env.POSTGRES_MAX_CONNECTIONS,

    },

  };

  try {
    return configSchema.parse( raw );
  }
  catch( error ) {
    if( error instanceof z.ZodError ) {
      const flattened = z.flattenError( error );
      throw new ConfigurationError( flattened );
    }
    throw error;
  }


};
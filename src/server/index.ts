import { getConfig } from './config';
import { createServer } from './server';
import { createDbClient } from './db/client';

import { ConfigurationError } from './util/errors';

async function main() {

  const config = getConfig( process.env );
  const db = createDbClient( config.db );
  const server = await createServer( config, db );
  await server.listen();

  return server;
}

main().catch(
  ( err ) => {

    if( err instanceof ConfigurationError ) {
      console.error( 'Configuration error:', err.flattened );
      console.error( 'Exiting process due to configuration error.' );
    }
    else {
      console.error( 'Fatal error during server startup:', err );
    }

    process.exit( 1 );
  }
);
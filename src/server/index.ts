import { getConfig } from './config';
import { createServer } from './server';

import { ConfigurationError } from 'util/errors';

async function main() {

  const config = getConfig( process.env );
  const server = await createServer( config );
  server.listen();

  return server;
}

main().catch(
  ( err ) => {

    if( err instanceof ConfigurationError ) {

      console.error( 'Configuration error:', err.flattened );
      console.error( 'Exiting process due to configuration error.' );
      process.exit( 1 );

    }
    else {
      console.error( 'Fatal error during server startup:', err );
      process.exit( 1 );
    }
  }
);
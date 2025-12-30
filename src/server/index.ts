import { getConfig } from './config';
import { createServer } from './server';

async function main() {

  const config = getConfig( process.env );
  const server = await createServer( config );
  server.listen();

  return server;
}

main().catch( console.error );
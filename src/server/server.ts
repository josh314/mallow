import express from 'express';
import createDebugLogger from 'debug';
const debug = createDebugLogger( 'mallow' );

import type { Config } from '@schemas';

class Server {
  private app: express.Express;
  private config: Config;

  constructor(config: Config) {
    this.app = express();
    this.config = config;
  }

  public async init(): Promise<Server> {
    // Initialize middleware, routes, etc. here using this.settings
    return this;
  }

  public listen(): void {
    const port = this.config.port || 8080;
    this.app.listen(port, () => {
      debug(`Server is listening on port ${port}`);
    });
  }
}

export async function createServer(config: Config): Promise<Server> {
  const server = new Server(config);
  await server.init();
  return server;
}

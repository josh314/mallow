import express from 'express';
import createDebugLogger from 'debug';
const debug = createDebugLogger( 'mallow' );

import type { Config } from '@schemas';
import { createRouter } from './routes';
import { requestLog, requestId, errorHandler } from "./middleware";

class Server {
  private app: express.Express;
  private config: Config;

  constructor(config: Config) {
    this.app = express();
    this.config = config;
  }

  public async init(): Promise<Server> {

    this.app.use( requestId() );
    if ( this.config.nodeEnv !== "test" ) {
      this.app.use( requestLog() );
    }

    this.app.use( express.json() );
    this.app.use( express.urlencoded( { extended: true } ) );

    const router = createRouter( {} );
    this.app.use( router );

    this.app.use( errorHandler );

    return this;
  }

  public getApp(): express.Express {
    return this.app;
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

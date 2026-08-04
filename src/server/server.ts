import http from 'http';

import express from 'express';
import createDebugLogger from 'debug';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
const debug = createDebugLogger( 'mallow' );

import type { Config } from '@schemas';

import type { DbClient } from './db/client';

import { createRouter } from './routes';
import { requestLog, requestId, errorHandler } from "./middleware";
import { ProductDataService } from './product-data/service';
import { UpcItemDbClient } from './product-data/upc-item-db-client';
import { UpcItemDbSource } from './product-data/upc-item-db-source';

class Server {
  private app: express.Express;
  private config: Config;
  private db: DbClient;
  private productDataService: ProductDataService;
  private httpServer: http.Server | null = null;

  constructor( config: Config, db: DbClient) {
    this.app = express();
    this.config = config;
    this.db = db;
    const upcItemDbClient = new UpcItemDbClient( this.db, { userKey: this.config.upcItemDbUserKey } );
    this.productDataService = new ProductDataService( [ new UpcItemDbSource( upcItemDbClient ) ] );
  }

  public async init(): Promise<Server> {

    try {
      await this.db.isReady();
    }
    catch ( error ) {
      debug( 'Database connection failed during server initialization: %O', error );
      await this.db.close().catch( () => {} );
      throw error;
    }

    this.app.use( requestId() );
    if ( this.config.nodeEnv !== "test" ) {
      this.app.use( requestLog() );
    }

    this.app.use( express.json() );
    this.app.use( express.urlencoded( { extended: true } ) );

    const PgStore = connectPgSimple( session );
    this.app.use( session( {
      store: this.config.nodeEnv !== 'test'
        ? new PgStore( { conString: this.config.db.databaseUrl, tableName: 'session' } )
        : undefined,
      secret: this.config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: this.config.nodeEnv === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    } ) );

    const router = createRouter( { db: this.db, productDataService: this.productDataService } );
    this.app.use( router );

    this.app.use( errorHandler );

    return this;
  }

  public getApp(): express.Express {
    return this.app;
  }

  public listen(): Promise<void> {

    return new Promise( ( resolve, reject ) => {

      const port = this.config.port ?? 8080;
      const httpServer = this.app.listen( port );

      this.httpServer = httpServer;

      httpServer.once( "listening", () => {

        const address = httpServer.address();
        if( typeof address === "string" ) {
          debug( "Express server listening at address " + address );
        }
        else if( address !== null ) {
          debug( "Express server listening on port " + address.port );
        }

        resolve();

      } );

      httpServer.on( "error", reject );

    });

  }

  public async close(): Promise<void> {

    if( this.httpServer ) {
      await new Promise<void>( ( resolve, reject ) => {
        this.httpServer!.close( ( err ) => err ? reject( err ) : resolve() );
      } );
      this.httpServer = null;
    }

    await this.db.close();
  }

}

export async function createServer(config: Config, db: DbClient): Promise<Server> {
  const server = new Server( config, db );
  await server.init();
  return server;
}

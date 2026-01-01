import postgres from "postgres";

import { createDbClient } from "./client";

jest.mock( "postgres", () => {

  const postgresMock = jest.fn( ( _url: string, _opts: any ) => {

    const sqlTag = jest.fn( async ( strings: TemplateStringsArray, ..._values: unknown[] ) => {
      return { strings };
    } ) as unknown as postgres.Sql;

    sqlTag.end = jest.fn( async ( _args: any ) => undefined );

    return sqlTag;

  } );

  return {
    __esModule: true,
    default: postgresMock,
  };

} );

describe( "createDbClient", () => {

  beforeEach( () => {
    jest.clearAllMocks();
  } );

  it( "creates a postgres client with max connections", () => {

    const dbClient = createDbClient( {
      databaseUrl: "postgres://u:p@db:5432/mydb",
      maxConnections: 42,
    } );

    expect( postgres ).toHaveBeenCalledTimes( 1 );
    expect( postgres ).toHaveBeenCalledWith(
      "postgres://u:p@db:5432/mydb",
      { max: 42 },
    );

    expect( dbClient.sql ).toBeDefined();
    expect( typeof dbClient.close ).toBe( "function" );
    expect( typeof dbClient.isReady ).toBe( "function" );

  } );

  it( "close() calls sql.end with timeout 5", async () => {

    const dbClient = createDbClient( {
      databaseUrl: "postgres://u:p@db:5432/mydb",
      maxConnections: 10,
    } );

    // Grab the returned sql tag from our mock call.
    const sqlTag = ( postgres as unknown as jest.Mock ).mock.results[ 0 ].value;

    await dbClient.close();

    expect( sqlTag.end ).toHaveBeenCalledTimes( 1 );
    expect( sqlTag.end ).toHaveBeenCalledWith( { timeout: 5 } );

  } );

  it( "isReady() runs `select 1` via the tag function", async () => {

    const dbClient = createDbClient( {
      databaseUrl: "postgres://u:p@db:5432/mydb",
      maxConnections: 10,
    } );

    const sqlTag = ( postgres as unknown as jest.Mock ).mock.results[ 0 ].value;

    await dbClient.isReady();

    expect( sqlTag ).toHaveBeenCalledTimes( 1 );

    const firstCallArgs = ( sqlTag as jest.Mock ).mock.calls[ 0 ];
    const strings = firstCallArgs[ 0 ] as TemplateStringsArray;

    expect( strings[ 0 ] ).toBe( "select 1" );

  } );

} );

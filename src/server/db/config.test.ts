import { dbConfigSchema } from "./config";

describe( "dbConfigSchema", () => {

  it( "accepts DATABASE_URL and applies default maxConnections", () => {

    const parsed = dbConfigSchema.parse( {
      databaseUrl: "postgres://u:p@localhost:5432/mydb",
    } );

    expect( parsed ).toEqual( {
      databaseUrl: "postgres://u:p@localhost:5432/mydb",
      maxConnections: 10,
    } );

  } );

  it( "accepts DATABASE_URL and preserves explicit maxConnections", () => {

    const parsed = dbConfigSchema.parse( {
      databaseUrl: "postgres://u:p@localhost:5432/mydb",
      maxConnections: 25,
    } );

    expect( parsed ).toEqual( {
      databaseUrl: "postgres://u:p@localhost:5432/mydb",
      maxConnections: 25,
    } );

  } );

  it( "builds databaseUrl from discrete vars (and encodes user/password)", () => {

    const parsed = dbConfigSchema.parse( {
      host: "db",
      port: 5432,
      database: "my_db",
      user: "u@name",
      password: "p:/#?&=",
      maxConnections: 7,
    } );

    // encodeURIComponent( "u@name" ) => "u%40name"
    // encodeURIComponent( "p:/#?&=" ) => "p%3A%2F%23%3F%26%3D"
    expect( parsed ).toEqual( {
      databaseUrl: "postgres://u%40name:p%3A%2F%23%3F%26%3D@db:5432/my_db",
      maxConnections: 7,
    } );

  } );

  it( "prefers DATABASE_URL over discrete vars if both are provided", () => {

    const parsed = dbConfigSchema.parse( {
      databaseUrl: "postgres://preferred:yes@localhost:5432/preferred",
      host: "ignored",
      port: 5432,
      database: "ignored",
      user: "ignored",
      password: "ignored",
      maxConnections: 11,
    } );

    expect( parsed ).toEqual( {
      databaseUrl: "postgres://preferred:yes@localhost:5432/preferred",
      maxConnections: 11,
    } );

  } );

  it( "rejects when neither DATABASE_URL nor a full discrete set is provided", () => {

    const result = dbConfigSchema.safeParse( { } );

    expect( result.success ).toBe( false );

    if( result.success ) {
      throw new Error( "Expected parse to fail" );
    }

    const messages = result.error.issues.map( ( i ) => i.message );
    expect( messages ).toContain(
      "Provide DATABASE_URL or all of POSTGRES_HOST/PORT/DB/USER/PASSWORD.",
    );

  } );

  it( "rejects when discrete vars are present but incomplete", () => {

    const result = dbConfigSchema.safeParse( {
      host: "db",
      port: 5432,
      database: "mydb",
      user: "u",
      // password missing
    } );

    expect( result.success ).toBe( false );

    if( result.success ) {
      throw new Error( "Expected parse to fail" );
    }

    const messages = result.error.issues.map( ( i ) => i.message );
    expect( messages ).toContain(
      "Provide DATABASE_URL or all of POSTGRES_HOST/PORT/DB/USER/PASSWORD.",
    );

  } );

  it( "coerces port and maxConnections from strings", () => {

    const parsed = dbConfigSchema.parse( {
      host: "db",
      port: "5432",
      database: "mydb",
      user: "u",
      password: "p",
      maxConnections: "12",
    } as any );

    expect( parsed ).toEqual( {
      databaseUrl: "postgres://u:p@db:5432/mydb",
      maxConnections: 12,
    } );

  } );

} );

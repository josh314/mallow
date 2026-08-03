import type { Config } from '@schemas';
import { getConfig } from './index';
import { makeTestConfig } from './test-config';

const BASE_ENV = {

  NODE_ENV: 'test',
  PORT: '9000',
  SESSION_SECRET: 'test-secret',
  DATABASE_URL: 'postgres://user:password@localhost:5432/testdb',
  POSTGRES_MAX_CONNECTIONS: '10',
  UPCITEMDB_USER_KEY: 'test-upcitemdb-key',

};

const BASE_CONFIG: Config = makeTestConfig( {
  port: 9000,
  nodeEnv: 'test',
  db: {
    databaseUrl: 'postgres://user:password@localhost:5432/testdb',
    maxConnections: 10,
  },
} );

describe( 'getConfig' , () => {

  test( 'defaults nodeEnv to `development` when NODE_ENV is undefined' , () => {

    const env = Object.assign( {} , BASE_ENV, {
      NODE_ENV: undefined,
    } );

    const expectedConfig = Object.assign( {} , BASE_CONFIG, {
      nodeEnv: 'development',
    } );

    const config = getConfig( env );

    expect( config ).toEqual( expectedConfig );

  } );

  test( 'throws when NODE_ENV is not one of development/test/production' , () => {


    const env1 = Object.assign( {} , BASE_ENV, {
      NODE_ENV: 'debelopment',
    } );

    const env2 = Object.assign( {} , BASE_ENV, {
      NODE_ENV: 'staging',
    } );

    const env3 = Object.assign( {} , BASE_ENV, {
      NODE_ENV: 'prod',
    } );

    expect( () => getConfig( env1 ) ).toThrow();
    expect( () => getConfig( env2 ) ).toThrow();
    expect( () => getConfig( env3 ) ).toThrow();

  } );

  test( 'coerces PORT string to number' , () => {

    const env = Object.assign( {} , BASE_ENV, {
      PORT: '8080',
    } );

    const expectedConfig = Object.assign( {} , BASE_CONFIG, {
      port: 8080,
    } );

    const config = getConfig( env );

    expect( config ).toEqual( expectedConfig );

  } );

  test( 'throws a flattened error when PORT is missing' , () => {

    const env = Object.assign( {} , BASE_ENV, {
      PORT: undefined,
    } );

    expect( () => getConfig( env ) ).toThrow();

  } );

  test( 'throws when PORT is not a positive int' , () => {

    const env1 = Object.assign( {} , BASE_ENV, {
      PORT: 'not-a-number',
    } );
    const env2 = Object.assign( {} , BASE_ENV, {
      PORT: '0',
    } );
    const env3 = Object.assign( {} , BASE_ENV, {
      PORT: '-1',
    } );
    const env4 = Object.assign( {} , BASE_ENV, {
      PORT: '1.5',
    } );

    expect( () => getConfig( env1 ) ).toThrow();
    expect( () => getConfig( env2 ) ).toThrow();
    expect( () => getConfig( env3 ) ).toThrow();
    expect( () => getConfig( env4 ) ).toThrow();

  } );

} );

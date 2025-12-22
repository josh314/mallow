import { getConfig } from './index';

describe( 'getConfig' , () => {

  test( 'defaults nodeEnv to `development` when NODE_ENV is undefined' , () => {

    const config = getConfig( {

      PORT: '3000',

    } );

    expect( config ).toEqual( {

      nodeEnv: 'development',
      port: 3000,

    } );

  } );

  test( 'coerces PORT string to number' , () => {

    const config = getConfig( {

      NODE_ENV: 'test',
      PORT: '8080',

    } );

    expect( config.port ).toBe( 8080 );

  } );

  test( 'throws a flattened error when PORT is missing' , () => {

    expect( () => getConfig( { NODE_ENV: 'test' } ) ).toThrow();

  } );

  test( 'throws when PORT is not a positive int' , () => {

    expect( () => getConfig( { NODE_ENV: 'test', PORT: '0' } ) ).toThrow();
    expect( () => getConfig( { NODE_ENV: 'test', PORT: '-1' } ) ).toThrow();
    expect( () => getConfig( { NODE_ENV: 'test', PORT: '1.5' } ) ).toThrow();

  } );

  test( 'throws when NODE_ENV is not one of development/test/production' , () => {

    expect( () => getConfig( {

      NODE_ENV: 'develorpment',
      PORT: '3000',

    } ) ).toThrow();

  } );

} );

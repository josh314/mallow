import { detectIdType, normalizeIdentifier, parseIdentifier } from './identifier';

describe( 'detectIdType', () => {

  it( 'detects a 12-digit numeric string as upc', () => {
    expect( detectIdType( '041598000539' ) ).toBe( 'upc' );
  } );

  it( 'detects a 13-digit numeric string as ean', () => {
    expect( detectIdType( '4006381333931' ) ).toBe( 'ean' );
  } );

  it( 'detects a 14-digit numeric string as gtin', () => {
    expect( detectIdType( '00012345678905' ) ).toBe( 'gtin' );
  } );

  it( 'detects an X-prefixed alphanumeric string as fnsku, case-insensitively', () => {
    expect( detectIdType( 'X001ABCDEF' ) ).toBe( 'fnsku' );
    expect( detectIdType( 'x001abcdef' ) ).toBe( 'fnsku' );
  } );

  it( 'detects any other alphanumeric string as asin', () => {
    expect( detectIdType( 'B08N5WRWNW' ) ).toBe( 'asin' );
  } );

} );

describe( 'normalizeIdentifier', () => {

  it( 'strips non-digit characters and left-pads a upc to 12 digits', () => {
    expect( normalizeIdentifier( '0415-9800-0539', 'upc' ) ).toBe( '041598000539' );
    expect( normalizeIdentifier( '41598000539', 'upc' ) ).toBe( '041598000539' );
  } );

  it( 'left-pads an ean to 13 digits without truncating', () => {
    expect( normalizeIdentifier( '4006381333931', 'ean' ) ).toBe( '4006381333931' );
  } );

  it( 'left-pads a gtin to 14 digits', () => {
    expect( normalizeIdentifier( '12345678905', 'gtin' ) ).toBe( '00012345678905' );
  } );

  it( 'trims and uppercases asin and fnsku values', () => {
    expect( normalizeIdentifier( ' b08n5wrwnw ', 'asin' ) ).toBe( 'B08N5WRWNW' );
    expect( normalizeIdentifier( 'x001abcdef', 'fnsku' ) ).toBe( 'X001ABCDEF' );
  } );

} );

describe( 'parseIdentifier', () => {

  it( 'combines detection and normalization', () => {
    expect( parseIdentifier( '41598000539' ) ).toEqual( { idType: 'upc', value: '041598000539' } );
    expect( parseIdentifier( 'x001abcdef' ) ).toEqual( { idType: 'fnsku', value: 'X001ABCDEF' } );
  } );

} );

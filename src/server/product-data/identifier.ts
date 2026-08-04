export type ProductIdType = 'upc' | 'ean' | 'gtin' | 'asin' | 'fnsku';

export interface ProductIdentifier {
  idType: ProductIdType;
  value: string;
}

export function detectIdType( raw: string ): ProductIdType {

  const trimmed = raw.trim();

  if( /^\d+$/.test( trimmed ) ) {
    if( trimmed.length <= 12 ) return 'upc';
    if( trimmed.length === 13 ) return 'ean';
    return 'gtin';
  }

  if( /^x/i.test( trimmed ) ) return 'fnsku';

  return 'asin';

}

const STANDARD_DIGIT_LENGTH: Record<'upc' | 'ean' | 'gtin', number> = {
  upc: 12,
  ean: 13,
  gtin: 14,
};

export function normalizeIdentifier( raw: string, idType: ProductIdType ): string {

  const trimmed = raw.trim();

  if( idType === 'upc' || idType === 'ean' || idType === 'gtin' ) {
    const digits = trimmed.replace( /\D/g, '' );
    return digits.padStart( STANDARD_DIGIT_LENGTH[ idType ], '0' );
  }

  return trimmed.toUpperCase();

}

export function parseIdentifier( raw: string ): ProductIdentifier {
  const idType = detectIdType( raw );
  return { idType, value: normalizeIdentifier( raw, idType ) };
}

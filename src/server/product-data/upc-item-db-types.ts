export interface UpcItemDbOffer {
  merchant?: string;
  domain?: string;
  title?: string;
  currency?: string;
  list_price?: string;
  price?: number;
  shipping?: string;
  condition?: string;
  availability?: string;
  link?: string;
  updated_t?: number;
}

// UPCItemDB's response schema is third-party and only loosely documented,
// so this models the fields we know about; treat it as a partial view.
export interface UpcItemDbItem {
  ean?: string;
  upc?: string;
  title?: string;
  description?: string;
  brand?: string;
  model?: string;
  color?: string;
  size?: string;
  dimension?: string;
  weight?: string;
  category?: string;
  currency?: string;
  lowest_recorded_price?: number;
  highest_recorded_price?: number;
  images?: string[];
  offers?: UpcItemDbOffer[];
  asin?: string;
  elid?: string;
}

export interface UpcItemDbLookupResponse {
  code: string;
  total?: number;
  offset?: number;
  items?: UpcItemDbItem[];
}

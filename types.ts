
export interface ProductConcept {
  conceptTitle: string;
  displayText: string;
  fusion: string[];
  vision: string;
  whyItWorks: string;
}

export interface ListingCopy {
  title: string;
  description: string;
  variations: string[];
  tags: string[];
}

export type DesignStyle =
  | 'Minimalist Vector'
  | 'Geometric Modern'
  | 'Retro Script'
  | 'Vintage Engraving'
  | 'Watercolor Botanical'
  | 'Cosmic Doodle'
  | 'Art Deco'
  | 'Cyberpunk Glitch';

export type ProductType = 
  | 'Sweatshirt' 
  | 'Mug' 
  | 'Ornament' 
  | 'T-Shirt' 
  | 'Tote Bag' 
  | 'Pillow'
  | 'Hoodie';

export type AppStep =
  | 'CONFIG'
  | 'IDEATION'
  | 'DESIGN'
  | 'FINALIZE';

export interface PrintifyShop {
  id: string;
  title: string;
}

export interface PrintifyImageUploadResponse {
  id: string;
  file_name: string;
  url: string;
}

export interface PrintifyProductResponse {
  id: string;
  title: string;
  external_id: string;
}

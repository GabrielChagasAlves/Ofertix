export interface Product {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  category?: string;
  active: boolean;
  created_at: string;
}

export interface Offer {
  id: string;
  product_id: string;
  marketplace_id: string;
  title: string;
  price: number;
  original_price?: number;
  discount_percentage?: number;
  affiliate_url: string;
  active: boolean;
  created_at: string;
}

export interface Marketplace {
  id: string;
  name: string;
  slug: string;
  active: boolean;
}

export interface DashboardStats {
  products: number;
  offers: number;
  clicks: number;
  publications: number;
}
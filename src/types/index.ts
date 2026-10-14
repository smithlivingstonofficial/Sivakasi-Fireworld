// TypeScript Type Definitions for Single-Shop Sivakasi Fireworld Platform

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon_name?: string;
  display_order: number;
  is_active: boolean;
}

export type SoundLevel = 'Low' | 'Medium' | 'High' | 'Silent';

export interface Product {
  id: string;
  category_id?: string;
  name: string;
  slug: string;
  sku: string;
  description?: string;
  pack_size?: string;
  mrp: number;
  selling_price: number;
  image_url?: string;
  is_active: boolean;
  is_featured: boolean;
  is_best_seller: boolean;
  sound_level?: SoundLevel;
  category?: Category;
  stock?: number;
}

export interface Combo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  mrp: number;
  image_url?: string;
  is_active: boolean;
  items?: ComboItem[];
}

export interface ComboItem {
  id: string;
  combo_id: string;
  product_id: string;
  quantity: number;
  product?: Product;
}

export interface Inventory {
  id: string;
  product_id: string;
  available_stock: number;
  reserved_stock: number;
  safety_threshold: number;
  updated_at: string;
}

export type MovementType = 'PURCHASE' | 'RESERVATION' | 'SALE' | 'CANCELLATION' | 'DAMAGE' | 'ADJUSTMENT';

export interface InventoryMovement {
  id: string;
  product_id: string;
  type: MovementType;
  quantity: number;
  reason?: string;
  created_at: string;
  product_name?: string;
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PACKING' | 'PACKED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';

export interface OrderItem {
  id?: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  image_url?: string;
  mrp?: number;
}

export interface OrderStatusHistory {
  status: OrderStatus;
  timestamp: string;
  note?: string;
  actor?: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string;
  customer_email?: string;
  shipping_address: string;
  city: string;
  state: string;
  pincode: string;
  subtotal: number;
  discount_amount: number;
  delivery_fee: number;
  delivery_fee_set?: boolean;
  grand_total: number;
  status: OrderStatus;
  admin_notes?: string;
  courier_partner?: string;
  tracking_number?: string;
  estimated_delivery?: string;
  is_paid?: boolean;
  payment_method?: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  history?: OrderStatusHistory[];
  tags?: string[];
}

/**
 * Checks whether the delivery charges have been explicitly confirmed and set by an admin.
 * Delivery charges differ from place to place, so until set by admin, they are hidden from user bill prints.
 */
export function isDeliveryFeeSet(order: Order | null | undefined): boolean {
  if (!order) return false;
  if (order.delivery_fee_set === true) return true;
  if (Array.isArray(order.tags) && order.tags.includes('delivery_fee_set')) return true;
  return false;
}

export interface DeliveryZone {
  id: string;
  zone_name: string;
  state_codes: string[];
  min_order_amount: number;
  delivery_fee: number;
  estimated_days: string;
  is_active: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

import { createClient } from '@/lib/supabase/client';
import { Order, OrderStatus, OrderItem } from '@/types';
import { PricingService, CheckoutPayloadItem } from './pricing.service';
import { ProductService } from './product.service';
import { SettingsService } from './settings.service';

export interface CreateOrderDTO {
  customer_name: string;
  customer_mobile: string;
  customer_email?: string;
  shipping_address: string;
  city: string;
  state: string;
  pincode: string;
  items: CheckoutPayloadItem[];
}

export class OrderService {
  private static getSupabase() {
    return createClient();
  }

  /**
   * Generate a sequential order number using the DB sequence.
   * Falls back to timestamp-based suffix if sequence function unavailable.
   */
  private static async generateOrderNumber(): Promise<string> {
    try {
      const supabase = this.getSupabase();
      const { data, error } = await supabase.rpc('next_order_number');
      if (!error && data) return data as string;
    } catch {
      // Sequence function not yet available — use timestamp fallback
    }
    const year = new Date().getFullYear();
    const seq = Date.now().toString().slice(-5);
    return `VPP-${year}-${seq}`;
  }

  static async createOrder(dto: CreateOrderDTO): Promise<Order> {
    if (
      !dto.customer_name ||
      !dto.customer_mobile ||
      !dto.shipping_address ||
      !dto.city ||
      !dto.state ||
      !dto.pincode
    ) {
      throw new Error('Please fill in all mandatory delivery address fields.');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new Error('Your cart is empty.');
    }

    // Fetch live products, delivery zones, and settings from DB for authoritative pricing & rule enforcement
    const [products, zones, settings] = await Promise.all([
      ProductService.getAllProducts(),
      PricingService.fetchDeliveryZones(),
      SettingsService.getAllSettings(),
    ]);

    const pricing = PricingService.calculateOrderPricing(dto.items, dto.state, products, zones, {
      min_order_tamil_nadu: settings.min_order_tamil_nadu,
      min_order_other_states: settings.min_order_other_states,
      state_min_order_overrides: settings.state_min_order_overrides,
    });

    // Check maximum order limit if enabled
    if (settings.max_order_limit_enabled && pricing.subtotal > settings.max_order_limit_amount) {
      throw new Error(
        `Order exceeds maximum allowed online limit of ₹${settings.max_order_limit_amount.toLocaleString('en-IN')}. For bulk orders, please contact our wholesale team directly.`
      );
    }

    if (!pricing.isMinOrderMet) {
      throw new Error(
        `Minimum order required for ${pricing.zoneName} is ₹${pricing.minOrderThreshold.toLocaleString('en-IN')}. Your subtotal is ₹${pricing.subtotal.toLocaleString('en-IN')}.`
      );
    }

    const orderNumber = await this.generateOrderNumber();
    const now = new Date().toISOString();

    const newOrderPayload = {
      order_number: orderNumber,
      customer_name: dto.customer_name.trim(),
      customer_mobile: dto.customer_mobile.trim(),
      customer_email: dto.customer_email?.trim() || null,
      shipping_address: dto.shipping_address.trim(),
      city: dto.city.trim(),
      state: dto.state.trim(),
      pincode: dto.pincode.trim(),
      subtotal: pricing.subtotal,
      discount_amount: pricing.discountAmount,
      delivery_fee: 0,
      delivery_fee_set: false,
      grand_total: pricing.subtotal,
      status: 'PENDING' as OrderStatus,
      is_paid: false,
      payment_method: 'DIRECT_PAYMENT',
      tags: ['delivery_fee_pending'],
      created_at: now,
      updated_at: now,
    };

    const supabase = this.getSupabase();
    let { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert(newOrderPayload)
      .select()
      .maybeSingle();

    if (orderError && (orderError.message?.includes('delivery_fee_set') || (orderError as any).details?.includes('delivery_fee_set'))) {
      delete (newOrderPayload as any).delivery_fee_set;
      const retryRes = await supabase
        .from('orders')
        .insert(newOrderPayload)
        .select()
        .maybeSingle();
      orderData = retryRes.data;
      orderError = retryRes.error;
    }

    if (orderError || !orderData) {
      throw orderError || new Error('Failed to create order. Please try again.');
    }

    // Insert order items
    const orderItemsPayload = pricing.items.map((item) => ({
      order_id: orderData.id,
      product_id: item.product_id,
      product_name: item.product_name,
      unit_price: item.unit_price,
      quantity: item.quantity,
      total_price: item.total_price,
    }));

    const { data: itemsData } = await supabase
      .from('order_items')
      .insert(orderItemsPayload)
      .select();

    const createdOrder: Order = {
      ...orderData,
      grand_total: Number(orderData.grand_total),
      subtotal: Number(orderData.subtotal),
      delivery_fee: Number(orderData.delivery_fee || 0),
      delivery_fee_set: false,
      discount_amount: Number(orderData.discount_amount),
      items: (itemsData as any[])?.map((item) => {
        const matched = pricing.items.find((p) => p.product_id === item.product_id);
        return {
          ...item,
          mrp: matched?.mrp || item.mrp,
        };
      }) || pricing.items,
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('vpp_last_created_order', JSON.stringify(createdOrder));
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('vpp_orders_channel');
          bc.postMessage({ type: 'NEW_ORDER', order: createdOrder });
          bc.close();
        }
      } catch (e) {
        console.error('Failed to broadcast order creation:', e);
      }
    }

    return createdOrder;
  }

  private static isUuid(val: string): boolean {
    if (!val) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
  }

  static async getOrderById(id: string): Promise<Order | null> {
    if (!id) return null;
    const cleanId = id.trim();
    const supabase = this.getSupabase();
    
    try {
      let query = supabase.from('orders').select('*, items:order_items(*)');
      if (this.isUuid(cleanId)) {
        query = query.or(`id.eq.${cleanId},order_number.eq.${cleanId}`);
      } else {
        query = query.ilike('order_number', cleanId);
      }

      const { data, error } = await query.maybeSingle();

      if (!error && data) {
        return {
          ...data,
          grand_total: Number(data.grand_total),
          subtotal: Number(data.subtotal),
          delivery_fee: Number(data.delivery_fee || 0),
          delivery_fee_set: Boolean(
            data.delivery_fee_set === true ||
            (Array.isArray(data.tags) && data.tags.includes('delivery_fee_set'))
          ),
          discount_amount: Number(data.discount_amount),
        };
      }
    } catch (err) {
      console.warn('OrderService.getOrderById direct query error:', err);
    }

    // Resilient fallback: search in getAllOrders
    try {
      const allOrders = await this.getAllOrders();
      const found = allOrders.find(
        (o) =>
          o.id.toLowerCase() === cleanId.toLowerCase() ||
          o.order_number.toLowerCase() === cleanId.toLowerCase() ||
          o.order_number.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
      );
      if (found) return found;
    } catch (err) {
      console.error('OrderService.getOrderById fallback error:', err);
    }

    return null;
  }

  static async getAllOrders(): Promise<Order[]> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('OrderService.getAllOrders error:', error?.message);
      return [];
    }

    return data.map((item: any) => ({
      id: item.id,
      order_number: item.order_number,
      customer_name: item.customer_name,
      customer_mobile: item.customer_mobile,
      customer_email: item.customer_email,
      shipping_address: item.shipping_address,
      city: item.city,
      state: item.state,
      pincode: item.pincode,
      subtotal: Number(item.subtotal),
      discount_amount: Number(item.discount_amount || 0),
      delivery_fee: Number(item.delivery_fee || 0),
      delivery_fee_set: Boolean(
        item.delivery_fee_set === true ||
        (Array.isArray(item.tags) && item.tags.includes('delivery_fee_set'))
      ),
      grand_total: Number(item.grand_total),
      status: item.status,
      admin_notes: item.admin_notes,
      courier_partner: item.courier_partner,
      tracking_number: item.tracking_number,
      estimated_delivery: item.estimated_delivery,
      is_paid: item.is_paid ?? false,
      payment_method: item.payment_method ?? 'DIRECT_PAYMENT',
      created_at: item.created_at,
      updated_at: item.updated_at,
      items: item.items
        ? item.items.map((i: any) => ({
            id: i.id,
            product_id: i.product_id,
            product_name: i.product_name,
            unit_price: Number(i.unit_price),
            quantity: i.quantity,
            total_price: Number(i.total_price),
          }))
        : [],
    }));
  }

  static async updateOrderStatus(
    id: string,
    status: OrderStatus,
    adminNotes?: string
  ): Promise<Order> {
    const supabase = this.getSupabase();
    const cleanId = id.trim();
    const isIdUuid = this.isUuid(cleanId);

    // Retrieve current order for history continuity
    const current = await this.getOrderById(cleanId);
    const nowIso = new Date().toISOString();

    const newHistoryItem = {
      status,
      timestamp: nowIso,
      note: adminNotes || `Status updated to ${status}`,
      actor: 'Admin',
    };

    const updatedHistory = current && Array.isArray(current.history)
      ? [...current.history, newHistoryItem]
      : [newHistoryItem];

    const updatePayload: any = {
      status,
      updated_at: nowIso,
      history: updatedHistory,
    };
    if (adminNotes !== undefined) updatePayload.admin_notes = adminNotes;

    let query = isIdUuid
      ? supabase.from('orders').update(updatePayload).eq('id', cleanId)
      : supabase.from('orders').update(updatePayload).eq('order_number', cleanId);

    let { data, error } = await query.select('*, items:order_items(*)').maybeSingle();

    // If failed due to history column not existing, retry without history
    if (error) {
      console.warn('updateOrderStatus retrying without history column:', error.message);
      delete updatePayload.history;
      query = isIdUuid
        ? supabase.from('orders').update(updatePayload).eq('id', cleanId)
        : supabase.from('orders').update(updatePayload).eq('order_number', cleanId);
      const retryRes = await query.select('*, items:order_items(*)').maybeSingle();
      data = retryRes.data;
      error = retryRes.error;
    }

    if (error || !data) {
      console.error('OrderService.updateOrderStatus error:', error?.message);
      throw new Error(error?.message || `Failed to update order ${id}.`);
    }

    const updatedOrder: Order = {
      ...data,
      history: data.history || updatedHistory,
      grand_total: Number(data.grand_total),
      subtotal: Number(data.subtotal),
      delivery_fee: Number(data.delivery_fee || 0),
      delivery_fee_set: Boolean(
        data.delivery_fee_set === true ||
        (Array.isArray(data.tags) && data.tags.includes('delivery_fee_set'))
      ),
      discount_amount: Number(data.discount_amount),
    };

    if (typeof window !== 'undefined') {
      try {
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('vpp_orders_channel');
          bc.postMessage({
            type: 'ORDER_STATUS_CHANGED',
            orderId: updatedOrder.id,
            orderNumber: updatedOrder.order_number,
            status,
            order: updatedOrder,
          });
          bc.close();
        }
      } catch (e) {
        console.error('Failed to broadcast order status update:', e);
      }
    }

    return updatedOrder;
  }

  static async cancelOrder(
    id: string,
    reason?: string,
    cancelledBy: 'CUSTOMER' | 'ADMIN' = 'ADMIN'
  ): Promise<Order> {
    const supabase = this.getSupabase();
    const cleanId = id.trim();

    // First retrieve current order to verify status and preserve notes
    const current = await this.getOrderById(cleanId);
    if (!current) {
      throw new Error(`Order ${id} not found.`);
    }

    if (current.status === 'CANCELLED') {
      return current;
    }

    if (current.status === 'DELIVERED') {
      throw new Error('Delivered orders cannot be cancelled.');
    }

    if (cancelledBy === 'CUSTOMER' && current.status === 'DISPATCHED') {
      throw new Error(
        'Your order has already been dispatched with the courier and cannot be cancelled online. Please contact support on WhatsApp to request an interception.'
      );
    }

    const timestamp = new Date().toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const notePrefix = cancelledBy === 'CUSTOMER' ? '[Customer Cancellation]' : '[Admin Cancellation]';
    const reasonText = reason ? `${notePrefix} (${timestamp}): ${reason}` : `${notePrefix} (${timestamp}): Order cancelled.`;
    const updatedNotes = current.admin_notes
      ? `${current.admin_notes}\n${reasonText}`
      : reasonText;

    const newHistoryItem = {
      status: 'CANCELLED' as OrderStatus,
      timestamp: new Date().toISOString(),
      note: reason || `Cancelled by ${cancelledBy === 'ADMIN' ? 'Admin' : 'Customer'}`,
      actor: cancelledBy === 'ADMIN' ? 'Admin' : 'Customer',
    };

    const updatedHistory = Array.isArray(current.history)
      ? [...current.history, newHistoryItem]
      : [newHistoryItem];

    const isCurrentUuid = this.isUuid(current.id);
    const updatePayload: any = {
      status: 'CANCELLED',
      admin_notes: updatedNotes,
      history: updatedHistory,
      updated_at: new Date().toISOString(),
    };

    let query = isCurrentUuid
      ? supabase.from('orders').update(updatePayload).eq('id', current.id)
      : supabase.from('orders').update(updatePayload).eq('order_number', current.order_number);

    let { data, error } = await query.select('*, items:order_items(*)').maybeSingle();

    // If update with history fails, retry without history column
    if (error) {
      console.warn('OrderService.cancelOrder retrying without history column:', error.message);
      delete updatePayload.history;
      query = isCurrentUuid
        ? supabase.from('orders').update(updatePayload).eq('id', current.id)
        : supabase.from('orders').update(updatePayload).eq('order_number', current.order_number);
      const retryRes = await query.select('*, items:order_items(*)').maybeSingle();
      data = retryRes.data;
      error = retryRes.error;
    }

    if (error || !data) {
      console.error('OrderService.cancelOrder error:', error?.message);
      throw new Error(error?.message || `Failed to cancel order ${id}.`);
    }

    const cancelledOrder: Order = {
      ...data,
      history: data.history || updatedHistory,
      grand_total: Number(data.grand_total),
      subtotal: Number(data.subtotal),
      delivery_fee: Number(data.delivery_fee || 0),
      delivery_fee_set: Boolean(
        data.delivery_fee_set === true ||
        (Array.isArray(data.tags) && data.tags.includes('delivery_fee_set'))
      ),
      discount_amount: Number(data.discount_amount),
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('vpp_last_cancelled_order', JSON.stringify(cancelledOrder));
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('vpp_orders_channel');
          bc.postMessage({
            type: 'ORDER_CANCELLED',
            orderId: current.id,
            orderNumber: cancelledOrder.order_number,
            order: cancelledOrder,
            cancelledBy,
            reason: reason || 'Order cancelled by Admin',
          });
          bc.postMessage({
            type: 'ORDER_STATUS_CHANGED',
            orderId: current.id,
            orderNumber: cancelledOrder.order_number,
            status: 'CANCELLED',
            order: cancelledOrder,
          });
          bc.close();
        }
      } catch (e) {
        console.error('Failed to broadcast cancellation:', e);
      }
    }

    return cancelledOrder;
  }

  static async reopenOrder(
    id: string,
    restoreStatus: OrderStatus = 'CONFIRMED',
    reason?: string
  ): Promise<Order> {
    const supabase = this.getSupabase();
    const cleanId = id.trim();

    const current = await this.getOrderById(cleanId);
    if (!current) {
      throw new Error(`Order ${id} not found.`);
    }

    const timestamp = new Date().toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const reopenText = reason
      ? `[Admin Reopened] (${timestamp}): Restored from CANCELLED to ${restoreStatus}. Reason: ${reason}`
      : `[Admin Reopened] (${timestamp}): Restored from CANCELLED to ${restoreStatus}.`;

    const updatedNotes = current.admin_notes
      ? `${current.admin_notes}\n${reopenText}`
      : reopenText;

    const newHistoryItem = {
      status: restoreStatus,
      timestamp: new Date().toISOString(),
      note: reason || `Reopened order by Admin to ${restoreStatus}`,
      actor: 'Admin',
    };

    const updatedHistory = Array.isArray(current.history)
      ? [...current.history, newHistoryItem]
      : [newHistoryItem];

    const isCurrentUuid = this.isUuid(current.id);
    const updatePayload: any = {
      status: restoreStatus,
      admin_notes: updatedNotes,
      history: updatedHistory,
      updated_at: new Date().toISOString(),
    };

    let query = isCurrentUuid
      ? supabase.from('orders').update(updatePayload).eq('id', current.id)
      : supabase.from('orders').update(updatePayload).eq('order_number', current.order_number);

    let { data, error } = await query.select('*, items:order_items(*)').maybeSingle();

    if (error) {
      delete updatePayload.history;
      query = isCurrentUuid
        ? supabase.from('orders').update(updatePayload).eq('id', current.id)
        : supabase.from('orders').update(updatePayload).eq('order_number', current.order_number);
      const retryRes = await query.select('*, items:order_items(*)').maybeSingle();
      data = retryRes.data;
      error = retryRes.error;
    }

    if (error || !data) {
      throw new Error(error?.message || `Failed to reopen order ${id}.`);
    }

    const restoredOrder: Order = {
      ...data,
      history: data.history || updatedHistory,
      grand_total: Number(data.grand_total),
      subtotal: Number(data.subtotal),
      delivery_fee: Number(data.delivery_fee || 0),
      delivery_fee_set: Boolean(
        data.delivery_fee_set === true ||
        (Array.isArray(data.tags) && data.tags.includes('delivery_fee_set'))
      ),
      discount_amount: Number(data.discount_amount),
    };

    if (typeof window !== 'undefined') {
      try {
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('vpp_orders_channel');
          bc.postMessage({
            type: 'ORDER_STATUS_CHANGED',
            orderId: current.id,
            orderNumber: restoredOrder.order_number,
            status: restoreStatus,
            order: restoredOrder,
          });
          bc.close();
        }
      } catch (e) {
        console.error('Failed to broadcast reopen order:', e);
      }
    }

    return restoredOrder;
  }

  static async updateOrderLogistics(
    id: string,
    logistics: {
      courier_partner?: string;
      tracking_number?: string;
      estimated_delivery?: string;
      admin_notes?: string;
      status?: OrderStatus;
    }
  ): Promise<Order> {
    const supabase = this.getSupabase();
    const cleanId = id.trim();
    const isIdUuid = this.isUuid(cleanId);

    const payload: any = { updated_at: new Date().toISOString() };
    if (logistics.courier_partner !== undefined) payload.courier_partner = logistics.courier_partner;
    if (logistics.tracking_number !== undefined) payload.tracking_number = logistics.tracking_number;
    if (logistics.estimated_delivery !== undefined) payload.estimated_delivery = logistics.estimated_delivery;
    if (logistics.admin_notes !== undefined) payload.admin_notes = logistics.admin_notes;
    if (logistics.status !== undefined) payload.status = logistics.status;

    const query = isIdUuid
      ? supabase.from('orders').update(payload).eq('id', cleanId)
      : supabase.from('orders').update(payload).eq('order_number', cleanId);

    const { data, error } = await query
      .select('*, items:order_items(*)')
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || `Failed to update logistics for order ${id}.`);
    }

    return {
      ...data,
      grand_total: Number(data.grand_total),
      subtotal: Number(data.subtotal),
      delivery_fee: Number(data.delivery_fee || 0),
      delivery_fee_set: Boolean(
        data.delivery_fee_set === true ||
        (Array.isArray(data.tags) && data.tags.includes('delivery_fee_set'))
      ),
      discount_amount: Number(data.discount_amount),
    };
  }

  static async markOrderPaid(id: string, isPaid: boolean): Promise<Order> {
    const supabase = this.getSupabase();
    const cleanId = id.trim();
    const isIdUuid = this.isUuid(cleanId);

    const query = isIdUuid
      ? supabase.from('orders').update({ is_paid: isPaid, updated_at: new Date().toISOString() }).eq('id', cleanId)
      : supabase.from('orders').update({ is_paid: isPaid, updated_at: new Date().toISOString() }).eq('order_number', cleanId);

    const { data, error } = await query
      .select('*, items:order_items(*)')
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message || `Failed to update payment for order ${id}.`);
    }

    return {
      ...data,
      grand_total: Number(data.grand_total),
      subtotal: Number(data.subtotal),
      delivery_fee: Number(data.delivery_fee || 0),
      delivery_fee_set: Boolean(
        data.delivery_fee_set === true ||
        (Array.isArray(data.tags) && data.tags.includes('delivery_fee_set'))
      ),
      discount_amount: Number(data.discount_amount),
    };
  }

  /**
   * Set or update delivery charges for an order.
   * Delivery charges differ by destination place and will only appear in the user bill print once set here.
   */
  static async updateDeliveryFee(
    id: string,
    deliveryFee: number,
    isSet: boolean = true
  ): Promise<Order> {
    const supabase = this.getSupabase();
    const cleanId = id.trim();
    const isIdUuid = this.isUuid(cleanId);

    const current = await this.getOrderById(cleanId);
    if (!current) {
      throw new Error(`Order ${id} not found.`);
    }

    const fee = Math.max(0, Number(deliveryFee) || 0);
    const newGrandTotal = isSet ? (current.subtotal + fee) : current.subtotal;
    const currentTags = Array.isArray(current.tags) ? current.tags : [];
    const updatedTags = isSet
      ? Array.from(new Set([...currentTags.filter((t) => t !== 'delivery_fee_pending'), 'delivery_fee_set']))
      : Array.from(new Set([...currentTags.filter((t) => t !== 'delivery_fee_set'), 'delivery_fee_pending']));

    const timestamp = new Date().toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    const noteText = isSet
      ? `[Delivery Charge Updated] (${timestamp}): Set to ₹${fee.toLocaleString('en-IN')} by Admin`
      : `[Delivery Charge Reset] (${timestamp}): Reset to pending / hidden from bill`;

    const updatedNotes = current.admin_notes
      ? `${current.admin_notes}\n${noteText}`
      : noteText;

    const payload: any = {
      delivery_fee: fee,
      delivery_fee_set: isSet,
      grand_total: newGrandTotal,
      tags: updatedTags,
      admin_notes: updatedNotes,
      updated_at: new Date().toISOString(),
    };

    let query = isIdUuid
      ? supabase.from('orders').update(payload).eq('id', cleanId)
      : supabase.from('orders').update(payload).eq('order_number', cleanId);

    let { data, error } = await query.select('*, items:order_items(*)').maybeSingle();

    if (error && (error.message?.includes('delivery_fee_set') || (error as any).details?.includes('delivery_fee_set'))) {
      delete payload.delivery_fee_set;
      query = isIdUuid
        ? supabase.from('orders').update(payload).eq('id', cleanId)
        : supabase.from('orders').update(payload).eq('order_number', cleanId);
      const retryRes = await query.select('*, items:order_items(*)').maybeSingle();
      data = retryRes.data;
      error = retryRes.error;
    }

    if (error || !data) {
      throw new Error(error?.message || `Failed to update delivery fee for order ${id}.`);
    }

    const updatedOrder: Order = {
      ...data,
      grand_total: Number(data.grand_total),
      subtotal: Number(data.subtotal),
      delivery_fee: Number(data.delivery_fee),
      delivery_fee_set: isSet,
      discount_amount: Number(data.discount_amount),
    };

    if (typeof window !== 'undefined') {
      try {
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('vpp_orders_channel');
          bc.postMessage({
            type: 'ORDER_STATUS_CHANGED',
            orderId: current.id,
            orderNumber: updatedOrder.order_number,
            status: updatedOrder.status,
            order: updatedOrder,
          });
          bc.close();
        }
      } catch (e) {
        console.error('Failed to broadcast delivery fee change:', e);
      }
    }

    return updatedOrder;
  }

  /**
   * Fetch summary stats for the dashboard KPIs.
   */
  static async getOrderStats(): Promise<{
    totalRevenue: number;
    totalOrders: number;
    todayRevenue: number;
    todayOrders: number;
    pendingCount: number;
  }> {
    const supabase = this.getSupabase();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('orders')
      .select('grand_total, status, created_at');

    if (error || !data) return { totalRevenue: 0, totalOrders: 0, todayRevenue: 0, todayOrders: 0, pendingCount: 0 };

    const todayStartISO = todayStart.toISOString();
    let totalRevenue = 0, todayRevenue = 0, todayOrders = 0, pendingCount = 0;

    for (const o of data) {
      const total = Number(o.grand_total);
      totalRevenue += total;
      if (o.created_at >= todayStartISO) {
        todayRevenue += total;
        todayOrders++;
      }
      if (['PENDING', 'CONFIRMED', 'PACKING'].includes(o.status)) pendingCount++;
    }

    return {
      totalRevenue,
      totalOrders: data.length,
      todayRevenue,
      todayOrders,
      pendingCount,
    };
  }
}

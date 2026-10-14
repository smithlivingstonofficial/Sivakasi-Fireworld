'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase/client';
import { OrderService } from '@/lib/services/order.service';
import { Order, OrderStatus, isDeliveryFeeSet } from '@/types';

// Import Modular Components
import { OrderMetrics } from '@/components/admin/orders/OrderMetrics';
import { OrderFilterToolbar } from '@/components/admin/orders/OrderFilterToolbar';
import { BatchActionBar } from '@/components/admin/orders/BatchActionBar';
import { OrdersTableView } from '@/components/admin/orders/OrdersTableView';
import { OrdersCardView } from '@/components/admin/orders/OrdersCardView';
import { PackingSlipModal } from '@/components/admin/orders/PackingSlipModal';
import { WarehousePackingSlipModal } from '@/components/admin/orders/WarehousePackingSlipModal';
import { SetDeliveryFeeModal } from '@/components/admin/orders/SetDeliveryFeeModal';
import {
  StatusConfirmationModal,
  PendingStatusChange,
} from '@/components/admin/orders/StatusConfirmationModal';
import {
  ToastNotification,
  ToastMessage,
} from '@/components/admin/orders/ToastNotification';
import { WhatsAppModal } from '@/components/admin/orders/WhatsAppModal';
import { WhatsAppTemplateType } from '@/lib/services/whatsapp.service';

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeStatusTab, setActiveStatusTab] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const [packingSlipOrder, setPackingSlipOrder] = useState<Order | null>(null);
  const [warehousePackingSlipOrder, setWarehousePackingSlipOrder] = useState<Order | null>(null);
  const [deliveryFeeModalOrder, setDeliveryFeeModalOrder] = useState<Order | null>(null);
  const [whatsAppOrder, setWhatsAppOrder] = useState<Order | null>(null);
  const [whatsAppTemplate, setWhatsAppTemplate] = useState<WhatsAppTemplateType | undefined>(undefined);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(null);

  // Real-time Toast Messages state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Automatically detect mobile viewport and switch to Card view on mobile
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth < 768) {
        setViewMode('cards');
      } else {
        setViewMode('table');
      }
    }
  }, []);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchOrders = useCallback(async () => {
    const data = await OrderService.getAllOrders();
    setOrders(data);
  }, []);

  useEffect(() => {
    fetchOrders();

    // 1. Cross-tab BroadcastChannel listener for immediate local tab updates
    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      broadcastChannel = new BroadcastChannel('vpp_orders_channel');
      broadcastChannel.onmessage = (event) => {
        if (
          event.data?.type === 'NEW_ORDER' ||
          event.data?.type === 'ORDER_CANCELLED' ||
          event.data?.type === 'ORDER_STATUS_CHANGED'
        ) {
          fetchOrders();
          if (event.data?.type === 'ORDER_CANCELLED') {
            addToast(
              `Order #${event.data.orderNumber} was cancelled by ${event.data.cancelledBy || 'customer'}${
                event.data.reason ? `: "${event.data.reason}"` : ''
              }`,
              'info'
            );
          }
        }
      };
    }

    // 2. Supabase Realtime subscription for cross-device/cross-network instant sync
    const supabase = createClient();
    const channel = supabase
      .channel('admin-orders-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        fetchOrders();
        if (payload.eventType === 'UPDATE' && (payload.new as any)?.status === 'CANCELLED') {
          addToast(`Order #${(payload.new as any).order_number} has been cancelled`, 'info');
        }
      })
      .subscribe();

    // 3. Fallback polling interval every 25 seconds
    const interval = setInterval(fetchOrders, 25_000);

    return () => {
      supabase.removeChannel(channel);
      if (broadcastChannel) broadcastChannel.close();
      clearInterval(interval);
    };
  }, [fetchOrders]);

  // Filtered Orders Computation
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesTab = activeStatusTab === 'ALL' || order.status === activeStatusTab;

      const matchesSearch =
        !searchQuery ||
        order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer_mobile.includes(searchQuery) ||
        order.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.pincode.includes(searchQuery);

      let matchesDate = true;
      if (dateFilter !== 'ALL') {
        const created = new Date(order.created_at);
        const now = new Date();
        if (dateFilter === 'Today') {
          matchesDate = created.toDateString() === now.toDateString();
        } else if (dateFilter === 'Last 7 Days') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          matchesDate = created >= sevenDaysAgo;
        } else if (dateFilter === 'This Month') {
          matchesDate =
            created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
        }
      }

      return matchesTab && matchesSearch && matchesDate;
    });
  }, [orders, activeStatusTab, dateFilter, searchQuery]);

  // Request Status Change Modal
  const requestStatusChange = (
    orderId: string,
    orderNumber: string,
    currentStatus: OrderStatus,
    newStatus: OrderStatus
  ) => {
    if (currentStatus === newStatus) return;
    setPendingStatusChange({
      orderId,
      orderNumber,
      currentStatus,
      newStatus,
    });
  };

  // Confirm Status Change
  const confirmStatusChange = async () => {
    if (!pendingStatusChange) return;

    const { orderId, newStatus } = pendingStatusChange;
    const updated = await OrderService.updateOrderStatus(orderId, newStatus);

    setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));

    addToast(`Order #${pendingStatusChange.orderNumber} updated to ${newStatus}`, 'success');
    setPendingStatusChange(null);
  };

  // Toggle Payment Settlement — persists to DB
  const handleTogglePaymentSettlement = async (orderId: string) => {
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;
    const newPaidState = !target.is_paid;

    try {
      const updated = await OrderService.markOrderPaid(orderId, newPaidState);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      addToast(
        `Payment marked as ${newPaidState ? 'PAID ✓' : 'UNPAID'} for ${target.order_number}`,
        'info'
      );
    } catch (err: any) {
      addToast(`Failed to update payment: ${err.message}`, 'error');
    }
  };

  // Save Logistics Info — persists ALL logistics fields to DB
  const handleSaveLogistics = async (
    orderId: string,
    courierPartner: string,
    trackingNumber: string,
    estDeliveryDays: string,
    adminNotes?: string
  ) => {
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;

    const newStatus: OrderStatus =
      target.status === 'PENDING' ||
      target.status === 'CONFIRMED' ||
      target.status === 'PACKING' ||
      target.status === 'PACKED'
        ? 'DISPATCHED'
        : target.status;

    try {
      const updated = await OrderService.updateOrderLogistics(orderId, {
        courier_partner: courierPartner,
        tracking_number: trackingNumber,
        estimated_delivery: estDeliveryDays,
        admin_notes: adminNotes,
        status: newStatus,
      });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      addToast(`Logistics saved & order marked as ${newStatus}`, 'success');
    } catch (err: any) {
      addToast(`Failed to save logistics: ${err.message}`, 'error');
    }
  };

  // Multi-Selection Handlers
  const handleSelectAll = () => {
    if (selectedOrderIds.length === filteredOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map((o) => o.id));
    }
  };

  const handleToggleOrderSelection = (id: string) => {
    if (selectedOrderIds.includes(id)) {
      setSelectedOrderIds(selectedOrderIds.filter((item) => item !== id));
    } else {
      setSelectedOrderIds([...selectedOrderIds, id]);
    }
  };

  const handleBulkStatusUpdate = async (status: OrderStatus) => {
    for (const id of selectedOrderIds) {
      await OrderService.updateOrderStatus(id, status);
    }
    const data = await OrderService.getAllOrders();
    setOrders(data);
    addToast(`Bulk updated ${selectedOrderIds.length} orders to ${status}`, 'success');
    setSelectedOrderIds([]);
  };

  const handleBulkPaymentUpdate = async (isPaid: boolean) => {
    setOrders((prev) =>
      prev.map((o) => (selectedOrderIds.includes(o.id) ? { ...o, is_paid: isPaid } : o))
    );
    addToast(`Bulk updated ${selectedOrderIds.length} orders as ${isPaid ? 'PAID' : 'UNPAID'}`, 'info');
    setSelectedOrderIds([]);
  };

  const handleExportCSV = () => {
    const ordersToExport =
      selectedOrderIds.length > 0
        ? orders.filter((o) => selectedOrderIds.includes(o.id))
        : filteredOrders;

    const data = ordersToExport.map((o) => ({
      'Order Number': o.order_number,
      'Customer Name': o.customer_name,
      'Mobile Number': o.customer_mobile,
      'Shipping Address': `${o.shipping_address}, ${o.city}, ${o.state} - ${o.pincode}`,
      City: o.city,
      State: o.state,
      Status: o.status,
      'Payment Settled': o.is_paid ? 'YES' : 'NO',
      Subtotal: o.subtotal,
      'Delivery Fee': isDeliveryFeeSet(o) ? o.delivery_fee : 'Pending (Hidden on Bill)',
      'Grand Total': isDeliveryFeeSet(o) ? o.grand_total : o.subtotal,
      'Courier Partner': o.courier_partner || '',
      'Tracking LR': o.tracking_number || '',
      'Created Date': new Date(o.created_at).toLocaleString('en-IN'),
    }));

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Sivakasi_Fireworld_Orders_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast(`Exported ${ordersToExport.length} orders to CSV`, 'success');
  };

  const handleResetFilters = () => {
    setActiveStatusTab('ALL');
    setDateFilter('ALL');
    setSearchQuery('');
    addToast('Order filters reset to default', 'info');
  };

  const handleOpenWhatsAppModal = (order: Order, template?: WhatsAppTemplateType) => {
    setWhatsAppTemplate(template || 'ORDER_RECEIPT');
    setWhatsAppOrder(order);
  };

  return (
    <div className="space-y-3.5 sm:space-y-5">
      {/* Operations Executive KPI Metric Strip */}
      <OrderMetrics
        orders={orders}
        activeStatusTab={activeStatusTab}
        onSelectStatusTab={setActiveStatusTab}
      />

      {/* Multi-Filter & Search Toolbar */}
      <OrderFilterToolbar
        orders={orders}
        filteredOrders={filteredOrders}
        activeStatusTab={activeStatusTab}
        setActiveStatusTab={setActiveStatusTab}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedOrderIds={selectedOrderIds}
        onSelectAll={handleSelectAll}
        onResetFilters={handleResetFilters}
        onExportCSV={handleExportCSV}
      />

      {/* Main Orders Display Area */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/90 p-10 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 mx-auto flex items-center justify-center font-bold text-xl border border-amber-200">
            🔍
          </div>
          <p className="text-slate-700 text-sm font-bold">No orders found matching criteria.</p>
          <p className="text-slate-400 text-xs">Try searching for a different order number, mobile, or city name.</p>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-2xs transition-all cursor-pointer inline-block mt-2"
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <OrdersTableView
          orders={filteredOrders}
          selectedOrderIds={selectedOrderIds}
          onToggleSelection={handleToggleOrderSelection}
          onSelectAll={handleSelectAll}
          onSelectOrder={(order) => router.push(`/admin/orders/${order.order_number}`)}
          onPrintSlip={(order) => setPackingSlipOrder(order)}
          onPrintPackingSlip={(order) => setWarehousePackingSlipOrder(order)}
          onSetDeliveryFee={(order) => setDeliveryFeeModalOrder(order)}
          onRequestStatusChange={requestStatusChange}
          onTogglePaymentSettlement={handleTogglePaymentSettlement}
          onOpenWhatsAppModal={handleOpenWhatsAppModal}
        />
      ) : (
        <OrdersCardView
          orders={filteredOrders}
          selectedOrderIds={selectedOrderIds}
          onToggleSelection={handleToggleOrderSelection}
          onSelectOrder={(order) => router.push(`/admin/orders/${order.order_number}`)}
          onPrintSlip={(order) => setPackingSlipOrder(order)}
          onPrintPackingSlip={(order) => setWarehousePackingSlipOrder(order)}
          onSetDeliveryFee={(order) => setDeliveryFeeModalOrder(order)}
          onRequestStatusChange={requestStatusChange}
          onTogglePaymentSettlement={handleTogglePaymentSettlement}
          onOpenWhatsAppModal={handleOpenWhatsAppModal}
        />
      )}

      {/* Floating Batch Operations Bar */}
      <BatchActionBar
        selectedCount={selectedOrderIds.length}
        onBulkStatusUpdate={handleBulkStatusUpdate}
        onExportCSV={handleExportCSV}
        onDeselectAll={() => setSelectedOrderIds([])}
      />

      {/* WhatsApp Message Composer Modal */}
      <WhatsAppModal
        order={whatsAppOrder}
        initialTemplate={whatsAppTemplate}
        onClose={() => setWhatsAppOrder(null)}
        onShowToast={addToast}
      />

      {/* Status Transition Confirmation Modal */}
      <StatusConfirmationModal
        pendingStatusChange={pendingStatusChange}
        onCancel={() => setPendingStatusChange(null)}
        onConfirm={confirmStatusChange}
      />

      {/* Set Delivery Fee Modal */}
      <SetDeliveryFeeModal
        order={deliveryFeeModalOrder}
        onClose={() => setDeliveryFeeModalOrder(null)}
        onSaved={(updated) => {
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
          addToast(
            `Delivery charges set to ₹${updated.delivery_fee} & applied to bill for #${updated.order_number}`,
            'success'
          );
        }}
      />

      {/* Bill & Tax Invoice Modal */}
      <PackingSlipModal
        order={packingSlipOrder}
        onClose={() => setPackingSlipOrder(null)}
      />

      {/* Dedicated Warehouse Packing Slip Modal */}
      <WarehousePackingSlipModal
        order={warehousePackingSlipOrder}
        onClose={() => setWarehousePackingSlipOrder(null)}
      />

      {/* Toast Feedback Manager */}
      <ToastNotification toasts={toasts} onDismiss={handleDismissToast} />
    </div>
  );
}

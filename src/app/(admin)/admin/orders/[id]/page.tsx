'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Printer,
  Phone,
  MapPin,
  Calendar,
  CheckCircle2,
  Package,
  Truck,
  XCircle,
  Clock,
  Sparkles,
  IndianRupee,
  FileText,
  User,
  Copy,
  Check,
  Send,
  History,
  ShieldCheck,
  Ban,
  RotateCcw,
  RefreshCw,
  Mail,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  CreditCard,
  Building,
  CheckCheck,
  PackageCheck,
} from 'lucide-react';
import { WhatsAppIcon } from '@/components/common/WhatsAppIcon';
import { OrderService } from '@/lib/services/order.service';
import { ProductService } from '@/lib/services/product.service';
import { Order, OrderStatus, OrderItem, Product, isDeliveryFeeSet } from '@/types';
import { WhatsAppModal } from '@/components/admin/orders/WhatsAppModal';
import { PackingSlipModal } from '@/components/admin/orders/PackingSlipModal';
import { WarehousePackingSlipModal } from '@/components/admin/orders/WarehousePackingSlipModal';
import { StatusConfirmationModal, PendingStatusChange } from '@/components/admin/orders/StatusConfirmationModal';
import { CancelOrderModal } from '@/components/admin/orders/CancelOrderModal';
import { ReopenOrderModal } from '@/components/admin/orders/ReopenOrderModal';
import { SetDeliveryFeeModal } from '@/components/admin/orders/SetDeliveryFeeModal';
import { ToastNotification, ToastMessage } from '@/components/admin/orders/ToastNotification';
import { WhatsAppTemplateType } from '@/lib/services/whatsapp.service';
import { AdminProductModal } from '@/components/admin/orders/AdminProductModal';

interface PageProps {
  params: Promise<{ id: string }>;
}

const CARRIER_OPTIONS = [
  'ST Courier',
  'Professional Courier',
  'VRL Logistics',
  'BlueDart Express',
  'DTDC Express',
  'Direct Lorry Freight',
  'Local Warehouse Pickup',
];

const ORDER_STAGES: { status: OrderStatus; label: string; icon: React.ComponentType<any> }[] = [
  { status: 'PENDING', label: 'Order Placed', icon: Clock },
  { status: 'CONFIRMED', label: 'Confirmed', icon: CheckCircle2 },
  { status: 'PACKING', label: 'Packing', icon: Package },
  { status: 'DISPATCHED', label: 'Dispatched', icon: Truck },
  { status: 'DELIVERED', label: 'Delivered', icon: CheckCheck },
];

const STAGE_ORDER: Record<OrderStatus, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PACKING: 2,
  PACKED: 2,
  DISPATCHED: 3,
  DELIVERED: 4,
  CANCELLED: -1,
};

export default function SingleOrderDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const orderIdParam = resolvedParams.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Logistics form state
  const [courierPartner, setCourierPartner] = useState<string>('ST Courier');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [estDeliveryDays, setEstDeliveryDays] = useState<string>('2-3 Days');
  const [adminNotesInput, setAdminNotesInput] = useState<string>('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingLogistics, setSavingLogistics] = useState(false);

  // Delivery Charges configuration state
  const [isDeliveryFeeModalOpen, setIsDeliveryFeeModalOpen] = useState(false);
  const [deliveryFeeInput, setDeliveryFeeInput] = useState<string>('');
  const [savingDeliveryFee, setSavingDeliveryFee] = useState(false);

  // Modals state
  const [isPackingSlipOpen, setIsPackingSlipOpen] = useState(false);
  const [isWarehousePackingSlipOpen, setIsWarehousePackingSlipOpen] = useState(false);
  const [whatsAppTemplate, setWhatsAppTemplate] = useState<WhatsAppTemplateType>('ORDER_RECEIPT');
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(null);
  const [selectedProductItem, setSelectedProductItem] = useState<OrderItem | null>(null);
  const [selectedProductMetadata, setSelectedProductMetadata] = useState<Product | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const fetchOrderDetails = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const found = await OrderService.getOrderById(orderIdParam);
      if (found) {
        setOrder(found);
        setCourierPartner(found.courier_partner || 'ST Courier');
        setTrackingNumber(found.tracking_number || '');
        setEstDeliveryDays(found.estimated_delivery || '2-3 Days');
        setAdminNotesInput(found.admin_notes || '');
        setDeliveryFeeInput(isDeliveryFeeSet(found) ? String(found.delivery_fee) : '');
        if (isManualRefresh) addToast('Order data refreshed from database', 'info');
      } else {
        setOrder(null);
      }
    } catch (e) {
      console.error('Error loading order details:', e);
      addToast('Failed to load order details', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();

    // Cross-tab broadcast listener for immediate live updates
    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      broadcastChannel = new BroadcastChannel('vpp_orders_channel');
      broadcastChannel.onmessage = (event) => {
        if (
          (event.data?.type === 'ORDER_CANCELLED' || event.data?.type === 'ORDER_STATUS_CHANGED') &&
          (event.data?.orderId === order?.id || event.data?.orderNumber === order?.order_number)
        ) {
          if (event.data?.order) {
            setOrder(event.data.order);
          } else {
            fetchOrderDetails();
          }
        }
      };
    }

    return () => {
      if (broadcastChannel) broadcastChannel.close();
    };
  }, [orderIdParam]);

  // Stage transition forward
  const handleConfirmStatusChange = async (trackingNo?: string, partner?: string) => {
    if (!pendingStatusChange || !order) return;

    try {
      let updated: Order;
      if (trackingNo || partner) {
        updated = await OrderService.updateOrderLogistics(order.id, {
          status: pendingStatusChange.newStatus,
          tracking_number: trackingNo,
          courier_partner: partner,
        });
      } else {
        updated = await OrderService.updateOrderStatus(
          order.id,
          pendingStatusChange.newStatus
        );
      }

      addToast(
        `Order #${order.order_number} status updated to ${pendingStatusChange.newStatus}`,
        'success'
      );

      setOrder(updated);
      setPendingStatusChange(null);
    } catch (e: any) {
      console.error('Failed to update order status:', e);
      addToast(e.message || 'Failed to update order status', 'error');
    }
  };

  // Dedicated Order Cancellation Handler
  const handleConfirmCancelOrder = async (reason: string, notifyWhatsApp: boolean) => {
    if (!order) return;

    try {
      const cancelledOrder = await OrderService.cancelOrder(order.id, reason, 'ADMIN');
      setOrder(cancelledOrder);
      addToast(`Order #${order.order_number} has been cancelled`, 'info');

      if (notifyWhatsApp) {
        setWhatsAppTemplate('ORDER_CANCELLED');
        setIsWhatsAppOpen(true);
      }
    } catch (err: any) {
      console.error('Cancel order failed:', err);
      addToast(err.message || 'Failed to cancel order. Please try again.', 'error');
      throw err;
    }
  };

  // Dedicated Order Reopen Handler
  const handleConfirmReopenOrder = async (newStatus: OrderStatus, reason?: string) => {
    if (!order) return;

    try {
      const restored = await OrderService.reopenOrder(order.id, newStatus, reason);
      setOrder(restored);
      addToast(`Order #${order.order_number} reopened and set to ${newStatus}`, 'success');
    } catch (err: any) {
      console.error('Reopening order failed:', err);
      addToast(err.message || 'Failed to reopen order. Please try again.', 'error');
      throw err;
    }
  };

  // Toggle Payment State
  const handleTogglePaymentSettlement = async () => {
    if (!order) return;
    const newPaidState = !order.is_paid;
    try {
      const updated = await OrderService.markOrderPaid(order.id, newPaidState);
      setOrder(updated);
      addToast(
        `Payment marked as ${newPaidState ? 'PAID ✓' : 'UNPAID'} for ${order.order_number}`,
        'success'
      );
    } catch (err: any) {
      addToast(`Failed to update payment: ${err.message}`, 'error');
    }
  };

  // Save Logistics Form
  const handleSaveLogisticsSubmit = async () => {
    if (!order) return;
    setSavingLogistics(true);
    const newStatus: OrderStatus =
      order.status === 'PENDING' ||
      order.status === 'CONFIRMED' ||
      order.status === 'PACKING' ||
      order.status === 'PACKED'
        ? 'DISPATCHED'
        : order.status;

    try {
      const updated = await OrderService.updateOrderLogistics(order.id, {
        courier_partner: courierPartner,
        tracking_number: trackingNumber,
        estimated_delivery: estDeliveryDays,
        admin_notes: adminNotesInput,
        status: newStatus,
      });
      setOrder(updated);
      addToast(`Logistics updated & order marked as ${newStatus}`, 'success');
      setWhatsAppTemplate('DISPATCH_TRACKING');
      setIsWhatsAppOpen(true);
    } catch (err: any) {
      addToast(`Failed to save logistics: ${err.message}`, 'error');
    } finally {
      setSavingLogistics(false);
    }
  };

  // Save Notes Only
  const handleSaveNotesOnly = async () => {
    if (!order) return;
    setSavingNotes(true);
    try {
      const updated = await OrderService.updateOrderLogistics(order.id, {
        courier_partner: courierPartner,
        tracking_number: trackingNumber,
        estimated_delivery: estDeliveryDays,
        admin_notes: adminNotesInput,
        status: order.status,
      });
      setOrder(updated);
      addToast('Internal warehouse notes saved!', 'success');
    } catch (err: any) {
      addToast(`Failed to save notes: ${err.message}`, 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  // Save Delivery Fee Directly from Logistics / Financial Card
  const handleQuickSaveDeliveryFee = async () => {
    if (!order) return;
    const feeVal = Number(deliveryFeeInput);
    if (isNaN(feeVal) || feeVal < 0) {
      addToast('Please enter a valid positive delivery fee amount', 'error');
      return;
    }
    setSavingDeliveryFee(true);
    try {
      const updated = await OrderService.updateDeliveryFee(order.id, feeVal, true);
      setOrder(updated);
      addToast(`Delivery freight set to ₹${feeVal} & will now display in customer bill!`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to update delivery charges', 'error');
    } finally {
      setSavingDeliveryFee(false);
    }
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addToast(`Copied ${label} to clipboard!`, 'success');
  };

  const handleItemClick = async (item: OrderItem) => {
    setSelectedProductItem(item);
    try {
      const products = await ProductService.getAllProducts();
      const match = products.find(
        (p) => p.id === item.product_id || p.name.toLowerCase() === item.product_name.toLowerCase()
      );
      setSelectedProductMetadata(match || null);
    } catch {
      setSelectedProductMetadata(null);
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-300 font-black px-3 py-1 rounded-full text-xs uppercase tracking-wider shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            PENDING
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-900 border border-emerald-300 font-black px-3 py-1 rounded-full text-xs uppercase tracking-wider shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            CONFIRMED
          </span>
        );
      case 'PACKING':
      case 'PACKED':
        return (
          <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-950 border border-amber-400 font-black px-3 py-1 rounded-full text-xs uppercase tracking-wider shadow-2xs">
            <Package className="w-3.5 h-3.5 text-amber-700" />
            PACKING
          </span>
        );
      case 'DISPATCHED':
        return (
          <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-900 border border-blue-300 font-black px-3 py-1 rounded-full text-xs uppercase tracking-wider shadow-2xs">
            <Truck className="w-3.5 h-3.5 text-blue-600" />
            DISPATCHED
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white font-black px-3 py-1 rounded-full text-xs uppercase tracking-wider shadow-xs">
            <CheckCheck className="w-3.5 h-3.5 text-white" />
            DELIVERED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-900 border border-red-300 font-black px-3 py-1 rounded-full text-xs uppercase tracking-wider shadow-2xs">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-800 font-black px-3 py-1 rounded-full text-xs uppercase tracking-wider">
            {status}
          </span>
        );
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .substring(0, 2) || 'CU';
  };

  const getNextStatus = (current: OrderStatus): OrderStatus | null => {
    switch (current) {
      case 'PENDING':
        return 'CONFIRMED';
      case 'CONFIRMED':
        return 'PACKING';
      case 'PACKING':
      case 'PACKED':
        return 'DISPATCHED';
      case 'DISPATCHED':
        return 'DELIVERED';
      default:
        return null;
    }
  };

  const getNextStatusBtnConfig = (next: OrderStatus) => {
    switch (next) {
      case 'CONFIRMED':
        return {
          label: 'Confirm Order',
          actionText: 'Ready to fulfill? Confirm order to start packing process.',
          icon: CheckCircle2,
          style: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25',
        };
      case 'PACKING':
        return {
          label: 'Start Packing',
          actionText: 'Move order to warehouse floor for batch item packing.',
          icon: Package,
          style: 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25 font-black',
        };
      case 'DISPATCHED':
        return {
          label: 'Dispatch Order',
          actionText: 'Packing completed? Assign courier partner and dispatch.',
          icon: Truck,
          style: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25',
        };
      case 'DELIVERED':
        return {
          label: 'Mark Delivered',
          actionText: 'Parcel reached customer. Mark final fulfillment.',
          icon: CheckCheck,
          style: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25',
        };
      default:
        return {
          label: 'Advance Status',
          actionText: 'Step to next fulfillment stage.',
          icon: ChevronRight,
          style: 'bg-amber-500 text-slate-950',
        };
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4 font-sans">
        <div className="flex items-center gap-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm text-sm font-bold text-slate-800">
          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading Order #{orderIdParam}...</span>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4 font-sans max-w-3xl mx-auto p-4 sm:p-6 text-center">
        <div className="bg-white rounded-3xl border border-slate-200 p-10 shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-red-50 text-red-600 mx-auto flex items-center justify-center text-3xl font-bold border border-red-200 shadow-2xs">
            🔍
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-slate-900">Order Not Found</h2>
            <p className="text-xs text-slate-500 font-medium">
              No order matches requested identifier: <code className="bg-slate-100 px-2 py-0.5 rounded font-mono font-bold text-slate-800">{orderIdParam}</code>
            </p>
          </div>
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Orders List</span>
          </Link>
        </div>
      </div>
    );
  }

  const isCancelled = order.status === 'CANCELLED';
  const isDelivered = order.status === 'DELIVERED';
  const currentStageIndex = STAGE_ORDER[order.status] ?? 0;
  const nextStatus = getNextStatus(order.status);
  const nextBtnConfig = nextStatus ? getNextStatusBtnConfig(nextStatus) : null;
  const totalItemsCount = order.items?.reduce((sum, item) => sum + item.quantity, 0) || order.items?.length || 0;

  return (
    <div className="space-y-5 sm:space-y-6 font-sans max-w-7xl mx-auto pb-28 px-2 sm:px-4">
      <ToastNotification toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      {/* TOP HEADER: Breadcrumbs & Primary Actions */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
        {/* Row 1: Breadcrumb + Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200/80 group"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Orders</span>
            </Link>
            <span className="text-slate-300 font-bold">/</span>
            <span className="text-xs font-mono font-bold text-slate-500">Order #{order.order_number}</span>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => fetchOrderDetails(true)}
              disabled={refreshing}
              className="p-2 sm:px-3 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5 border border-slate-200"
              title="Refresh order details"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-600' : 'text-slate-600'}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={() => setIsPackingSlipOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5 border border-slate-200 shadow-2xs"
              title="Print Bill / Tax Invoice"
            >
              <Printer className="w-3.5 h-3.5 text-slate-700" />
              <span>Print Bill</span>
            </button>

            <button
              onClick={() => setIsWarehousePackingSlipOpen(true)}
              className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 font-bold text-xs rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5 border border-amber-500/25 shadow-2xs"
              title="Print Warehouse Packing Slip"
            >
              <PackageCheck className="w-3.5 h-3.5 text-amber-700" />
              <span>Packing Slip</span>
            </button>

            <button
              onClick={() => {
                setWhatsAppTemplate(isCancelled ? 'ORDER_CANCELLED' : 'ORDER_RECEIPT');
                setIsWhatsAppOpen(true);
              }}
              className="px-3.5 py-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-black text-xs rounded-xl transition-all shadow-sm shadow-[#25D366]/20 cursor-pointer inline-flex items-center gap-1.5"
              title="Message customer on WhatsApp"
            >
              <WhatsAppIcon className="w-4 h-4 fill-white" />
              <span>WhatsApp</span>
            </button>

            {/* Cancel Action Button (If Not Cancelled & Not Delivered) */}
            {!isCancelled && !isDelivered && (
              <button
                onClick={() => setIsCancelModalOpen(true)}
                className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-black text-xs rounded-xl border border-red-200 hover:border-red-300 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                title="Cancel this order"
              >
                <Ban className="w-3.5 h-3.5 text-red-600 stroke-[2.5]" />
                <span>Cancel Order</span>
              </button>
            )}

            {/* Reopen Action Button (If Cancelled) */}
            {isCancelled && (
              <button
                onClick={() => setIsReopenModalOpen(true)}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black text-xs rounded-xl border border-emerald-300 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                title="Reopen and restore this order"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                <span>Reopen Order</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Large Order Heading & Value */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-slate-100">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight font-mono">
                {order.order_number}
              </h1>
              <button
                onClick={() => handleCopyText(order.order_number, 'Order Number')}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Copy order number"
              >
                <Copy className="w-4 h-4" />
              </button>
              {getStatusBadge(order.status)}
            </div>

            <p className="text-xs text-slate-500 font-medium">
              Placed on {new Date(order.created_at).toLocaleString('en-IN', {
                dateStyle: 'full',
                timeStyle: 'short',
              })}
            </p>
          </div>

          {/* Grand Total Hero Box */}
          <div className="text-left md:text-right shrink-0 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-3 sm:px-5 sm:py-2.5 rounded-2xl border border-amber-500/30">
            <span className="text-[10px] text-amber-950 uppercase font-black tracking-wider block">
              Grand Total ({order.items?.length || 0} unique items / {totalItemsCount} pcs)
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-950 font-mono tracking-tight">
              ₹{order.grand_total.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* EXECUTIVE 4-STAT SUMMARY STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Order Total & Savings */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-500">Order Value</span>
            <IndianRupee className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-950 font-mono">
            ₹{order.grand_total.toLocaleString('en-IN')}
          </div>
          <p className="text-[11px] text-slate-500 font-medium truncate">
            {order.discount_amount && order.discount_amount > 0 ? (
              <span className="text-emerald-700 font-bold">Saved ₹{order.discount_amount.toLocaleString('en-IN')}</span>
            ) : (
              <span>Subtotal: ₹{order.subtotal.toLocaleString('en-IN')}</span>
            )}
          </p>
        </div>

        {/* KPI 2: Current Fulfillment Stage */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-500">Fulfillment Stage</span>
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-950 truncate">
            {order.status}
          </div>
          <p className="text-[11px] text-slate-500 font-medium truncate">
            {isCancelled ? (
              <span className="text-red-600 font-bold">Order is void</span>
            ) : nextStatus ? (
              <span className="text-amber-800 font-bold">Next: {nextStatus}</span>
            ) : (
              <span className="text-emerald-700 font-bold">Order completed</span>
            )}
          </p>
        </div>

        {/* KPI 3: Payment Status */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-500">Payment Status</span>
            <CreditCard className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-950">
            {order.is_paid ? 'Paid' : 'Pending Payment'}
          </div>
          <p className="text-[11px] text-slate-500 font-medium truncate">
            Status: <strong className="font-semibold text-slate-800">{order.is_paid ? 'Settled' : 'Awaiting Payment'}</strong>
          </p>
        </div>

        {/* KPI 4: Destination */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-500">Destination</span>
            <MapPin className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-950 truncate">
            {order.city || 'Tamil Nadu'}
          </div>
          <p className="text-[11px] text-slate-500 font-medium truncate font-mono">
            {order.pincode} • {order.state}
          </p>
        </div>
      </div>

      {/* TWO-COLUMN MASTER-DETAIL GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        
        {/* LEFT COLUMN: Main Fulfillment, Items, Financials & Audit (8 Cols) */}
        <div className="lg:col-span-8 space-y-5 sm:space-y-6">

          {/* CARD 1: FULFILLMENT PIPELINE STEPPER / CANCELLATION BANNER */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isCancelled ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                <h2 className="font-black text-base text-slate-950">
                  {isCancelled ? 'Order Status: Cancelled' : 'Order Fulfillment Pipeline'}
                </h2>
              </div>
              <div>
                {getStatusBadge(order.status)}
              </div>
            </div>

            {/* If Order is CANCELLED -> Prominent Cancellation Details Banner */}
            {isCancelled ? (
              <div className="p-5 bg-gradient-to-br from-red-50 via-rose-50/50 to-white border-2 border-red-200 rounded-2xl text-slate-900 space-y-3 shadow-2xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 border border-red-300 shadow-2xs">
                    <Ban className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <h3 className="font-black text-base text-red-950">
                      This order was cancelled
                    </h3>
                    <p className="text-xs text-red-800 leading-relaxed font-medium">
                      This order has been voided and is excluded from dispatch packing runs.
                    </p>
                  </div>

                  <button
                    onClick={() => setIsReopenModalOpen(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-98 cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Reopen Order</span>
                  </button>
                </div>

                {/* Display recorded cancellation remarks */}
                {order.admin_notes && (
                  <div className="pt-2 border-t border-red-200/80">
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-800 block mb-1">
                      Cancellation Log / Notes:
                    </span>
                    <div className="p-3 bg-white/90 rounded-xl border border-red-200 text-xs text-slate-800 font-mono whitespace-pre-line">
                      {order.admin_notes}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* If ACTIVE -> Interactive 5-Step Stepper */
              <div className="space-y-5">
                {/* Stepper Nodes */}
                <div className="grid grid-cols-5 gap-1 sm:gap-2">
                  {ORDER_STAGES.map((stage, idx) => {
                    const Icon = stage.icon;
                    const isPassed = idx < currentStageIndex;
                    const isCurrent = idx === currentStageIndex;

                    return (
                      <div key={stage.status} className="flex flex-col items-center text-center">
                        <div
                          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all ${
                            isCurrent
                              ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-300 shadow-md font-black scale-105'
                              : isPassed
                              ? 'bg-emerald-500 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-400 border border-slate-200'
                          }`}
                        >
                          {isPassed ? (
                            <Check className="w-5 h-5 stroke-[3]" />
                          ) : (
                            <Icon className="w-5 h-5" />
                          )}
                        </div>
                        <span
                          className={`text-[11px] sm:text-xs font-bold mt-2 truncate w-full ${
                            isCurrent
                              ? 'text-amber-950 font-black'
                              : isPassed
                              ? 'text-slate-900'
                              : 'text-slate-400'
                          }`}
                        >
                          {stage.label}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] font-black uppercase text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full mt-0.5 border border-amber-300 hidden sm:inline-block">
                            Current
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Next Stage Fast Action Bar */}
                {nextStatus && nextBtnConfig && (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                        Fulfillment Next Step
                      </span>
                      <p className="text-xs font-semibold text-slate-800">
                        {nextBtnConfig.actionText}
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        setPendingStatusChange({
                          orderId: order.id,
                          orderNumber: order.order_number,
                          currentStatus: order.status,
                          newStatus: nextStatus,
                        })
                      }
                      className={`px-5 py-2.5 rounded-xl font-black text-xs shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 shrink-0 ${nextBtnConfig.style}`}
                    >
                      <nextBtnConfig.icon className="w-4 h-4 stroke-[2.5]" />
                      <span>{nextBtnConfig.label}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CARD 2: ORDERED ITEMS & SPECIFICATIONS */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-base text-slate-950">
                  Ordered Items ({order.items?.length || 0} Products • {totalItemsCount} Pcs)
                </h3>
              </div>
              <span className="text-xs font-black text-amber-900 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                Direct Sivakasi Depot
              </span>
            </div>

            {/* Items List */}
            <div className="space-y-2.5">
              {order.items?.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleItemClick(item)}
                  className="p-3.5 bg-slate-50/90 hover:bg-amber-50/70 rounded-2xl border border-slate-200/80 hover:border-amber-300 flex items-center justify-between gap-3 text-xs cursor-pointer transition-all group shadow-2xs"
                  title="Click to view full product specifications"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden group-hover:scale-105 transition-transform shadow-2xs">
                      <img
                        src={item.image_url || '/placeholder-product.svg'}
                        alt={item.product_name}
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.src.endsWith('/placeholder-product.svg')) {
                            target.src = '/placeholder-product.svg';
                          }
                        }}
                        className={`w-full h-full ${item.image_url ? 'object-cover' : 'object-contain p-1'}`}
                      />
                    </div>

                    <div className="min-w-0 space-y-1">
                      <p className="font-black text-slate-950 truncate text-xs sm:text-sm group-hover:text-amber-800 transition-colors">
                        {item.product_name}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-amber-500 text-slate-950 font-black text-[11px] px-2.5 py-0.5 rounded-md shadow-2xs shrink-0">
                          {item.quantity} Pcs
                        </span>
                        <span className="text-slate-500 font-bold text-[11px] font-mono">
                          × ₹{item.unit_price.toLocaleString('en-IN')}
                        </span>
                        {item.mrp && item.mrp > item.unit_price && (
                          <span className="text-slate-400 line-through text-[10px] font-mono">
                            MRP ₹{item.mrp.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono font-black text-slate-950 text-sm sm:text-base block">
                      ₹{(item.total_price || item.quantity * item.unit_price).toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-amber-700 font-black flex items-center justify-end gap-0.5 opacity-90 group-hover:opacity-100 transition-opacity">
                      <span>View Specs</span>
                      <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CARD 3: PAYMENT & FINANCIAL BREAKDOWN */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-base text-slate-950">
                  Financial Settlement Breakdown
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500">
                Status: <strong className={`font-semibold ${order.is_paid ? 'text-emerald-700' : 'text-amber-800'}`}>{order.is_paid ? 'Paid ✓' : 'Pending'}</strong>
              </span>
            </div>

            <div className="space-y-2.5 text-slate-600 font-medium">
              {order.discount_amount && order.discount_amount > 0 ? (
                <div className="flex justify-between">
                  <span>Standard MRP Value:</span>
                  <span className="font-bold text-slate-900 font-mono">
                    ₹{(order.subtotal + order.discount_amount).toLocaleString('en-IN')}
                  </span>
                </div>
              ) : null}

              {order.discount_amount && order.discount_amount > 0 ? (
                <div className="flex justify-between text-emerald-600 font-bold bg-emerald-50/70 p-2 rounded-xl border border-emerald-200/60">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Special Festival Discount Applied:</span>
                  </span>
                  <span className="font-mono">-₹{order.discount_amount.toLocaleString('en-IN')}</span>
                </div>
              ) : null}

              <div className="flex justify-between pt-1 border-t border-slate-100">
                <span>Items Subtotal:</span>
                <span className="font-bold text-slate-900 font-mono">
                  ₹{order.subtotal?.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Delivery Freight ({order.city || order.state}):</span>
                    </span>
                    <span className="text-[10px] text-slate-400 block font-normal mt-0.5">
                      {isDeliveryFeeSet(order)
                        ? '✓ Configured & visible on customer bill'
                        : '⚠️ Not set yet (hidden on customer bill print)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isDeliveryFeeSet(order) ? (
                      <span className="font-bold text-slate-900 font-mono text-sm">
                        ₹{order.delivery_fee.toLocaleString('en-IN')}
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-amber-900 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300">
                        Pending Admin Setup
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsDeliveryFeeModalOpen(true)}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-[10px] transition-all cursor-pointer shadow-2xs"
                      title="Set delivery charges amount"
                    >
                      {isDeliveryFeeSet(order) ? 'Edit Amount' : 'Set Delivery Charge'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-between text-base font-black text-slate-950 pt-3 border-t border-slate-200 items-baseline">
                <div>
                  <span>Grand Total Amount:</span>
                  {!isDeliveryFeeSet(order) && (
                    <span className="block text-[10px] text-amber-800 font-normal">
                      (Items subtotal — freight will add when set)
                    </span>
                  )}
                </div>
                <span className="text-amber-600 font-black text-2xl font-mono">
                  ₹{(isDeliveryFeeSet(order) ? order.grand_total : order.subtotal).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* CARD 4: ACTIVITY TIMELINE & AUDIT TRAIL */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-base text-slate-950">
                  Audit Trail & Activity Log
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-bold">
                Live Postgres Events
              </span>
            </div>

            <div className="space-y-3">
              {(order.history && order.history.length > 0 ? order.history : [
                {
                  status: order.status,
                  timestamp: order.created_at,
                  note: 'Order created in Sivakasi Fireworld platform',
                  actor: 'Customer Checkout',
                },
              ]).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3.5 border-l-2 border-amber-500 pl-3.5 py-1"
                >
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-950 uppercase text-xs">
                        {item.status}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(item.timestamp).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-slate-700 text-xs font-medium">{item.note}</p>
                    <span className="text-[10px] text-slate-400 font-semibold block">
                      Actor: {item.actor || 'System'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Customer, Shipping, Logistics & Operations (4 Cols) */}
        <div className="lg:col-span-4 space-y-5 sm:space-y-6">

          {/* CARD 1: CUSTOMER PROFILE */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-amber-600" />
                <h3 className="font-black text-sm text-slate-950">
                  Customer Profile
                </h3>
              </div>
              <span className="text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full font-black border border-emerald-200">
                Verified
              </span>
            </div>

            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-950 font-black flex items-center justify-center text-base border border-amber-500/30 shrink-0">
                {getInitials(order.customer_name)}
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="font-black text-base text-slate-950 block truncate">
                  {order.customer_name}
                </span>
                <span className="text-xs font-mono font-bold text-slate-600 block truncate">
                  {order.customer_mobile}
                </span>
              </div>
            </div>

            {/* Quick Contact Action Bar */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={() => {
                  setWhatsAppTemplate('ORDER_RECEIPT');
                  setIsWhatsAppOpen(true);
                }}
                className="py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Message on WhatsApp"
              >
                <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                <span>WhatsApp</span>
              </button>

              <a
                href={`tel:${order.customer_mobile}`}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center"
                title="Call phone"
              >
                <Phone className="w-3.5 h-3.5 text-slate-700" />
                <span>Call</span>
              </a>

              <button
                onClick={() => handleCopyText(order.customer_mobile, 'Phone Number')}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Copy mobile number"
              >
                <Copy className="w-3.5 h-3.5 text-slate-700" />
                <span>Copy</span>
              </button>
            </div>

            {order.customer_email && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-slate-600">
                <span className="font-bold text-[11px]">Email:</span>
                <a
                  href={`mailto:${order.customer_email}`}
                  className="font-mono text-amber-700 hover:underline truncate max-w-[180px]"
                >
                  {order.customer_email}
                </a>
              </div>
            )}
          </div>

          {/* CARD 2: SHIPPING ADDRESS */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-3.5 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-600" />
                <h3 className="font-black text-sm text-slate-950">
                  Shipping Address
                </h3>
              </div>
              <button
                onClick={() =>
                  handleCopyText(
                    `${order.shipping_address}, ${order.city}, ${order.state} - ${order.pincode}`,
                    'Full Delivery Address'
                  )
                }
                className="text-[11px] font-black text-amber-900 hover:text-amber-950 flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200/80 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Address</span>
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-800 font-bold leading-relaxed">
                {order.shipping_address}
              </p>
              <div className="pt-1 flex items-center gap-2 text-slate-600 font-bold">
                <span>{order.city},</span>
                <span>{order.state}</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded font-mono font-black text-slate-900">
                  {order.pincode}
                </span>
              </div>
            </div>
          </div>

          {/* CARD 3: LOGISTICS & COURIER DISPATCH */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                <h3 className="font-black text-sm text-slate-950">
                  Courier & Logistics
                </h3>
              </div>
              <span className="text-[11px] text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full font-bold border border-blue-200">
                Dispatch Desk
              </span>
            </div>

            <div className="space-y-3">
              {/* Delivery Freight Quick Config */}
              <div className="space-y-1.5 p-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black text-amber-950 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-amber-700" />
                    <span>Delivery Charges ({order.city})</span>
                  </label>
                  {isDeliveryFeeSet(order) ? (
                    <span className="text-[9.5px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                      ✓ Shown on Bill (₹{order.delivery_fee})
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                      ⚠️ Hidden on Bill
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={deliveryFeeInput}
                      onChange={(e) => setDeliveryFeeInput(e.target.value)}
                      placeholder="e.g. 250"
                      className="w-full pl-6 pr-2 py-2 bg-white border border-slate-300 rounded-xl font-mono font-bold text-slate-900 text-xs outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleQuickSaveDeliveryFee}
                    disabled={savingDeliveryFee}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-colors cursor-pointer shadow-2xs shrink-0"
                  >
                    {savingDeliveryFee ? 'Saving...' : 'Apply to Bill'}
                  </button>
                </div>
                <p className="text-[10px] text-amber-900/80 leading-tight">
                  Charges vary by location. Bill print hides delivery fee until saved here.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-slate-600 block">
                  Courier Partner
                </label>
                <select
                  value={courierPartner}
                  onChange={(e) => setCourierPartner(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-amber-500 focus:bg-white transition-all"
                >
                  {CARRIER_OPTIONS.map((carrier) => (
                    <option key={carrier} value={carrier}>
                      {carrier}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-slate-600 block">
                  Tracking LR / AWB Number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g. ST12345678IN / LR-9921"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 outline-none focus:border-amber-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-slate-600 block">
                  Estimated Delivery Time
                </label>
                <input
                  type="text"
                  value={estDeliveryDays}
                  onChange={(e) => setEstDeliveryDays(e.target.value)}
                  placeholder="e.g. 2-3 Days"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-amber-500 focus:bg-white transition-all"
                />
              </div>

              <button
                onClick={handleSaveLogisticsSubmit}
                disabled={savingLogistics}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl transition-all shadow-md shadow-blue-600/20 cursor-pointer flex items-center justify-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Save Logistics & Send WhatsApp</span>
              </button>
            </div>
          </div>

          {/* CARD 4: INTERNAL WAREHOUSE NOTES */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600" />
                <h3 className="font-black text-sm text-slate-950">
                  Internal Warehouse Notes
                </h3>
              </div>
            </div>

            <textarea
              rows={3}
              value={adminNotesInput}
              onChange={(e) => setAdminNotesInput(e.target.value)}
              placeholder="Add internal dispatch notes, fragile warnings, or special requests..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
            />

            <button
              onClick={handleSaveNotesOnly}
              disabled={savingNotes}
              className="w-full py-2 bg-slate-950 hover:bg-slate-900 text-white font-black text-xs rounded-xl transition-colors cursor-pointer"
            >
              {savingNotes ? 'Saving...' : 'Save Internal Notes'}
            </button>
          </div>

          {/* CARD 5: DANGER ZONE / CANCELLATION SUMMARY */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm space-y-3 text-xs">
            <h3 className="font-black text-sm text-slate-950 flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-4 h-4 text-slate-700" />
              <span>Order Management</span>
            </h3>

            {isCancelled ? (
              <div className="space-y-2.5">
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-red-900">
                  <p className="font-bold">This order is currently CANCELLED.</p>
                  <p className="text-[11px] text-red-700 mt-0.5">
                    Need to reinstate this order for the customer?
                  </p>
                </div>
                <button
                  onClick={() => setIsReopenModalOpen(true)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen & Restore Order</span>
                </button>
              </div>
            ) : isDelivered ? (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 font-bold text-center">
                🎉 Order successfully delivered to customer.
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-slate-500 text-xs">
                  If the customer requested a cancellation or inventory cannot be fulfilled:
                </p>
                <button
                  onClick={() => setIsCancelModalOpen(true)}
                  className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-black text-xs rounded-xl border border-red-200 hover:border-red-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Ban className="w-3.5 h-3.5 text-red-600 stroke-[2.5]" />
                  <span>Cancel Order</span>
                </button>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* STICKY BOTTOM FLOATING ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/90 p-3 sm:p-4 shadow-2xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-mono font-black text-sm sm:text-base text-slate-950 hidden sm:inline">
              #{order.order_number}
            </span>
            {getStatusBadge(order.status)}
            <span className="font-mono font-black text-base text-slate-950 sm:hidden">
              ₹{order.grand_total.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Primary Advance Button */}
            {nextStatus && nextBtnConfig && (
              <button
                onClick={() =>
                  setPendingStatusChange({
                    orderId: order.id,
                    orderNumber: order.order_number,
                    currentStatus: order.status,
                    newStatus: nextStatus,
                  })
                }
                className={`px-5 py-2.5 rounded-xl font-black text-xs shadow-md transition-all active:scale-98 cursor-pointer flex items-center gap-1.5 ${nextBtnConfig.style}`}
              >
                <nextBtnConfig.icon className="w-4 h-4 stroke-[2.5]" />
                <span>{nextBtnConfig.label}</span>
              </button>
            )}

            {/* Cancel Order Button */}
            {!isCancelled && !isDelivered && (
              <button
                onClick={() => setIsCancelModalOpen(true)}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-black text-xs rounded-xl border border-red-200 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Cancel Order</span>
              </button>
            )}

            {/* Reopen Order Button */}
            {isCancelled && (
              <button
                onClick={() => setIsReopenModalOpen(true)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Reopen Order</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MODAL 1: DEDICATED CANCEL ORDER MODAL */}
      <CancelOrderModal
        order={order}
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirmCancel={handleConfirmCancelOrder}
      />

      {/* MODAL 2: DEDICATED REOPEN ORDER MODAL */}
      <ReopenOrderModal
        order={order}
        isOpen={isReopenModalOpen}
        onClose={() => setIsReopenModalOpen(false)}
        onConfirmReopen={handleConfirmReopenOrder}
      />

      {/* MODAL 3: STAGE FORWARD CONFIRMATION MODAL */}
      {pendingStatusChange && (
        <StatusConfirmationModal
          pendingStatusChange={pendingStatusChange}
          onCancel={() => setPendingStatusChange(null)}
          onConfirm={handleConfirmStatusChange}
        />
      )}

      {/* MODAL 4: WHATSAPP MESSAGING MODAL */}
      {isWhatsAppOpen && (
        <WhatsAppModal
          order={order}
          initialTemplate={whatsAppTemplate}
          onClose={() => setIsWhatsAppOpen(false)}
          onShowToast={addToast}
        />
      )}

      {/* MODAL 5: BILL / INVOICE MODAL */}
      {isPackingSlipOpen && (
        <PackingSlipModal
          order={order}
          onClose={() => setIsPackingSlipOpen(false)}
        />
      )}

      {/* MODAL 5A: SET DELIVERY FEE MODAL */}
      {isDeliveryFeeModalOpen && (
        <SetDeliveryFeeModal
          order={order}
          onClose={() => setIsDeliveryFeeModalOpen(false)}
          onSaved={(updated) => {
            setOrder(updated);
            setDeliveryFeeInput(String(updated.delivery_fee));
            addToast(`Delivery freight set to ₹${updated.delivery_fee} & applied to customer bill!`, 'success');
          }}
        />
      )}

      {/* MODAL 5B: WAREHOUSE PACKING SLIP MODAL */}
      {isWarehousePackingSlipOpen && (
        <WarehousePackingSlipModal
          order={order}
          onClose={() => setIsWarehousePackingSlipOpen(false)}
        />
      )}

      {/* MODAL 6: PRODUCT QUICK SPECIFICATIONS MODAL */}
      {selectedProductItem && (
        <AdminProductModal
          item={selectedProductItem}
          product={selectedProductMetadata}
          onClose={() => {
            setSelectedProductItem(null);
            setSelectedProductMetadata(null);
          }}
        />
      )}
    </div>
  );
}

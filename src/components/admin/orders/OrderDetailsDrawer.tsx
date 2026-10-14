'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Truck,
  User,
  MapPin,
  FileText,
  PhoneCall,
  Printer,
  Copy,
  Send,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { WhatsAppIcon } from '@/components/common/WhatsAppIcon';
import { Order, OrderStatus, isDeliveryFeeSet } from '@/types';
import { WhatsAppService } from '@/lib/services/whatsapp.service';
import { OrderTimeline } from '@/components/common/OrderTimeline';

interface OrderDetailsDrawerProps {
  order: Order | null;
  onClose: () => void;
  onPrintSlip: (order: Order) => void;
  onRequestStatusChange: (
    orderId: string,
    orderNumber: string,
    currentStatus: OrderStatus,
    newStatus: OrderStatus
  ) => void;
  onTogglePaymentSettlement?: (orderId: string) => void;
  onSaveLogistics: (
    orderId: string,
    courierPartner: string,
    trackingNumber: string,
    estDeliveryDays: string,
    adminNotes?: string
  ) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onOpenWhatsAppModal?: (order: Order, template?: any) => void;
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

export function OrderDetailsDrawer({
  order,
  onClose,
  onPrintSlip,
  onRequestStatusChange,
  onSaveLogistics,
  onShowToast,
  onOpenWhatsAppModal,
}: OrderDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'items' | 'customer' | 'audit'>('items');

  // Logistics form state
  const [courierPartner, setCourierPartner] = useState<string>('ST Courier');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [estDeliveryDays, setEstDeliveryDays] = useState<string>('2-3 Days');
  const [adminNotesInput, setAdminNotesInput] = useState<string>('');

  useEffect(() => {
    if (order) {
      setCourierPartner(order.courier_partner || 'ST Courier');
      setTrackingNumber(order.tracking_number || '');
      setEstDeliveryDays(order.estimated_delivery || '2-3 Days');
      setAdminNotesInput(order.admin_notes || '');
    }
  }, [order]);

  if (!order) return null;

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

  const getNextStatusLabel = (next: OrderStatus) => {
    switch (next) {
      case 'CONFIRMED':
        return '✓ Confirm Order';
      case 'PACKING':
        return '📦 Start Packing';
      case 'DISPATCHED':
        return '🚚 Dispatch Order';
      case 'DELIVERED':
        return '🎉 Mark Delivered';
      default:
        return 'Advance Status';
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onShowToast(`Copied ${label} to clipboard!`, 'success');
  };

  const handleSaveLogisticsSubmit = () => {
    onSaveLogistics(order.id, courierPartner, trackingNumber, estDeliveryDays, adminNotesInput);
    onShowToast('✓ Logistics saved!', 'success');

    if (onOpenWhatsAppModal) {
      onOpenWhatsAppModal(order, 'DISPATCH_TRACKING');
    } else {
      const whatsappUrl = WhatsAppService.generateCustomerWhatsAppLink(order, {
        templateType: 'DISPATCH_TRACKING',
        courierPartner,
        trackingNumber,
        estDeliveryDays,
      });
      window.open(whatsappUrl, '_blank');
    }
  };

  const nextStatus = getNextStatus(order.status);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Mobile Bottom Sheet Container / Desktop Sheet */}
      <div className="w-full max-w-4xl bg-white h-[96dvh] sm:h-[90vh] max-h-[96dvh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col justify-between overflow-hidden border border-slate-200/90 animate-in slide-in-from-bottom sm:zoom-in-98 duration-200">
        
        {/* STREAMLINED MOBILE HEADER BAR */}
        <div className="bg-white text-slate-900 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between border-b border-slate-200/80 shrink-0 shadow-2xs">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-black text-base sm:text-xl text-slate-950 tracking-tight truncate">
                {order.order_number}
              </h2>
              <span
                className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                  order.status === 'CANCELLED'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : order.status === 'DELIVERED'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                    : 'bg-amber-50 text-amber-800 border-amber-200/80'
                }`}
              >
                {order.status}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium block truncate mt-0.5">
              Placed on{' '}
              {new Date(order.created_at).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onPrintSlip(order)}
              className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="Print Packing Slip / Tax Invoice"
            >
              <Printer className="w-4 h-4 text-slate-700" />
            </button>

            <button
              onClick={() =>
                onOpenWhatsAppModal
                  ? onOpenWhatsAppModal(order, 'ORDER_RECEIPT')
                  : window.open(WhatsAppService.generateCustomerWhatsAppLink(order), '_blank')
              }
              className="p-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl text-xs flex items-center transition-all shadow-xs cursor-pointer"
              title="Send WhatsApp to Customer"
            >
              <WhatsAppIcon className="w-4 h-4 fill-white" />
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TOUCH-FRIENDLY NAVIGATION TABS */}
        <div className="bg-white border-b border-slate-200/80 px-3 py-2 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('items')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === 'items'
                  ? 'bg-slate-950 text-white shadow-xs font-black'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Items ({order.items?.length || 0})</span>
            </button>

            <button
              onClick={() => setActiveTab('customer')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === 'customer'
                  ? 'bg-slate-950 text-white shadow-xs font-black'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Customer</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === 'audit'
                  ? 'bg-slate-950 text-white shadow-xs font-black'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit</span>
            </button>
          </div>
        </div>

        {/* MAIN TAB CONTENT CONTAINER */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/60 pb-20 sm:pb-6">
          
          {/* TAB 1: ITEMS & FINANCIAL BREAKDOWN */}
          {activeTab === 'items' && (
            <div className="space-y-4">
              {/* Ordered Products Card */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-black text-sm text-slate-950 flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-600" />
                    <span>Ordered Items ({order.items?.length || 0})</span>
                  </h3>
                  <span className="text-[10px] font-black text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                    Sivakasi Warehouse
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {order.items?.map((item) => (
                    <div key={item.product_id} className="py-3 flex items-center justify-between text-xs gap-3">
                      <div className="flex items-center gap-3 truncate pr-2 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden text-base font-bold">
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
                        <div className="truncate min-w-0">
                          <span className="font-extrabold text-slate-950 block truncate text-xs">
                            {item.product_name}
                          </span>
                          <span className="text-slate-500 font-medium text-[11px]">
                            {item.quantity} units × ₹{item.unit_price.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <span className="font-black text-slate-950 text-sm shrink-0 font-mono">
                        ₹{item.total_price.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Calculation Breakdown Card */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-3">
                <h3 className="font-black text-sm text-slate-950 border-b border-slate-100 pb-3">
                  Financial Summary
                </h3>

                <div className="space-y-2 text-xs text-slate-600 font-medium">
                  {order.discount_amount > 0 && (
                    <div className="flex justify-between">
                      <span>Total Real MRP:</span>
                      <span className="font-bold text-slate-900 font-mono">
                        ₹{(order.subtotal + order.discount_amount).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {order.discount_amount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Festival Discount:</span>
                      <span className="font-mono">-₹{order.discount_amount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-0.5 border-t border-slate-100">
                    <span>Final Price (Subtotal):</span>
                    <span className="font-bold text-slate-900 font-mono">₹{order.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery Fee ({order.city || order.state}):</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {isDeliveryFeeSet(order)
                        ? `₹${order.delivery_fee.toLocaleString()}`
                        : 'Pending (Hidden on Bill)'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-slate-950 pt-3 border-t border-slate-200">
                    <span>Grand Total Payable:</span>
                    <span className="text-amber-600 font-black text-lg font-mono">
                      ₹{(isDeliveryFeeSet(order) ? order.grand_total : order.subtotal).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOMER PROFILE & SHIPPING ADDRESS */}
          {activeTab === 'customer' && (
            <div className="space-y-4">
              <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/90 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-black text-base text-slate-950 flex items-center gap-2">
                    <User className="w-5 h-5 text-amber-600" />
                    <span>Customer Details</span>
                  </h3>
                  <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">
                    Verified
                  </span>
                </div>

                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-950 font-black flex items-center justify-center text-base border border-amber-500/30 shrink-0">
                    {getInitials(order.customer_name)}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <span className="font-black text-base text-slate-950 block truncate">
                      {order.customer_name}
                    </span>
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
                      <span>Phone: {order.customer_mobile}</span>
                      <button
                        onClick={() => handleCopyText(order.customer_mobile, 'Phone Number')}
                        className="text-amber-600 hover:text-amber-700 p-0.5 rounded cursor-pointer"
                        title="Copy Phone Number"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-1">
                  <a
                    href={`tel:${order.customer_mobile}`}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>Call Phone</span>
                  </a>
                  <button
                    onClick={() =>
                      onOpenWhatsAppModal
                        ? onOpenWhatsAppModal(order, 'ORDER_RECEIPT')
                        : window.open(WhatsAppService.generateCustomerWhatsAppLink(order), '_blank')
                    }
                    className="flex-1 py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
                  >
                    <WhatsAppIcon className="w-4 h-4 fill-white" />
                    <span className="text-white">WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Shipping Address Card */}
              <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-black text-base text-slate-950 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-amber-600" />
                    <span>Shipping Address</span>
                  </h3>
                  <button
                    onClick={() =>
                      handleCopyText(
                        `${order.shipping_address}, ${order.city}, ${order.state} - ${order.pincode}`,
                        'Full Shipping Address'
                      )
                    }
                    className="text-xs font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200/80 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Address</span>
                  </button>
                </div>

                <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                  {order.shipping_address}, {order.city}, {order.state} -{' '}
                  <strong className="text-slate-950 font-black">{order.pincode}</strong>
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT TRAIL & WAREHOUSE NOTES */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              {/* Internal Notes Input */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-3">
                <h3 className="font-black text-sm text-slate-950 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span>Internal Warehouse Notes</span>
                </h3>

                <textarea
                  rows={3}
                  value={adminNotesInput}
                  onChange={(e) => setAdminNotesInput(e.target.value)}
                  placeholder="Add internal dispatch notes, fragile warnings, or special requests..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />

                <button
                  onClick={() => {
                    onSaveLogistics(order.id, courierPartner, trackingNumber, estDeliveryDays, adminNotesInput);
                    onShowToast('Internal admin notes updated!', 'success');
                  }}
                  className="w-full py-2.5 bg-slate-950 hover:bg-slate-900 text-white font-black text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Save Internal Notes
                </button>
              </div>

              {/* Status Audit History Log */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-2xs space-y-4">
                <h3 className="font-black text-sm text-slate-950 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <History className="w-4 h-4 text-slate-700" />
                  <span>Status Audit Trail</span>
                </h3>

                <div className="space-y-3">
                  {(order.history || [
                    {
                      status: order.status,
                      timestamp: order.created_at,
                      note: 'Order created',
                      actor: 'System / Customer',
                    },
                  ]).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-xs border-l-2 border-amber-500 pl-3 py-1">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-950 uppercase">{item.status}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(item.timestamp).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px] mt-0.5">{item.note}</p>
                        <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">
                          By: {item.actor || 'Admin'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* STICKY BOTTOM MOBILE ACTION BAR INSIDE DRAWER */}
        <div className="bg-white border-t border-slate-200 p-3 shrink-0 flex items-center justify-between gap-2 shadow-lg">
          <button
            onClick={() => onPrintSlip(order)}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all border border-slate-200 cursor-pointer shrink-0"
            title="Print Packing Slip"
          >
            <Printer className="w-4 h-4" />
          </button>

          {nextStatus ? (
            <button
              onClick={() =>
                onRequestStatusChange(
                  order.id,
                  order.order_number,
                  order.status,
                  nextStatus
                )
              }
              className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>{getNextStatusLabel(nextStatus)}</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Done / Close
            </button>
          )}

          {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
            <button
              onClick={() =>
                onRequestStatusChange(
                  order.id,
                  order.order_number,
                  order.status,
                  'CANCELLED'
                )
              }
              className="px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl border border-red-200 transition-colors cursor-pointer"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

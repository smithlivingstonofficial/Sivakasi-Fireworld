'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import { CheckCircle2, Package, ArrowRight, Truck, MapPin, Calendar, Clock, ShoppingBag, Ban, AlertCircle, Printer, Phone } from 'lucide-react';
import { WhatsAppIcon } from '@/components/common/WhatsAppIcon';
import { OrderService } from '@/lib/services/order.service';
import { WhatsAppService } from '@/lib/services/whatsapp.service';
import { SettingsService } from '@/lib/services/settings.service';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { OrderTimeline } from '@/components/common/OrderTimeline';
import { CancelOrderModal } from '@/components/common/CancelOrderModal';
import { PackingSlipModal } from '@/components/admin/orders/PackingSlipModal';
import { Order, OrderStatus, isDeliveryFeeSet } from '@/types';

export default function OrderConfirmationPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { settings } = useStoreSettings();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isPackingSlipOpen, setIsPackingSlipOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    async function loadOrder() {
      if (!orderId) return;
      const found = await OrderService.getOrderById(orderId);
      setOrder(found);
      setLoading(false);

      if (found && found.status !== 'CANCELLED') {
        // Trigger celebratory confetti burst
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      }
    }
    loadOrder();
  }, [orderId]);

  const handleConfirmCancel = async (reason: string) => {
    if (!order) return;
    const cancelled = await OrderService.cancelOrder(order.id, reason, 'CUSTOMER');
    setOrder(cancelled);
    setSuccessMsg(`Order #${cancelled.order_number} has been cancelled successfully.`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="text-center space-y-4 max-w-sm">
          <div className="relative inline-block">
            <div className="p-4 bg-white rounded-2xl border border-amber-300 shadow-md">
              {settings?.logo_url && settings.logo_url !== '/logo.png' ? (
                <Image
                  src={settings.logo_url}
                  alt={settings?.store_name || 'Sivakasi Fireworld'}
                  width={160}
                  height={100}
                  priority
                  unoptimized
                  className="h-14 w-auto object-contain animate-pulse"
                />
              ) : (
                <div className="w-16 h-14 flex items-center justify-center text-3xl mx-auto">
                  🎆
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-800">Retrieving Order Details...</p>
            <p className="text-[11px] text-slate-500">Checking order status &amp; invoice from Sivakasi Fireworld</p>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl max-w-md w-full text-center border border-slate-200 shadow-xl">
          <h2 className="font-extrabold text-xl text-slate-900 mb-2">Order Not Found</h2>
          <p className="text-xs text-slate-500 mb-6">We could not locate an order matching ID {orderId}.</p>
          <Link
            href="/"
            className="px-6 py-3 bg-amber-500 text-slate-950 font-black rounded-xl text-xs inline-block"
          >
            RETURN TO HOME
          </Link>
        </div>
      </div>
    );
  }

  const helplineList = useMemo(() => {
    return SettingsService.getHelplineNumbers(settings);
  }, [settings]);

  const whatsappList = useMemo(() => {
    return SettingsService.getWhatsAppNumbers(settings);
  }, [settings]);

  const whatsappUrl = WhatsAppService.generateOrderWhatsAppLink(
    order,
    settings?.whatsapp_number,
    settings?.store_name
  );

  // Status Stepper calculation
  const statusSteps: { status: OrderStatus; label: string }[] = [
    { status: 'PENDING', label: 'Order Placed' },
    { status: 'CONFIRMED', label: 'Confirmed' },
    { status: 'PACKING', label: 'Packing' },
    { status: 'PACKED', label: 'Packed' },
    { status: 'DISPATCHED', label: 'Dispatched' },
    { status: 'DELIVERED', label: 'Delivered' },
  ];

  const statusOrderIndexMap: Record<OrderStatus, number> = {
    PENDING: 0,
    CONFIRMED: 1,
    PACKING: 2,
    PACKED: 3,
    DISPATCHED: 4,
    DELIVERED: 5,
    CANCELLED: -1,
  };

  const currentStepIndex = statusOrderIndexMap[order.status];

  const isCancellable =
    order && ['PENDING', 'CONFIRMED', 'PACKING', 'PACKED'].includes(order.status);
  const isCancelled = order.status === 'CANCELLED';
  const isDispatched = order.status === 'DISPATCHED';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header Box */}
        {isCancelled ? (
          <div className="bg-gradient-to-br from-slate-950 to-red-950 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-red-500/30 text-center space-y-3">
            <div className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center mx-auto shadow-lg">
              <Ban className="w-9 h-9" />
            </div>
            <span className="bg-red-500/20 text-red-300 font-extrabold text-xs px-3 py-1 rounded-full inline-block border border-red-500/30 uppercase tracking-widest">
              ORDER CANCELLED
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Order #{order.order_number}
            </h1>
            <p className="text-xs text-slate-300 max-w-md mx-auto">
              This order has been cancelled and is no longer being processed.
            </p>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-slate-950 to-amber-950 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-amber-500/30 text-center space-y-3">
            <div className="w-16 h-16 bg-amber-500 text-slate-950 rounded-full flex items-center justify-center mx-auto shadow-lg glow-gold">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <span className="bg-amber-500/20 text-amber-300 font-extrabold text-xs px-3 py-1 rounded-full inline-block border border-amber-500/30 uppercase tracking-widest">
              ORDER SUCCESSFULLY PLACED
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Order #{order.order_number}
            </h1>
            <p className="text-xs text-slate-300 max-w-md mx-auto">
              Your order has been received! We will prepare and pack your items soon.
            </p>

            {/* Primary Action Buttons: WhatsApp & Print Bill */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-black rounded-2xl text-sm shadow-xl transition-all active:scale-98"
              >
                <WhatsAppIcon className="w-5 h-5 fill-white" />
                <span className="text-white">SEND ORDER COPY TO WHATSAPP</span>
              </a>
              <button
                type="button"
                onClick={() => setIsPackingSlipOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white hover:bg-slate-100 text-slate-950 font-black rounded-2xl text-sm shadow-xl transition-all active:scale-98 cursor-pointer"
              >
                <Printer className="w-5 h-5 text-amber-600" />
                <span>PRINT BILL / INVOICE</span>
              </button>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Timeline Status Tracker */}
        <OrderTimeline
          status={order.status}
          adminNotes={order.admin_notes}
          courierPartner={order.courier_partner}
          trackingNumber={order.tracking_number}
          createdAt={order.created_at}
          updatedAt={order.updated_at}
        />

        {/* Dispatched Interception Notice */}
        {isDispatched && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-blue-900">
            <div>
              <span className="font-black block text-blue-950">Dispatched & In Transit</span>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Your order is already handed over to {order.courier_partner || 'the courier'}. To cancel or redirect, please contact Sivakasi customer support directly.
              </p>
            </div>
            <a
              href={WhatsAppService.generateSupportWhatsAppLink(order, undefined, settings?.whatsapp_number, settings?.store_name)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-black text-xs rounded-xl flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
              <span>Contact Support</span>
            </a>
          </div>
        )}

        {/* Order Details & Summary Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-slate-100 pb-4 text-xs">
            <div>
              <span className="text-slate-500 block mb-1 font-semibold">Shipping Address:</span>
              <p className="font-bold text-slate-900">{order.customer_name}</p>
              <p className="text-slate-700">{order.shipping_address}</p>
              <p className="text-slate-700">{order.city}, {order.state} - {order.pincode}</p>
              <p className="text-slate-900 font-extrabold mt-1">Mobile: {order.customer_mobile}</p>
            </div>

            <div>
              <span className="text-slate-500 block mb-1 font-semibold">Order Information:</span>
              <p className="text-slate-700">Date: {new Date(order.created_at).toLocaleDateString('en-IN')}</p>
              <p className="text-slate-700">
                Status:{' '}
                <span
                  className={`font-black uppercase ${
                    order.status === 'CANCELLED' ? 'text-red-600' : 'text-amber-600'
                  }`}
                >
                  {order.status}
                </span>
              </p>
              <p className="text-slate-700">Store Hub: {settings?.store_name || 'Sivakasi Fireworld'}, Sivakasi</p>
            </div>
          </div>

          {/* Purchased Items List */}
          <div>
            <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider mb-3">Items Ordered</h4>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
              {order.items?.map((item) => (
                <div key={item.product_id} className="p-3 bg-slate-50 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900 block">{item.product_name}</span>
                    <span className="text-slate-500">{item.quantity} x ₹{item.unit_price.toLocaleString('en-IN')}</span>
                  </div>
                  <span className="font-extrabold text-slate-950">₹{item.total_price.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
            {order.discount_amount > 0 && (
              <div className="flex justify-between">
                <span>Total Real MRP:</span>
                <span className="font-bold text-slate-900 font-mono">
                  ₹{(order.subtotal + order.discount_amount).toLocaleString('en-IN')}
                </span>
              </div>
            )}
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>
                  Festival Discount (
                  {Math.round((order.discount_amount / (order.subtotal + order.discount_amount)) * 100)}% Off):
                </span>
                <span className="font-mono">- ₹{order.discount_amount.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex justify-between pt-0.5 border-t border-slate-100">
              <span>Final Price (Subtotal):</span>
              <span className="font-bold text-slate-900 font-mono">₹{order.subtotal.toLocaleString('en-IN')}</span>
            </div>
            {isDeliveryFeeSet(order) ? (
              <div className="flex justify-between">
                <span>Delivery Fee ({order.city || order.state}):</span>
                <span className="font-bold text-slate-900 font-mono">
                  ₹{order.delivery_fee.toLocaleString('en-IN')}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[11px] text-amber-900 bg-amber-50/80 px-2.5 py-1.5 rounded-xl border border-amber-200">
                <span className="font-semibold">Delivery Charges:</span>
                <span className="font-bold">To be confirmed by store</span>
              </div>
            )}
            <div className="flex justify-between text-base font-black text-slate-950 pt-2 border-t border-slate-200">
              <span>Grand Total Payable:</span>
              <span className="text-amber-600 font-mono">
                ₹{(isDeliveryFeeSet(order) ? order.grand_total : order.subtotal).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* Support & Helpline Enquiries Section */}
        {(helplineList.length > 0 || whatsappList.length > 0) && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-extrabold text-xs text-slate-900 block">
                  Questions regarding Order #{order.order_number}?
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Reach our Sivakasi fireworks team directly via phone or WhatsApp:
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Helplines */}
              {helplineList.map((item, idx) => (
                <a
                  key={`conf-tel-${idx}`}
                  href={`tel:${item.cleanTel}`}
                  className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-2xl text-xs transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
                      <Phone className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 block font-normal">{item.label}</span>
                      <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-amber-900">{item.display}</span>
                    </div>
                  </div>
                  <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-lg border border-amber-300 shrink-0">
                    Call Line
                  </span>
                </a>
              ))}

              {/* WhatsApp Desks */}
              {whatsappList.map((item, idx) => (
                <a
                  key={`conf-wa-${idx}`}
                  href={`https://wa.me/${item.cleanWa}?text=${encodeURIComponent(`Hi ${settings?.store_name || 'Sivakasi Fireworld'}, I am enquiring about my order #${order.order_number} (${order.customer_name}).`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2.5 bg-emerald-50/70 hover:bg-emerald-100/80 border border-emerald-200 hover:border-emerald-300 rounded-2xl text-xs transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                      <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-emerald-700 block font-normal">{item.label}</span>
                      <span className="font-mono text-xs font-bold text-emerald-950">{item.display}</span>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-lg shrink-0 shadow-2xs">
                    WhatsApp Chat
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Navigation & Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Link
              href="/"
              className="flex-1 sm:flex-initial px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs text-center transition-colors"
            >
              Back to Shop
            </Link>
            <button
              type="button"
              onClick={() => setIsPackingSlipOpen(true)}
              className="flex-1 sm:flex-initial px-5 py-3 bg-white hover:bg-slate-100 text-slate-900 border border-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Printer className="w-4 h-4 text-slate-700" />
              <span>Print Bill</span>
            </button>
            <Link
              href="/track-order"
              className="flex-1 sm:flex-initial px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs text-center flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>TRACK ORDERS</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {isCancellable && (
            <button
              type="button"
              onClick={() => setIsCancelModalOpen(true)}
              className="w-full sm:w-auto px-5 py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Ban className="w-4 h-4 text-red-600" />
              <span>Cancel Order</span>
            </button>
          )}
        </div>

        {/* Cancel Order Modal */}
        {isCancelModalOpen && (
          <CancelOrderModal
            order={order}
            isOpen={isCancelModalOpen}
            onClose={() => setIsCancelModalOpen(false)}
            onConfirmCancel={handleConfirmCancel}
          />
        )}

        {/* Packing Slip & Printable Bill Modal */}
        {isPackingSlipOpen && (
          <PackingSlipModal
            order={order}
            onClose={() => setIsPackingSlipOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

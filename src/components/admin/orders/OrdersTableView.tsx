'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  Square,
  Printer,
  PackageCheck,
  ChevronRight,
} from 'lucide-react';
import { WhatsAppIcon } from '@/components/common/WhatsAppIcon';
import { Order, OrderStatus } from '@/types';
import { WhatsAppService } from '@/lib/services/whatsapp.service';

interface OrdersTableViewProps {
  orders: Order[];
  selectedOrderIds: string[];
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onSelectOrder: (order: Order) => void;
  onPrintSlip: (order: Order) => void;
  onPrintPackingSlip?: (order: Order) => void;
  onRequestStatusChange: (
    orderId: string,
    orderNumber: string,
    currentStatus: OrderStatus,
    newStatus: OrderStatus
  ) => void;
  onTogglePaymentSettlement?: (orderId: string) => void;
  onOpenWhatsAppModal?: (order: Order) => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeCls: string; dotCls: string }
> = {
  PENDING: {
    label: 'Pending',
    badgeCls: 'bg-amber-500/10 text-amber-800 border-amber-500/30',
    dotCls: 'bg-amber-500',
  },
  CONFIRMED: {
    label: 'Confirmed',
    badgeCls: 'bg-blue-500/10 text-blue-800 border-blue-500/30',
    dotCls: 'bg-blue-500',
  },
  PACKING: {
    label: 'Packing',
    badgeCls: 'bg-indigo-500/10 text-indigo-800 border-indigo-500/30',
    dotCls: 'bg-indigo-500',
  },
  PACKED: {
    label: 'Packed',
    badgeCls: 'bg-cyan-500/10 text-cyan-800 border-cyan-500/30',
    dotCls: 'bg-cyan-500',
  },
  DISPATCHED: {
    label: 'Dispatched',
    badgeCls: 'bg-purple-500/10 text-purple-800 border-purple-500/30',
    dotCls: 'bg-purple-500',
  },
  DELIVERED: {
    label: 'Delivered',
    badgeCls: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
    dotCls: 'bg-emerald-500',
  },
  CANCELLED: {
    label: 'Cancelled',
    badgeCls: 'bg-rose-500/10 text-rose-800 border-rose-500/30',
    dotCls: 'bg-rose-500',
  },
};

export function OrdersTableView({
  orders,
  selectedOrderIds,
  onToggleSelection,
  onSelectAll,
  onSelectOrder,
  onPrintSlip,
  onPrintPackingSlip,
  onRequestStatusChange,
  onTogglePaymentSettlement,
  onOpenWhatsAppModal,
}: OrdersTableViewProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getNextStatus = (current: OrderStatus): OrderStatus | null => {
    switch (current) {
      case 'PENDING':
        return 'CONFIRMED';
      case 'CONFIRMED':
        return 'PACKING';
      case 'PACKING':
        return 'PACKED';
      case 'PACKED':
        return 'DISPATCHED';
      case 'DISPATCHED':
        return 'DELIVERED';
      default:
        return null;
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return (
        d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
        ', ' +
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    } catch {
      return iso;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden w-full">
      <table className="w-full text-left text-xs table-fixed md:table-auto">
        <thead className="bg-slate-50/90 text-slate-700 uppercase tracking-wider font-bold border-b border-slate-200/80 text-[10px] sm:text-[11px]">
          <tr>
            {/* Checkbox Column */}
            <th className="p-2 sm:p-3 w-8 sm:w-10 text-center pl-2.5">
              <button
                type="button"
                onClick={onSelectAll}
                className="cursor-pointer inline-flex items-center justify-center"
              >
                {selectedOrderIds.length === orders.length && orders.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-amber-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
              </button>
            </th>

            {/* Order Info (Mobile combined with Customer) */}
            <th className="p-2 sm:p-3 min-w-0">
              <span className="md:hidden">Order & Customer</span>
              <span className="hidden md:inline">Order Info</span>
            </th>

            {/* Customer & Contact (Desktop only) */}
            <th className="p-3 hidden md:table-cell">Customer</th>

            {/* Destination (Desktop only) */}
            <th className="p-3 hidden lg:table-cell">Destination</th>

            {/* Total */}
            <th className="p-2 sm:p-3 text-right w-20 sm:w-28">
              Total
            </th>

            {/* Status */}
            <th className="p-2 sm:p-3 text-right md:text-center pr-3 sm:pr-4 w-24 sm:w-32">
              Status
            </th>

            {/* Quick Actions (Desktop only) */}
            <th className="p-3 text-right pr-4 hidden md:table-cell w-36 lg:w-48">
              Actions
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 font-medium">
          {orders.map((order) => {
            const isSelected = selectedOrderIds.includes(order.id);
            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING;
            const nextStatus = getNextStatus(order.status);

            return (
              <tr
                key={order.id}
                onClick={() => onSelectOrder(order)}
                className={`hover:bg-slate-50/90 transition-colors cursor-pointer group ${
                  isSelected ? 'bg-amber-500/5' : ''
                }`}
              >
                {/* Checkbox */}
                <td
                  className="p-2 sm:p-3 text-center pl-2.5 align-middle"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSelection(order.id)}
                    className="cursor-pointer inline-flex items-center justify-center"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-amber-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </td>

                {/* Order Info & Mobile Customer Details */}
                <td className="p-2 sm:p-3 min-w-0 align-middle">
                  {/* Mobile Presentation */}
                  <div className="md:hidden space-y-0.5">
                    <span className="font-mono font-bold text-slate-900 text-xs whitespace-nowrap block">
                      {order.order_number}
                    </span>
                    <span className="font-semibold text-slate-800 text-xs truncate block leading-tight">
                      {order.customer_name}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate block mt-0.5">
                      {formatDate(order.created_at)} • {order.city}
                    </span>
                  </div>

                  {/* Desktop Presentation */}
                  <div className="hidden md:block">
                    <span className="font-mono font-bold text-slate-900 text-xs whitespace-nowrap block group-hover:text-amber-600 transition-colors">
                      {order.order_number}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium block mt-0.5 whitespace-nowrap">
                      {formatDate(order.created_at)}
                    </span>
                  </div>
                </td>

                {/* Customer (Desktop only) */}
                <td className="p-3 hidden md:table-cell align-middle">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-950 font-black text-[11px] flex items-center justify-center shrink-0">
                      {getInitials(order.customer_name)}
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 block truncate text-xs">
                        {order.customer_name}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono block">
                        {order.customer_mobile}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Destination (Desktop only) */}
                <td className="p-3 hidden lg:table-cell text-slate-700 align-middle">
                  <span className="font-semibold block truncate text-xs">{order.city}</span>
                  <span className="text-[10px] text-slate-400 block">{order.state}</span>
                </td>

                {/* Total */}
                <td className="p-2 sm:p-3 text-right align-middle">
                  <span className="font-mono font-extrabold text-slate-900 text-xs sm:text-sm whitespace-nowrap block">
                    ₹{order.grand_total.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-slate-400 block whitespace-nowrap mt-0.5">
                    {order.items?.length || 0} items
                  </span>
                </td>

                {/* Status */}
                <td className="p-2 sm:p-3 text-right md:text-center pr-3 sm:pr-4 align-middle">
                  <div className="flex justify-end md:justify-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shrink-0 shadow-2xs ${cfg.badgeCls}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dotCls}`} />
                      <span>{cfg.label}</span>
                    </span>
                  </div>
                </td>

                {/* Quick Actions (Desktop only) */}
                <td
                  className="p-3 text-right pr-4 hidden md:table-cell"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenWhatsAppModal
                          ? onOpenWhatsAppModal(order)
                          : window.open(
                              WhatsAppService.generateCustomerWhatsAppLink(order),
                              '_blank'
                            )
                      }
                      className="p-1.5 bg-[#25D366]/10 hover:bg-[#25D366] text-[#25D366] hover:text-white rounded-lg transition-colors cursor-pointer border border-[#25D366]/20"
                      title="Send WhatsApp Update"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5 fill-current" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onPrintSlip(order)}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg transition-colors cursor-pointer border border-slate-200/80"
                      title="Print Bill / Invoice"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onPrintPackingSlip ? onPrintPackingSlip(order) : onPrintSlip(order)
                      }
                      className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 hover:text-amber-950 rounded-lg transition-colors cursor-pointer border border-amber-500/25"
                      title="Print Packing Slip (Warehouse Checklist)"
                    >
                      <PackageCheck className="w-3.5 h-3.5 text-amber-700" />
                    </button>

                    {nextStatus && (
                      <button
                        type="button"
                        onClick={() =>
                          onRequestStatusChange(
                            order.id,
                            order.order_number,
                            order.status,
                            nextStatus
                          )
                        }
                        className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[10px] transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                        title={`Advance to ${nextStatus}`}
                      >
                        {nextStatus === 'CONFIRMED'
                          ? 'Confirm'
                          : nextStatus === 'PACKING'
                          ? 'Pack'
                          : nextStatus === 'DISPATCHED'
                          ? 'Dispatch'
                          : 'Deliver'}
                      </button>
                    )}

                    <Link
                      href={`/admin/orders/${order.order_number}`}
                      className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors inline-flex items-center"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

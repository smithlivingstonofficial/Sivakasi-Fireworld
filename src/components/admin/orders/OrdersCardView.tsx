import { useRouter } from 'next/navigation';
import {
  CheckSquare,
  Square,
  MapPin,
  Truck,
  Printer,
  PackageCheck,
  PhoneCall,
  ChevronRight,
  Calendar,
  Clock,
} from 'lucide-react';
import { WhatsAppIcon } from '@/components/common/WhatsAppIcon';
import { Order, OrderStatus } from '@/types';
import { WhatsAppService } from '@/lib/services/whatsapp.service';

interface OrdersCardViewProps {
  orders: Order[];
  selectedOrderIds: string[];
  onToggleSelection: (id: string) => void;
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

interface DateGroup {
  dateKey: string;
  dateLabel: string;
  orders: Order[];
}

function groupOrdersByDate(orders: Order[]): DateGroup[] {
  const groupsMap = new Map<string, { label: string; orders: Order[] }>();
  const todayStr = new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  orders.forEach((order) => {
    const d = new Date(order.created_at);
    const dateStr = d.toDateString();
    const isoKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (!groupsMap.has(isoKey)) {
      let label = '';
      if (dateStr === todayStr) {
        label = `Today • ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      } else if (dateStr === yesterdayStr) {
        label = `Yesterday • ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      } else {
        label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      }
      groupsMap.set(isoKey, { label, orders: [] });
    }
    groupsMap.get(isoKey)!.orders.push(order);
  });

  return Array.from(groupsMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([isoKey, val]) => ({
      dateKey: isoKey,
      dateLabel: val.label,
      orders: val.orders,
    }));
}

export function OrdersCardView({
  orders,
  selectedOrderIds,
  onToggleSelection,
  onSelectOrder,
  onPrintSlip,
  onPrintPackingSlip,
  onRequestStatusChange,
  onTogglePaymentSettlement,
  onOpenWhatsAppModal,
}: OrdersCardViewProps) {
  const router = useRouter();

  const handleCardClick = (order: Order) => {
    router.push(`/admin/orders/${order.order_number}`);
  };

  const getStatusBadgeStyle = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return {
          bg: 'bg-amber-500/10 text-amber-800 border-amber-500/30',
          dot: 'bg-amber-500 animate-pulse',
          line: 'bg-amber-500',
        };
      case 'CONFIRMED':
        return {
          bg: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
          dot: 'bg-emerald-500',
          line: 'bg-emerald-500',
        };
      case 'PACKING':
      case 'PACKED':
        return {
          bg: 'bg-amber-600/10 text-amber-900 border-amber-600/30',
          dot: 'bg-amber-600 animate-pulse',
          line: 'bg-amber-600',
        };
      case 'DISPATCHED':
        return {
          bg: 'bg-blue-500/10 text-blue-800 border-blue-500/30',
          dot: 'bg-blue-500',
          line: 'bg-blue-500',
        };
      case 'DELIVERED':
        return {
          bg: 'bg-emerald-600 text-white border-emerald-600',
          dot: 'bg-white',
          line: 'bg-emerald-600',
        };
      case 'CANCELLED':
        return {
          bg: 'bg-red-500/10 text-red-800 border-red-500/30',
          dot: 'bg-red-500',
          line: 'bg-red-500',
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-800 border-slate-200',
          dot: 'bg-slate-400',
          line: 'bg-slate-300',
        };
    }
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

  const getNextStatusButtonConfig = (next: OrderStatus) => {
    switch (next) {
      case 'CONFIRMED':
        return {
          label: '✓ Confirm Order',
          style:
            'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-500/20',
        };
      case 'PACKING':
        return {
          label: '📦 Start Packing',
          style:
            'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:from-amber-400 hover:to-amber-500 shadow-amber-500/20',
        };
      case 'DISPATCHED':
        return {
          label: '🚚 Dispatch Order',
          style:
            'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-blue-500/20',
        };
      case 'DELIVERED':
        return {
          label: '🎉 Mark Delivered',
          style:
            'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-emerald-600/20',
        };
      default:
        return {
          label: 'Advance Status',
          style: 'bg-amber-500 text-slate-950',
        };
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

  const dateGroups = groupOrdersByDate(orders);

  return (
    <div className="space-y-6">
      {dateGroups.map((group) => (
        <div key={group.dateKey} className="space-y-3.5">
          {/* Section Header / Date Separator Bar */}
          <div className="flex items-center gap-3 pt-2">
            <div className="flex items-center gap-2 bg-slate-900 text-white px-3.5 py-1.5 rounded-full text-xs font-black shadow-xs shrink-0 border border-slate-800">
              <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{group.dateLabel}</span>
              <span className="bg-amber-500 text-slate-950 px-2 py-0.2 rounded-full text-[10px] font-black">
                {group.orders.length} {group.orders.length === 1 ? 'Order' : 'Orders'}
              </span>
            </div>
            <div className="h-px bg-slate-200/90 flex-1" />
          </div>

          {/* Order Cards Grid for this Date Group */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            {group.orders.map((order) => {
              const isSelected = selectedOrderIds.includes(order.id);
              const nextStatus = getNextStatus(order.status);
              const statusConfig = getStatusBadgeStyle(order.status);
              const nextBtnConfig = nextStatus ? getNextStatusButtonConfig(nextStatus) : null;
              const totalUnitsCount = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

              const orderTimeStr = new Date(order.created_at).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              });

              return (
                <div
                  key={order.id}
                  onClick={() => handleCardClick(order)}
                  className={`bg-white rounded-2xl border transition-all duration-200 p-3.5 sm:p-4 flex flex-col justify-between space-y-2.5 relative overflow-hidden group cursor-pointer ${
                    isSelected
                      ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-md'
                      : 'border-slate-200/90 shadow-xs hover:shadow-md hover:border-slate-300'
                  }`}
                >
                  {/* Status Top Accent Line */}
                  <div className={`h-1.5 w-full absolute top-0 left-0 ${statusConfig.line}`} />

                  <div className="space-y-3">
                    {/* Card Top Header Row */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 pt-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSelection(order.id);
                          }}
                          className="text-slate-400 hover:text-amber-600 cursor-pointer p-0.5 shrink-0"
                          aria-label="Select order"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCardClick(order);
                          }}
                          className="font-black text-slate-900 text-base tracking-tight hover:text-amber-600 transition-colors cursor-pointer truncate font-mono"
                        >
                          <span>{order.order_number}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 font-black text-[10px] px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${statusConfig.bg}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                          <span>{order.status}</span>
                        </span>
                      </div>
                    </div>

                    {/* Customer Profile & Address Card */}
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-950 font-black text-xs flex items-center justify-center border border-amber-500/20 shrink-0 shadow-2xs">
                            {getInitials(order.customer_name)}
                          </div>
                          <div className="min-w-0">
                            <span className="font-extrabold text-slate-950 text-xs sm:text-sm block truncate leading-tight">
                              {order.customer_name}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono block leading-tight">
                              {order.customer_mobile}
                            </span>
                          </div>
                        </div>

                        {/* Order Exact Time Tag */}
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold bg-white px-2 py-1 rounded-lg border border-slate-200/80 shrink-0 shadow-2xs">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{orderTimeStr}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 min-w-0 text-slate-700 text-[11px] font-extrabold">
                        <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="truncate">
                          {order.city}, {order.state}
                        </span>
                      </div>

                      {/* 1-Tap Ergonomic Full-Width Call & Original WhatsApp Action Pills */}
                      <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200/60">
                        <a
                          href={`tel:${order.customer_mobile}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 py-2 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 border border-slate-200/90 transition-colors shadow-2xs cursor-pointer"
                          title="Call Customer"
                        >
                          <PhoneCall className="w-3.5 h-3.5 text-slate-700" />
                          <span>Call</span>
                        </a>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenWhatsAppModal) {
                              onOpenWhatsAppModal(order);
                            } else {
                              window.open(WhatsAppService.generateCustomerWhatsAppLink(order), '_blank');
                            }
                          }}
                          className="flex-1 py-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                          title="Send WhatsApp Update to Customer"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                          <span className="text-white">WhatsApp</span>
                        </button>
                      </div>
                    </div>

                    {/* Courier Partner & LR Tracking Badge */}
                    {order.courier_partner && (
                      <div className="flex items-center justify-between text-xs bg-blue-50/80 p-2 rounded-xl border border-blue-200/60">
                        <span className="font-bold text-blue-900 flex items-center gap-1.5 text-[11px]">
                          <Truck className="w-3.5 h-3.5 text-blue-600" />
                          {order.courier_partner}
                        </span>
                        <span className="font-mono font-black text-blue-700 text-[11px]">
                          #{order.tracking_number || 'Pending'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Ergonomic Card Footer Actions Row */}
                  <div className="pt-2.5 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          Grand Total
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-base sm:text-lg font-black text-slate-950 font-mono leading-tight">
                            ₹{order.grand_total.toLocaleString('en-IN')}
                          </span>
                          {totalUnitsCount > 0 && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              • {totalUnitsCount} units
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPrintSlip(order);
                          }}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-all border border-slate-200 cursor-pointer text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95"
                          title="Print Bill / Invoice"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-700" />
                          <span>Bill</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onPrintPackingSlip) {
                              onPrintPackingSlip(order);
                            } else {
                              onPrintSlip(order);
                            }
                          }}
                          className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 rounded-xl transition-all border border-amber-500/25 cursor-pointer text-xs font-bold flex items-center gap-1 shadow-2xs active:scale-95"
                          title="Print Packing Slip (Warehouse Checklist)"
                        >
                          <PackageCheck className="w-3.5 h-3.5 text-amber-700" />
                          <span>Packing Slip</span>
                        </button>
                      </div>
                    </div>

                    {/* Full-Width Touch Status Advancement Button */}
                    {nextStatus && nextBtnConfig && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestStatusChange(
                            order.id,
                            order.order_number,
                            order.status,
                            nextStatus
                          );
                        }}
                        className={`w-full py-2.5 rounded-2xl font-black text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 ${nextBtnConfig.style}`}
                      >
                        <span>{nextBtnConfig.label}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}


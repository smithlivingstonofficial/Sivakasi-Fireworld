'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, Printer, Sparkles, Tag } from 'lucide-react';
import { Order, Product, isDeliveryFeeSet } from '@/types';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { ProductService } from '@/lib/services/product.service';
import { SettingsService } from '@/lib/services/settings.service';

interface PackingSlipModalProps {
  order: Order | null;
  onClose: () => void;
}

export function PackingSlipModal({ order, onClose }: PackingSlipModalProps) {
  const [mounted, setMounted] = useState(false);
  const { settings } = useStoreSettings();
  const [products, setProducts] = useState<Product[]>(() => ProductService.getCachedProducts() || []);

  useEffect(() => {
    setMounted(true);
    if (!products.length) {
      ProductService.getAllProducts().then(setProducts).catch(() => {});
    }
  }, [products.length]);

  // Fast product lookup map by ID and Name
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => {
      map.set(p.id, p);
      if (p.name) map.set(p.name.toLowerCase().trim(), p);
    });
    return map;
  }, [products]);

  // Enriched items with authoritative Real MRP, Total MRP, Discounted Rate, Discount Amount, and Final Price
  const enrichedItems = useMemo(() => {
    if (!order?.items) return [];

    const hasDbDiscount = (order.discount_amount || 0) > 0 && (order.subtotal || 0) > 0;
    const overallRatio = hasDbDiscount
      ? ((order.subtotal || 0) + (order.discount_amount || 0)) / (order.subtotal || 1)
      : 1;

    return order.items.map((item) => {
      const dbProduct =
        productMap.get(item.product_id) ||
        productMap.get(item.product_name.toLowerCase().trim());

      // Authoritative Real MRP per unit
      let unitMrp = item.mrp || dbProduct?.mrp;
      if (!unitMrp || unitMrp < item.unit_price) {
        if (hasDbDiscount && overallRatio > 1) {
          unitMrp = Math.round(item.unit_price * overallRatio);
        } else {
          unitMrp = item.unit_price;
        }
      }

      const totalMrp = unitMrp * item.quantity;
      const unitPrice = item.unit_price;
      const finalPrice = item.total_price || unitPrice * item.quantity;
      const discountAmount = Math.max(0, totalMrp - finalPrice);
      const discountPercent = totalMrp > 0 ? Math.round((discountAmount / totalMrp) * 100) : 0;
      const packSize = (item as any).pack_size || dbProduct?.pack_size;

      return {
        ...item,
        unitMrp,
        totalMrp,
        unitPrice,
        finalPrice,
        discountAmount,
        discountPercent,
        packSize,
      };
    });
  }, [order, productMap]);

  if (!order || !mounted) return null;

  const totalItemsCount = order.items?.length || 0;
  const totalQuantity = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const formattedDate = new Date(order.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Calculate Authoritative Financial Totals
  const totalCalculatedMrp = Math.max(
    enrichedItems.reduce((acc, i) => acc + i.totalMrp, 0),
    (order.subtotal || 0) + (order.discount_amount || 0)
  );

  const finalItemsSubtotal =
    enrichedItems.reduce((acc, i) => acc + i.finalPrice, 0) || order.subtotal || 0;

  const totalDiscountAmount = Math.max(0, totalCalculatedMrp - finalItemsSubtotal);

  const overallDiscountPercent =
    totalCalculatedMrp > 0
      ? Math.round((totalDiscountAmount / totalCalculatedMrp) * 100)
      : 0;

  const deliveryFeeIsSet = isDeliveryFeeSet(order);
  const deliveryFee = deliveryFeeIsSet ? (order.delivery_fee || 0) : 0;
  const grandTotal = finalItemsSubtotal + deliveryFee;

  return createPortal(
    <div className="packing-slip-portal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 print:static print:inset-auto print:z-auto print:bg-transparent print:p-0 print:m-0 print:block print:overflow-visible font-sans">
      {/* World-Class React Portal Multi-Page Print CSS Rules */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm 10mm 10mm;
          }

          /* Hide all non-portal elements in document body */
          body > *:not(.packing-slip-portal) {
            display: none !important;
          }

          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .packing-slip-portal {
            display: block !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }

          #printable-packing-slip {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }

          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .print-keep-together {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .no-print, .no-print * {
            display: none !important;
          }
        }
      `}</style>

      {/* Main Printable Card Container */}
      <div
        id="printable-packing-slip"
        className="bg-white rounded-3xl p-5 sm:p-8 max-w-4xl w-full shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto animate-in zoom-in-98 duration-150 print:animate-none print:max-w-none print:w-full print:max-h-none print:p-0 print:m-0 print:rounded-none print:border-none print:shadow-none print:overflow-visible print:space-y-3.5 print:static"
      >
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-3 print:pb-2">
          {/* Screen Actions Header Bar */}
          <div className="flex items-center justify-between no-print mb-3 pb-3 border-b border-slate-100">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Print Bill / Invoice Preview</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>Print Bill</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-3">
              {settings?.logo_url && settings.logo_url !== '/logo.png' ? (
                <div className="w-11 h-11 rounded-xl bg-white border border-slate-200/90 p-1 flex items-center justify-center shrink-0">
                  <Image
                    src={settings.logo_url}
                    alt="Store Logo"
                    width={44}
                    height={44}
                    unoptimized
                    className="max-h-9 w-auto object-contain"
                  />
                </div>
              ) : (
                <div className="w-11 h-11 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm shrink-0">
                  SF
                </div>
              )}
              <div>
                <span className="text-[10px] sm:text-xs print:text-[9pt] font-black text-amber-700 uppercase tracking-widest block">
                  {(settings?.store_name || 'SIVAKASI FIREWORLD').toUpperCase()} • SIVAKASI DIRECT WAREHOUSE
                </span>
                <h1 className="text-lg sm:text-2xl print:text-[14pt] font-black text-slate-950 tracking-tight mt-0.5">
                  {settings?.gstin?.trim() ? 'TAX INVOICE & PACKING BILL' : 'RETAIL INVOICE & PACKING BILL'}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs print:text-[9.5pt] text-slate-700 font-mono font-bold pt-0.5 sm:pt-0 sm:text-right">
              <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-900 font-black">
                Invoice #{order.order_number}
              </span>
              <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700">
                Date: {formattedDate}
              </span>
            </div>
          </div>
        </div>

        {/* Invoice Address Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3.5 print:gap-3 text-xs print:text-[9.5pt]">
          {/* Dispatch From */}
          <div className="bg-slate-50 p-3.5 print:p-2.5 rounded-2xl print:rounded-xl border border-slate-300 space-y-1 print:bg-white print:border-slate-300">
            <span className="text-[10px] print:text-[8pt] font-black text-slate-500 uppercase tracking-wider block">
              Dispatched From Warehouse
            </span>
            <span className="font-black text-slate-950 text-sm print:text-[10.5pt] block">
              {settings?.store_name || 'Sivakasi Fireworld'}
            </span>
            {settings?.store_address ? (
              <span className="text-slate-700 text-xs print:text-[9pt] block leading-relaxed">
                {settings.store_address}
              </span>
            ) : null}
            {(settings?.gstin?.trim() || SettingsService.getCombinedHelplineString(settings)) ? (
              <div className="flex items-center gap-3 pt-1 text-xs print:text-[8.5pt] text-slate-700 font-mono font-bold border-t border-slate-200/80 mt-1">
                {settings?.gstin && settings.gstin.trim() ? (
                  <span>GSTIN: {settings.gstin.trim()}</span>
                ) : null}
                {SettingsService.getCombinedHelplineString(settings) ? (
                  <span>Ph: {SettingsService.getCombinedHelplineString(settings)}</span>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Delivery To Customer */}
          <div className="bg-slate-50 p-3.5 print:p-2.5 rounded-2xl print:rounded-xl border border-slate-300 space-y-1 print:bg-white print:border-slate-300">
            <span className="text-[10px] print:text-[8pt] font-black text-slate-500 uppercase tracking-wider block">
              Ship &amp; Bill To Customer
            </span>
            <span className="font-black text-slate-950 text-sm print:text-[10.5pt] block">
              {order.customer_name}
            </span>
            <span className="text-slate-700 text-xs print:text-[9pt] block leading-relaxed">
              {order.shipping_address}, {order.city}, {order.state} - {order.pincode}
            </span>
            <div className="pt-1 text-xs print:text-[9pt] text-slate-900 font-mono font-extrabold border-t border-slate-200/80 mt-1">
              Mobile: +91 {order.customer_mobile.slice(-10)}
            </div>
          </div>
        </div>

        {/* Courier Info Banner */}
        {order.courier_partner && (
          <div className="bg-slate-100 text-slate-950 border border-slate-300 p-2.5 print:p-1.5 rounded-xl flex items-center justify-between gap-2 text-xs print:text-[9pt] print:bg-white print:border-slate-300 font-mono">
            <span className="text-slate-600 font-bold">Courier &amp; Logistics:</span>
            <span className="font-black text-slate-950 truncate">
              {order.courier_partner} ({order.tracking_number || 'Pending'}) • Est: {order.estimated_delivery || '2-3 Days'}
            </span>
          </div>
        )}

        {/* Itemized Table with MRP, Discount, and Total */}
        <div className="border border-slate-300 rounded-2xl overflow-x-auto scrollbar-none print:overflow-visible print:rounded-xl">
          <table className="w-full text-left text-xs border-collapse min-w-[500px] sm:min-w-0 print:min-w-0">
            <thead className="bg-slate-900 text-white print:text-slate-950 font-black uppercase text-[10px] print:text-[8.5pt] tracking-wider border-b border-slate-300 print:bg-slate-200">
              <tr>
                <th className="p-2.5 print:p-2 border-r border-slate-300 w-10 print:w-8 text-center">#</th>
                <th className="p-2.5 print:p-2 border-r border-slate-300">Item Description</th>
                <th className="p-2.5 print:p-2 text-center border-r border-slate-300 w-14 print:w-12">Qty</th>
                <th className="p-2.5 print:p-2 text-right border-r border-slate-300 w-28 print:w-24">MRP</th>
                <th className="p-2.5 print:p-2 text-right border-r border-slate-300 w-28 print:w-24">Discount</th>
                <th className="p-2.5 print:p-2 text-right w-28 print:w-24">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-medium">
              {enrichedItems.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/80 print:bg-slate-50' : 'bg-white'}>
                  {/* 1. S.No */}
                  <td className="p-2.5 print:p-1.5 text-center text-slate-500 font-mono text-xs print:text-[9pt] border-r border-slate-200">
                    {idx + 1}
                  </td>

                  {/* 2. Product Name & Pack Size */}
                  <td className="p-2.5 print:p-1.5 font-extrabold text-slate-950 border-r border-slate-200 text-xs print:text-[9.5pt]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{item.product_name}</span>
                      {item.packSize && (
                        <span className="text-[9px] print:text-[7.5pt] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200 font-bold whitespace-nowrap">
                          {item.packSize}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 3. Quantity */}
                  <td className="p-2.5 print:p-1.5 text-center font-black text-slate-950 border-r border-slate-200 bg-amber-50/40 print:bg-transparent text-xs print:text-[9.5pt]">
                    {item.quantity}
                  </td>

                  {/* 4. MRP (Total MRP for quantity) */}
                  <td className="p-2.5 print:p-1.5 text-right font-bold text-slate-800 font-mono border-r border-slate-200 text-xs print:text-[9.5pt] whitespace-nowrap">
                    <span>₹{item.totalMrp.toLocaleString('en-IN')}</span>
                    {item.quantity > 1 && (
                      <span className="block text-[10px] print:text-[7.5pt] text-slate-400 font-normal">
                        (₹{item.unitMrp.toLocaleString('en-IN')}/pc)
                      </span>
                    )}
                  </td>

                  {/* 5. Discount Amount */}
                  <td className="p-2.5 print:p-1.5 text-right font-bold text-emerald-700 print:text-black font-mono border-r border-slate-200 text-xs print:text-[9.5pt] whitespace-nowrap">
                    {item.discountAmount > 0 ? (
                      <span>-₹{item.discountAmount.toLocaleString('en-IN')}</span>
                    ) : (
                      <span className="text-slate-400">₹0</span>
                    )}
                  </td>

                  {/* 6. Total (Final Price) */}
                  <td className="p-2.5 print:p-1.5 text-right font-black text-slate-950 font-mono text-xs print:text-[9.5pt] whitespace-nowrap">
                    <span>₹{item.finalPrice.toLocaleString('en-IN')}</span>
                    {item.quantity > 1 && (
                      <span className="block text-[10px] print:text-[7.5pt] text-slate-400 font-normal">
                        (₹{item.unitPrice.toLocaleString('en-IN')}/pc)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Item Summary Bar */}
          <div className="bg-slate-100 px-4 py-2 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 text-xs print:text-[9pt] font-extrabold text-slate-800 font-mono">
            <span>TOTAL PRODUCTS: {totalItemsCount} Items ({totalQuantity} Pcs)</span>
            <div className="flex items-center gap-3">
              <span className="text-slate-700 font-bold">TOTAL MRP: ₹{totalCalculatedMrp.toLocaleString('en-IN')}</span>
              {totalDiscountAmount > 0 && (
                <span className="text-emerald-700 print:text-black font-black">
                  DISCOUNT: -₹{totalDiscountAmount.toLocaleString('en-IN')} ({overallDiscountPercent}%)
                </span>
              )}
              <span className="text-slate-950 font-black">
                TOTAL: ₹{finalItemsSubtotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* Highlight Festive Savings Banner */}
        {totalDiscountAmount > 0 && (
          <div className="bg-emerald-50 print:bg-slate-50 border border-emerald-300 print:border-slate-400 rounded-2xl p-2.5 sm:p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs print:text-[8.5pt]">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-700 text-white font-black text-[9px] print:text-[7.5pt] uppercase px-2 py-0.5 rounded-md shadow-xs">
                Savings
              </span>
              <span className="text-slate-900 font-bold">
                You saved <strong className="text-emerald-800 print:text-black font-black font-mono">₹{totalDiscountAmount.toLocaleString('en-IN')}</strong> ({overallDiscountPercent}% Direct Sivakasi Factory Discount) on MRP!
              </span>
            </div>
            <span className="font-mono text-slate-600 text-[10px] print:text-[8pt] shrink-0">
              MRP: ₹{totalCalculatedMrp.toLocaleString('en-IN')} → Total: ₹{finalItemsSubtotal.toLocaleString('en-IN')}
            </span>
          </div>
        )}

        {/* Bottom Section: Financial Totals + Terms & Signature */}
        <div className="space-y-3.5 pt-1 print-keep-together">
          <div className="flex justify-end pt-2 border-t-2 border-slate-900">
            {/* Financial Totals Breakdown */}
            <div className="w-full sm:max-w-xs print:max-w-xs space-y-1.5 text-xs print:text-[9pt] text-slate-700 font-bold bg-slate-50 p-3.5 print:p-2 rounded-2xl print:rounded-xl border border-slate-300">
              <div className="flex justify-between">
                <span>Total MRP:</span>
                <span className="font-mono text-slate-900 font-black">
                  ₹{totalCalculatedMrp.toLocaleString('en-IN')}
                </span>
              </div>
              {totalDiscountAmount > 0 ? (
                <div className="flex justify-between text-emerald-700 print:text-black font-black">
                  <span>Discount ({overallDiscountPercent}% Off):</span>
                  <span className="font-mono">-₹{totalDiscountAmount.toLocaleString('en-IN')}</span>
                </div>
              ) : null}
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span>Total:</span>
                <span className="font-mono text-slate-950 font-black">
                  ₹{finalItemsSubtotal.toLocaleString('en-IN')}
                </span>
              </div>
              {deliveryFeeIsSet && (
                <div className="flex justify-between">
                  <span>Delivery Freight ({order.city || order.state}):</span>
                  <span className="font-mono text-slate-950 font-extrabold">
                    {deliveryFee > 0 ? `₹${deliveryFee.toLocaleString('en-IN')}` : '₹0 (Free / Nil)'}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm sm:text-base print:text-[11pt] font-black text-slate-950 pt-1.5 border-t-2 border-slate-950">
                <span>Grand Total Payable:</span>
                <span className="font-mono text-amber-700 print:text-black text-base print:text-[11.5pt] font-black">
                  ₹{grandTotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Terms & Dispatch Signature Line */}
          <div className="flex items-center justify-between text-xs print:text-[8.5pt] text-slate-500 font-mono pt-1">
            <span>Thank you for buying from {settings?.store_name || 'Sivakasi Fireworld'} - Sivakasi Direct Warehouse!</span>
            <span className="font-bold text-slate-900">Auth. Dispatch Signature: ________________</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, Printer, PackageCheck, Truck, MapPin, Phone, Calendar } from 'lucide-react';
import { Order, Product } from '@/types';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { ProductService } from '@/lib/services/product.service';
import { SettingsService } from '@/lib/services/settings.service';

interface WarehousePackingSlipModalProps {
  order: Order | null;
  onClose: () => void;
}

/**
 * Extracts the number of individual pieces per pack/box from the pack size description.
 * E.g., "10 Pcs" -> 10, "5 Pcs/Box" -> 5, "100 Wala" -> 100, "12 Shots" -> 12, "1 Box" -> 1.
 */
function parsePiecesPerUnit(packSize?: string): number {
  if (!packSize) return 1;
  const trimmed = packSize.trim();
  if (!trimmed) return 1;

  const match = trimmed.match(/(\d+)\s*(?:pcs|pieces|wala|shots|shot|units|unit)/i);
  if (match) {
    const val = parseInt(match[1], 10);
    return !isNaN(val) && val > 0 ? val : 1;
  }

  // Pure digits case: e.g. "10"
  if (/^\d+$/.test(trimmed)) {
    const val = parseInt(trimmed, 10);
    return !isNaN(val) && val > 0 ? val : 1;
  }

  return 1;
}

export function WarehousePackingSlipModal({ order, onClose }: WarehousePackingSlipModalProps) {
  const [mounted, setMounted] = useState(false);
  const { settings } = useStoreSettings();
  const [products, setProducts] = useState<Product[]>(() => ProductService.getCachedProducts() || []);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setMounted(true);
    if (!products.length) {
      ProductService.getAllProducts().then(setProducts).catch(() => {});
    }
  }, [products.length]);

  // Fast product lookup map by ID and Name to resolve pack sizes
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => {
      map.set(p.id, p);
      if (p.name) map.set(p.name.toLowerCase().trim(), p);
    });
    return map;
  }, [products]);

  // Enrich order items with pack size and computed final piece counts
  const packingItems = useMemo(() => {
    if (!order?.items) return [];

    return order.items.map((item, idx) => {
      const dbProduct =
        productMap.get(item.product_id) ||
        productMap.get(item.product_name.toLowerCase().trim());

      const packSize = (item as any).pack_size || dbProduct?.pack_size || '1 Box';
      const piecesPerUnit = parsePiecesPerUnit(packSize);
      const totalPieces = item.quantity * piecesPerUnit;

      return {
        ...item,
        packSize,
        piecesPerUnit,
        totalPieces,
      };
    });
  }, [order, productMap]);

  if (!order || !mounted) return null;

  const totalLines = packingItems.length;
  const totalBoxes = packingItems.reduce((sum, item) => sum + item.quantity, 0);
  const grandTotalPieces = packingItems.reduce((sum, item) => sum + item.totalPieces, 0);

  const formattedDate = new Date(order.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return createPortal(
    <div className="warehouse-packing-slip-portal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 print:static print:inset-auto print:z-auto print:bg-transparent print:p-0 print:m-0 print:block print:overflow-visible font-sans">
      {/* High-Contrast Thermal / A4 Multi-Page Print CSS */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm 10mm 10mm;
          }

          /* Hide all non-portal elements in document body */
          body > *:not(.warehouse-packing-slip-portal) {
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

          .warehouse-packing-slip-portal {
            display: block !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }

          #printable-warehouse-slip {
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

      {/* Main Printable Container */}
      <div
        id="printable-warehouse-slip"
        className="bg-white rounded-3xl p-5 sm:p-8 max-w-4xl w-full shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto animate-in zoom-in-98 duration-150 print:animate-none print:max-w-none print:w-full print:max-h-none print:p-0 print:m-0 print:rounded-none print:border-none print:shadow-none print:overflow-visible print:space-y-3.5 print:static text-slate-900"
      >
        {/* Screen Header Bar (Hidden during Print) */}
        <div className="flex items-center justify-between no-print pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-900 flex items-center justify-center font-black">
              <PackageCheck className="w-4 h-4 text-amber-700" />
            </span>
            <div>
              <span className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                Warehouse Packing Slip
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Pick, Pack &amp; Dispatch Checklist (Zero Financials)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Print Packing Slip</span>
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

        {/* Packing Slip Document Header */}
        <div className="border-b-2 border-slate-950 pb-3 print:pb-2">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-3">
              {settings?.logo_url && settings.logo_url !== '/logo.png' ? (
                <div className="w-12 h-12 rounded-xl bg-white border border-slate-300 p-1 flex items-center justify-center shrink-0">
                  <Image
                    src={settings.logo_url}
                    alt="Store Logo"
                    width={48}
                    height={48}
                    unoptimized
                    className="max-h-10 w-auto object-contain"
                  />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-slate-950 text-amber-400 font-black flex items-center justify-center text-sm shrink-0 border border-slate-900">
                  SF
                </div>
              )}
              <div>
                <span className="text-[10px] sm:text-xs print:text-[8.5pt] font-black text-amber-700 uppercase tracking-widest block">
                  {(settings?.store_name || 'SIVAKASI FIREWORLD').toUpperCase()} • WAREHOUSE &amp; DISPATCH
                </span>
                <h1 className="text-xl sm:text-2xl print:text-[15pt] font-black text-slate-950 tracking-tight mt-0.5 uppercase">
                  WAREHOUSE PACKING SLIP
                </h1>
                <span className="text-[10px] print:text-[8pt] text-slate-500 font-semibold uppercase tracking-wider block">
                  Items Checklist &amp; Final Pieces Verification
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs print:text-[9.5pt] font-mono font-bold sm:text-right pt-1 sm:pt-0">
              <span className="bg-slate-900 text-white px-3 py-1.5 rounded-lg font-black text-xs print:bg-white print:text-black print:border print:border-black">
                Order #{order.order_number}
              </span>
              <span className="bg-slate-100 text-slate-800 px-3 py-1.5 rounded-lg border border-slate-300 font-bold print:bg-white print:border-black">
                Date: {formattedDate}
              </span>
            </div>
          </div>
        </div>

        {/* Customer Shipping & Logistics Context Grid (No Prices) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 print:gap-2.5 text-xs print:text-[9.5pt]">
          {/* Customer Ship-To Address */}
          <div className="bg-slate-50 p-3 print:p-2 rounded-xl border border-slate-300 space-y-1 print:bg-white print:border-slate-400">
            <span className="text-[10px] print:text-[8pt] font-black text-slate-500 uppercase tracking-wider block">
              Deliver &amp; Ship To Customer
            </span>
            <span className="font-black text-slate-950 text-sm print:text-[10.5pt] block">
              {order.customer_name}
            </span>
            <span className="text-slate-700 text-xs print:text-[9pt] block leading-relaxed">
              {order.shipping_address}, {order.city}, {order.state} - {order.pincode}
            </span>
            <div className="pt-1 text-xs print:text-[9pt] text-slate-900 font-mono font-black border-t border-slate-200 mt-1 flex items-center gap-1.5">
              <span>Mobile: +91 {order.customer_mobile.slice(-10)}</span>
            </div>
          </div>

          {/* Logistics & Dispatch Instructions */}
          <div className="bg-slate-50 p-3 print:p-2 rounded-xl border border-slate-300 space-y-1.5 print:bg-white print:border-slate-400 flex flex-col justify-between">
            <div>
              <span className="text-[10px] print:text-[8pt] font-black text-slate-500 uppercase tracking-wider block">
                Logistics &amp; Transport Details
              </span>
              <div className="pt-1 text-xs print:text-[9pt] space-y-1">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-slate-600 font-bold">Courier / Carrier:</span>
                  <span className="font-black text-slate-950">
                    {order.courier_partner || 'Direct Lorry Freight / Local Pickup'}
                  </span>
                </div>
                {order.tracking_number && (
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-slate-600 font-bold">LR / Docket No:</span>
                    <span className="font-black text-slate-950">#{order.tracking_number}</span>
                  </div>
                )}
                {order.estimated_delivery && (
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-slate-600 font-bold">Est. Delivery:</span>
                    <span className="text-slate-800 font-bold">{order.estimated_delivery}</span>
                  </div>
                )}
              </div>
            </div>

            {order.admin_notes && (
              <div className="pt-1 border-t border-slate-200 text-[11px] print:text-[8pt] text-slate-700 bg-amber-50/50 print:bg-white p-1 rounded font-mono">
                <strong className="text-slate-900">Notes:</strong> {order.admin_notes}
              </div>
            )}
          </div>
        </div>

        {/* 5-Column Packing Checklist Table */}
        <div className="border-2 border-slate-900 rounded-xl overflow-x-auto scrollbar-none print:overflow-visible print:border-2 print:border-black">
          <table className="w-full text-left text-xs border-collapse min-w-[500px] sm:min-w-0 print:min-w-0">
            <thead className="bg-slate-950 text-white print:bg-slate-200 print:text-black font-black uppercase text-[10px] print:text-[9pt] tracking-wider border-b-2 border-slate-900">
              <tr>
                {/* 1. S.No */}
                <th className="p-2.5 print:p-2 border-r border-slate-400 w-12 print:w-10 text-center">
                  S.No
                </th>
                {/* 2. Product Name */}
                <th className="p-2.5 print:p-2 border-r border-slate-400">
                  Product Name
                </th>
                {/* 3. Quantity */}
                <th className="p-2.5 print:p-2 text-center border-r border-slate-400 w-24 print:w-20">
                  Quantity
                </th>
                {/* 4. Total Final Pieces */}
                <th className="p-2.5 print:p-2 text-center border-r border-slate-400 w-36 print:w-32">
                  Total Final Pieces
                </th>
                {/* 5. Check Box */}
                <th className="p-2.5 print:p-2 text-center w-20 print:w-16">
                  Check Box
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 font-medium">
              {packingItems.map((item, idx) => {
                const isChecked = !!checkedItems[idx];

                return (
                  <tr
                    key={idx}
                    className={`${
                      idx % 2 === 1 ? 'bg-slate-50/80 print:bg-slate-50' : 'bg-white'
                    } hover:bg-amber-50/40 transition-colors`}
                  >
                    {/* 1. S.No */}
                    <td className="p-2.5 print:p-2 text-center font-mono font-bold text-slate-600 print:text-black text-xs print:text-[9.5pt] border-r border-slate-300">
                      {idx + 1}
                    </td>

                    {/* 2. Product Name & Pack Size */}
                    <td className="p-2.5 print:p-2 font-extrabold text-slate-950 border-r border-slate-300 text-xs print:text-[10pt]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={isChecked ? 'line-through text-slate-400 print:text-black' : ''}>
                          {item.product_name}
                        </span>
                        {item.packSize && (
                          <span className="text-[9px] print:text-[7.5pt] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-300 font-bold whitespace-nowrap">
                            {item.packSize}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. Quantity */}
                    <td className="p-2.5 print:p-2 text-center font-black text-slate-950 border-r border-slate-300 text-xs sm:text-sm print:text-[10pt] bg-amber-50/20 print:bg-transparent">
                      <span className="inline-block px-2 py-0.5 bg-slate-100 print:bg-transparent rounded border border-slate-200 print:border-none font-mono">
                        {item.quantity} {item.quantity === 1 ? 'Box' : 'Boxes'}
                      </span>
                    </td>

                    {/* 4. Total Final Pieces */}
                    <td className="p-2.5 print:p-2 text-center font-black text-slate-950 border-r border-slate-300 text-xs sm:text-sm print:text-[10pt] font-mono">
                      <span className="text-slate-950 font-black">
                        {item.totalPieces.toLocaleString('en-IN')}&nbsp;Pcs
                      </span>
                      {item.piecesPerUnit > 1 && (
                        <span className="block text-[10px] print:text-[7.5pt] text-slate-500 font-semibold">
                          ({item.quantity} × {item.piecesPerUnit} pcs)
                        </span>
                      )}
                    </td>

                    {/* 5. Check Box */}
                    <td className="p-2.5 print:p-2 text-center align-middle">
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => toggleCheck(idx)}
                          className={`w-6 h-6 print:w-5 print:h-5 rounded-md border-2 border-slate-900 print:border-black flex items-center justify-center cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-emerald-600 text-white font-black'
                              : 'bg-white hover:bg-slate-100'
                          }`}
                          title="Click to toggle check"
                        >
                          {isChecked ? (
                            <span className="text-xs print:text-[10pt] font-black leading-none">✓</span>
                          ) : null}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Packing Summary Strip */}
          <div className="bg-slate-100 print:bg-slate-100 px-4 py-2.5 border-t-2 border-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs print:text-[9.5pt] font-extrabold text-slate-900 font-mono">
            <div className="flex items-center gap-3">
              <span>TOTAL ITEMS: {totalLines} Products</span>
              <span>•</span>
              <span>TOTAL BOXES: {totalBoxes} Boxes</span>
            </div>
            <div className="bg-slate-950 text-amber-400 print:bg-white print:text-black print:border print:border-black px-3 py-1 rounded-md text-xs print:text-[10pt] font-black">
              GRAND TOTAL FINAL PIECES: {grandTotalPieces.toLocaleString('en-IN')} PCS
            </div>
          </div>
        </div>

        {/* Warehouse Fulfillment Verification Footer (Signatures & Box Count) */}
        <div className="pt-2 print-keep-together space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-3 text-xs print:text-[9pt] font-mono">
            {/* Box Count Indicator */}
            <div className="border border-slate-400 p-2.5 rounded-xl print:rounded-lg space-y-1 bg-slate-50 print:bg-white">
              <span className="font-bold text-slate-500 uppercase text-[9px] print:text-[7.5pt] block">
                Carton / Box Allocation
              </span>
              <div className="font-black text-slate-900 pt-1 text-sm print:text-[10pt]">
                Box: [ _____ ] of [ _____ ]
              </div>
            </div>

            {/* Packed By */}
            <div className="border border-slate-400 p-2.5 rounded-xl print:rounded-lg space-y-1 bg-slate-50 print:bg-white">
              <span className="font-bold text-slate-500 uppercase text-[9px] print:text-[7.5pt] block">
                Packed By (Warehouse Staff)
              </span>
              <div className="pt-2 text-slate-700">
                Sign: ____________________
              </div>
            </div>

            {/* Checked & Verified By */}
            <div className="border border-slate-400 p-2.5 rounded-xl print:rounded-lg space-y-1 bg-slate-50 print:bg-white">
              <span className="font-bold text-slate-500 uppercase text-[9px] print:text-[7.5pt] block">
                Verified By (Quality Checker)
              </span>
              <div className="pt-2 text-slate-700">
                Sign: ____________________
              </div>
            </div>
          </div>

          {/* Footer Dispatch Stamp Line */}
          <div className="flex items-center justify-between text-[11px] print:text-[8pt] text-slate-500 font-mono pt-1 border-t border-slate-200">
            <span>
              Warehouse Dispatch Checklist • {settings?.store_name || 'Sivakasi Fireworld'} • All items verified prior to taping
            </span>
            <span className="font-bold text-slate-900">
              Dispatched Date: ______________
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

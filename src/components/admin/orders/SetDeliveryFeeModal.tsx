'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Truck,
  IndianRupee,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  MapPin,
  Save,
} from 'lucide-react';
import { Order, isDeliveryFeeSet } from '@/types';
import { OrderService } from '@/lib/services/order.service';

interface SetDeliveryFeeModalProps {
  order: Order | null;
  onClose: () => void;
  onSaved: (updatedOrder: Order) => void;
}

const PRESET_AMOUNTS = [0, 150, 250, 350, 500, 750, 1000];

export function SetDeliveryFeeModal({
  order,
  onClose,
  onSaved,
}: SetDeliveryFeeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [feeInput, setFeeInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    setMounted(true);
    if (order) {
      if (isDeliveryFeeSet(order)) {
        setFeeInput(String(order.delivery_fee || 0));
      } else {
        setFeeInput('');
      }
    }
  }, [order]);

  if (!order || !mounted) return null;

  const currentIsSet = isDeliveryFeeSet(order);
  const currentFee = currentIsSet ? order.delivery_fee : 0;
  const numericFee = feeInput === '' ? 0 : Number(feeInput);
  const previewGrandTotal = order.subtotal + (isNaN(numericFee) ? 0 : Math.max(0, numericFee));

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (feeInput.trim() === '') {
      setErrorMsg('Please enter a delivery charges amount (or select ₹0 for free delivery).');
      return;
    }

    const val = Number(feeInput);
    if (isNaN(val) || val < 0) {
      setErrorMsg('Please enter a valid positive delivery amount.');
      return;
    }

    try {
      setIsSubmitting(true);
      const updated = await OrderService.updateDeliveryFee(order.id, val, true);
      onSaved(updated);
      onClose();
    } catch (err: any) {
      console.error('Failed to set delivery fee:', err);
      setErrorMsg(err.message || 'Failed to save delivery charges. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    setErrorMsg('');
    try {
      setIsSubmitting(true);
      const updated = await OrderService.updateDeliveryFee(order.id, 0, false);
      onSaved(updated);
      onClose();
    } catch (err: any) {
      console.error('Failed to reset delivery fee:', err);
      setErrorMsg(err.message || 'Failed to reset delivery charges.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-sans animate-fade-in">
      <div
        className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white flex items-center gap-1.5 font-heading">
                <span>Set Delivery Freight Charges</span>
              </h3>
              <p className="text-[11px] text-slate-300 font-mono">
                Order #{order.order_number}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-4 text-xs">
          {/* Destination Context Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block">
                  Delivery Destination
                </span>
                <span className="font-extrabold text-slate-900 block truncate">
                  {order.customer_name} ({order.customer_mobile})
                </span>
                <span className="text-slate-600 font-medium block truncate text-[11px]">
                  {order.shipping_address}, <strong className="text-slate-900">{order.city}</strong>, {order.state} - {order.pincode}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-400 uppercase font-extrabold block">
                  Subtotal
                </span>
                <span className="font-mono font-black text-slate-950 text-sm">
                  ₹{order.subtotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Current Bill Status Indicator */}
            <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 font-medium">Status on Customer Bill:</span>
              {currentIsSet ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full font-bold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Set: ₹{currentFee} (Shown on Bill)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 rounded-full font-bold">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span>Not Set (Hidden on Customer Bill)</span>
                </span>
              )}
            </div>
          </div>

          {/* Explanation Alert */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-amber-900">
              <span>📍 Why manual delivery charges?</span>
            </p>
            <p className="text-slate-600 leading-relaxed font-normal">
              Fireworks delivery charges differ by place, distance, and lorry transport parcel rates. 
              <strong> Untill you save an amount here, delivery charges will NOT be shown on the customer bill print.</strong> Once set, this amount will appear in their bill and grand total.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-xl font-bold text-[11px]">
              {errorMsg}
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-black text-slate-900">
              Delivery Freight Amount (₹)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold">
                ₹
              </div>
              <input
                type="number"
                min="0"
                step="1"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                placeholder="e.g. 250"
                autoFocus
                className="w-full pl-8 pr-4 py-2.5 bg-white border-2 border-slate-300 focus:border-amber-500 rounded-xl font-mono text-base font-black text-slate-950 outline-none transition-all shadow-2xs focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 block">
              Quick Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_AMOUNTS.map((amt) => {
                const isSelected = feeInput === String(amt);
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setFeeInput(String(amt))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    {amt === 0 ? '₹0 (Free / Local)' : `₹${amt}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="bg-slate-900 text-white rounded-2xl p-3.5 space-y-1.5 font-mono">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Items Subtotal:</span>
              <span>₹{order.subtotal.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-[11px] text-amber-400 font-bold">
              <span>Delivery Charges to Apply:</span>
              <span>
                {feeInput === '' ? '₹0 (Not Set)' : `₹${Math.max(0, Number(feeInput) || 0).toLocaleString('en-IN')}`}
              </span>
            </div>
            <div className="flex justify-between text-sm font-black pt-1.5 border-t border-slate-800 text-white">
              <span>New Bill Grand Total:</span>
              <span className="text-amber-400">
                ₹{previewGrandTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
            {currentIsSet ? (
              <button
                type="button"
                onClick={handleReset}
                disabled={isSubmitting}
                className="px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                title="Reset delivery fee and hide from bill"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset / Hide from Bill</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Apply & Show on Bill'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

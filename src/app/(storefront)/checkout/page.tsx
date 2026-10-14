'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  CheckCircle,
  AlertCircle,
  ShoppingBag,
  User,
  Phone,
  Building2,
  Map,
  Navigation,
  Lock,
  Sparkles,
  Package,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useStoreSettings } from '@/context/StoreSettingsContext';
import { PricingService } from '@/lib/services/pricing.service';
import { OrderService } from '@/lib/services/order.service';
import { DeliveryZone } from '@/types';

// All 28 Indian states + 8 Union Territories
const INDIAN_STATES = [
  'Tamil Nadu',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  // Union Territories
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];

const CHECKOUT_DRAFT_KEY = 'sivakasi_fireworld_checkout_draft_v1';

export default function CheckoutPage() {
  const router = useRouter();
  const {
    cart,
    subtotal,
    savings,
    selectedZone,
    clearCart,
  } = useCart();

  const { settings } = useStoreSettings();
  const [zones, setZones] = useState<DeliveryZone[]>([]);

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_mobile: '',
    shipping_address: '',
    city: '',
    state: 'Tamil Nadu',
    pincode: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Load delivery zones
  useEffect(() => {
    PricingService.fetchDeliveryZones()
      .then((z) => setZones(z))
      .catch((err) => console.warn('Failed to load checkout zones:', err));
  }, []);

  // Matched delivery zone
  const matchingZone = useMemo(() => {
    if (!zones.length) return selectedZone;
    return (
      zones.find((z) =>
        z.state_codes.some((code) => code.toLowerCase() === formData.state.toLowerCase())
      ) ?? zones[zones.length - 1]
    );
  }, [zones, formData.state, selectedZone]);

  // Determine active minimum order threshold based on state overrides or matching delivery zone
  const activeMinOrderThreshold = useMemo(() => {
    if (!settings) return matchingZone?.min_order_amount ?? 4000;
    const override = settings.state_min_order_overrides?.[formData.state];
    if (typeof override === 'number' && override > 0) return override;
    return matchingZone?.min_order_amount ?? 4000;
  }, [settings, formData.state, matchingZone]);

  const isMinOrderReachedForState = subtotal >= activeMinOrderThreshold;
  const remainingForMinOrderForState = Math.max(0, activeMinOrderThreshold - subtotal);
  const effectiveGrandTotal = subtotal;

  const isMaxLimitExceeded = Boolean(
    settings?.max_order_limit_enabled &&
    settings?.max_order_limit_amount &&
    subtotal > settings.max_order_limit_amount
  );

  // Auto-restore cached user details from localStorage
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(CHECKOUT_DRAFT_KEY) ||
        localStorage.getItem('vaily_pyro_checkout_draft_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          setFormData((prev) => ({
            ...prev,
            customer_name: parsed.customer_name || '',
            customer_mobile: parsed.customer_mobile || '',
            shipping_address: parsed.shipping_address || '',
            city: parsed.city || '',
            state: parsed.state || 'Tamil Nadu',
            pincode: parsed.pincode || '',
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to load cached checkout draft:', e);
    }
  }, []);

  const updateAndCacheFormData = (updated: typeof formData) => {
    setFormData(updated);
    try {
      localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to cache checkout draft:', e);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === 'customer_mobile') {
      newValue = value.replace(/\D/g, '').slice(0, 10);
    } else if (name === 'pincode') {
      newValue = value.replace(/\D/g, '').slice(0, 6);
    }

    const updated = { ...formData, [name]: newValue };
    updateAndCacheFormData(updated);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formData.customer_name.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!formData.customer_mobile || formData.customer_mobile.length !== 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!formData.shipping_address.trim()) {
      setErrorMessage('Please enter your house number, building & street name.');
      return;
    }
    if (!formData.city.trim()) {
      setErrorMessage('Please enter your city or town name.');
      return;
    }
    if (!formData.pincode || formData.pincode.length < 6) {
      setErrorMessage('Please enter a valid 6-digit PIN code.');
      return;
    }

    if (isMaxLimitExceeded) {
      setErrorMessage(
        `Order exceeds maximum allowed online limit of ₹${settings?.max_order_limit_amount.toLocaleString('en-IN')}. Please reduce order items or contact us directly on WhatsApp for bulk purchases.`
      );
      return;
    }

    if (!isMinOrderReachedForState) {
      setErrorMessage(
        `The minimum order for ${formData.state} is ₹${activeMinOrderThreshold.toLocaleString('en-IN')}. Please add items worth ₹${remainingForMinOrderForState.toLocaleString('en-IN')} more before placing your order.`
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const createdOrder = await OrderService.createOrder({
        customer_name: formData.customer_name.trim(),
        customer_mobile: formData.customer_mobile.trim(),
        shipping_address: formData.shipping_address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
        })),
      });

      // Clear cached draft upon successful order placement
      try {
        localStorage.removeItem(CHECKOUT_DRAFT_KEY);
      } catch (e) {
        // ignore
      }

      clearCart();
      router.push(`/order-confirmation/${createdOrder.id}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Something went wrong while placing your order. Please verify your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center border border-slate-200 shadow-xl font-sans">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h2 className="font-extrabold text-xl text-slate-900 mb-2 font-heading">Your Cart is Empty</h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Add items to your cart from our fireworks catalogue, then come back here to place your order.
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs inline-flex items-center gap-2 shadow-md transition-all active:scale-98"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go Back to Fireworks Shop</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-4 sm:py-8 px-3 sm:px-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5">
        
        {/* Navigation & Security Header */}
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-all shadow-2xs cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Back to Shop</span>
          </Link>

          <div className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200/80 shadow-2xs">
            <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Safe &amp; Secure Checkout</span>
          </div>
        </div>

        {/* Page Title & Zone Indicator (Clean & Minimal) */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight font-heading">
            Place Your Order
          </h1>
          <div className="inline-flex items-center gap-1.5 text-xs text-amber-950 font-extrabold bg-amber-100 px-3 py-1.5 rounded-full border border-amber-300/80 shadow-2xs">
            <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>{formData.state} • Min ₹{activeMinOrderThreshold.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold flex items-start gap-2.5 shadow-2xs animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Unified Form Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          
          {/* Main Form Column */}
          <div className="lg:col-span-7">
            <form
              onSubmit={handleSubmitOrder}
              className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4"
            >
              {/* Full Name & Mobile Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                    Your Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      name="customer_name"
                      required
                      value={formData.customer_name}
                      onChange={handleInputChange}
                      placeholder="e.g. Karthik Subramanian"
                      className="w-full pl-10 pr-3 py-2.5 bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors placeholder:text-slate-400 shadow-2xs"
                    />
                  </div>
                </div>

                {/* Mobile Number */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                    Mobile Number (WhatsApp) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1 px-2.5 bg-slate-100 border-2 border-slate-300 rounded-xl text-xs font-bold text-slate-800 shrink-0 select-none shadow-2xs">
                      <span>🇮🇳</span>
                      <span>+91</span>
                    </div>
                    <div className="relative flex-1">
                      <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="tel"
                        name="customer_mobile"
                        required
                        inputMode="numeric"
                        maxLength={10}
                        value={formData.customer_mobile}
                        onChange={handleInputChange}
                        placeholder="10-digit number"
                        className="w-full pl-10 pr-3 py-2.5 bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl text-xs font-bold text-slate-900 outline-none transition-colors placeholder:text-slate-400 tracking-wider shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

                {/* House & Street Name */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                    House No., Building &amp; Street Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                    <textarea
                      name="shipping_address"
                      required
                      rows={2}
                      value={formData.shipping_address}
                      onChange={handleInputChange}
                      placeholder="e.g. Door No. 14, 2nd Cross Street, Anna Nagar"
                      className="w-full pl-10 pr-3 py-2.5 bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl text-xs font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 resize-none leading-relaxed shadow-2xs"
                    />
                  </div>
                </div>

                {/* City / Town */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                    City / Town <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      name="city"
                      required
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="e.g. Chennai"
                      className="w-full pl-10 pr-3 py-2.5 bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors placeholder:text-slate-400 shadow-2xs"
                    />
                  </div>
                </div>

                {/* State & PIN Code in the exact same row */}
                <div className="grid grid-cols-2 gap-3">
                  {/* State */}
                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                      State <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Map className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                      <select
                        name="state"
                        required
                        value={formData.state}
                        onChange={handleInputChange}
                        className="w-full pl-9 pr-7 py-2.5 bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl text-xs font-semibold text-slate-900 outline-none transition-colors appearance-none cursor-pointer shadow-2xs"
                      >
                        {INDIAN_STATES.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  {/* PIN Code */}
                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                      PIN Code <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Navigation className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        name="pincode"
                        required
                        inputMode="numeric"
                        maxLength={6}
                        value={formData.pincode}
                        onChange={handleInputChange}
                        placeholder="6-digit PIN"
                        className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-xl text-xs font-bold text-slate-900 outline-none transition-colors placeholder:text-slate-400 tracking-wider shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

              {/* Submit CTA */}
              <div className="pt-2 space-y-2">
                {isMaxLimitExceeded && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 font-bold flex items-start gap-2 shadow-2xs">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="leading-snug">
                      Order total exceeds maximum online limit of ₹{settings?.max_order_limit_amount.toLocaleString('en-IN')}. For bulk purchases, please contact us directly on WhatsApp.
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !isMinOrderReachedForState || isMaxLimitExceeded}
                  className={`w-full py-3.5 px-6 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-98 ${
                    isMinOrderReachedForState && !isMaxLimitExceeded && !isSubmitting
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/30 glow-gold'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Placing Your Order...</span>
                    </>
                  ) : isMaxLimitExceeded ? (
                    <span>Maximum Order Limit Exceeded</span>
                  ) : !isMinOrderReachedForState ? (
                    <span>Add ₹{remainingForMinOrderForState.toLocaleString('en-IN')} more for {formData.state}</span>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-slate-950" />
                      <span>Place Order Now • ₹{effectiveGrandTotal.toLocaleString('en-IN')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Order Summary Sidebar (Compact & Attractive) */}
          <div className="lg:col-span-5">
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-sm sticky top-20 space-y-2.5">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-amber-600" />
                  <h2 className="font-extrabold text-sm text-slate-900 font-heading">
                    Your Order
                  </h2>
                </div>

                <span className="text-[11px] font-black text-amber-950 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300/80 shadow-2xs">
                  {cart.length} {cart.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {/* Items List (Compact & Clean without bulky scrollbar) */}
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100/80 pr-0.5 space-y-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {cart.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="py-1.5 px-1 flex items-center justify-between text-xs gap-2.5 hover:bg-slate-50/80 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                        <img
                          src={product.image_url || '/placeholder-product.svg'}
                          alt={product.name}
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (!target.src.endsWith('/placeholder-product.svg')) {
                              target.src = '/placeholder-product.svg';
                            }
                          }}
                          className={`w-full h-full ${product.image_url ? 'object-cover' : 'object-contain p-0.5'}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-bold text-slate-900 block truncate text-xs leading-tight">
                          {product.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {quantity} × ₹{product.selling_price.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <span className="font-extrabold text-xs text-slate-950 font-mono shrink-0">
                      ₹{(product.selling_price * quantity).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Compact Savings Banner */}
              {savings > 0 && (
                <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs shadow-2xs">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-extrabold text-[11px] text-emerald-900">Direct Savings</span>
                  </div>
                  <span className="font-black text-xs text-white bg-emerald-700 px-2 py-0.5 rounded-md font-mono shadow-2xs">
                    - ₹{savings.toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {/* Price Breakdown */}
              <div className="space-y-1.5 text-xs border-t border-slate-100 pt-2 text-slate-600 font-medium">
                <div className="flex justify-between items-center text-[11px]">
                  <span>Items total:</span>
                  <span className="font-bold text-slate-900 font-mono">
                    ₹{subtotal.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="flex justify-between items-center text-[11px]">
                  <span className="truncate pr-2">
                    Delivery ({formData.state}):
                  </span>
                  <span className="font-bold text-amber-800 text-[10.5px] bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    To be confirmed by store
                  </span>
                </div>

                {/* Amount To Pay Banner (Compact & Sleek) */}
                <div className="mt-2 p-2.5 sm:p-3 rounded-xl bg-slate-950 text-white shadow-md border border-amber-500/40 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-400 block leading-none">
                      Items Subtotal
                    </span>
                    <span className="text-[9px] text-slate-400 font-medium mt-0.5 block">Delivery freight confirmed separately</span>
                  </div>
                  <span className="text-base sm:text-lg font-black text-amber-400 font-mono tracking-tight glow-gold">
                    ₹{effectiveGrandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

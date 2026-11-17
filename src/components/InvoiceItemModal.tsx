import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Plus, Percent, DollarSign, Calculator, Check, Search, Package, Sparkles, ChevronDown, Tag } from 'lucide-react';
import { InvoiceItem, Item } from '../types';

interface InvoiceItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: InvoiceItem) => void;
  catalogItems?: Item[];
  pricingType?: 'cash' | 'wholesale';
  mode?: 'sale' | 'purchase';
  initialItem?: InvoiceItem | null;
}

export const InvoiceItemModal: React.FC<InvoiceItemModalProps> = ({
  isOpen,
  onClose,
  onSave,
  catalogItems = [],
  pricingType = 'cash',
  mode = 'sale',
  initialItem = null,
}) => {
  // All inputs are empty by default - no hardcoded values or 14% tax!
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [qty, setQty] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [costPrice, setCostPrice] = useState<number | undefined>(undefined);
  const [totalInput, setTotalInput] = useState<string>('');

  // Discount configuration
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('fixed');
  const [discountValue, setDiscountValue] = useState<string>('');

  // Tax configuration (Strictly empty / 0 by default, never 14%)
  const [taxType, setTaxType] = useState<'percent' | 'fixed'>('percent');
  const [taxValue, setTaxValue] = useState<string>('');

  // Catalog search autocomplete
  const [showCatalogDropdown, setShowCatalogDropdown] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');
  const qtyInputRef = useRef<HTMLInputElement | null>(null);

  // Prepopulate if editing
  useEffect(() => {
    if (initialItem) {
      setSelectedItemId(initialItem.itemId || '');
      setName(initialItem.name || '');
      setNotes(initialItem.notes || '');
      setQty(initialItem.qty ? String(initialItem.qty) : '');
      setPrice(initialItem.price !== undefined ? String(initialItem.price) : '');
      setCostPrice(initialItem.costPrice);
      setTotalInput(initialItem.total !== undefined ? String(initialItem.total) : '');

      const mappedDiscType: 'percent' | 'fixed' =
        initialItem.discType === 'val' || initialItem.discountType === 'fixed'
          ? 'fixed'
          : 'percent';
      setDiscountType(mappedDiscType);
      setDiscountValue(
        initialItem.discountValue !== undefined && initialItem.discountValue > 0
          ? String(initialItem.discountValue)
          : initialItem.discount !== undefined && initialItem.discount > 0
          ? String(initialItem.discount)
          : ''
      );

      const mappedTaxType: 'percent' | 'fixed' =
        initialItem.taxType === 'val' || initialItem.taxType === 'fixed'
          ? 'fixed'
          : 'percent';
      setTaxType(mappedTaxType);
      setTaxValue(
        initialItem.taxValue !== undefined && initialItem.taxValue > 0
          ? String(initialItem.taxValue)
          : initialItem.tax !== undefined && initialItem.tax > 0
          ? String(initialItem.tax)
          : ''
      );
      setValidationError('');
    } else {
      // Clean slate - completely empty inputs
      setSelectedItemId('');
      setName('');
      setNotes('');
      setQty('');
      setPrice('');
      setCostPrice(undefined);
      setTotalInput('');
      setDiscountType('fixed');
      setDiscountValue('');
      setTaxType('percent');
      setTaxValue(''); // Empty! User types if needed
      setShowCatalogDropdown(false);
      setSearchFilter('');
      setValidationError('');
    }
  }, [initialItem, isOpen]);

  // Filtered catalog items
  const filteredCatalog = useMemo(() => {
    if (!catalogItems || catalogItems.length === 0) return [];
    if (!name.trim()) return catalogItems.slice(0, 8);
    const q = name.toLowerCase().trim();
    return catalogItems
      .filter((i) => (i.name && i.name.toLowerCase().includes(q)) || (i.code && i.code.toLowerCase().includes(q)))
      .slice(0, 10);
  }, [catalogItems, name]);

  // Mathematical computations
  const numQty = parseFloat(qty) || 0;
  const numPrice = parseFloat(price) || 0;
  const baseSubtotal = numQty * numPrice;

  // Discount calc
  const rawDiscount = parseFloat(discountValue) || 0;
  let calculatedDiscount = 0;
  if (discountType === 'percent') {
    calculatedDiscount = (baseSubtotal * rawDiscount) / 100;
  } else {
    calculatedDiscount = rawDiscount;
  }
  if (calculatedDiscount > baseSubtotal) {
    calculatedDiscount = baseSubtotal;
  }

  // Tax calc
  const afterDiscount = Math.max(0, baseSubtotal - calculatedDiscount);
  const rawTax = parseFloat(taxValue) || 0;
  let calculatedTax = 0;
  if (taxType === 'percent') {
    calculatedTax = (afterDiscount * rawTax) / 100;
  } else {
    calculatedTax = rawTax;
  }

  // Final Item Total
  const finalItemTotal = Math.max(0, afterDiscount + calculatedTax);

  const handlePriceChange = (newPriceStr: string) => {
    setPrice(newPriceStr);
    const p = parseFloat(newPriceStr);
    const q = parseFloat(qty) || 0;
    if (!isNaN(p) && q > 0) {
      const sub = q * p;
      const d = discountType === 'percent' ? (sub * (parseFloat(discountValue) || 0)) / 100 : (parseFloat(discountValue) || 0);
      const afterD = Math.max(0, sub - d);
      const t = taxType === 'percent' ? (afterD * (parseFloat(taxValue) || 0)) / 100 : (parseFloat(taxValue) || 0);
      const tot = Math.max(0, afterD + t);
      const cleanTot = Number(tot.toFixed(2));
      setTotalInput(cleanTot > 0 ? (cleanTot % 1 === 0 ? cleanTot.toString() : cleanTot.toFixed(2)) : '0');
    } else if (newPriceStr.trim() === '') {
      setTotalInput('');
    }
  };

  const handleQtyChange = (newQtyStr: string) => {
    setQty(newQtyStr);
    const q = parseFloat(newQtyStr) || 0;
    const p = parseFloat(price) || 0;
    if (p > 0 && q > 0) {
      const sub = q * p;
      const d = discountType === 'percent' ? (sub * (parseFloat(discountValue) || 0)) / 100 : (parseFloat(discountValue) || 0);
      const afterD = Math.max(0, sub - d);
      const t = taxType === 'percent' ? (afterD * (parseFloat(taxValue) || 0)) / 100 : (parseFloat(taxValue) || 0);
      const tot = Math.max(0, afterD + t);
      const cleanTot = Number(tot.toFixed(2));
      setTotalInput(cleanTot > 0 ? (cleanTot % 1 === 0 ? cleanTot.toString() : cleanTot.toFixed(2)) : '0');
    } else if (q > 0 && parseFloat(totalInput) > 0) {
      const tot = parseFloat(totalInput) || 0;
      const unitP = tot / q;
      const cleanP = Number(unitP.toFixed(2));
      setPrice(cleanP % 1 === 0 ? cleanP.toString() : cleanP.toFixed(2));
    }
  };

  const handleTotalChange = (newTotalStr: string) => {
    setTotalInput(newTotalStr);
    const tot = parseFloat(newTotalStr);
    const q = parseFloat(qty) || 0;
    if (!isNaN(tot) && tot >= 0 && q > 0) {
      const dVal = parseFloat(discountValue) || 0;
      const tVal = parseFloat(taxValue) || 0;
      let unitPrice = 0;
      if (discountType === 'percent' && taxType === 'percent') {
        const factor = (1 - (dVal / 100)) * (1 + (tVal / 100));
        unitPrice = factor > 0 ? tot / (q * factor) : tot / q;
      } else {
        const afterDisc = taxType === 'percent' ? (tot / (1 + (tVal / 100))) : Math.max(0, tot - tVal);
        const subtotal = discountType === 'percent' ? (afterDisc / Math.max(0.01, 1 - (dVal / 100))) : (afterDisc + dVal);
        unitPrice = Math.max(0, subtotal / q);
      }
      const cleanPrice = Number(unitPrice.toFixed(4));
      const formattedPrice = cleanPrice % 1 === 0 ? cleanPrice.toString() : cleanPrice.toFixed(2);
      setPrice(formattedPrice);
    } else if (newTotalStr.trim() === '') {
      setPrice('');
    }
  };

  const handleSelectCatalogItem = (item: Item) => {
    setSelectedItemId(item.id);
    setName(item.name);
    setCostPrice(item.purchasePrice || 0);

    // Default item price depending on mode & tier
    if (mode === 'sale') {
      const itemPrice = pricingType === 'wholesale' && item.wholesalePrice ? item.wholesalePrice : item.salePrice || 0;
      setPrice(itemPrice > 0 ? String(itemPrice) : '');
    } else {
      // Purchase mode
      const pPrice = item.purchasePrice || 0;
      setPrice(pPrice > 0 ? String(pPrice) : '');
    }

    setShowCatalogDropdown(false);

    // Auto-Focus & Select on Quantity immediately
    setTimeout(() => {
      if (qtyInputRef.current) {
        qtyInputRef.current.focus();
        qtyInputRef.current.select();
      }
    }, 60);
  };

  const handleSave = () => {
    if (!name.trim()) {
      setValidationError('يرجى إدخال اسم الصنف أو اختياره من المخزن');
      return;
    }
    if (numQty <= 0) {
      setValidationError('يرجى إدخال كمية صحيحة أكبر من صفر');
      return;
    }
    if (numPrice < 0) {
      setValidationError('يرجى إدخال سعر صحيح (صفر أو أكثر)');
      return;
    }

    setValidationError('');

    const itemToSave: InvoiceItem = {
      itemId: selectedItemId || undefined,
      name: name.trim(),
      notes: notes.trim(),
      qty: numQty,
      price: numPrice,
      costPrice: costPrice,
      discount: calculatedDiscount,
      discountType: discountType,
      discountValue: rawDiscount > 0 ? rawDiscount : undefined,
      tax: calculatedTax,
      taxType: taxType,
      taxValue: rawTax > 0 ? rawTax : undefined,
      total: finalItemTotal,
    };

    onSave(itemToSave);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      id="invoice-item-modal-overlay"
      className="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
    >
      <div
        id="invoice-item-modal-card"
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden text-right flex flex-col"
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="bg-white text-slate-900 px-5 py-3.5 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-base text-slate-900 truncate">
                {initialItem ? 'تعديل بيانات كارت الصنف' : 'كارت الصنف (إضافة صنف للفاتورة)'}
              </h3>
              <p className="text-xs text-slate-500">
                حساب لحظي للكمية والسعر والخصم والضريبة
              </p>
            </div>
          </div>
          <button
            id="btn-close-item-modal"
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors text-slate-600 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto bg-slate-50/50 tabular-nums">
          {validationError && (
            <div className="bg-rose-50 border border-rose-300 text-rose-800 p-3 rounded-lg text-xs font-semibold flex items-center justify-between">
              <span>{validationError}</span>
              <button
                type="button"
                onClick={() => setValidationError('')}
                className="text-rose-500 hover:text-rose-800 text-sm font-semibold px-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* 1. Item Name with Quick Warehouse Search */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-1">
                <span>اسم الصنف</span>
                <span className="text-rose-500">*</span>
              </label>
              {catalogItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCatalogDropdown(!showCatalogDropdown)}
                  className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>تصفح من المخزن</span>
                </button>
              )}
            </div>

            <input
              id="input-item-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setShowCatalogDropdown(true);
              }}
              onFocus={() => setShowCatalogDropdown(true)}
              placeholder="اكتب اسم الصنف هنا أو اختر من المخزن..."
              className="w-full min-h-[42px] px-3.5 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-slate-900 text-base sm:text-sm font-medium focus:outline-none transition-colors placeholder:text-slate-400"
              autoFocus
            />

            {/* Catalog suggestions dropdown */}
            {showCatalogDropdown && filteredCatalog.length > 0 && (
              <div className="absolute z-20 top-full mt-1 w-full bg-white rounded-lg shadow-xl border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500 flex justify-between">
                  <span>أصناف متطابقة من المخزن</span>
                  <button
                    type="button"
                    onClick={() => setShowCatalogDropdown(false)}
                    className="text-slate-400 hover:text-slate-700 text-xs"
                  >
                    إغلاق
                  </button>
                </div>
                {filteredCatalog.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectCatalogItem(item)}
                    className="w-full px-3.5 py-2.5 text-right hover:bg-blue-50 flex items-center justify-between transition-colors group"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-900 group-hover:text-blue-700">{item.name}</div>
                      <div className="text-[11px] text-slate-500">
                        كود: {item.code || '-'} · رصيد: {item.quantity ?? 0}
                      </div>
                    </div>
                    <div className="text-left">
                      <span className="text-xs font-semibold text-emerald-700">
                        {mode === 'sale'
                          ? (pricingType === 'wholesale' && item.wholesalePrice ? item.wholesalePrice : item.price || 0)
                          : (item.costPrice || item.purchasePrice || item.price || 0)}{' '}
                        ج.م
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. Note / Statement */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">البيان / ملاحظة الصنف</label>
            <input
              id="input-item-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اكتب بيان الصنف أو تفاصيل الموديل أو المقاس..."
              className="w-full min-h-[42px] px-3.5 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-slate-900 text-base sm:text-sm font-medium focus:outline-none transition-colors placeholder:text-slate-400"
            />
          </div>

          {/* Price Tier Selection Dropdown */}
          {(() => {
            const matched = catalogItems.find(
              (i) => i.id === selectedItemId || (name && i.name.trim().toLowerCase() === name.trim().toLowerCase())
            );
            if (!matched) return null;
            return (
              <div className="bg-blue-50/70 p-3 rounded-lg border border-blue-200 space-y-1.5">
                <label className="text-xs font-semibold text-blue-950 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-blue-700" />
                  <span>تحديد نوع السعر (جملة / شراء / نقدي):</span>
                </label>
                <div className="relative">
                  <select
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'cash') setPrice(String(matched.salePrice || 0));
                      else if (val === 'wholesale') setPrice(String(matched.wholesalePrice || matched.salePrice || 0));
                      else if (val === 'buy') setPrice(String(matched.purchasePrice || 0));
                    }}
                    className="w-full min-h-[42px] px-3 pl-9 bg-white border border-blue-300 rounded-lg text-base sm:text-xs font-semibold text-slate-800 appearance-none cursor-pointer"
                  >
                    <option value="">-- اختر فئة السعر المناسبة للصنف --</option>
                    <option value="cash">سعر بيع نقدي (قطاعي) — {Number(matched.salePrice || 0).toFixed(2)} ج.م</option>
                    <option value="wholesale">سعر بيع جملة — {Number(matched.wholesalePrice || matched.salePrice || 0).toFixed(2)} ج.م</option>
                    <option value="buy">سعر شراء / تكلفة — {Number(matched.purchasePrice || 0).toFixed(2)} ج.م</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-blue-700 absolute left-3 top-3 pointer-events-none" />
                </div>
              </div>
            );
          })()}

          {/* 3. Quantity, Unit Price & Total Grid */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-1.5">
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-blue-600" />
                <span>الكمية والسعر والإجمالي</span>
              </span>
              <span className="text-[11px] text-slate-500">
                اكتب في سعر الوحدة أو الإجمالي وسيتم التعديل تلقائياً
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 1. Quantity */}
              <div>
                <label className="text-xs font-semibold text-slate-800 flex items-center gap-1 mb-1">
                  <span>العدد (الكمية)</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={qtyInputRef}
                  id="input-item-qty"
                  type="number"
                  min="0"
                  step="any"
                  value={qty}
                  onChange={(e) => handleQtyChange(e.target.value)}
                  placeholder="مثال: 10"
                  className="w-full min-h-[42px] px-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-slate-900 text-base sm:text-sm font-semibold focus:outline-none"
                />
              </div>

              {/* 2. Unit Price */}
              <div>
                <label className="text-xs font-semibold text-slate-800 flex items-center justify-between mb-1">
                  <span>سعر الوحدة <span className="text-rose-500">*</span></span>
                  <span className="text-[11px] text-slate-400">للقطعة</span>
                </label>
                <div className="relative">
                  <input
                    id="input-item-price"
                    type="number"
                    min="0"
                    step="any"
                    value={price}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    placeholder="مثال: 100"
                    className="w-full min-h-[42px] px-3 pl-9 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-slate-900 text-base sm:text-sm font-semibold focus:outline-none"
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs font-medium text-slate-400">ج.م</span>
                </div>
              </div>

              {/* 3. Total */}
              <div>
                <label className="text-xs font-semibold text-emerald-900 flex items-center justify-between mb-1">
                  <span>إجمالي الصنف</span>
                  <span className="text-[11px] text-emerald-700">يُقسم ع الكمية</span>
                </label>
                <div className="relative">
                  <input
                    id="input-item-total"
                    type="number"
                    min="0"
                    step="any"
                    value={totalInput}
                    onChange={(e) => handleTotalChange(e.target.value)}
                    placeholder="مثال: 1000"
                    className="w-full min-h-[42px] px-3 pl-9 bg-emerald-50/70 border border-emerald-400 focus:border-emerald-600 rounded-lg text-emerald-950 text-base sm:text-sm font-semibold focus:outline-none"
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs font-medium text-emerald-700">ج.م</span>
                </div>
              </div>
            </div>

            {numQty > 0 && (numPrice > 0 || parseFloat(totalInput) > 0) && (
              <div className="text-[11px] text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 flex items-center justify-between flex-wrap gap-2 font-medium">
                <span>المعادلة: <strong>{numQty}</strong> × <strong>{numPrice.toFixed(2)}</strong> = <strong>{(numQty * numPrice).toFixed(2)}</strong> ج.م</span>
                {parseFloat(totalInput) > 0 && numQty > 0 && (
                  <span className="text-emerald-700">
                    سعر الوحدة = {parseFloat(totalInput)} ÷ {numQty} = <strong>{(parseFloat(totalInput) / numQty).toFixed(2)}</strong> ج.م
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 4. Discount & Tax Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Discount */}
            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">الخصم</label>
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      discountType === 'percent'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    نسبة %
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      discountType === 'fixed'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    مبلغ ثابت
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  id="input-item-discount"
                  type="number"
                  min="0"
                  step="any"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percent' ? 'أدخل النسبة %' : 'أدخل المبلغ ج.م'}
                  className="w-full min-h-[40px] px-3 bg-slate-50 border border-slate-300 focus:border-blue-600 rounded-lg text-slate-900 text-base sm:text-sm font-medium focus:outline-none"
                />
                <span className="absolute left-3 top-2.5 text-xs font-medium text-slate-400">
                  {discountType === 'percent' ? '%' : 'ج.م'}
                </span>
              </div>

              {calculatedDiscount > 0 && (
                <div className="text-[11px] text-emerald-700 font-semibold flex justify-between">
                  <span>قيمة الخصم:</span>
                  <span>- {calculatedDiscount.toFixed(2)} ج.م</span>
                </div>
              )}
            </div>

            {/* Tax */}
            <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">الضريبة (قيمة مضافة)</label>
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setTaxType('percent')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      taxType === 'percent'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    نسبة %
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxType('fixed')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      taxType === 'fixed'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    مبلغ ثابت
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  id="input-item-tax"
                  type="number"
                  min="0"
                  step="any"
                  value={taxValue}
                  onChange={(e) => setTaxValue(e.target.value)}
                  placeholder={taxType === 'percent' ? 'أدخل النسبة % (اختياري)' : 'أدخل المبلغ ج.م'}
                  className="w-full min-h-[40px] px-3 bg-slate-50 border border-slate-300 focus:border-indigo-600 rounded-lg text-slate-900 text-base sm:text-sm font-medium focus:outline-none"
                />
                <span className="absolute left-3 top-2.5 text-xs font-medium text-slate-400">
                  {taxType === 'percent' ? '%' : 'ج.م'}
                </span>
              </div>

              {calculatedTax > 0 && (
                <div className="text-[11px] text-indigo-700 font-semibold flex justify-between">
                  <span>قيمة الضريبة:</span>
                  <span>+ {calculatedTax.toFixed(2)} ج.م</span>
                </div>
              )}
            </div>
          </div>

          {/* 5. Live Calculation Breakdown */}
          <div className="bg-white rounded-xl p-4 text-slate-900 border border-slate-200">
            <div className="text-xs font-semibold text-slate-700 mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-blue-600" />
                <span>الحسابات اللحظية للصنف</span>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500 mb-0.5 font-medium">القيمة الأساسية</div>
                <div className="text-sm font-semibold font-mono text-slate-900">{baseSubtotal.toFixed(2)} ج.م</div>
              </div>

              <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-[11px] text-emerald-800 mb-0.5 font-medium">الخصم</div>
                <div className="text-sm font-semibold font-mono text-emerald-700">
                  {calculatedDiscount > 0 ? `-${calculatedDiscount.toFixed(2)}` : '0.00'} ج.م
                </div>
              </div>

              <div className="p-2 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-[11px] text-blue-800 mb-0.5 font-medium">الضريبة</div>
                <div className="text-sm font-semibold font-mono text-blue-700">
                  {calculatedTax > 0 ? `+${calculatedTax.toFixed(2)}` : '0.00'} ج.م
                </div>
              </div>

              <div className="p-2 rounded-lg bg-amber-50 border border-amber-300">
                <div className="text-[11px] text-amber-900 mb-0.5 font-medium">الإجمالي النهائي</div>
                <div className="text-base font-bold font-mono text-amber-950">{finalItemTotal.toFixed(2)} ج.م</div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            id="btn-cancel-item-modal"
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors cursor-pointer"
          >
            إلغاء
          </button>
          <button
            id="btn-confirm-add-item"
            type="button"
            onClick={handleSave}
            className="min-h-[44px] px-6 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{initialItem ? 'حفظ التعديلات' : 'إضافة الصنف للفاتورة'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

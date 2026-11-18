import React, { useState } from 'react';
import {
  Plus,
  RotateCcw,
  Search,
  Eye,
  Pencil,
  Trash2,
  Printer,
  MessageSquare,
  DollarSign,
  Building2,
  User as UserIcon,
  FileText,
  CheckCircle2,
  AlertCircle,
  Tag,
  Calendar,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Activity,
  Sparkles,
  Layers,
} from 'lucide-react';
import { AppData, SaleInvoice, InvoiceItem } from '../types';
import { Modal } from './Modal';
import { printInvoiceWindow } from '../utils/printInvoice';
import { InvoiceCardTemplate } from './InvoiceCardTemplate';
import { getProductActivePrice } from '../utils/priceService';
import { InvoiceItemModal } from './InvoiceItemModal';
import { UnifiedInvoiceItemSystem, InvoiceItemUnified, PaymentRow } from './UnifiedInvoiceItemSystem';
import { exportToExcel } from '../utils/excelExport';
import { openUnifiedPrintWindow } from '../utils/printUnified';
import { TableActionButtons } from './TableActionButtons';
import { generateInvoiceWhatsAppMessage, openWhatsAppChat } from '../services/whatsappService';
import { postSaleInvoice, deleteSaleInvoice } from '../utils/posting';
import { calculateCustomerBalance } from '../utils/accounting';
import { RakeezaInvoiceWorkspace } from './RakeezaInvoiceWorkspace';
import { BigDataDiagnosticsModal } from './BigDataDiagnosticsModal';
import { updateBranchCashBoxDelta, getBranchItems, getMainBranchId } from '../utils/branchIsolation';
import { processSalePayment } from '../utils/accountingEngine';

interface SalesViewProps {
  appData: AppData;
  onUpdateData: (newData: AppData, actionInfo?: { action?: string; module?: string; details?: string; deletedId?: string | number }) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  onInspectItem?: (type: string, data: any) => void;
  onNavigate?: (page: string) => void;
}

export const SalesView: React.FC<SalesViewProps> = ({ appData, onUpdateData, showToast, onInspectItem, onNavigate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(appData.activeBranchId || appData.branches?.[0]?.id || 'main');
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | 'view' | 'pay' | null>(null);
  const [modalType, setModalType] = useState<'nagdi' | 'ajel' | 'return_nagdi' | 'return_ajel'>('nagdi');
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoice | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // ⚡ 10M+ High-Volume Big Data Pagination & Partitioning States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>('all');
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState<boolean>(false);

  // 🏷️ Centralized Price Management Master Source Control: 'cash' vs 'wholesale'
  const [salesPricingType, setSalesPricingType] = useState<'cash' | 'wholesale'>('cash');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [isPriceAutoFetched, setIsPriceAutoFetched] = useState<boolean>(false);
  const [priceWarning, setPriceWarning] = useState<string | null>(null);

  // Current logged in user for permission checks
  const currentUser = appData.users.find((u) => u.id === appData.currentUser) || appData.users[0];
  const canOverridePrice = currentUser?.role === 'admin' || !!(currentUser as any)?.permissions?.allowInvoicePriceOverride;

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [customerRepId, setCustomerRepId] = useState('');
  const [customerRepName, setCustomerRepName] = useState('');
  const [customerRepPhone, setCustomerRepPhone] = useState('');
  const [salesRep, setSalesRep] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  // Payment & Downpayment State
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'drawer' | 'vodafone' | 'instapay' | 'bank'>('drawer');
  const [tempItems, setTempItems] = useState<InvoiceItem[]>([]);

  // 🚀 Unified Invoice Registration System State (الأصناف والخصومات والضرائب ووسائل الدفع)
  const [unifiedItems, setUnifiedItems] = useState<InvoiceItemUnified[]>([]);
  const [globalInvDisc, setGlobalInvDisc] = useState<number>(0);
  const [invDiscType, setInvDiscType] = useState<'val' | 'percent'>('percent');
  const [globalInvTax, setGlobalInvTax] = useState<number>(0);
  const [invTaxType, setInvTaxType] = useState<'percent' | 'val'>('percent');
  const [extraIncomeName, setExtraIncomeName] = useState<string>('');
  const [extraIncomeVal, setExtraIncomeVal] = useState<number>(0);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    { id: 'pay_1', method: 'نقدي / كاش', amount: 0 },
  ]);

  // Item Draft Input
  const [itemName, setItemName] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [itemQty, setItemQty] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemDiscount, setItemDiscount] = useState('');
  const [itemTax, setItemTax] = useState('');
  const [showItemCard, setShowItemCard] = useState(true);

  // 📦 Item Card Modal State (كارت الصنف)
  const [isItemCardModalOpen, setIsItemCardModalOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItemData, setEditingItemData] = useState<InvoiceItem | null>(null);

  // Discount/Tax/Fees & Extra Revenue (Default 0, optional percent vs fixed)
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discount, setDiscount] = useState<number>(0);
  const [taxType, setTaxType] = useState<'percent' | 'fixed'>('percent');
  const [tax, setTax] = useState<number>(0);
  const [extraRevenueName, setExtraRevenueName] = useState<string>(''); // خانة اسم الإيراد
  const [extraRevenueAmount, setExtraRevenueAmount] = useState<number>(0); // خانة مبلغ الإيراد
  const [feeDesc, setFeeDesc] = useState<string>('');
  const [fees, setFees] = useState<number>(0);

  // Payment Modal State
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'drawer' | 'vodafone' | 'instapay' | 'bank'>('drawer');

  // Autocomplete Dropdowns State
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showPhoneDropdown, setShowPhoneDropdown] = useState(false);
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  const filteredCustomersForName = appData.customers.filter((c) => {
    const q = customerName.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.phone && c.phone.toLowerCase().includes(q));
  });

  const filteredCustomersForPhone = appData.customers.filter((c) => {
    const q = phone.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.phone && c.phone.toLowerCase().includes(q));
  });

  const activeBranchId = appData.activeBranchId || appData.branches?.[0]?.id || 'br-main';
  const mainBranchId = getMainBranchId(appData.branches);
  const currentBranchItems = getBranchItems(appData.items, activeBranchId, mainBranchId);

  const filteredItemsForSearch = currentBranchItems.filter((i) => {
    const q = itemName.trim().toLowerCase();
    if (!q) return true;
    return i.name.toLowerCase().includes(q) || (i.id && i.id.toString().includes(q));
  });

  const filteredInvoices = appData.salesInvoices.filter((inv) => {
    if (selectedBranchFilter !== 'all' && inv.branchId && inv.branchId !== selectedBranchFilter) {
      return false;
    }
    if (selectedYearFilter !== 'all' && !(inv.date || '').startsWith(selectedYearFilter)) {
      return false;
    }
    const s = searchTerm.toLowerCase();
    if (!s) return true;
    return (
      inv.id.toString().includes(s) ||
      inv.customerName?.toLowerCase().includes(s) ||
      inv.phone?.toLowerCase().includes(s) ||
      inv.salesRep?.toLowerCase().includes(s) ||
      inv.notes?.toLowerCase().includes(s)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedInvoices = filteredInvoices.slice(startIndex, startIndex + pageSize);

  // Available fiscal years extracted dynamically for high-speed period partitioning
  const availableInvoiceYears = Array.from(
    new Set((appData.salesInvoices || []).map((inv) => (inv.date || '').substring(0, 4)).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a));

  const openCreateModal = (
    type: 'nagdi' | 'ajel' | 'return_nagdi' | 'return_ajel',
    pricingType: 'cash' | 'wholesale' = 'cash'
  ) => {
    setEditingInvoiceId(null);
    setSelectedBranchId(appData.activeBranchId || appData.branches?.[0]?.id || 'main');
    setModalType(type);
    setSalesPricingType(pricingType);
    setSelectedItemId('');
    setIsPriceAutoFetched(false);
    setPriceWarning(null);
    setCustomerName('');
    setPhone('');
    setCustomerRepId('');
    setCustomerRepName('');
    setCustomerRepPhone('');
    setSalesRep('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('drawer');
    setPaidAmountInput(type === 'ajel' || type === 'return_ajel' ? '0' : '');
    setTempItems([]);

    // Reset Unified System state
    setUnifiedItems([]);
    setGlobalInvDisc(0);
    setInvDiscType('percent');
    setGlobalInvTax(0);
    setInvTaxType('percent');
    setExtraIncomeName('');
    setExtraIncomeVal(0);
    setPaymentRows([{ id: `pay_${Date.now()}`, method: 'نقدي / كاش', amount: 0 }]);

    setItemName('');
    setItemNote('');
    setItemQty('');
    setItemPrice('');
    setItemDiscount('');
    setItemTax('');
    setDiscountType('percent');
    setDiscount(0);
    setTaxType('percent');
    setTax(0);
    setExtraRevenueName('');
    setExtraRevenueAmount(0);
    setFeeDesc('');
    setFees(0);
    setShowCustomerDropdown(false);
    setShowPhoneDropdown(false);
    setShowItemDropdown(false);
    setShowItemCard(true);
    setActiveModal('create');
  };

  const openEditModal = (inv: SaleInvoice) => {
    setEditingInvoiceId(inv.id);
    setSelectedBranchId(inv.branchId || appData.activeBranchId || appData.branches?.[0]?.id || 'main');
    setModalType(inv.type);
    setSalesPricingType((inv.salesType as any) || (inv.type === 'ajel' ? 'wholesale' : 'cash'));
    setSelectedItemId('');
    setIsPriceAutoFetched(false);
    setPriceWarning(null);
    setCustomerName(inv.customerName);
    setPhone(inv.phone || '');
    setCustomerRepId(inv.customerRepId || '');
    setCustomerRepName(inv.customerRepName || '');
    setCustomerRepPhone(inv.customerRepPhone || '');
    setSalesRep(inv.salesRep || '');
    setNotes(inv.notes || '');
    setDate(inv.date || new Date().toISOString().split('T')[0]);
    setPaymentMethod((inv.paymentMethod as any) || 'drawer');
    setPaidAmountInput(inv.paidAmount !== undefined ? inv.paidAmount.toString() : '0');
    setTempItems(inv.items ? [...inv.items] : []);

    // Map items to unified items
    const mappedItems: InvoiceItemUnified[] = (inv.items || []).map((i) => ({
      code: i.code || (i.itemId ? `ITM-${i.itemId.substring(0, 6)}` : 'G000'),
      name: i.name,
      price: Number(i.price || 0),
      qty: Number(i.qty || 1),
      discVal: Number(i.discVal ?? i.discountValue ?? 0),
      discType: (i.discType === 'val' || i.discountType === 'fixed') ? 'val' : 'percent',
      actualDisc: Number(i.actualDisc ?? i.discount ?? 0),
      taxVal: Number(i.taxVal ?? i.taxValue ?? 0),
      taxType: (i.taxType === 'val' || i.taxType === 'fixed') ? 'val' : 'percent',
      actualTax: Number(i.actualTax ?? i.tax ?? 0),
      spec: i.spec || i.notes || '',
      total: Number(i.total || 0),
      itemId: i.itemId,
      costPrice: i.costPrice,
    }));
    setUnifiedItems(mappedItems);

    setGlobalInvDisc(inv.discountValue || (inv.discountType === 'percent' ? inv.discount : 0) || 0);
    setInvDiscType(inv.discountType === 'fixed' ? 'val' : 'percent');
    setGlobalInvTax(inv.taxValue || (inv.taxType === 'fixed' ? inv.tax : 0) || 0);
    setInvTaxType(inv.taxType === 'fixed' ? 'val' : 'percent');
    setExtraIncomeName(inv.extraRevenueName || '');
    setExtraIncomeVal(inv.extraRevenueAmount || 0);

    if (inv.paymentSplits && inv.paymentSplits.length > 0) {
      setPaymentRows(
        inv.paymentSplits.map((p, idx) => ({
          id: `pay_${idx}_${Date.now()}`,
          method: p.method,
          amount: p.amount,
        }))
      );
    } else {
      const methodLabel =
        inv.paymentMethod === 'vodafone'
          ? 'فودافون كاش Vodafone Cash'
          : inv.paymentMethod === 'instapay'
          ? 'انستاباي Instapay'
          : inv.paymentMethod === 'bank'
          ? 'فيزا / كارت Visa'
          : 'نقدي / كاش';
      setPaymentRows([
        { id: `pay_${Date.now()}`, method: methodLabel, amount: inv.paidAmount || 0 },
      ]);
    }

    setItemName('');
    setItemNote('');
    setItemQty('');
    setItemPrice('');
    setItemDiscount('0');
    setItemTax('0');
    setDiscountType(inv.discountType || 'percent');
    setDiscount(inv.discountValue !== undefined ? inv.discountValue : (inv.discount || 0));
    setTaxType(inv.taxType || 'percent');
    setTax(inv.taxValue !== undefined ? inv.taxValue : (inv.tax || 0));
    setExtraRevenueName(inv.extraRevenueName || '');
    setExtraRevenueAmount(inv.extraRevenueAmount || 0);
    setFeeDesc((inv as any).feeDescription || '');
    setFees(inv.fees || 0);
    setShowCustomerDropdown(false);
    setShowPhoneDropdown(false);
    setShowItemDropdown(false);
    setShowItemCard(true);
    setActiveModal('edit');
  };

  // 🏷️ Handle switching sales pricing type (Cash vs Wholesale)
  const handleChangePricingType = (newType: 'cash' | 'wholesale') => {
    setSalesPricingType(newType);

    // If currently draft item selected, update its price immediately
    if (itemName.trim()) {
      const priceRes = getProductActivePrice(appData, selectedItemId || itemName, newType);
      if (priceRes.hasPrice) {
        setItemPrice(priceRes.price.toString());
        setPriceWarning(null);
        setIsPriceAutoFetched(true);
      } else {
        setItemPrice('');
        setPriceWarning(priceRes.message || 'لا يوجد سعر محدد في إدارة الأسعار');
        showToast(priceRes.message || 'الصنف ليس له سعر محدد', 'error');
      }
    }

    // If there are already items in the invoice table, recalculate them to match master price
    if (unifiedItems.length > 0) {
      let updatedCount = 0;
      const updatedUnified = unifiedItems.map((itm) => {
        const res = getProductActivePrice(appData, itm.itemId || itm.name, newType);
        if (res.hasPrice) {
          updatedCount++;
          const newUnit = res.price;
          const baseTot = (itm.qty || 1) * newUnit;
          const itemDiscAmt = itm.discType === 'val' ? (itm.discVal || 0) : (baseTot * (itm.discVal || 0)) / 100;
          const afterDisc = Math.max(0, baseTot - itemDiscAmt);
          const itemTaxAmt = itm.taxType === 'val' ? (itm.taxVal || 0) : (afterDisc * (itm.taxVal || 0)) / 100;
          const newTot = Math.max(0, afterDisc + itemTaxAmt);
          return {
            ...itm,
            price: newUnit,
            actualDisc: itemDiscAmt,
            actualTax: itemTaxAmt,
            total: newTot,
          };
        }
        return itm;
      });
      setUnifiedItems(updatedUnified);
      showToast(
        `تم إعادة احتساب أسعار (${updatedCount}) صنف وفق تسعيرة (${newType === 'wholesale' ? 'الجملة' : 'النقدي'}) من إدارة الأسعار`,
        'info'
      );
    } else if (tempItems.length > 0) {
      let updatedCount = 0;
      const updatedTemp = tempItems.map((itm) => {
        const res = getProductActivePrice(appData, itm.itemId || itm.name, newType);
        if (res.hasPrice) {
          updatedCount++;
          const newUnit = res.price;
          const itmDisc = itm.discount || 0;
          const itmTax = itm.tax || 0;
          const baseTot = itm.qty * newUnit;
          const newTot = baseTot - (baseTot * itmDisc / 100) + (baseTot * itmTax / 100);
          return {
            ...itm,
            price: newUnit,
            priceType: newType,
            priceSource: 'price_management' as const,
            total: Math.max(0, newTot),
          };
        }
        return itm;
      });
      setTempItems(updatedTemp);
      showToast(
        `تم إعادة احتساب أسعار (${updatedCount}) صنف وفق تسعيرة (${newType === 'wholesale' ? 'الجملة' : 'النقدي'}) من إدارة الأسعار`,
        'info'
      );
    }
  };

  // 🏷️ Handle selecting an item from the catalog
  const handleSelectItemFromCatalog = (item: any) => {
    setItemName(item.name);
    setSelectedItemId(item.id);
    if (!itemQty) setItemQty('1');
    setShowItemDropdown(false);

    // Fetch active master price strictly from Price Management
    const priceRes = getProductActivePrice(appData, item.id, salesPricingType);
    if (!priceRes.hasPrice) {
      setItemPrice('');
      setIsPriceAutoFetched(false);
      setPriceWarning(priceRes.message || 'لا يوجد سعر مسجل');
      showToast(priceRes.message || 'هذا المنتج لا يحتوي على سعر بيع في إدارة الأسعار', 'error');
    } else {
      setItemPrice(priceRes.price.toString());
      setPriceWarning(null);
      setIsPriceAutoFetched(true);
    }
  };

  const handleAddItem = () => {
    const name = itemName.trim();
    const qty = parseFloat(itemQty) || 0;
    const price = parseFloat(itemPrice) || 0;
    const itmDisc = parseFloat(itemDiscount) || 0;
    const itmTax = parseFloat(itemTax) || 0;

    if (!name || qty <= 0) {
      showToast('يرجى إدخال اسم الصنف والكمية بشكل صحيح', 'warning');
      return;
    }

    if (price <= 0) {
      showToast('لا يمكن إضافة صنف بسعر 0 أو بدون سعر محدد في إدارة الأسعار', 'error');
      return;
    }

    const matchedItem = appData.items.find(
      (i) => i.id === selectedItemId || i.name.trim().toLowerCase() === name.toLowerCase()
    );

    const baseTotal = qty * price;
    const calculatedTotal = baseTotal - (baseTotal * itmDisc / 100) + (baseTotal * itmTax / 100);

    setTempItems((prev) => [
      ...prev,
      {
        itemId: matchedItem?.id || selectedItemId || undefined,
        name,
        qty,
        price,
        costPrice: matchedItem?.purchasePrice || 0,
        priceType: salesPricingType,
        priceSource: isPriceAutoFetched ? 'price_management' : 'manual_override',
        notes: itemNote.trim() || undefined,
        discount: itmDisc,
        tax: itmTax,
        total: Math.max(0, calculatedTotal),
      },
    ]);
    setItemName('');
    setSelectedItemId('');
    setItemNote('');
    setItemQty('');
    setItemPrice('');
    setItemDiscount('0');
    setItemTax('0');
    setIsPriceAutoFetched(false);
    setPriceWarning(null);
  };

  // 📇 Open Add Item Modal (كارت الصنف)
  const handleOpenAddItemModal = () => {
    setEditingItemIndex(null);
    setEditingItemData(null);
    setIsItemCardModalOpen(true);
  };

  // ✏️ Open Edit Item Modal (تعديل كارت الصنف)
  const handleOpenEditItemModal = (item: InvoiceItem, index: number) => {
    setEditingItemIndex(index);
    setEditingItemData(item);
    setIsItemCardModalOpen(true);
  };

  // 💾 Save Item from Modal
  const handleSaveItemFromModal = (savedItem: InvoiceItem) => {
    if (editingItemIndex !== null && editingItemIndex >= 0) {
      setTempItems((prev) => {
        const copy = [...prev];
        copy[editingItemIndex] = savedItem;
        return copy;
      });
      showToast(`تم تعديل كارت الصنف: ${savedItem.name}`, 'success');
    } else {
      setTempItems((prev) => [...prev, savedItem]);
      showToast(`تمت إضافة الصنف للفاتورة: ${savedItem.name}`, 'success');
    }
    setIsItemCardModalOpen(false);
  };

  const handleRemoveItem = (index: number) => {
    setTempItems((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    let itemsBaseSubtotal = 0;
    let totalItemDiscounts = 0;
    let totalItemTaxes = 0;

    unifiedItems.forEach((itm) => {
      itemsBaseSubtotal += (itm.price || 0) * (itm.qty || 1);
      totalItemDiscounts += itm.actualDisc || 0;
      totalItemTaxes += itm.actualTax || 0;
    });

    const globalDiscAmount =
      invDiscType === 'percent'
        ? (itemsBaseSubtotal - totalItemDiscounts) * (globalInvDisc / 100)
        : (globalInvDisc || 0);

    const baseForGlobalTax = Math.max(0, itemsBaseSubtotal - totalItemDiscounts - globalDiscAmount);
    const globalTaxAmount =
      invTaxType === 'percent'
        ? baseForGlobalTax * (globalInvTax / 100)
        : (globalInvTax || 0);

    const totalDiscountAmount = totalItemDiscounts + globalDiscAmount;
    const totalTaxAmount = totalItemTaxes + globalTaxAmount;
    const extraRev = extraIncomeVal || 0;
    const grandTotal = Math.max(0, itemsBaseSubtotal - totalDiscountAmount + totalTaxAmount + extraRev);

    let paidTotal = 0;
    paymentRows.forEach((r) => {
      paidTotal += r.amount || 0;
    });

    let effectivePaid = paidTotal;
    if ((modalType === 'nagdi' || modalType === 'return_nagdi') && effectivePaid === 0 && grandTotal > 0) {
      effectivePaid = grandTotal;
    }
    const effectiveRemaining = Math.max(0, grandTotal - effectivePaid);

    return {
      subtotal: itemsBaseSubtotal,
      totalItemDiscounts,
      totalItemTaxes,
      invoiceDiscountAmount: globalDiscAmount,
      invoiceTaxAmount: globalTaxAmount,
      totalDiscount: totalDiscountAmount,
      totalTax: totalTaxAmount,
      extraRevenueAmount: extraRev,
      total: grandTotal,
      effectivePaid,
      effectiveRemaining,
    };
  };

  const handleSaveInvoice = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (unifiedItems.length === 0) {
        showToast('يرجى إضافة صنف واحد على الأقل في الفاتورة', 'warning');
        return;
      }
      if (!customerName.trim()) {
        showToast('يرجى إدخال اسم العميل', 'warning');
        return;
      }

    const { subtotal, totalDiscount, totalTax, total, effectivePaid, effectiveRemaining, extraRevenueAmount } = calculateTotals();
    const isReturn = modalType.startsWith('return_');

    // 2. Customer Credit Limit Verification for Credit Sale (Ajel)
    if (modalType === 'ajel' && effectiveRemaining > 0) {
      const cust = appData.customers.find(
        (c) => c.name.trim().toLowerCase() === customerName.trim().toLowerCase()
      );
      if (cust && cust.creditLimit && cust.creditLimit > 0) {
        const currentBalance = cust.balance || 0;
        const projectedBalance = currentBalance + effectiveRemaining;
        if (projectedBalance > cust.creditLimit) {
          const excess = projectedBalance - cust.creditLimit;
          const confirmExceed = confirm(
            `⚠️ تنبيه ائتماني: العميل "${customerName}" سيتجاوز الحد الائتماني المسموح به (${cust.creditLimit.toFixed(
              2
            )} ج.م) بمقدار (${excess.toFixed(2)} ج.م).\n\nالرصيد الحالي: ${currentBalance.toFixed(
              2
            )} ج.م\nالمتبقي من الفاتورة: ${effectiveRemaining.toFixed(
              2
            )} ج.م\nالرصيد الجديد المتوقع: ${projectedBalance.toFixed(
              2
            )} ج.م\n\nهل تريد المتابعة وحفظ الفاتورة الآجلة على مسؤليتك؟`
          );
          if (!confirmExceed) {
            showToast('تم إلغاء حفظ الفاتورة لتجاوز سقف الائتمان المسموح', 'info');
            return;
          }
        }
      }
    }

    const isEditing = editingInvoiceId !== null;
    const invId = isEditing ? editingInvoiceId : appData.nextInvoiceNumber;
    const oldInvForMeta = isEditing ? appData.salesInvoices.find((i) => i.id === editingInvoiceId) : null;
    const nowIso = new Date().toISOString();

    const finalItems: InvoiceItem[] = unifiedItems.map((u) => ({
      itemId: u.itemId,
      code: u.code,
      name: u.name,
      qty: u.qty,
      price: u.price,
      costPrice: u.costPrice,
      total: u.total,
      spec: u.spec,
      notes: u.spec,
      discVal: u.discVal,
      discType: u.discType,
      actualDisc: u.actualDisc,
      taxVal: u.taxVal,
      taxType: u.taxType,
      actualTax: u.actualTax,
      discount: u.actualDisc,
      discountType: u.discType === 'percent' ? 'percent' : 'fixed',
      discountValue: u.discVal,
      tax: u.actualTax,
      taxValue: u.taxVal,
    }));

    const firstRowMethod = paymentRows[0]?.method || 'نقدي / كاش';
    const primaryMethodKey: 'drawer' | 'vodafone' | 'instapay' | 'bank' =
      firstRowMethod.includes('فودافون')
        ? 'vodafone'
        : firstRowMethod.includes('انستاباي')
        ? 'instapay'
        : firstRowMethod.includes('فيزا') || firstRowMethod.includes('بنك')
        ? 'bank'
        : 'drawer';

    const newInvoice: SaleInvoice = {
      id: invId,
      clientSyncId: isEditing ? ((oldInvForMeta as any)?.clientSyncId || `sale_${invId}_${Date.now()}`) : `sale_${invId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      companyId: appData.companyId || 'COMP-000001',
      branchId: selectedBranchId || appData.activeBranchId || 'main',
      customerName: customerName.trim(),
      phone: phone.trim(),
      customerRepId: customerRepId || undefined,
      customerRepName: customerRepName.trim() || undefined,
      customerRepPhone: customerRepPhone.trim() || undefined,
      salesRep: salesRep.trim() || undefined,
      notes: notes.trim() || undefined,
      date: date,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      items: finalItems,
      subtotal,
      discount: totalDiscount || 0,
      discountType: invDiscType === 'percent' ? 'percent' : 'fixed',
      discountValue: globalInvDisc || 0,
      tax: totalTax || 0,
      taxType: invTaxType === 'percent' ? 'percent' : 'fixed',
      taxValue: globalInvTax || 0,
      extraRevenueName: extraIncomeName.trim() || undefined,
      extraRevenueAmount: extraIncomeVal > 0 ? extraIncomeVal : (extraRevenueAmount > 0 ? extraRevenueAmount : undefined),
      fees: 0,
      total,
      paymentMethod: paymentRows.length > 1 ? 'split' : primaryMethodKey,
      paymentSplits: paymentRows.map((r) => ({ method: r.method, amount: r.amount })),
      type: modalType,
      salesType: salesPricingType,
      paidAmount: effectivePaid,
      remainingAmount: effectiveRemaining,
      status: 'approved',
      createdAt: isEditing ? (oldInvForMeta?.createdAt || nowIso) : nowIso,
      updatedAt: nowIso,
      createdBy: isEditing ? (oldInvForMeta?.createdBy || currentUser?.name || 'مدير النظام') : (currentUser?.name || 'مدير النظام'),
      createdByUserId: currentUser?.id,
      createdByUserCode: currentUser?.code || 1,
    };
    (newInvoice as any).feeDescription = feeDesc.trim() || undefined;

    // 🏛️ الترحيل المحاسبي الشامل والفوري لجميع أقسام النظام (المخزون، كشف الحساب، الخزينة، سندات القيد)
    const updatedData = postSaleInvoice(appData, newInvoice, isEditing, editingInvoiceId || undefined);

    const actionKind = isReturn ? 'return' : isEditing ? 'edit' : 'create';
    const actionText = isReturn
      ? `مرتجع مبيعات #${newInvoice.id} بقيمة ${total.toFixed(2)} ج.م للعميل "${customerName}"`
      : isEditing
      ? `تعديل فاتورة مبيعات #${newInvoice.id} بقيمة ${total.toFixed(2)} ج.م للعميل "${customerName}"`
      : `إصدار فاتورة مبيعات #${newInvoice.id} بقيمة ${total.toFixed(2)} ج.م للعميل "${customerName}"`;

    onUpdateData(updatedData, {
      action: actionKind,
      module: 'المبيعات',
      details: actionText,
    });
    setActiveModal(null);
    showToast(`تم حفظ ${isReturn ? 'مرتجع' : 'فاتورة'} مبيعات رقم #${newInvoice.id} بنجاح`, 'success');
  } finally {
    setIsSubmitting(false);
  }
};

  const handleDeleteInvoice = (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذه الفاتورة؟ سيتم استرجاع كميات الأصناف تلقائياً إلى رصيد المخزون وتسوية الحسابات والخزينة.')) return;
    const invToDelete = appData.salesInvoices.find((i) => i.id === id);
    if (!invToDelete) return;

    const updatedData = deleteSaleInvoice(appData, id);
    if (!updatedData.deletedRecords) updatedData.deletedRecords = {};
    updatedData.deletedRecords[`salesInvoices_${id}`] = Date.now();

    onUpdateData(updatedData, {
      action: 'delete_invoice',
      module: 'المبيعات',
      details: `حذف ${invToDelete.type.startsWith('return_') ? 'مرتجع' : 'فاتورة'} مبيعات رقم #${id} وتسوية المخزون والخزينة والعميل`,
      deletedId: id,
    });
    showToast(`تم حذف الفاتورة رقم #${id} وإعادة كميات الأصناف كاملة إلى رصيد المخزن وتسوية الحسابات والخزينة بدقة`, 'success');
  };

  const handleOpenPayModal = (inv: SaleInvoice) => {
    setSelectedInvoice(inv);
    const rem = inv.total - (inv.paidAmount || 0);
    setPayAmount(rem > 0 ? rem : 0);
    setPayMethod('drawer');
    setActiveModal('pay');
  };

  const handleConfirmPayment = () => {
    if (!selectedInvoice) return;
    if (isSubmitting) return;
    if (payAmount <= 0) {
      showToast('يرجى إدخال مبلغ دفع صحيح', 'warning');
      return;
    }
    const rem = selectedInvoice.total - (selectedInvoice.paidAmount || 0);
    if (payAmount > rem) {
      showToast('المبلغ المدفوع يتجاوز القيمة المتبقية للفاتورة', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const currentUserObj = appData.users?.find((u) => u.id === appData.currentUser) || appData.users?.[0];
      const updatedData = processSalePayment(appData, {
        invoiceId: selectedInvoice.id,
        amount: payAmount,
        method: payMethod,
        branchId: selectedInvoice.branchId || selectedBranchId || appData.activeBranchId || 'main',
        user: currentUserObj,
        syncId: `vouch_sale_${selectedInvoice.id}_inst_${Date.now()}`,
      });

      onUpdateData(updatedData, {
        action: 'invoice_payment',
        module: 'المبيعات والخزينة',
        details: `تحصيل مبلغ ${payAmount.toFixed(2)} ج.م من فاتورة مبيعات #${selectedInvoice.id} مع قيد محاسبي متوازن`,
      });
      setActiveModal(null);
      showToast(`تم تحصيل ${payAmount.toFixed(2)} ج.م للفاتورة #${selectedInvoice.id} بنجاح وتسوية الخزينة والقيد المزدوج`, 'success');
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ أثناء معالجة التحصيل', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintInvoice = (inv: SaleInvoice, preferredFormat: 'A5' | 'A4' | 'thermal' = 'A5') => {
    printInvoiceWindow(inv, true, appData.settings, showToast, preferredFormat, appData);
  };

  const handleWhatsAppShare = (inv: SaleInvoice) => {
    const customer = appData.customers.find((c) => c.name.trim() === inv.customerName.trim());
    const phone = customer?.phone || '';
    const msg = generateInvoiceWhatsAppMessage(inv, appData.settings);
    openWhatsAppChat(phone, msg);
    showToast('جاري فتح محادثة واتساب لإرسال تفاصيل الفاتورة للعميل', 'info');
  };

  const getMethodLabel = (m: string) => {
    switch (m) {
      case 'drawer':
        return 'الدرج (الخزينة الرئيسية)';
      case 'vodafone':
        return 'فودافون كاش';
      case 'instapay':
        return 'إنستاباي (InstaPay)';
      case 'bank':
        return 'حساب بنكي';
      default:
        return m;
    }
  };

  const getTitleForModal = () => {
    switch (modalType) {
      case 'nagdi':
        return '🔹 فاتورة بيع نقدي جديدة (سداد فوري بالكامل)';
      case 'ajel':
        return '🔹 فاتورة بيع آجل جديدة (ذمم عملاء / دفعة مقدمة)';
      case 'return_nagdi':
        return '↩ مرتجع بيع نقدي (صرف فوري للعميل)';
      case 'return_ajel':
        return '↩ مرتجع بيع آجل (خصم من مديونية العميل)';
    }
  };

  // Print Sales Invoices List
  const handlePrintSalesList = () => {
    const list = appData.salesInvoices || [];
    const totalAmount = list.reduce((sum, i) => sum + (i.total || 0), 0);
    const totalPaid = list.reduce((sum, i) => sum + (i.paidAmount || 0), 0);
    const totalRemaining = totalAmount - totalPaid;

    openUnifiedPrintWindow(
      {
        reportTitle: 'سجل فواتير المبيعات والإيرادات',
        subTitle: 'كشف المبيعات المعتمد',
        serial: 'SALES-REP',
        branch: 'إدارة المبيعات',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        kpis: [
          { title: 'عدد الفواتير', value: `${list.length} فاتورة` },
          { title: 'إجمالي المبيعات', value: `${totalAmount.toFixed(2)} ج.م` },
          { title: 'إجمالي المحصل', value: `${totalPaid.toFixed(2)} ج.م` },
          { title: 'المتبقي ذمم عملاء', value: `${totalRemaining.toFixed(2)} ج.م` },
        ],
        columns: ['#', 'التاريخ', 'العميل', 'النوع', 'الإجمالي', 'المحصل', 'المتبقي'],
        rows: list.map((inv) => [
          `#${inv.id}`,
          inv.date,
          inv.customerName,
          inv.type === 'return_nagdi' || inv.type === 'return_ajel'
            ? 'مرتجع'
            : inv.type === 'nagdi'
            ? 'نقدي'
            : 'آجل',
          `${inv.total.toFixed(2)} ج.م`,
          `${(inv.paidAmount || 0).toFixed(2)} ج.م`,
          `${(inv.total - (inv.paidAmount || 0)).toFixed(2)} ج.م`,
        ]),
        summary: [
          { label: 'إجمالي قيمة المبيعات', value: `${totalAmount.toFixed(2)} ج.م`, isTotal: true },
          { label: 'إجمالي المبالغ المحصلة', value: `${totalPaid.toFixed(2)} ج.م` },
          { label: 'إجمالي المتبقي على العملاء', value: `${totalRemaining.toFixed(2)} ج.م` },
        ],
        footerNote: 'تم استخراج سجل المبيعات من النظام المحاسبي المعتمد',
      },
      appData.settings,
      showToast
    );
  };

  // Export Sales to Excel
  const handleExportSalesExcel = () => {
    const list = appData.salesInvoices || [];
    exportToExcel({
      filename: `سجل_فواتير_المبيعات_${new Date().toISOString().split('T')[0]}`,
      sheetName: 'المبيعات',
      data: list,
      columns: [
        { header: 'رقم الفاتورة', key: 'id', width: 14 },
        { header: 'التاريخ', key: 'date', width: 14 },
        { header: 'اسم العميل', key: 'clientName', width: 26 },
        {
          header: 'نوع الفاتورة',
          getValue: (item: SaleInvoice) =>
            item.type === 'return_nagdi' || item.type === 'return_ajel'
              ? 'مرتجع مبيعات'
              : item.type === 'nagdi'
              ? 'نقدي'
              : 'آجل',
          width: 16,
        },
        { header: 'طريقة الدفع', key: 'paymentMethod', width: 14 },
        { header: 'إجمالي الفاتورة', key: 'total', width: 16, isCurrency: true },
        { header: 'المبلغ المسدد', key: 'paidAmount', width: 16, isCurrency: true },
        {
          header: 'المتبقي',
          getValue: (item: SaleInvoice) => (item.total - (item.paidAmount || 0)).toFixed(2),
          width: 16,
          isCurrency: true,
        },
        { header: 'الملاحظات', key: 'notes', width: 30 },
      ],
      companyName: appData.settings?.companyName,
      reportTitle: 'سجل فواتير المبيعات والتوريدات',
    });
    showToast('تم تصدير سجل المبيعات إلى ملف Excel بنجاح', 'success');
  };

  const totalSalesAmount = (appData.salesInvoices || []).reduce((acc, i) => acc + (i.total || 0), 0);
  const totalSalesPaid = (appData.salesInvoices || []).reduce((acc, i) => acc + (i.paidAmount || 0), 0);
  const totalSalesRemaining = totalSalesAmount - totalSalesPaid;

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col space-y-4">
      {/* 🏛️ ترويسة قسم إدارة المبيعات والفواتير */}
      <div className="bg-white text-slate-900 p-3.5 sm:p-4 rounded-xl border border-slate-200 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">
              إدارة فواتير المبيعات والإيرادات
            </h2>
            <p className="text-xs text-slate-500 font-normal">
              قسم المبيعات · تسجيل ومتابعة فواتير البيع النقدي والجملة والآجل ومردودات المبيعات
            </p>
          </div>
        </div>

        {/* Quick KPI Summary */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto tabular-nums">
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg flex flex-col items-start sm:items-center">
            <span className="text-[11px] text-slate-500 font-medium">عدد الفواتير</span>
            <span className="text-xs sm:text-sm font-semibold text-slate-900">{appData.salesInvoices?.length || 0}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg flex flex-col items-start sm:items-center">
            <span className="text-[11px] text-slate-500 font-medium">إجمالي المبيعات</span>
            <span className="text-xs sm:text-sm font-semibold text-emerald-700">{totalSalesAmount.toLocaleString()} ج.م</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg flex flex-col items-start sm:items-center">
            <span className="text-[11px] text-slate-500 font-medium">المحصل نقداً</span>
            <span className="text-xs sm:text-sm font-semibold text-blue-700">{totalSalesPaid.toLocaleString()} ج.م</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg flex flex-col items-start sm:items-center">
            <span className="text-[11px] text-slate-500 font-medium">المتبقي ذمم</span>
            <span className="text-xs sm:text-sm font-semibold text-amber-700">{totalSalesRemaining.toLocaleString()} ج.م</span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 flex flex-col xl:flex-row gap-3 items-stretch xl:items-center justify-between">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {/* 1. بيع نقدي */}
          <button
            onClick={() => openCreateModal('nagdi', 'cash')}
            className="min-h-[44px] sm:min-h-[40px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
            title="فاتورة بيع نقدي قطاعي بسداد فوري"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>بيع نقدي</span>
          </button>

          {/* 2. بيع جملة نقدي */}
          <button
            onClick={() => openCreateModal('nagdi', 'wholesale')}
            className="min-h-[44px] sm:min-h-[40px] bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
            title="فاتورة بيع جملة بسداد نقدي فوري"
          >
            <Tag className="w-4 h-4 shrink-0" />
            <span>جملة نقدي</span>
          </button>

          {/* 2b. بيع جملة آجل */}
          <button
            onClick={() => openCreateModal('ajel', 'wholesale')}
            className="min-h-[44px] sm:min-h-[40px] bg-violet-700 hover:bg-violet-800 active:bg-violet-900 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
            title="فاتورة بيع جملة آجل على حساب العميل"
          >
            <Tag className="w-4 h-4 shrink-0" />
            <span>جملة آجل</span>
          </button>

          {/* 3. بيع أجل */}
          <button
            onClick={() => openCreateModal('ajel', 'cash')}
            className="min-h-[44px] sm:min-h-[40px] bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
            title="فاتورة بيع آجل على حساب ومديونية العميل"
          >
            <Calendar className="w-4 h-4 shrink-0" />
            <span>بيع آجل</span>
          </button>

          {/* 4. مرتجع نقدي */}
          <button
            onClick={() => openCreateModal('return_nagdi', 'cash')}
            className="min-h-[44px] sm:min-h-[40px] bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
            title="مرتجع مبيعات نقدي بسعر القطاعي"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>مرتجع نقدي</span>
          </button>

          {/* 5. مرتجع جملة */}
          <button
            onClick={() => openCreateModal('return_nagdi', 'wholesale')}
            className="min-h-[44px] sm:min-h-[40px] bg-red-800 hover:bg-red-900 active:bg-red-950 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
            title="مرتجع مبيعات جملة بسعر الجملة"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>مرتجع جملة</span>
          </button>

          {/* 6. مرتجع أجل */}
          <button
            onClick={() => openCreateModal('return_ajel', 'cash')}
            className="min-h-[44px] sm:min-h-[40px] bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
            title="مرتجع مبيعات آجل وخصم من مديونية العميل"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>مرتجع آجل</span>
          </button>

          <TableActionButtons
            onPrint={handlePrintSalesList}
            onExportExcel={handleExportSalesExcel}
            printTitle="طباعة سجل فواتير المبيعات"
            exportTitle="تصدير المبيعات إلى Excel"
          />

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('invoice_registry')}
              className="min-h-[44px] sm:min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              title="فتح سجل الفواتير المصنف والطباعة المجمعة (Mode B)"
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span>السجل المصنف والطباعة</span>
            </button>
          )}

          {/* ⚡ زر فحص النزاهة وصحة البيانات الضخمة (10M+) */}
          <button
            onClick={() => setIsDiagnosticsModalOpen(true)}
            className="min-h-[44px] sm:min-h-[40px] bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 whitespace-nowrap"
            title="فحص النزاهة المحاسبية ومراقبة أداء وسعة قاعدة البيانات الضخمة"
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="hidden xl:inline">صحة البيانات</span>
          </button>
        </div>
        <div className="w-full xl:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-[220px]">
          {availableInvoiceYears.length > 0 && (
            <select
              value={selectedYearFilter}
              onChange={(e) => {
                setSelectedYearFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="min-h-[44px] sm:min-h-[40px] px-3 py-2 border border-slate-300 bg-white text-slate-800 font-medium rounded-lg text-base sm:text-xs focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:outline-none cursor-pointer"
              title="تجزئة وعرض الفواتير حسب السنة المالية"
            >
              <option value="all">كافة السنوات ({appData.salesInvoices?.length || 0})</option>
              {availableInvoiceYears.map((yr) => (
                <option key={yr} value={yr}>
                  سنة {yr} ({appData.salesInvoices?.filter((i) => (i.date || '').startsWith(yr)).length || 0})
                </option>
              ))}
            </select>
          )}

          {appData.branches && appData.branches.length > 1 && (
            <select
              value={selectedBranchFilter}
              onChange={(e) => {
                setSelectedBranchFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="min-h-[44px] sm:min-h-[40px] px-3 py-2 border border-slate-300 bg-white text-slate-800 font-medium rounded-lg text-base sm:text-xs focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:outline-none cursor-pointer"
            >
              <option value="all">جميع الفروع ({appData.salesInvoices?.length || 0})</option>
              {appData.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({appData.salesInvoices?.filter((i) => i.branchId === b.id).length || 0})
                </option>
              ))}
            </select>
          )}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="بحث برقم الفاتورة أو اسم العميل..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full min-h-[44px] sm:min-h-[40px] pr-9 pl-3 py-2 border border-slate-300 bg-white rounded-lg text-base sm:text-xs focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 focus:outline-none placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Mobile Card List View (< md) */}
      <div className="block md:hidden space-y-3">
        {paginatedInvoices.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center text-slate-600 font-semibold text-sm border border-slate-200">
            لا توجد فواتير مبيعات مسجلة
          </div>
        ) : (
          paginatedInvoices.map((inv) => {
            const isPaidFull = inv.paidAmount >= inv.total;
            return (
              <div
                key={inv.id}
                className="bg-white rounded-xl p-4 border border-slate-200 space-y-3 hover:border-slate-300 transition"
              >
                {/* Top Row */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
                  <div
                    onClick={() => {
                      setSelectedInvoice(inv);
                      setActiveModal('view');
                    }}
                    className="flex items-center gap-2 cursor-pointer min-w-0"
                  >
                    <span className="text-blue-700 font-semibold text-sm font-mono tabular-nums">#{inv.id}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600 font-medium text-xs tabular-nums">{inv.date}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-semibold border shrink-0 ${
                      inv.type === 'nagdi'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : inv.type === 'ajel'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    {inv.type === 'nagdi'
                      ? 'نقدي'
                      : inv.type === 'ajel'
                      ? 'آجل'
                      : inv.type === 'return_nagdi'
                      ? 'مرتجع نقدي'
                      : 'مرتجع آجل'}
                  </span>
                </div>

                {/* Middle Info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-sm truncate">{inv.customerName}</div>
                    {inv.salesRep && (
                      <div className="text-xs text-slate-600 mt-0.5">مندوب: {inv.salesRep}</div>
                    )}
                    {inv.notes && (
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{inv.notes}</div>
                    )}
                  </div>
                  <div className="text-left shrink-0 tabular-nums">
                    <div className="text-[11px] text-slate-500 font-medium">القيمة الإجمالية</div>
                    <div className="font-semibold text-slate-900 text-base">
                      {(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 tabular-nums">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${
                      isPaidFull
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : inv.paidAmount > 0
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    {isPaidFull ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>مدفوع بالكامل</span>
                      </>
                    ) : inv.paidAmount > 0 ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>مدفوع جزئياً</span>
                      </>
                    ) : (
                      <span>غير مدفوع</span>
                    )}
                  </span>

                  {inv.type === 'ajel' && (
                    <div className="text-xs text-slate-700 font-medium">
                      <span>المدفوع: <strong className="text-emerald-700">{inv.paidAmount.toFixed(0)}</strong></span>
                      <span className="mx-1.5 text-slate-300">/</span>
                      <span>المتبقي: <strong className="text-rose-700">{(inv.total - inv.paidAmount).toFixed(0)}</strong></span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <button
                    onClick={() => {
                      setSelectedInvoice(inv);
                      setActiveModal('view');
                    }}
                    className="min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-semibold rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-blue-600" />
                    <span>عرض</span>
                  </button>
                  <button
                    onClick={() => openEditModal(inv)}
                    className="min-h-[44px] bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-semibold rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4 text-blue-600" />
                    <span>تعديل</span>
                  </button>
                  <button
                    onClick={() => handlePrintInvoice(inv)}
                    className="min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-semibold rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-slate-700" />
                    <span>طباعة</span>
                  </button>
                  <button
                    onClick={() => handleWhatsAppShare(inv)}
                    className="min-h-[44px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                    title="إرسال عبر واتساب"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-700" />
                    <span>واتساب</span>
                  </button>
                  <button
                    onClick={() => handleDeleteInvoice(inv.id)}
                    className="min-h-[44px] bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-semibold rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>حذف</span>
                  </button>
                  {inv.type === 'ajel' && !isPaidFull && (
                    <button
                      onClick={() => handleOpenPayModal(inv)}
                      className="min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg text-xs transition flex items-center justify-center gap-1.5 col-span-2 sm:col-span-4 cursor-pointer"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>تسديد دفعة من الفاتورة الآجلة</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Invoices Desktop Table (>= md) */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-right text-xs md:text-sm border-collapse tabular-nums">
          <thead>
            <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
              <th className="p-3 font-semibold border-l border-slate-200">رقم الفاتورة</th>
              <th className="p-3 font-semibold border-l border-slate-200">العميل</th>
              {appData.branches && appData.branches.length > 1 && <th className="p-3 font-semibold border-l border-slate-200">الفرع</th>}
              <th className="p-3 font-semibold border-l border-slate-200">التاريخ</th>
              <th className="p-3 font-semibold border-l border-slate-200">القيمة (ج.م)</th>
              <th className="p-3 font-semibold border-l border-slate-200">النوع</th>
              <th className="p-3 font-semibold border-l border-slate-200">الحالة</th>
              <th className="p-3 font-semibold">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {paginatedInvoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-500 font-medium">
                  لا توجد فواتير مبيعات مسجلة
                </td>
              </tr>
            ) : (
              paginatedInvoices.map((inv) => {
                const isPaidFull = inv.paidAmount >= inv.total;
                return (
                  <tr key={inv.id} className="bg-white hover:bg-slate-50 transition">
                    <td
                      onClick={() => {
                        setSelectedInvoice(inv);
                        setActiveModal('view');
                      }}
                      className="p-3 text-blue-700 font-semibold font-mono cursor-pointer hover:underline border-l border-slate-200"
                    >
                      #{inv.id}
                    </td>
                    <td className="p-3 border-l border-slate-200">
                      <div className="font-semibold text-slate-900">{inv.customerName}</div>
                      {inv.salesRep && (
                        <div className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                          <UserIcon className="w-3 h-3 text-blue-600" />
                          <span>مندوب: {inv.salesRep}</span>
                        </div>
                      )}
                      {inv.notes && (
                        <div className="text-xs text-slate-500 truncate max-w-[180px] flex items-center gap-1 mt-0.5" title={inv.notes}>
                          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{inv.notes}</span>
                        </div>
                      )}
                    </td>
                    {appData.branches && appData.branches.length > 1 && (
                      <td className="p-3 border-l border-slate-200 text-xs font-medium text-slate-700">
                        {appData.branches.find((b) => b.id === inv.branchId)?.name || 'الفرع الرئيسي'}
                      </td>
                    )}
                    <td className="p-3 font-mono font-medium text-slate-700 border-l border-slate-200">{inv.date}</td>
                    <td className="p-3 font-semibold font-mono text-slate-900 border-l border-slate-200">
                      {(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 border-l border-slate-200">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${
                          inv.type === 'nagdi'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : inv.type === 'ajel'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        {inv.type === 'nagdi'
                          ? 'نقدي'
                          : inv.type === 'ajel'
                          ? 'آجل'
                          : inv.type === 'return_nagdi'
                          ? 'مرتجع نقدي'
                          : 'مرتجع آجل'}
                      </span>
                    </td>
                    <td className="p-3 border-l border-slate-200">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${
                          isPaidFull
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : inv.paidAmount > 0
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        {isPaidFull ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>مكتمل</span>
                          </>
                        ) : inv.paidAmount > 0 ? (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            <span>مدفوع جزئياً</span>
                          </>
                        ) : (
                          <span>غير مدفوع</span>
                        )}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setActiveModal('view');
                          }}
                          className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center justify-center transition cursor-pointer border border-blue-200"
                          title="عرض الفاتورة"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handlePrintInvoice(inv)}
                          className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center transition cursor-pointer border border-slate-200"
                          title="طباعة"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleWhatsAppShare(inv)}
                          className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center transition cursor-pointer border border-emerald-200"
                          title="إرسال عبر واتساب"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(inv)}
                          className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center justify-center transition cursor-pointer border border-blue-200"
                          title="تعديل الفاتورة"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {inv.type === 'ajel' && !isPaidFull && (
                          <button
                            onClick={() => handleOpenPayModal(inv)}
                            className="w-8 h-8 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 flex items-center justify-center transition cursor-pointer"
                            title="تسديد المتبقي"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteInvoice(inv.id)}
                          className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center justify-center transition cursor-pointer border border-rose-200"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ⚡ High-Speed Big Data Pagination Controls Bar */}
      {filteredInvoices.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-300 p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs text-xs">
          <div className="flex items-center gap-2 text-slate-600 font-medium">
            <span>
              عرض <strong className="text-indigo-950 font-bold">{startIndex + 1}</strong> إلى{' '}
              <strong className="text-indigo-950 font-bold">
                {Math.min(startIndex + pageSize, filteredInvoices.length)}
              </strong>{' '}
              من إجمالي{' '}
              <strong className="text-indigo-600 font-black">{filteredInvoices.length.toLocaleString()}</strong> فاتورة
            </span>
            <span className="hidden md:inline-block text-slate-300">|</span>
            <div className="flex items-center gap-1.5">
              <span>لكل صفحة:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage <= 1}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="الصفحة الأولى"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="الصفحة السابقة"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 font-bold text-slate-800">
              صفحة {safeCurrentPage} من {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="الصفحة التالية"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="الصفحة الأخيرة"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 🏛️ واجهة تسجيل الفواتير المعتمدة - ركيزة (مطابقة كلياً للتصميم الأصلي بالصورة) */}
      {(activeModal === 'create' || activeModal === 'edit') && (
        <RakeezaInvoiceWorkspace
          isOpen={true}
          onClose={() => {
            setActiveModal(null);
            setEditingInvoiceId(null);
          }}
          mode="sale"
          invoiceType={modalType}
          pricingType={salesPricingType}
          editingInvoice={editingInvoiceId !== null ? appData.salesInvoices.find((i) => i.id === editingInvoiceId) || null : null}
          appData={appData}
          onUpdateData={onUpdateData}
          showToast={showToast}
        />
      )}

      {/* 📇 كارت الصنف Modal (اسم الصنف، البيان، العدد، السعر، الخصم والضريبة بالنسبة أو الثابت) */}
      <InvoiceItemModal
        isOpen={isItemCardModalOpen}
        onClose={() => setIsItemCardModalOpen(false)}
        onSave={handleSaveItemFromModal}
        catalogItems={appData.items}
        pricingType={salesPricingType}
        mode="sale"
        initialItem={editingItemData}
      />

      {/* Modal for Invoice View - Using the standard template */}
      <Modal
        isOpen={activeModal === 'view'}
        title={`📋 تفاصيل الفاتورة #${selectedInvoice?.id}`}
        onClose={() => setActiveModal(null)}
        maxWidth="max-w-5xl xl:max-w-6xl w-full"
      >
        {selectedInvoice && (
          <InvoiceCardTemplate
            invoice={selectedInvoice}
            isSales={true}
            settings={appData.settings}
            onPrint={() => handlePrintInvoice(selectedInvoice)}
            onClose={() => setActiveModal(null)}
            onEdit={() => {
              setActiveModal(null);
              openEditModal(selectedInvoice);
            }}
            onDelete={() => {
              setActiveModal(null);
              handleDeleteInvoice(selectedInvoice.id);
            }}
          />
        )}
      </Modal>

      {/* Modal for Invoice Pay */}
      <Modal
        isOpen={activeModal === 'pay'}
        title={`تسديد دفعة للفاتورة #${selectedInvoice?.id}`}
        onClose={() => setActiveModal(null)}
      >
        {selectedInvoice && (
          <div className="space-y-4 text-xs md:text-sm tabular-nums">
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
              <p>
                العميل: <strong>{selectedInvoice.customerName}</strong>
              </p>
              <p>
                إجمالي الفاتورة: <strong>{selectedInvoice.total.toFixed(2)} ج.م</strong>
              </p>
              <p>
                المدفوع حالياً: <strong>{selectedInvoice.paidAmount.toFixed(2)} ج.م</strong>
              </p>
              <p className="text-rose-700 font-semibold text-base pt-1">
                المتبقي: {(selectedInvoice.total - selectedInvoice.paidAmount).toFixed(2)} ج.م
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">مبلغ التسديد (ج.م)</label>
              <input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">وسيلة التحصيل</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as any)}
                className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm bg-white focus:border-blue-600 focus:outline-none"
              >
                <option value="drawer">نقدي (الدرج)</option>
                <option value="vodafone">فودافون كاش</option>
                <option value="instapay">إنستاباي</option>
                <option value="bank">حساب بنكي</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleConfirmPayment}
                disabled={isSubmitting}
                className="min-h-[44px] bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-semibold cursor-pointer transition flex-1 sm:flex-initial text-center"
              >
                {isSubmitting ? 'جاري التحصيل والترحيل...' : 'تأكيد التسديد'}
              </button>
              <button
                onClick={() => setActiveModal(null)}
                className="min-h-[44px] bg-slate-200 hover:bg-slate-300 text-slate-800 px-6 py-2 rounded-lg font-semibold cursor-pointer transition flex-1 sm:flex-initial text-center"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ⚡ Big Data Diagnostics & Health Modal */}
      <BigDataDiagnosticsModal
        isOpen={isDiagnosticsModalOpen}
        onClose={() => setIsDiagnosticsModalOpen(false)}
        appData={appData}
        onUpdateData={onUpdateData}
        showToast={showToast}
      />
    </div>
  );
};

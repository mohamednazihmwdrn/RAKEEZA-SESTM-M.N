import { AppData, SaleInvoice, PurchaseInvoice, Customer, Supplier } from '../types';
import { calculateCustomerBalance, calculateSupplierBalance } from './accounting';

export type InvoiceCategoryKey =
  | 'sales_cash'
  | 'sales_credit'
  | 'sales_wholesale'
  | 'sales_returns'
  | 'purchases_cash'
  | 'purchases_credit'
  | 'purchases_returns'
  | 'needs_review';

export type WholesalePaymentMode = 'cash' | 'partial' | 'credit';

export interface CategoryDefinition {
  key: InvoiceCategoryKey;
  label: string;
  shortLabel: string;
  domain: 'sale' | 'purchase' | 'review';
  description: string;
}

export const INVOICE_CATEGORIES: CategoryDefinition[] = [
  {
    key: 'sales_cash',
    label: 'مبيعات نقدية',
    shortLabel: 'مبيعات نقدية',
    domain: 'sale',
    description: 'فواتير البيع النقدي (القطاعي) المسددة فوراً بدون تسعيرة جملة.',
  },
  {
    key: 'sales_credit',
    label: 'مبيعات آجلة',
    shortLabel: 'مبيعات آجلة',
    domain: 'sale',
    description: 'فواتير البيع الآجل والمدفوعة جزئياً على حساب العملاء (باستثناء الجملة).',
  },
  {
    key: 'sales_wholesale',
    label: 'مبيعات الجملة',
    shortLabel: 'مبيعات الجملة',
    domain: 'sale',
    description: 'فواتير بيع الجملة المستقلة (تشمل جملة نقدي وجملة آجل والجزئي).',
  },
  {
    key: 'sales_returns',
    label: 'مرتجعات المبيعات',
    shortLabel: 'مرتجعات المبيعات',
    domain: 'sale',
    description: 'مرتجعات المبيعات الكلية والجزئية وربطها بالفواتير الأصلية وأثرها المالي.',
  },
  {
    key: 'purchases_cash',
    label: 'مشتريات نقدية',
    shortLabel: 'مشتريات نقدية',
    domain: 'purchase',
    description: 'فواتير الشراء والتوريد المسددة نقدياً أو عبر المحافظ والبنك فوراً.',
  },
  {
    key: 'purchases_credit',
    label: 'مشتريات آجلة',
    shortLabel: 'مشتريات آجلة',
    domain: 'purchase',
    description: 'فواتير الشراء الآجل والمستحقة للموردين مع تتبع المسدد والمتبقي.',
  },
  {
    key: 'purchases_returns',
    label: 'مرتجعات المشتريات',
    shortLabel: 'مرتجعات المشتريات',
    domain: 'purchase',
    description: 'مرتجعات المشتريات للموردين وربطها بالفاتورة الأصلية والتسوية المالية.',
  },
  {
    key: 'needs_review',
    label: 'مراجعة التصنيف',
    shortLabel: 'مراجعة التصنيف',
    domain: 'review',
    description: 'مستندات تحتاج مراجعة محاسبية لتعارض القيم أو نقص نوع الحركة بدلاً من التخمين.',
  },
];

export interface ClassifiedInvoiceRecord {
  uid: string;
  domain: 'sale' | 'purchase';
  category: InvoiceCategoryKey;
  categoryLabel: string;
  invoice: SaleInvoice | PurchaseInvoice;
  docNumber: number;
  date: string;
  time: string;
  isReturn: boolean;
  isWholesale: boolean;
  wholesalePaymentMode?: WholesalePaymentMode;
  paymentStatusKey: 'paid' | 'partial' | 'unpaid';
  paymentStatusLabel: string;
  paymentMethodKey: string;
  paymentMethodLabel: string;
  treasuryOrBank: string;
  partyName: string;
  partyCode: string;
  partyPhone: string;
  partyAddress: string;
  partyBalanceAfter?: number;
  branchId: string;
  branchName: string;
  user: string;
  originalInvoiceId?: number;
  originalInvoiceDate?: string;
  originalInvoiceTotal?: number;
  returnKind?: 'full' | 'partial';
  returnKindLabel?: string;
  returnSettlementMode?: 'refund_cash' | 'party_credit' | 'mixed';
  returnSettlementLabel?: string;
  needsReview: boolean;
  reviewReasons: string[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  extraCharges: number;
  grossTotal: number;
  paidAmount: number;
  remainingAmount: number;
  itemsCount: number;
  totalQty: number;
}

export interface InvoiceRegistryFilters {
  category?: InvoiceCategoryKey;
  startDate?: string;
  endDate?: string;
  invoiceNumber?: string;
  partyQuery?: string;
  partyCode?: string;
  productQuery?: string;
  paymentMethod?: string;
  paymentStatus?: 'all' | 'paid' | 'partial' | 'unpaid';
  treasuryOrBank?: string;
  branchId?: string;
  wholesalePaymentFilter?: 'all' | WholesalePaymentMode;
  returnKindFilter?: 'all' | 'full' | 'partial';
}

export interface RegisterSummaryStats {
  count: number;
  subtotalSum: number;
  discountSum: number;
  taxSum: number;
  extraChargesSum: number;
  grossTotalSum: number;
  paidSum: number;
  remainingSum: number;
  returnsTotalSum: number;
  netAfterReturns: number;
  cashCount: number;
  creditCount: number;
  wholesaleCashCount: number;
  wholesaleCreditCount: number;
  fullReturnsCount: number;
  partialReturnsCount: number;
}

const VALID_TYPES = new Set(['nagdi', 'ajel', 'return_nagdi', 'return_ajel']);

export function resolveTreasuryLabel(inv: SaleInvoice | PurchaseInvoice): string {
  const custom =
    (inv as any).treasuryName ||
    (inv as any).drawerName ||
    (inv as any).safeName;
  if (custom) return String(custom);

  if (inv.type === 'ajel' && Number(inv.paidAmount || 0) <= 0.01) {
    return 'بدون خزينة (حساب آجل)';
  }
  if (inv.type === 'return_ajel' && Number(inv.paidAmount || 0) <= 0.01) {
    return 'تسوية حساب آجل';
  }
  if (inv.paymentMethod === 'bank') return 'الحساب البنكي';
  if (inv.paymentMethod === 'vodafone') return 'محفظة فودافون كاش';
  if (inv.paymentMethod === 'instapay') return 'محفظة إنستاباي';
  if (inv.paymentMethod === 'split' && Array.isArray(inv.paymentSplits) && inv.paymentSplits.length > 0) {
    return inv.paymentSplits.map((s) => s.method).join(' + ');
  }
  return 'الخزينة الرئيسية';
}

export function resolvePaymentMethodText(
  inv: SaleInvoice | PurchaseInvoice,
  paidVal: number,
  remainingVal: number
): string {
  if ((inv.type === 'ajel' || inv.type === 'return_ajel') && paidVal <= 0.01) {
    return inv.type === 'return_ajel' ? 'آجل / خصم من الحساب' : 'آجل';
  }
  if (paidVal > 0.01 && remainingVal > 0.01) {
    return 'دفع جزئي';
  }
  const m = String(inv.paymentMethod || '');
  if (m === 'split') return 'دفع متعدد';
  if (m === 'drawer' || m === 'cash') return 'كاش / نقدي';
  if (m === 'vodafone') return 'فودافون كاش';
  if (m === 'instapay') return 'إنستاباي';
  if (m === 'bank') return 'تحويل بنكي';
  return m || (inv.type === 'nagdi' || inv.type === 'return_nagdi' ? 'كاش / نقدي' : 'آجل');
}

function matchCustomer(inv: SaleInvoice, customers: Customer[]): Customer | undefined {
  if (!customers || customers.length === 0) return undefined;
  if (inv.customerId) {
    const byId = customers.find((c) => String(c.id) === String(inv.customerId));
    if (byId) return byId;
  }
  if (inv.customerCode) {
    const codeNorm = inv.customerCode.trim().toLowerCase();
    const byCode = customers.find(
      (c) => (c.code && c.code.trim().toLowerCase() === codeNorm) || String(c.id).toLowerCase() === codeNorm
    );
    if (byCode) return byCode;
  }
  const nameNorm = (inv.customerName || '').trim().toLowerCase();
  if (nameNorm) {
    const byName = customers.find((c) => c.name.trim().toLowerCase() === nameNorm);
    if (byName) return byName;
  }
  if (inv.phone) {
    const ph = inv.phone.trim();
    if (ph) {
      const byPhone = customers.find((c) => c.phone && c.phone.trim() === ph);
      if (byPhone) return byPhone;
    }
  }
  return undefined;
}

function matchSupplier(inv: PurchaseInvoice, suppliers: Supplier[]): Supplier | undefined {
  if (!suppliers || suppliers.length === 0) return undefined;
  if (inv.supplierId) {
    const byId = suppliers.find((s) => String(s.id) === String(inv.supplierId));
    if (byId) return byId;
  }
  if (inv.supplierCode) {
    const codeNorm = inv.supplierCode.trim().toLowerCase();
    const byCode = suppliers.find(
      (s) => (s.code && s.code.trim().toLowerCase() === codeNorm) || String(s.id).toLowerCase() === codeNorm
    );
    if (byCode) return byCode;
  }
  const nameNorm = (inv.supplierName || '').trim().toLowerCase();
  if (nameNorm) {
    const byName = suppliers.find((s) => s.name.trim().toLowerCase() === nameNorm);
    if (byName) return byName;
  }
  if (inv.phone) {
    const ph = inv.phone.trim();
    if (ph) {
      const byPhone = suppliers.find((s) => s.phone && s.phone.trim() === ph);
      if (byPhone) return byPhone;
    }
  }
  return undefined;
}

export function classifySaleInvoice(inv: SaleInvoice, appData?: AppData): ClassifiedInvoiceRecord {
  const customers = appData?.customers || [];
  const branches = appData?.branches || [];
  const salesInvoices = appData?.salesInvoices || [];

  const matchedCustomer = matchCustomer(inv, customers);
  const branchObj = branches.find((b) => b.id === inv.branchId);
  const branchName = inv.branchName || branchObj?.name || 'الفرع الرئيسي';

  const grossTotal = Number(inv.total ?? 0);
  const discountAmount = Number(inv.discount ?? 0);
  const taxAmount = Number(inv.tax ?? 0);
  const extraCharges = Number(
    inv.extraRevenueAmount ?? (inv as any).shipping ?? (inv as any).extraCharges ?? 0
  );
  const items = inv.items || [];
  const itemsSum = items.reduce((s, it) => {
    const q = Number((it as any).quantity ?? it.qty ?? 1);
    const p = Number(it.price ?? 0);
    const t = it.total !== undefined ? Number(it.total) : q * p;
    return s + (Number.isFinite(t) ? t : 0);
  }, 0);
  const subtotal =
    Number(inv.subtotal) > 0
      ? Number(inv.subtotal)
      : itemsSum > 0
      ? itemsSum
      : Math.max(0, grossTotal + discountAmount - taxAmount - extraCharges);

  const isCashType = inv.type === 'nagdi' || inv.type === 'return_nagdi';
  const paidAmount =
    inv.paidAmount !== undefined && inv.paidAmount !== null && !Number.isNaN(Number(inv.paidAmount))
      ? Number(inv.paidAmount)
      : isCashType
      ? grossTotal
      : 0;
  const remainingAmount =
    inv.remainingAmount !== undefined && inv.remainingAmount !== null && !Number.isNaN(Number(inv.remainingAmount))
      ? Number(inv.remainingAmount)
      : Math.max(0, grossTotal - paidAmount);

  const isReturn = inv.type === 'return_nagdi' || inv.type === 'return_ajel' || (inv as any).isReturn === true;
  const isWholesale = inv.salesType === 'wholesale';

  // Review checks (never guess corrupted/ambiguous records)
  const reviewReasons: string[] = [];
  if (inv.classificationStatus === 'needs_review') {
    reviewReasons.push('تم تعليم المستند للمراجعة اليدوية');
  }
  if (!VALID_TYPES.has(inv.type)) {
    reviewReasons.push(`نوع الفاتورة غير معروف (${String(inv.type)})`);
  }
  if (Number.isNaN(grossTotal) || grossTotal < 0) {
    reviewReasons.push('إجمالي الفاتورة غير صالح أو بالسالب');
  }
  if (grossTotal > 0 && items.length === 0) {
    reviewReasons.push('قيمة الفاتورة موجبة بدون بنود أصناف');
  }
  if (
    inv.paidAmount !== undefined &&
    inv.remainingAmount !== undefined &&
    grossTotal > 0 &&
    Math.abs(paidAmount + remainingAmount - grossTotal) > 0.5
  ) {
    reviewReasons.push(
      `عدم تطابق (المدفوع ${paidAmount.toFixed(2)} + المتبقي ${remainingAmount.toFixed(2)} ≠ الإجمالي ${grossTotal.toFixed(2)})`
    );
  }
  if (isCashType && remainingAmount > 0.5 && paidAmount <= 0.01 && grossTotal > 0) {
    reviewReasons.push('مصنفة نقدي ولكن المبلغ المدفوع صفر والمتبقي بالكامل');
  }

  const needsReview = reviewReasons.length > 0;

  let category: InvoiceCategoryKey;
  if (needsReview) {
    category = 'needs_review';
  } else if (isReturn) {
    category = 'sales_returns';
  } else if (isWholesale) {
    // Preserve Wholesale independence from Cash/Credit payment state
    category = 'sales_wholesale';
  } else if (inv.type === 'ajel' || remainingAmount > 0.01) {
    category = 'sales_credit';
  } else {
    category = 'sales_cash';
  }

  const wholesalePaymentMode: WholesalePaymentMode | undefined = isWholesale
    ? remainingAmount <= 0.01 && paidAmount >= grossTotal - 0.01
      ? 'cash'
      : paidAmount > 0.01
      ? 'partial'
      : 'credit'
    : undefined;

  const paymentStatusKey: 'paid' | 'partial' | 'unpaid' =
    remainingAmount <= 0.01 && (paidAmount > 0 || grossTotal === 0)
      ? 'paid'
      : paidAmount > 0.01
      ? 'partial'
      : 'unpaid';

  const paymentStatusLabel = isReturn
    ? remainingAmount <= 0.01
      ? 'مرتجع مسوى نقدياً'
      : paidAmount > 0.01
      ? 'مرتجع تسوية جزئية'
      : 'مرتجع آجل (خصم من الرصيد)'
    : paymentStatusKey === 'paid'
    ? 'مدفوعة بالكامل'
    : paymentStatusKey === 'partial'
    ? 'مدفوعة جزئياً'
    : 'آجل / مستحقة';

  // Return traceability
  const originalInv = inv.originalInvoiceId
    ? salesInvoices.find((s) => Number(s.id) === Number(inv.originalInvoiceId))
    : undefined;

  let returnKind: 'full' | 'partial' | undefined;
  if (isReturn) {
    if (inv.returnKind) {
      returnKind = inv.returnKind;
    } else if (originalInv) {
      const origQty = (originalInv.items || []).reduce((s, it) => s + Number(it.qty || (it as any).quantity || 0), 0);
      const retQty = items.reduce((s, it) => s + Number(it.qty || (it as any).quantity || 0), 0);
      returnKind =
        Math.abs(grossTotal - Number(originalInv.total || 0)) <= 0.5 && Math.abs(retQty - origQty) <= 0.01
          ? 'full'
          : 'partial';
    }
  }

  const returnSettlementMode: 'refund_cash' | 'party_credit' | 'mixed' | undefined = isReturn
    ? inv.type === 'return_nagdi' || (remainingAmount <= 0.01 && paidAmount > 0)
      ? 'refund_cash'
      : paidAmount > 0.01 && remainingAmount > 0.01
      ? 'mixed'
      : 'party_credit'
    : undefined;

  const returnSettlementLabel = isReturn
    ? returnSettlementMode === 'refund_cash'
      ? 'رد نقدي للعميل من الخزينة'
      : returnSettlementMode === 'mixed'
      ? 'رد نقدي جزئي + خصم من الرصيد'
      : 'خصم من مديونية / حساب العميل'
    : undefined;

  const partyBalanceAfter =
    matchedCustomer && appData
      ? (() => {
          const res = calculateCustomerBalance(matchedCustomer, appData);
          return typeof res === 'number' ? res : res?.balance ?? 0;
        })()
      : undefined;

  const categoryDef = INVOICE_CATEGORIES.find((c) => c.key === category);
  const totalQty = items.reduce((s, it) => s + Number((it as any).quantity ?? it.qty ?? 0), 0);

  return {
    uid: `sale_${inv.id}`,
    domain: 'sale',
    category,
    categoryLabel: categoryDef?.label || 'مبيعات',
    invoice: inv,
    docNumber: Number(inv.id) || 0,
    date: inv.date || '',
    time: inv.time || '',
    isReturn,
    isWholesale,
    wholesalePaymentMode,
    paymentStatusKey,
    paymentStatusLabel,
    paymentMethodKey: inv.paymentMethod || (isCashType ? 'drawer' : 'ajel'),
    paymentMethodLabel: resolvePaymentMethodText(inv, paidAmount, remainingAmount),
    treasuryOrBank: resolveTreasuryLabel(inv),
    partyName: inv.customerName || matchedCustomer?.name || 'عميل نقدي',
    partyCode: inv.customerCode || matchedCustomer?.code || inv.customerId || '-',
    partyPhone: inv.phone || matchedCustomer?.phone || '-',
    partyAddress: inv.customerAddress || matchedCustomer?.address || '',
    partyBalanceAfter,
    branchId: inv.branchId || 'main',
    branchName,
    user: inv.createdBy || 'مدير النظام',
    originalInvoiceId: inv.originalInvoiceId,
    originalInvoiceDate: originalInv?.date,
    originalInvoiceTotal: originalInv?.total,
    returnKind,
    returnKindLabel: isReturn
      ? returnKind === 'full'
        ? 'مرتجع كلي'
        : returnKind === 'partial'
        ? 'مرتجع جزئي'
        : inv.type === 'return_nagdi'
        ? 'مرتجع نقدي'
        : 'مرتجع آجل'
      : undefined,
    returnSettlementMode,
    returnSettlementLabel,
    needsReview,
    reviewReasons,
    subtotal,
    discountAmount,
    taxAmount,
    extraCharges,
    grossTotal,
    paidAmount,
    remainingAmount,
    itemsCount: items.length,
    totalQty,
  };
}

export function classifyPurchaseInvoice(inv: PurchaseInvoice, appData?: AppData): ClassifiedInvoiceRecord {
  const suppliers = appData?.suppliers || [];
  const branches = appData?.branches || [];
  const purchaseInvoices = appData?.purchaseInvoices || [];

  const matchedSupplier = matchSupplier(inv, suppliers);
  const branchObj = branches.find((b) => b.id === inv.branchId);
  const branchName = inv.branchName || branchObj?.name || 'الفرع الرئيسي';

  const grossTotal = Number(inv.total ?? 0);
  const discountAmount = Number(inv.discount ?? 0);
  const taxAmount = Number(inv.tax ?? 0);
  const extraCharges = Number(
    inv.extraRevenueAmount ?? (inv as any).shipping ?? (inv as any).extraCharges ?? 0
  );
  const items = inv.items || [];
  const itemsSum = items.reduce((s, it) => {
    const q = Number((it as any).quantity ?? it.qty ?? 1);
    const p = Number(it.price ?? 0);
    const t = it.total !== undefined ? Number(it.total) : q * p;
    return s + (Number.isFinite(t) ? t : 0);
  }, 0);
  const subtotal =
    Number(inv.subtotal) > 0
      ? Number(inv.subtotal)
      : itemsSum > 0
      ? itemsSum
      : Math.max(0, grossTotal + discountAmount - taxAmount - extraCharges);

  const isCashType = inv.type === 'nagdi' || inv.type === 'return_nagdi';
  const paidAmount =
    inv.paidAmount !== undefined && inv.paidAmount !== null && !Number.isNaN(Number(inv.paidAmount))
      ? Number(inv.paidAmount)
      : isCashType
      ? grossTotal
      : 0;
  const remainingAmount =
    inv.remainingAmount !== undefined && inv.remainingAmount !== null && !Number.isNaN(Number(inv.remainingAmount))
      ? Number(inv.remainingAmount)
      : Math.max(0, grossTotal - paidAmount);

  const isReturn = inv.type === 'return_nagdi' || inv.type === 'return_ajel' || (inv as any).isReturn === true;
  const isWholesale = inv.purchaseType === 'wholesale';

  const reviewReasons: string[] = [];
  if (inv.classificationStatus === 'needs_review') {
    reviewReasons.push('تم تعليم المستند للمراجعة اليدوية');
  }
  if (!VALID_TYPES.has(inv.type)) {
    reviewReasons.push(`نوع الفاتورة غير معروف (${String(inv.type)})`);
  }
  if (Number.isNaN(grossTotal) || grossTotal < 0) {
    reviewReasons.push('إجمالي الفاتورة غير صالح أو بالسالب');
  }
  if (grossTotal > 0 && items.length === 0) {
    reviewReasons.push('قيمة الفاتورة موجبة بدون بنود أصناف');
  }
  if (
    inv.paidAmount !== undefined &&
    inv.remainingAmount !== undefined &&
    grossTotal > 0 &&
    Math.abs(paidAmount + remainingAmount - grossTotal) > 0.5
  ) {
    reviewReasons.push(
      `عدم تطابق (المسدد ${paidAmount.toFixed(2)} + المتبقي ${remainingAmount.toFixed(2)} ≠ الإجمالي ${grossTotal.toFixed(2)})`
    );
  }
  if (isCashType && remainingAmount > 0.5 && paidAmount <= 0.01 && grossTotal > 0) {
    reviewReasons.push('مصنفة نقدي ولكن المبلغ المسدد صفر والمتبقي بالكامل');
  }

  const needsReview = reviewReasons.length > 0;

  let category: InvoiceCategoryKey;
  if (needsReview) {
    category = 'needs_review';
  } else if (isReturn) {
    category = 'purchases_returns';
  } else if (inv.type === 'ajel' || remainingAmount > 0.01) {
    category = 'purchases_credit';
  } else {
    category = 'purchases_cash';
  }

  const paymentStatusKey: 'paid' | 'partial' | 'unpaid' =
    remainingAmount <= 0.01 && (paidAmount > 0 || grossTotal === 0)
      ? 'paid'
      : paidAmount > 0.01
      ? 'partial'
      : 'unpaid';

  const paymentStatusLabel = isReturn
    ? remainingAmount <= 0.01
      ? 'مرتجع مسترد نقدياً'
      : paidAmount > 0.01
      ? 'مرتجع تسوية جزئية'
      : 'مرتجع آجل (خصم من حساب المورد)'
    : paymentStatusKey === 'paid'
    ? 'مسددة بالكامل'
    : paymentStatusKey === 'partial'
    ? 'مسددة جزئياً'
    : 'آجل / مستحقة للمورد';

  const originalInv = inv.originalInvoiceId
    ? purchaseInvoices.find((p) => Number(p.id) === Number(inv.originalInvoiceId))
    : undefined;

  let returnKind: 'full' | 'partial' | undefined;
  if (isReturn) {
    if (inv.returnKind) {
      returnKind = inv.returnKind;
    } else if (originalInv) {
      const origQty = (originalInv.items || []).reduce((s, it) => s + Number(it.qty || (it as any).quantity || 0), 0);
      const retQty = items.reduce((s, it) => s + Number(it.qty || (it as any).quantity || 0), 0);
      returnKind =
        Math.abs(grossTotal - Number(originalInv.total || 0)) <= 0.5 && Math.abs(retQty - origQty) <= 0.01
          ? 'full'
          : 'partial';
    }
  }

  const returnSettlementMode: 'refund_cash' | 'party_credit' | 'mixed' | undefined = isReturn
    ? inv.type === 'return_nagdi' || (remainingAmount <= 0.01 && paidAmount > 0)
      ? 'refund_cash'
      : paidAmount > 0.01 && remainingAmount > 0.01
      ? 'mixed'
      : 'party_credit'
    : undefined;

  const returnSettlementLabel = isReturn
    ? returnSettlementMode === 'refund_cash'
      ? 'استرداد نقدي من المورد للخزينة'
      : returnSettlementMode === 'mixed'
      ? 'استرداد جزئي + خصم من رصيد المورد'
      : 'خصم من مستحقات / حساب المورد'
    : undefined;

  const partyBalanceAfter =
    matchedSupplier && appData
      ? (() => {
          const res = calculateSupplierBalance(matchedSupplier, appData);
          return typeof res === 'number' ? res : res?.balance ?? 0;
        })()
      : undefined;

  const categoryDef = INVOICE_CATEGORIES.find((c) => c.key === category);
  const totalQty = items.reduce((s, it) => s + Number((it as any).quantity ?? it.qty ?? 0), 0);

  return {
    uid: `purchase_${inv.id}`,
    domain: 'purchase',
    category,
    categoryLabel: categoryDef?.label || 'مشتريات',
    invoice: inv,
    docNumber: Number(inv.id) || 0,
    date: inv.date || '',
    time: inv.time || '',
    isReturn,
    isWholesale,
    paymentStatusKey,
    paymentStatusLabel,
    paymentMethodKey: inv.paymentMethod || (isCashType ? 'drawer' : 'ajel'),
    paymentMethodLabel: resolvePaymentMethodText(inv, paidAmount, remainingAmount),
    treasuryOrBank: resolveTreasuryLabel(inv),
    partyName: inv.supplierName || matchedSupplier?.name || 'مورد عام',
    partyCode: inv.supplierCode || matchedSupplier?.code || inv.supplierId || '-',
    partyPhone: inv.phone || matchedSupplier?.phone || '-',
    partyAddress: (matchedSupplier as any)?.address || '',
    partyBalanceAfter,
    branchId: inv.branchId || 'main',
    branchName,
    user: inv.createdBy || 'مدير النظام',
    originalInvoiceId: inv.originalInvoiceId,
    originalInvoiceDate: originalInv?.date,
    originalInvoiceTotal: originalInv?.total,
    returnKind,
    returnKindLabel: isReturn
      ? returnKind === 'full'
        ? 'مرتجع كلي'
        : returnKind === 'partial'
        ? 'مرتجع جزئي'
        : inv.type === 'return_nagdi'
        ? 'مرتجع نقدي'
        : 'مرتجع آجل'
      : undefined,
    returnSettlementMode,
    returnSettlementLabel,
    needsReview,
    reviewReasons,
    subtotal,
    discountAmount,
    taxAmount,
    extraCharges,
    grossTotal,
    paidAmount,
    remainingAmount,
    itemsCount: items.length,
    totalQty,
  };
}

export function classifyAllInvoices(appData: AppData): ClassifiedInvoiceRecord[] {
  const sales = (appData.salesInvoices || [])
    .filter((i) => i.status !== 'cancelled')
    .map((inv) => classifySaleInvoice(inv, appData));

  const purchases = (appData.purchaseInvoices || [])
    .filter((i) => i.status !== 'cancelled')
    .map((inv) => classifyPurchaseInvoice(inv, appData));

  return [...sales, ...purchases].sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    return b.docNumber - a.docNumber;
  });
}

export function filterClassifiedRecords(
  records: ClassifiedInvoiceRecord[],
  filters: InvoiceRegistryFilters
): ClassifiedInvoiceRecord[] {
  return records.filter((rec) => {
    if (filters.category && rec.category !== filters.category) return false;

    if (filters.startDate && rec.date && rec.date < filters.startDate) return false;
    if (filters.endDate && rec.date && rec.date > filters.endDate) return false;

    if (filters.invoiceNumber && filters.invoiceNumber.trim()) {
      const q = filters.invoiceNumber.trim().replace(/^#/, '');
      if (!String(rec.docNumber).includes(q)) return false;
    }

    if (filters.partyQuery && filters.partyQuery.trim()) {
      const q = filters.partyQuery.trim().toLowerCase();
      const hitName = rec.partyName.toLowerCase().includes(q);
      const hitCode = rec.partyCode.toLowerCase().includes(q);
      const hitPhone = rec.partyPhone.toLowerCase().includes(q);
      if (!hitName && !hitCode && !hitPhone) return false;
    }

    if (filters.partyCode && filters.partyCode.trim()) {
      const q = filters.partyCode.trim().toLowerCase();
      if (!rec.partyCode.toLowerCase().includes(q)) return false;
    }

    if (filters.productQuery && filters.productQuery.trim()) {
      const q = filters.productQuery.trim().toLowerCase();
      const items = rec.invoice.items || [];
      const hasProduct = items.some(
        (it) =>
          (it.name && it.name.toLowerCase().includes(q)) ||
          (it.code && it.code.toLowerCase().includes(q)) ||
          (it.spec && it.spec.toLowerCase().includes(q))
      );
      if (!hasProduct) return false;
    }

    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      const pm = filters.paymentMethod;
      if (pm === 'ajel') {
        if (!(rec.invoice.type === 'ajel' || rec.invoice.type === 'return_ajel')) return false;
      } else if (rec.paymentMethodKey !== pm) {
        return false;
      }
    }

    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      if (rec.paymentStatusKey !== filters.paymentStatus) return false;
    }

    if (filters.treasuryOrBank && filters.treasuryOrBank !== 'all') {
      if (!rec.treasuryOrBank.includes(filters.treasuryOrBank)) return false;
    }

    if (filters.branchId && filters.branchId !== 'all') {
      if (rec.branchId !== filters.branchId) return false;
    }

    if (
      filters.wholesalePaymentFilter &&
      filters.wholesalePaymentFilter !== 'all' &&
      rec.category === 'sales_wholesale'
    ) {
      if (rec.wholesalePaymentMode !== filters.wholesalePaymentFilter) return false;
    }

    if (
      filters.returnKindFilter &&
      filters.returnKindFilter !== 'all' &&
      (rec.category === 'sales_returns' || rec.category === 'purchases_returns')
    ) {
      if (rec.returnKind !== filters.returnKindFilter) return false;
    }

    return true;
  });
}

/**
 * Computes accurate register totals without double counting returns.
 * Notice: when inspecting a single return category (sales_returns / purchases_returns),
 * `grossTotalSum` equals `returnsTotalSum` and `netAfterReturns` reflects the return register value (0 positive - returns),
 * whereas when inspecting combined sales or purchases, positive invoices and returns are strictly separated.
 */
export function computeRegisterSummary(
  records: ClassifiedInvoiceRecord[],
  activeCategory?: InvoiceCategoryKey
): RegisterSummaryStats {
  let subtotalSum = 0;
  let discountSum = 0;
  let taxSum = 0;
  let extraChargesSum = 0;
  let grossTotalSum = 0;
  let paidSum = 0;
  let remainingSum = 0;
  let returnsTotalSum = 0;
  let positiveTotalSum = 0;

  let cashCount = 0;
  let creditCount = 0;
  let wholesaleCashCount = 0;
  let wholesaleCreditCount = 0;
  let fullReturnsCount = 0;
  let partialReturnsCount = 0;

  const seenDocKeys = new Set<string>();

  for (const rec of records) {
    if (seenDocKeys.has(rec.uid)) continue;
    seenDocKeys.add(rec.uid);

    subtotalSum += rec.subtotal;
    discountSum += rec.discountAmount;
    taxSum += rec.taxAmount;
    extraChargesSum += rec.extraCharges;
    grossTotalSum += rec.grossTotal;
    paidSum += rec.paidAmount;
    remainingSum += rec.remainingAmount;

    if (rec.isReturn) {
      returnsTotalSum += rec.grossTotal;
      if (rec.returnKind === 'full') fullReturnsCount += 1;
      else partialReturnsCount += 1;
    } else {
      positiveTotalSum += rec.grossTotal;
      if (rec.isWholesale) {
        if (rec.wholesalePaymentMode === 'cash') wholesaleCashCount += 1;
        else wholesaleCreditCount += 1;
      } else if (rec.paymentStatusKey === 'paid' && rec.invoice.type === 'nagdi') {
        cashCount += 1;
      } else {
        creditCount += 1;
      }
    }
  }

  const isReturnsOnlyTab =
    activeCategory === 'sales_returns' || activeCategory === 'purchases_returns';

  const netAfterReturns = isReturnsOnlyTab
    ? returnsTotalSum
    : Math.max(0, positiveTotalSum - returnsTotalSum);

  return {
    count: seenDocKeys.size,
    subtotalSum,
    discountSum,
    taxSum,
    extraChargesSum,
    grossTotalSum,
    paidSum,
    remainingSum,
    returnsTotalSum,
    netAfterReturns,
    cashCount,
    creditCount,
    wholesaleCashCount,
    wholesaleCreditCount,
    fullReturnsCount,
    partialReturnsCount,
  };
}

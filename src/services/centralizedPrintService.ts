import { AppData, SaleInvoice, PurchaseInvoice, Settings } from '../types';
import {
  UniversalPrintPayload,
  UniversalPaperSize,
  UniversalDocKind,
  UniversalPrintItem,
  UniversalPrintSummaryItem,
  UniversalBatchSummary,
} from '../types/universalPrint';
import { tafqeetNumber } from '../utils/tafqeet';
import {
  ClassifiedInvoiceRecord,
  RegisterSummaryStats,
  classifySaleInvoice,
  classifyPurchaseInvoice,
  computeRegisterSummary,
} from '../utils/invoiceClassification';

export type PaperSize = 'A4' | 'A5' | 'thermal' | '58mm';

export interface InvoicePrintPayload {
  invoice: SaleInvoice | PurchaseInvoice;
  isSales?: boolean;
  settings?: Settings;
  appData?: AppData;
  preferredPaperSize?: PaperSize;
  onClose?: () => void;
}

const UNIVERSAL_PRINT_EVENT = 'rakeeza_open_universal_print';
const LEGACY_INVOICE_PRINT_EVENT = 'rakeeza_open_invoice_print';

/**
 * Resolve accurate paid, remaining, subtotal, discount, tax & payment status for an invoice.
 */
export function resolveInvoiceFinancials(inv: SaleInvoice | PurchaseInvoice) {
  const grandTotal = Number(inv.total || 0);
  const discountVal = Number(inv.discount || 0);
  const taxVal = Number(inv.tax || 0);
  const extraChargesVal = Number(
    inv.extraRevenueAmount ?? (inv as any).shipping ?? (inv as any).extraCharges ?? (inv as any).expenses ?? 0
  );

  const itemsSum = (inv.items || []).reduce((sum, it) => {
    const q = Number((it as any).quantity ?? (it as any).qty ?? 1);
    const p = Number(it.price ?? 0);
    const rowTotal = it.total !== undefined ? Number(it.total) : q * p;
    return sum + (Number.isFinite(rowTotal) ? rowTotal : 0);
  }, 0);

  const subtotalVal =
    Number((inv as any).subtotal) > 0
      ? Number((inv as any).subtotal)
      : itemsSum > 0
      ? itemsSum
      : Math.max(0, grandTotal + discountVal - taxVal - extraChargesVal);

  const isCashType = inv.type === 'nagdi' || inv.type === 'return_nagdi';
  const paidVal =
    inv.paidAmount !== undefined && inv.paidAmount !== null && !Number.isNaN(Number(inv.paidAmount))
      ? Number(inv.paidAmount)
      : isCashType
      ? grandTotal
      : 0;

  const remainingVal =
    inv.remainingAmount !== undefined && inv.remainingAmount !== null && !Number.isNaN(Number(inv.remainingAmount))
      ? Number(inv.remainingAmount)
      : Math.max(0, grandTotal - paidVal);

  const isReturn =
    inv.type === 'return_nagdi' ||
    inv.type === 'return_ajel' ||
    (inv as any).isReturn === true;

  const paymentStatus = isReturn
    ? remainingVal <= 0.01
      ? 'مرتجع مسوى نقدياً'
      : paidVal > 0.01
      ? 'مرتجع تسوية جزئية'
      : 'مرتجع آجل (على الحساب)'
    : remainingVal <= 0.01
    ? 'مدفوعة بالكامل'
    : paidVal > 0.01
    ? 'مدفوعة جزئياً'
    : 'آجل / مستحقة';

  const treasuryOrBank =
    (inv as any).treasuryName ||
    (inv as any).drawerName ||
    (inv as any).safeName ||
    (inv.type === 'ajel' && paidVal <= 0.01
      ? 'بدون خزينة (حساب آجل)'
      : inv.paymentMethod === 'bank'
      ? 'الحساب البنكي'
      : inv.paymentMethod === 'vodafone'
      ? 'فودافون كاش'
      : inv.paymentMethod === 'instapay'
      ? 'إنستاباي'
      : 'الخزينة الرئيسية');

  const paymentMethodLabel =
    (inv.type === 'ajel' || inv.type === 'return_ajel') && paidVal <= 0.01
      ? 'آجل'
      : paidVal > 0.01 && remainingVal > 0.01
      ? 'دفع جزئي'
      : inv.paymentMethod === 'split'
      ? 'دفع متعدد'
      : inv.paymentMethod === 'drawer' || (inv as any).paymentMethod === 'cash'
      ? 'كاش / نقدي'
      : inv.paymentMethod === 'vodafone'
      ? 'فودافون كاش'
      : inv.paymentMethod === 'instapay'
      ? 'إنستاباي'
      : inv.paymentMethod === 'bank'
      ? 'تحويل بنكي'
      : inv.paymentMethod || (isCashType ? 'كاش / نقدي' : 'آجل');

  return {
    grandTotal,
    subtotalVal,
    discountVal,
    taxVal,
    extraChargesVal,
    paidVal,
    remainingVal,
    paymentStatus,
    treasuryOrBank,
    paymentMethodLabel,
    isReturn,
  };
}

/**
 * Pure read-only builder converting any SaleInvoice or PurchaseInvoice into a complete Mode A UniversalPrintPayload.
 */
export function buildInvoicePrintPayload(
  inv: SaleInvoice | PurchaseInvoice,
  isSales: boolean,
  settings?: Settings,
  appData?: AppData,
  preferredPaperSize?: PaperSize
): UniversalPrintPayload {
  const classified = isSales
    ? classifySaleInvoice(inv as SaleInvoice, appData)
    : classifyPurchaseInvoice(inv as PurchaseInvoice, appData);

  const fin = resolveInvoiceFinancials(inv);
  const docKind: UniversalDocKind = isSales
    ? fin.isReturn
      ? 'sales_return'
      : 'sales_invoice'
    : fin.isReturn
    ? 'purchase_return'
    : 'purchase_invoice';

  const isWholesale = isSales
    ? (inv as SaleInvoice).salesType === 'wholesale'
    : (inv as PurchaseInvoice).purchaseType === 'wholesale';

  let title: string;
  if (isSales) {
    if (fin.isReturn) {
      title =
        inv.type === 'return_nagdi'
          ? isWholesale
            ? 'سند مرتجع مبيعات جملة نقدي'
            : 'سند مرتجع مبيعات نقدي'
          : isWholesale
          ? 'سند مرتجع مبيعات جملة آجل'
          : 'سند مرتجع مبيعات آجل';
    } else if (isWholesale) {
      title = inv.type === 'ajel' ? 'فاتورة مبيعات جملة آجلة' : 'فاتورة مبيعات جملة نقدية';
    } else {
      title = inv.type === 'ajel' ? 'فاتورة مبيعات آجلة' : 'فاتورة مبيعات نقدية';
    }
  } else {
    if (fin.isReturn) {
      title =
        inv.type === 'return_nagdi'
          ? 'سند مرتجع مشتريات نقدي'
          : 'سند مرتجع مشتريات آجل';
    } else if (isWholesale) {
      title = inv.type === 'ajel' ? 'فاتورة مشتريات جملة آجلة' : 'فاتورة مشتريات جملة نقدية';
    } else {
      title = inv.type === 'ajel' ? 'فاتورة مشتريات آجلة' : 'فاتورة مشتريات نقدية';
    }
  }

  const curSymbol = settings?.currencySymbol || appData?.settings?.currencySymbol || 'ج.م';
  const currencyName = curSymbol === 'ج.م' ? 'جنيه مصري' : curSymbol;

  const items: UniversalPrintItem[] = (inv.items || []).map((it, idx) => {
    const qtyVal = (it as any).quantity ?? (it as any).qty ?? 1;
    const priceVal = it.price ?? 0;
    const descVal = (it as any).spec || (it as any).notes || (it as any).description || (it as any).desc || '-';
    return {
      index: idx + 1,
      code: (it as any).code || (it as any).itemCode || `ITEM-${idx + 1}`,
      name: it.name || (it as any).itemName || 'صنف',
      unit: (it as any).unit || 'قطعة',
      qty: qtyVal,
      price: priceVal,
      discount: (it as any).discount || 0,
      tax: (it as any).tax || 0,
      total: it.total ?? Number(qtyVal) * Number(priceVal),
      notes: descVal,
    };
  });

  const summaries: UniversalPrintSummaryItem[] = [
    { label: 'عدد الأصناف', value: `${items.length} صنف` },
    { label: 'المجموع الفرعي', value: `${fin.subtotalVal.toFixed(2)} ${curSymbol}` },
  ];

  if (fin.discountVal > 0) {
    summaries.push({ label: 'الخصم', value: `${fin.discountVal.toFixed(2)} ${curSymbol}` });
  }
  if (fin.taxVal > 0) {
    summaries.push({ label: 'الضريبة', value: `${fin.taxVal.toFixed(2)} ${curSymbol}` });
  }
  if (fin.extraChargesVal > 0) {
    summaries.push({
      label: inv.extraRevenueName || 'مصاريف إضافية',
      value: `${fin.extraChargesVal.toFixed(2)} ${curSymbol}`,
    });
  }
  summaries.push({
    label: fin.isReturn ? 'صافي قيمة المرتجع' : 'الصافي المستحق',
    value: `${fin.grandTotal.toFixed(2)} ${curSymbol}`,
    isHighlight: true,
    isTotal: true,
  });
  summaries.push({
    label: fin.isReturn ? 'المردود / المسترد نقداً' : isSales ? 'المحصل / المدفوع' : 'المبلغ المسدد',
    value: `${fin.paidVal.toFixed(2)} ${curSymbol}`,
  });
  summaries.push({
    label: fin.isReturn ? 'المسوّى على الحساب' : 'المتبقي المستحق',
    value: `${fin.remainingVal.toFixed(2)} ${curSymbol}`,
    isHighlight: fin.remainingVal > 0,
  });

  let prefSize: UniversalPaperSize = 'a5-portrait';
  if (preferredPaperSize) {
    const p = preferredPaperSize.toLowerCase();
    if (p === 'a4') prefSize = 'a4-portrait';
    else if (p === 'thermal' || p === '80mm') prefSize = 'thermal-80';
    else if (p === '58mm') prefSize = 'thermal-58';
  }

  return {
    kind: docKind,
    title,
    subTitle: isSales ? 'قسم المبيعات' : 'قسم المشتريات',
    docNumber: inv.id,
    date: inv.date || new Date().toISOString().split('T')[0],
    time: inv.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    branch: classified.branchName !== 'الفرع الرئيسي' || (appData?.branches && appData.branches.length > 1) ? classified.branchName : (inv as any).branchName || '',
    user: classified.user,
    pricingTierLabel: isWholesale ? 'تسعيرة الجملة' : isSales ? 'تسعيرة القطاعي' : undefined,
    partyName: classified.partyName,
    partyCode: classified.partyCode,
    partyPhone: classified.partyPhone,
    partyAddress: classified.partyAddress,
    partyLabel: isSales ? 'اسم العميل' : 'اسم المورد',
    partyCodeLabel: isSales ? 'كود العميل' : 'كود المورد',
    partyBalanceAfter: classified.partyBalanceAfter,
    paymentMethod: classified.paymentMethodLabel,
    paymentStatus: classified.paymentStatusLabel,
    treasuryOrBank: classified.treasuryOrBank,
    subtotal: fin.subtotalVal,
    discountAmount: fin.discountVal,
    taxAmount: fin.taxVal,
    extraCharges: fin.extraChargesVal,
    extraChargesLabel: inv.extraRevenueName || undefined,
    paidAmount: fin.paidVal,
    remainingAmount: fin.remainingVal,
    amount: fin.grandTotal,
    amountInWords: tafqeetNumber(fin.grandTotal, currencyName, 'قرش'),
    notes: inv.notes || '',
    authorizedBy: classified.user || 'إدارة الحسابات',
    receivedBy: classified.partyName,
    originalInvoiceNumber: classified.originalInvoiceId,
    isFullReturn: classified.returnKind === 'full',
    returnKindLabel: classified.returnKindLabel,
    returnSettlementMode: classified.returnSettlementLabel,
    items,
    summaries,
    preferredPaperSize: prefSize,
    settings: settings || appData?.settings,
  };
}

/**
 * 🖨️ Centralized Service function to open the Universal Print & Preview Modal
 */
export function openUniversalPrint(payload: UniversalPrintPayload): void {
  if (typeof window === 'undefined') return;

  if (payload.amount !== undefined && !payload.amountInWords) {
    const curName = payload.settings?.currencySymbol || 'جنيه مصري';
    payload.amountInWords = tafqeetNumber(payload.amount, curName, 'قرش');
  }

  if (!payload.preferredPaperSize) {
    const isVoucherOrInvoice = [
      'sales_invoice',
      'purchase_invoice',
      'sales_return',
      'purchase_return',
      'receipt_voucher',
      'payment_voucher',
      'treasury_transfer',
      'batch_invoices',
    ].includes(payload.kind);
    payload.preferredPaperSize = isVoucherOrInvoice ? 'a5-portrait' : 'a4-portrait';
  }

  const event = new CustomEvent(UNIVERSAL_PRINT_EVENT, { detail: payload });
  window.dispatchEvent(event);
}

/**
 * 🎧 Subscribe to Universal Print requests
 */
export function subscribeToUniversalPrint(
  callback: (payload: UniversalPrintPayload) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<UniversalPrintPayload>;
    if (customEvent && customEvent.detail) {
      callback(customEvent.detail);
    }
  };

  window.addEventListener(UNIVERSAL_PRINT_EVENT, handler);
  return () => {
    window.removeEventListener(UNIVERSAL_PRINT_EVENT, handler);
  };
}

/**
 * 🖨️ Individual invoice print dispatcher (Mode A — 100% read-only)
 */
export function openCentralizedInvoicePrint(payload: InvoicePrintPayload): void {
  if (typeof window === 'undefined') return;

  const isSale = payload.isSales !== false;
  const universalPayload = buildInvoicePrintPayload(
    payload.invoice,
    isSale,
    payload.settings,
    payload.appData,
    payload.preferredPaperSize
  );
  universalPayload.onClose = payload.onClose;

  openUniversalPrint(universalPayload);
}

export interface BatchInvoicesPrintOptions {
  title: string;
  subtitle?: string;
  settings?: Settings;
  appData?: AppData;
  preferredPaperSize?: UniversalPaperSize;
  includeSummarySheet?: boolean;
  summaryStats?: RegisterSummaryStats;
  onClose?: () => void;
}

/**
 * Pure read-only builder for Mode B batch printing payload:
 * Preserves each selected invoice as an independent Mode A document rendered sequentially,
 * plus an optional register summary cover/footer sheet without double-counting returns.
 */
export function buildBatchInvoicesPrintPayload(
  records: ClassifiedInvoiceRecord[],
  options: BatchInvoicesPrintOptions
): UniversalPrintPayload {
  const curSymbol = options.settings?.currencySymbol || options.appData?.settings?.currencySymbol || 'ج.م';
  const documents = records.map((rec) =>
    buildInvoicePrintPayload(
      rec.invoice,
      rec.domain === 'sale',
      options.settings,
      options.appData,
      options.preferredPaperSize === 'a4-portrait'
        ? 'A4'
        : options.preferredPaperSize === 'thermal-80'
        ? 'thermal'
        : options.preferredPaperSize === 'thermal-58'
        ? '58mm'
        : 'A5'
    )
  );

  const stats = options.summaryStats || computeRegisterSummary(records);
  const fmt = (n?: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const batchSummary: UniversalBatchSummary = {
    title: `ملخص السجل المجمع — ${options.title}`,
    subtitle: options.subtitle || `إجمالي المستندات المطبوعة: ${documents.length} مستند مستقل`,
    kpis: [
      { title: 'عدد المستندات', value: `${stats.count} مستند` },
      { title: 'إجمالي القيمة', value: `${fmt(stats.grossTotalSum)} ${curSymbol}` },
      { title: 'إجمالي المدفوع / المحصل', value: `${fmt(stats.paidSum)} ${curSymbol}` },
      { title: 'إجمالي المتبقي', value: `${fmt(stats.remainingSum)} ${curSymbol}` },
      ...(stats.returnsTotalSum > 0
        ? [{ title: 'قيمة المرتجعات', value: `${fmt(stats.returnsTotalSum)} ${curSymbol}` }]
        : []),
      { title: 'الصافي المعتمد للسجل', value: `${fmt(stats.netAfterReturns)} ${curSymbol}` },
    ],
    columns: ['#', 'التاريخ', 'التصنيف', 'الطرف', 'الحالة', 'الإجمالي', 'المدفوع', 'المتبقي'],
    rows: records.map((r) => [
      `#${r.docNumber}`,
      r.date || '-',
      r.categoryLabel,
      r.partyName,
      r.paymentStatusLabel,
      fmt(r.grossTotal),
      fmt(r.paidAmount),
      fmt(r.remainingAmount),
    ]),
    footerNotes: [
      'يحتوي هذا الملف على كل مستند مطبوعاً بشكل مستقل ومفصل يليه فاصل صفحة قياسي.',
      `إجمالي الخصومات المسجلة بالسجل: ${fmt(stats.discountSum)} ${curSymbol} · إجمالي الضرائب: ${fmt(stats.taxSum)} ${curSymbol}`,
    ],
  };

  return {
    kind: 'batch_invoices',
    title: options.title || 'طباعة السجل المجمع للفواتير',
    subTitle: options.subtitle || `عدد المستندات: ${documents.length}`,
    docNumber: String(documents.length),
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    amount: stats.netAfterReturns,
    paidAmount: stats.paidSum,
    remainingAmount: stats.remainingSum,
    documents,
    batchSummary,
    includeSummarySheet: options.includeSummarySheet ?? false,
    preferredPaperSize: options.preferredPaperSize || 'a5-portrait',
    settings: options.settings || options.appData?.settings,
    onClose: options.onClose,
  };
}

/**
 * 🖨️ Mode B Multi-Invoice Batch Print Dispatcher (100% read-only)
 */
export function openBatchInvoicesPrint(
  records: ClassifiedInvoiceRecord[],
  options: BatchInvoicesPrintOptions
): void {
  if (typeof window === 'undefined' || records.length === 0) return;
  const payload = buildBatchInvoicesPrintPayload(records, options);
  openUniversalPrint(payload);
}

/**
 * 🎧 Legacy subscription listener
 */
export function subscribeToInvoicePrint(
  callback: (payload: InvoicePrintPayload) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<InvoicePrintPayload>;
    if (customEvent && customEvent.detail && customEvent.detail.invoice) {
      callback(customEvent.detail);
    }
  };

  window.addEventListener(LEGACY_INVOICE_PRINT_EVENT, handler);
  return () => {
    window.removeEventListener(LEGACY_INVOICE_PRINT_EVENT, handler);
  };
}

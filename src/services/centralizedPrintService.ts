import { SaleInvoice, PurchaseInvoice, Settings } from '../types';
import {
  UniversalPrintPayload,
  UniversalPaperSize,
  UniversalDocKind,
  UniversalPrintItem,
  UniversalPrintSummaryItem,
} from '../types/universalPrint';
import { tafqeetNumber } from '../utils/tafqeet';

export type PaperSize = 'A4' | 'A5' | 'thermal' | '58mm';

export interface InvoicePrintPayload {
  invoice: SaleInvoice | PurchaseInvoice;
  isSales?: boolean;
  settings?: Settings;
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
  const extraChargesVal = Number((inv as any).shipping || (inv as any).extraCharges || (inv as any).expenses || 0);

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
  let paidVal = inv.paidAmount !== undefined && inv.paidAmount !== null && !Number.isNaN(Number(inv.paidAmount))
    ? Number(inv.paidAmount)
    : isCashType
    ? grandTotal
    : 0;

  let remainingVal = inv.remainingAmount !== undefined && inv.remainingAmount !== null && !Number.isNaN(Number(inv.remainingAmount))
    ? Number(inv.remainingAmount)
    : Math.max(0, grandTotal - paidVal);

  const isReturn =
    inv.type === 'return_nagdi' ||
    inv.type === 'return_ajel' ||
    (inv as any).isReturn === true;

  const paymentStatus = isReturn
    ? remainingVal <= 0.01
      ? 'مرتجع مسوى'
      : 'مرتجع آجل'
    : remainingVal <= 0.01
    ? 'مدفوعة بالكامل'
    : paidVal > 0
    ? 'مدفوعة جزئياً'
    : 'آجل / مستحقة';

  const treasuryOrBank =
    (inv as any).treasuryName ||
    (inv as any).drawerName ||
    (inv as any).safeName ||
    (inv.paymentMethod === 'bank' ? 'الحساب البنكي' : inv.paymentMethod === 'vodafone' ? 'فودافون كاش' : inv.paymentMethod === 'instapay' ? 'إنستاباي' : 'الخزينة الرئيسية');

  const paymentMethodLabel =
    inv.type === 'ajel' && paidVal <= 0
      ? 'آجل'
      : paidVal > 0 && remainingVal > 0.01
      ? 'دفع جزئي'
      : inv.paymentMethod === 'drawer' || inv.paymentMethod === 'cash'
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
 * 🖨️ Legacy invoice print dispatcher: bridges any invoice into the Universal Print Engine
 */
export function openCentralizedInvoicePrint(payload: InvoicePrintPayload): void {
  if (typeof window === 'undefined') return;

  const inv = payload.invoice;
  const isSale = payload.isSales !== false;
  const settings = payload.settings;
  const fin = resolveInvoiceFinancials(inv);

  const docKind: UniversalDocKind = isSale
    ? fin.isReturn
      ? 'sales_return'
      : 'sales_invoice'
    : fin.isReturn
    ? 'purchase_return'
    : 'purchase_invoice';

  const title = isSale
    ? fin.isReturn
      ? 'سند مرتجع مبيعات'
      : inv.type === 'nagdi'
      ? 'فاتورة مبيعات نقدية'
      : 'فاتورة مبيعات آجلة'
    : fin.isReturn
    ? 'سند مرتجع مشتريات'
    : inv.type === 'nagdi'
    ? 'فاتورة مشتريات نقدية'
    : 'فاتورة مشتريات آجلة';

  const partyName = isSale
    ? (inv as SaleInvoice).customerName || 'عميل نقدي'
    : (inv as PurchaseInvoice).supplierName || 'مورد عام';

  const curSymbol = settings?.currencySymbol || 'ج.م';
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
    summaries.push({ label: 'مصاريف إضافية', value: `${fin.extraChargesVal.toFixed(2)} ${curSymbol}` });
  }
  summaries.push({ label: 'الصافي المستحق', value: `${fin.grandTotal.toFixed(2)} ${curSymbol}`, isHighlight: true, isTotal: true });
  summaries.push({ label: 'المدفوع', value: `${fin.paidVal.toFixed(2)} ${curSymbol}` });
  summaries.push({ label: 'المتبقي', value: `${fin.remainingVal.toFixed(2)} ${curSymbol}`, isHighlight: fin.remainingVal > 0 });

  let prefSize: UniversalPaperSize = 'a5-portrait';
  if (payload.preferredPaperSize) {
    const p = payload.preferredPaperSize.toLowerCase();
    if (p === 'a4') prefSize = 'a4-portrait';
    else if (p === 'thermal' || p === '80mm') prefSize = 'thermal-80';
    else if (p === '58mm') prefSize = 'thermal-58';
  }

  const universalPayload: UniversalPrintPayload = {
    kind: docKind,
    title,
    subTitle: isSale ? 'قسم المبيعات' : 'قسم المشتريات',
    docNumber: inv.id,
    date: inv.date || new Date().toISOString().split('T')[0],
    time: inv.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    branch: (inv as any).branchName || inv.branchId || '',
    user: (inv as any).createdBy || (inv as any).cashierName || '',
    partyName,
    partyCode: (inv as any).customerId || (inv as any).supplierId || (inv as any).clientSyncId || '-',
    partyPhone: inv.phone || (inv as any).customerPhone || (inv as any).supplierPhone || '-',
    partyAddress: (inv as any).address || (inv as any).customerAddress || (inv as any).supplierAddress || '',
    partyLabel: isSale ? 'اسم العميل' : 'اسم المورد',
    partyCodeLabel: isSale ? 'كود العميل' : 'كود المورد',
    paymentMethod: fin.paymentMethodLabel,
    paymentStatus: fin.paymentStatus,
    treasuryOrBank: fin.treasuryOrBank,
    subtotal: fin.subtotalVal,
    discountAmount: fin.discountVal,
    taxAmount: fin.taxVal,
    extraCharges: fin.extraChargesVal,
    paidAmount: fin.paidVal,
    remainingAmount: fin.remainingVal,
    amount: fin.grandTotal,
    amountInWords: tafqeetNumber(fin.grandTotal, currencyName, 'قرش'),
    notes: inv.notes || '',
    authorizedBy: (inv as any).createdBy || (inv as any).cashierName || 'إدارة الحسابات',
    receivedBy: partyName,
    items,
    summaries,
    preferredPaperSize: prefSize,
    settings,
    onClose: payload.onClose,
  };

  openUniversalPrint(universalPayload);
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

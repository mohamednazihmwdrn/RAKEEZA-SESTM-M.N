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
 * 🖨️ Centralized Service function to open the Universal Print & Preview Modal
 * Supports any document kind (Invoices, Returns, Vouchers, Account Statements, Inventory, Treasury, Reports)
 */
export function openUniversalPrint(payload: UniversalPrintPayload): void {
  if (typeof window === 'undefined') return;

  // Auto-enrich amount in words (Tafqeet) if amount is present and amountInWords is missing
  if (payload.amount !== undefined && !payload.amountInWords) {
    const curName = payload.settings?.currencySymbol || 'جنيه مصري';
    payload.amountInWords = tafqeetNumber(payload.amount, curName, 'قرش');
  }

  // Set default preferred paper size to A5 portrait for all invoices & vouchers if not specified
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
 * 🎧 Subscribe to Universal Print requests (Used by UniversalPrintModal)
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

  // Also dispatch legacy event for backward compatibility
  const legacyEvent = new CustomEvent(LEGACY_INVOICE_PRINT_EVENT, { detail: payload });
  window.dispatchEvent(legacyEvent);

  // Convert Invoice to UniversalPrintPayload
  const inv = payload.invoice;
  const isSale = payload.isSales !== false;
  const settings = payload.settings;

  const isReturn =
    inv.type === 'return_nagdi' ||
    inv.type === 'return_ajel' ||
    (inv as any).isReturn === true;

  let docKind: UniversalDocKind = isSale
    ? isReturn
      ? 'sales_return'
      : 'sales_invoice'
    : isReturn
    ? 'purchase_return'
    : 'purchase_invoice';

  let title = isSale
    ? isReturn
      ? 'سند مرتجع مبيعات'
      : inv.type === 'nagdi'
      ? 'فاتورة مبيعات نقدية'
      : 'فاتورة مبيعات آجلة'
    : isReturn
    ? 'سند مرتجع مشتريات'
    : inv.type === 'nagdi'
    ? 'فاتورة مشتريات نقدية'
    : 'فاتورة مشتريات آجلة';

  const partyName = isSale
    ? (inv as SaleInvoice).customerName || 'عميل نقدي'
    : (inv as PurchaseInvoice).supplierName || 'مورد عام';

  const grandTotal = Number(inv.total || 0);
  const paidVal = Number(inv.paidAmount ?? grandTotal);
  const remainingVal = Math.max(0, grandTotal - paidVal);

  const curSymbol = settings?.currencySymbol || 'ج.م';
  const currencyName = curSymbol === 'ج.م' ? 'جنيه مصري' : curSymbol;

  // Map items
  const items: UniversalPrintItem[] = (inv.items || []).map((it, idx) => {
    const qtyVal = (it as any).quantity ?? (it as any).qty ?? 1;
    const priceVal = it.price ?? 0;
    return {
      index: idx + 1,
      code: (it as any).code || (it as any).itemCode || `ITEM-${idx + 1}`,
      name: it.name || (it as any).itemName || 'صنف',
      unit: (it as any).unit || (it as any).spec || 'قطعة',
      qty: qtyVal,
      price: priceVal,
      discount: (it as any).discount || 0,
      tax: (it as any).tax || 0,
      total: it.total ?? (Number(qtyVal) * Number(priceVal)),
      notes: (it as any).notes || '',
    };
  });

  // Map summaries
  const summaries: UniversalPrintSummaryItem[] = [
    { label: 'عدد الأصناف', value: `${items.length} صنف`, color: '#16a34a' },
    { label: 'إجمالي الفاتورة', value: `${grandTotal.toFixed(2)} ${curSymbol}`, isHighlight: true, isTotal: true, color: '#dc2626' },
  ];

  if (Number(inv.discount || 0) > 0) {
    summaries.push({ label: 'إجمالي الخصم', value: `${Number(inv.discount).toFixed(2)} ${curSymbol}`, color: '#64748b' });
  }
  if (Number(inv.tax || 0) > 0) {
    summaries.push({ label: 'ضريبة القيمة المضافة', value: `${Number(inv.tax).toFixed(2)} ${curSymbol}`, color: '#64748b' });
  }
  if (inv.type === 'ajel' || remainingVal > 0) {
    summaries.push({ label: 'المبلغ المدفوع', value: `${paidVal.toFixed(2)} ${curSymbol}`, color: '#16a34a' });
    summaries.push({ label: 'المتبقي المستحق', value: `${remainingVal.toFixed(2)} ${curSymbol}`, isHighlight: true, isTotal: true, color: '#dc2626' });
  }

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
    subTitle: isSale ? 'مبيعات وتوزيع' : 'مشتريات وتوريدات',
    docNumber: inv.id,
    date: inv.date || new Date().toISOString().split('T')[0],
    time: inv.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    branch: inv.branchId || 'الفرع الرئيسي',
    user: (inv as any).createdBy || (inv as any).cashierName || 'Mohamed Nazih',
    partyName,
    partyCode: (inv as any).customerId || (inv as any).supplierId || (inv as any).clientSyncId || '-',
    partyPhone: inv.phone || '-',
    partyLabel: isSale ? 'اسم العميل' : 'اسم المورد',
    partyCodeLabel: isSale ? 'كود العميل' : 'كود المورد',
    paymentMethod: inv.paymentMethod || (inv.type === 'nagdi' ? 'نقداً' : 'آجل'),
    amount: grandTotal,
    amountInWords: tafqeetNumber(grandTotal, currencyName, 'قرش'),
    notes: inv.notes || '',
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

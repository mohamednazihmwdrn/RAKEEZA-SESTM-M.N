import { SaleInvoice, PurchaseInvoice, Settings } from '../types';
import { openCentralizedInvoicePrint, PaperSize, resolveInvoiceFinancials } from '../services/centralizedPrintService';
import { generateUnifiedReportHtml } from './printUnified';

/**
 * 🖨️ Generate Invoice Print HTML conforming to the Official Unified Light Template
 * Supports A4, A5 (portrait/landscape), 80mm/58mm Thermal and multi-page pagination.
 */
export function generateInvoicePrintHtml(
  inv: SaleInvoice | PurchaseInvoice,
  isSales: boolean,
  settings: Settings,
  preferredPaperSize: 'A4' | 'A5' | 'thermal' | '80mm' | '58mm' = 'A5'
): string {
  const isSaleInv = isSales;
  const partyLabel = isSaleInv ? 'اسم العميل' : 'اسم المورد';
  const partyCodeLabel = isSaleInv ? 'كود العميل' : 'كود المورد';
  const partyName = isSaleInv
    ? (inv as SaleInvoice).customerName || 'عميل نقدي'
    : (inv as PurchaseInvoice).supplierName || 'مورد عام';
  const partyCode =
    (inv as any).customerId ||
    (inv as any).supplierId ||
    (inv as any).customerCode ||
    (inv as any).supplierCode ||
    '-';
  const partyPhone = inv.phone || (inv as any).customerPhone || (inv as any).supplierPhone || '-';

  const companyName = settings.companyName || 'المنظومة المحاسبية';
  const companyAddress = settings.address || '';
  const phones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];
  const finalPhones = phones.length > 0 ? phones : ['-'];

  const invoiceNumber = `${inv.id}`;
  const invoiceDate = inv.date || new Date().toISOString().split('T')[0];
  const invoiceTime =
    inv.time ||
    new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });

  let invoiceTypeTitle = 'فاتورة مبيعات';
  if (inv.type === 'nagdi') {
    invoiceTypeTitle = isSaleInv ? 'فاتورة مبيعات نقدية' : 'فاتورة مشتريات نقدية';
  } else if (inv.type === 'ajel') {
    invoiceTypeTitle = isSaleInv ? 'فاتورة مبيعات آجلة' : 'فاتورة مشتريات آجلة';
  } else if (inv.type === 'return_nagdi') {
    invoiceTypeTitle = isSaleInv ? 'مرتجع مبيعات نقدي' : 'مرتجع مشتريات نقدي';
  } else if (inv.type === 'return_ajel') {
    invoiceTypeTitle = isSaleInv ? 'مرتجع مبيعات آجل' : 'مرتجع مشتريات آجل';
  }

  const fin = resolveInvoiceFinancials(inv);
  const curSymbol = settings.currencySymbol || 'ج.م';

  const items = inv.items || [];
  const statementNote = (inv as any).notes || (inv as any).description || (inv as any).note || '';
  const footerTermsNote =
    settings.invoiceFooterNote ||
    (inv as any).footerNote ||
    'البضاعة المباعة ترد وتستبدل وفقاً لشروط الفاتورة وحالتها الأصلية.';

  const columns = ['رقم', 'اسم الصنف', 'البيان / الوصف', 'الكمية', 'الوحدة', 'السعر', 'الإجمالي'];
  const rows = items.map((item, idx) => [
    idx + 1,
    item.name || '-',
    item.spec || item.notes || (item as any).desc || '-',
    Number((item as any).quantity ?? item.qty ?? 0),
    (item as any).unit || 'قطعة',
    Number(item.price || 0).toFixed(2),
    Number(item.total !== undefined ? item.total : Number(item.qty || 0) * Number(item.price || 0)).toFixed(2),
  ]);

  const summary = [
    { label: 'المجموع الفرعي', value: `${fin.subtotalVal.toFixed(2)} ${curSymbol}` },
    ...(fin.discountVal > 0 ? [{ label: 'الخصم', value: `${fin.discountVal.toFixed(2)} ${curSymbol}` }] : []),
    ...(fin.taxVal > 0 ? [{ label: 'الضريبة', value: `${fin.taxVal.toFixed(2)} ${curSymbol}` }] : []),
    ...(fin.extraChargesVal > 0 ? [{ label: 'مصاريف إضافية', value: `${fin.extraChargesVal.toFixed(2)} ${curSymbol}` }] : []),
    { label: 'الصافي المستحق', value: `${fin.grandTotal.toFixed(2)} ${curSymbol}`, isTotal: true, isHighlight: true },
    { label: 'المدفوع', value: `${fin.paidVal.toFixed(2)} ${curSymbol}` },
    ...(fin.remainingVal > 0.01 ? [{ label: 'المتبقي', value: `${fin.remainingVal.toFixed(2)} ${curSymbol}` }] : []),
  ];

  return generateUnifiedReportHtml({
    reportTitle: invoiceTypeTitle,
    subTitle: `${invoiceTypeTitle} #${invoiceNumber}`,
    serial: invoiceNumber,
    date: invoiceDate,
    time: invoiceTime,
    branch: (inv as any).branchName || '',
    company: {
      name: companyName,
      address: companyAddress,
      phones: finalPhones,
      logo: settings.showLogoInPrint !== false ? (settings as any).logo || (settings as any).logoUrl || '' : '',
      taxNumber: settings.taxNumber,
      commercialReg: settings.commercialReg,
    },
    partyLabel,
    partyName,
    partyCode,
    partyCodeLabel,
    partyPhone,
    paymentMethod: `${fin.paymentMethodLabel} (${fin.paymentStatus})`,
    statementNote,
    columns,
    rows,
    summary,
    preferredPaperSize: preferredPaperSize.toLowerCase().includes('4')
      ? 'A4'
      : preferredPaperSize.toLowerCase().includes('therm') || preferredPaperSize.includes('80') || preferredPaperSize.includes('58')
      ? 'thermal'
      : 'A5',
    footerNote: footerTermsNote,
  });
}

/**
 * Open Print Window for Sales & Purchase Invoices
 */
export function printInvoiceWindow(
  inv: SaleInvoice | PurchaseInvoice,
  isSales: boolean,
  settings: Settings,
  _showToast?: (msg: string, type: 'warning' | 'error' | 'success' | 'info') => void,
  preferredPaperSize?: 'A4' | 'A5' | 'thermal' | '80mm' | '58mm',
  appData?: import('../types').AppData
) {
  const normPaperSize: PaperSize =
    preferredPaperSize === '58mm'
      ? '58mm'
      : preferredPaperSize === '80mm' || preferredPaperSize === 'thermal'
      ? 'thermal'
      : preferredPaperSize === 'A4'
      ? 'A4'
      : 'A5';

  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem('sys_print_pref_size', normPaperSize);
  } catch {}

  openCentralizedInvoicePrint({
    invoice: inv,
    isSales,
    settings,
    appData,
    preferredPaperSize: normPaperSize,
  });
}

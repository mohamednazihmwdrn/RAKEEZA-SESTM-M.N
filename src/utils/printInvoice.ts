import { SaleInvoice, PurchaseInvoice, Settings } from '../types';
import { openCentralizedInvoicePrint, PaperSize } from '../services/centralizedPrintService';
import { generateUnifiedReportHtml } from './printUnified';

/**
 * 🖨️ Generate Invoice Print HTML conforming strictly to the Standard Unified Template
 * Includes dynamic adaptation for A4, A5, and 80mm Thermal with single-page guarantee.
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
  const partyCode = (inv as any).customerId || (inv as any).supplierId || (inv as any).customerCode || (inv as any).supplierCode || '-';
  const partyPhone = inv.phone || (inv as any).customerPhone || (inv as any).supplierPhone || '-';

  const companyName = settings.companyName || 'شركة ركيزة للحلول البرمجية';
  const companyAddress = settings.address || 'القاهرة - مصر';
  const phones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];
  const finalPhones = phones.length > 0 ? phones : ['01029190615'];

  const invoiceNumber = `${inv.id}`;
  const invoiceDate = inv.date || new Date().toLocaleDateString('ar-EG');
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

  let paymentMethodType = 'كاش';
  if (inv.type === 'ajel' || inv.type === 'return_ajel') {
    paymentMethodType = 'آجل';
  } else if (inv.paidAmount && inv.remainingAmount && inv.remainingAmount > 0) {
    paymentMethodType = 'سداد جزئي';
  } else if (inv.paymentMethod === 'drawer') {
    paymentMethodType = 'كاش (الخزينة)';
  } else if (inv.paymentMethod === 'vodafone') {
    paymentMethodType = 'فودافون كاش';
  } else if (inv.paymentMethod === 'instapay') {
    paymentMethodType = 'إنستاباي';
  } else if (inv.paymentMethod === 'bank') {
    paymentMethodType = 'تحويل بنكي';
  } else if (inv.paymentMethod) {
    paymentMethodType = inv.paymentMethod;
  }

  const items = inv.items || [];
  const grandTotal = Number(inv.total || 0);
  const taxVal = Number(inv.tax || 0);
  const discountVal = Number(inv.discount || 0);

  let paidVal = Number(inv.paidAmount);
  let remainingVal = Number(inv.remainingAmount);
  if (isNaN(paidVal)) {
    if (inv.type === 'nagdi' || inv.type === 'return_nagdi') {
      paidVal = grandTotal;
      remainingVal = 0;
    } else {
      paidVal = 0;
      remainingVal = grandTotal;
    }
  }
  if (isNaN(remainingVal)) {
    remainingVal = Math.max(0, grandTotal - paidVal);
  }

  const statementNote = (inv as any).notes || (inv as any).description || (inv as any).note || '';
  const footerTermsNote =
    settings.invoiceFooterNote ||
    (inv as any).footerNote ||
    '* تطابق هذه المستندات الأرصدة والبيانات مع السجلات الرسمية بالنظام. | صفحة 1 من 1';

  const columns = ['اسم الصنف / البند', 'البيان', 'العدد', 'السعر', 'الإجمالي'];
  const rows = items.map((item) => [
    item.name || '-',
    item.spec || item.notes || (item as any).desc || (item as any).unit || '-',
    item.qty,
    Number(item.price || 0).toFixed(2),
    Number(item.total !== undefined ? item.total : Number(item.qty || 0) * Number(item.price || 0)).toFixed(2),
  ]);

  const summary = [
    { label: 'إجمالي الأصناف', value: `${(grandTotal - taxVal + discountVal).toFixed(2)} ج.م` },
    ...(discountVal > 0 ? [{ label: 'الخصم', value: `${discountVal.toFixed(2)} ج.م` }] : []),
    ...(taxVal > 0 ? [{ label: 'ضريبة القيمة المضافة', value: `${taxVal.toFixed(2)} ج.م` }] : []),
    { label: 'الإجمالي الصافي', value: `${grandTotal.toFixed(2)} ج.م`, isTotal: true, isHighlight: true },
    { label: 'المدفوع', value: `${paidVal.toFixed(2)} ج.م` },
    { label: 'المتبقي', value: `${remainingVal.toFixed(2)} ج.م` },
  ];

  return generateUnifiedReportHtml({
    reportTitle: invoiceTypeTitle,
    subTitle: `${invoiceTypeTitle} #${invoiceNumber}`,
    serial: invoiceNumber,
    date: invoiceDate,
    time: invoiceTime,
    branch: (inv as any).branchName || 'الفرع الرئيسي',
    company: {
      name: companyName,
      address: companyAddress,
      phones: finalPhones,
      logo: (settings as any).logo || (settings as any).logoUrl || '',
    },
    partyLabel,
    partyName,
    partyCode,
    partyCodeLabel,
    partyPhone,
    paymentMethod: paymentMethodType,
    statementNote,
    columns,
    rows,
    summary,
    preferredPaperSize: preferredPaperSize.toLowerCase().includes('4') ? 'A4' : preferredPaperSize.toLowerCase().includes('therm') ? 'thermal' : 'A5',
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
  showToast?: (msg: string, type: 'warning' | 'error' | 'success' | 'info') => void,
  preferredPaperSize?: 'A4' | 'A5' | 'thermal' | '80mm' | '58mm'
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

  // Centralized in-app high-fidelity preview modal
  openCentralizedInvoicePrint({
    invoice: inv,
    isSales,
    settings,
    preferredPaperSize: normPaperSize,
  });
}

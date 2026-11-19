import { Quotation, AppData } from '../types';
import { tafqeetArabic } from './tafqeet';
import { openUniversalPrint } from '../services/centralizedPrintService';

export function printWebOrderReceipt(
  order: Quotation,
  appData: AppData,
  format: '80mm' | 'a4' = '80mm',
  _autoClose = true
): void {
  try {
    const settings = appData.settings;
    const config = appData.catalogConfig;
    const currency = config?.currencySymbol || settings.currencySymbol || 'ج.م';

    const orderNumber = order.orderReference || `ORD-${order.id}`;
    const orderDate = order.date || new Date().toISOString().split('T')[0];
    const orderTime = order.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const clientName = order.clientName || 'عميل المتجر الإلكتروني';
    const clientPhone = order.phone || '-';
    const clientAddress = order.customerAddress || 'استلام من الفرع / لم يحدد';
    const notes = order.deliveryNotes || order.notes || '';
    const tafqeetStr = tafqeetArabic(order.total || 0, { currency });

    const items = (order.items || []).map((item, idx) => ({
      index: idx + 1,
      code: (item as any).code || `ORD-${idx + 1}`,
      name: item.name || 'صنف',
      unit: (item as any).unit || 'قطعة',
      qty: Number(item.qty || 0),
      price: Number(item.price || 0),
      total: Number(item.total ?? Number(item.qty || 0) * Number(item.price || 0)),
      notes: item.notes || '',
    }));

    const mergedSettings = {
      ...settings,
      companyName: config?.storeName || settings.companyName || 'RAKEEZA',
      phone1: config?.contactPhone || settings.phone1 || '',
    };

    openUniversalPrint({
      kind: 'sales_invoice',
      title: 'إيصال طلب من المتجر الإلكتروني',
      subTitle: 'طلب إلكتروني معتمد',
      docNumber: orderNumber,
      date: orderDate,
      time: orderTime,
      branch: (settings as any)?.branchName || 'المتجر الإلكتروني',
      partyName: clientName,
      partyPhone: clientPhone,
      partyAddress: clientAddress,
      partyLabel: 'العميل',
      notes,
      items,
      subtotal: Number(order.subtotal || order.total || 0),
      discountAmount: Number(order.discount || 0),
      taxAmount: Number(order.tax || 0),
      amount: Number(order.total || 0),
      amountInWords: tafqeetStr,
      summaries: [
        { label: 'عدد الأصناف', value: `${items.length} صنف` },
        ...(order.discount ? [{ label: 'الخصم', value: `-${Number(order.discount).toFixed(2)} ${currency}`, color: '#dc2626' }] : []),
        ...(order.tax ? [{ label: 'الضريبة', value: `+${Number(order.tax).toFixed(2)} ${currency}` }] : []),
        { label: 'الصافي المطلوب', value: `${Number(order.total || 0).toFixed(2)} ${currency}`, isTotal: true, isHighlight: true },
      ],
      footerTermsNote: 'يرجى مراجعة الأصناف والتجهيز للتسليم أو الشحن',
      preferredPaperSize: format === '80mm' ? 'thermal-80' : 'a4-portrait',
      settings: mergedSettings,
    });
  } catch (err) {
    console.error('Error dispatching web order universal print:', err);
  }
}

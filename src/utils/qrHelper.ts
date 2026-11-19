import QRCode from 'qrcode';
import { openUniversalPrint } from '../services/centralizedPrintService';

/**
 * Generate a PNG Data URL for a given string
 */
export async function generateQrDataUrl(text: string, size = 320): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });
  } catch (err) {
    console.error('Failed to generate QR Data URL', err);
    return '';
  }
}

/**
 * Generate an SVG string for a given text
 */
export async function generateQrSvgString(text: string): Promise<string> {
  try {
    return await QRCode.toString(text, {
      type: 'svg',
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });
  } catch (err) {
    console.error('Failed to generate QR SVG', err);
    return '';
  }
}

/**
 * Print a clean, elegant QR Code Display Poster (A4 / A5)
 * Suitable for hanging on showroom counters, store windows, or attaching to invoices
 */
export function printQrPoster(params: {
  companyName: string;
  storeName?: string;
  qrDataUrl: string;
  targetUrl: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  bannerMessage?: string;
}) {
  const rows: (string | number)[][] = [
    ['اسم المتجر / النشاط', params.storeName || params.companyName],
    ['الرابط المباشر للكتالوج', params.targetUrl],
  ];
  if (params.phone) rows.push(['رقم الهاتف', params.phone]);
  if (params.whatsapp) rows.push(['واتساب الطلبات', params.whatsapp]);
  if (params.address) rows.push(['العنوان', params.address]);

  openUniversalPrint({
    kind: 'generic_report',
    title: `ملصق الكتالوج الإلكتروني والـ QR — ${params.storeName || params.companyName}`,
    subTitle: params.bannerMessage || 'امسح الرمز بكاميرا الهاتف لاستعراض المنتجات وتقديم الطلبات',
    docNumber: 'QR-CATALOG',
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    columns: ['البيان', 'التفاصيل'],
    rows,
    footerTermsNote: 'امسح رمز الـ QR بكاميرا الهاتف للانتقال مباشرة إلى كتالوج المنتجات الإلكتروني',
    preferredPaperSize: 'a4-portrait',
    settings: {
      companyName: params.storeName || params.companyName,
      address: params.address || '',
      phone1: params.phone || '',
      phone2: params.whatsapp || '',
      phone3: '',
      taxNumber: '',
      currencySymbol: 'ج.م',
      showLogoInPrint: true,
      logo: params.qrDataUrl,
      notes: params.bannerMessage || '',
      defaultTaxRate: 0,
    },
  });
}

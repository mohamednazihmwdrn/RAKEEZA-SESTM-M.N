import React, { useState, useEffect, useRef } from 'react';
import { Settings } from '../types';
import {
  UniversalPrintPayload,
  UniversalPaperSize,
  UniversalPrintItem,
  UniversalPrintSummaryItem,
} from '../types/universalPrint';
import {
  subscribeToUniversalPrint,
  subscribeToInvoicePrint,
  InvoicePrintPayload,
} from '../services/centralizedPrintService';
import { exportElementToPdf } from '../utils/pdfExport';
import { tafqeetNumber } from '../utils/tafqeet';
import { Printer, Download, X, Copy, Check } from 'lucide-react';

interface CentralizedInvoicePrintModalProps {
  defaultSettings?: Settings;
}

export const CentralizedInvoicePrintModal: React.FC<CentralizedInvoicePrintModalProps> = ({
  defaultSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activePayload, setActivePayload] = useState<UniversalPrintPayload | null>(null);
  const [selectedSize, setSelectedSize] = useState<UniversalPaperSize>('a5-portrait');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const printSheetRef = useRef<HTMLDivElement>(null);

  // Subscribe to universal and legacy invoice print events
  useEffect(() => {
    const unsubUniversal = subscribeToUniversalPrint((payload) => {
      setActivePayload(payload);
      const pref = payload.preferredPaperSize || 'a5-portrait';
      setSelectedSize(pref);
      setIsOpen(true);
    });

    const unsubLegacy = subscribeToInvoicePrint((legacyPayload) => {
      // If activePayload was not already set by universal dispatcher, handle legacy
      if (!legacyPayload || !legacyPayload.invoice) return;
      const inv = legacyPayload.invoice;
      const isSale = legacyPayload.isSales !== false;
      const grandTotal = Number(inv.total || 0);
      const paidVal = Number(inv.paidAmount ?? grandTotal);
      const remainingVal = Math.max(0, grandTotal - paidVal);
      const curSymbol = legacyPayload.settings?.currencySymbol || defaultSettings?.currencySymbol || 'ج.م';
      const curName = curSymbol === 'ج.م' ? 'جنيه مصري' : curSymbol;

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

      const summaries: UniversalPrintSummaryItem[] = [
        { label: 'عدد الأصناف', value: `${items.length} صنف`, color: '#16a34a' },
        { label: 'إجمالي الفاتورة', value: `${grandTotal.toFixed(2)} ${curSymbol}`, isHighlight: true, isTotal: true, color: '#dc2626' },
      ];

      if (inv.type === 'ajel' || remainingVal > 0) {
        summaries.push({ label: 'المبلغ المسدد', value: `${paidVal.toFixed(2)} ${curSymbol}`, color: '#16a34a' });
        summaries.push({ label: 'المتبقي المستحق', value: `${remainingVal.toFixed(2)} ${curSymbol}`, isHighlight: true, isTotal: true, color: '#dc2626' });
      }

      let prefSize: UniversalPaperSize = 'a5-portrait';
      if (legacyPayload.preferredPaperSize) {
        const p = legacyPayload.preferredPaperSize.toLowerCase();
        if (p === 'a4') prefSize = 'a4-portrait';
        else if (p === 'thermal' || p === '80mm') prefSize = 'thermal-80';
        else if (p === '58mm') prefSize = 'thermal-58';
      }

      const p: UniversalPrintPayload = {
        kind: isSale ? 'sales_invoice' : 'purchase_invoice',
        title: isSale ? 'فاتورة مبيعات' : 'فاتورة مشتريات',
        docNumber: inv.id,
        date: inv.date || new Date().toISOString().split('T')[0],
        time: inv.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        branch: inv.branchId || 'الفرع الرئيسي',
        partyName: isSale ? (inv as any).customerName || 'عميل نقدي' : (inv as any).supplierName || 'مورد عام',
        partyCode: (inv as any).customerId || (inv as any).supplierId || '-',
        partyPhone: inv.phone || '-',
        partyLabel: isSale ? 'اسم العميل' : 'اسم المورد',
        paymentMethod: inv.paymentMethod || (inv.type === 'nagdi' ? 'نقداً' : 'آجل'),
        amount: grandTotal,
        amountInWords: tafqeetNumber(grandTotal, curName, 'قرش'),
        items,
        summaries,
        preferredPaperSize: prefSize,
        settings: legacyPayload.settings || defaultSettings,
        onClose: legacyPayload.onClose,
      };

      setActivePayload(p);
      setSelectedSize(prefSize);
      setIsOpen(true);
    });

    return () => {
      unsubUniversal();
      unsubLegacy();
    };
  }, [defaultSettings]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleClose = () => {
    if (activePayload?.onClose) {
      try {
        activePayload.onClose();
      } catch {}
    }
    setIsOpen(false);
    setActivePayload(null);
  };

  const handlePrint = () => {
    if (typeof window === 'undefined') return;

    // Remove existing custom page size style if any
    const existingStyle = document.getElementById('rakeeza-print-page-style');
    if (existingStyle) existingStyle.remove();

    let pageCss = '@page { size: 148mm 210mm; margin: 4mm; }';
    if (selectedSize === 'a5-landscape') {
      pageCss = '@page { size: 210mm 148mm; margin: 4mm; }';
    } else if (selectedSize === 'a4-portrait') {
      pageCss = '@page { size: 210mm 297mm; margin: 5mm; }';
    } else if (selectedSize === 'a4-landscape') {
      pageCss = '@page { size: 297mm 210mm; margin: 5mm; }';
    } else if (selectedSize === 'a3-landscape') {
      pageCss = '@page { size: 420mm 297mm; margin: 6mm; }';
    } else if (selectedSize === 'thermal-80') {
      pageCss = '@page { size: 80mm auto; margin: 2mm; }';
    } else if (selectedSize === 'thermal-58') {
      pageCss = '@page { size: 58mm auto; margin: 1.5mm; }';
    }

    const styleEl = document.createElement('style');
    styleEl.id = 'rakeeza-print-page-style';
    styleEl.innerHTML = `${pageCss}
      @media print {
        body * { visibility: hidden !important; }
        #rakeeza-universal-print-container, #rakeeza-universal-print-container * {
          visibility: visible !important;
        }
        #rakeeza-universal-print-container {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          border: none !important;
          background: #ffffff !important;
        }
        .no-print, .preview-toolbar, .rakeeza-modal-backdrop {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(styleEl);

    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleSavePdf = async () => {
    if (!printSheetRef.current || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      let format = 'a5';
      let orientation: 'portrait' | 'landscape' = 'portrait';
      if (selectedSize === 'a5-landscape') {
        format = 'a5';
        orientation = 'landscape';
      } else if (selectedSize === 'a4-portrait') {
        format = 'a4';
        orientation = 'portrait';
      } else if (selectedSize === 'a4-landscape') {
        format = 'a4';
        orientation = 'landscape';
      } else if (selectedSize === 'a3-landscape') {
        format = 'a3';
        orientation = 'landscape';
      } else if (selectedSize === 'thermal-80') {
        format = 'thermal';
        orientation = 'portrait';
      } else if (selectedSize === 'thermal-58') {
        format = '58mm';
        orientation = 'portrait';
      }

      const docTitle = activePayload?.title?.replace(/\s+/g, '_') || 'مستند';
      const docNum = activePayload?.docNumber ? `_${activePayload.docNumber}` : '';
      const filename = `${docTitle}${docNum}_${new Date().toISOString().split('T')[0]}.pdf`;

      await exportElementToPdf(printSheetRef.current, filename, {
        format,
        orientation,
        margin: 3,
        scale: 2,
      });
    } catch (e) {
      console.error('Error generating PDF:', e);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCopySummary = () => {
    if (!activePayload) return;
    const lines = [
      `المستند: ${activePayload.title} #${activePayload.docNumber || ''}`,
      `التاريخ: ${activePayload.date || ''} ${activePayload.time || ''}`,
      `الطرف: ${activePayload.partyName || '-'}`,
      `المبلغ: ${activePayload.amount ? `${activePayload.amount.toFixed(2)} ج.م` : '-'}`,
      activePayload.amountInWords ? `المبلغ كتابة: ${activePayload.amountInWords}` : '',
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen || !activePayload) {
    return null;
  }

  const settings: Settings = activePayload.settings || defaultSettings || ({} as Settings);
  const companyName = settings.companyName || 'مؤسسة الموان للتجارة';
  const branchName = activePayload.branch || (settings as any).branchName || 'المقر الرئيسي - مؤسسة الموان';
  const phones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];
  const finalPhones = phones.length > 0 ? phones : ['01029190615'];
  const companyCode = (settings as any).code || finalPhones[0] || '01029190615';
  const logoUrl = settings.logo || (settings as any).logoUrl || '';

  const now = new Date();
  const printDate = activePayload.date || now.toLocaleDateString('ar-EG');
  const printTime = activePayload.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const docSerial = activePayload.docNumber !== undefined && activePayload.docNumber !== '' ? `#${activePayload.docNumber}` : '#1';
  const approver = activePayload.user || 'Mohamed Nazih';

  const currencySymbol = settings.currencySymbol || 'ج.م';
  const currencyName = currencySymbol === 'ج.م' ? 'جنيه مصري' : currencySymbol;

  const totalAmount = activePayload.amount !== undefined ? Number(activePayload.amount) : 0;
  const tafqeetText = activePayload.amountInWords || (totalAmount > 0 ? tafqeetNumber(totalAmount, currencyName, 'قرش') : '');

  // Width & Max-Width style for interactive preview container
  const sheetWidthClass = getSheetWidthStyle(selectedSize);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-slate-950/80 backdrop-blur-xs rakeeza-modal-backdrop"
      dir="rtl"
    >
      {/* 🔝 Interactive Top Preview Toolbar (Exact match to reference photo) */}
      <div className="preview-toolbar no-print bg-slate-900 text-white px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 shadow-lg">
        {/* Right side in RTL: Paper Size Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="paper-size-select" className="text-xs sm:text-sm font-bold text-slate-300">
            اختر مقاس العرض والطباعة:
          </label>
          <select
            id="paper-size-select"
            value={selectedSize}
            onChange={(e) => setSelectedSize(e.target.value as UniversalPaperSize)}
            className="bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-black outline-none cursor-pointer hover:border-emerald-500 focus:border-emerald-500 transition"
          >
            <option value="a5-portrait">ورق قياسي A5 عمودي (الافتراضي)</option>
            <option value="a5-landscape">ورق قياسي A5 أفقي</option>
            <option value="a4-portrait">ورق قياسي A4 عمودي</option>
            <option value="a4-landscape">ورق قياسي A4 أفقي</option>
            <option value="a3-landscape">ورق كبير A3 عريض</option>
            <option value="thermal-80">إيصال حراري (80mm)</option>
            <option value="thermal-58">إيصال حراري صغير (58mm)</option>
          </select>
        </div>

        {/* Left side in RTL: Action Buttons (Print, PDF, Copy, Close) */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black px-4 py-1.5 rounded-lg text-xs sm:text-sm transition flex items-center gap-1.5 shadow-md shadow-emerald-700/20 cursor-pointer"
            title="طباعة فورية للمستند"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة فورية</span>
          </button>

          <button
            onClick={handleSavePdf}
            disabled={isExportingPdf}
            className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black px-3.5 py-1.5 rounded-lg text-xs sm:text-sm transition flex items-center gap-1.5 shadow-md shadow-red-700/20 cursor-pointer disabled:opacity-50"
            title="حفظ بصيغة PDF عالية الدقة"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingPdf ? 'جاري التحميل...' : 'حفظ PDF'}</span>
          </button>

          <button
            onClick={handleCopySummary}
            className="bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-slate-200 font-bold px-2.5 py-1.5 rounded-lg text-xs transition flex items-center gap-1 cursor-pointer"
            title="نسخ ملخص المستند"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isCopied ? 'تم النسخ' : 'نسخ'}</span>
          </button>

          <button
            onClick={handleClose}
            className="bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs sm:text-sm transition flex items-center gap-1 cursor-pointer"
            title="إغلاق المعاينة"
          >
            <X className="w-4 h-4" />
            <span>إغلاق</span>
          </button>
        </div>
      </div>

      {/* 📄 Scrollable Canvas / Sheet Container */}
      <div className="flex-1 overflow-auto p-3 sm:p-6 flex justify-center items-start bg-slate-900/60">
        <div
          id="rakeeza-universal-print-container"
          ref={printSheetRef}
          style={sheetWidthClass}
          className="bg-white text-slate-900 p-3 sm:p-4 shadow-2xl border border-slate-300 rounded-sm font-sans flex flex-col justify-between"
        >
          {/* Top Half of Sheet */}
          <div>
            {/* 1. Header (Company Info & Timestamp) */}
            <table className="w-full border-collapse mb-2">
              <tbody>
                <tr>
                  <td className="align-top text-right" style={{ width: '55%' }}>
                    <div className="text-base sm:text-lg font-black text-slate-950 leading-tight">
                      {companyName}
                    </div>
                    <div className="text-xs font-bold text-slate-600 mt-0.5">
                      {branchName}
                    </div>
                  </td>

                  {logoUrl && (
                    <td className="align-middle text-center" style={{ width: '15%' }}>
                      <img
                        src={logoUrl}
                        alt="Logo"
                        className="max-h-12 max-w-[90px] object-contain inline-block"
                      />
                    </td>
                  )}

                  <td className="align-top text-left" style={{ width: logoUrl ? '30%' : '45%' }}>
                    <div className="text-[10px] sm:text-[11px] font-bold text-slate-700 leading-snug">
                      <div>كود المؤسسة: [{companyCode}]</div>
                      <div>تاريخ الطباعة: {printDate} {printTime}</div>
                      {finalPhones.length > 1 && (
                        <div>هاتف: {finalPhones.slice(0, 2).join(' - ')}</div>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 2. Meta Table (.meta-table) */}
            {renderInteractiveMetaTable(
              activePayload,
              docSerial,
              printDate,
              approver,
              companyCode
            )}

            {/* 3. Document-Specific Body */}
            {renderInteractiveBody(activePayload, currencySymbol)}

            {/* 4. Summaries Section (Green card for count, Red card for total) */}
            {renderInteractiveSummaries(activePayload, currencySymbol, tafqeetText)}
          </div>

          {/* Bottom Half: Signatures & Legal Verification */}
          <div className="mt-3">
            <div className="border-t border-dashed border-slate-400 my-2 pt-2">
              <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-bold text-slate-800">
                <div className="flex flex-col gap-0.5 text-center">
                  <span>المحاسب / مدخل البيانات:</span>
                  <span className="text-slate-400 font-mono tracking-widest">...........................</span>
                </div>
                <div className="flex flex-col gap-0.5 text-center">
                  <span>المراجعة والتدقيق الداخلي:</span>
                  <span className="text-slate-400 font-mono tracking-widest">...........................</span>
                </div>
                <div className="flex flex-col gap-0.5 text-center">
                  <span>يعتمد / المدير المالي:</span>
                  <span className="text-slate-400 font-mono tracking-widest">...........................</span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-1 text-center text-[9px] text-slate-500 font-medium">
              <div>
                {activePayload.footerTermsNote ||
                  '* تطابق هذه المستندات الأرصدة والبيانات مع السجلات الرسمية بالنظام | صفحة 1 من 1'}
              </div>
              <div className="text-[8px] text-slate-400 mt-0.5">
                حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت 01029190615
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper: dynamic style dimensions
function getSheetWidthStyle(size: UniversalPaperSize): React.CSSProperties {
  switch (size) {
    case 'a5-portrait':
      return { width: '100%', maxWidth: '148mm', minHeight: '205mm' };
    case 'a5-landscape':
      return { width: '100%', maxWidth: '210mm', minHeight: '144mm' };
    case 'a4-portrait':
      return { width: '100%', maxWidth: '210mm', minHeight: '290mm' };
    case 'a4-landscape':
      return { width: '100%', maxWidth: '297mm', minHeight: '205mm' };
    case 'a3-landscape':
      return { width: '100%', maxWidth: '420mm', minHeight: '290mm' };
    case 'thermal-80':
      return { width: '100%', maxWidth: '80mm', minHeight: 'auto' };
    case 'thermal-58':
      return { width: '100%', maxWidth: '58mm', minHeight: 'auto' };
    default:
      return { width: '100%', maxWidth: '148mm', minHeight: '205mm' };
  }
}

function renderInteractiveMetaTable(
  payload: UniversalPrintPayload,
  docSerial: string,
  printDate: string,
  approver: string,
  companyCode: string
) {
  const periodStr =
    payload.period?.from && payload.period?.to
      ? ` (الفترة: ${payload.period.from} إلى ${payload.period.to})`
      : '';
  const docTitleFull = `${payload.title}${periodStr} ${docSerial}`;
  const movementDate = payload.date || printDate;
  const branchText = `${payload.branch || 'الفرع الرئيسي'} (كود: ${companyCode})`;

  const partyLabel = payload.partyLabel || 'الحساب / الطرف';
  const partyInfo = payload.partyName
    ? `${payload.partyName} ${payload.partyCode ? `[${payload.partyCode}]` : ''} ${
        payload.partyPhone && payload.partyPhone !== '-' ? `(هاتف: ${payload.partyPhone})` : ''
      }`
    : '';

  const statementOrNotes = payload.statementOrReason || payload.notes || `المسؤول: ${approver}`;

  return (
    <table className="w-full border-collapse mb-2 border border-slate-400 text-xs text-slate-800">
      <tbody>
        <tr>
          <td className="bg-slate-100 font-bold border border-slate-300 p-1.5 text-center whitespace-nowrap w-[18%]">
            نوع الحركة / التقرير
          </td>
          <td className="border border-slate-300 p-1.5 font-black text-slate-950 w-[32%]">
            {docTitleFull}
          </td>
          <td className="bg-slate-100 font-bold border border-slate-300 p-1.5 text-center whitespace-nowrap w-[18%]">
            تاريخ الحركة
          </td>
          <td className="border border-slate-300 p-1.5 font-bold w-[32%]">
            {movementDate}
          </td>
        </tr>
        <tr>
          <td className="bg-slate-100 font-bold border border-slate-300 p-1.5 text-center whitespace-nowrap">
            الفرع / النطاق
          </td>
          <td className="border border-slate-300 p-1.5 font-medium">
            {branchText}
          </td>
          <td className="bg-slate-100 font-bold border border-slate-300 p-1.5 text-center whitespace-nowrap">
            مسؤول الاعتماد
          </td>
          <td className="border border-slate-300 p-1.5 font-bold">
            {approver}
          </td>
        </tr>
        {partyInfo ? (
          <tr>
            <td className="bg-slate-100 font-bold border border-slate-300 p-1.5 text-center whitespace-nowrap">
              {partyLabel}
            </td>
            <td className="border border-slate-300 p-1.5 font-black text-slate-900">
              {partyInfo}
            </td>
            <td className="bg-slate-100 font-bold border border-slate-300 p-1.5 text-center whitespace-nowrap">
              وسيلة السداد
            </td>
            <td className="border border-slate-300 p-1.5 font-bold">
              {payload.paymentMethod || 'نقداً'}
            </td>
          </tr>
        ) : null}
        <tr>
          <td className="bg-slate-100 font-bold border border-slate-300 p-1.5 text-center whitespace-nowrap">
            البيان / ملاحظات
          </td>
          <td colSpan={3} className="border border-slate-300 p-1.5 font-medium">
            {statementOrNotes}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function renderInteractiveBody(payload: UniversalPrintPayload, curSymbol: string) {
  const kind = payload.kind;

  // 1. Voucher Layout
  if (kind === 'receipt_voucher' || kind === 'payment_voucher') {
    const isReceipt = kind === 'receipt_voucher';
    const actionText = isReceipt ? 'استلمنا من السيد / السادة:' : 'اصرفوا إلى السيد / السادة:';
    const forText = 'وذلك عن:';
    const amountVal = payload.amount !== undefined ? Number(payload.amount).toFixed(2) : '0.00';
    const partyName = payload.partyName || 'طرف نقدي عام';

    return (
      <div className="border border-slate-400 bg-white p-2.5 mb-2 rounded-xs">
        <div className="flex justify-between items-center border-b border-dashed border-slate-300 pb-2 mb-2">
          <span className="font-bold text-slate-700 text-xs sm:text-sm">
            {actionText}{' '}
            <strong className="text-slate-950 text-sm sm:text-base font-black">{partyName}</strong>
          </span>
          <span
            className={`font-black text-sm sm:text-base border-2 px-3 py-0.5 rounded-xs ${
              isReceipt
                ? 'border-emerald-600 text-emerald-800 bg-emerald-50'
                : 'border-red-600 text-red-800 bg-red-50'
            }`}
          >
            {amountVal} {curSymbol}
          </span>
        </div>

        <div className="space-y-1 mb-2 text-xs leading-relaxed">
          <div>
            <strong className="text-slate-800">مبلغاً وقدره: </strong>
            <span className="font-bold text-slate-950">{payload.amountInWords || ''}</span>
          </div>
          <div>
            <strong className="text-slate-800">{forText} </strong>
            <span className="text-slate-700">
              {payload.statementOrReason || payload.notes || 'سداد معتمد بالنظام'}
            </span>
          </div>
        </div>

        <table className="w-full border-collapse text-[11px] bg-slate-50 border border-slate-300">
          <tbody>
            <tr>
              <td className="p-1 border border-slate-300 font-bold w-1/4">طريقة السداد:</td>
              <td className="p-1 border border-slate-300 w-1/4 font-semibold">
                {payload.paymentMethod || 'نقداً'}
              </td>
              <td className="p-1 border border-slate-300 font-bold w-1/4">الخزينة / الحساب:</td>
              <td className="p-1 border border-slate-300 w-1/4 font-semibold">
                {payload.treasuryOrBank || 'الخزينة الرئيسية'}
              </td>
            </tr>
            {payload.referenceNumber && (
              <tr>
                <td className="p-1 border border-slate-300 font-bold">رقم المرجع / الشيك:</td>
                <td colSpan={3} className="p-1 border border-slate-300">
                  {payload.referenceNumber}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // 2. Custom Columns / Rows
  if (payload.columns && payload.rows) {
    if (payload.rows.length === 0) {
      return (
        <table className="w-full border-collapse mb-2 border border-slate-400 text-xs">
          <thead>
            <tr className="bg-slate-100">
              {payload.columns.map((c, idx) => (
                <th key={idx} className="border border-slate-400 p-1.5 font-black text-slate-900 text-center">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan={Math.max(1, payload.columns.length)}
                className="text-center text-slate-500 py-3 border border-slate-300"
              >
                لا توجد بيانات متاحة لهذا المستند
              </td>
            </tr>
          </tbody>
        </table>
      );
    }

    return (
      <table className="w-full border-collapse mb-2 border border-slate-400 text-xs">
        <thead>
          <tr className="bg-slate-100">
            {payload.columns.map((c, idx) => (
              <th key={idx} className="border border-slate-400 p-1 font-black text-slate-900 text-center whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payload.rows.map((row, rIdx) => (
            <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
              {row.map((cell, cIdx) => {
                const isNum = typeof cell === 'number';
                return (
                  <td
                    key={cIdx}
                    className={`border border-slate-300 p-1 text-[11px] ${
                      isNum ? 'text-center font-bold' : cIdx === 0 ? 'text-center' : 'text-right'
                    }`}
                  >
                    {cell !== null && cell !== undefined ? cell : '-'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // 3. Items list (Invoice / Return)
  if (payload.items && payload.items.length > 0) {
    const isReturn = kind.includes('return');
    const qtyHeader = isReturn ? 'الكمية المرتجعة' : 'العدد';

    return (
      <table className="w-full border-collapse mb-2 border border-slate-400 text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 p-1 font-black text-slate-900 text-center w-[6%]">م</th>
            <th className="border border-slate-400 p-1 font-black text-slate-900 text-center w-[16%]">كود الصنف</th>
            <th className="border border-slate-400 p-1 font-black text-slate-900 text-right w-[34%]">اسم الصنف</th>
            <th className="border border-slate-400 p-1 font-black text-slate-900 text-center w-[10%]">الوحدة</th>
            <th className="border border-slate-400 p-1 font-black text-slate-900 text-center w-[10%]">{qtyHeader}</th>
            <th className="border border-slate-400 p-1 font-black text-slate-900 text-center w-[12%]">السعر</th>
            <th className="border border-slate-400 p-1 font-black text-slate-900 text-center w-[12%]">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {payload.items.map((it, idx) => (
            <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
              <td className="border border-slate-300 p-1 text-center font-medium text-[11px]">
                {it.index ?? idx + 1}
              </td>
              <td className="border border-slate-300 p-1 text-center font-mono text-[10px] text-slate-700">
                {it.code || '-'}
              </td>
              <td className="border border-slate-300 p-1 text-right font-black text-slate-950 text-[11px]">
                {it.name}
              </td>
              <td className="border border-slate-300 p-1 text-center text-slate-700 text-[11px]">
                {it.unit || 'قطعة'}
              </td>
              <td className="border border-slate-300 p-1 text-center font-black text-slate-900 text-[11px]">
                {it.qty}
              </td>
              <td className="border border-slate-300 p-1 text-center text-[11px] font-semibold">
                {Number(it.price).toFixed(2)}
              </td>
              <td className="border border-slate-300 p-1 text-center font-black text-slate-950 text-[11px]">
                {Number(it.total).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Fallback empty table
  return (
    <table className="w-full border-collapse mb-2 border border-slate-400 text-xs">
      <thead>
        <tr className="bg-slate-100">
          <th className="border border-slate-400 p-1.5 font-black text-slate-900 text-center">م</th>
          <th className="border border-slate-400 p-1.5 font-black text-slate-900 text-right">البيان</th>
          <th className="border border-slate-400 p-1.5 font-black text-slate-900 text-center">المبلغ ({curSymbol})</th>
          <th className="border border-slate-400 p-1.5 font-black text-slate-900 text-center">ملاحظات</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td colSpan={4} className="text-center text-slate-500 py-3 border border-slate-300">
            لا توجد بيانات متاحة لهذا المستند
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function renderInteractiveSummaries(
  payload: UniversalPrintPayload,
  curSymbol: string,
  tafqeetText: string
) {
  const summaries = payload.summaries || [];
  const finalSummaries: UniversalPrintSummaryItem[] =
    summaries.length > 0
      ? summaries
      : [
          {
            label: 'عدد السجلات',
            value: `${payload.items?.length || payload.rows?.length || 0} حركة`,
            color: '#16a34a',
          },
          {
            label: 'إجمالي القيمة',
            value: `${(payload.amount || 0).toFixed(2)} ${curSymbol}`,
            isHighlight: true,
            isTotal: true,
            color: '#dc2626',
          },
        ];

  return (
    <div className="space-y-1 mb-2">
      <div className="flex flex-wrap items-center gap-2">
        {finalSummaries.map((s, idx) => {
          const isGreen = s.color === '#16a34a' || s.label.includes('عدد');
          const isRed =
            s.color === '#dc2626' ||
            s.isHighlight ||
            s.isTotal ||
            s.label.includes('إجمالي') ||
            s.label.includes('المطلوب');

          return (
            <div
              key={idx}
              className={`px-3 py-1 rounded-xs font-black text-xs sm:text-sm bg-white min-w-[130px] text-center border-2 ${
                isGreen
                  ? 'border-emerald-600 text-emerald-950'
                  : isRed
                  ? 'border-red-600 text-red-950'
                  : 'border-slate-400 text-slate-800'
              }`}
            >
              <span>{s.label}: </span>
              <span>{s.value}</span>
            </div>
          );
        })}
      </div>

      {tafqeetText && (
        <div className="text-[11px] font-bold text-slate-900 bg-slate-50 p-1.5 border-r-4 border-emerald-600 rounded-xs">
          <strong>المبلغ كتابة وتفقيطاً: </strong>
          <span>{tafqeetText}</span>
        </div>
      )}
    </div>
  );
}

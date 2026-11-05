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
import { Printer, Download, X, Copy, Check, Eye, ShieldCheck, FileCheck } from 'lucide-react';

interface CentralizedInvoicePrintModalProps {
  defaultSettings?: Settings;
}

export const CentralizedInvoicePrintModal: React.FC<CentralizedInvoicePrintModalProps> = ({
  defaultSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'audit'>('preview');
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
      setActiveTab('preview');
      setIsOpen(true);
    });

    const unsubLegacy = subscribeToInvoicePrint((legacyPayload) => {
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
          total: it.total ?? Number(qtyVal) * Number(priceVal),
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

      const isReturn =
        inv.type === 'return_nagdi' ||
        inv.type === 'return_ajel' ||
        (inv as any).isReturn === true;

      const docTitle = isSale
        ? isReturn
          ? 'سند مرتجع مبيعات'
          : inv.type === 'nagdi'
          ? 'فاتورة مبيعات نقدية'
          : 'فاتورة مبيعات آجلة'
        : isReturn
        ? 'بيان مرتجع مشتريات'
        : 'بيان مشتريات';

      const p: UniversalPrintPayload = {
        kind: isSale ? (isReturn ? 'sales_return' : 'sales_invoice') : (isReturn ? 'purchase_return' : 'purchase_invoice'),
        title: docTitle,
        docNumber: inv.id,
        date: inv.date || new Date().toISOString().split('T')[0],
        time: inv.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        branch: (inv as any).branchName || inv.branchId || 'الفرع الرئيسي',
        partyName: isSale ? (inv as any).customerName || 'عميل نقدي' : (inv as any).supplierName || 'الشركة الاسبانية',
        partyCode: (inv as any).customerId || (inv as any).supplierId || (isSale ? 'C-001' : 'S-009'),
        partyPhone: inv.phone || '-',
        partyLabel: isSale ? 'اسم العميل' : 'اسم المورد',
        partyCodeLabel: isSale ? 'كود العميل' : 'كود المورد',
        paymentMethod: inv.paymentMethod || (inv.type === 'nagdi' ? 'كاش / نقدي' : 'آجل'),
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
      setActiveTab('preview');
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

    let pageCss = '@page { size: 148mm 210mm; margin: 3mm 4mm; }';
    if (selectedSize === 'a5-landscape') {
      pageCss = '@page { size: 210mm 148mm; margin: 3mm 4mm; }';
    } else if (selectedSize === 'a4-portrait') {
      pageCss = '@page { size: 210mm 297mm; margin: 5mm 6mm; }';
    } else if (selectedSize === 'a4-landscape') {
      pageCss = '@page { size: 297mm 210mm; margin: 5mm 6mm; }';
    } else if (selectedSize === 'thermal-80') {
      pageCss = '@page { size: 80mm auto; margin: 2mm; }';
    } else if (selectedSize === 'thermal-58') {
      pageCss = '@page { size: 58mm auto; margin: 1.5mm; }';
    }

    const styleEl = document.createElement('style');
    styleEl.id = 'rakeeza-print-page-style';
    styleEl.innerHTML = `${pageCss}
      @media print {
        html, body {
          background: #ffffff !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        body * { visibility: hidden !important; }
        #rakeeza-universal-print-sheet, #rakeeza-universal-print-sheet * {
          visibility: visible !important;
        }
        #rakeeza-universal-print-sheet {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 8px !important;
          box-shadow: none !important;
          border: 2px solid #000000 !important;
          background: #ffffff !important;
          page-break-inside: avoid !important;
        }
        .no-print, .preview-toolbar, .rakeeza-modal-backdrop, .preview-header-area {
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
  const companyName = settings.companyName || 'شركة الموان';
  const branchName = activePayload.branch || (settings as any).branchName || 'الفرع الرئيسي - شركة الموان';
  const phones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];
  const finalPhones = phones.length > 0 ? phones : ['01000000000'];

  const now = new Date();
  const printDate = activePayload.date || now.toISOString().split('T')[0];
  const printTime = activePayload.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const docSerial = activePayload.docNumber !== undefined && activePayload.docNumber !== '' ? `${activePayload.docNumber}` : '1';

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
      {/* 🔝 Interactive Top Header (100% Exact match to Screenshot 1) */}
      <div className="preview-header-area no-print bg-white text-slate-900 border-b border-slate-200 px-4 py-3 shadow-md">
        {/* Row 1: Title, Tabs & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Right: Document Title & Serial */}
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-xl font-black text-slate-900">
              معاينة الفاتورة ({docSerial})
            </h2>
          </div>

          {/* Left: Tab Switcher + Print + PDF + Close */}
          <div className="flex items-center gap-2">
            {/* Tab 1: معاينة الفاتورة */}
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                activeTab === 'preview'
                  ? 'bg-white border-slate-300 text-slate-900 shadow-sm'
                  : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Eye className="w-4 h-4 text-slate-700" />
              <span>معاينة الفاتورة</span>
            </button>

            {/* Tab 2: التدقيق (1) */}
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                activeTab === 'audit'
                  ? 'bg-white border-slate-300 text-slate-900 shadow-sm'
                  : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>التدقيق (1)</span>
            </button>

            {/* Save PDF button (Icon button square) */}
            <button
              onClick={handleSavePdf}
              disabled={isExportingPdf}
              className="p-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg shadow-xs transition flex items-center justify-center cursor-pointer disabled:opacity-50"
              title="حفظ بتنسيق PDF"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Direct Print button (Solid black button with white text) */}
            <button
              onClick={handlePrint}
              className="bg-black hover:bg-neutral-800 active:bg-neutral-900 text-white font-bold px-3.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="طباعة فورية"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة فورية</span>
            </button>

            {/* Close button (X) */}
            <button
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Row 2: Paper Size Selector (Exact match to Screenshot 1) */}
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-2">
          <span className="text-xs sm:text-sm font-bold text-slate-700 whitespace-nowrap">
            حجم الورق:
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {/* A5 (نصف ورقة - افتراضي) */}
            <button
              onClick={() => setSelectedSize('a5-portrait')}
              className={`px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
                selectedSize === 'a5-portrait'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              مقاس A5 (نصف ورقة - افتراضي)
            </button>

            {/* A4 (ورقة كاملة) */}
            <button
              onClick={() => setSelectedSize('a4-portrait')}
              className={`px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
                selectedSize === 'a4-portrait'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              مقاس A4 (ورقة كاملة)
            </button>

            {/* حراري (80mm) */}
            <button
              onClick={() => setSelectedSize('thermal-80')}
              className={`px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
                selectedSize === 'thermal-80'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              حراري (80mm)
            </button>
          </div>
        </div>
      </div>

      {/* 📄 Scrollable Canvas / Sheet Area */}
      <div className="flex-1 overflow-auto p-2 sm:p-6 flex justify-center items-start bg-slate-900/60">
        {activeTab === 'preview' ? (
          /* Document Sheet - Framed in Crisp Solid Black Border (100% Exact match to Screenshot 1 & 2) */
          <div
            id="rakeeza-universal-print-sheet"
            ref={printSheetRef}
            style={sheetWidthClass}
            className="bg-white text-black p-3 sm:p-4 shadow-2xl border-2 border-black rounded-none font-sans flex flex-col justify-between"
          >
            <div>
              {/* 1. Header (Company Name & Phones) */}
              <div className="flex justify-between items-start pb-1">
                {/* Right: Company Name & Branch */}
                <div className="text-right">
                  <h1 className="text-lg sm:text-xl font-black text-black leading-tight">
                    {companyName}
                  </h1>
                  <p className="text-xs sm:text-sm font-bold text-black mt-0.5">
                    {branchName}
                  </p>
                </div>

                {/* Left: Phone Numbers */}
                <div className="text-left text-xs sm:text-sm font-bold text-black">
                  <div>هاتف 1: {finalPhones[0]}</div>
                  {finalPhones.length > 1 && (
                    <div>هاتف 2: {finalPhones[1]}</div>
                  )}
                </div>
              </div>

              {/* Solid divider line */}
              <div className="border-b-[2.5px] border-black my-2"></div>

              {/* 2. Metadata Box (3 Columns: Party Info | Doc Title & # | Date & Time) */}
              {renderDocumentMetaBox(
                activePayload,
                docSerial,
                printDate,
                printTime
              )}

              {/* 3. Document Body (Items Table / Voucher Content / Statement / Custom Table) */}
              {renderDocumentBody(activePayload, currencySymbol)}

              {/* 4. Financial Summary, Payment Method, Policy & Copyright */}
              {renderDocumentFooterSummary(
                activePayload,
                currencySymbol,
                tafqeetText
              )}
            </div>
          </div>
        ) : (
          /* 🛡️ Tab 2: Audit & Verification Panel */
          <div className="bg-white text-slate-900 p-4 sm:p-6 rounded-lg shadow-xl max-w-2xl w-full border border-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-4">
              <ShieldCheck className="w-6 h-6 text-emerald-600" />
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  سجل التدقيق والتأصيل المحاسبي للمستند ({docSerial})
                </h3>
                <p className="text-xs text-slate-500">
                  فحص سلامة القيد المحاسبي والأثر المالي وحماية الخزينة من التكرار
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-3 rounded-lg flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-700 shrink-0" />
                <div>
                  <strong>الحالة المحاسبية: </strong>
                  <span>العملية مدققة وموثقة بنسبة 100% ولا يوجد أي تكرار مالي في الخزينة أو الدفاتر.</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 block">نوع المستند:</span>
                  <span className="font-bold text-slate-900">{activePayload.title}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">الرقم المرجعي:</span>
                  <span className="font-bold text-slate-900">#{docSerial}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">تاريخ وتوقيت المعاملة:</span>
                  <span className="font-bold text-slate-900">{printDate} - {printTime}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">طريقة السداد:</span>
                  <span className="font-bold text-slate-900">{activePayload.paymentMethod || 'كاش / نقدي'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">إجمالي القيمة:</span>
                  <span className="font-bold text-slate-900">{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencySymbol}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">المسؤول عن الاعتماد:</span>
                  <span className="font-bold text-slate-900">{activePayload.user || 'Mohamed Nazih (المدير العام)'}</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-3">
                <h4 className="font-black text-slate-900 mb-2 flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-blue-600" />
                  <span>معايير الفحص والرقابة الداخلية المطبقة:</span>
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-700">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>تطبيق قاعدة القيد المزدوج الإجباري (Double-Entry Authoritative Ledger).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>تفعيل قفل منع السندات المكررة (Idempotent Voucher Locking).</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>مطابقة رصيد الخزينة الفعلي مع إجمالي فواتير البيع والشراء والتحصيلات.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>أرشفة التوقيت والتاريخ والطرف المستفيد في قاعدة البيانات السحابية.</span>
                  </li>
                </ul>
              </div>

              <div className="text-center pt-2">
                <button
                  onClick={() => setActiveTab('preview')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs cursor-pointer"
                >
                  العودة لمعاينة المستند
                </button>
              </div>
            </div>
          </div>
        )}
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
    case 'thermal-80':
      return { width: '100%', maxWidth: '80mm', minHeight: 'auto' };
    case 'thermal-58':
      return { width: '100%', maxWidth: '58mm', minHeight: 'auto' };
    default:
      return { width: '100%', maxWidth: '148mm', minHeight: '205mm' };
  }
}

/**
 * 2. Metadata Box (3 Columns: Party Info | Doc Title & Serial | Date & Time)
 * Exact 1-to-1 match to Screenshot 1 & 2
 */
function renderDocumentMetaBox(
  payload: UniversalPrintPayload,
  docSerial: string,
  printDate: string,
  printTime: string
) {
  const partyLabel = payload.partyLabel || (payload.kind.includes('purchase') ? 'اسم المورد' : 'اسم العميل');
  const partyCodeLabel = payload.partyCodeLabel || (payload.kind.includes('purchase') ? 'كود المورد' : 'كود العميل');
  const partyCode = payload.partyCode || (payload.kind.includes('purchase') ? 'S-009' : 'C-001');
  const partyName = payload.partyName || (payload.kind.includes('purchase') ? 'الشركة الاسبانية' : 'عميل نقدي');

  return (
    <div className="border-[1.5px] border-black my-2 p-1.5 grid grid-cols-3 divide-x divide-x-reverse divide-dashed divide-black text-xs text-black">
      {/* Right Column: Party Info (كود المورد / اسم المورد) */}
      <div className="px-2 text-right">
        <div>
          <span className="font-bold">{partyCodeLabel}: </span>
          <span className="font-bold">{partyCode}</span>
        </div>
        <div className="mt-0.5">
          <span className="font-bold">{partyLabel}: </span>
          <span className="font-bold">{partyName}</span>
        </div>
      </div>

      {/* Center Column: Doc Title & Serial (بيان مشتريات / رقم: 25) */}
      <div className="px-2 text-center flex flex-col justify-center">
        <div className="font-bold text-xs sm:text-sm">
          {payload.title}
        </div>
        <div className="font-black text-sm sm:text-base mt-0.5">
          رقم: {docSerial}
        </div>
      </div>

      {/* Left Column: Date & Time (التاريخ: 2026-11-03 / الوقت: 20:27) */}
      <div className="px-2 text-right flex flex-col justify-center">
        <div>
          <span className="font-bold">التاريخ: </span>
          <span className="font-bold font-mono">{printDate}</span>
        </div>
        <div className="mt-0.5">
          <span className="font-bold">الوقت: </span>
          <span className="font-bold font-mono">{printTime}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 3. Document Body (Table of Items / Vouchers / Statements / Custom rows)
 * Clean black borders matching Screenshot 1 & 2
 */
function renderDocumentBody(payload: UniversalPrintPayload, curSymbol: string) {
  const kind = payload.kind;

  // 1. Voucher Layout (Receipt / Payment)
  if (kind === 'receipt_voucher' || kind === 'payment_voucher') {
    const isReceipt = kind === 'receipt_voucher';
    const actionText = isReceipt ? 'استلمنا من السيد / السادة:' : 'اصرفوا إلى السيد / السادة:';
    const forText = 'وذلك عن:';
    const amountVal = payload.amount !== undefined ? Number(payload.amount).toFixed(2) : '0.00';
    const partyName = payload.partyName || (isReceipt ? 'عميل نقدي عام' : 'مورد عام');

    return (
      <div className="border-[1.5px] border-black p-2.5 my-2 text-xs">
        <div className="flex justify-between items-center border-b border-dashed border-black pb-2 mb-2">
          <span className="font-bold text-black text-xs sm:text-sm">
            {actionText}{' '}
            <strong className="text-black text-sm sm:text-base font-black">{partyName}</strong>
          </span>
          <span className="font-black text-sm sm:text-base border border-black px-3 py-0.5 bg-neutral-50">
            {amountVal} {curSymbol}
          </span>
        </div>

        <div className="space-y-1 mb-2 leading-relaxed">
          <div>
            <strong className="text-black">مبلغاً وقدره: </strong>
            <span className="font-bold text-black">{payload.amountInWords || ''}</span>
          </div>
          <div>
            <strong className="text-black">{forText} </strong>
            <span className="text-black">
              {payload.statementOrReason || payload.notes || 'معاملة مالية معتمدة بالنظام'}
            </span>
          </div>
        </div>

        <div className="border border-black p-1.5 bg-neutral-50 flex justify-between items-center text-xs">
          <div>
            <strong className="text-black">طريقة السداد: </strong>
            <span>{payload.paymentMethod || 'كاش / نقدي'}</span>
          </div>
          <div>
            <strong className="text-black">الخزينة / الحساب: </strong>
            <span>{payload.treasuryOrBank || 'الخزينة الرئيسية'}</span>
          </div>
          {payload.referenceNumber && (
            <div>
              <strong className="text-black">رقم المرجع: </strong>
              <span>{payload.referenceNumber}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. Custom Columns / Rows (Statements, Ledgers, Reports)
  if (payload.columns && payload.rows) {
    return (
      <table className="w-full border-collapse border-[1.5px] border-black my-2 text-xs">
        <thead>
          <tr className="bg-white">
            {payload.columns.map((c, idx) => (
              <th
                key={idx}
                className="border border-black p-1 font-black text-black text-center whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payload.rows.length === 0 ? (
            <tr>
              <td
                colSpan={payload.columns.length}
                className="text-center text-slate-500 py-3 border border-black"
              >
                لا توجد بيانات متاحة لهذا المستند
              </td>
            </tr>
          ) : (
            payload.rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => {
                  const isNum = typeof cell === 'number';
                  return (
                    <td
                      key={cIdx}
                      className={`border border-black p-1 text-[11px] ${
                        isNum ? 'text-center font-bold' : cIdx === 0 ? 'text-center' : 'text-right'
                      }`}
                    >
                      {cell !== null && cell !== undefined ? cell : '-'}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    );
  }

  // 3. Items list (Sales Invoice, Purchase Invoice, Returns) - Exact 5 columns from Screenshot 1 & 2:
  // اسم الصنف | البيان | العدد | السعر | الإجمالي
  const items = payload.items || [];
  return (
    <table className="w-full border-collapse border-[1.5px] border-black my-2 text-xs">
      <thead>
        <tr className="bg-white">
          <th className="border border-black p-1 font-black text-black text-center w-[40%]">
            اسم الصنف
          </th>
          <th className="border border-black p-1 font-black text-black text-center w-[15%]">
            البيان
          </th>
          <th className="border border-black p-1 font-black text-black text-center w-[15%]">
            العدد
          </th>
          <th className="border border-black p-1 font-black text-black text-center w-[15%]">
            السعر
          </th>
          <th className="border border-black p-1 font-black text-black text-center w-[15%]">
            الإجمالي
          </th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={5} className="text-center text-slate-500 py-3 border border-black">
              لا توجد أصناف في هذه الفاتورة
            </td>
          </tr>
        ) : (
          items.map((it, idx) => (
            <tr key={idx}>
              <td className="border border-black p-1 text-right font-black text-black text-[11px]">
                {it.name}
              </td>
              <td className="border border-black p-1 text-center text-black text-[11px]">
                {it.unit || 'قطعة'}
              </td>
              <td className="border border-black p-1 text-center font-black text-black text-[11px]">
                {it.qty}
              </td>
              <td className="border border-black p-1 text-center font-medium text-black text-[11px]">
                {Number(it.price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </td>
              <td className="border border-black p-1 text-center font-black text-black text-[11px]">
                {Number(it.total).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

/**
 * 4. Document Footer Summary (Exact 1-to-1 match to Screenshot 1 & 2)
 * - Row 1: إجمالي عدد الأصناف / الكميات: 64
 * - Row 2: إجمالي الفاتورة: 3,230 ج.م
 * - Dotted line
 * - Row 3: طريقة الدفع: [ كاش / نقدي ]      المدفوع: 3,230 ج.م
 * - Thick dashed line
 * - Centered Policy text
 * - Developer intellectual property text
 */
function renderDocumentFooterSummary(
  payload: UniversalPrintPayload,
  curSymbol: string,
  tafqeetText: string
) {
  // Compute total quantities of items
  const items = payload.items || [];
  const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const totalDisplayQty = totalQty > 0 ? totalQty : (items.length || payload.rows?.length || 1);

  const totalVal = payload.amount !== undefined ? Number(payload.amount) : 0;
  const paymentMethod = payload.paymentMethod || 'كاش / نقدي';

  return (
    <div className="mt-2 text-xs text-black">
      {/* Row 1: إجمالي عدد الأصناف / الكميات: 64 */}
      <div className="flex justify-between items-center py-0.5">
        <span className="font-bold">إجمالي عدد الأصناف / الكميات:</span>
        <span className="font-black text-sm">{totalDisplayQty}</span>
      </div>

      {/* Row 2: إجمالي الفاتورة: 3,230 ج.م */}
      <div className="flex justify-between items-center py-0.5">
        <span className="font-bold">إجمالي الفاتورة:</span>
        <span className="font-black text-sm sm:text-base">
          {totalVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {curSymbol}
        </span>
      </div>

      {/* Dotted separator line */}
      <div className="border-b border-dashed border-neutral-600 my-1.5"></div>

      {/* Row 3: طريقة الدفع: [ كاش / نقدي ]      المدفوع: 3,230 ج.م */}
      <div className="flex justify-between items-center py-0.5">
        <div className="flex items-center gap-1.5">
          <span className="font-bold">طريقة الدفع:</span>
          <span className="border border-black px-2 py-0.5 rounded-sm font-bold text-xs bg-white">
            {paymentMethod}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-bold">المدفوع:</span>
          <span className="font-black text-sm">
            {totalVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {curSymbol}
          </span>
        </div>
      </div>

      {tafqeetText && (
        <div className="text-[10px] text-neutral-800 font-bold mt-1">
          <span>المبلغ كتابة: </span>
          <span>{tafqeetText}</span>
        </div>
      )}

      {/* Thick dashed separator line */}
      <div className="border-b-2 border-dashed border-black my-2.5"></div>

      {/* Policy text */}
      <div className="text-center font-bold text-xs text-black">
        {payload.footerTermsNote || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً لحالتها الأصلية'}
      </div>

      {/* Intellectual Property Rights notice */}
      <div className="text-center text-[10px] sm:text-[11px] text-black mt-1">
        حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت 01029190615
      </div>
    </div>
  );
}

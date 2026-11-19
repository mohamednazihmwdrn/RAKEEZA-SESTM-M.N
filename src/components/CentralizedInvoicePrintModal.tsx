import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from '../types';
import {
  UniversalPrintPayload,
  UniversalPaperSize,
  UniversalPrintItem,
  UniversalPrintSummaryItem,
  UniversalBatchSummary,
} from '../types/universalPrint';
import {
  subscribeToUniversalPrint,
  subscribeToInvoicePrint,
  resolveInvoiceFinancials,
} from '../services/centralizedPrintService';
import { exportElementToPdf } from '../utils/pdfExport';
import { tafqeetNumber } from '../utils/tafqeet';
import { Printer, Download, X, Check, Eye, ShieldCheck, FileCheck, Layers } from 'lucide-react';

interface CentralizedInvoicePrintModalProps {
  defaultSettings?: Settings;
}

const PAPER_SIZE_OPTIONS: Array<{
  id: UniversalPaperSize;
  label: string;
  shortLabel: string;
}> = [
  { id: 'a5-portrait', label: 'مقاس A5 (نصف ورقة - افتراضي)', shortLabel: 'مقاس A5' },
  { id: 'a4-portrait', label: 'مقاس A4 (ورقة كاملة)', shortLabel: 'مقاس A4' },
  { id: 'thermal-80', label: 'حراري (80mm)', shortLabel: 'حراري 80mm' },
];

function normalizePaperSizeOption(pref?: string): UniversalPaperSize {
  const p = (pref || '').toLowerCase();
  if (p.includes('a4')) return 'a4-portrait';
  if (p.includes('thermal') || p.includes('80') || p.includes('58')) return 'thermal-80';
  return 'a5-portrait';
}

function fmtSmart(n: number): string {
  const val = Number(n || 0);
  if (!Number.isFinite(val)) return '0';
  if (Math.abs(val - Math.round(val)) < 0.005) {
    return Math.round(val).toLocaleString('en-US');
  }
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const CentralizedInvoicePrintModal: React.FC<CentralizedInvoicePrintModalProps> = ({
  defaultSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'audit'>('preview');
  const [activePayload, setActivePayload] = useState<UniversalPrintPayload | null>(null);
  const [selectedSize, setSelectedSize] = useState<UniversalPaperSize>('a5-portrait');
  const [includeBatchSummary, setIncludeBatchSummary] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const printSheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubUniversal = subscribeToUniversalPrint((payload) => {
      setActivePayload(payload);
      setSelectedSize(normalizePaperSizeOption(payload.preferredPaperSize));
      setIncludeBatchSummary(!!payload.includeSummarySheet);
      setActiveTab('preview');
      setIsOpen(true);
    });

    const unsubLegacy = subscribeToInvoicePrint((legacyPayload) => {
      if (!legacyPayload || !legacyPayload.invoice) return;
      const inv = legacyPayload.invoice;
      const isSale = legacyPayload.isSales !== false;
      const fin = resolveInvoiceFinancials(inv);
      const curSymbol = legacyPayload.settings?.currencySymbol || defaultSettings?.currencySymbol || 'ج.م';
      const curName = curSymbol === 'ج.م' ? 'جنيه مصري' : curSymbol;

      const items: UniversalPrintItem[] = (inv.items || []).map((it, idx) => {
        const qtyVal = (it as any).quantity ?? (it as any).qty ?? 1;
        const priceVal = it.price ?? 0;
        const descVal = (it as any).spec || (it as any).notes || (it as any).description || (it as any).desc || '';
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
        { label: 'المجموع الفرعي', value: `${fmtSmart(fin.subtotalVal)} ${curSymbol}` },
      ];
      if (fin.discountVal > 0) summaries.push({ label: 'الخصم', value: `${fmtSmart(fin.discountVal)} ${curSymbol}` });
      if (fin.taxVal > 0) summaries.push({ label: 'الضريبة', value: `${fmtSmart(fin.taxVal)} ${curSymbol}` });
      if (fin.extraChargesVal > 0) summaries.push({ label: 'مصاريف إضافية', value: `${fmtSmart(fin.extraChargesVal)} ${curSymbol}` });
      summaries.push({
        label: 'الصافي المستحق',
        value: `${fmtSmart(fin.grandTotal)} ${curSymbol}`,
        isHighlight: true,
        isTotal: true,
      });
      summaries.push({ label: 'المدفوع', value: `${fmtSmart(fin.paidVal)} ${curSymbol}` });
      summaries.push({ label: 'المتبقي', value: `${fmtSmart(fin.remainingVal)} ${curSymbol}` });

      const prefSize = normalizePaperSizeOption(legacyPayload.preferredPaperSize);
      const isWholesale = (inv as any).salesType === 'wholesale' || (inv as any).purchaseType === 'wholesale';

      const docTitle = isSale
        ? fin.isReturn
          ? inv.type === 'return_nagdi'
            ? 'سند مرتجع مبيعات نقدي'
            : 'سند مرتجع مبيعات آجل'
          : isWholesale
          ? inv.type === 'ajel'
            ? 'فاتورة مبيعات جملة آجلة'
            : 'فاتورة مبيعات جملة نقدية'
          : inv.type === 'nagdi'
          ? 'فاتورة مبيعات نقدية'
          : 'فاتورة مبيعات آجلة'
        : fin.isReturn
        ? inv.type === 'return_nagdi'
          ? 'سند مرتجع مشتريات نقدي'
          : 'سند مرتجع مشتريات آجل'
        : isWholesale
        ? inv.type === 'ajel'
          ? 'فاتورة مشتريات جملة آجلة'
          : 'فاتورة مشتريات جملة نقدية'
        : inv.type === 'nagdi'
        ? 'فاتورة مشتريات نقدية'
        : 'فاتورة مشتريات آجلة';

      const partyName = isSale
        ? (inv as any).customerName || 'عميل نقدي'
        : (inv as any).supplierName || 'مورد عام';

      const p: UniversalPrintPayload = {
        kind: isSale
          ? fin.isReturn
            ? 'sales_return'
            : 'sales_invoice'
          : fin.isReturn
          ? 'purchase_return'
          : 'purchase_invoice',
        title: docTitle,
        docNumber: inv.id,
        date: inv.date || new Date().toISOString().split('T')[0],
        time: inv.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        branch: (inv as any).branchName || '',
        user: (inv as any).createdBy || (inv as any).cashierName || '',
        pricingTierLabel: isWholesale ? 'تسعيرة الجملة' : undefined,
        partyName,
        partyCode: (inv as any).customerCode || (inv as any).supplierCode || (inv as any).customerId || (inv as any).supplierId || '-',
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
        amountInWords: tafqeetNumber(fin.grandTotal, curName, 'قرش'),
        notes: inv.notes || '',
        authorizedBy: (inv as any).createdBy || (inv as any).cashierName || 'إدارة الحسابات',
        receivedBy: partyName,
        originalInvoiceNumber: (inv as any).originalInvoiceId,
        isFullReturn: (inv as any).returnKind === 'full',
        returnKindLabel:
          fin.isReturn && (inv as any).returnKind
            ? (inv as any).returnKind === 'full'
              ? 'مرتجع كلي'
              : 'مرتجع جزئي'
            : undefined,
        items,
        summaries,
        preferredPaperSize: prefSize,
        settings: legacyPayload.settings || defaultSettings,
        onClose: legacyPayload.onClose,
      };

      setActivePayload(p);
      setSelectedSize(prefSize);
      setIncludeBatchSummary(false);
      setActiveTab('preview');
      setIsOpen(true);
    });

    return () => {
      unsubUniversal();
      unsubLegacy();
    };
  }, [defaultSettings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    const handleAfterPrint = () => {
      const existingStyle = document.getElementById('rakeeza-print-page-style');
      if (existingStyle) existingStyle.remove();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('afterprint', handleAfterPrint);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('afterprint', handleAfterPrint);
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

  const handleSelectPaperSize = (size: UniversalPaperSize) => {
    setSelectedSize(size);
    try {
      const pref = size === 'a4-portrait' ? 'A4' : size === 'thermal-80' ? 'thermal' : 'A5';
      localStorage.setItem('sys_print_pref_size', pref);
    } catch {}
  };

  const handlePrint = () => {
    if (typeof window === 'undefined') return;

    const existingStyle = document.getElementById('rakeeza-print-page-style');
    if (existingStyle) existingStyle.remove();

    let pageCss = '@page { size: A5 portrait; margin: 4mm; }';
    let docSizeCss = `
      .rakeeza-print-doc-page {
        width: 100% !important;
        max-width: 140mm !important;
        padding: 2.5mm 3.5mm !important;
        font-size: 9.2pt !important;
      }
      .rakeeza-print-doc-page table {
        font-size: 8.8pt !important;
      }
      .rakeeza-print-doc-page th,
      .rakeeza-print-doc-page td {
        padding: 3px 4px !important;
      }
    `;

    if (selectedSize === 'a4-portrait') {
      pageCss = '@page { size: A4 portrait; margin: 6mm; }';
      docSizeCss = `
        .rakeeza-print-doc-page {
          width: 100% !important;
          max-width: 198mm !important;
          padding: 4mm 5mm !important;
          font-size: 10.5pt !important;
        }
        .rakeeza-print-doc-page table {
          font-size: 10pt !important;
        }
        .rakeeza-print-doc-page th,
        .rakeeza-print-doc-page td {
          padding: 5px 7px !important;
        }
      `;
    } else if (selectedSize === 'thermal-80') {
      pageCss = '@page { size: 80mm auto; margin: 2mm; }';
      docSizeCss = `
        .rakeeza-print-doc-page {
          width: 76mm !important;
          max-width: 76mm !important;
          margin: 0 auto !important;
          padding: 1.5mm 2mm !important;
          font-size: 8.5pt !important;
        }
        .rakeeza-print-doc-page table {
          font-size: 8pt !important;
        }
        .rakeeza-print-doc-page th,
        .rakeeza-print-doc-page td {
          padding: 2px 3px !important;
        }
      `;
    }

    const styleEl = document.createElement('style');
    styleEl.id = 'rakeeza-print-page-style';
    styleEl.innerHTML = `${pageCss}
      @media print {
        html, body {
          background: #ffffff !important;
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: auto !important;
          overflow: visible !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body > *:not(.rakeeza-print-modal-root) {
          display: none !important;
        }
        .rakeeza-print-modal-root {
          position: static !important;
          inset: auto !important;
          display: block !important;
          width: 100% !important;
          height: auto !important;
          background: #ffffff !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: visible !important;
        }
        .rakeeza-print-scroll-wrap {
          display: block !important;
          overflow: visible !important;
          padding: 0 !important;
          margin: 0 !important;
          background: #ffffff !important;
        }
        #rakeeza-universal-print-sheet,
        #rakeeza-batch-print-container {
          position: static !important;
          width: 100% !important;
          max-width: 100% !important;
          min-height: auto !important;
          margin: 0 auto !important;
          padding: 0 !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          background: #ffffff !important;
          gap: 0 !important;
        }
        .rakeeza-print-doc-page {
          position: static !important;
          min-height: auto !important;
          margin: 0 auto !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          background: #ffffff !important;
        }
        ${docSizeCss}
        .rakeeza-batch-page-break:not(:last-child) {
          page-break-after: always !important;
          break-after: page !important;
        }
        .rakeeza-print-doc-page table,
        #rakeeza-universal-print-sheet table {
          width: 100% !important;
          border-collapse: collapse !important;
        }
        .rakeeza-print-doc-page thead,
        #rakeeza-universal-print-sheet thead {
          display: table-header-group !important;
        }
        .rakeeza-print-doc-page tfoot,
        #rakeeza-universal-print-sheet tfoot {
          display: table-footer-group !important;
        }
        .rakeeza-print-doc-page tr,
        .rakeeza-print-doc-page .print-avoid-break,
        #rakeeza-universal-print-sheet tr,
        #rakeeza-universal-print-sheet .print-avoid-break {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .no-print, .preview-toolbar, .preview-header-area {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(styleEl);

    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handleSavePdf = async () => {
    if (!printSheetRef.current || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      // Allow a brief tick so print-layout tables become visible before html2canvas capture on mobile screens
      await new Promise((resolve) => setTimeout(resolve, 90));

      let format: 'a4' | 'a5' | 'thermal' = 'a5';
      if (selectedSize === 'a4-portrait' || selectedSize === 'a4-landscape') {
        format = 'a4';
      } else if (selectedSize === 'thermal-80' || selectedSize === 'thermal-58') {
        format = 'thermal';
      }

      const docTitle = activePayload?.title?.replace(/\s+/g, '_') || 'مستند';
      const docNum = activePayload?.docNumber ? `_${activePayload.docNumber}` : '';
      const filename = `${docTitle}${docNum}_${new Date().toISOString().split('T')[0]}.pdf`;

      await exportElementToPdf(printSheetRef.current, filename, {
        format,
        orientation: 'portrait',
        margin: format === 'thermal' ? 2 : 4,
        scale: 2,
      });
    } catch (e) {
      console.error('Error generating PDF:', e);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!isOpen || !activePayload || typeof document === 'undefined') {
    return null;
  }

  const settings: Settings = activePayload.settings || defaultSettings || ({} as Settings);
  const currencySymbol = settings.currencySymbol || 'ج.م';
  const currencyName = currencySymbol === 'ج.م' ? 'جنيه مصري' : currencySymbol;

  const isBatchMode = activePayload.kind === 'batch_invoices' && Array.isArray(activePayload.documents);
  const batchDocs = activePayload.documents || [];
  const docSerial =
    activePayload.docNumber !== undefined && activePayload.docNumber !== '' ? `${activePayload.docNumber}` : '1';
  const isThermal = selectedSize === 'thermal-80' || selectedSize === 'thermal-58';
  const sheetWidthStyle = getSheetWidthStyle(selectedSize);
  const totalAmount = activePayload.amount !== undefined ? Number(activePayload.amount) : 0;

  const selectedSizeMeta =
    PAPER_SIZE_OPTIONS.find((o) => o.id === selectedSize) || PAPER_SIZE_OPTIONS[0];

  const isInvoiceKind =
    activePayload.kind === 'sales_invoice' ||
    activePayload.kind === 'purchase_invoice' ||
    activePayload.kind === 'sales_return' ||
    activePayload.kind === 'purchase_return';

  const modalHeaderTitle = isBatchMode
    ? `معاينة وطباعة (${activePayload.title})`
    : isInvoiceKind
    ? `معاينة الفاتورة (${docSerial})`
    : `${activePayload.title} (${docSerial})`;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-slate-900/75 rakeeza-modal-backdrop rakeeza-print-modal-root overflow-x-hidden"
      dir="rtl"
    >
      {/* Top Bar matching Reference Screenshot */}
      <div className="preview-header-area no-print bg-white text-slate-900 border-b border-slate-200 px-3 sm:px-5 py-2.5 shadow-xs shrink-0">
        {/* Row 1: Title + Controls + Close */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate flex-1 min-w-0">
            {modalHeaderTitle}
          </h2>
          {isBatchMode && (
            <div className="flex items-center gap-1.5 shrink-0">
              {activePayload.batchSummary && (
                <button
                  type="button"
                  onClick={() => setIncludeBatchSummary((prev) => !prev)}
                  className={`w-10 h-10 rounded-xl text-xs font-semibold flex items-center justify-center transition cursor-pointer border ${
                    includeBatchSummary
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  }`}
                  title={includeBatchSummary ? 'إخفاء ورقة ملخص السجل' : 'تضمين ورقة ملخص السجل'}
                >
                  <FileCheck className="w-4 h-4 shrink-0" />
                </button>
              )}

              <button
                type="button"
                onClick={handleSavePdf}
                disabled={isExportingPdf}
                className="w-10 h-10 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition flex items-center justify-center cursor-pointer disabled:opacity-50 shrink-0"
                title="حفظ بتنسيق PDF"
                aria-label="حفظ PDF"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="min-h-[40px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                title="طباعة فورية لكافة الفواتير"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>طباعة فورية</span>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition cursor-pointer shrink-0"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Row 2 (Single Document Mode): [Preview / Audit] Toggle + PDF Icon + Print Button */}
        {!isBatchMode && (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>{isInvoiceKind ? 'معاينة الفاتورة' : 'معاينة المستند'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>التدقيق (1)</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSavePdf}
                disabled={isExportingPdf}
                className="w-10 h-10 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition flex items-center justify-center cursor-pointer disabled:opacity-50 shrink-0"
                title="حفظ بتنسيق PDF"
                aria-label="حفظ PDF"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="min-h-[40px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                title="طباعة الفاتورة"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>{isInvoiceKind ? 'طباعة الفاتورة' : 'طباعة'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Row 3: Exact 3-Option Paper Size Segmented Selector */}
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-600 shrink-0 leading-tight">
            حجم الورق:
          </span>
          <div className="flex-1 bg-slate-100 p-1 rounded-xl grid grid-cols-3 gap-1">
            {PAPER_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectPaperSize(opt.id)}
                className={`min-h-[38px] px-1.5 sm:px-2.5 py-1 rounded-lg text-[10.5px] sm:text-xs font-semibold leading-tight text-center transition cursor-pointer flex items-center justify-center ${
                  selectedSize === opt.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white/70'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable Preview Sheet Area (Zero Horizontal Overflow) */}
      <div className="rakeeza-print-scroll-wrap flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-5 flex justify-center items-start bg-slate-100">
        {activeTab === 'preview' ? (
          isBatchMode ? (
            <div
              id="rakeeza-batch-print-container"
              ref={printSheetRef}
              className="w-full flex flex-col items-center gap-4"
            >
              {batchDocs.map((docPayload, idx) => {
                const docSettings: Settings = docPayload.settings || settings;
                const docCur = docSettings.currencySymbol || currencySymbol;
                return (
                  <div
                    key={`${docPayload.docNumber || idx}-${idx}`}
                    style={sheetWidthStyle}
                    className={`rakeeza-print-doc-page rakeeza-batch-page-break bg-white text-slate-900 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between ${
                      isThermal ? 'p-2.5 text-[11px]' : 'p-3 sm:p-5 text-xs'
                    }`}
                  >
                    <InvoiceDocumentSheet
                      payload={docPayload}
                      settings={docSettings}
                      currencySymbol={docCur}
                      currencyName={docCur === 'ج.م' ? 'جنيه مصري' : docCur}
                      selectedSize={selectedSize}
                      isThermal={isThermal}
                      forcePrintTable={isExportingPdf}
                      batchPositionLabel={`مستند ${idx + 1} من ${batchDocs.length}`}
                    />
                  </div>
                );
              })}

              {includeBatchSummary && activePayload.batchSummary && (
                <div
                  style={sheetWidthStyle}
                  className={`rakeeza-print-doc-page rakeeza-batch-page-break bg-white text-slate-900 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between ${
                    isThermal ? 'p-2.5 text-[11px]' : 'p-3 sm:p-5 text-xs'
                  }`}
                >
                  <BatchSummaryDocumentSheet
                    summary={activePayload.batchSummary}
                    settings={settings}
                    currencySymbol={currencySymbol}
                    isThermal={isThermal}
                    forcePrintTable={isExportingPdf}
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              id="rakeeza-universal-print-sheet"
              ref={printSheetRef}
              style={sheetWidthStyle}
              className={`rakeeza-print-doc-page bg-white text-slate-900 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between ${
                isThermal ? 'p-2.5 text-[11px]' : 'p-3 sm:p-5 text-xs'
              }`}
            >
              <InvoiceDocumentSheet
                payload={activePayload}
                settings={settings}
                currencySymbol={currencySymbol}
                currencyName={currencyName}
                selectedSize={selectedSize}
                isThermal={isThermal}
                forcePrintTable={isExportingPdf}
              />
            </div>
          )
        ) : (
          /* Audit & Accounting Verification Tab */
          <div className="bg-white text-slate-900 p-4 sm:p-6 rounded-xl shadow-sm max-w-2xl w-full border border-slate-200">
            <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 mb-4">
              <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  {isBatchMode
                    ? `التدقيق والتوثيق المحاسبي للسجل (${batchDocs.length} مستند)`
                    : `التدقيق والتوثيق المحاسبي للمستند (${docSerial})`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  مراجعة القراءة المحاسبية دون أي تعديل على الأرصدة أو القيود المسجلة
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-lg flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-700 shrink-0" />
                <div>
                  <strong className="font-semibold">وضع القراءة الآمن: </strong>
                  <span>عملية المعاينة والطباعة لا تنشئ قيوداً مكررة ولا تؤثر على الخزينة أو المخزون.</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 text-xs block">نوع المستند:</span>
                  <span className="font-semibold text-slate-900">{activePayload.title}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">
                    {isBatchMode ? 'عدد المستندات:' : 'الرقم المرجعي:'}
                  </span>
                  <span className="font-semibold text-slate-900 financial-num">
                    {isBatchMode ? `${batchDocs.length} مستند` : `#${docSerial}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">التاريخ والوقت:</span>
                  <span className="font-medium text-slate-900 financial-num">
                    {activePayload.date || '-'} — {activePayload.time || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">طريقة السداد:</span>
                  <span className="font-medium text-slate-900">
                    {isBatchMode ? 'مستندات متتالية بفواصل صفحات' : activePayload.paymentMethod || 'نقدي'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">الصافي المستحق:</span>
                  <span className="font-bold text-slate-900 financial-num">
                    {fmtSmart(totalAmount)} {currencySymbol}
                  </span>
                </div>
                {!isBatchMode && (
                  <div>
                    <span className="text-slate-500 text-xs block">حالة السداد:</span>
                    <span className="font-medium text-slate-900">{activePayload.paymentStatus || 'معتمد'}</span>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg p-3.5">
                <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-blue-600" />
                  <span>ضوابط التحقق المطبقة:</span>
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-700">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-600 font-semibold">✓</span>
                    <span>البيانات مستخرجة مباشرة من السجل المحاسبي دون تعديل.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-600 font-semibold">✓</span>
                    <span>فصل بيانات العملاء عن الموردين ومنع تداخل الفئات المحاسبية.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-600 font-semibold">✓</span>
                    <span>توثيق المرتجعات النقدية والآجلة وربطها بالفاتورة الأصلية.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Bar matching Reference Screenshot */}
      <div className="no-print bg-white border-t border-slate-200 px-3 sm:px-5 py-2.5 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handlePrint}
          className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
        >
          <Printer className="w-4 h-4 shrink-0" />
          <span>
            {isInvoiceKind
              ? `طباعة الفاتورة الآن (${selectedSizeMeta.shortLabel})`
              : `طباعة المستند الآن (${selectedSizeMeta.shortLabel})`}
          </span>
        </button>

        <button
          type="button"
          onClick={handleSavePdf}
          disabled={isExportingPdf}
          className="w-11 h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center transition cursor-pointer disabled:opacity-50 shrink-0"
          title="حفظ PDF"
          aria-label="حفظ PDF"
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="min-h-[44px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm transition cursor-pointer shrink-0"
        >
          إغلاق
        </button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

interface InvoiceDocumentSheetProps {
  payload: UniversalPrintPayload;
  settings: Settings;
  currencySymbol: string;
  currencyName: string;
  selectedSize: UniversalPaperSize;
  isThermal: boolean;
  forcePrintTable?: boolean;
  batchPositionLabel?: string;
}

const InvoiceDocumentSheet: React.FC<InvoiceDocumentSheetProps> = ({
  payload,
  settings,
  currencySymbol,
  currencyName,
  selectedSize,
  isThermal,
  forcePrintTable = false,
  batchPositionLabel,
}) => {
  const companyName = settings.companyName || 'المنظومة المحاسبية';
  const companyAddress = settings.address || '';
  const companyTax = settings.taxNumber || '';
  const companyReg = settings.commercialReg || '';
  const companyLogo =
    settings.showLogoInPrint !== false ? (settings as any).logo || (settings as any).logoUrl || '' : '';
  const branchName = payload.branch || 'الفرع الرئيسي';
  const phones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];

  const now = new Date();
  const printDate = payload.date || now.toISOString().split('T')[0];
  const printTime = payload.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const docSerial = payload.docNumber !== undefined && payload.docNumber !== '' ? `${payload.docNumber}` : '1';
  const totalAmount = payload.amount !== undefined ? Number(payload.amount) : 0;
  const tafqeetText =
    payload.amountInWords || (totalAmount > 0 ? tafqeetNumber(totalAmount, currencyName, 'قرش') : '');

  const isA4 = selectedSize === 'a4-portrait' || selectedSize === 'a4-landscape';

  return (
    <div className="flex flex-col justify-between flex-1 w-full">
      <div className="w-full">
        {/* 1. Company Header: Right Name/Branch | Center Logo | Left Phones */}
        {isThermal ? (
          <div className="flex flex-col items-center text-center gap-1 pb-2 border-b border-dashed border-slate-400">
            {companyLogo && (
              <img
                src={companyLogo}
                alt={companyName}
                className="h-10 w-auto max-w-[72px] object-contain"
              />
            )}
            <h1 className="text-sm font-bold text-slate-900 leading-tight">{companyName}</h1>
            {branchName && <p className="text-[10.5px] text-slate-600">{branchName}</p>}
            {companyAddress && <p className="text-[10px] text-slate-500">{companyAddress}</p>}
            {phones.length > 0 && (
              <div className="text-[10px] text-slate-700 space-y-0.5 tabular-nums">
                {phones.map((ph, i) => (
                  <div key={i}>
                    <span>{phones.length > 1 ? `هاتف ${i + 1}: ` : 'هاتف: '}</span>
                    <span dir="ltr">{ph}</span>
                  </div>
                ))}
              </div>
            )}
            {batchPositionLabel && (
              <div className="text-[10px] text-slate-500 tabular-nums">{batchPositionLabel}</div>
            )}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-200">
            {/* Right: Company Name & Branch */}
            <div className="flex-1 min-w-0 text-right">
              <h1
                className={`${
                  isA4 ? 'text-base sm:text-lg' : 'text-[13px] sm:text-[15px]'
                } font-bold text-slate-900 leading-snug break-words`}
              >
                {companyName}
              </h1>
              {branchName && (
                <p className="text-[10.5px] sm:text-xs text-slate-500 mt-0.5">{branchName}</p>
              )}
              {isA4 && companyAddress && (
                <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">{companyAddress}</p>
              )}
              {isA4 && (companyTax || companyReg) && (
                <div className="flex flex-wrap gap-x-3 text-[10px] text-slate-500 mt-0.5">
                  {companyTax && <span>الضريبي: {companyTax}</span>}
                  {companyReg && <span>السجل: {companyReg}</span>}
                </div>
              )}
            </div>

            {/* Center: Company Logo */}
            {companyLogo && (
              <div className="shrink-0 flex items-center justify-center px-1">
                <img
                  src={companyLogo}
                  alt={companyName}
                  className={`${
                    isA4 ? 'h-12 sm:h-14 max-w-[90px]' : 'h-10 sm:h-12 max-w-[74px]'
                  } w-auto object-contain`}
                />
              </div>
            )}

            {/* Left: Phones */}
            <div className="shrink-0 text-left text-[10px] sm:text-[11px] text-slate-700 leading-snug tabular-nums space-y-0.5">
              {phones.map((ph, i) => (
                <div key={i}>
                  <span className="text-slate-500">{phones.length > 1 ? `هاتف ${i + 1}: ` : 'هاتف: '}</span>
                  <span dir="ltr" className="font-medium text-slate-900">
                    {ph}
                  </span>
                </div>
              ))}
              {batchPositionLabel && (
                <div className="text-[9.5px] text-slate-500 pt-0.5">{batchPositionLabel}</div>
              )}
            </div>
          </div>
        )}

        {/* 2. Metadata Grid (Strict 3 Columns on A5/A4 matching Screenshot) */}
        {renderDocumentMetaBox(payload, docSerial, printDate, printTime, isThermal)}

        {/* 3. Document Body Table */}
        {renderDocumentBody(payload, currencySymbol, isThermal, isA4, forcePrintTable)}
      </div>

      {/* 4. Totals, Payment & Copyright Footer */}
      {renderDocumentFooterSummary(payload, currencySymbol, tafqeetText, settings, isThermal, isA4)}
    </div>
  );
};

const BatchSummaryDocumentSheet: React.FC<{
  summary: UniversalBatchSummary;
  settings: Settings;
  currencySymbol: string;
  isThermal: boolean;
  forcePrintTable?: boolean;
}> = ({ summary, settings, isThermal, forcePrintTable = false }) => {
  const companyName = settings.companyName || 'المنظومة المحاسبية';
  const showMobileCards = !isThermal && !forcePrintTable && (summary.columns?.length || 0) >= 5;
  return (
    <div className="flex flex-col justify-between flex-1 w-full">
      <div>
        <div className="flex justify-between items-start gap-2 pb-2 border-b border-slate-300">
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-slate-900">{companyName}</h1>
            <p className="text-xs font-semibold text-slate-700 mt-0.5">{summary.title}</p>
            {summary.subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{summary.subtitle}</p>}
          </div>
          <div className="text-left text-[11px] text-slate-600 tabular-nums shrink-0">
            <div>تاريخ الطباعة: {new Date().toISOString().split('T')[0]}</div>
          </div>
        </div>

        <div className={`grid ${isThermal ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'} gap-1.5 my-2.5`}>
          {summary.kpis.map((k, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-1.5 bg-slate-50 text-center">
              <div className="text-[10px] text-slate-500">{k.title}</div>
              <div className="text-xs font-bold text-slate-900 mt-0.5 financial-num">{k.value}</div>
            </div>
          ))}
        </div>

        {summary.columns && summary.rows && (
          <>
            {showMobileCards && (
              <div className="block sm:hidden print:hidden space-y-2 my-2">
                {summary.rows.map((row, rIdx) => (
                  <div key={rIdx} className="border border-slate-200 rounded-lg p-2 bg-slate-50/60 space-y-1 text-[11px]">
                    {summary.columns!.map((col, cIdx) => (
                      <div key={cIdx} className="flex justify-between items-start gap-2 border-b last:border-b-0 border-slate-200/70 pb-1 last:pb-0">
                        <span className="text-slate-500 shrink-0">{col}:</span>
                        <span className="font-semibold text-slate-900 text-left break-words">
                          {row[cIdx] !== null && row[cIdx] !== undefined ? row[cIdx] : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className={`${showMobileCards ? 'hidden sm:block print:block' : 'block'} border border-slate-300 rounded-lg overflow-hidden my-2`}>
              <table className="w-full border-collapse text-[10px] sm:text-[11px]">
                <thead>
                  <tr className="bg-slate-100">
                    {summary.columns.map((c, idx) => (
                      <th key={idx} className="border-b border-l last:border-l-0 border-slate-200 px-1.5 py-1.5 font-semibold text-slate-800 text-center [word-break:normal] [overflow-wrap:normal] leading-snug">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.map((row, rIdx) => (
                    <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={`border-b border-l last:border-l-0 border-slate-200 px-1.5 py-1 text-center [word-break:normal] [overflow-wrap:break-word] ${
                            typeof cell === 'number' || cIdx >= 5 ? 'financial-num font-medium whitespace-nowrap' : ''
                          }`}
                        >
                          {cell !== null && cell !== undefined ? cell : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-dashed border-slate-300 mt-3 pt-2 text-center space-y-0.5">
        {summary.footerNotes?.map((n, i) => (
          <div key={i} className="text-[10px] text-slate-600">{n}</div>
        ))}
        <div className="text-[10px] text-slate-500">
          جميع حقوق الملكية محفوظة لمطور النظام Mohamed Nazih ت 01029190615
        </div>
      </div>
    </div>
  );
};

function getSheetWidthStyle(size: UniversalPaperSize): React.CSSProperties {
  switch (size) {
    case 'a4-portrait':
      return { width: '100%', maxWidth: '210mm' };
    case 'a4-landscape':
      return { width: '100%', maxWidth: '297mm' };
    case 'a5-landscape':
      return { width: '100%', maxWidth: '210mm' };
    case 'thermal-80':
      return { width: '100%', maxWidth: '80mm' };
    case 'thermal-58':
      return { width: '100%', maxWidth: '58mm' };
    case 'a5-portrait':
    default:
      return { width: '100%', maxWidth: '148mm' };
  }
}

function renderDocumentMetaBox(
  payload: UniversalPrintPayload,
  docSerial: string,
  printDate: string,
  printTime: string,
  isThermal: boolean
) {
  const isInvoiceKind =
    payload.kind === 'sales_invoice' ||
    payload.kind === 'purchase_invoice' ||
    payload.kind === 'sales_return' ||
    payload.kind === 'purchase_return';
  const isVoucherKind = payload.kind === 'receipt_voucher' || payload.kind === 'payment_voucher';
  const isStatementKind = payload.kind === 'account_statement';
  const isPurchaseDoc = payload.kind.includes('purchase');

  // Thermal 80mm compact metadata header
  if (isThermal) {
    return (
      <div className="border border-dashed border-slate-400 rounded p-1.5 my-1.5 text-[10.5px] bg-slate-50/40 text-center space-y-0.5 print-avoid-break">
        <div className="font-bold text-slate-900">
          {payload.title} · رقم: <span className="financial-num">{docSerial}</span>
        </div>
        {payload.originalInvoiceNumber !== undefined && payload.originalInvoiceNumber !== '' && (
          <div className="text-[10px] text-rose-700 font-semibold">
            مرجع الفاتورة الأصلية: #{payload.originalInvoiceNumber}
            {payload.returnKindLabel ? ` (${payload.returnKindLabel})` : ''}
          </div>
        )}
        {(isInvoiceKind || isVoucherKind || isStatementKind || payload.partyName) && (
          <div className="text-slate-800">
            <span className="text-slate-500">
              {payload.partyLabel || (isPurchaseDoc ? 'المورد' : isVoucherKind ? 'الجهة' : 'العميل')}:{' '}
            </span>
            <strong className="font-semibold">
              {payload.partyName || (isPurchaseDoc ? 'مورد عام' : isInvoiceKind ? 'عميل نقدي' : '-')}
            </strong>
          </div>
        )}
        {payload.partyPhone && payload.partyPhone !== '-' && (
          <div className="text-slate-700 financial-num">هاتف: {payload.partyPhone}</div>
        )}
        {payload.period && (payload.period.from || payload.period.to) && (
          <div className="text-[10px] text-slate-700 financial-num">
            الفترة: {payload.period.from || '-'} إلى {payload.period.to || '-'}
          </div>
        )}
        <div className="text-[10px] text-slate-600 financial-num">
          {printDate} · {printTime}
        </div>
      </div>
    );
  }

  // A. Sales / Purchase Invoices & Returns Metadata Box (Preserves exact 3-column invoice structure)
  if (isInvoiceKind) {
    const partyLabel = payload.partyLabel || (isPurchaseDoc ? 'اسم المورد' : 'اسم العميل');
    const partyCodeLabel = payload.partyCodeLabel || (isPurchaseDoc ? 'كود المورد' : 'كود العميل');
    const partyName = payload.partyName || (isPurchaseDoc ? 'مورد عام' : 'عميل نقدي');
    const partyCodeDisplay = payload.partyCode && payload.partyCode !== '-' ? payload.partyCode : '1';

    return (
      <div className="border border-slate-300 rounded-lg my-2 px-2 py-1.5 bg-slate-50/40 text-slate-900 print-avoid-break grid grid-cols-3 gap-1.5 items-center divide-x divide-x-reverse divide-slate-200 text-[10px] sm:text-xs">
        <div className="pl-1.5 text-right space-y-0.5 min-w-0">
          <div className="truncate">
            <span className="text-slate-500">{partyCodeLabel}: </span>
            <span className="font-semibold financial-num text-slate-900">{partyCodeDisplay}</span>
          </div>
          <div className="[word-break:normal] [overflow-wrap:break-word] leading-snug">
            <span className="text-slate-500">{partyLabel}: </span>
            <span className="font-semibold text-slate-900">{partyName}</span>
          </div>
          {payload.partyPhone && payload.partyPhone !== '-' && (
            <div className="truncate">
              <span className="text-slate-500">هاتف: </span>
              <span className="font-medium financial-num" dir="ltr">
                {payload.partyPhone}
              </span>
            </div>
          )}
        </div>

        <div className="px-1.5 text-center space-y-0.5 min-w-0">
          <div className="font-semibold text-slate-900 leading-tight [word-break:normal] [overflow-wrap:break-word]">
            {payload.title}
          </div>
          <div className="font-bold text-slate-900 financial-num">رقم: {docSerial}</div>
          {payload.paymentStatus && (
            <div className="pt-0.5">
              <span className="inline-block border border-slate-300 rounded px-2 py-0.5 text-[9.5px] font-semibold text-slate-700 bg-white">
                {payload.paymentStatus}
              </span>
            </div>
          )}
          {payload.originalInvoiceNumber !== undefined && payload.originalInvoiceNumber !== '' && (
            <div className="text-[9.5px] font-medium text-rose-700 financial-num leading-tight">
              أصل #{payload.originalInvoiceNumber}
              {payload.returnKindLabel ? ` · ${payload.returnKindLabel}` : ''}
            </div>
          )}
          {!payload.originalInvoiceNumber && payload.returnKindLabel && (
            <div className="text-[9.5px] font-medium text-rose-700 leading-tight">{payload.returnKindLabel}</div>
          )}
        </div>

        <div className="pr-1.5 text-left space-y-0.5 min-w-0">
          <div>
            <span className="text-slate-500">التاريخ: </span>
            <span className="font-semibold financial-num text-slate-900" dir="ltr">
              {printDate}
            </span>
          </div>
          <div>
            <span className="text-slate-500">الوقت: </span>
            <span className="font-medium financial-num text-slate-800" dir="ltr">
              {printTime}
            </span>
          </div>
          {payload.pricingTierLabel === 'تسعيرة الجملة' && (
            <div className="text-[9.5px] font-semibold text-indigo-700">تسعيرة جملة</div>
          )}
        </div>
      </div>
    );
  }

  // B. Cash Vouchers (Receipt / Payment) & Account Statements Metadata Box
  if (isVoucherKind || isStatementKind) {
    const partyLabel =
      payload.partyLabel ||
      (payload.kind === 'receipt_voucher'
        ? 'استلمنا من'
        : payload.kind === 'payment_voucher'
        ? 'اصرفوا إلى'
        : 'الحساب المعني');
    const partyName = payload.partyName || '-';
    const codeVal = payload.partyCode && payload.partyCode !== '-' ? payload.partyCode : null;

    return (
      <div className="border border-slate-300 rounded-lg my-2 px-2.5 py-2 bg-slate-50/50 text-slate-900 print-avoid-break grid grid-cols-1 sm:grid-cols-3 gap-2 items-center sm:divide-x sm:divide-x-reverse divide-slate-200 text-[11px] sm:text-xs">
        <div className="sm:pl-2 text-right space-y-0.5 min-w-0">
          <div className="[word-break:normal] [overflow-wrap:break-word]">
            <span className="text-slate-500">{partyLabel}: </span>
            <span className="font-bold text-slate-900">{partyName}</span>
          </div>
          {codeVal && (
            <div>
              <span className="text-slate-500">{payload.partyCodeLabel || 'كود الحساب'}: </span>
              <span className="font-semibold financial-num">{codeVal}</span>
            </div>
          )}
          {payload.partyPhone && payload.partyPhone !== '-' && (
            <div>
              <span className="text-slate-500">الهاتف: </span>
              <span className="font-medium financial-num" dir="ltr">{payload.partyPhone}</span>
            </div>
          )}
        </div>

        <div className="sm:px-2 text-right sm:text-center space-y-0.5 min-w-0">
          <div className="font-bold text-slate-900 leading-snug">{payload.title}</div>
          <div className="font-semibold text-slate-800 financial-num">مرجع: #{docSerial}</div>
          {payload.period && (payload.period.from || payload.period.to) && (
            <div className="text-[10px] text-slate-600 financial-num">
              من {payload.period.from || '-'} إلى {payload.period.to || '-'}
            </div>
          )}
        </div>

        <div className="sm:pr-2 text-right sm:text-left space-y-0.5 min-w-0">
          <div>
            <span className="text-slate-500">التاريخ: </span>
            <span className="font-semibold financial-num" dir="ltr">{printDate}</span>
          </div>
          <div>
            <span className="text-slate-500">الوقت: </span>
            <span className="font-medium financial-num" dir="ltr">{printTime}</span>
          </div>
          {payload.paymentMethod && (
            <div className="text-[10.5px] text-slate-700 font-medium">الوسيلة: {payload.paymentMethod}</div>
          )}
        </div>
      </div>
    );
  }

  // C. Tailored Report / Directory / Inventory / Treasury / Audit / Financial Statements Metadata Box
  const recordsCount = payload.rows ? payload.rows.length : payload.items ? payload.items.length : undefined;
  const scopeText = payload.branch || 'الإدارة العامة والفرع الرئيسي';
  const responsibleText = payload.user || payload.authorizedBy;

  return (
    <div className="border border-slate-300 rounded-lg my-2 px-2.5 py-2 bg-slate-50/50 text-slate-900 print-avoid-break grid grid-cols-1 sm:grid-cols-3 gap-2 items-center sm:divide-x sm:divide-x-reverse divide-slate-200 text-[11px] sm:text-xs">
      <div className="sm:pl-2 text-right space-y-0.5 min-w-0">
        <div className="font-bold text-slate-900 leading-snug">{payload.title}</div>
        {payload.subTitle && payload.subTitle !== payload.title && (
          <div className="text-[10.5px] text-slate-600 leading-snug">{payload.subTitle}</div>
        )}
        <div className="text-[10.5px] text-slate-700 financial-num">مرجع المستند: #{docSerial}</div>
      </div>

      <div className="sm:px-2 text-right sm:text-center space-y-0.5 min-w-0">
        <div>
          <span className="text-slate-500">النطاق / الفرع: </span>
          <span className="font-semibold text-slate-900">{scopeText}</span>
        </div>
        {payload.partyName && (
          <div>
            <span className="text-slate-500">{payload.partyLabel || 'البيان'}: </span>
            <span className="font-semibold text-slate-900">{payload.partyName}</span>
          </div>
        )}
        {payload.period && (payload.period.from || payload.period.to) && (
          <div className="text-[10.5px] text-slate-700 financial-num">
            الفترة: {payload.period.from || '-'} إلى {payload.period.to || '-'}
          </div>
        )}
        {responsibleText && (
          <div className="text-[10.5px] text-slate-700">
            <span className="text-slate-500">المسؤول: </span>
            <span className="font-medium">{responsibleText}</span>
          </div>
        )}
      </div>

      <div className="sm:pr-2 text-right sm:text-left space-y-0.5 min-w-0">
        <div>
          <span className="text-slate-500">تاريخ الطباعة: </span>
          <span className="font-semibold financial-num" dir="ltr">{printDate}</span>
        </div>
        <div>
          <span className="text-slate-500">الوقت: </span>
          <span className="font-medium financial-num" dir="ltr">{printTime}</span>
        </div>
        {recordsCount !== undefined && (
          <div className="text-[10.5px] font-semibold text-slate-700 financial-num">
            عدد السجلات: {recordsCount}
          </div>
        )}
      </div>
    </div>
  );
}

function renderDocumentBody(
  payload: UniversalPrintPayload,
  curSymbol: string,
  isThermal: boolean,
  isA4: boolean,
  forcePrintTable: boolean = false
) {
  const kind = payload.kind;

  // Optional KPI Strip above tables / vouchers
  const kpiStrip =
    payload.kpis && payload.kpis.length > 0 ? (
      <div className={`grid ${isThermal ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'} gap-1.5 my-2 print-avoid-break`}>
        {payload.kpis.map((k, idx) => (
          <div key={idx} className="border border-slate-200 rounded-lg p-1.5 bg-slate-50 text-center">
            <div className="text-[10px] text-slate-500 leading-tight">{k.title}</div>
            <div className="text-[11px] sm:text-xs font-bold text-slate-900 mt-0.5 financial-num break-words">
              {k.value}
            </div>
          </div>
        ))}
      </div>
    ) : null;

  // 1. Voucher Layout (Receipt / Payment)
  if (kind === 'receipt_voucher' || kind === 'payment_voucher') {
    const isReceipt = kind === 'receipt_voucher';
    const actionText = isReceipt ? 'استلمنا من السيد / السادة:' : 'اصرفوا إلى السيد / السادة:';
    const amountVal = payload.amount !== undefined ? fmtSmart(Number(payload.amount)) : '0';
    const partyName = payload.partyName || (isReceipt ? 'عميل نقدي عام' : 'مورد عام');

    return (
      <>
        {kpiStrip}
        <div className="border border-slate-300 rounded-lg p-3 my-2 text-xs print-avoid-break">
          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-dashed border-slate-300 pb-2 mb-2">
            <span className="font-medium text-slate-900">
              {actionText} <strong className="font-bold text-slate-950">{partyName}</strong>
            </span>
            <span className="font-bold text-sm border border-slate-300 rounded-lg px-2.5 py-1 bg-slate-50 financial-num">
              {amountVal} {curSymbol}
            </span>
          </div>

          <div className="space-y-1.5 mb-2 leading-relaxed">
            <div>
              <span className="text-slate-500">مبلغاً وقدره: </span>
              <span className="font-medium text-slate-900">{payload.amountInWords || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500">وذلك عن: </span>
              <span className="text-slate-900">
                {payload.statementOrReason || payload.notes || 'معاملة مالية معتمدة بالنظام'}
              </span>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-2 bg-slate-50 flex flex-wrap justify-between gap-2 text-[11px]">
            <div>
              <span className="text-slate-500">طريقة السداد: </span>
              <span className="font-semibold">{payload.paymentMethod || 'كاش / نقدي'}</span>
            </div>
            <div>
              <span className="text-slate-500">الخزينة / الحساب: </span>
              <span className="font-semibold">{payload.treasuryOrBank || 'الخزينة الرئيسية'}</span>
            </div>
            {payload.referenceNumber && (
              <div>
                <span className="text-slate-500">رقم المرجع: </span>
                <span className="font-semibold financial-num">{payload.referenceNumber}</span>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // 2. Custom Columns / Rows (Reports, Ledgers, Directories, Inventory, Financial Statements)
  if (payload.columns && payload.rows) {
    const showMobileCards = !isThermal && !forcePrintTable && payload.columns.length >= 5;

    return (
      <>
        {kpiStrip}
        {showMobileCards && (
          <div className="block sm:hidden print:hidden space-y-2 my-2">
            {payload.rows.length === 0 ? (
              <div className="border border-slate-200 rounded-lg p-4 text-center text-xs text-slate-500 bg-slate-50">
                لا توجد سجلات مطابقة في هذا المستند
              </div>
            ) : (
              payload.rows.map((row, rIdx) => (
                <div key={rIdx} className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/60 space-y-1 text-[11px]">
                  {payload.columns!.map((col, cIdx) => (
                    <div key={cIdx} className="flex justify-between items-start gap-2 border-b last:border-b-0 border-slate-200/70 pb-1 last:pb-0">
                      <span className="text-slate-500 font-medium shrink-0">{col}:</span>
                      <span className="font-semibold text-slate-900 text-left [word-break:normal] [overflow-wrap:break-word]">
                        {row[cIdx] !== null && row[cIdx] !== undefined ? row[cIdx] : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        <div className={`${showMobileCards ? 'hidden sm:block print:block' : 'block'} border border-slate-300 rounded-lg overflow-hidden my-2`}>
          <table className={`w-full border-collapse ${isThermal ? 'text-[9.5px]' : 'text-[10px] sm:text-xs'}`}>
            <thead>
              <tr className="bg-slate-100">
                {payload.columns.map((c, idx) => (
                  <th
                    key={idx}
                    className="border-b border-l last:border-l-0 border-slate-200 px-1.5 sm:px-2 py-1.5 font-semibold text-slate-800 text-center [word-break:normal] [overflow-wrap:normal] leading-snug"
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
                    className="text-center text-slate-500 py-4 border-b border-slate-200"
                  >
                    لا توجد سجلات مطابقة في هذا المستند
                  </td>
                </tr>
              ) : (
                payload.rows.map((row, rIdx) => (
                  <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
                    {row.map((cell, cIdx) => {
                      const isNum = typeof cell === 'number';
                      return (
                        <td
                          key={cIdx}
                          className={`border-b border-l last:border-l-0 border-slate-200 px-1.5 sm:px-2 py-1.5 [word-break:normal] [overflow-wrap:break-word] leading-snug ${
                            isNum
                              ? 'text-center font-medium financial-num whitespace-nowrap'
                              : cIdx === 0
                              ? 'text-center'
                              : 'text-right'
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
        </div>
      </>
    );
  }

  // 3. Invoice Items List
  const items = payload.items || [];

  // Thermal 80mm compact 4-column table
  if (isThermal) {
    return (
      <div className="border border-slate-400 rounded overflow-hidden my-1.5">
        <table className="w-full table-fixed border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-400">
              <th className="border-l border-slate-300 p-1 font-bold text-right w-[44%]">الصنف</th>
              <th className="border-l border-slate-300 p-1 font-bold text-center w-[14%]">العدد</th>
              <th className="border-l border-slate-300 p-1 font-bold text-center w-[20%]">السعر</th>
              <th className="p-1 font-bold text-center w-[22%]">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-slate-500 py-3">
                  لا توجد أصناف
                </td>
              </tr>
            ) : (
              items.map((it, idx) => (
                <tr key={idx}>
                  <td className="border-l border-slate-200 p-1 text-right font-medium text-slate-900 break-words">
                    <div>{it.name}</div>
                    {it.notes && it.notes !== '-' && (
                      <div className="text-[9px] text-slate-500">{it.notes}</div>
                    )}
                  </td>
                  <td className="border-l border-slate-200 p-1 text-center financial-num">
                    {it.qty}
                  </td>
                  <td className="border-l border-slate-200 p-1 text-center financial-num">
                    {fmtSmart(Number(it.price))}
                  </td>
                  <td className="p-1 text-center font-semibold financial-num">
                    {fmtSmart(Number(it.total))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  // Standard 5-Column Clean Table matching Reference Screenshot (Zero Horizontal Scroll)
  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden my-2">
      <table className={`w-full table-fixed border-collapse ${isA4 ? 'text-xs sm:text-[13px]' : 'text-[10.5px] sm:text-xs'}`}>
        <thead>
          <tr className="bg-slate-100 border-b border-slate-300">
            <th className="border-l border-slate-200 px-1.5 py-1.5 font-semibold text-slate-900 text-center w-[36%]">
              اسم الصنف
            </th>
            <th className="border-l border-slate-200 px-1 py-1.5 font-semibold text-slate-900 text-center w-[18%]">
              البيان
            </th>
            <th className="border-l border-slate-200 px-1 py-1.5 font-semibold text-slate-900 text-center w-[12%]">
              العدد
            </th>
            <th className="border-l border-slate-200 px-1 py-1.5 font-semibold text-slate-900 text-center w-[16%]">
              السعر
            </th>
            <th className="px-1 py-1.5 font-semibold text-slate-900 text-center w-[18%]">
              الإجمالي
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center text-slate-500 py-4">
                لا توجد أصناف في هذه الفاتورة
              </td>
            </tr>
          ) : (
            items.map((it, idx) => {
              const specOrUnit =
                it.notes && it.notes.trim() !== '' && it.notes.trim() !== '-'
                  ? it.notes.trim()
                  : it.unit || 'قطعة';
              return (
                <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}>
                  <td className="border-l border-slate-200 px-1.5 py-1.5 text-center sm:text-right font-medium text-slate-900 break-words leading-snug">
                    {it.name}
                  </td>
                  <td className="border-l border-slate-200 px-1 py-1.5 text-center text-slate-700 break-words">
                    {specOrUnit}
                  </td>
                  <td className="border-l border-slate-200 px-1 py-1.5 text-center font-medium text-slate-900 financial-num">
                    {it.qty}
                  </td>
                  <td className="border-l border-slate-200 px-1 py-1.5 text-center text-slate-800 financial-num">
                    {fmtSmart(Number(it.price))}
                  </td>
                  <td className="px-1 py-1.5 text-center font-semibold text-slate-900 financial-num">
                    {fmtSmart(Number(it.total))}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function renderDocumentFooterSummary(
  payload: UniversalPrintPayload,
  curSymbol: string,
  tafqeetText: string,
  settings: Settings,
  isThermal: boolean,
  isA4: boolean
) {
  const items = payload.items || [];
  const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const netTotal = payload.amount !== undefined ? Number(payload.amount) : 0;
  const subtotal = payload.subtotal !== undefined ? Number(payload.subtotal) : netTotal;
  const discountAmount = Number(payload.discountAmount || 0);
  const taxAmount = Number(payload.taxAmount || 0);
  const extraCharges = Number(payload.extraCharges || 0);
  const paidAmount = payload.paidAmount !== undefined ? Number(payload.paidAmount) : netTotal;
  const remainingAmount =
    payload.remainingAmount !== undefined ? Number(payload.remainingAmount) : Math.max(0, netTotal - paidAmount);

  const paymentMethod = payload.paymentMethod || 'نقدي';
  const isReturnDoc = payload.kind === 'sales_return' || payload.kind === 'purchase_return';
  const isPurchaseDoc = payload.kind === 'purchase_invoice' || payload.kind === 'purchase_return';
  const isInvoiceDoc =
    payload.kind === 'sales_invoice' ||
    payload.kind === 'purchase_invoice' ||
    isReturnDoc;

  const hasAdjustments = discountAmount > 0.01 || taxAmount > 0.01 || extraCharges > 0.01;

  return (
    <div className="mt-1.5 text-slate-900 print-avoid-break w-full">
      {isInvoiceDoc ? (
        <div className={`border-t border-slate-300 ${isThermal ? 'text-[10.5px]' : 'text-[11px] sm:text-xs'}`}>
          {/* Row 1: Total Qty */}
          <div className="flex justify-between items-center py-1.5 border-b border-slate-200">
            <span className="text-slate-600 font-medium">إجمالي الكميات:</span>
            <span className="font-bold text-slate-900 financial-num">{fmtSmart(totalQty)}</span>
          </div>

          {/* Optional Subtotal / Discount / Tax / Extra Charges only when present */}
          {hasAdjustments && (
            <div className="py-1 border-b border-slate-200 space-y-0.5 text-[10.5px] text-slate-600">
              <div className="flex justify-between items-center">
                <span>المجموع الفرعي:</span>
                <span className="font-medium financial-num text-slate-800">{fmtSmart(subtotal)} {curSymbol}</span>
              </div>
              {discountAmount > 0.01 && (
                <div className="flex justify-between items-center">
                  <span>الخصم:</span>
                  <span className="font-medium financial-num text-rose-700">-{fmtSmart(discountAmount)} {curSymbol}</span>
                </div>
              )}
              {taxAmount > 0.01 && (
                <div className="flex justify-between items-center">
                  <span>الضريبة:</span>
                  <span className="font-medium financial-num text-slate-800">+{fmtSmart(taxAmount)} {curSymbol}</span>
                </div>
              )}
              {extraCharges > 0.01 && (
                <div className="flex justify-between items-center">
                  <span>{payload.extraChargesLabel || 'مصاريف إضافية'}:</span>
                  <span className="font-medium financial-num text-slate-800">+{fmtSmart(extraCharges)} {curSymbol}</span>
                </div>
              )}
            </div>
          )}

          {/* Row 2: Net Invoice Total */}
          <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-300 font-bold text-xs sm:text-sm">
            <span className="text-slate-900">
              {isReturnDoc ? 'إجمالي المرتجع:' : 'إجمالي الفاتورة:'}
            </span>
            <span className="text-slate-900 financial-num">
              {fmtSmart(netTotal)} {curSymbol}
            </span>
          </div>

          {/* Row 3: Payment Method Badge + Paid Amount */}
          <div className="flex flex-wrap justify-between items-center gap-2 py-1.5 border-b border-dashed border-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 font-medium">طريقة الدفع:</span>
              <span className="inline-block border border-slate-400 rounded-md px-2 py-0.5 bg-slate-50 font-semibold text-slate-900 text-[10.5px]">
                {paymentMethod}
              </span>
            </div>
            <div className="font-semibold text-slate-900 financial-num">
              <span className="text-slate-600 font-medium">
                {isReturnDoc ? 'المردود نقداً: ' : 'المدفوع: '}
              </span>
              <strong>{fmtSmart(paidAmount)} {curSymbol}</strong>
            </div>
          </div>

          {/* Row 4 (Conditional): Remaining Balance if credit/partial */}
          {remainingAmount > 0.01 && (
            <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-300 font-semibold text-rose-700">
              <span>{isReturnDoc ? 'المخصوم على الحساب:' : 'المتبقي (آجل):'}</span>
              <span className="financial-num">{fmtSmart(remainingAmount)} {curSymbol}</span>
            </div>
          )}

          {/* Row 5 (Conditional): Party Account Balance Summary when relevant */}
          {!isThermal && payload.partyBalanceAfter !== undefined && Math.abs(payload.partyBalanceAfter) > 0.01 && (
            <div className="flex justify-between items-center py-1 text-[10.5px] text-slate-600">
              <span>{isPurchaseDoc ? 'رصيد المورد الحالي:' : 'رصيد العميل الحالي:'}</span>
              <span className="font-semibold text-slate-900 financial-num">
                {fmtSmart(Math.abs(payload.partyBalanceAfter))} {curSymbol}{' '}
                {isPurchaseDoc
                  ? payload.partyBalanceAfter > 0
                    ? '(له)'
                    : '(عليه)'
                  : payload.partyBalanceAfter > 0
                  ? '(عليه)'
                  : '(له)'}
              </span>
            </div>
          )}
        </div>
      ) : payload.summaries && payload.summaries.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 my-2">
          {payload.summaries.map((s, idx) => (
            <div key={idx} className="border border-slate-200 rounded-lg p-1.5 bg-slate-50 text-center">
              <div className="text-[10px] text-slate-500">{s.label}</div>
              <div className="text-xs font-bold text-slate-900 mt-0.5 financial-num">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Tafqeet (shown cleanly on A4 or Vouchers to keep A5 ultra-compact onto 1 page) */}
      {tafqeetText && (isA4 || !isInvoiceDoc) && (
        <div className="text-[10.5px] text-slate-700 mt-1.5 px-1">
          <span className="text-slate-500">المبلغ كتابة: </span>
          <span className="font-medium">{tafqeetText}</span>
        </div>
      )}

      {payload.notes && (
        <div className="text-[10.5px] text-slate-700 mt-1 px-1 break-words">
          <span className="text-slate-500">ملاحظات: </span>
          <span>{payload.notes}</span>
        </div>
      )}

      {/* Signatures strip when provided on formal non-invoice A4 reports */}
      {isA4 && !isInvoiceDoc && payload.signatures && payload.signatures.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-3 pt-2 border-t border-slate-200 text-center text-[10.5px] text-slate-700">
          {payload.signatures.slice(0, 3).map((sig, i) => (
            <div key={i} className="space-y-2">
              <div className="font-semibold">{sig}</div>
              <div className="border-b border-dotted border-slate-400 mx-4 h-3" />
            </div>
          ))}
        </div>
      )}

      {/* Footer Policy & Developer Copyright */}
      <div className="mt-2.5 pt-2 border-t border-dashed border-slate-300 text-center space-y-0.5">
        <div className="text-[10px] sm:text-[11px] font-medium text-slate-700">
          {payload.footerTermsNote ||
            (isInvoiceDoc
              ? settings.invoiceFooterNote || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً لحالتها الأصلية'
              : 'تم استخراج هذا المستند آلياً من السجلات المحاسبية المعتمدة بالنظام')}
        </div>
        <div className="text-[9.5px] sm:text-[10px] text-slate-500">
          جميع حقوق الملكية محفوظة لمطور النظام Mohamed Nazih ت 01029190615
        </div>
      </div>
    </div>
  );
}

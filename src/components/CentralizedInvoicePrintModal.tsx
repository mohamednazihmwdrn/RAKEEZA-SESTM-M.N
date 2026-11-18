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
import { Printer, Download, X, Copy, Check, Eye, ShieldCheck, FileCheck, Layers, FileText } from 'lucide-react';

interface CentralizedInvoicePrintModalProps {
  defaultSettings?: Settings;
}

const PAPER_SIZE_OPTIONS: Array<{ id: UniversalPaperSize; label: string }> = [
  { id: 'a5-portrait', label: 'A5 عمودي' },
  { id: 'a5-landscape', label: 'A5 أفقي' },
  { id: 'a4-portrait', label: 'A4 عمودي' },
  { id: 'a4-landscape', label: 'A4 أفقي' },
  { id: 'thermal-80', label: 'حراري 80mm' },
  { id: 'thermal-58', label: 'حراري 58mm' },
];

export const CentralizedInvoicePrintModal: React.FC<CentralizedInvoicePrintModalProps> = ({
  defaultSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'audit'>('preview');
  const [activePayload, setActivePayload] = useState<UniversalPrintPayload | null>(null);
  const [selectedSize, setSelectedSize] = useState<UniversalPaperSize>('a5-portrait');
  const [includeBatchSummary, setIncludeBatchSummary] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const printSheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubUniversal = subscribeToUniversalPrint((payload) => {
      setActivePayload(payload);
      setSelectedSize(payload.preferredPaperSize || 'a5-portrait');
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
      summaries.push({
        label: 'الصافي المستحق',
        value: `${fin.grandTotal.toFixed(2)} ${curSymbol}`,
        isHighlight: true,
        isTotal: true,
      });
      summaries.push({ label: 'المدفوع', value: `${fin.paidVal.toFixed(2)} ${curSymbol}` });
      summaries.push({ label: 'المتبقي', value: `${fin.remainingVal.toFixed(2)} ${curSymbol}` });

      let prefSize: UniversalPaperSize = 'a5-portrait';
      if (legacyPayload.preferredPaperSize) {
        const p = legacyPayload.preferredPaperSize.toLowerCase();
        if (p === 'a4') prefSize = 'a4-portrait';
        else if (p === 'thermal' || p === '80mm') prefSize = 'thermal-80';
        else if (p === '58mm') prefSize = 'thermal-58';
      }

      const isWholesale = (inv as any).salesType === 'wholesale' || (inv as any).purchaseType === 'wholesale';

      const docTitle = isSale
        ? fin.isReturn
          ? 'سند مرتجع مبيعات'
          : isWholesale
          ? inv.type === 'ajel'
            ? 'فاتورة مبيعات جملة آجلة'
            : 'فاتورة مبيعات جملة نقدية'
          : inv.type === 'nagdi'
          ? 'فاتورة مبيعات نقدية'
          : 'فاتورة مبيعات آجلة'
        : fin.isReturn
        ? 'سند مرتجع مشتريات'
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

    const existingStyle = document.getElementById('rakeeza-print-page-style');
    if (existingStyle) existingStyle.remove();

    let pageCss = '@page { size: 148mm 210mm; margin: 5mm; }';
    if (selectedSize === 'a5-landscape') {
      pageCss = '@page { size: 210mm 148mm; margin: 5mm; }';
    } else if (selectedSize === 'a4-portrait') {
      pageCss = '@page { size: 210mm 297mm; margin: 7mm; }';
    } else if (selectedSize === 'a4-landscape') {
      pageCss = '@page { size: 297mm 210mm; margin: 7mm; }';
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
          height: auto !important;
          overflow: visible !important;
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
          overflow: visible !important;
        }
        .rakeeza-print-scroll-wrap {
          display: block !important;
          overflow: visible !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        #rakeeza-universal-print-sheet,
        #rakeeza-batch-print-container {
          position: static !important;
          width: 100% !important;
          max-width: 100% !important;
          min-height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          border: none !important;
          background: #ffffff !important;
          gap: 0 !important;
        }
        .rakeeza-print-doc-page {
          position: static !important;
          width: 100% !important;
          max-width: 100% !important;
          min-height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          border: none !important;
          background: #ffffff !important;
        }
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
        margin: 4,
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
    const curSymbol = (activePayload.settings || defaultSettings)?.currencySymbol || 'ج.م';
    if (activePayload.kind === 'batch_invoices' && activePayload.documents) {
      const lines = [
        `السجل المجمع: ${activePayload.title}`,
        `عدد المستندات: ${activePayload.documents.length}`,
        `التاريخ: ${activePayload.date || ''}`,
        `الصافي: ${activePayload.amount !== undefined ? `${Number(activePayload.amount).toFixed(2)} ${curSymbol}` : '-'}`,
        activePayload.paidAmount !== undefined ? `المدفوع/المحصل: ${Number(activePayload.paidAmount).toFixed(2)} ${curSymbol}` : '',
        activePayload.remainingAmount !== undefined ? `المتبقي: ${Number(activePayload.remainingAmount).toFixed(2)} ${curSymbol}` : '',
      ].filter(Boolean);
      navigator.clipboard.writeText(lines.join('\n'));
    } else {
      const lines = [
        `المستند: ${activePayload.title} #${activePayload.docNumber || ''}`,
        `التاريخ: ${activePayload.date || ''} ${activePayload.time || ''}`,
        `${activePayload.partyLabel || 'الطرف'}: ${activePayload.partyName || '-'}`,
        `الصافي: ${activePayload.amount !== undefined ? `${Number(activePayload.amount).toFixed(2)} ${curSymbol}` : '-'}`,
        activePayload.paidAmount !== undefined ? `المدفوع: ${Number(activePayload.paidAmount).toFixed(2)} ${curSymbol}` : '',
        activePayload.remainingAmount !== undefined ? `المتبقي: ${Number(activePayload.remainingAmount).toFixed(2)} ${curSymbol}` : '',
        activePayload.amountInWords ? `المبلغ كتابة: ${activePayload.amountInWords}` : '',
      ].filter(Boolean);
      navigator.clipboard.writeText(lines.join('\n'));
    }

    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-slate-900/75 rakeeza-modal-backdrop rakeeza-print-modal-root"
      dir="rtl"
    >
      {/* Top Preview & Action Toolbar (Mobile-first wrapping) */}
      <div className="preview-header-area no-print bg-white text-slate-900 border-b border-slate-200 px-3 sm:px-5 py-3 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          {/* Title + Close */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {isBatchMode ? (
                <Layers className="w-5 h-5 text-blue-700 shrink-0" />
              ) : (
                <FileText className="w-5 h-5 text-slate-700 shrink-0" />
              )}
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
                {isBatchMode
                  ? `${activePayload.title} (${batchDocs.length} مستند مستقل)`
                  : `${activePayload.title} (${docSerial})`}
              </h2>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="md:hidden w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition cursor-pointer shrink-0"
              title="إغلاق"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 transition cursor-pointer border ${
                activeTab === 'preview'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>{isBatchMode ? `معاينة المستندات (${batchDocs.length})` : 'معاينة المستند'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 transition cursor-pointer border ${
                activeTab === 'audit'
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>التدقيق</span>
            </button>

            {isBatchMode && activePayload.batchSummary && (
              <button
                type="button"
                onClick={() => setIncludeBatchSummary((prev) => !prev)}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 transition cursor-pointer border ${
                  includeBatchSummary
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
                title="إضافة ورقة ملخص مالي للسجل في نهاية المستندات المطبوعة"
              >
                <Layers className="w-4 h-4" />
                <span>{includeBatchSummary ? 'الملخص مفعّل ✓' : 'تضمين ملخص السجل'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopySummary}
              className="min-h-[40px] px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs sm:text-sm font-medium transition flex items-center gap-1.5 cursor-pointer"
              title="نسخ ملخص المستند"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{isCopied ? 'تم النسخ' : 'نسخ الملخص'}</span>
            </button>

            <button
              type="button"
              onClick={handleSavePdf}
              disabled={isExportingPdf}
              className="min-h-[40px] px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg text-xs sm:text-sm font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="حفظ بتنسيق PDF"
            >
              <Download className="w-4 h-4" />
              <span>{isExportingPdf ? 'جاري التصدير...' : 'حفظ PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[40px] bg-blue-700 hover:bg-blue-800 text-white font-medium px-4 py-1.5 rounded-lg text-xs sm:text-sm transition flex items-center gap-1.5 cursor-pointer"
              title="طباعة فورية"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="hidden md:flex w-10 h-10 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg items-center justify-center transition cursor-pointer"
              title="إغلاق"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paper Size Selector Row */}
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-xs font-medium text-slate-600 ml-1">حجم الورق:</span>
            {PAPER_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedSize(opt.id)}
                className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer border ${
                  selectedSize === opt.id
                    ? 'bg-blue-700 border-blue-700 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {isBatchMode && (
            <div className="text-xs text-slate-600 font-medium tabular-nums">
              وضع الطباعة المجمعة: كل فاتورة تطبع كمستند مستقل بفواصل صفحات تلقائية
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Preview Sheet Area */}
      <div className="rakeeza-print-scroll-wrap flex-1 overflow-auto p-2 sm:p-6 flex justify-center items-start bg-slate-200/90">
        {activeTab === 'preview' ? (
          isBatchMode ? (
            <div
              id="rakeeza-batch-print-container"
              ref={printSheetRef}
              className="w-full flex flex-col items-center gap-5"
            >
              {batchDocs.map((docPayload, idx) => {
                const docSettings: Settings = docPayload.settings || settings;
                const docCur = docSettings.currencySymbol || currencySymbol;
                return (
                  <div
                    key={`${docPayload.docNumber || idx}-${idx}`}
                    style={sheetWidthStyle}
                    className={`rakeeza-print-doc-page rakeeza-batch-page-break bg-white text-slate-900 shadow-md border border-slate-300 flex flex-col justify-between ${
                      isThermal ? 'p-2.5 text-[11px]' : 'p-4 sm:p-6 text-xs sm:text-[13px]'
                    }`}
                  >
                    <InvoiceDocumentSheet
                      payload={docPayload}
                      settings={docSettings}
                      currencySymbol={docCur}
                      currencyName={docCur === 'ج.م' ? 'جنيه مصري' : docCur}
                      isThermal={isThermal}
                      batchPositionLabel={`مستند ${idx + 1} من ${batchDocs.length}`}
                    />
                  </div>
                );
              })}

              {includeBatchSummary && activePayload.batchSummary && (
                <div
                  style={sheetWidthStyle}
                  className={`rakeeza-print-doc-page rakeeza-batch-page-break bg-white text-slate-900 shadow-md border border-slate-300 flex flex-col justify-between ${
                    isThermal ? 'p-2.5 text-[11px]' : 'p-4 sm:p-6 text-xs sm:text-[13px]'
                  }`}
                >
                  <BatchSummaryDocumentSheet
                    summary={activePayload.batchSummary}
                    settings={settings}
                    currencySymbol={currencySymbol}
                    isThermal={isThermal}
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              id="rakeeza-universal-print-sheet"
              ref={printSheetRef}
              style={sheetWidthStyle}
              className={`rakeeza-print-doc-page bg-white text-slate-900 shadow-md border border-slate-300 flex flex-col justify-between ${
                isThermal ? 'p-2.5 text-[11px]' : 'p-4 sm:p-6 text-xs sm:text-[13px]'
              }`}
            >
              <InvoiceDocumentSheet
                payload={activePayload}
                settings={settings}
                currencySymbol={currencySymbol}
                currencyName={currencyName}
                isThermal={isThermal}
              />
            </div>
          )
        ) : (
          /* Tab 2: Audit & Accounting Verification Panel */
          <div className="bg-white text-slate-900 p-4 sm:p-6 rounded-xl shadow-md max-w-2xl w-full border border-slate-200">
            <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 mb-4">
              <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900">
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
                  <strong className="font-semibold">وضع القراءة الآمن (Read-Only): </strong>
                  <span>عملية المعاينة والطباعة لا تنشئ قيوداً مكررة ولا تؤثر على الخزينة أو المخزون.</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 text-xs block">نوع المستند / السجل:</span>
                  <span className="font-medium text-slate-900">{activePayload.title}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">
                    {isBatchMode ? 'عدد المستندات المستقلة:' : 'الرقم المرجعي:'}
                  </span>
                  <span className="font-medium text-slate-900 financial-num">
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
                  <span className="text-slate-500 text-xs block">
                    {isBatchMode ? 'طريقة الإخراج:' : 'طريقة السداد:'}
                  </span>
                  <span className="font-medium text-slate-900">
                    {isBatchMode ? 'مستندات متتالية بفواصل صفحات' : activePayload.paymentMethod || 'كاش / نقدي'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">
                    {isBatchMode ? 'صافي قيمة السجل:' : 'الصافي المستحق:'}
                  </span>
                  <span className="font-semibold text-slate-900 financial-num">
                    {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencySymbol}
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
                    <span>توثيق تسوية المرتجعات ومرجعية الفواتير الأصلية عند وجودها.</span>
                  </li>
                </ul>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="min-h-[40px] bg-slate-900 hover:bg-slate-800 text-white font-medium px-5 py-2 rounded-lg text-xs cursor-pointer"
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

  return createPortal(modalContent, document.body);
};

interface InvoiceDocumentSheetProps {
  payload: UniversalPrintPayload;
  settings: Settings;
  currencySymbol: string;
  currencyName: string;
  isThermal: boolean;
  batchPositionLabel?: string;
}

const InvoiceDocumentSheet: React.FC<InvoiceDocumentSheetProps> = ({
  payload,
  settings,
  currencySymbol,
  currencyName,
  isThermal,
  batchPositionLabel,
}) => {
  const companyName = settings.companyName || 'المنظومة المحاسبية';
  const companyAddress = settings.address || '';
  const companyTax = settings.taxNumber || '';
  const companyReg = settings.commercialReg || '';
  const companyLogo =
    settings.showLogoInPrint !== false ? (settings as any).logo || (settings as any).logoUrl || '' : '';
  const branchName = payload.branch || '';
  const phones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];

  const now = new Date();
  const printDate = payload.date || now.toISOString().split('T')[0];
  const printTime = payload.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const docSerial = payload.docNumber !== undefined && payload.docNumber !== '' ? `${payload.docNumber}` : '1';
  const totalAmount = payload.amount !== undefined ? Number(payload.amount) : 0;
  const tafqeetText =
    payload.amountInWords || (totalAmount > 0 ? tafqeetNumber(totalAmount, currencyName, 'قرش') : '');

  return (
    <div className="flex flex-col justify-between flex-1">
      <div>
        {/* 1. Dynamic Company Header */}
        <div
          className={`flex ${
            isThermal ? 'flex-col items-center text-center gap-1.5' : 'justify-between items-start gap-4'
          } pb-2.5 border-b-2 border-slate-800`}
        >
          <div className={`flex items-start gap-3 ${isThermal ? 'flex-col items-center' : ''}`}>
            {companyLogo && (
              <img
                src={companyLogo}
                alt={companyName}
                className={`${isThermal ? 'h-12' : 'h-14 w-auto max-w-[110px]'} object-contain shrink-0`}
              />
            )}
            <div className={isThermal ? 'text-center' : 'text-right'}>
              <h1 className={`${isThermal ? 'text-sm' : 'text-lg sm:text-xl'} font-semibold text-slate-900 leading-tight`}>
                {companyName}
              </h1>
              {branchName && <p className="text-xs text-slate-600 mt-0.5">{branchName}</p>}
              {companyAddress && <p className="text-[11px] text-slate-600 mt-0.5">{companyAddress}</p>}
              {(companyTax || companyReg) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600 mt-1">
                  {companyTax && (
                    <span>
                      الرقم الضريبي: <span className="financial-num">{companyTax}</span>
                    </span>
                  )}
                  {companyReg && (
                    <span>
                      السجل التجاري: <span className="financial-num">{companyReg}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Company Contact Phones & Batch Index */}
          <div className={`${isThermal ? 'text-center' : 'text-left'} text-[11px] sm:text-xs text-slate-700 shrink-0`}>
            {phones.map((ph, i) => (
              <div key={i} className="financial-num" dir="ltr">
                {phones.length > 1 ? `هاتف ${i + 1}: ` : 'هاتف: '}
                {ph}
              </div>
            ))}
            {batchPositionLabel && (
              <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">{batchPositionLabel}</div>
            )}
          </div>
        </div>

        {/* 2. Metadata Grid (Strict Customer vs Supplier & Doc Info) */}
        {renderDocumentMetaBox(payload, docSerial, printDate, printTime, isThermal)}

        {/* 3. Document Body */}
        {renderDocumentBody(payload, currencySymbol, isThermal)}
      </div>

      {/* 4. Financial Summary, Payment Details, Signatures & Footer */}
      {renderDocumentFooterSummary(payload, currencySymbol, tafqeetText, settings, isThermal)}
    </div>
  );
};

const BatchSummaryDocumentSheet: React.FC<{
  summary: UniversalBatchSummary;
  settings: Settings;
  currencySymbol: string;
  isThermal: boolean;
}> = ({ summary, settings, isThermal }) => {
  const companyName = settings.companyName || 'المنظومة المحاسبية';
  return (
    <div className="flex flex-col justify-between flex-1">
      <div>
        <div className="flex justify-between items-start gap-4 pb-2.5 border-b-2 border-slate-800">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{companyName}</h1>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{summary.title}</p>
            {summary.subtitle && <p className="text-xs text-slate-500 mt-0.5">{summary.subtitle}</p>}
          </div>
          <div className="text-left text-xs text-slate-600 tabular-nums">
            <div>تاريخ الطباعة: {new Date().toISOString().split('T')[0]}</div>
          </div>
        </div>

        <div className={`grid ${isThermal ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'} gap-2 my-3`}>
          {summary.kpis.map((k, i) => (
            <div key={i} className="border border-slate-300 rounded p-2 bg-slate-50 text-center">
              <div className="text-[11px] text-slate-500">{k.title}</div>
              <div className="text-xs sm:text-sm font-semibold text-slate-900 mt-0.5 financial-num">{k.value}</div>
            </div>
          ))}
        </div>

        {summary.columns && summary.rows && (
          <div className="overflow-x-auto my-2">
            <table className="w-full border-collapse border border-slate-300 text-[11px]">
              <thead>
                <tr className="bg-slate-100">
                  {summary.columns.map((c, idx) => (
                    <th key={idx} className="border border-slate-300 px-1.5 py-1.5 font-semibold text-slate-800 text-center">
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
                        className={`border border-slate-300 px-1.5 py-1 text-center ${
                          typeof cell === 'number' || cIdx >= 5 ? 'financial-num font-medium' : ''
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
        )}
      </div>

      <div className="border-t border-dashed border-slate-300 mt-4 pt-2 text-center space-y-1">
        {summary.footerNotes?.map((n, i) => (
          <div key={i} className="text-[11px] text-slate-600">{n}</div>
        ))}
        <div className="text-[10px] text-slate-500">
          منظومة ركيزة المحاسبية | RAKEEZA ERP — {settings.phone1 || '01029190615'}
        </div>
      </div>
    </div>
  );
};

function getSheetWidthStyle(size: UniversalPaperSize): React.CSSProperties {
  switch (size) {
    case 'a5-portrait':
      return { width: '100%', maxWidth: '148mm', minHeight: '200mm' };
    case 'a5-landscape':
      return { width: '100%', maxWidth: '210mm', minHeight: '140mm' };
    case 'a4-portrait':
      return { width: '100%', maxWidth: '210mm', minHeight: '285mm' };
    case 'a4-landscape':
      return { width: '100%', maxWidth: '297mm', minHeight: '200mm' };
    case 'thermal-80':
      return { width: '100%', maxWidth: '80mm', minHeight: 'auto' };
    case 'thermal-58':
      return { width: '100%', maxWidth: '58mm', minHeight: 'auto' };
    default:
      return { width: '100%', maxWidth: '148mm', minHeight: '200mm' };
  }
}

function renderDocumentMetaBox(
  payload: UniversalPrintPayload,
  docSerial: string,
  printDate: string,
  printTime: string,
  isThermal: boolean
) {
  const isPurchaseDoc = payload.kind.includes('purchase');
  const isVoucherDoc = payload.kind === 'receipt_voucher' || payload.kind === 'payment_voucher';
  const partyLabel = payload.partyLabel || (isPurchaseDoc ? 'اسم المورد' : isVoucherDoc ? 'الجهة / الطرف' : 'اسم العميل');
  const partyCodeLabel = payload.partyCodeLabel || (isPurchaseDoc ? 'كود المورد' : 'كود العميل');
  const partyName = payload.partyName || (isPurchaseDoc ? 'مورد عام' : 'عميل نقدي');

  return (
    <div
      className={`border border-slate-800 rounded-sm my-2.5 bg-slate-50/50 text-slate-900 print-avoid-break ${
        isThermal
          ? 'p-2 flex flex-col gap-1.5 text-[11px]'
          : 'p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-dashed divide-slate-400 text-xs'
      }`}
    >
      {/* Party Info (Customer vs Supplier strictly distinguished) */}
      <div className={isThermal ? 'text-right' : 'sm:pl-2 text-right space-y-0.5'}>
        {payload.partyCode && payload.partyCode !== '-' && (
          <div>
            <span className="text-slate-500">{partyCodeLabel}: </span>
            <span className="font-medium financial-num">{payload.partyCode}</span>
          </div>
        )}
        <div>
          <span className="text-slate-500">{partyLabel}: </span>
          <span className="font-semibold">{partyName}</span>
        </div>
        {payload.partyPhone && payload.partyPhone !== '-' && (
          <div>
            <span className="text-slate-500">الهاتف: </span>
            <span className="font-medium financial-num" dir="ltr">
              {payload.partyPhone}
            </span>
          </div>
        )}
        {payload.partyAddress && (
          <div>
            <span className="text-slate-500">العنوان: </span>
            <span>{payload.partyAddress}</span>
          </div>
        )}
      </div>

      {/* Document Type & Number */}
      <div className={`flex flex-col justify-center ${isThermal ? 'text-center border-y border-dashed border-slate-300 py-1' : 'sm:px-2 text-center pt-1.5 sm:pt-0'}`}>
        <div className="font-semibold text-xs sm:text-sm text-slate-900">{payload.title}</div>
        <div className="font-semibold text-sm sm:text-base text-slate-900 mt-0.5 financial-num">
          رقم: {docSerial}
        </div>
        {payload.pricingTierLabel && (
          <div className="text-[11px] font-medium text-indigo-800 mt-0.5">{payload.pricingTierLabel}</div>
        )}
        {payload.originalInvoiceNumber !== undefined && payload.originalInvoiceNumber !== '' && (
          <div className="text-[11px] font-medium text-rose-800 mt-0.5 financial-num">
            مرجع الفاتورة الأصلية: #{payload.originalInvoiceNumber}
            {payload.returnKindLabel ? ` · ${payload.returnKindLabel}` : ''}
          </div>
        )}
        {!payload.originalInvoiceNumber && payload.returnKindLabel && (
          <div className="text-[11px] font-medium text-rose-800 mt-0.5">{payload.returnKindLabel}</div>
        )}
      </div>

      {/* Date, Time & Reference */}
      <div className={`flex flex-col justify-center space-y-0.5 ${isThermal ? 'text-right' : 'sm:pr-2 text-right pt-1.5 sm:pt-0'}`}>
        <div>
          <span className="text-slate-500">التاريخ: </span>
          <span className="font-medium financial-num">{printDate}</span>
        </div>
        <div>
          <span className="text-slate-500">الوقت: </span>
          <span className="font-medium financial-num">{printTime}</span>
        </div>
        {payload.user && (
          <div>
            <span className="text-slate-500">المستخدم: </span>
            <span className="font-medium">{payload.user}</span>
          </div>
        )}
        {payload.paymentStatus && (
          <div>
            <span className="text-slate-500">الحالة: </span>
            <span className="font-medium">{payload.paymentStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function renderDocumentBody(payload: UniversalPrintPayload, curSymbol: string, isThermal: boolean) {
  const kind = payload.kind;

  // 1. Voucher Layout (Receipt / Payment)
  if (kind === 'receipt_voucher' || kind === 'payment_voucher') {
    const isReceipt = kind === 'receipt_voucher';
    const actionText = isReceipt ? 'استلمنا من السيد / السادة:' : 'اصرفوا إلى السيد / السادة:';
    const amountVal = payload.amount !== undefined ? Number(payload.amount).toFixed(2) : '0.00';
    const partyName = payload.partyName || (isReceipt ? 'عميل نقدي عام' : 'مورد عام');

    return (
      <div className="border border-slate-300 rounded p-3 my-2.5 text-xs print-avoid-break">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-dashed border-slate-300 pb-2 mb-2.5">
          <span className="font-medium text-slate-900 text-xs sm:text-sm">
            {actionText} <strong className="font-semibold text-slate-950">{partyName}</strong>
          </span>
          <span className="font-semibold text-sm sm:text-base border border-slate-300 rounded px-3 py-1 bg-slate-50 financial-num">
            {amountVal} {curSymbol}
          </span>
        </div>

        <div className="space-y-1.5 mb-2.5 leading-relaxed">
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

        <div className="border border-slate-200 rounded p-2 bg-slate-50 flex flex-wrap justify-between gap-2 text-xs">
          <div>
            <span className="text-slate-500">طريقة السداد: </span>
            <span className="font-medium">{payload.paymentMethod || 'كاش / نقدي'}</span>
          </div>
          <div>
            <span className="text-slate-500">الخزينة / الحساب: </span>
            <span className="font-medium">{payload.treasuryOrBank || 'الخزينة الرئيسية'}</span>
          </div>
          {payload.referenceNumber && (
            <div>
              <span className="text-slate-500">رقم المرجع: </span>
              <span className="font-medium financial-num">{payload.referenceNumber}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2. Custom Columns / Rows (Reports & Statements)
  if (payload.columns && payload.rows) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="w-full border-collapse border border-slate-300 text-xs">
          <thead>
            <tr className="bg-slate-100">
              {payload.columns.map((c, idx) => (
                <th
                  key={idx}
                  className="border border-slate-300 px-2 py-1.5 font-semibold text-slate-800 text-center whitespace-nowrap"
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
                  className="text-center text-slate-500 py-4 border border-slate-300"
                >
                  لا توجد بيانات متاحة لهذا المستند
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
                        className={`border border-slate-300 px-2 py-1.5 text-[11px] sm:text-xs ${
                          isNum ? 'text-center font-medium financial-num' : cIdx === 0 ? 'text-center' : 'text-right'
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
    );
  }

  // 3. Invoice Items List: Strict 7 RTL Columns for A4/A5, compact 4 columns for thermal
  const items = payload.items || [];

  if (isThermal) {
    return (
      <table className="w-full border-collapse border border-slate-400 my-2 text-[10.5px]">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 p-1 font-semibold text-right">الصنف</th>
            <th className="border border-slate-400 p-1 font-semibold text-center">ك</th>
            <th className="border border-slate-400 p-1 font-semibold text-center">السعر</th>
            <th className="border border-slate-400 p-1 font-semibold text-center">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={4} className="text-center text-slate-500 py-3 border border-slate-400">
                لا توجد أصناف
              </td>
            </tr>
          ) : (
            items.map((it, idx) => (
              <tr key={idx}>
                <td className="border border-slate-400 p-1 text-right font-medium text-slate-900">
                  <div>{it.name}</div>
                  {it.notes && it.notes !== '-' && (
                    <div className="text-[9.5px] text-slate-500">{it.notes}</div>
                  )}
                </td>
                <td className="border border-slate-400 p-1 text-center financial-num">
                  {it.qty}
                </td>
                <td className="border border-slate-400 p-1 text-center financial-num">
                  {Number(it.price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </td>
                <td className="border border-slate-400 p-1 text-center font-semibold financial-num">
                  {Number(it.total).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    );
  }

  return (
    <div className="overflow-x-auto my-2.5">
      <table className="w-full border-collapse border border-slate-700 text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-700 px-1.5 py-1.5 font-semibold text-slate-900 text-center w-[7%]">
              رقم
            </th>
            <th className="border border-slate-700 px-2 py-1.5 font-semibold text-slate-900 text-right w-[27%]">
              اسم الصنف
            </th>
            <th className="border border-slate-700 px-2 py-1.5 font-semibold text-slate-900 text-right w-[22%]">
              البيان / الوصف
            </th>
            <th className="border border-slate-700 px-1.5 py-1.5 font-semibold text-slate-900 text-center w-[10%]">
              الكمية
            </th>
            <th className="border border-slate-700 px-1.5 py-1.5 font-semibold text-slate-900 text-center w-[10%]">
              الوحدة
            </th>
            <th className="border border-slate-700 px-1.5 py-1.5 font-semibold text-slate-900 text-center w-[12%]">
              السعر
            </th>
            <th className="border border-slate-700 px-1.5 py-1.5 font-semibold text-slate-900 text-center w-[12%]">
              الإجمالي
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center text-slate-500 py-4 border border-slate-700">
                لا توجد أصناف في هذه الفاتورة
              </td>
            </tr>
          ) : (
            items.map((it, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                <td className="border border-slate-700 px-1.5 py-1.5 text-center text-slate-600 financial-num">
                  {it.index ?? idx + 1}
                </td>
                <td className="border border-slate-700 px-2 py-1.5 text-right font-medium text-slate-900">
                  {it.name}
                </td>
                <td className="border border-slate-700 px-2 py-1.5 text-right text-slate-600">
                  {it.notes || '-'}
                </td>
                <td className="border border-slate-700 px-1.5 py-1.5 text-center font-medium text-slate-900 financial-num">
                  {it.qty}
                </td>
                <td className="border border-slate-700 px-1.5 py-1.5 text-center text-slate-700">
                  {it.unit || 'قطعة'}
                </td>
                <td className="border border-slate-700 px-1.5 py-1.5 text-center text-slate-800 financial-num">
                  {Number(it.price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </td>
                <td className="border border-slate-700 px-1.5 py-1.5 text-center font-semibold text-slate-900 financial-num">
                  {Number(it.total).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))
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
  isThermal: boolean
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

  const paymentMethod = payload.paymentMethod || 'كاش / نقدي';
  const paymentStatus =
    payload.paymentStatus ||
    (remainingAmount <= 0.01 ? 'مدفوعة بالكامل' : paidAmount > 0 ? 'مدفوعة جزئياً' : 'آجل / مستحقة');

  const isReturnDoc = payload.kind === 'sales_return' || payload.kind === 'purchase_return';
  const isPurchaseDoc = payload.kind === 'purchase_invoice' || payload.kind === 'purchase_return';
  const isInvoiceDoc =
    payload.kind === 'sales_invoice' ||
    payload.kind === 'purchase_invoice' ||
    isReturnDoc;

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mt-3 text-slate-900 print-avoid-break">
      {/* Financial Totals & Payment Info */}
      {isInvoiceDoc ? (
        <div
          className={`grid ${
            isThermal ? 'grid-cols-1 gap-2' : 'grid-cols-1 sm:grid-cols-2 gap-3'
          } border-t-2 border-slate-800 pt-2.5`}
        >
          {/* Payment Metadata */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">إجمالي عدد الأصناف / الكميات:</span>
              <span className="font-medium financial-num">
                {items.length} صنف / {totalQty} وحدة
              </span>
            </div>
            <div className="flex justify-between gap-2 items-center">
              <span className="text-slate-500">طريقة الدفع:</span>
              <span className="font-medium border border-slate-700 rounded px-2 py-0.5 bg-slate-50">
                {paymentMethod}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">حالة الدفع:</span>
              <span className="font-medium">{paymentStatus}</span>
            </div>
            {payload.treasuryOrBank && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">الخزينة / الحساب:</span>
                <span className="font-medium">{payload.treasuryOrBank}</span>
              </div>
            )}
            {isReturnDoc && payload.returnSettlementMode && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">معالجة المرتجع:</span>
                <span className="font-medium text-rose-800">{payload.returnSettlementMode}</span>
              </div>
            )}
            {payload.partyBalanceAfter !== undefined && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">
                  {isPurchaseDoc ? 'رصيد المورد الحالي:' : 'رصيد العميل الحالي:'}
                </span>
                <span className="font-semibold financial-num">
                  {fmt(Math.abs(payload.partyBalanceAfter))} {curSymbol}{' '}
                  {payload.partyBalanceAfter === 0
                    ? '(متزن)'
                    : isPurchaseDoc
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

          {/* Accurate Financial Breakdown */}
          <div className={`space-y-1 text-xs ${isThermal ? 'border-t border-slate-200 pt-2' : 'sm:border-r sm:border-slate-300 sm:pr-3'}`}>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">المجموع الفرعي:</span>
              <span className="font-medium financial-num">{fmt(subtotal)} {curSymbol}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">الخصم:</span>
                <span className="font-medium financial-num">-{fmt(discountAmount)} {curSymbol}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">الضريبة:</span>
                <span className="font-medium financial-num">+{fmt(taxAmount)} {curSymbol}</span>
              </div>
            )}
            {extraCharges > 0 && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">{payload.extraChargesLabel || 'مصاريف إضافية'}:</span>
                <span className="font-medium financial-num">+{fmt(extraCharges)} {curSymbol}</span>
              </div>
            )}
            <div className="flex justify-between gap-2 pt-1 border-t border-dashed border-slate-400 font-semibold text-sm">
              <span>{isReturnDoc ? 'إجمالي قيمة المرتجع:' : 'إجمالي الفاتورة:'}</span>
              <span className="financial-num">{fmt(netTotal)} {curSymbol}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">
                {isReturnDoc ? 'المردود نقداً:' : isPurchaseDoc ? 'المدفوع:' : 'المحصل:'}
              </span>
              <span className="font-medium text-emerald-700 financial-num">{fmt(paidAmount)} {curSymbol}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">
                {isReturnDoc ? 'المخصوم من الحساب:' : 'المتبقي:'}
              </span>
              <span className={`font-semibold financial-num ${remainingAmount > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                {fmt(remainingAmount)} {curSymbol}
              </span>
            </div>
          </div>
        </div>
      ) : payload.summaries && payload.summaries.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 my-2">
          {payload.summaries.map((s, idx) => (
            <div key={idx} className="border border-slate-300 rounded p-2 bg-slate-50 text-center">
              <div className="text-[11px] text-slate-500">{s.label}</div>
              <div className="text-xs sm:text-sm font-semibold text-slate-900 mt-0.5 financial-num">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Tafqeet & Notes */}
      {tafqeetText && (
        <div className="text-[11px] text-slate-700 mt-2 px-1">
          <span className="text-slate-500">المبلغ كتابة: </span>
          <span className="font-medium">{tafqeetText}</span>
        </div>
      )}

      {payload.notes && (
        <div className="text-[11px] text-slate-700 mt-1 px-1">
          <span className="text-slate-500">ملاحظات: </span>
          <span>{payload.notes}</span>
        </div>
      )}

      {/* Signatures */}
      {!isThermal && (
        <div className="grid grid-cols-3 gap-3 text-center text-[11px] text-slate-700 mt-4 pt-2.5 border-t border-slate-200">
          <div>
            <div className="font-medium text-slate-600 mb-3">المسؤول / المحاسب</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-slate-500">
              {payload.authorizedBy || 'التوقيع'}
            </div>
          </div>
          <div>
            <div className="font-medium text-slate-600 mb-3">المستلم</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-slate-500">
              {payload.receivedBy || 'التوقيع'}
            </div>
          </div>
          <div>
            <div className="font-medium text-slate-600 mb-3">ختم المنشأة</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-slate-400">
              الختم الرسمي
            </div>
          </div>
        </div>
      )}

      {/* Footer Policy & Quiet Copyright */}
      <div className="border-t border-dashed border-slate-400 mt-3 pt-2 text-center space-y-0.5">
        <div className="text-[11px] font-medium text-slate-700">
          {payload.footerTermsNote || settings.invoiceFooterNote || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً لحالتها الأصلية'}
        </div>
        <div className="text-[10px] text-slate-500">
          جميع حقوق الملكية محفوظة لمطور النظام Mohamed Nazih ت 01029190615
        </div>
      </div>
    </div>
  );
}

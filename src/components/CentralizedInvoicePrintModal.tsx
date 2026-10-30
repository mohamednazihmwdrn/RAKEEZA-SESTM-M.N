import React, { useState, useEffect, useRef } from 'react';
import { SaleInvoice, PurchaseInvoice, Settings } from '../types';
import {
  InvoicePrintPayload,
  PaperSize,
  subscribeToInvoicePrint,
} from '../services/centralizedPrintService';
import { exportElementToPdf } from '../utils/pdfExport';
import { Printer, Download, X, Copy, Check } from 'lucide-react';

interface CentralizedInvoicePrintModalProps {
  defaultSettings?: Settings;
}

export const CentralizedInvoicePrintModal: React.FC<CentralizedInvoicePrintModalProps> = ({
  defaultSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activePayload, setActivePayload] = useState<InvoicePrintPayload | null>(null);
  const [selectedSize, setSelectedSize] = useState<'a4' | 'a5' | 'thermal'>('a5');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const invoiceContainerRef = useRef<HTMLDivElement>(null);

  // Subscribe to centralized print service events
  useEffect(() => {
    const unsubscribe = subscribeToInvoicePrint((payload) => {
      setActivePayload(payload);
      let initialSize: 'a4' | 'a5' | 'thermal' = 'a5';
      const pref = payload.preferredPaperSize || (typeof window !== 'undefined' ? localStorage.getItem('sys_print_pref_size') : null);
      if (pref === 'A4' || pref === 'a4') {
        initialSize = 'a4';
      } else if (pref === 'thermal' || pref === '80mm' || pref === '58mm') {
        initialSize = 'thermal';
      } else {
        initialSize = 'a5';
      }
      setSelectedSize(initialSize);
      setIsOpen(true);
    });
    return () => unsubscribe();
  }, []);

  // Handle escape key to close
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

  const handleSizeChange = (size: 'a4' | 'a5' | 'thermal') => {
    setSelectedSize(size);
    try {
      localStorage.setItem('sys_print_pref_size', size);
    } catch {}
  };

  if (!isOpen || !activePayload || !activePayload.invoice) {
    return null;
  }

  const invoice = activePayload.invoice;
  const isSaleInv = activePayload.isSales !== undefined ? activePayload.isSales : true;
  const settings: Settings = activePayload.settings || defaultSettings || ({} as Settings);

  // Extraction of party information
  const partyLabel = isSaleInv ? 'اسم العميل' : 'اسم المورد';
  const partyIdLabel = isSaleInv ? 'رقم العميل' : 'رقم المورد';
  const partyName = isSaleInv
    ? (invoice as SaleInvoice).customerName || 'عميل نقدي'
    : (invoice as PurchaseInvoice).supplierName || 'مورد عام';

  const partyPhone =
    invoice.phone ||
    (invoice as any).customerId ||
    (invoice as any).supplierId ||
    (invoice as any).clientSyncId ||
    '-';

  // Company info
  const companyName = settings.companyName || 'شركة ركيزة للحلول البرمجية';
  const companyAddress = settings.address || 'القاهرة - مصر';

  const companyPhones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];
  if (companyPhones.length === 0) {
    companyPhones.push('01029190615');
  }

  // Invoice identifiers
  const invoiceNumber = `${invoice.id}`;
  const invoiceDate = invoice.date || new Date().toLocaleDateString('ar-EG');
  const invoiceTime =
    invoice.time ||
    new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });

  // Invoice title
  let invoiceTypeTitle = 'فاتورة مبيعات';
  if (invoice.type === 'nagdi') {
    invoiceTypeTitle = isSaleInv ? 'مبيعات نقدية' : 'مشتريات نقدية';
  } else if (invoice.type === 'ajel') {
    invoiceTypeTitle = isSaleInv ? 'مبيعات آجلة' : 'مشتريات آجلة';
  } else if (invoice.type === 'return_nagdi') {
    invoiceTypeTitle = isSaleInv ? 'مرتجع مبيعات نقدي' : 'مرتجع مشتريات نقدي';
  } else if (invoice.type === 'return_ajel') {
    invoiceTypeTitle = isSaleInv ? 'مرتجع مبيعات آجل' : 'مرتجع مشتريات آجل';
  }

  // Payment method label
  let paymentMethodType = 'نقداً';
  if (invoice.paymentMethod === 'drawer') {
    paymentMethodType = 'نقداً (الخزينة)';
  } else if (invoice.paymentMethod === 'vodafone') {
    paymentMethodType = 'فودافون كاش';
  } else if (invoice.paymentMethod === 'instapay') {
    paymentMethodType = 'إنستاباي (InstaPay)';
  } else if (invoice.paymentMethod === 'bank') {
    paymentMethodType = 'تحويل بنكي';
  } else if (invoice.paymentMethod) {
    paymentMethodType = invoice.paymentMethod;
  }

  // Financial Totals
  const items = invoice.items || [];
  const grandTotal = Number(invoice.total || 0);
  const taxVal = Number(invoice.tax || 0);
  const discountVal = Number(invoice.discount || 0);
  const subtotalBeforeTaxDiscount = grandTotal - taxVal + discountVal;

  let paidVal = Number(invoice.paidAmount);
  let remainingVal = Number(invoice.remainingAmount);
  if (isNaN(paidVal)) {
    if (invoice.type === 'nagdi' || invoice.type === 'return_nagdi') {
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

  const footerTermsNote =
    settings.invoiceFooterNote ||
    (invoice as any).footerNote ||
    'البضاعة المباعة ترجع وتستبدل خلال 14 يوماً بأصل الفاتورة';

  /**
   * 🖨️ Execute window.print() applying the exact unified print stylesheet
   */
  const handlePrint = () => {
    let styleEl = document.getElementById('unified-print-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'unified-print-styles';
      document.head.appendChild(styleEl);
    }

    let pageSizeRule = '@page { size: A5 landscape; margin: 4mm; }';
    if (selectedSize === 'a4') {
      pageSizeRule = '@page { size: A4 portrait; margin: 5mm; }';
    } else if (selectedSize === 'thermal') {
      pageSizeRule = '@page { size: 80mm auto; margin: 0; }';
    }

    styleEl.innerHTML = `
      ${pageSizeRule}
      @media print {
        .preview-toolbar, .no-print, #header, header, nav, aside {
          display: none !important;
        }
        body {
          background: #fff !important;
          margin: 0 !important;
          padding: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body > *:not(#unified-invoice-modal-root) {
          display: none !important;
        }
        #unified-invoice-modal-root {
          position: static !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: visible !important;
          display: block !important;
          width: 100% !important;
          height: auto !important;
        }
        .print-page {
          box-shadow: none !important;
          border: 1px solid #777 !important;
          margin: 0 !important;
          width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
          overflow: hidden !important;
        }
      }
    `;

    document.body.className = `mode-${selectedSize}`;
    setTimeout(() => {
      window.print();
    }, 100);
  };

  /**
   * 💾 Export element to PDF
   */
  const handleSavePdf = async () => {
    if (!invoiceContainerRef.current) return;
    try {
      setIsExportingPdf(true);
      await exportElementToPdf(
        invoiceContainerRef.current,
        `فاتورة_${invoiceNumber}_${selectedSize}.pdf`,
        {
          orientation: selectedSize === 'a5' ? 'landscape' : 'portrait',
          format: selectedSize === 'thermal' ? 'thermal' : selectedSize,
          margin: 4,
        }
      );
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  /**
   * 📋 Copy invoice summary
   */
  const handleCopySummary = () => {
    const summaryText = `📄 ${invoiceTypeTitle} #${invoiceNumber}
🏢 ${companyName}
👤 ${partyLabel}: ${partyName}
📅 التاريخ: ${invoiceDate} ${invoiceTime}
💰 الإجمالي: ${grandTotal.toFixed(2)} ج.م
💵 المدفوع: ${paidVal.toFixed(2)} ج.م
⏳ المتبقي: ${remainingVal.toFixed(2)} ج.م`;

    try {
      navigator.clipboard.writeText(summaryText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {}
  };

  return (
    <div
      id="unified-invoice-modal-root"
      className="fixed inset-0 z-[1000] bg-[#eef2f5] overflow-y-auto text-[#222] font-sans"
      dir="rtl"
    >
      {/* 1. شريط التحكم الموحد (للمعاينة فقط ولا يظهر في الطباعة) */}
      <div
        className="preview-toolbar no-print sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 p-2.5 sm:p-3 bg-[#111] text-white shadow-lg text-xs sm:text-sm font-bold select-none"
      >
        <div className="flex items-center gap-2">
          <span>اختر مقاس العرض والطباعة:</span>
          <select
            id="sizeSelector"
            value={selectedSize}
            onChange={(e) => handleSizeChange(e.target.value as 'a4' | 'a5' | 'thermal')}
            className="bg-white text-slate-900 px-3 py-1.5 rounded font-bold border border-slate-300 outline-none cursor-pointer text-xs sm:text-sm"
          >
            <option value="a4">مقاس ورقة كاملة (A4)</option>
            <option value="a5">مقاس نصف ورقة (A5 - عرضي)</option>
            <option value="thermal">طابعة فواتير حرارية (80mm)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="bg-[#28a745] hover:bg-[#218838] active:bg-[#1e7e34] text-white px-3.5 py-1.5 rounded font-bold cursor-pointer transition flex items-center gap-1.5 shadow-sm"
            title="إعطاء أمر الطباعة المباشر"
          >
            <Printer className="w-4 h-4" />
            <span>🖨️ إعطاء أمر الطباعة الآن</span>
          </button>

          <button
            type="button"
            onClick={handleSavePdf}
            disabled={isExportingPdf}
            className="bg-[#d84315] hover:bg-[#bf360c] active:bg-[#992600] disabled:opacity-50 text-white px-3 py-1.5 rounded font-bold cursor-pointer transition flex items-center gap-1.5 shadow-sm"
            title="حفظ الفاتورة كملف PDF"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingPdf ? 'جارِ التحميل...' : '💾 حفظ PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopySummary}
            className="bg-slate-700 hover:bg-slate-600 text-white p-1.5 rounded font-bold cursor-pointer transition"
            title="نسخ ملخص الفاتورة"
          >
            {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="bg-[#6c757d] hover:bg-[#5a6268] text-white px-3.5 py-1.5 rounded font-bold cursor-pointer transition flex items-center gap-1"
            title="إغلاق المعاينة"
          >
            <X className="w-4 h-4" />
            <span>إغلاق</span>
          </button>
        </div>
      </div>

      {/* 2. حاوية الورقة والمقاس المحدد (A4, A5, Thermal) */}
      <div className="w-full flex justify-center py-4 sm:py-6 px-2 sm:px-4 overflow-x-auto">
        <div
          ref={invoiceContainerRef}
          id="mainDocument"
          className={`print-page ${selectedSize} bg-white transition-all`}
          style={{
            width: selectedSize === 'a4' ? '210mm' : selectedSize === 'a5' ? '210mm' : '80mm',
            minHeight: selectedSize === 'a4' ? '297mm' : selectedSize === 'a5' ? '148mm' : 'auto',
            padding: selectedSize === 'a4' ? '10mm' : selectedSize === 'a5' ? '6mm' : '4mm',
            border: '1px solid #ccc',
            boxShadow: '0 0 15px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            color: '#222',
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            fontSize: selectedSize === 'thermal' ? '9px' : '10px',
            direction: 'rtl',
          }}
        >
          <div>
            {/* الهيدر الموحد */}
            <div
              className="doc-header"
              style={{
                width: '100%',
                borderBottom: '2px solid #222',
                paddingBottom: '6px',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div className="company-info" style={{ textAlign: 'right' }}>
                <h2 style={{ fontSize: selectedSize === 'thermal' ? '13px' : '15px', fontWeight: 'bold', color: '#000', margin: 0 }}>
                  {companyName}
                </h2>
                <p style={{ fontSize: selectedSize === 'thermal' ? '9px' : '10px', color: '#555', margin: '2px 0 0 0' }}>
                  {companyAddress}
                </p>
                <p style={{ fontSize: selectedSize === 'thermal' ? '9px' : '10px', color: '#555', margin: '1px 0 0 0' }}>
                  {companyPhones.join(' - ')}
                </p>
              </div>

              <div className="doc-meta-top" style={{ textAlign: 'left', fontSize: selectedSize === 'thermal' ? '9px' : '10px' }}>
                <div style={{ fontSize: selectedSize === 'thermal' ? '11px' : '13px', fontWeight: 'bold', color: '#000', marginBottom: '2px' }}>
                  {invoiceTypeTitle}
                </div>
                <div><strong>الرقم:</strong> #{invoiceNumber}</div>
                <div><strong>التاريخ:</strong> {invoiceDate} | <strong>الوقت:</strong> {invoiceTime}</div>
              </div>
            </div>

            {/* بطاقة معلومات الحركة (meta-table) */}
            <table
              className="meta-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: '8px',
                fontSize: selectedSize === 'thermal' ? '9px' : '10px',
              }}
            >
              <tbody>
                <tr>
                  <th style={{ border: '1px solid #999', padding: '4px 6px', textAlign: 'right', backgroundColor: '#f1f1f1', fontWeight: 'bold', color: '#333', width: '16%' }}>
                    {partyLabel}:
                  </th>
                  <td style={{ border: '1px solid #999', padding: '4px 6px', textAlign: 'right', width: '34%' }}>
                    {partyName}
                  </td>
                  <th style={{ border: '1px solid #999', padding: '4px 6px', textAlign: 'right', backgroundColor: '#f1f1f1', fontWeight: 'bold', color: '#333', width: '16%' }}>
                    طريقة الدفع:
                  </th>
                  <td style={{ border: '1px solid #999', padding: '4px 6px', textAlign: 'right', width: '34%' }}>
                    {paymentMethodType}
                  </td>
                </tr>
                <tr>
                  <th style={{ border: '1px solid #999', padding: '4px 6px', textAlign: 'right', backgroundColor: '#f1f1f1', fontWeight: 'bold', color: '#333' }}>
                    الهاتف / الكود:
                  </th>
                  <td style={{ border: '1px solid #999', padding: '4px 6px', textAlign: 'right' }}>
                    {partyPhone}
                  </td>
                  <th style={{ border: '1px solid #999', padding: '4px 6px', textAlign: 'right', backgroundColor: '#f1f1f1', fontWeight: 'bold', color: '#333' }}>
                    الفرع / الخزينة:
                  </th>
                  <td style={{ border: '1px solid #999', padding: '4px 6px', textAlign: 'right' }}>
                    {(invoice as any).branchName || 'الفرع الرئيسي'}
                  </td>
                </tr>
                {Boolean(invoice.notes || (invoice as any).note || (invoice as any).description) && (
                  <tr>
                    <th style={{ border: '1px solid #999', padding: '4px 6px', textAlign: 'right', backgroundColor: '#f1f1f1', fontWeight: 'bold', color: '#333' }}>
                      البيان / ملاحظات:
                    </th>
                    <td colSpan={3} style={{ border: '1px solid #999', padding: '4px 6px', textAlign: 'right' }}>
                      {invoice.notes || (invoice as any).note || (invoice as any).description}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* جدول بيانات الحركة الديناميكي (dynamic-table) */}
            <table
              className="dynamic-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: '8px',
                fontSize: selectedSize === 'thermal' ? '9px' : '10px',
              }}
            >
              <thead>
                <tr>
                  <th style={{ backgroundColor: '#e2e6ea', border: '1px solid #777', padding: '5px', textAlign: 'center', fontWeight: 'bold', width: '6%' }}>
                    م
                  </th>
                  <th style={{ backgroundColor: '#e2e6ea', border: '1px solid #777', padding: '5px', textAlign: 'right', fontWeight: 'bold', width: '42%' }}>
                    اسم الصنف / البيان
                  </th>
                  <th style={{ backgroundColor: '#e2e6ea', border: '1px solid #777', padding: '5px', textAlign: 'center', fontWeight: 'bold', width: '13%' }}>
                    الوحدة
                  </th>
                  <th style={{ backgroundColor: '#e2e6ea', border: '1px solid #777', padding: '5px', textAlign: 'center', fontWeight: 'bold', width: '13%' }}>
                    الكمية
                  </th>
                  <th style={{ backgroundColor: '#e2e6ea', border: '1px solid #777', padding: '5px', textAlign: 'center', fontWeight: 'bold', width: '13%' }}>
                    السعر
                  </th>
                  <th style={{ backgroundColor: '#e2e6ea', border: '1px solid #777', padding: '5px', textAlign: 'center', fontWeight: 'bold', width: '13%' }}>
                    الإجمالي
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ border: '1px solid #bbb', padding: '10px', textAlign: 'center', color: '#666' }}>
                      لا توجد أصناف مدخلة في هذه الفاتورة
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
                    const itPrice = Number(item.price || 0);
                    const itQty = Number(item.qty || 0);
                    const itTotal = Number(item.total !== undefined ? item.total : itQty * itPrice);
                    return (
                      <tr key={idx}>
                        <td style={{ border: '1px solid #bbb', padding: '5px', textAlign: 'center' }}>
                          {idx + 1}
                        </td>
                        <td style={{ border: '1px solid #bbb', padding: '5px', textAlign: 'right', fontWeight: 600 }}>
                          {item.name || '-'}
                        </td>
                        <td style={{ border: '1px solid #bbb', padding: '5px', textAlign: 'center' }}>
                          {(item as any).unit || (item as any).spec || '-'}
                        </td>
                        <td style={{ border: '1px solid #bbb', padding: '5px', textAlign: 'center', fontWeight: 'bold' }}>
                          {item.qty}
                        </td>
                        <td style={{ border: '1px solid #bbb', padding: '5px', textAlign: 'center' }}>
                          {itPrice.toFixed(2)}
                        </td>
                        <td style={{ border: '1px solid #bbb', padding: '5px', textAlign: 'center', fontWeight: 'bold' }}>
                          {itTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* ملخص الأرقام والمجاميع (summary-section) */}
            <div
              className="summary-section"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: selectedSize === 'thermal' ? 'wrap' : 'nowrap',
                gap: '6px',
                marginBottom: '8px',
                fontSize: selectedSize === 'thermal' ? '9px' : '10px',
              }}
            >
              <div
                className="summary-box-item"
                style={{
                  flex: 1,
                  minWidth: selectedSize === 'thermal' ? '45%' : 'auto',
                  border: '1px solid #28a745',
                  backgroundColor: '#f8fff9',
                  padding: '5px',
                  textAlign: 'center',
                  borderRadius: '2px',
                }}
              >
                <strong>إجمالي الأصناف:</strong>
                <br />
                <span>{subtotalBeforeTaxDiscount.toFixed(2)} ج.م</span>
              </div>

              {discountVal > 0 && (
                <div
                  className="summary-box-item"
                  style={{
                    flex: 1,
                    minWidth: selectedSize === 'thermal' ? '45%' : 'auto',
                    border: '1px solid #28a745',
                    backgroundColor: '#f8fff9',
                    padding: '5px',
                    textAlign: 'center',
                    borderRadius: '2px',
                  }}
                >
                  <strong>الخصم:</strong>
                  <br />
                  <span>{discountVal.toFixed(2)} ج.م</span>
                </div>
              )}

              {taxVal > 0 && (
                <div
                  className="summary-box-item"
                  style={{
                    flex: 1,
                    minWidth: selectedSize === 'thermal' ? '45%' : 'auto',
                    border: '1px solid #28a745',
                    backgroundColor: '#f8fff9',
                    padding: '5px',
                    textAlign: 'center',
                    borderRadius: '2px',
                  }}
                >
                  <strong>الضريبة:</strong>
                  <br />
                  <span>{taxVal.toFixed(2)} ج.م</span>
                </div>
              )}

              <div
                className="summary-box-item"
                style={{
                  flex: 1.2,
                  minWidth: selectedSize === 'thermal' ? '100%' : 'auto',
                  border: '2px solid #28a745',
                  backgroundColor: '#eafaf1',
                  padding: '5px',
                  textAlign: 'center',
                  borderRadius: '2px',
                }}
              >
                <strong style={{ fontSize: '11px', color: '#155724' }}>الصافي النهائي:</strong>
                <br />
                <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#1e7e34' }}>
                  {grandTotal.toFixed(2)} ج.م
                </span>
              </div>

              <div
                className="summary-box-item"
                style={{
                  flex: 1,
                  minWidth: selectedSize === 'thermal' ? '45%' : 'auto',
                  border: '1px solid #28a745',
                  backgroundColor: '#f8fff9',
                  padding: '5px',
                  textAlign: 'center',
                  borderRadius: '2px',
                }}
              >
                <strong>المدفوع:</strong>
                <br />
                <span>{paidVal.toFixed(2)} ج.م</span>
              </div>

              <div
                className="summary-box-item"
                style={{
                  flex: 1,
                  minWidth: selectedSize === 'thermal' ? '45%' : 'auto',
                  border: '1px solid #28a745',
                  backgroundColor: '#f8fff9',
                  padding: '5px',
                  textAlign: 'center',
                  borderRadius: '2px',
                }}
              >
                <strong>المتبقي:</strong>
                <br />
                <span>{remainingVal.toFixed(2)} ج.م</span>
              </div>
            </div>
          </div>

          {/* التذييل والتوقيعات (doc-footer) */}
          <div
            className="doc-footer"
            style={{
              marginTop: 'auto',
              borderTop: '1px dashed #777',
              paddingTop: '8px',
            }}
          >
            {selectedSize !== 'thermal' && (
              <table
                className="signatures-grid"
                style={{
                  width: '100%',
                  fontSize: '9px',
                  borderCollapse: 'collapse',
                  marginBottom: '6px',
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ textAlign: 'center', width: '33.33%', paddingTop: '5px' }}>
                      <strong>توقيع المستلم</strong>
                      <br />
                      <br />
                      ...................
                    </td>
                    <td style={{ textAlign: 'center', width: '33.33%', paddingTop: '5px' }}>
                      <strong>توقيع المحاسب</strong>
                      <br />
                      <br />
                      ...................
                    </td>
                    <td style={{ textAlign: 'center', width: '33.33%', paddingTop: '5px' }}>
                      <strong>توقيع المدير العام</strong>
                      <br />
                      <br />
                      ...................
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            <div
              className="footer-note"
              style={{
                fontSize: '8px',
                color: '#555',
                textAlign: 'center',
                marginTop: '5px',
                borderTop: '1px solid #eee',
                paddingTop: '3px',
              }}
            >
              <div>{footerTermsNote}</div>
              <div style={{ marginTop: '2px', color: '#777', fontSize: '7.5px' }}>
                حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت01029190615
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

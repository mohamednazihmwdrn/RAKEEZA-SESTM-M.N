import React, { useState, useRef } from 'react';
import { AppData, SaleInvoice, PurchaseInvoice, Settings } from '../types';
import { printInvoiceWindow } from '../utils/printInvoice';
import { exportElementToPdf } from '../utils/pdfExport';
import { resolveInvoiceFinancials } from '../services/centralizedPrintService';
import { Printer, Download } from 'lucide-react';

interface InvoiceCardTemplateProps {
  invoice: SaleInvoice | PurchaseInvoice;
  isSales: boolean;
  settings: Settings;
  appData?: AppData;
  onPrint?: () => void;
  onPrintFormat?: (format: 'A4' | 'A5' | '80mm') => void;
  onClose?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function fmtSmart(n: number): string {
  const val = Number(n || 0);
  if (!Number.isFinite(val)) return '0';
  if (Math.abs(val - Math.round(val)) < 0.005) {
    return Math.round(val).toLocaleString('en-US');
  }
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const InvoiceCardTemplate: React.FC<InvoiceCardTemplateProps> = ({
  invoice,
  isSales,
  settings,
  appData,
  onPrintFormat,
  onClose,
  onEdit,
  onDelete,
}) => {
  const [paperSize, setPaperSize] = useState<'A5' | 'A4' | 'thermal'>('A5');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const invoiceContainerRef = useRef<HTMLDivElement>(null);

  const handlePrintWithSize = (size: 'A4' | 'A5' | 'thermal') => {
    if (onPrintFormat) {
      onPrintFormat(size === 'thermal' ? '80mm' : size);
    } else {
      printInvoiceWindow(invoice, isSales, settings, undefined, size === 'thermal' ? '80mm' : size, appData);
    }
  };

  const handleExportPdf = async () => {
    if (invoiceContainerRef.current) {
      try {
        setIsExportingPdf(true);
        const formatName = paperSize === 'A4' ? 'a4' : paperSize === 'thermal' ? 'thermal' : 'a5';
        const serial = invoice.id || '1';
        await exportElementToPdf(invoiceContainerRef.current, `فاتورة_${serial}.pdf`, {
          format: formatName,
          orientation: 'portrait',
          margin: paperSize === 'thermal' ? 2 : 4,
          scale: 2,
        });
      } catch (err) {
        console.error('PDF export error:', err);
        handlePrintWithSize(paperSize);
      } finally {
        setIsExportingPdf(false);
      }
    } else {
      handlePrintWithSize(paperSize);
    }
  };

  const isSaleInv = isSales;
  const partyLabel = isSaleInv ? 'اسم العميل' : 'اسم المورد';
  const partyCodeLabel = isSaleInv ? 'كود العميل' : 'كود المورد';
  const partyName = isSaleInv
    ? (invoice as SaleInvoice).customerName || 'عميل نقدي'
    : (invoice as PurchaseInvoice).supplierName || 'مورد عام';
  const partyCode =
    (invoice as any).customerCode ||
    (invoice as any).supplierCode ||
    (invoice as any).customerId ||
    (invoice as any).supplierId ||
    '1';
  const partyPhone = invoice.phone || (invoice as any).customerPhone || (invoice as any).supplierPhone || '';

  const companyName = settings.companyName || 'المنظومة المحاسبية';
  const branchName = (invoice as any).branchName || 'الفرع الرئيسي';
  const logoUrl = settings.showLogoInPrint !== false ? (settings as any).logo || (settings as any).logoUrl || '' : '';
  const companyPhones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];
  const curSymbol = settings.currencySymbol || 'ج.م';

  const invoiceNumber = `${invoice.id}`;
  const invoiceDate = invoice.date || new Date().toISOString().split('T')[0];
  const invoiceTime =
    invoice.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const fin = resolveInvoiceFinancials(invoice);
  const isWholesale =
    (invoice as any).salesType === 'wholesale' || (invoice as any).purchaseType === 'wholesale';

  let invoiceTypeTitle = isSaleInv ? 'بيان مبيعات' : 'بيان مشتريات';
  if (fin.isReturn) {
    invoiceTypeTitle = isSaleInv
      ? invoice.type === 'return_nagdi'
        ? 'مرتجع مبيعات نقدي'
        : 'مرتجع مبيعات آجل'
      : invoice.type === 'return_nagdi'
      ? 'مرتجع مشتريات نقدي'
      : 'مرتجع مشتريات آجل';
  } else if (isWholesale) {
    invoiceTypeTitle = isSaleInv
      ? invoice.type === 'ajel'
        ? 'مبيعات جملة آجلة'
        : 'مبيعات جملة نقدية'
      : invoice.type === 'ajel'
      ? 'مشتريات جملة آجلة'
      : 'مشتريات جملة نقدية';
  } else if (invoice.type === 'nagdi') {
    invoiceTypeTitle = isSaleInv ? 'فاتورة مبيعات نقدية' : 'فاتورة مشتريات نقدية';
  } else if (invoice.type === 'ajel') {
    invoiceTypeTitle = isSaleInv ? 'فاتورة مبيعات آجلة' : 'فاتورة مشتريات آجلة';
  }

  const items = invoice.items || [];
  const totalQty = items.reduce((s, it) => s + Number((it as any).quantity ?? it.qty ?? 0), 0);
  const hasAdjustments =
    fin.discountVal > 0.01 || fin.taxVal > 0.01 || fin.extraChargesVal > 0.01;
  const footerTermsNote =
    settings.invoiceFooterNote ||
    (invoice as any).footerNote ||
    'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً لحالتها الأصلية';

  const isThermal = paperSize === 'thermal';
  const sizeBadge = paperSize === 'A4' ? 'مقاس A4' : isThermal ? 'حراري 80mm' : 'مقاس A5';

  return (
    <div className="space-y-3 w-full overflow-x-hidden" dir="rtl">
      {/* Paper Size Selector + Actions (No Horizontal Scroll) */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 sm:p-3 space-y-2.5 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
              {invoiceTypeTitle} (#{invoiceNumber})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="min-h-[36px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                ✏️ تعديل
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="min-h-[36px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                🗑️ حذف
              </button>
            )}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center transition cursor-pointer disabled:opacity-50"
              title="حفظ PDF"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handlePrintWithSize(paperSize)}
              className="min-h-[36px] bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة ({sizeBadge})</span>
            </button>
          </div>
        </div>

        {/* 3-Option Paper Size Segmented Switcher */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-600 shrink-0">حجم الورق:</span>
          <div className="flex-1 bg-slate-100 p-1 rounded-xl grid grid-cols-3 gap-1">
            {[
              { id: 'A5' as const, label: 'مقاس A5 (نصف ورقة - افتراضي)' },
              { id: 'A4' as const, label: 'مقاس A4 (ورقة كاملة)' },
              { id: 'thermal' as const, label: 'حراري (80mm)' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPaperSize(opt.id)}
                className={`min-h-[36px] px-1.5 py-1 rounded-lg text-[10.5px] sm:text-xs font-semibold leading-tight text-center transition cursor-pointer flex items-center justify-center ${
                  paperSize === opt.id
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

      {/* Preview Sheet Area (Zero Horizontal Scroll) */}
      <div className="w-full flex flex-col items-center py-3 px-2 bg-slate-100 rounded-xl border border-slate-200 overflow-x-hidden">
        <div
          ref={invoiceContainerRef}
          className={`bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm w-full transition-all ${
            isThermal ? 'max-w-[80mm] p-2.5 text-[11px]' : paperSize === 'A4' ? 'max-w-[210mm] p-4 sm:p-6 text-xs' : 'max-w-[148mm] p-3 sm:p-5 text-xs'
          }`}
        >
          {/* Header */}
          {isThermal ? (
            <div className="flex flex-col items-center text-center gap-1 pb-2 border-b border-dashed border-slate-400">
              {logoUrl && <img src={logoUrl} alt={companyName} className="h-10 w-auto max-w-[72px] object-contain" />}
              <h2 className="text-sm font-bold text-slate-900">{companyName}</h2>
              <p className="text-[10.5px] text-slate-600">{branchName}</p>
              {companyPhones.map((ph, i) => (
                <div key={i} className="text-[10px] text-slate-700 financial-num">
                  هاتف {companyPhones.length > 1 ? `${i + 1}: ` : ': '}<span dir="ltr">{ph}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex-1 min-w-0 text-right">
                <h2 className="text-[13px] sm:text-base font-bold text-slate-900 leading-snug break-words">
                  {companyName}
                </h2>
                <p className="text-[10.5px] sm:text-xs text-slate-500 mt-0.5">{branchName}</p>
              </div>
              {logoUrl && (
                <div className="shrink-0 flex items-center justify-center px-1">
                  <img src={logoUrl} alt={companyName} className="h-10 sm:h-12 max-w-[76px] object-contain" />
                </div>
              )}
              <div className="shrink-0 text-left text-[10px] sm:text-[11px] text-slate-700 leading-snug tabular-nums space-y-0.5">
                {companyPhones.map((ph, i) => (
                  <div key={i}>
                    <span className="text-slate-500">{companyPhones.length > 1 ? `هاتف ${i + 1}: ` : 'هاتف: '}</span>
                    <span dir="ltr" className="font-medium text-slate-900">{ph}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3-Column Rounded Meta Box */}
          {isThermal ? (
            <div className="border border-dashed border-slate-400 rounded p-1.5 my-1.5 text-[10.5px] bg-slate-50/40 text-center space-y-0.5">
              <div className="font-bold">{invoiceTypeTitle} · رقم: {invoiceNumber}</div>
              <div>{partyLabel}: <strong>{partyName}</strong></div>
              <div className="text-[10px] text-slate-600 financial-num">{invoiceDate} · {invoiceTime}</div>
            </div>
          ) : (
            <div className="border border-slate-300 rounded-lg my-2 px-2 py-1.5 bg-slate-50/40 grid grid-cols-3 gap-1.5 items-center divide-x divide-x-reverse divide-slate-200 text-[10px] sm:text-xs">
              <div className="pl-1.5 text-right space-y-0.5 min-w-0">
                <div className="truncate">
                  <span className="text-slate-500">{partyCodeLabel}: </span>
                  <span className="font-semibold financial-num">{partyCode}</span>
                </div>
                <div className="break-words leading-snug">
                  <span className="text-slate-500">{partyLabel}: </span>
                  <span className="font-semibold">{partyName}</span>
                </div>
                {partyPhone && partyPhone !== '-' && (
                  <div className="truncate">
                    <span className="text-slate-500">هاتف: </span>
                    <span dir="ltr" className="financial-num">{partyPhone}</span>
                  </div>
                )}
              </div>
              <div className="px-1.5 text-center space-y-0.5 min-w-0">
                <div className="font-semibold text-slate-900 leading-tight break-words">{invoiceTypeTitle}</div>
                <div className="font-bold financial-num">رقم: {invoiceNumber}</div>
              </div>
              <div className="pr-1.5 text-left space-y-0.5 min-w-0">
                <div>
                  <span className="text-slate-500">التاريخ: </span>
                  <span dir="ltr" className="font-semibold financial-num">{invoiceDate}</span>
                </div>
                <div>
                  <span className="text-slate-500">الوقت: </span>
                  <span dir="ltr" className="font-medium financial-num">{invoiceTime}</span>
                </div>
              </div>
            </div>
          )}

          {/* Items Table (5 clean columns for A5/A4, 4 for thermal - zero overflow) */}
          <div className="border border-slate-300 rounded-lg overflow-hidden my-2">
            {isThermal ? (
              <table className="w-full table-fixed border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="border-l border-slate-200 p-1 text-right w-[44%]">الصنف</th>
                    <th className="border-l border-slate-200 p-1 text-center w-[14%]">العدد</th>
                    <th className="border-l border-slate-200 p-1 text-center w-[20%]">السعر</th>
                    <th className="p-1 text-center w-[22%]">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, idx) => {
                    const qty = Number((item as any).quantity ?? item.qty ?? 0);
                    const price = Number(item.price || 0);
                    const total = Number(item.total !== undefined ? item.total : qty * price);
                    return (
                      <tr key={idx}>
                        <td className="border-l border-slate-200 p-1 text-right font-medium break-words">{item.name}</td>
                        <td className="border-l border-slate-200 p-1 text-center financial-num">{qty}</td>
                        <td className="border-l border-slate-200 p-1 text-center financial-num">{fmtSmart(price)}</td>
                        <td className="p-1 text-center font-semibold financial-num">{fmtSmart(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full table-fixed border-collapse text-[10.5px] sm:text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="border-l border-slate-200 px-1.5 py-1.5 text-center w-[36%]">اسم الصنف</th>
                    <th className="border-l border-slate-200 px-1 py-1.5 text-center w-[18%]">البيان</th>
                    <th className="border-l border-slate-200 px-1 py-1.5 text-center w-[12%]">العدد</th>
                    <th className="border-l border-slate-200 px-1 py-1.5 text-center w-[16%]">السعر</th>
                    <th className="px-1 py-1.5 text-center w-[18%]">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, idx) => {
                    const qty = Number((item as any).quantity ?? item.qty ?? 0);
                    const price = Number(item.price || 0);
                    const total = Number(item.total !== undefined ? item.total : qty * price);
                    const spec = (item as any).spec || (item as any).notes || (item as any).desc || '';
                    const specOrUnit = spec && spec !== '-' ? spec : '';
                    return (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}>
                        <td className="border-l border-slate-200 px-1.5 py-1.5 text-center sm:text-right font-medium break-words">
                          {item.name}
                        </td>
                        <td className="border-l border-slate-200 px-1 py-1.5 text-center text-slate-700 break-words">
                          {specOrUnit}
                        </td>
                        <td className="border-l border-slate-200 px-1 py-1.5 text-center font-medium financial-num">
                          {qty}
                        </td>
                        <td className="border-l border-slate-200 px-1 py-1.5 text-center financial-num">
                          {fmtSmart(price)}
                        </td>
                        <td className="px-1 py-1.5 text-center font-semibold financial-num">
                          {fmtSmart(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Totals & Payment */}
          <div className="border-t border-slate-300 mt-1.5 text-[11px] sm:text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-slate-200">
              <span className="text-slate-600 font-medium">إجمالي الكميات:</span>
              <span className="font-bold financial-num">{fmtSmart(totalQty)}</span>
            </div>

            {hasAdjustments && (
              <div className="py-1 border-b border-slate-200 space-y-0.5 text-[10.5px] text-slate-600">
                <div className="flex justify-between items-center">
                  <span>المجموع الفرعي:</span>
                  <span className="financial-num">{fmtSmart(fin.subtotalVal)} {curSymbol}</span>
                </div>
                {fin.discountVal > 0.01 && (
                  <div className="flex justify-between items-center text-rose-700">
                    <span>الخصم:</span>
                    <span className="financial-num">-{fmtSmart(fin.discountVal)} {curSymbol}</span>
                  </div>
                )}
                {fin.taxVal > 0.01 && (
                  <div className="flex justify-between items-center">
                    <span>الضريبة:</span>
                    <span className="financial-num">+{fmtSmart(fin.taxVal)} {curSymbol}</span>
                  </div>
                )}
                {fin.extraChargesVal > 0.01 && (
                  <div className="flex justify-between items-center">
                    <span>{invoice.extraRevenueName || 'مصاريف إضافية'}:</span>
                    <span className="financial-num">+{fmtSmart(fin.extraChargesVal)} {curSymbol}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-300 font-bold text-xs sm:text-sm">
              <span>{fin.isReturn ? 'إجمالي المرتجع:' : 'إجمالي الفاتورة:'}</span>
              <span className="financial-num">{fmtSmart(fin.grandTotal)} {curSymbol}</span>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2 py-1.5 border-b border-dashed border-slate-300">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600 font-medium">طريقة الدفع:</span>
                <span className="inline-block border border-slate-400 rounded-md px-2 py-0.5 bg-slate-50 font-semibold text-[10.5px]">
                  {fin.paymentMethodLabel}
                </span>
              </div>
              <div className="font-semibold financial-num">
                <span className="text-slate-600 font-medium">{fin.isReturn ? 'المردود نقداً: ' : 'المدفوع: '}</span>
                <strong>{fmtSmart(fin.paidVal)} {curSymbol}</strong>
              </div>
            </div>

            {fin.remainingVal > 0.01 && (
              <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-300 font-semibold text-rose-700">
                <span>{fin.isReturn ? 'المخصوم على الحساب:' : 'المتبقي (آجل):'}</span>
                <span className="financial-num">{fmtSmart(fin.remainingVal)} {curSymbol}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-2.5 pt-2 border-t border-dashed border-slate-300 text-center space-y-0.5">
            <div className="text-[10px] sm:text-[11px] font-medium text-slate-700">{footerTermsNote}</div>
            <div className="text-[9.5px] sm:text-[10px] text-slate-500">
              جميع حقوق الملكية محفوظة لمطور النظام Mohamed Nazih ت 01029190615
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sticky Bar inside Modal */}
      <div className="flex items-center gap-2 pt-1 print:hidden">
        <button
          type="button"
          onClick={() => handlePrintWithSize(paperSize)}
          className="flex-1 min-h-[42px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Printer className="w-4 h-4 shrink-0" />
          <span>طباعة الفاتورة الآن ({sizeBadge})</span>
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm transition cursor-pointer"
          >
            إغلاق
          </button>
        )}
      </div>
    </div>
  );
};

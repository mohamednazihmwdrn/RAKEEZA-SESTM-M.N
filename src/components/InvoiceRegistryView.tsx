import React, { useMemo, useState, useEffect } from 'react';
import {
  Layers,
  Printer,
  FileSpreadsheet,
  Search,
  Filter,
  RotateCcw,
  Eye,
  AlertTriangle,
  CheckSquare,
  Square,
  SlidersHorizontal,
  ArrowUpRight,
} from 'lucide-react';
import { AppData } from '../types';
import {
  InvoiceCategoryKey,
  WholesalePaymentMode,
  INVOICE_CATEGORIES,
  ClassifiedInvoiceRecord,
  classifyAllInvoices,
  filterClassifiedRecords,
  computeRegisterSummary,
} from '../utils/invoiceClassification';
import { openBatchInvoicesPrint } from '../services/centralizedPrintService';
import { printInvoiceWindow } from '../utils/printInvoice';
import { exportToExcel } from '../utils/excelExport';

interface InvoiceRegistryViewProps {
  appData: AppData;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  initialCategory?: InvoiceCategoryKey;
  onInspectItem?: (type: string, data: any) => void;
  onNavigate?: (page: string) => void;
}

export const InvoiceRegistryView: React.FC<InvoiceRegistryViewProps> = ({
  appData,
  showToast,
  initialCategory = 'sales_cash',
  onInspectItem,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<InvoiceCategoryKey>(initialCategory);

  // Filter states
  const [showFilters, setShowFilters] = useState<boolean>(true);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [partyQuery, setPartyQuery] = useState<string>('');
  const [productQuery, setProductQuery] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('all');
  const [paymentStatus, setPaymentStatus] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [treasuryOrBank, setTreasuryOrBank] = useState<string>('all');
  const [branchId, setBranchId] = useState<string>('all');
  const [wholesalePaymentFilter, setWholesalePaymentFilter] = useState<'all' | WholesalePaymentMode>('all');
  const [returnKindFilter, setReturnKindFilter] = useState<'all' | 'full' | 'partial'>('all');

  // Batch selection & print options
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [includeSummarySheet, setIncludeSummarySheet] = useState<boolean>(false);

  const curSymbol = appData.settings?.currencySymbol || 'ج.م';

  // Read-only classification of all non-cancelled sales & purchase invoices
  const allClassified = useMemo(() => classifyAllInvoices(appData), [appData]);

  // Live category counts across entire company dataset
  const categoryCounts = useMemo(() => {
    const counts: Record<InvoiceCategoryKey, number> = {
      sales_cash: 0,
      sales_credit: 0,
      sales_wholesale: 0,
      sales_returns: 0,
      purchases_cash: 0,
      purchases_credit: 0,
      purchases_returns: 0,
      needs_review: 0,
    };
    for (const rec of allClassified) {
      counts[rec.category] = (counts[rec.category] || 0) + 1;
    }
    return counts;
  }, [allClassified]);

  // Available distinct treasury/bank options inside records
  const availableTreasuries = useMemo(() => {
    const set = new Set<string>();
    for (const r of allClassified) {
      if (r.treasuryOrBank) set.add(r.treasuryOrBank);
    }
    return Array.from(set);
  }, [allClassified]);

  // Filtered records for active tab
  const filteredRecords = useMemo(() => {
    return filterClassifiedRecords(allClassified, {
      category: activeTab,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      invoiceNumber: invoiceNumber || undefined,
      partyQuery: partyQuery || undefined,
      productQuery: productQuery || undefined,
      paymentMethod,
      paymentStatus,
      treasuryOrBank,
      branchId,
      wholesalePaymentFilter,
      returnKindFilter,
    });
  }, [
    allClassified,
    activeTab,
    startDate,
    endDate,
    invoiceNumber,
    partyQuery,
    productQuery,
    paymentMethod,
    paymentStatus,
    treasuryOrBank,
    branchId,
    wholesalePaymentFilter,
    returnKindFilter,
  ]);

  // Dynamic register KPI totals (no return double-counting)
  const registerSummary = useMemo(
    () => computeRegisterSummary(filteredRecords, activeTab),
    [filteredRecords, activeTab]
  );

  // Clear stale selections when active tab or filtered dataset changes significantly
  useEffect(() => {
    const visibleSet = new Set(filteredRecords.map((r) => r.uid));
    setSelectedUids((prev) => prev.filter((id) => visibleSet.has(id)));
  }, [filteredRecords]);

  const activeCategoryMeta = INVOICE_CATEGORIES.find((c) => c.key === activeTab) || INVOICE_CATEGORIES[0];

  const selectedRecords = useMemo(() => {
    const set = new Set(selectedUids);
    return filteredRecords.filter((r) => set.has(r.uid));
  }, [filteredRecords, selectedUids]);

  const isAllVisibleSelected =
    filteredRecords.length > 0 && selectedUids.length === filteredRecords.length;

  const toggleSelectAll = () => {
    if (isAllVisibleSelected) {
      setSelectedUids([]);
    } else {
      setSelectedUids(filteredRecords.map((r) => r.uid));
    }
  };

  const toggleSelectOne = (uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setInvoiceNumber('');
    setPartyQuery('');
    setProductQuery('');
    setPaymentMethod('all');
    setPaymentStatus('all');
    setTreasuryOrBank('all');
    setBranchId('all');
    setWholesalePaymentFilter('all');
    setReturnKindFilter('all');
  };

  const hasActiveFilter =
    Boolean(startDate || endDate || invoiceNumber || partyQuery || productQuery) ||
    paymentMethod !== 'all' ||
    paymentStatus !== 'all' ||
    treasuryOrBank !== 'all' ||
    branchId !== 'all' ||
    wholesalePaymentFilter !== 'all' ||
    returnKindFilter !== 'all';

  const handlePrintSingleModeA = (rec: ClassifiedInvoiceRecord) => {
    printInvoiceWindow(
      rec.invoice,
      rec.domain === 'sale',
      appData.settings,
      showToast,
      'A5',
      appData
    );
  };

  const handlePrintBatchSelected = () => {
    if (selectedRecords.length === 0) {
      showToast('يرجى تحديد فاتورة واحدة على الأقل للطباعة المجمعة', 'warning');
      return;
    }
    openBatchInvoicesPrint(selectedRecords, {
      title: `سجل ${activeCategoryMeta.label} (${selectedRecords.length} مستند محدد)`,
      subtitle: `طباعة مجمعة مستقلة لكل فاتورة · التصنيف: ${activeCategoryMeta.label}`,
      settings: appData.settings,
      appData,
      preferredPaperSize: 'a5-portrait',
      includeSummarySheet,
      summaryStats: computeRegisterSummary(selectedRecords, activeTab),
    });
  };

  const handlePrintBatchAllFiltered = () => {
    if (filteredRecords.length === 0) {
      showToast('لا توجد مستندات مطابقة للفلتر الحالي للطباعة', 'warning');
      return;
    }
    openBatchInvoicesPrint(filteredRecords, {
      title: `سجل ${activeCategoryMeta.label} (${filteredRecords.length} مستند)`,
      subtitle: hasActiveFilter
        ? `النتائج المصفاة لتصنيف ${activeCategoryMeta.label}`
        : `كافة مستندات تصنيف ${activeCategoryMeta.label}`,
      settings: appData.settings,
      appData,
      preferredPaperSize: 'a5-portrait',
      includeSummarySheet,
      summaryStats: registerSummary,
    });
  };

  const handleExportRegisterExcel = () => {
    const source = selectedRecords.length > 0 ? selectedRecords : filteredRecords;
    if (source.length === 0) {
      showToast('لا توجد بيانات للتصدير', 'warning');
      return;
    }
    exportToExcel({
      filename: `سجل_${activeCategoryMeta.shortLabel}_${new Date().toISOString().split('T')[0]}`,
      sheetName: activeCategoryMeta.shortLabel.slice(0, 30),
      data: source,
      columns: [
        { header: 'رقم الفاتورة', key: 'docNumber', width: 14, isNumeric: true },
        { header: 'التاريخ', key: 'date', width: 14 },
        { header: 'الوقت', key: 'time', width: 12 },
        { header: 'التصنيف المحاسبي', key: 'categoryLabel', width: 20 },
        { header: 'العميل / المورد', key: 'partyName', width: 26 },
        { header: 'الكود', key: 'partyCode', width: 14 },
        { header: 'الهاتف', key: 'partyPhone', width: 16 },
        { header: 'الفرع', key: 'branchName', width: 18 },
        { header: 'وسيلة الدفع', key: 'paymentMethodLabel', width: 16 },
        { header: 'الخزينة / البنك', key: 'treasuryOrBank', width: 22 },
        { header: 'حالة السداد', key: 'paymentStatusLabel', width: 18 },
        { header: 'الإجمالي الصافي', key: 'grossTotal', width: 16, isCurrency: true },
        { header: 'المدفوع / المحصل', key: 'paidAmount', width: 16, isCurrency: true },
        { header: 'المتبقي', key: 'remainingAmount', width: 16, isCurrency: true },
        {
          header: 'مرجع المرتجع / ملاحظات',
          getValue: (r: ClassifiedInvoiceRecord) =>
            r.originalInvoiceId
              ? `مرتجع من #${r.originalInvoiceId} (${r.returnKindLabel || ''})`
              : r.invoice.notes || '',
          width: 28,
        },
      ],
      companyName: appData.settings?.companyName,
      reportTitle: `سجل ${activeCategoryMeta.label}`,
      currencySymbol: curSymbol,
    });
    showToast(`تم تصدير ${source.length} مستند إلى Excel بنجاح`, 'success');
  };

  const handleInspectRecord = (rec: ClassifiedInvoiceRecord) => {
    if (onInspectItem) {
      onInspectItem(rec.domain === 'sale' ? 'sale' : 'purchase', rec.invoice);
    } else {
      handlePrintSingleModeA(rec);
    }
  };

  const formatMoney = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isReturnTab = activeTab === 'sales_returns' || activeTab === 'purchases_returns';
  const isWholesaleTab = activeTab === 'sales_wholesale';

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col space-y-4" dir="rtl">
      {/* Top Registry Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">
              سجل الفواتير المصنف والطباعة المجمعة
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              تصنيف محاسبي مستقل لكل سجل (نقدي، آجل، جملة، مرتجعات، مراجعة) مع طباعة فردية (Mode A) أو مجمعة مستقلة لكل فاتورة (Mode B) دون أي تعديل على الدفاتر.
            </p>
          </div>
        </div>

        {onNavigate && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => onNavigate('sales')}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
              <span>فواتير المبيعات</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('purchases')}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
              <span>فواتير المشتريات</span>
            </button>
          </div>
        )}
      </div>

      {/* 8 Independent Categorized Register Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-2">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {INVOICE_CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.key] || 0;
            const isActive = activeTab === cat.key;
            const isReviewAlert = cat.key === 'needs_review' && count > 0;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => {
                  setActiveTab(cat.key);
                  setSelectedUids([]);
                }}
                className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? isReviewAlert
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-900 text-white'
                    : isReviewAlert
                    ? 'text-amber-800 hover:bg-amber-50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {cat.key === 'needs_review' && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                <span>{cat.shortLabel}</span>
                <span
                  className={`text-[11px] tabular-nums ${
                    isActive
                      ? 'text-slate-200'
                      : isReviewAlert
                      ? 'text-amber-700 font-semibold'
                      : 'text-slate-400'
                  }`}
                >
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Register Subtitle + Sub-filters for Wholesale / Returns */}
        <div className="mt-2 pt-2.5 px-2 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <span className="font-semibold text-slate-900">{activeCategoryMeta.label}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>{activeCategoryMeta.description}</span>
          </div>

          {isWholesaleTab && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start md:self-auto">
              {[
                { id: 'all', label: 'كل الجملة' },
                { id: 'cash', label: 'جملة كاش' },
                { id: 'partial', label: 'مدفوعة جزئياً' },
                { id: 'credit', label: 'جملة آجل' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setWholesalePaymentFilter(opt.id as any)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition whitespace-nowrap shrink-0 cursor-pointer ${
                    wholesalePaymentFilter === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {isReturnTab && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start md:self-auto">
              {[
                { id: 'all', label: 'كل المرتجعات' },
                { id: 'full', label: 'مرتجع كلي' },
                { id: 'partial', label: 'مرتجع جزئي' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setReturnKindFilter(opt.id as any)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition whitespace-nowrap shrink-0 cursor-pointer ${
                    returnKindFilter === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Register KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 tabular-nums">
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[11px] text-slate-500">عدد المستندات</div>
          <div className="text-base font-semibold text-slate-900 mt-0.5">{registerSummary.count}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[11px] text-slate-500">المجموع الفرعي</div>
          <div className="text-base font-semibold text-slate-900 mt-0.5">
            {formatMoney(registerSummary.subtotalSum)} <span className="text-[11px] font-normal text-slate-500">{curSymbol}</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[11px] text-slate-500">الخصومات / الضرائب</div>
          <div className="text-sm font-semibold text-slate-700 mt-0.5">
            -{formatMoney(registerSummary.discountSum)} / +{formatMoney(registerSummary.taxSum)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[11px] text-slate-500">
            {isReturnTab ? 'المردود نقدياً' : 'المدفوع / المحصل'}
          </div>
          <div className="text-base font-semibold text-emerald-700 mt-0.5">
            {formatMoney(registerSummary.paidSum)} <span className="text-[11px] font-normal text-slate-500">{curSymbol}</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[11px] text-slate-500">
            {isReturnTab ? 'المسوّى على الحساب' : 'المتبقي المستحق'}
          </div>
          <div className="text-base font-semibold text-amber-700 mt-0.5">
            {formatMoney(registerSummary.remainingSum)} <span className="text-[11px] font-normal text-slate-500">{curSymbol}</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-[11px] text-slate-500">
            {isReturnTab ? 'إجمالي قيمة المرتجعات' : 'صافي السجل المعتمد'}
          </div>
          <div className="text-base font-semibold text-slate-900 mt-0.5">
            {formatMoney(registerSummary.netAfterReturns)} <span className="text-[11px] font-normal text-slate-500">{curSymbol}</span>
          </div>
        </div>
      </div>

      {/* Filters & Batch Printing Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3">
        {/* Top Action Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`min-h-[40px] px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                showFilters || hasActiveFilter
                  ? 'border-slate-900 bg-slate-50 text-slate-900'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>فلاتر البحث المتقدم</span>
            </button>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-rose-700 hover:bg-rose-50 flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>مسح الفلاتر</span>
              </button>
            )}

            <span className="text-xs text-slate-500 px-1 tabular-nums">
              المعروض: <strong className="text-slate-900">{filteredRecords.length}</strong> مستند
              {selectedRecords.length > 0 && (
                <>
                  <span aria-hidden="true" className="mx-1.5 text-slate-300">·</span>
                  المحدد: <strong className="text-blue-700">{selectedRecords.length}</strong>
                </>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none px-2 py-1.5 rounded-lg hover:bg-slate-50">
              <input
                type="checkbox"
                checked={includeSummarySheet}
                onChange={(e) => setIncludeSummarySheet(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
              />
              <span className="whitespace-nowrap">تضمين ورقة ملخص السجل</span>
            </label>

            <button
              type="button"
              onClick={handlePrintBatchSelected}
              disabled={selectedRecords.length === 0}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              title="طباعة الفواتير المحددة بشكل مستقل ومفصل لكل فاتورة (Mode B)"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>طباعة المحدد ({selectedRecords.length})</span>
            </button>

            <button
              type="button"
              onClick={handlePrintBatchAllFiltered}
              disabled={filteredRecords.length === 0}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              title="طباعة كافة فواتير السجل المصفى كوثائق مستقلة متتالية (Mode B)"
            >
              <Printer className="w-4 h-4 shrink-0 text-slate-600" />
              <span>طباعة السجل ({filteredRecords.length})</span>
            </button>

            <button
              type="button"
              onClick={handleExportRegisterExcel}
              disabled={filteredRecords.length === 0}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-emerald-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>تصدير Excel</span>
            </button>
          </div>
        </div>

        {/* Multi-criteria Filter Grid */}
        {showFilters && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">من تاريخ</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">إلى تاريخ</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">رقم الفاتورة</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="مثال: 25"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full min-h-[38px] pr-8 pl-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">العميل / المورد / الكود</label>
              <input
                type="text"
                placeholder="الاسم، الكود أو الهاتف..."
                value={partyQuery}
                onChange={(e) => setPartyQuery(e.target.value)}
                className="w-full min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">الصنف داخل الفاتورة</label>
              <input
                type="text"
                placeholder="اسم أو كود الصنف..."
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                className="w-full min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">وسيلة الدفع</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:border-slate-900 focus:outline-none cursor-pointer"
              >
                <option value="all">كل وسائل الدفع</option>
                <option value="drawer">كاش / الخزينة</option>
                <option value="vodafone">فودافون كاش</option>
                <option value="instapay">إنستاباي</option>
                <option value="bank">تحويل بنكي</option>
                <option value="split">دفع متعدد</option>
                <option value="ajel">آجل على الحساب</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">حالة السداد</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as any)}
                className="w-full min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:border-slate-900 focus:outline-none cursor-pointer"
              >
                <option value="all">جميع الحالات</option>
                <option value="paid">مدفوعة / مسددة بالكامل</option>
                <option value="partial">مدفوعة جزئياً</option>
                <option value="unpaid">آجل / غير مسددة</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                {appData.branches && appData.branches.length > 1 ? 'الفرع / الخزينة' : 'الخزينة / البنك'}
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={treasuryOrBank}
                  onChange={(e) => setTreasuryOrBank(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:border-slate-900 focus:outline-none cursor-pointer"
                >
                  <option value="all">كل الخزائن والبنوك</option>
                  {availableTreasuries.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {appData.branches && appData.branches.length > 1 && (
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:border-slate-900 focus:outline-none cursor-pointer"
                  >
                    <option value="all">كل الفروع</option>
                    {appData.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-12 px-4 text-center space-y-3">
          <Filter className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="text-sm font-semibold text-slate-800">
            لا توجد مستندات في سجل ({activeCategoryMeta.label})
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {hasActiveFilter
              ? 'لم يتم العثور على فواتير مطابقة لمعايير البحث الحالية. يمكنك مسح الفلاتر لإظهار السجل بالكامل.'
              : activeTab === 'needs_review'
              ? 'جميع الفواتير في النظام سليمة ومتزنة محاسبياً ولا توجد أي سجلات بحاجة للمراجعة.'
              : 'لم يتم تسجيل فواتير تندرج تحت هذا التصنيف المحاسبي حتى الآن.'}
          </p>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة تعيين الفلاتر</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Card View (< md) */}
          <div className="block md:hidden space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs font-medium text-slate-700 min-h-[40px] cursor-pointer"
              >
                {isAllVisibleSelected ? (
                  <CheckSquare className="w-4 h-4 text-slate-900" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>{isAllVisibleSelected ? 'إلغاء تحديد الكل' : 'تحديد كل الظاهر'}</span>
              </button>
            </div>

            {filteredRecords.map((rec) => {
              const isChecked = selectedUids.includes(rec.uid);
              return (
                <div
                  key={rec.uid}
                  className={`bg-white border rounded-xl p-3.5 space-y-2.5 transition ${
                    isChecked ? 'border-slate-900 bg-slate-50/50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleSelectOne(rec.uid)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer shrink-0"
                        aria-label={`تحديد الفاتورة ${rec.docNumber}`}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-slate-900" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 tabular-nums">
                          <span>#{rec.docNumber}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="text-xs font-normal text-slate-500">{rec.date}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {rec.partyName} {rec.partyCode && rec.partyCode !== '-' ? `(${rec.partyCode})` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-left shrink-0 tabular-nums">
                      <div className="text-sm font-semibold text-slate-900">
                        {formatMoney(rec.grossTotal)} {curSymbol}
                      </div>
                      <div className="text-[11px] text-slate-500">{rec.paymentStatusLabel}</div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{rec.paymentMethodLabel}</span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span>{rec.treasuryOrBank}</span>
                    {rec.remainingAmount > 0.01 && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-amber-700 font-medium tabular-nums">
                          متبقي: {formatMoney(rec.remainingAmount)}
                        </span>
                      </>
                    )}
                    {rec.originalInvoiceId && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="text-rose-700 font-medium">
                          مرتجع #{rec.originalInvoiceId} ({rec.returnKindLabel})
                        </span>
                      </>
                    )}
                  </div>

                  {rec.needsReview && rec.reviewReasons.length > 0 && (
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-0.5">
                      {rec.reviewReasons.map((reason, idx) => (
                        <div key={idx}>• {reason}</div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePrintSingleModeA(rec)}
                      className="min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة فردية (Mode A)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInspectRecord(rec)}
                      className="min-h-[44px] border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>معاينة وتفاصيل</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop High-Density Table View (>= md) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="inline-flex items-center justify-center cursor-pointer text-slate-600 hover:text-slate-900"
                        title={isAllVisibleSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                      >
                        {isAllVisibleSelected ? (
                          <CheckSquare className="w-4 h-4 text-slate-900" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="py-2.5 px-3 whitespace-nowrap">رقم المستند</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">التاريخ والوقت</th>
                    <th className="py-2.5 px-3">الطرف (العميل / المورد)</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">الدفع والخزينة</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-left">الإجمالي</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-left">المدفوع</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-left">المتبقي</th>
                    <th className="py-2.5 px-3">التفاصيل والمرجع</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">إجراءات الطباعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((rec) => {
                    const isChecked = selectedUids.includes(rec.uid);
                    return (
                      <tr
                        key={rec.uid}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isChecked ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelectOne(rec.uid)}
                            className="inline-flex items-center justify-center cursor-pointer"
                            aria-label={`تحديد الفاتورة ${rec.docNumber}`}
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-slate-900" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                            )}
                          </button>
                        </td>

                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          #{rec.docNumber}
                          <div className="text-[10px] font-sans font-normal text-slate-400">
                            {rec.domain === 'sale' ? 'مبيعات' : 'مشتريات'} · {rec.itemsCount} صنف
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-slate-700 tabular-nums whitespace-nowrap">
                          <div>{rec.date || '-'}</div>
                          <div className="text-[11px] text-slate-400">{rec.time || '-'}</div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{rec.partyName}</div>
                          <div className="text-[11px] text-slate-500">
                            {rec.partyCode && rec.partyCode !== '-' ? `كود: ${rec.partyCode}` : 'بدون كود'}
                            {rec.partyPhone && rec.partyPhone !== '-' ? ` · ${rec.partyPhone}` : ''}
                            {rec.branchName ? ` · ${rec.branchName}` : ''}
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-800">{rec.paymentMethodLabel}</div>
                          <div className="text-[11px] text-slate-500">{rec.treasuryOrBank}</div>
                        </td>

                        <td className="py-2.5 px-3 text-left font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatMoney(rec.grossTotal)}
                        </td>

                        <td className="py-2.5 px-3 text-left font-medium text-emerald-700 tabular-nums whitespace-nowrap">
                          {formatMoney(rec.paidAmount)}
                        </td>

                        <td
                          className={`py-2.5 px-3 text-left font-medium tabular-nums whitespace-nowrap ${
                            rec.remainingAmount > 0.01 ? 'text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {formatMoney(rec.remainingAmount)}
                        </td>

                        <td className="py-2.5 px-3 max-w-[230px]">
                          <div className="text-slate-700">{rec.paymentStatusLabel}</div>
                          {rec.isWholesale && (
                            <div className="text-[11px] text-indigo-700">
                              تسعيرة جملة (
                              {rec.wholesalePaymentMode === 'cash'
                                ? 'كاش'
                                : rec.wholesalePaymentMode === 'partial'
                                ? 'جزئي'
                                : 'آجل'}
                              )
                            </div>
                          )}
                          {rec.originalInvoiceId && (
                            <div className="text-[11px] text-rose-700">
                              مرجع: فاتورة #{rec.originalInvoiceId} · {rec.returnKindLabel}
                            </div>
                          )}
                          {rec.needsReview && rec.reviewReasons.length > 0 && (
                            <div className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                              {rec.reviewReasons.join(' | ')}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePrintSingleModeA(rec)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-medium flex items-center gap-1 transition cursor-pointer whitespace-nowrap shrink-0"
                              title="طباعة فردية كاملة (Mode A)"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>طباعة</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleInspectRecord(rec)}
                              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                              title="معاينة التفاصيل المحاسبية"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

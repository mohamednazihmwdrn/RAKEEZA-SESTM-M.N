import React, { useEffect, useMemo, useState } from 'react';
import {
  AppData,
  BulkImportActionChoice,
  BulkImportBatch,
  BulkImportRollbackBlockReport,
  BulkImportRow,
  User,
} from '../types';
import {
  analyzeBulkImportRows,
  checkBulkImportRollbackEligibility,
  downloadBulkImportTemplate,
  executeBulkImportBatch,
  extractPdfBulkItems,
  parseSpreadsheetFile,
  PdfExtractionProgress,
  rollbackBulkImportBatch,
} from '../utils/bulkImportEngine';
import {
  buildSq101197BulkRows,
  downloadSq101197Excel,
  getSq101197IdempotencyKey,
  SQ101197_METADATA,
} from '../data/sq101197AlAndalusPreset';
import { getMainBranchId } from '../utils/branchIsolation';
import { openUnifiedPrintWindow } from '../utils/printUnified';
import { Modal } from './Modal';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';

interface BulkImportViewProps {
  appData: AppData;
  onUpdateData: (
    newData: AppData,
    actionInfo?: { action?: string; module?: string; details?: string; deletedId?: string | number }
  ) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  onNavigate?: (page: string) => void;
  currentUser?: User;
  companyName?: string;
}

type StatusFilter = 'all' | 'new' | 'match_existing' | 'issues' | 'ready';

function round2(n: number): number {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((Number(n || 0) + Number.EPSILON) * 10000) / 10000;
}

function generateIdempotencyKey(companyId: string, warehouseId: string): string {
  return `bulk_${companyId}_${warehouseId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const BulkImportView: React.FC<BulkImportViewProps> = ({
  appData,
  onUpdateData,
  showToast,
  onNavigate,
  currentUser: currentUserProp,
  companyName,
}) => {
  const currency = appData.settings?.currencySymbol || 'ج.م';
  const companyId = appData.companyId || 'COMP-000001';
  const branches = appData.branches || [];
  const mainBranchId = getMainBranchId(branches);

  const currentUser = useMemo(
    () =>
      currentUserProp ||
      appData.users?.find((u) => u.id === appData.currentUser) ||
      appData.users?.[0],
    [currentUserProp, appData.users, appData.currentUser]
  );

  const accessibleBranches = useMemo(() => {
    if (!currentUser?.allowedBranches || currentUser.allowedBranches.length === 0) {
      return branches;
    }
    const allowed = new Set(currentUser.allowedBranches);
    const filtered = branches.filter((b) => allowed.has(b.id));
    return filtered.length > 0 ? filtered : branches;
  }, [branches, currentUser]);

  // Tabs
  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import');

  // Import configuration
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    () => appData.activeBranchId || mainBranchId
  );
  const [importDate, setImportDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [supplierHint, setSupplierHint] = useState<string>('');
  const [defaultMarkupPercent, setDefaultMarkupPercent] = useState<string>('0');

  // File & Extraction state
  const [sourceType, setSourceType] = useState<'excel' | 'csv' | 'pdf'>('excel');
  const [fileName, setFileName] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<PdfExtractionProgress | null>(null);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);

  // Review table state
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey(companyId, appData.activeBranchId || mainBranchId)
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 50;

  // Commit & Result state
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [lastCommittedBatch, setLastCommittedBatch] = useState<BulkImportBatch | null>(null);

  // Batch inspection & rollback modals
  const [inspectingBatch, setInspectingBatch] = useState<BulkImportBatch | null>(null);
  const [rollbackCandidate, setRollbackCandidate] = useState<BulkImportBatch | null>(null);
  const [rollbackBlockReport, setRollbackBlockReport] =
    useState<BulkImportRollbackBlockReport | null>(null);

  const selectedWarehouse = useMemo(
    () =>
      accessibleBranches.find((b) => b.id === selectedWarehouseId) ||
      branches.find((b) => b.id === selectedWarehouseId) ||
      branches[0],
    [accessibleBranches, branches, selectedWarehouseId]
  );

  const sq101197Key = getSq101197IdempotencyKey(companyId, selectedWarehouseId);
  const isSq101197AlreadyCommitted = Boolean(
    appData.processedImportKeys?.[sq101197Key] ||
      (appData.bulkImportBatches || []).some(
        (b) => b.idempotencyKey === sq101197Key && b.status === 'committed'
      )
  );

  const handleLoadSq101197Preset = () => {
    const presetRows = buildSq101197BulkRows(selectedWarehouseId);
    const analyzed = analyzeBulkImportRows(presetRows, appData, selectedWarehouseId, false);
    setRows(analyzed);
    setSourceType('pdf');
    setFileName(`عرض سعر شركة الأندلس ${SQ101197_METADATA.docCode} (154 صنف)`);
    setImportDate(SQ101197_METADATA.date);
    setSupplierHint(SQ101197_METADATA.supplierName);
    setIdempotencyKey(getSq101197IdempotencyKey(companyId, selectedWarehouseId));
    setExtractionWarnings([]);
    setDetectedColumns([]);
    setStatusFilter('all');
    setCurrentPage(1);
    setActiveTab('import');
    showToast(
      `تم تحميل جميع أصناف عرض الأسعار ${SQ101197_METADATA.docCode} (${analyzed.length} صنف) للمراجعة والتدقيق قبل الاعتماد.`,
      'success'
    );
  };

  const handleDirectCommitSq101197Preset = () => {
    if (isCommitting || isSq101197AlreadyCommitted) return;
    setIsCommitting(true);
    try {
      const presetRows = buildSq101197BulkRows(selectedWarehouseId);
      const analyzed = analyzeBulkImportRows(presetRows, appData, selectedWarehouseId, false);
      const conflictOrMatch = analyzed.filter(
        (r) => r.status === 'code_conflict' || r.status === 'missing_data' || r.status === 'match_existing'
      );

      if (conflictOrMatch.length > 0) {
        setRows(analyzed);
        setSourceType('pdf');
        setFileName(`عرض سعر شركة الأندلس ${SQ101197_METADATA.docCode} (154 صنف)`);
        setImportDate(SQ101197_METADATA.date);
        setSupplierHint(SQ101197_METADATA.supplierName);
        setIdempotencyKey(getSq101197IdempotencyKey(companyId, selectedWarehouseId));
        setStatusFilter(analyzed.some((r) => r.status === 'code_conflict') ? 'issues' : 'match_existing');
        showToast(
          `يوجد (${conflictOrMatch.length}) صنف متطابق أو متعارض في هذا المخزن. تم عرض الجدول لتحديد الإجراء بأمان قبل الاعتماد.`,
          'warning'
        );
        return;
      }

      const result = executeBulkImportBatch({
        appData,
        rows: analyzed,
        warehouseId: selectedWarehouseId,
        sourceType: 'pdf',
        fileName: `SQ101197 عرض سعر شركة الأندلس (154 صنف)`,
        importDate: SQ101197_METADATA.date,
        supplierName: SQ101197_METADATA.supplierName,
        defaultSaleMarkupPercent: Math.max(0, parseFloat(defaultMarkupPercent) || 0),
        idempotencyKey: getSq101197IdempotencyKey(companyId, selectedWarehouseId),
        actingUser: currentUser,
      });

      if (!result.success) {
        showToast(result.error || 'تعذر اعتماد الأصناف.', 'error');
        return;
      }

      if (result.updatedData && result.batch) {
        onUpdateData(result.updatedData, {
          action: 'bulk_import',
          module: 'الاستيراد الجماعي للأصناف',
          details: `دمج كامل أصناف عرض سعر شركة الأندلس (${SQ101197_METADATA.docCode}) — ${result.batch.createdCount} صنف كأرصدة افتتاحية بقيمة ${result.batch.totalOpeningValue} في ${result.batch.warehouseName}`,
        });
        setLastCommittedBatch(result.batch);
        setRows([]);
        setFileName('');
        showToast(
          `تم دمج جميع الـ ${result.batch.createdCount} صنف من عرض أسعار الأندلس (SQ101197) كأرصدة ابتدائية في [${result.batch.warehouseName}] بنجاح!`,
          'success'
        );
      }
    } finally {
      setIsCommitting(false);
    }
  };

  useEffect(() => {
    try {
      if (sessionStorage.getItem('rakeeza_preload_sq101197') === '1') {
        sessionStorage.removeItem('rakeeza_preload_sq101197');
        const presetRows = buildSq101197BulkRows(selectedWarehouseId);
        const analyzed = analyzeBulkImportRows(presetRows, appData, selectedWarehouseId, false);
        setRows(analyzed);
        setSourceType('pdf');
        setFileName(`عرض سعر شركة الأندلس ${SQ101197_METADATA.docCode} (154 صنف)`);
        setImportDate(SQ101197_METADATA.date);
        setSupplierHint(SQ101197_METADATA.supplierName);
        setIdempotencyKey(getSq101197IdempotencyKey(companyId, selectedWarehouseId));
        setActiveTab('import');
      }
    } catch {
      // ignore storage access issues
    }
  }, []);

  // Re-analyze automatically if warehouse changes while rows are loaded
  const handleWarehouseChange = (newWarehouseId: string) => {
    setSelectedWarehouseId(newWarehouseId);
    setIdempotencyKey(generateIdempotencyKey(companyId, newWarehouseId));
    if (rows.length > 0) {
      setRows((prev) => analyzeBulkImportRows(prev, appData, newWarehouseId, true));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isPdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf';
    const isCsv = lowerName.endsWith('.csv') || file.type === 'text/csv';
    const isExcel =
      lowerName.endsWith('.xlsx') ||
      lowerName.endsWith('.xls') ||
      lowerName.endsWith('.xlsm') ||
      lowerName.endsWith('.ods');

    if (!isPdf && !isCsv && !isExcel) {
      showToast('صيغة الملف غير مدعومة. يرجى رفع ملف Excel (.xlsx / .xls) أو CSV أو PDF.', 'error');
      return;
    }

    setIsParsing(true);
    setPdfProgress(null);
    setExtractionWarnings([]);
    setDetectedColumns([]);
    setLastCommittedBatch(null);
    setFileName(file.name);
    setSourceType(isPdf ? 'pdf' : isCsv ? 'csv' : 'excel');

    try {
      let rawRows: BulkImportRow[] = [];
      let warnings: string[] = [];

      if (isPdf) {
        const pdfRes = await extractPdfBulkItems(
          file,
          selectedWarehouseId,
          supplierHint,
          (prog) => setPdfProgress(prog),
          appData.settings?.apiKey
        );
        rawRows = pdfRes.rows;
        warnings = pdfRes.warnings;
        if (rawRows.length === 0) {
          showToast(
            `تم فحص ${pdfRes.totalPages} صفحة من الـ PDF ولم يتم العثور على جدول أصناف واضح.`,
            'warning'
          );
        } else {
          showToast(
            `تم استخراج ${rawRows.length} صنف من جميع الصفحات (${pdfRes.totalPages} صفحة) للمراجعة قبل الاعتماد.`,
            'success'
          );
        }
      } else {
        const sheetRes = await parseSpreadsheetFile(file, selectedWarehouseId, supplierHint);
        rawRows = sheetRes.rows;
        warnings = sheetRes.warnings;
        setDetectedColumns(sheetRes.detectedColumns);
        if (rawRows.length === 0) {
          showToast('لم يتم العثور على صفوف أصناف صالحة داخل الملف.', 'warning');
        } else {
          showToast(`تمت قراءة ${rawRows.length} صنف بنجاح للمراجعة والتدقيق.`, 'success');
        }
      }

      const analyzed = analyzeBulkImportRows(rawRows, appData, selectedWarehouseId, false);
      setRows(analyzed);
      setExtractionWarnings(warnings);
      setIdempotencyKey(generateIdempotencyKey(companyId, selectedWarehouseId));
      setCurrentPage(1);
      setStatusFilter('all');
    } catch (err: any) {
      console.error('Bulk import parse error:', err);
      showToast(err?.message || 'حدث خطأ أثناء قراءة الملف المرفق.', 'error');
    } finally {
      setIsParsing(false);
      setPdfProgress(null);
    }
  };

  const handleAddBlankRow = () => {
    const newRow: BulkImportRow = {
      id: `imp_manual_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      rowNumber: rows.length + 1,
      code: '',
      name: '',
      category: 'عام',
      unit: 'قطعة',
      openingQty: 0,
      unitCost: 0,
      priceBeforeDiscount: 0,
      discountValue: 0,
      totalValue: 0,
      netPriceAfterDiscount: 0,
      supplierName: supplierHint.trim() || undefined,
      warehouseId: selectedWarehouseId,
      status: 'missing_data',
      action: 'skip',
      warnings: ['اسم الصنف مفقود — يرجى إدخال اسم الصنف قبل الاعتماد.'],
    };
    const nextRows = analyzeBulkImportRows([...rows, newRow], appData, selectedWarehouseId, true);
    setRows(nextRows);
    if (!fileName) {
      setFileName('إدخال يدوي مجمع');
      setSourceType('excel');
    }
  };

  const handleUpdateRow = (
    rowId: string,
    field: keyof BulkImportRow,
    rawVal: string | number
  ) => {
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== rowId) return r;
        const copy: BulkImportRow = { ...r };

        if (field === 'action') {
          copy.action = rawVal as BulkImportActionChoice;
          return copy;
        }

        if (
          field === 'openingQty' ||
          field === 'unitCost' ||
          field === 'priceBeforeDiscount' ||
          field === 'discountValue' ||
          field === 'netPriceAfterDiscount' ||
          field === 'totalValue' ||
          field === 'salePrice'
        ) {
          const num = Math.max(0, Number(rawVal) || 0);
          (copy as any)[field] = field === 'salePrice' && num === 0 ? undefined : num;

          if (field === 'priceBeforeDiscount' || field === 'discountValue') {
            const net = round4(Math.max(0, copy.priceBeforeDiscount - copy.discountValue));
            copy.netPriceAfterDiscount = net;
            copy.unitCost = net;
            copy.totalValue = round2(copy.openingQty * net);
          } else if (field === 'netPriceAfterDiscount') {
            copy.unitCost = num;
            copy.totalValue = round2(copy.openingQty * num);
          } else if (field === 'unitCost') {
            copy.netPriceAfterDiscount = num;
            if (copy.priceBeforeDiscount === 0) {
              copy.priceBeforeDiscount = round4(num + copy.discountValue);
            }
            copy.totalValue = round2(copy.openingQty * num);
          } else if (field === 'openingQty') {
            const effUnit = copy.unitCost > 0 ? copy.unitCost : copy.netPriceAfterDiscount;
            copy.totalValue = round2(num * effUnit);
          } else if (field === 'totalValue' && copy.openingQty > 0) {
            const derived = round4(num / copy.openingQty);
            copy.unitCost = derived;
            copy.netPriceAfterDiscount = derived;
          }
          return copy;
        }

        (copy as any)[field] = String(rawVal);
        return copy;
      });

      const needsReanalysis =
        field === 'code' ||
        field === 'name' ||
        field === 'unit' ||
        field === 'openingQty' ||
        field === 'unitCost';
      return needsReanalysis
        ? analyzeBulkImportRows(updated, appData, selectedWarehouseId, true)
        : updated;
    });
  };

  const handleDeleteRow = (rowId: string) => {
    setRows((prev) =>
      analyzeBulkImportRows(
        prev.filter((r) => r.id !== rowId),
        appData,
        selectedWarehouseId,
        true
      )
    );
  };

  const handleBulkActionForMatched = (action: BulkImportActionChoice) => {
    setRows((prev) =>
      prev.map((r) => (r.status === 'match_existing' ? { ...r, action } : r))
    );
    showToast(
      action === 'add_qty'
        ? 'تم ضبط جميع الأصناف المتطابقة على: إضافة الكمية للرصيد.'
        : action === 'update_data'
        ? 'تم ضبط جميع الأصناف المتطابقة على: تحديث البيانات والأسعار فقط بدون المساس بالرصيد.'
        : 'تم ضبط جميع الأصناف المتطابقة على: تجاهل.',
      'info'
    );
  };

  // Summary metrics
  const summary = useMemo(() => {
    let toCreate = 0;
    let toUpdate = 0;
    let skipped = 0;
    let issues = 0;
    let totalQty = 0;
    let totalValue = 0;
    let matchedCount = 0;

    for (const r of rows) {
      if (r.status === 'match_existing') matchedCount += 1;
      if (
        r.status === 'missing_data' ||
        r.status === 'code_conflict' ||
        r.status === 'duplicate_in_file' ||
        r.warnings.length > 0
      ) {
        issues += 1;
      }

      if (r.action === 'skip') {
        skipped += 1;
      } else if (r.action === 'create_new') {
        toCreate += 1;
        totalQty = round2(totalQty + r.openingQty);
        const effCost = r.unitCost > 0 ? r.unitCost : r.netPriceAfterDiscount;
        const rowVal = r.totalValue > 0 ? round2(r.totalValue) : round2(r.openingQty * effCost);
        totalValue = round2(totalValue + rowVal);
      } else if (r.action === 'update_data') {
        toUpdate += 1;
      } else if (r.action === 'add_qty') {
        toUpdate += 1;
        totalQty = round2(totalQty + r.openingQty);
        const effCost = r.unitCost > 0 ? r.unitCost : r.netPriceAfterDiscount;
        const rowVal = r.totalValue > 0 ? round2(r.totalValue) : round2(r.openingQty * effCost);
        totalValue = round2(totalValue + rowVal);
      }
    }

    return {
      totalRows: rows.length,
      toCreate,
      toUpdate,
      skipped,
      issues,
      matchedCount,
      totalQty,
      totalValue,
    };
  }, [rows]);

  // Filtered rows for display
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === 'new' && r.status !== 'new') return false;
      if (statusFilter === 'match_existing' && r.status !== 'match_existing') return false;
      if (
        statusFilter === 'issues' &&
        r.status !== 'missing_data' &&
        r.status !== 'code_conflict' &&
        r.status !== 'duplicate_in_file' &&
        r.warnings.length === 0
      ) {
        return false;
      }
      if (statusFilter === 'ready' && r.action === 'skip') return false;

      if (q) {
        const hit =
          r.name.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.unit.toLowerCase().includes(q) ||
          (r.supplierName || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  const handleCommitBatch = () => {
    if (isCommitting || rows.length === 0) return;

    const blocking = rows.filter(
      (r) => r.action !== 'skip' && (r.status === 'missing_data' || r.status === 'code_conflict')
    );
    if (blocking.length > 0) {
      showToast(
        `يوجد (${blocking.length}) سطر به بيانات ناقصة أو تعارض كود لا يزال مفعلاً. راجع الفلتر "تنبيهات وأخطاء" قبل الاعتماد.`,
        'warning'
      );
      setStatusFilter('issues');
      return;
    }

    setIsCommitting(true);
    try {
      const result = executeBulkImportBatch({
        appData,
        rows,
        warehouseId: selectedWarehouseId,
        sourceType,
        fileName: fileName || 'استيراد_جماعي',
        importDate,
        supplierName: supplierHint,
        defaultSaleMarkupPercent: Math.max(0, parseFloat(defaultMarkupPercent) || 0),
        idempotencyKey,
        actingUser: currentUser,
      });

      if (!result.success) {
        showToast(result.error || 'تعذر اعتماد دفعة الاستيراد.', 'error');
        return;
      }

      if (result.duplicate) {
        showToast('تم تنفيذ هذه الدفعة مسبقاً (حماية منع التكرار مفعّلة).', 'info');
        if (result.batch) setLastCommittedBatch(result.batch);
        return;
      }

      if (result.updatedData && result.batch) {
        onUpdateData(result.updatedData, {
          action: 'bulk_import',
          module: 'الاستيراد الجماعي للأصناف',
          details: `اعتماد دفعة ${result.batch.batchNumber} (${result.batch.createdCount} جديد، ${result.batch.updatedCount} محدث، القيمة ${result.batch.totalOpeningValue})`,
        });

        setLastCommittedBatch(result.batch);
        setRows([]);
        setFileName('');
        setIdempotencyKey(generateIdempotencyKey(companyId, selectedWarehouseId));
        showToast(
          `تم اعتماد دفعة الأرصدة الافتتاحية (${result.batch.batchNumber}) بنجاح دون أي فواتير شراء وهمية أو خصم خزينة!`,
          'success'
        );
      }
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRequestRollback = (batch: BulkImportBatch) => {
    const report = checkBulkImportRollbackEligibility(appData, batch);
    if (!report.allowed) {
      setRollbackBlockReport(report);
      setRollbackCandidate(null);
      return;
    }
    setRollbackCandidate(batch);
  };

  const handleConfirmRollback = () => {
    if (!rollbackCandidate) return;
    const res = rollbackBulkImportBatch(appData, rollbackCandidate.id, currentUser);
    if (!res.success) {
      if (res.blockReport) {
        setRollbackBlockReport(res.blockReport);
      }
      setRollbackCandidate(null);
      showToast(res.error || 'تعذر التراجع عن الدفعة.', 'error');
      return;
    }
    if (res.updatedData) {
      onUpdateData(res.updatedData, {
        action: 'rollback_bulk_import',
        module: 'الاستيراد الجماعي للأصناف',
        details: `تراجع آمن عن دفعة الاستيراد (${rollbackCandidate.batchNumber}) وعكس القيد الافتتاحي وأرصدة الأصناف`,
      });
      showToast(`تم التراجع الكامل والآمن عن الدفعة (${rollbackCandidate.batchNumber}) بنجاح.`, 'success');
    }
    setRollbackCandidate(null);
  };

  const handlePrintBatch = (batch: BulkImportBatch) => {
    const tableRows = (batch.itemSnapshots || []).map((s, idx) => [
      idx + 1,
      s.itemCode || '-',
      s.itemName,
      s.unit || 'قطعة',
      s.action === 'created'
        ? 'صنف جديد'
        : s.action === 'added_qty'
        ? 'إضافة كمية'
        : 'تحديث بيانات',
      Number(s.qtyAdded || 0).toLocaleString('en-US'),
      Number(s.valueAdded || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ]);

    openUnifiedPrintWindow(
      {
        reportTitle: `كشف دفعة استيراد أرصدة افتتاحية — ${batch.batchNumber}`,
        subTitle: `المصدر: ${batch.fileName} (${batch.sourceType.toUpperCase()}) | الحالة: ${
          batch.status === 'committed' ? 'معتمدة' : 'تم التراجع عنها'
        }`,
        branch: batch.warehouseName,
        serial: batch.batchNumber,
        date: batch.importDate,
        infoExtra: [
          { label: 'المخزن / الفرع', value: batch.warehouseName },
          { label: 'المستخدم', value: batch.createdBy },
          { label: 'المورد المرجعي', value: batch.supplierName || 'غير محدد' },
          {
            label: 'رقم القيد المحاسبي',
            value: batch.journalEntryId ? `JE-${batch.batchNumber}` : 'بدون قيمة مالية',
          },
        ],
        kpis: [
          { title: 'أصناف مستحدثة', value: String(batch.createdCount) },
          { title: 'أصناف محدثة', value: String(batch.updatedCount) },
          { title: 'إجمالي الكمية', value: batch.totalOpeningQty.toLocaleString('en-US') },
          {
            title: 'إجمالي القيمة الدفترية',
            value: `${batch.totalOpeningValue.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} ${currency}`,
          },
        ],
        columns: [
          '#',
          'كود الصنف',
          'اسم الصنف',
          'الوحدة',
          'الإجراء',
          'الكمية المضافة',
          `القيمة المضافة (${currency})`,
        ],
        rows: tableRows,
        summary: [
          { label: 'إجمالي الكمية الافتتاحية', value: batch.totalOpeningQty.toLocaleString('en-US') },
          {
            label: `إجمالي القيمة الدفترية (${currency})`,
            value: batch.totalOpeningValue.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            isTotal: true,
          },
        ],
        notes:
          'قيد أرصدة افتتاحية للمخزون فقط (مدين 1106 / دائن 3104) بدون فواتير مشتريات أو صرف من الخزينة أو إثبات مديونية على المورد.',
        preferredPaperSize: 'A4',
      },
      appData.settings
    );
  };

  const statusBadge = (status: BulkImportRow['status']) => {
    switch (status) {
      case 'new':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            صنف جديد
          </span>
        );
      case 'match_existing':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            موجود بالمخزن
          </span>
        );
      case 'duplicate_in_file':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-50 text-orange-800 border border-orange-200">
            مكرر بالملف
          </span>
        );
      case 'code_conflict':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            تعارض كود / وحدة
          </span>
        );
      case 'missing_data':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
            بيانات ناقصة
          </span>
        );
    }
  };

  const batches = appData.bulkImportBatches || [];

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-[#1a237e] via-[#283593] to-[#1e3a8a] text-white p-4 sm:p-5 rounded-2xl shadow-md space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Layers className="w-5 h-5 text-amber-300 shrink-0" />
              <h1 className="text-base sm:text-xl font-black">
                الاستيراد الجماعي للأصناف والأرصدة الافتتاحية
              </h1>
            </div>
            <p className="text-xs text-indigo-100 leading-relaxed">
              استورد مئات أو آلاف الأصناف من <strong className="text-white">Excel / CSV / PDF (مع OCR وذكاء اصطناعي لجميع الصفحات)</strong> إلى{' '}
              <strong className="text-amber-300">{companyName || appData.settings?.companyName}</strong> — المخزن المحدد:{' '}
              <strong className="text-amber-200">{selectedWarehouse?.name || 'الفرع الرئيسي'}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('items')}
                className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>دليل الأصناف</span>
              </button>
            )}
            <button
              type="button"
              onClick={downloadBulkImportTemplate}
              className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>تحميل قالب Excel</span>
            </button>
          </div>
        </div>

        {/* Accounting Integrity Strip */}
        <div className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-[11px] sm:text-xs text-indigo-50 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-bold text-emerald-300">✓ قيد رصيد افتتاحي محاسبي متوازن (1106 مخزون ← 3104 أرصدة افتتاحية)</span>
          <span>• لا يُنشئ فواتير مشتريات وهمية</span>
          <span>• لا يخصم من الخزينة أو البنك</span>
          <span>• لا يثبت مديونية على المورد</span>
        </div>

        {/* Sub Tabs */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'import'
                ? 'bg-white text-indigo-950 shadow-sm'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>استيراد وتدقيق البيانات</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-white text-indigo-950 shadow-sm'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <History className="w-4 h-4" />
            <span>سجل الدفعات والتراجع الآمن</span>
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-indigo-900 text-amber-300 font-mono">
              {batches.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: IMPORT & PRE-APPROVAL REVIEW */}
      {activeTab === 'import' && (
        <div className="space-y-4">
          {/* Last Commit Success Banner */}
          {lastCommittedBatch && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs sm:text-sm">
                  <div className="font-black text-emerald-950">
                    تم اعتماد الدفعة ({lastCommittedBatch.batchNumber}) بنجاح!
                  </div>
                  <div className="text-emerald-800">
                    أصناف جديدة: <strong>{lastCommittedBatch.createdCount}</strong> | أصناف محدثة:{' '}
                    <strong>{lastCommittedBatch.updatedCount}</strong> | إجمالي الكمية:{' '}
                    <strong>{lastCommittedBatch.totalOpeningQty.toLocaleString('en-US')}</strong> | القيمة الدفترية:{' '}
                    <strong>
                      {lastCommittedBatch.totalOpeningValue.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}{' '}
                      {currency}
                    </strong>
                    {lastCommittedBatch.journalEntryId && (
                      <span> | قيد يومي: <strong>JE-{lastCommittedBatch.batchNumber}</strong></span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintBatch(lastCommittedBatch)}
                  className="px-3 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-900 text-xs font-bold hover:bg-emerald-100 cursor-pointer flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة ملخص الدفعة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
                >
                  عرض سجل الدفعات
                </button>
              </div>
            </div>
          )}

          {/* Pre-Verified SQ101197 Al-Andalus 154 Items Preset Card */}
          <div className="bg-gradient-to-l from-amber-50 via-yellow-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-mono text-[11px] font-black">
                    {SQ101197_METADATA.docCode}
                  </span>
                  <h2 className="text-sm sm:text-base font-black text-slate-950">
                    كشف أصناف شركة الأندلس للأدوات الكهربائية (154 صنف جاهز ومُراجع بالكامل)
                  </h2>
                  {isSq101197AlreadyCommitted && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-black">
                      ✓ تم الدمج والاعتماد في [{selectedWarehouse?.name}]
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  يضم كافة الـ <strong>154 صنفاً</strong> من الصفحات 1 إلى 6 بأكوادها وأسمائها ووحداتها وكمياتها وأسعارها قبل الخصم وبعد الخصم:
                  إجمالي <strong className="font-mono">614,916.60</strong> | خصم{' '}
                  <strong className="font-mono">102,878.92</strong> | صافي القيمة الافتتاحية{' '}
                  <strong className="font-mono text-emerald-900">512,037.68 {currency}</strong> (بدون فواتير شراء أو خصم خزينة).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleLoadSq101197Preset}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white hover:bg-amber-100 border-2 border-amber-400 text-amber-950 text-xs font-black transition cursor-pointer flex items-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  <span>عرض وتدقيق الـ 154 صنف بالجدول</span>
                </button>

                <button
                  type="button"
                  disabled={isCommitting || isSq101197AlreadyCommitted}
                  onClick={handleDirectCommitSq101197Preset}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-400 text-white text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {isCommitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>
                    {isSq101197AlreadyCommitted
                      ? 'تم الاعتماد في هذا المخزن ✓'
                      : 'دمج واعتماد الـ 154 صنف الآن كأرصدة ابتدائية'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={downloadSq101197Excel}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                  title="تنزيل الأصناف الـ 154 في ملف Excel"
                >
                  <Download className="w-4 h-4" />
                  <span>Excel</span>
                </button>
              </div>
            </div>
          </div>

          {/* Target Warehouse & Source Upload Panel */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المخزن / الفرع المستهدف *
                </label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => handleWarehouseChange(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 bg-slate-50 focus:border-indigo-600 focus:outline-none"
                >
                  {accessibleBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code || b.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  تاريخ القيد والرصيد الافتتاحي *
                </label>
                <input
                  type="date"
                  value={importDate}
                  onChange={(e) => setImportDate(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم المورد المرجعي (اختياري — للبيان فقط)
                </label>
                <input
                  type="text"
                  value={supplierHint}
                  onChange={(e) => setSupplierHint(e.target.value)}
                  placeholder="مثال: شركة التوريدات المتحدة..."
                  className="w-full min-h-[42px] px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  هامش ربح افتراضي لسعر البيع % (اختياري)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={defaultMarkupPercent}
                  onChange={(e) => setDefaultMarkupPercent(e.target.value)}
                  placeholder="0"
                  className="w-full min-h-[42px] px-3 py-2 border-2 border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>
            </div>

            {/* File Dropzone */}
            <div className="border-2 border-dashed border-indigo-300 bg-indigo-50/40 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center md:text-right">
                <div className="flex items-center justify-center md:justify-start gap-2 text-indigo-950 font-black text-sm">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>رفع ملف أصناف (Excel / CSV / PDF متعدد الصفحات بالذكاء الاصطناعي والـ OCR)</span>
                </div>
                <p className="text-xs text-slate-600">
                  يتم فحص جميع صفحات الـ PDF بدقة كاملة أو قراءة جميع أعمدة Excel/CSV وعرضها هنا للمراجعة والتعديل قبل حفظ أي صنف.
                </p>
                {fileName && (
                  <div className="text-xs font-bold text-indigo-800 pt-1">
                    الملف الحالي: <span className="font-mono">{fileName}</span> ({sourceType.toUpperCase()})
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 shrink-0 w-full md:w-auto">
                <label
                  className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 cursor-pointer transition shadow-sm ${
                    isParsing
                      ? 'bg-slate-300 text-slate-600 pointer-events-none'
                      : 'bg-indigo-700 hover:bg-indigo-800 text-white'
                  }`}
                >
                  {isParsing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  <span>{isParsing ? 'جاري الاستخراج...' : 'اختيار ملف Excel / CSV / PDF'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.xlsm,.ods,.csv,.pdf,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={handleFileUpload}
                    disabled={isParsing}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleAddBlankRow}
                  disabled={isParsing}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border-2 border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة سطر يدوي</span>
                </button>
              </div>
            </div>

            {/* Live PDF Multi-page Progress Bar */}
            {isParsing && pdfProgress && (
              <div className="bg-indigo-950 text-white rounded-xl p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    <span>
                      جاري استخراج وقراءة الصفحات ({pdfProgress.currentRange}) من أصل{' '}
                      {pdfProgress.totalPages} صفحة عبر محرك OCR والذكاء الاصطناعي...
                    </span>
                  </span>
                  <span className="font-mono text-amber-300">
                    {pdfProgress.processedPages} / {pdfProgress.totalPages} صفحة ({pdfProgress.extractedCount} صنف)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((pdfProgress.processedPages / Math.max(1, pdfProgress.totalPages)) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Warnings / Detected Columns */}
            {(extractionWarnings.length > 0 || detectedColumns.length > 0) && (
              <div className="space-y-2">
                {detectedColumns.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] text-slate-700">
                    <strong className="text-slate-900">الأعمدة المكتشفة: </strong>
                    {detectedColumns.join(' • ')}
                  </div>
                )}
                {extractionWarnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                    <div className="font-black flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>ملاحظات استخراج الملف:</span>
                    </div>
                    <ul className="list-disc pr-5 space-y-0.5 text-[11px]">
                      {extractionWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PRE-IMPORT EDITABLE REVIEW SECTION */}
          {rows.length > 0 && (
            <div className="space-y-4">
              {/* Live KPI Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-500">إجمالي الصفوف</div>
                  <div className="text-lg sm:text-xl font-black text-slate-900 font-mono mt-0.5">
                    {summary.totalRows}
                  </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 shadow-xs">
                  <div className="text-[11px] font-bold text-emerald-700">أصناف جديدة للإضافة</div>
                  <div className="text-lg sm:text-xl font-black text-emerald-950 font-mono mt-0.5">
                    {summary.toCreate}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 shadow-xs">
                  <div className="text-[11px] font-bold text-blue-700">تحديث / زيادة رصيد</div>
                  <div className="text-lg sm:text-xl font-black text-blue-950 font-mono mt-0.5">
                    {summary.toUpdate}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-600">صفوف متجاهلة</div>
                  <div className="text-lg sm:text-xl font-black text-slate-800 font-mono mt-0.5">
                    {summary.skipped}
                  </div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 shadow-xs">
                  <div className="text-[11px] font-bold text-indigo-700">إجمالي الكميات المعتمدة</div>
                  <div className="text-lg sm:text-xl font-black text-indigo-950 font-mono mt-0.5">
                    {summary.totalQty.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 shadow-xs">
                  <div className="text-[11px] font-bold text-amber-800">إجمالي القيمة الصافية</div>
                  <div className="text-base sm:text-lg font-black text-amber-950 font-mono mt-0.5">
                    {summary.totalValue.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    <span className="text-[11px] font-normal">{currency}</span>
                  </div>
                </div>
              </div>

              {/* Bulk Matched Helper Bar */}
              {summary.matchedCount > 0 && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2 text-amber-950 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      يوجد ({summary.matchedCount}) صنف متطابق مع الدليل الحالي للمخزن — تم ضبطها افتراضياً على "تجاهل" لمنع تعديل الأرصدة بصمت. حدد إجراءك:
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBulkActionForMatched('add_qty')}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer"
                    >
                      تعيين الكل: إضافة الكمية للرصيد
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkActionForMatched('update_data')}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold cursor-pointer"
                    >
                      تعيين الكل: تحديث البيانات والأسعار فقط
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkActionForMatched('skip')}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold cursor-pointer"
                    >
                      تعيين الكل: تجاهل
                    </button>
                  </div>
                </div>
              )}

              {/* Filters & Search Toolbar */}
              <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-3 space-y-3">
                <div className="flex flex-col md:flex-row gap-2.5 md:items-center justify-between">
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'all', label: `الكل (${rows.length})` },
                        { id: 'new', label: `جديد (${rows.filter((r) => r.status === 'new').length})` },
                        {
                          id: 'match_existing',
                          label: `متطابق بالمخزن (${summary.matchedCount})`,
                        },
                        {
                          id: 'issues',
                          label: `تنبيهات وأخطاء (${summary.issues})`,
                        },
                        {
                          id: 'ready',
                          label: `سيتم اعتمادها (${summary.toCreate + summary.toUpdate})`,
                        },
                      ] as Array<{ id: StatusFilter; label: string }>
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setStatusFilter(tab.id);
                          setCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                          statusFilter === tab.id
                            ? 'bg-indigo-700 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full md:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="بحث بالكود أو الاسم أو التصنيف..."
                      className="w-full min-h-[38px] pr-9 pl-3 py-1.5 border border-slate-300 rounded-xl text-xs focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                </div>

                {/* DESKTOP EDITABLE TABLE (>= md) */}
                <div className="hidden md:block overflow-x-auto max-w-full border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead className="bg-slate-100 text-slate-800 font-black border-b border-slate-200">
                      <tr>
                        <th className="p-2 whitespace-nowrap">#</th>
                        <th className="p-2 whitespace-nowrap min-w-[140px]">الحالة والإجراء</th>
                        <th className="p-2 whitespace-nowrap min-w-[95px]">كود الصنف</th>
                        <th className="p-2 whitespace-nowrap min-w-[190px]">اسم الصنف الأصلي</th>
                        <th className="p-2 whitespace-nowrap min-w-[110px]">المجموعة</th>
                        <th className="p-2 whitespace-nowrap min-w-[85px]">الوحدة</th>
                        <th className="p-2 whitespace-nowrap min-w-[80px]">الكمية</th>
                        <th className="p-2 whitespace-nowrap min-w-[85px]">التكلفة</th>
                        <th className="p-2 whitespace-nowrap min-w-[85px]">قبل الخصم</th>
                        <th className="p-2 whitespace-nowrap min-w-[75px]">الخصم</th>
                        <th className="p-2 whitespace-nowrap min-w-[85px]">الصافي</th>
                        <th className="p-2 whitespace-nowrap min-w-[95px]">الإجمالي</th>
                        <th className="p-2 whitespace-nowrap min-w-[85px]">سعر البيع</th>
                        <th className="p-2 whitespace-nowrap min-w-[120px]">المورد</th>
                        <th className="p-2 text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {paginatedRows.map((row) => (
                        <tr
                          key={row.id}
                          className={
                            row.status === 'missing_data' || row.status === 'code_conflict'
                              ? 'bg-rose-50/50'
                              : row.status === 'match_existing'
                              ? 'bg-amber-50/40'
                              : row.action === 'skip'
                              ? 'bg-slate-50/60 opacity-75'
                              : 'bg-white hover:bg-slate-50/70'
                          }
                        >
                          <td className="p-2 font-mono text-slate-500 align-top">
                            <div>{row.rowNumber}</div>
                            {row.pageNumber && (
                              <div className="text-[10px] text-indigo-600">ص{row.pageNumber}</div>
                            )}
                          </td>

                          <td className="p-2 space-y-1 align-top">
                            <div>{statusBadge(row.status)}</div>
                            <select
                              value={row.action}
                              onChange={(e) => handleUpdateRow(row.id, 'action', e.target.value)}
                              className="w-full px-1.5 py-1 border border-slate-300 rounded-lg text-[11px] font-bold bg-white"
                            >
                              {row.status === 'new' && (
                                <option value="create_new">إنشاء صنف جديد</option>
                              )}
                              {row.status === 'match_existing' && (
                                <>
                                  <option value="add_qty">إضافة كمية للرصيد</option>
                                  <option value="update_data">تحديث البيانات فقط</option>
                                </>
                              )}
                              {row.status === 'duplicate_in_file' && (
                                <option value="create_new">استيراد كصنف مستقل</option>
                              )}
                              <option value="skip">تجاهل السطر</option>
                            </select>
                            {row.warnings.length > 0 && (
                              <div className="text-[10px] text-rose-700 leading-snug max-w-[180px]">
                                {row.warnings[0]}
                              </div>
                            )}
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="text"
                              value={row.code}
                              onChange={(e) => handleUpdateRow(row.id, 'code', e.target.value)}
                              placeholder="كود..."
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) => handleUpdateRow(row.id, 'name', e.target.value)}
                              placeholder="اسم الصنف..."
                              className={`w-full px-2 py-1 border rounded-lg text-xs font-bold bg-white ${
                                !row.name.trim() ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                              }`}
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="text"
                              value={row.category}
                              onChange={(e) => handleUpdateRow(row.id, 'category', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white"
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="text"
                              value={row.unit}
                              onChange={(e) => handleUpdateRow(row.id, 'unit', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white"
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.openingQty}
                              onChange={(e) =>
                                handleUpdateRow(row.id, 'openingQty', e.target.value)
                              }
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.unitCost}
                              onChange={(e) => handleUpdateRow(row.id, 'unitCost', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.priceBeforeDiscount}
                              onChange={(e) =>
                                handleUpdateRow(row.id, 'priceBeforeDiscount', e.target.value)
                              }
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.discountValue}
                              onChange={(e) =>
                                handleUpdateRow(row.id, 'discountValue', e.target.value)
                              }
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.netPriceAfterDiscount}
                              onChange={(e) =>
                                handleUpdateRow(row.id, 'netPriceAfterDiscount', e.target.value)
                              }
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.totalValue}
                              onChange={(e) =>
                                handleUpdateRow(row.id, 'totalValue', e.target.value)
                              }
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono text-xs font-bold bg-slate-50"
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.salePrice ?? ''}
                              onChange={(e) =>
                                handleUpdateRow(row.id, 'salePrice', e.target.value)
                              }
                              placeholder="تلقائي"
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg font-mono text-xs bg-white"
                            />
                          </td>

                          <td className="p-1.5 align-top">
                            <input
                              type="text"
                              value={row.supplierName || ''}
                              onChange={(e) =>
                                handleUpdateRow(row.id, 'supplierName', e.target.value)
                              }
                              placeholder="المورد..."
                              className="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white"
                            />
                          </td>

                          <td className="p-1.5 text-center align-top">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.id)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 cursor-pointer"
                              title="حذف السطر من الجدول"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE EDITABLE CARDS (< md) — ZERO HORIZONTAL OVERFLOW */}
                <div className="block md:hidden space-y-3">
                  {paginatedRows.map((row) => (
                    <div
                      key={row.id}
                      className={`border-2 rounded-2xl p-3 space-y-2.5 ${
                        row.status === 'missing_data' || row.status === 'code_conflict'
                          ? 'border-rose-300 bg-rose-50/40'
                          : row.status === 'match_existing'
                          ? 'border-amber-300 bg-amber-50/40'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black text-slate-600">
                            #{row.rowNumber}
                          </span>
                          {row.pageNumber && (
                            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                              صفحة {row.pageNumber}
                            </span>
                          )}
                          {statusBadge(row.status)}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1.5 rounded-lg text-rose-600 bg-rose-50 hover:bg-rose-100 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {row.warnings.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-[11px] text-amber-900 space-y-0.5">
                          {row.warnings.map((w, i) => (
                            <div key={i}>• {w}</div>
                          ))}
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          الإجراء المطلوب
                        </label>
                        <select
                          value={row.action}
                          onChange={(e) => handleUpdateRow(row.id, 'action', e.target.value)}
                          className="w-full min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                        >
                          {row.status === 'new' && (
                            <option value="create_new">إنشاء صنف جديد</option>
                          )}
                          {row.status === 'match_existing' && (
                            <>
                              <option value="add_qty">إضافة كمية للرصيد</option>
                              <option value="update_data">تحديث البيانات فقط</option>
                            </>
                          )}
                          {row.status === 'duplicate_in_file' && (
                            <option value="create_new">استيراد كصنف مستقل</option>
                          )}
                          <option value="skip">تجاهل السطر</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            اسم الصنف الأصلي
                          </label>
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => handleUpdateRow(row.id, 'name', e.target.value)}
                            className="w-full min-h-[38px] px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            كود الصنف
                          </label>
                          <input
                            type="text"
                            value={row.code}
                            onChange={(e) => handleUpdateRow(row.id, 'code', e.target.value)}
                            className="w-full min-h-[36px] px-2 py-1 border border-slate-300 rounded-xl font-mono text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            الوحدة
                          </label>
                          <input
                            type="text"
                            value={row.unit}
                            onChange={(e) => handleUpdateRow(row.id, 'unit', e.target.value)}
                            className="w-full min-h-[36px] px-2 py-1 border border-slate-300 rounded-xl text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            المجموعة / التصنيف
                          </label>
                          <input
                            type="text"
                            value={row.category}
                            onChange={(e) => handleUpdateRow(row.id, 'category', e.target.value)}
                            className="w-full min-h-[36px] px-2 py-1 border border-slate-300 rounded-xl text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            الكمية الافتتاحية
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.openingQty}
                            onChange={(e) => handleUpdateRow(row.id, 'openingQty', e.target.value)}
                            className="w-full min-h-[36px] px-2 py-1 border border-slate-300 rounded-xl font-mono text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            سعر التكلفة للوحدة
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.unitCost}
                            onChange={(e) => handleUpdateRow(row.id, 'unitCost', e.target.value)}
                            className="w-full min-h-[36px] px-2 py-1 border border-slate-300 rounded-xl font-mono text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            السعر قبل الخصم
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.priceBeforeDiscount}
                            onChange={(e) =>
                              handleUpdateRow(row.id, 'priceBeforeDiscount', e.target.value)
                            }
                            className="w-full min-h-[36px] px-2 py-1 border border-slate-300 rounded-xl font-mono text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            قيمة الخصم
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.discountValue}
                            onChange={(e) =>
                              handleUpdateRow(row.id, 'discountValue', e.target.value)
                            }
                            className="w-full min-h-[36px] px-2 py-1 border border-slate-300 rounded-xl font-mono text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            الصافي بعد الخصم
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.netPriceAfterDiscount}
                            onChange={(e) =>
                              handleUpdateRow(row.id, 'netPriceAfterDiscount', e.target.value)
                            }
                            className="w-full min-h-[36px] px-2 py-1 border border-slate-300 rounded-xl font-mono text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            إجمالي قيمة الصنف
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.totalValue}
                            onChange={(e) => handleUpdateRow(row.id, 'totalValue', e.target.value)}
                            className="w-full min-h-[36px] px-2 py-1 border border-slate-300 rounded-xl font-mono text-xs font-bold bg-slate-50"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                            اسم المورد
                          </label>
                          <input
                            type="text"
                            value={row.supplierName || ''}
                            onChange={(e) =>
                              handleUpdateRow(row.id, 'supplierName', e.target.value)
                            }
                            className="w-full min-h-[36px] px-2 py-1 border border-slate-300 rounded-xl text-xs bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                    <span className="font-bold text-slate-600">
                      صفحة <span className="font-mono text-indigo-900">{currentPage}</span> من{' '}
                      <span className="font-mono">{totalPages}</span> ({filteredRows.length} سطر)
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40 font-bold cursor-pointer"
                      >
                        السابق
                      </button>
                      <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40 font-bold cursor-pointer"
                      >
                        التالي
                      </button>
                    </div>
                  </div>
                )}

                {/* EXPLICIT SINGLE COMMIT FOOTER */}
                <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 text-xs">
                    <div className="font-black text-amber-300">
                      جاهز للاعتماد داخل [{selectedWarehouse?.name || 'المخزن الرئيسي'}]
                    </div>
                    <div className="text-slate-300">
                      سيتم إنشاء قيد رصيد افتتاحي فقط (مدين 1106 / دائن 3104) بقيمة{' '}
                      <strong className="text-white font-mono">
                        {summary.totalValue.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        {currency}
                      </strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRows([]);
                        setFileName('');
                        setExtractionWarnings([]);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                    >
                      تفريغ الجدول
                    </button>

                    <button
                      type="button"
                      disabled={
                        isCommitting ||
                        summary.toCreate + summary.toUpdate === 0
                      }
                      onClick={handleCommitBatch}
                      className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-600 text-slate-950 text-xs sm:text-sm font-black transition cursor-pointer flex items-center gap-2 shadow-md"
                    >
                      {isCommitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>اعتماد واستيراد جميع الأصناف</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BATCH HISTORY & SAFE ROLLBACK */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900">
                سجل دفعات الاستيراد الجماعي والتراجع الآمن
              </h2>
              <p className="text-xs text-slate-500">
                يُسمح بإلغاء الدفعة والتراجع عنها فقط إذا لم تتم أي حركات بيع أو شراء أو تحويل أو تسوية لاحقة على أصنافها.
              </p>
            </div>
          </div>

          {batches.length === 0 ? (
            <div className="text-center py-10 text-slate-400 space-y-2">
              <FileText className="w-10 h-10 mx-auto opacity-50" />
              <div className="text-sm font-bold">لا توجد دفعات استيراد مسجلة حتى الآن</div>
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className={`border-2 rounded-2xl p-3.5 sm:p-4 space-y-3 ${
                    batch.status === 'rolled_back'
                      ? 'border-slate-200 bg-slate-50 opacity-80'
                      : 'border-indigo-100 bg-white'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-sm text-indigo-950">
                          {batch.batchNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                            batch.status === 'committed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {batch.status === 'committed' ? 'معتمدة' : 'تم التراجع عنها'}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-800">
                          {batch.warehouseName}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-mono bg-slate-100 text-slate-700">
                          {batch.sourceType.toUpperCase()}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
                        <span>الملف: <strong>{batch.fileName}</strong></span>
                        <span>التاريخ: <strong className="font-mono">{batch.importDate}</strong></span>
                        <span>بواسطة: <strong>{batch.createdBy}</strong></span>
                        {batch.supplierName && (
                          <span>المورد: <strong>{batch.supplierName}</strong></span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInspectingBatch(batch)}
                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer"
                      >
                        عرض الأصناف ({batch.itemSnapshots?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintBatch(batch)}
                        className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs font-bold cursor-pointer flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>طباعة</span>
                      </button>
                      {batch.status === 'committed' && (
                        <button
                          type="button"
                          onClick={() => handleRequestRollback(batch)}
                          className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>إلغاء دفعة الاستيراد</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-slate-500">جديد: </span>
                      <strong className="font-mono text-emerald-700">{batch.createdCount}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">محدث: </span>
                      <strong className="font-mono text-blue-700">{batch.updatedCount}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">متجاهل: </span>
                      <strong className="font-mono text-slate-700">{batch.skippedCount}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">إجمالي الكمية: </span>
                      <strong className="font-mono text-indigo-950">
                        {batch.totalOpeningQty.toLocaleString('en-US')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">القيمة الدفترية: </span>
                      <strong className="font-mono text-amber-800">
                        {batch.totalOpeningValue.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}{' '}
                        {currency}
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: Inspect Batch Details */}
      <Modal
        isOpen={Boolean(inspectingBatch)}
        onClose={() => setInspectingBatch(null)}
        title={`تفاصيل دفعة الاستيراد ${inspectingBatch?.batchNumber || ''}`}
      >
        {inspectingBatch && (
          <div className="space-y-3 text-xs" dir="rtl">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-2 gap-2">
              <div>المخزن: <strong>{inspectingBatch.warehouseName}</strong></div>
              <div>التاريخ: <strong className="font-mono">{inspectingBatch.importDate}</strong></div>
              <div>القيمة: <strong className="font-mono">{inspectingBatch.totalOpeningValue.toLocaleString('en-US')} {currency}</strong></div>
              <div>القيد: <strong className="font-mono">{inspectingBatch.journalEntryId ? `JE-${inspectingBatch.batchNumber}` : 'بدون قيمة'}</strong></div>
            </div>
            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 font-bold sticky top-0">
                  <tr>
                    <th className="p-2">الكود</th>
                    <th className="p-2">الصنف</th>
                    <th className="p-2">الوحدة</th>
                    <th className="p-2">الإجراء</th>
                    <th className="p-2">الكمية</th>
                    <th className="p-2">القيمة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(inspectingBatch.itemSnapshots || []).map((s, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-mono">{s.itemCode || '-'}</td>
                      <td className="p-2 font-bold">{s.itemName}</td>
                      <td className="p-2">{s.unit}</td>
                      <td className="p-2">
                        {s.action === 'created'
                          ? 'جديد'
                          : s.action === 'added_qty'
                          ? 'إضافة كمية'
                          : 'تحديث بيانات'}
                      </td>
                      <td className="p-2 font-mono">{s.qtyAdded}</td>
                      <td className="p-2 font-mono">{s.valueAdded.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Confirm Safe Rollback */}
      <Modal
        isOpen={Boolean(rollbackCandidate)}
        onClose={() => setRollbackCandidate(null)}
        title="تأكيد إلغاء دفعة الاستيراد الجماعي"
      >
        {rollbackCandidate && (
          <div className="space-y-4 text-xs sm:text-sm" dir="rtl">
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-amber-950 space-y-1.5">
              <div className="font-black flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>هل أنت متأكد من إلغاء الدفعة ({rollbackCandidate.batchNumber})؟</span>
              </div>
              <p className="text-xs leading-relaxed">
                تم التحقق من عدم وجود أي حركات لاحقة على أصناف هذه الدفعة. سيؤدي التأكيد إلى:
                حذف الأصناف المستحدثة ({rollbackCandidate.createdCount})، واسترجاع حالة الأصناف المحدثة ({rollbackCandidate.updatedCount}) لما قبل الاستيراد، وإلغاء القيد الافتتاحي المقابل ({rollbackCandidate.totalOpeningValue.toLocaleString('en-US')} {currency}).
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRollbackCandidate(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
              >
                إلغاء الأمر
              </button>
              <button
                type="button"
                onClick={handleConfirmRollback}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer"
              >
                تأكيد التراجع الكامل الآن
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Rollback Blocked Report */}
      <Modal
        isOpen={Boolean(rollbackBlockReport)}
        onClose={() => setRollbackBlockReport(null)}
        title="تم منع إلغاء الدفعة لحماية سلامة المخزون والحسابات"
      >
        {rollbackBlockReport && (
          <div className="space-y-3 text-xs" dir="rtl">
            <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-3 text-rose-900 flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-bold leading-relaxed">{rollbackBlockReport.message}</div>
            </div>

            {rollbackBlockReport.blockers.length > 0 && (
              <div className="max-h-72 overflow-y-auto border border-rose-200 rounded-xl">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-rose-100 text-rose-950 font-black sticky top-0">
                    <tr>
                      <th className="p-2">الكود</th>
                      <th className="p-2">الصنف</th>
                      <th className="p-2">المستند / الحركة المانعة</th>
                      <th className="p-2">السبب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100">
                    {rollbackBlockReport.blockers.map((b, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-mono">{b.itemCode || '-'}</td>
                        <td className="p-2 font-bold">
                          {b.itemName} ({b.unit})
                        </td>
                        <td className="p-2 font-bold text-indigo-900">{b.documentRef}</td>
                        <td className="p-2 text-rose-800">{b.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setRollbackBlockReport(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs cursor-pointer"
              >
                فهمت، إغلاق التقرير
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

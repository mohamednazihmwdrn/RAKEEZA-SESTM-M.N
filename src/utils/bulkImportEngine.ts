import * as XLSX from 'xlsx';
import {
  AppData,
  BulkImportActionChoice,
  BulkImportBatch,
  BulkImportItemSnapshot,
  BulkImportRollbackBlockReport,
  BulkImportRollbackBlocker,
  BulkImportRow,
  Item,
  JournalEntry,
} from '../types';
import { assertPeriodUnlocked, recalculateAllAccountingBalances } from './accountingEngine';
import { getMainBranchId } from './branchIsolation';
import { addAuditLog } from './storage';
import { hasPermission } from './permissions';
import { getClientDeviceHeaders, getStoredOwnerToken, getStoredToken } from '../services/cloudApi';

function round2(n: number): number {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

export function normalizeArabicDigits(str: string): string {
  return String(str || '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function parseLocaleNumber(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'string') {
    const cleaned = normalizeArabicDigits(val)
      .replace(/[\s,٬]/g, '')
      .replace(/[^\d.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function normalizeCodeKey(code?: string): string {
  return normalizeArabicDigits(String(code || ''))
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function normalizeNameKey(name?: string): string {
  return normalizeArabicDigits(String(name || ''))
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const UNIT_SYNONYMS: Record<string, string> = {
  'قطعه': 'قطعة',
  'قطعة': 'قطعة',
  'حبة': 'قطعة',
  'حبه': 'قطعة',
  'عدد': 'قطعة',
  'pcs': 'قطعة',
  'pc': 'قطعة',
  'piece': 'قطعة',
  'pieces': 'قطعة',
  'unit': 'قطعة',
  'متر': 'متر',
  'م': 'متر',
  'meter': 'متر',
  'metre': 'متر',
  'm': 'متر',
  'لفة': 'لفة',
  'لفه': 'لفة',
  'رول': 'لفة',
  'roll': 'لفة',
  'كرتونة': 'كرتونة',
  'كرتونه': 'كرتونة',
  'carton': 'كرتونة',
  'ctn': 'كرتونة',
  'box': 'علبة',
  'علبة': 'علبة',
  'علبه': 'علبة',
  'pack': 'باكو',
  'باكو': 'باكو',
  'كيلو': 'كيلو',
  'كجم': 'كيلو',
  'kg': 'كيلو',
  'طن': 'طن',
  'ton': 'طن',
  'لتر': 'لتر',
  'liter': 'لتر',
  'litre': 'لتر',
  'طقم': 'طقم',
  'set': 'طقم',
  'جالون': 'جالون',
  'شيكارة': 'شيكارة',
  'شيكاره': 'شيكارة',
};

export function normalizeUnitDisplay(unit?: string): string {
  const raw = normalizeArabicDigits(String(unit || '')).trim().replace(/\s+/g, ' ');
  if (!raw) return 'قطعة';
  const mapped = UNIT_SYNONYMS[raw.toLowerCase()];
  return mapped || raw;
}

export function normalizeUnitKey(unit?: string): string {
  return normalizeUnitDisplay(unit).toLowerCase();
}

export function getStrictWarehouseItems(appData: AppData, warehouseId: string): Item[] {
  const mainId = getMainBranchId(appData.branches);
  const isMain = warehouseId === mainId || warehouseId === 'br-main';
  return (appData.items || []).filter((it) => {
    if (it.branchId === warehouseId) return true;
    if (isMain && !it.branchId) return true;
    return false;
  });
}

// ------------------------------------------------------------
// 1. Excel / CSV Spreadsheet Parser
// ------------------------------------------------------------

type CanonicalField =
  | 'code'
  | 'name'
  | 'category'
  | 'unit'
  | 'openingQty'
  | 'unitCost'
  | 'priceBeforeDiscount'
  | 'discountValue'
  | 'totalValue'
  | 'netPriceAfterDiscount'
  | 'salePrice'
  | 'supplierName';

const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  code: [
    'كود الصنف',
    'كود',
    'الكود',
    'رمز الصنف',
    'رقم الصنف',
    'باركود',
    'الباركود',
    'code',
    'item code',
    'item_code',
    'sku',
    'barcode',
  ],
  name: [
    'اسم الصنف',
    'اسم الصنف الأصلي',
    'الصنف',
    'اسم المنتج',
    'المنتج',
    'البيان',
    'التوصيف',
    'الوصف',
    'item name',
    'item_name',
    'product name',
    'name',
    'description',
    'item',
  ],
  category: [
    'المجموعة / التصنيف',
    'المجموعة/التصنيف',
    'المجموعة',
    'التصنيف',
    'الفئة',
    'القسم',
    'category',
    'group',
    'category name',
  ],
  unit: [
    'وحدة القياس',
    'الوحدة',
    'وحدة',
    'unit',
    'uom',
    'measure',
  ],
  openingQty: [
    'الكمية الافتتاحية',
    'الكمية',
    'كمية',
    'الرصيد الافتتاحي',
    'الرصيد',
    'العدد',
    'opening qty',
    'opening quantity',
    'opening_qty',
    'qty',
    'quantity',
    'stock',
  ],
  unitCost: [
    'سعر التكلفة للوحدة',
    'سعر التكلفة',
    'تكلفة الوحدة',
    'التكلفة',
    'سعر الشراء',
    'unit cost',
    'cost price',
    'cost',
    'unit_cost',
  ],
  priceBeforeDiscount: [
    'السعر قبل الخصم',
    'سعر قبل الخصم',
    'السعر الأساسي',
    'سعر القائمة',
    'السعر',
    'price before discount',
    'list price',
    'unit price',
    'gross price',
    'price',
  ],
  discountValue: [
    'قيمة الخصم',
    'الخصم',
    'خصم',
    'مبلغ الخصم',
    'discount value',
    'discount amount',
    'discount',
  ],
  totalValue: [
    'إجمالي قيمة الصنف',
    'اجمالي قيمة الصنف',
    'إجمالي القيمة',
    'اجمالي القيمة',
    'الإجمالي',
    'الاجمالي',
    'القيمة الإجمالية',
    'القيمة',
    'المجموع',
    'total value',
    'total amount',
    'line total',
    'total',
    'amount',
  ],
  netPriceAfterDiscount: [
    'السعر الصافي بعد الخصم',
    'سعر الصافي بعد الخصم',
    'السعر بعد الخصم',
    'صافي السعر',
    'السعر الصافي',
    'الصافي',
    'net price after discount',
    'price after discount',
    'net unit price',
    'net price',
  ],
  salePrice: [
    'سعر البيع',
    'سعر البيع المقترح',
    'سعر البيع النقدي',
    'sale price',
    'selling price',
  ],
  supplierName: [
    'اسم المورد',
    'المورد',
    'الشركة الموردة',
    'supplier',
    'supplier name',
    'vendor',
  ],
};

function cleanHeaderToken(raw: unknown): string {
  return normalizeArabicDigits(String(raw ?? ''))
    .trim()
    .toLowerCase()
    .replace(/[_\-:/\\()]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function matchHeaderToField(headerCell: unknown): CanonicalField | null {
  const token = cleanHeaderToken(headerCell);
  if (!token) return null;

  // Exact match pass first
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[CanonicalField, string[]]>) {
    for (const alias of aliases) {
      if (token === cleanHeaderToken(alias)) {
        return field;
      }
    }
  }

  // Contains match pass
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[CanonicalField, string[]]>) {
    for (const alias of aliases) {
      const cleanAlias = cleanHeaderToken(alias);
      if (cleanAlias.length >= 3 && (token.includes(cleanAlias) || cleanAlias.includes(token))) {
        return field;
      }
    }
  }
  return null;
}

function isSummaryOrFooterRow(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    !n ||
    n === 'الإجمالي' ||
    n === 'الاجمالي' ||
    n === 'المجموع' ||
    n === 'الاجمالى' ||
    n === 'total' ||
    n === 'grand total' ||
    n === 'subtotal' ||
    n.startsWith('إجمالي ') ||
    n.startsWith('total ')
  );
}

export function reconcileImportNumbers(raw: {
  openingQty: number;
  unitCost: number;
  priceBeforeDiscount: number;
  discountValue: number;
  totalValue: number;
  netPriceAfterDiscount: number;
}) {
  const openingQty = Math.max(0, round2(raw.openingQty));
  let priceBeforeDiscount = Math.max(0, round2(raw.priceBeforeDiscount));
  let discountValue = Math.max(0, round2(raw.discountValue));
  let netPriceAfterDiscount = Math.max(0, round2(raw.netPriceAfterDiscount));
  let unitCost = Math.max(0, round2(raw.unitCost));
  let totalValue = Math.max(0, round2(raw.totalValue));

  if (netPriceAfterDiscount === 0 && priceBeforeDiscount > 0) {
    netPriceAfterDiscount = round2(Math.max(0, priceBeforeDiscount - discountValue));
  }
  if (unitCost === 0 && netPriceAfterDiscount > 0) {
    unitCost = netPriceAfterDiscount;
  }
  if (unitCost === 0 && totalValue > 0 && openingQty > 0) {
    unitCost = round2(totalValue / openingQty);
  }
  if (netPriceAfterDiscount === 0 && unitCost > 0) {
    netPriceAfterDiscount = unitCost;
  }
  if (priceBeforeDiscount === 0 && unitCost > 0) {
    priceBeforeDiscount = round2(unitCost + discountValue);
  }
  if (totalValue === 0 && openingQty > 0) {
    totalValue = round2(openingQty * (netPriceAfterDiscount || unitCost));
  }

  return {
    openingQty,
    unitCost,
    priceBeforeDiscount,
    discountValue,
    totalValue,
    netPriceAfterDiscount,
  };
}

export async function parseSpreadsheetFile(
  file: File,
  warehouseId: string,
  supplierHint: string = ''
): Promise<{ rows: BulkImportRow[]; warnings: string[]; detectedColumns: string[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', codepage: 65001 });
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('الملف المرفق لا يحتوي على أي أوراق عمل أو جداول.');
  }

  const allRows: BulkImportRow[] = [];
  const warnings: string[] = [];
  const detectedColSet = new Set<string>();

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
    });
    if (!matrix || matrix.length === 0) continue;

    // Locate header row within first 10 rows
    let headerIdx = -1;
    let bestScore = 0;
    let colMap = new Map<number, CanonicalField>();

    const scanLimit = Math.min(10, matrix.length);
    for (let r = 0; r < scanLimit; r++) {
      const rowArr = matrix[r] || [];
      const candidateMap = new Map<number, CanonicalField>();
      for (let c = 0; c < rowArr.length; c++) {
        const mapped = matchHeaderToField(rowArr[c]);
        if (mapped && !Array.from(candidateMap.values()).includes(mapped)) {
          candidateMap.set(c, mapped);
        }
      }
      if (candidateMap.size > bestScore) {
        bestScore = candidateMap.size;
        headerIdx = r;
        colMap = candidateMap;
      }
    }

    if (headerIdx === -1 || colMap.size === 0) {
      warnings.push(`تعذر التعرف تلقائياً على عناوين الأعمدة في الورقة "${sheetName}".`);
      continue;
    }

    const headerCells = matrix[headerIdx] || [];
    colMap.forEach((field, colIdx) => {
      detectedColSet.add(`${String(headerCells[colIdx] || field).trim()} ← (${field})`);
    });

    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const rowCells = matrix[r] || [];
      if (!rowCells || rowCells.every((c) => String(c ?? '').trim() === '')) continue;

      const getVal = (f: CanonicalField): unknown => {
        for (const [colIdx, mappedField] of colMap.entries()) {
          if (mappedField === f) return rowCells[colIdx];
        }
        return undefined;
      };

      const rawName = normalizeArabicDigits(String(getVal('name') ?? '')).trim();
      const rawCode = normalizeArabicDigits(String(getVal('code') ?? '')).trim();

      if (!rawName && !rawCode) continue;
      if (isSummaryOrFooterRow(rawName) && !rawCode) continue;

      const nums = reconcileImportNumbers({
        openingQty: parseLocaleNumber(getVal('openingQty')),
        unitCost: parseLocaleNumber(getVal('unitCost')),
        priceBeforeDiscount: parseLocaleNumber(getVal('priceBeforeDiscount')),
        discountValue: parseLocaleNumber(getVal('discountValue')),
        totalValue: parseLocaleNumber(getVal('totalValue')),
        netPriceAfterDiscount: parseLocaleNumber(getVal('netPriceAfterDiscount')),
      });

      const salePriceVal = parseLocaleNumber(getVal('salePrice'));
      const rawCat = String(getVal('category') ?? '').trim() || 'عام';
      const rawUnit = normalizeUnitDisplay(String(getVal('unit') ?? 'قطعة'));
      const rawSupplier = String(getVal('supplierName') ?? '').trim() || supplierHint.trim();

      allRows.push({
        id: `imp_row_${Date.now()}_${allRows.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
        rowNumber: allRows.length + 1,
        code: rawCode,
        name: rawName,
        category: rawCat,
        unit: rawUnit,
        openingQty: nums.openingQty,
        unitCost: nums.unitCost,
        priceBeforeDiscount: nums.priceBeforeDiscount,
        discountValue: nums.discountValue,
        totalValue: nums.totalValue,
        netPriceAfterDiscount: nums.netPriceAfterDiscount,
        salePrice: salePriceVal > 0 ? round2(salePriceVal) : undefined,
        supplierName: rawSupplier || undefined,
        warehouseId,
        status: 'new',
        action: 'create_new',
        warnings: [],
      });
    }
  }

  return {
    rows: allRows,
    warnings,
    detectedColumns: Array.from(detectedColSet),
  };
}

export function downloadBulkImportTemplate(): void {
  const headers = [
    'كود الصنف',
    'اسم الصنف',
    'المجموعة / التصنيف',
    'وحدة القياس',
    'الكمية الافتتاحية',
    'سعر التكلفة للوحدة',
    'السعر قبل الخصم',
    'قيمة الخصم',
    'السعر الصافي بعد الخصم',
    'إجمالي قيمة الصنف',
    'سعر البيع',
    'اسم المورد',
  ];

  const sampleRows = [
    ['ITM-1001', 'كابل كهرباء نحاس 4 مم', 'كهرباء وكابلات', 'متر', 500, 18, 20, 2, 18, 9000, 25, 'الشركة الوطنية للكابلات'],
    ['ITM-1002', 'كابل كهرباء نحاس 4 مم', 'كهرباء وكابلات', 'لفة', 12, 1650, 1750, 100, 1650, 19800, 2100, 'الشركة الوطنية للكابلات'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 20 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 12 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 24 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'قالب الاستيراد الجماعي');
  XLSX.writeFile(wb, 'RAKEEZA_Bulk_Items_Template.xlsx');
}

// ------------------------------------------------------------
// 2. Server-Side PDF AI + OCR Multi-Page Extractor Client
// ------------------------------------------------------------

function buildServerAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getClientDeviceHeaders(),
  };
  const token = getStoredToken();
  if (token && !token.startsWith('local_')) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const ownerToken = getStoredOwnerToken();
  if (ownerToken) {
    headers['x-owner-token'] = ownerToken;
  }
  return headers;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const idx = res.indexOf('base64,');
      resolve(idx !== -1 ? res.substring(idx + 7) : res);
    };
    reader.onerror = () => reject(new Error('تعذر قراءة ملف PDF من الجهاز.'));
    reader.readAsDataURL(file);
  });
}

export interface PdfExtractionProgress {
  processedPages: number;
  totalPages: number;
  extractedCount: number;
  currentRange: string;
}

export async function extractPdfBulkItems(
  file: File,
  warehouseId: string,
  supplierHint: string = '',
  onProgress?: (p: PdfExtractionProgress) => void,
  apiKeyFromSettings?: string
): Promise<{ rows: BulkImportRow[]; warnings: string[]; totalPages: number }> {
  const pdfBase64 = await fileToBase64(file);
  const headers = buildServerAuthHeaders();
  if (apiKeyFromSettings && !headers['Authorization']) {
    headers['x-api-key'] = apiKeyFromSettings;
  }

  // 1. Inspect PDF total page count
  const metaRes = await fetch('/api/bulk-import/pdf-meta', {
    method: 'POST',
    headers,
    body: JSON.stringify({ pdfBase64 }),
  });
  const metaJson = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok || !metaJson?.success) {
    throw new Error(metaJson?.error || 'تعذر قراءة عدد صفحات ملف الـ PDF. تأكد من تسجيل الدخول السحابي.');
  }

  const totalPages: number = Math.max(1, Number(metaJson.totalPages || 1));
  const chunkSize = 3;
  const rows: BulkImportRow[] = [];
  const warningSet = new Set<string>();

  for (let startPage = 1; startPage <= totalPages; startPage += chunkSize) {
    const endPage = Math.min(totalPages, startPage + chunkSize - 1);
    onProgress?.({
      processedPages: startPage - 1,
      totalPages,
      extractedCount: rows.length,
      currentRange: `${startPage}-${endPage}`,
    });

    const extractRes = await fetch('/api/bulk-import/extract-pdf', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pdfBase64,
        startPage,
        endPage,
        supplierHint,
      }),
    });
    const extractJson = await extractRes.json().catch(() => ({}));
    if (!extractRes.ok || !extractJson?.success) {
      throw new Error(
        extractJson?.error ||
          `تعذر استخراج الأصناف من الصفحات ${startPage}-${endPage} من ملف الـ PDF.`
      );
    }

    const chunkItems = Array.isArray(extractJson.items) ? extractJson.items : [];
    const chunkWarnings = Array.isArray(extractJson.warnings) ? extractJson.warnings : [];
    chunkWarnings.forEach((w: string) => warningSet.add(w));

    for (const rawItem of chunkItems) {
      const nums = reconcileImportNumbers({
        openingQty: Number(rawItem.openingQty || 0),
        unitCost: Number(rawItem.unitCost || 0),
        priceBeforeDiscount: Number(rawItem.priceBeforeDiscount || 0),
        discountValue: Number(rawItem.discountValue || 0),
        totalValue: Number(rawItem.totalValue || 0),
        netPriceAfterDiscount: Number(rawItem.netPriceAfterDiscount || 0),
      });

      const uncertainFields: string[] = Array.isArray(rawItem.uncertainFields)
        ? rawItem.uncertainFields
        : [];

      rows.push({
        id: `imp_pdf_${Date.now()}_${rows.length + 1}_${Math.random().toString(36).slice(2, 6)}`,
        rowNumber: rows.length + 1,
        pageNumber: Number(rawItem.pageNumber || startPage),
        code: normalizeArabicDigits(String(rawItem.code || '')).trim(),
        name: String(rawItem.name || '').trim(),
        category: String(rawItem.category || 'عام').trim() || 'عام',
        unit: normalizeUnitDisplay(String(rawItem.unit || 'قطعة')),
        openingQty: nums.openingQty,
        unitCost: nums.unitCost,
        priceBeforeDiscount: nums.priceBeforeDiscount,
        discountValue: nums.discountValue,
        totalValue: nums.totalValue,
        netPriceAfterDiscount: nums.netPriceAfterDiscount,
        supplierName: String(rawItem.supplierName || supplierHint || '').trim() || undefined,
        warehouseId,
        status: 'new',
        action: 'create_new',
        warnings: [],
        uncertainFields,
      });
    }

    onProgress?.({
      processedPages: endPage,
      totalPages,
      extractedCount: rows.length,
      currentRange: `${startPage}-${endPage}`,
    });
  }

  return {
    rows,
    warnings: Array.from(warningSet),
    totalPages,
  };
}

// ------------------------------------------------------------
// 3. Matching, Duplicate Detection & Validation Analyzer
// ------------------------------------------------------------

export function analyzeBulkImportRows(
  rows: BulkImportRow[],
  appData: AppData,
  warehouseId: string,
  preserveExistingChoice: boolean = true
): BulkImportRow[] {
  const warehouseItems = getStrictWarehouseItems(appData, warehouseId);

  // Build warehouse lookup maps
  const byCode = new Map<string, Item[]>();
  const byNameAndUnit = new Map<string, Item>();

  for (const it of warehouseItems) {
    const cKey = normalizeCodeKey(it.code);
    if (cKey) {
      const list = byCode.get(cKey) || [];
      list.push(it);
      byCode.set(cKey, list);
    }
    const nKey = normalizeNameKey(it.name);
    const uKey = normalizeUnitKey(it.unit);
    if (nKey) {
      byNameAndUnit.set(`${nKey}::${uKey}`, it);
    }
  }

  // Track in-batch duplicates
  const seenCodesInBatch = new Map<string, number>();
  const seenNameUnitsInBatch = new Map<string, number>();

  return rows.map((row, idx) => {
    const warnings: string[] = [];
    const codeKey = normalizeCodeKey(row.code);
    const nameKey = normalizeNameKey(row.name);
    const unitKey = normalizeUnitKey(row.unit);
    const nameUnitKey = nameKey ? `${nameKey}::${unitKey}` : '';

    // 1. Validate required / numeric sanity
    let hasMissing = false;
    if (!nameKey) {
      hasMissing = true;
      warnings.push('اسم الصنف مفقود — يرجى إدخال اسم الصنف قبل الاعتماد.');
    }
    if (row.openingQty < 0 || !Number.isFinite(row.openingQty)) {
      hasMissing = true;
      warnings.push('الكمية الافتتاحية غير صالحة (لا يمكن أن تكون سالبة).');
    }
    if (row.unitCost < 0 || !Number.isFinite(row.unitCost)) {
      hasMissing = true;
      warnings.push('سعر التكلفة غير صالح.');
    }
    if (row.openingQty > 0 && row.unitCost === 0 && row.netPriceAfterDiscount === 0) {
      warnings.push('الكمية الافتتاحية موجبة بينما سعر التكلفة = 0 (تحقق من السعر).');
    }
    if (row.uncertainFields && row.uncertainFields.length > 0) {
      warnings.push(`قراءة OCR غير مؤكدة في الحقول: (${row.uncertainFields.join('، ')}) — يرجى المراجعة.`);
    }

    // 2. Check duplicate within the same uploaded file
    let duplicateOfRowNumber: number | null = null;
    if (codeKey && seenCodesInBatch.has(codeKey)) {
      duplicateOfRowNumber = seenCodesInBatch.get(codeKey)!;
      warnings.push(`تكرار لنفس الكود داخل الدفعة (مكرر مع السطر #${duplicateOfRowNumber}).`);
    } else if (nameUnitKey && seenNameUnitsInBatch.has(nameUnitKey)) {
      duplicateOfRowNumber = seenNameUnitsInBatch.get(nameUnitKey)!;
      warnings.push(`تكرار لنفس الاسم والوحدة داخل الدفعة (مكرر مع السطر #${duplicateOfRowNumber}).`);
    }

    if (codeKey && !seenCodesInBatch.has(codeKey)) {
      seenCodesInBatch.set(codeKey, idx + 1);
    }
    if (nameUnitKey && !seenNameUnitsInBatch.has(nameUnitKey)) {
      seenNameUnitsInBatch.set(nameUnitKey, idx + 1);
    }

    // 3. Match against existing catalog strictly in this company & warehouse
    let matchedItem: Item | undefined;
    let isCodeConflict = false;

    if (codeKey && byCode.has(codeKey)) {
      const candidates = byCode.get(codeKey)!;
      // Prefer candidate with exact same unit
      const sameUnitCandidate = candidates.find((c) => normalizeUnitKey(c.unit) === unitKey);
      if (sameUnitCandidate) {
        matchedItem = sameUnitCandidate;
      } else {
        // Same code exists with a DIFFERENT unit! Never merge different units silently!
        const firstCand = candidates[0];
        isCodeConflict = true;
        matchedItem = firstCand;
        warnings.push(
          `تعارض كود: الكود [${row.code}] مستخدم بالفعل للصنف "${firstCand.name}" بوحدة (${firstCand.unit || 'قطعة'}) مختلفة عن (${row.unit}). غيّر الكود لإنشاء صنف بوحدة مستقلة أو تجاهل السطر.`
        );
      }
    } else if (nameUnitKey && byNameAndUnit.has(nameUnitKey)) {
      matchedItem = byNameAndUnit.get(nameUnitKey);
    }

    // Determine status & safe default action
    let status: BulkImportRow['status'] = 'new';
    let defaultAction: BulkImportActionChoice = 'create_new';

    if (hasMissing) {
      status = 'missing_data';
      defaultAction = 'skip';
    } else if (isCodeConflict) {
      status = 'code_conflict';
      defaultAction = 'skip';
    } else if (duplicateOfRowNumber !== null) {
      status = 'duplicate_in_file';
      defaultAction = 'skip';
    } else if (matchedItem) {
      status = 'match_existing';
      // Safe default: never silently add/overwrite balances without explicit user consent!
      defaultAction = 'skip';
      warnings.push(
        `صنف موجود مسبقاً بالمخزن ("${matchedItem.name}" — الرصيد الحالي: ${matchedItem.quantity} ${matchedItem.unit || 'قطعة'} — التكلفة: ${matchedItem.purchasePrice || 0}). اختر إجراءً واضحاً (تحديث بيانات / إضافة كمية / تجاهل).`
      );
    }

    // Keep user's explicit valid action if re-analyzing after edit
    let action: BulkImportActionChoice = defaultAction;
    if (preserveExistingChoice && row.action) {
      if (status === 'new' && (row.action === 'create_new' || row.action === 'skip')) {
        action = row.action;
      } else if (
        status === 'match_existing' &&
        (row.action === 'update_data' || row.action === 'add_qty' || row.action === 'skip')
      ) {
        action = row.action;
      } else if (
        status === 'duplicate_in_file' &&
        (row.action === 'skip' || row.action === 'create_new')
      ) {
        action = row.action;
      }
    }

    return {
      ...row,
      rowNumber: idx + 1,
      warehouseId,
      status,
      action,
      matchedItemId: matchedItem?.id,
      matchedItemName: matchedItem?.name,
      matchedItemQty: matchedItem?.quantity,
      matchedItemCost: matchedItem ? Number(matchedItem.avgCost || matchedItem.purchasePrice || 0) : undefined,
      matchedItemUnit: matchedItem?.unit || undefined,
      warnings,
    };
  });
}

// ------------------------------------------------------------
// 4. Atomic Opening-Balance Import Execution (Idempotent + Double-Entry GL)
// ------------------------------------------------------------

export interface CommitBulkImportParams {
  appData: AppData;
  rows: BulkImportRow[];
  warehouseId: string;
  sourceType: 'excel' | 'csv' | 'pdf';
  fileName: string;
  importDate: string;
  supplierName?: string;
  defaultSaleMarkupPercent?: number;
  idempotencyKey: string;
}

export interface CommitBulkImportResult {
  success: boolean;
  duplicate?: boolean;
  error?: string;
  batch?: BulkImportBatch;
  updatedData?: AppData;
}

export function executeBulkImportBatch(params: CommitBulkImportParams): CommitBulkImportResult {
  const {
    appData,
    rows,
    warehouseId,
    sourceType,
    fileName,
    importDate,
    supplierName,
    defaultSaleMarkupPercent = 0,
    idempotencyKey,
  } = params;

  const currentUser =
    appData.users?.find((u) => u.id === appData.currentUser) || appData.users?.[0];

  if (!hasPermission(currentUser, 'bulk_import') && !hasPermission(currentUser, 'items_create')) {
    return {
      success: false,
      error: 'عفواً، لا يمتلك المستخدم الحالي صلاحية تنفيذ الاستيراد الجماعي للأصناف.',
    };
  }

  // 1. Idempotency Guard
  const existingBatchId = appData.processedImportKeys?.[idempotencyKey];
  if (existingBatchId) {
    const existingBatch = (appData.bulkImportBatches || []).find((b) => b.id === existingBatchId);
    return {
      success: true,
      duplicate: true,
      batch: existingBatch,
      updatedData: appData,
    };
  }
  const duplicateByKey = (appData.bulkImportBatches || []).find(
    (b) => b.idempotencyKey === idempotencyKey && b.status === 'committed'
  );
  if (duplicateByKey) {
    return {
      success: true,
      duplicate: true,
      batch: duplicateByKey,
      updatedData: appData,
    };
  }

  // 2. Period Lock Check
  try {
    assertPeriodUnlocked(appData, importDate, 'اعتماد دفعة الاستيراد الجماعي للأرصدة الافتتاحية');
  } catch (err: any) {
    return { success: false, error: err?.message || 'الفترة المحاسبية مقفلة.' };
  }

  // 3. Re-analyze against current catalog before commit
  const analyzedRows = analyzeBulkImportRows(rows, appData, warehouseId, true);
  const blockingErrors = analyzedRows.filter(
    (r) => r.action !== 'skip' && (r.status === 'missing_data' || r.status === 'code_conflict')
  );
  if (blockingErrors.length > 0) {
    return {
      success: false,
      error: `يوجد (${blockingErrors.length}) سطر به بيانات ناقصة أو تعارض كود لا يزال مفعلاً. قم بتصحيحه أو اختيار "تجاهل" قبل الاعتماد.`,
    };
  }

  const activeRows = analyzedRows.filter((r) => r.action !== 'skip');
  if (activeRows.length === 0) {
    return {
      success: false,
      error: 'لا توجد أي أصناف محددة للاعتماد (جميع السطور مضبوطة على تجاهل أو الجدول فارغ).',
    };
  }

  const companyId = appData.companyId || 'COMP-000001';
  const branch = (appData.branches || []).find((b) => b.id === warehouseId);
  const warehouseName = branch?.name || 'المخزن الرئيسي';
  const nextSeq = Number(appData.nextBulkImportId || (appData.bulkImportBatches?.length || 0) + 1);
  const batchId = `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const batchNumber = `OB-IMP-${String(nextSeq).padStart(4, '0')}`;
  const nowIso = new Date().toISOString();

  const itemsCopy: Item[] = [...(appData.items || [])];
  const itemSnapshots: BulkImportItemSnapshot[] = [];

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = analyzedRows.length - activeRows.length;
  let totalOpeningQty = 0;
  let totalOpeningValue = 0;

  const categoriesSet = new Set<string>(appData.advancedSettings?.categories || ['عام']);
  const unitsSet = new Set<string>(appData.advancedSettings?.units || ['قطعة']);

  activeRows.forEach((row, idx) => {
    const cleanName = row.name.trim();
    const cleanCode = row.code.trim();
    const cleanCategory = row.category.trim() || 'عام';
    const cleanUnit = normalizeUnitDisplay(row.unit);
    const effectiveSupplier = (row.supplierName || supplierName || '').trim() || undefined;
    const qty = Math.max(0, round2(row.openingQty));
    const unitCost = Math.max(
      0,
      round2(row.unitCost > 0 ? row.unitCost : row.netPriceAfterDiscount)
    );
    const addedValue = round2(qty * unitCost);
    const computedSalePrice =
      row.salePrice && row.salePrice > 0
        ? round2(row.salePrice)
        : defaultSaleMarkupPercent > 0 && unitCost > 0
        ? round2(unitCost * (1 + defaultSaleMarkupPercent / 100))
        : 0;

    categoriesSet.add(cleanCategory);
    unitsSet.add(cleanUnit);

    if (row.action === 'create_new') {
      const newItemId = `i_bulk_${nextSeq}_${idx + 1}_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 5)}`;

      const newItem: Item = {
        id: newItemId,
        companyId,
        branchId: warehouseId,
        code: cleanCode || undefined,
        name: cleanName,
        category: cleanCategory,
        unit: cleanUnit,
        quantity: qty,
        purchasePrice: unitCost,
        costPrice: unitCost,
        avgCost: unitCost,
        salePrice: computedSalePrice,
        normalSellingPrice: computedSalePrice,
        costMethod: 'avg',
        supplierName: effectiveSupplier,
        openingBalanceBatchId: batchId,
        fifoLayers:
          qty > 0 && unitCost > 0
            ? [
                {
                  id: `fifo_${batchId}_${idx + 1}`,
                  date: importDate,
                  remainingQty: qty,
                  unitCost,
                },
              ]
            : [],
        movements:
          qty > 0
            ? [
                {
                  date: importDate,
                  type: 'adjustment',
                  qty,
                  price: unitCost,
                  total: addedValue,
                  note: `رصيد افتتاحي - استيراد جماعي (${batchNumber})${effectiveSupplier ? ` | المورد: ${effectiveSupplier}` : ''}`,
                  branchName: warehouseName,
                },
              ]
            : [],
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: currentUser?.name || 'مدير النظام',
        createdByUserId: currentUser?.id,
        createdByUserCode: currentUser?.code || 1,
      };

      itemsCopy.push(newItem);
      createdCount += 1;
      totalOpeningQty = round2(totalOpeningQty + qty);
      totalOpeningValue = round2(totalOpeningValue + addedValue);

      itemSnapshots.push({
        action: 'created',
        itemId: newItemId,
        itemCode: cleanCode,
        itemName: cleanName,
        unit: cleanUnit,
        branchId: warehouseId,
        qtyAdded: qty,
        valueAdded: addedValue,
        beforeItem: null,
      });
    } else if (row.action === 'update_data' && row.matchedItemId) {
      const targetIdx = itemsCopy.findIndex((it) => it.id === row.matchedItemId);
      if (targetIdx !== -1) {
        const prevItem = itemsCopy[targetIdx];
        const beforeClone: Item = JSON.parse(JSON.stringify(prevItem));

        const updatedItem: Item = {
          ...prevItem,
          code: cleanCode || prevItem.code,
          name: cleanName,
          category: cleanCategory || prevItem.category,
          unit: cleanUnit || prevItem.unit,
          purchasePrice: unitCost > 0 ? unitCost : prevItem.purchasePrice,
          costPrice: unitCost > 0 ? unitCost : prevItem.costPrice,
          avgCost:
            unitCost > 0 && Number(prevItem.quantity || 0) === 0
              ? unitCost
              : prevItem.avgCost,
          salePrice: computedSalePrice > 0 ? computedSalePrice : prevItem.salePrice,
          normalSellingPrice:
            computedSalePrice > 0 ? computedSalePrice : prevItem.normalSellingPrice,
          supplierName: effectiveSupplier || prevItem.supplierName,
          openingBalanceBatchId: batchId,
          updatedAt: nowIso,
          updatedBy: currentUser?.name || 'مدير النظام',
        };

        itemsCopy[targetIdx] = updatedItem;
        updatedCount += 1;

        itemSnapshots.push({
          action: 'updated_data',
          itemId: prevItem.id,
          itemCode: prevItem.code || cleanCode,
          itemName: prevItem.name,
          unit: prevItem.unit || cleanUnit,
          branchId: prevItem.branchId || warehouseId,
          qtyAdded: 0,
          valueAdded: 0,
          beforeItem: beforeClone,
        });
      }
    } else if (row.action === 'add_qty' && row.matchedItemId) {
      const targetIdx = itemsCopy.findIndex((it) => it.id === row.matchedItemId);
      if (targetIdx !== -1) {
        const prevItem = itemsCopy[targetIdx];
        const beforeClone: Item = JSON.parse(JSON.stringify(prevItem));

        const prevQty = Number(prevItem.quantity || 0);
        const prevAvg = Number(prevItem.avgCost || prevItem.purchasePrice || prevItem.costPrice || 0);
        const newQty = round2(prevQty + qty);
        const newAvg =
          prevQty > 0 && qty > 0 && newQty > 0
            ? round2((prevQty * prevAvg + addedValue) / newQty)
            : unitCost > 0
            ? unitCost
            : prevAvg;

        const nextFifo = [...(prevItem.fifoLayers || [])];
        if (qty > 0 && unitCost > 0) {
          nextFifo.push({
            id: `fifo_${batchId}_${idx + 1}`,
            date: importDate,
            remainingQty: qty,
            unitCost,
          });
        }

        const nextMovements = [...(prevItem.movements || [])];
        if (qty > 0) {
          nextMovements.push({
            date: importDate,
            type: 'adjustment',
            qty,
            price: unitCost,
            total: addedValue,
            note: `إضافة رصيد افتتاحي - استيراد جماعي (${batchNumber})${effectiveSupplier ? ` | المورد: ${effectiveSupplier}` : ''}`,
            branchName: warehouseName,
          });
        }

        const updatedItem: Item = {
          ...prevItem,
          category: cleanCategory || prevItem.category,
          quantity: newQty,
          purchasePrice: unitCost > 0 ? unitCost : prevItem.purchasePrice,
          costPrice: newAvg,
          avgCost: newAvg,
          salePrice: computedSalePrice > 0 ? computedSalePrice : prevItem.salePrice,
          normalSellingPrice:
            computedSalePrice > 0 ? computedSalePrice : prevItem.normalSellingPrice,
          supplierName: effectiveSupplier || prevItem.supplierName,
          openingBalanceBatchId: batchId,
          fifoLayers: nextFifo,
          movements: nextMovements,
          updatedAt: nowIso,
          updatedBy: currentUser?.name || 'مدير النظام',
        };

        itemsCopy[targetIdx] = updatedItem;
        updatedCount += 1;
        totalOpeningQty = round2(totalOpeningQty + qty);
        totalOpeningValue = round2(totalOpeningValue + addedValue);

        itemSnapshots.push({
          action: 'added_qty',
          itemId: prevItem.id,
          itemCode: prevItem.code || cleanCode,
          itemName: prevItem.name,
          unit: prevItem.unit || cleanUnit,
          branchId: prevItem.branchId || warehouseId,
          qtyAdded: qty,
          valueAdded: addedValue,
          beforeItem: beforeClone,
        });
      }
    }
  });

  // 4. Ensure GL account 3104 (Opening Balances Equity) exists
  const accountsCopy = [...(appData.accounts || [])];
  if (!accountsCopy.some((a) => a.code === '3104')) {
    accountsCopy.push({
      code: '3104',
      name: 'أرصدة افتتاحية للمخزون (Opening Balances Equity)',
      type: 'equity',
      parentCode: '3',
      isParent: false,
      debit: 0,
      credit: 0,
      balance: 0,
    });
  }

  // 5. Post Strict Double-Entry Opening Balance Journal Entry ONLY for added inventory value
  // Zero PurchaseInvoices, Zero CashTransactions, Zero Supplier Balances!
  const journalEntriesCopy = [...(appData.journalEntries || [])];
  let nextJournalId = Number(appData.nextJournalId || 1);
  let journalEntryId: number | undefined;

  if (totalOpeningValue > 0) {
    journalEntryId = nextJournalId;
    nextJournalId += 1;

    const entry: JournalEntry = {
      id: journalEntryId,
      date: importDate,
      entryNumber: `JE-${batchNumber}`,
      reference: batchNumber,
      description: `قيد إثبات أرصدة افتتاحية للمخزون (${warehouseName}) — دفعة استيراد جماعي ${batchNumber} (${fileName})`,
      lines: [
        {
          accountCode: '1106',
          accountName: 'مخزون البضاعة (Merchandise Inventory)',
          debit: totalOpeningValue,
          credit: 0,
          costCenter: warehouseId,
          note: `أرصدة افتتاحية مخزنية — ${warehouseName}`,
        },
        {
          accountCode: '3104',
          accountName: 'أرصدة افتتاحية للمخزون (Opening Balances Equity)',
          debit: 0,
          credit: totalOpeningValue,
          costCenter: warehouseId,
          note: `مقابل أرصدة افتتاحية — بدون أثر نقدي أو مديونية مورد`,
        },
      ],
      source: 'inventory',
      createdBy: currentUser?.name || 'مدير النظام',
      createdAt: nowIso,
      isApproved: true,
    };

    journalEntriesCopy.push(entry);
  }

  const batch: BulkImportBatch = {
    id: batchId,
    batchNumber,
    idempotencyKey,
    companyId,
    warehouseId,
    warehouseName,
    sourceType,
    fileName,
    supplierName: supplierName?.trim() || undefined,
    importDate,
    createdAt: nowIso,
    createdBy: currentUser?.name || 'مدير النظام',
    status: 'committed',
    totalRows: analyzedRows.length,
    createdCount,
    updatedCount,
    skippedCount,
    totalOpeningQty,
    totalOpeningValue,
    journalEntryId,
    itemSnapshots,
  };

  let nextAppData: AppData = {
    ...appData,
    items: itemsCopy,
    accounts: accountsCopy,
    journalEntries: journalEntriesCopy,
    nextJournalId,
    bulkImportBatches: [batch, ...(appData.bulkImportBatches || [])],
    nextBulkImportId: nextSeq + 1,
    processedImportKeys: {
      ...(appData.processedImportKeys || {}),
      [idempotencyKey]: batchId,
    },
    advancedSettings: {
      ...(appData.advancedSettings || { categories: ['عام'], itemGroups: ['عام'], units: ['قطعة'] }),
      categories: Array.from(categoriesSet),
      units: Array.from(unitsSet),
    },
  };

  nextAppData = recalculateAllAccountingBalances(nextAppData);
  nextAppData = addAuditLog(
    nextAppData,
    'create',
    'الاستيراد الجماعي للأصناف',
    `اعتماد دفعة استيراد (${batchNumber}) إلى [${warehouseName}] من (${fileName}): جديد ${createdCount}، محدّث ${updatedCount}، إجمالي الكمية ${totalOpeningQty}، إجمالي القيمة ${totalOpeningValue.toLocaleString('en-US')}`
  );

  return {
    success: true,
    batch,
    updatedData: nextAppData,
  };
}

// ------------------------------------------------------------
// 5. Safe Batch Rollback Validator & Executor
// ------------------------------------------------------------

export function checkBulkImportRollbackEligibility(
  appData: AppData,
  batch: BulkImportBatch
): BulkImportRollbackBlockReport {
  if (batch.status === 'rolled_back') {
    return {
      allowed: false,
      blockers: [],
      message: `تم التراجع عن الدفعة (${batch.batchNumber}) مسبقاً بتاريخ ${batch.rolledBackAt || ''}.`,
    };
  }

  try {
    assertPeriodUnlocked(appData, batch.importDate, 'التراجع عن دفعة الاستيراد الجماعي');
  } catch (err: any) {
    return {
      allowed: false,
      blockers: [],
      message: err?.message || 'الفترة المحاسبية الخاصة بالدفعة مقفلة.',
    };
  }

  const blockers: BulkImportRollbackBlocker[] = [];
  const snapshotMap = new Map<string, BulkImportItemSnapshot>();
  for (const snap of batch.itemSnapshots || []) {
    snapshotMap.set(snap.itemId, snap);
  }

  const isAfterBatch = (docCreatedAt?: string, docDate?: string): boolean => {
    if (docCreatedAt && batch.createdAt && docCreatedAt > batch.createdAt) return true;
    if (docDate && batch.importDate && docDate.slice(0, 10) > batch.importDate.slice(0, 10)) return true;
    // Same day without createdAt timestamp: conservatively inspect if invoice touched it
    if (!docCreatedAt && docDate && batch.importDate && docDate.slice(0, 10) === batch.importDate.slice(0, 10)) {
      return true;
    }
    return false;
  };

  // 1. Check Sales Invoices
  for (const inv of appData.salesInvoices || []) {
    if (inv.status === 'cancelled') continue;
    if (!isAfterBatch(inv.createdAt, inv.date)) continue;
    for (const line of inv.items || []) {
      const snap = line.itemId ? snapshotMap.get(line.itemId) : undefined;
      if (snap) {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: 'تم البيع أو إصدار مرتجع مبيعات على الصنف بعد دفعة الاستيراد',
          documentRef: `فاتورة مبيعات #${inv.id} (${inv.date})`,
        });
      }
    }
  }

  // 2. Check Purchase Invoices
  for (const inv of appData.purchaseInvoices || []) {
    if ((inv as any).status === 'cancelled') continue;
    if (!isAfterBatch((inv as any).createdAt, inv.date)) continue;
    for (const line of inv.items || []) {
      const snap = line.itemId ? snapshotMap.get(line.itemId) : undefined;
      if (snap) {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: 'تم تسجيل حركة شراء أو مرتجع شراء على الصنف بعد دفعة الاستيراد',
          documentRef: `فاتورة مشتريات #${inv.id} (${inv.date})`,
        });
      }
    }
  }

  // 3. Check Stock Transfers
  for (const tr of appData.stockTransfers || []) {
    if (!isAfterBatch((tr as any).createdAt, tr.date)) continue;
    const trItems = (tr as any).items || (tr.itemId ? [{ itemId: tr.itemId }] : []);
    for (const ti of trItems) {
      const snap = ti?.itemId ? snapshotMap.get(ti.itemId) : undefined;
      if (snap) {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: 'تم تحويل مخزني على الصنف بعد دفعة الاستيراد',
          documentRef: `تحويل مخزني ${(tr as any).transferNumber || tr.id} (${tr.date})`,
        });
      }
    }
  }

  // 4. Check Stocktaking Sessions & Adjustments
  for (const st of appData.physicalInventories || []) {
    if (st.status === 'cancelled') continue;
    if (!isAfterBatch(st.createdAt, st.date)) continue;
    for (const si of st.items || []) {
      const snap = snapshotMap.get(si.itemId);
      if (snap) {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: 'تم إدراج الصنف في جلسة جرد فعلي لاحقة',
          documentRef: `جلسة جرد ${st.sessionNumber} (${st.date})`,
        });
      }
    }
  }

  for (const adj of appData.inventoryAdjustments || []) {
    if (adj.status === 'reversed') continue;
    if (!isAfterBatch(adj.createdAt, adj.date)) continue;
    for (const ai of adj.items || []) {
      const snap = snapshotMap.get(ai.itemId);
      if (snap) {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: 'تم تسجيل تسوية مخزنية على الصنف بعد دفعة الاستيراد',
          documentRef: `سند تسوية ${adj.voucherNumber} (${adj.date})`,
        });
      }
    }
  }

  // 5. Check Goods Issue Vouchers
  for (const gin of appData.goodsIssueVouchers || []) {
    if (!isAfterBatch((gin as any).createdAt, gin.date)) continue;
    for (const gi of gin.items || []) {
      const snap = gi.itemId ? snapshotMap.get(gi.itemId) : undefined;
      if (snap) {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: 'تم صرف مخزني على الصنف بعد دفعة الاستيراد',
          documentRef: `إذن صرف ${gin.voucherNumber} (${gin.date})`,
        });
      }
    }
  }

  // 6. Check Item-level movements & quantity integrity
  const itemsById = new Map<string, Item>((appData.items || []).map((it) => [it.id, it]));
  for (const snap of batch.itemSnapshots || []) {
    const liveItem = itemsById.get(snap.itemId);
    if (!liveItem) {
      if (snap.action === 'created') {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: 'تم حذف الصنف يدوياً مسبقاً من دليل الأصناف',
          documentRef: 'دليل الأصناف',
        });
      }
      continue;
    }

    const movements = liveItem.movements || [];
    if (snap.action === 'created') {
      const nonBatchMovements = movements.filter((m) => !(m.note || '').includes(batch.batchNumber));
      if (nonBatchMovements.length > 0) {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: 'تمت حركات مخزنية لاحقة مسجلة ببطاقة الصنف',
          documentRef: nonBatchMovements[0].note || 'حركة مخزنية',
        });
      } else if (Math.abs(Number(liveItem.quantity || 0) - Number(snap.qtyAdded || 0)) > 0.001) {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: `الرصيد الحالي (${liveItem.quantity}) اختلف عن الكمية المستوردة (${snap.qtyAdded})`,
          documentRef: 'تعديل رصيد الصنف',
        });
      }
    } else if (snap.action === 'added_qty') {
      const batchIdx = movements.findIndex((m) => (m.note || '').includes(batch.batchNumber));
      if (batchIdx !== -1 && batchIdx < movements.length - 1) {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: 'تمت حركات مخزنية بعد إضافة الرصيد الافتتاحي لهذه الدفعة',
          documentRef: movements[batchIdx + 1]?.note || 'حركة مخزنية لاحقة',
        });
      } else if (Number(liveItem.quantity || 0) < Number(snap.qtyAdded || 0) - 0.001) {
        blockers.push({
          itemId: snap.itemId,
          itemCode: snap.itemCode,
          itemName: snap.itemName,
          unit: snap.unit,
          reason: `الرصيد المتوفر حالياً (${liveItem.quantity}) أقل من الكمية المضافة (${snap.qtyAdded})`,
          documentRef: 'رصيد المخزن الحالي',
        });
      }
    }
  }

  // Deduplicate identical blocker lines
  const uniqueBlockers: BulkImportRollbackBlocker[] = [];
  const seenBlockerKey = new Set<string>();
  for (const b of blockers) {
    const key = `${b.itemId}::${b.documentRef}::${b.reason}`;
    if (!seenBlockerKey.has(key)) {
      seenBlockerKey.add(key);
      uniqueBlockers.push(b);
    }
  }

  if (uniqueBlockers.length > 0) {
    return {
      allowed: false,
      blockers: uniqueBlockers,
      message: `تعذر إلغاء الدفعة (${batch.batchNumber}) لوجود (${uniqueBlockers.length}) حركة لاحقة على الأصناف المتأثرة. لحماية سلامة المخزون والقيود، لا يمكن التراجع الآلي بعد استخدام الأصناف.`,
    };
  }

  return {
    allowed: true,
    blockers: [],
    message: `الدفعة (${batch.batchNumber}) جاهزة للتراجع الآمن بالكامل دون أي تعارضات مخزنية.`,
  };
}

export function rollbackBulkImportBatch(
  appData: AppData,
  batchId: string
): { success: boolean; error?: string; blockReport?: BulkImportRollbackBlockReport; updatedData?: AppData } {
  const currentUser =
    appData.users?.find((u) => u.id === appData.currentUser) || appData.users?.[0];

  if (!hasPermission(currentUser, 'bulk_import') && !hasPermission(currentUser, 'items_delete')) {
    return {
      success: false,
      error: 'عفواً، لا يمتلك المستخدم الحالي صلاحية التراجع عن دفعات الاستيراد الجماعي.',
    };
  }

  const batch = (appData.bulkImportBatches || []).find((b) => b.id === batchId);
  if (!batch) {
    return { success: false, error: 'لم يتم العثور على دفعة الاستيراد المطلوبة.' };
  }

  const eligibility = checkBulkImportRollbackEligibility(appData, batch);
  if (!eligibility.allowed) {
    return {
      success: false,
      error: eligibility.message,
      blockReport: eligibility,
    };
  }

  const nowTs = Date.now();
  const nowIso = new Date().toISOString();
  const createdIdsToRemove = new Set<string>();
  const restoreMap = new Map<string, Item>();
  const deletedRecords: Record<string, number> = { ...(appData.deletedRecords || {}) };

  for (const snap of batch.itemSnapshots || []) {
    if (snap.action === 'created') {
      createdIdsToRemove.add(snap.itemId);
      deletedRecords[`items_${snap.itemId}`] = nowTs;
    } else if ((snap.action === 'updated_data' || snap.action === 'added_qty') && snap.beforeItem) {
      const cloned: Item = JSON.parse(JSON.stringify(snap.beforeItem));
      restoreMap.set(snap.itemId, {
        ...cloned,
        supplierName: cloned.supplierName || '',
        openingBalanceBatchId: cloned.openingBalanceBatchId || '',
        fifoLayers: cloned.fifoLayers || [],
        movements: cloned.movements || [],
      });
    }
  }

  const nextItems = (appData.items || [])
    .filter((it) => !createdIdsToRemove.has(it.id))
    .map((it) => (restoreMap.has(it.id) ? restoreMap.get(it.id)! : it));

  let nextJournalEntries = [...(appData.journalEntries || [])];
  if (batch.journalEntryId !== undefined && batch.journalEntryId !== null) {
    nextJournalEntries = nextJournalEntries.filter((je) => je.id !== batch.journalEntryId);
    deletedRecords[`journalEntries_${batch.journalEntryId}`] = nowTs;
  }

  const nextBatches = (appData.bulkImportBatches || []).map((b) =>
    b.id === batch.id
      ? {
          ...b,
          status: 'rolled_back' as const,
          rolledBackAt: nowIso,
          rolledBackBy: currentUser?.name || 'مدير النظام',
        }
      : b
  );

  let nextData: AppData = {
    ...appData,
    items: nextItems,
    journalEntries: nextJournalEntries,
    bulkImportBatches: nextBatches,
    deletedRecords,
  };

  nextData = recalculateAllAccountingBalances(nextData);
  nextData = addAuditLog(
    nextData,
    'delete',
    'الاستيراد الجماعي للأصناف',
    `تراجع آمن عن دفعة الاستيراد (${batch.batchNumber}) للمخزن [${batch.warehouseName}] — تم حذف ${createdIdsToRemove.size} صنف مستحدث وإرجاع ${restoreMap.size} صنف لحالته السابقة وعكس القيد المحاسبي.`
  );

  return {
    success: true,
    updatedData: nextData,
  };
}

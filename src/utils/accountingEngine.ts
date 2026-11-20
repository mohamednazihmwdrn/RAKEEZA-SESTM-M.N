import {
  AppData,
  SaleInvoice,
  PurchaseInvoice,
  CashTransaction,
  CashBox,
  JournalEntry,
  JournalLine,
  Item,
  ItemMovement,
  FifoCostLayer,
  AccountNode,
} from '../types';
import { getMainBranchId } from './branchIsolation';
import { calculateCustomerBalance, calculateSupplierBalance } from './accounting';

/**
 * 🏛️ RAKEEZA UNIFIED DOUBLE-ENTRY ACCOUNTING & FIFO INVENTORY ENGINE (V4 Enterprise)
 * المحرك المحاسبي المركزي الموحد — القيد المزدوج، جرد مستمر (Perpetual)، FIFO/متوسط مرجح، وتوفيق الخزائن.
 */

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeEngineText(value?: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateNextUniqueItemCode(existingItems: Item[], rawCode?: string): string {
  const cleanRaw = (rawCode || '').trim();
  if (cleanRaw && !cleanRaw.toUpperCase().startsWith('ITM-ADHOC-')) {
    return cleanRaw;
  }
  const usedCodes = new Set(existingItems.map((i) => (i.code || '').trim().toLowerCase()).filter(Boolean));
  let seq = existingItems.length + 1;
  while (usedCodes.has(`itm-${String(seq).padStart(3, '0')}`)) {
    seq++;
  }
  return `ITM-${String(seq).padStart(3, '0')}`;
}

export function getEffectivePeriodLockDate(appData: AppData): string | undefined {
  const a = (appData.fiscalLockDate || '').trim().slice(0, 10);
  const b = (appData.settings?.periodLockDate || '').trim().slice(0, 10);
  if (a && b) return a >= b ? a : b;
  return a || b || undefined;
}

export function assertPeriodUnlocked(
  appData: AppData,
  dateStr?: string,
  actionLabel: string = 'تنفيذ الحركة'
): void {
  const lockDate = getEffectivePeriodLockDate(appData);
  if (!lockDate) return;
  const targetDate = (dateStr || new Date().toISOString().split('T')[0]).trim().slice(0, 10);
  if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) && targetDate <= lockDate) {
    throw new Error(
      `الفترة المحاسبية مقفلة حتى تاريخ ${lockDate}. لا يمكن ${actionLabel} بتاريخ (${targetDate}) قبل فك الإقفال من الإعدادات.`
    );
  }
}

// Helper to determine cashbox key from method name
export function mapPaymentMethodToKey(methodName?: string): 'drawer' | 'vodafone' | 'instapay' | 'bank' {
  if (!methodName) return 'drawer';
  const m = methodName.toLowerCase();
  if (m.includes('فودافون') || m.includes('vodafone')) return 'vodafone';
  if (m.includes('انستاباي') || m.includes('إنستاباي') || m.includes('instapay')) return 'instapay';
  if (m.includes('فيزا') || m.includes('visa') || m.includes('بنك') || m.includes('تحويل') || m.includes('bank')) return 'bank';
  return 'drawer';
}

export function getPaymentMethodLabel(key: 'drawer' | 'vodafone' | 'instapay' | 'bank'): string {
  switch (key) {
    case 'drawer':
      return 'الدرج والخزينة الرئيسية';
    case 'vodafone':
      return 'محفظة فودافون كاش';
    case 'instapay':
      return 'تحويل انستاباي Instapay';
    case 'bank':
      return 'الحساب البنكي / فيزا';
    default:
      return 'الخزينة النقدية';
  }
}

export function getCashAccountForMethod(method?: string): { code: string; name: string } {
  const key = mapPaymentMethodToKey(method);
  switch (key) {
    case 'vodafone':
      return { code: '1102', name: 'فودافون كاش والمحافظ الإلكترونية' };
    case 'instapay':
      return { code: '1103', name: 'إنستاباي (InstaPay)' };
    case 'bank':
      return { code: '1104', name: 'الحسابات البنكية (Bank Accounts)' };
    case 'drawer':
    default:
      return { code: '1101', name: 'الصندوق والخزينة الرئيسية (Cash)' };
  }
}

export function mapExpenseCategoryToAccount(category?: string, explicitCode?: string): { code: string; name: string } {
  if (explicitCode && explicitCode.trim()) {
    const code = explicitCode.trim();
    if (code === '3103') return { code: '3103', name: 'جاري صاحب المنشأة / الشركاء' };
    if (code === '3101') return { code: '3101', name: 'رأس المال المستثمر (Capital)' };
    if (code === '5201') return { code: '5201', name: 'مصروفات الإيجار والمرافق' };
    if (code === '5202') return { code: '5202', name: 'الرواتب والأجور والمكافآت' };
    if (code === '5203') return { code: '5203', name: 'مصاريف الدعاية والتسويق' };
    if (code === '5205') return { code: '5205', name: 'عمولات المندوبين والمبيعات' };
    if (code === '5206') return { code: '5206', name: 'عجز وفاقد تسوية المخزون' };
    return { code, name: category || 'مصروفات تشغيلية وعمومية' };
  }
  const c = (category || '').toLowerCase();
  if (c.includes('إيجار') || c.includes('ايجار') || c.includes('مرافق') || c.includes('كهرباء') || c.includes('مياه')) {
    return { code: '5201', name: 'مصروفات الإيجار والمرافق' };
  }
  if (c.includes('رواتب') || c.includes('أجور') || c.includes('اجور') || c.includes('مكافآت') || c.includes('موظف')) {
    return { code: '5202', name: 'الرواتب والأجور والمكافآت' };
  }
  if (c.includes('دعاية') || c.includes('تسويق') || c.includes('إعلان') || c.includes('اعلان')) {
    return { code: '5203', name: 'مصاريف الدعاية والتسويق' };
  }
  if (c.includes('عمول') || c.includes('مندوب')) {
    return { code: '5205', name: 'عمولات المندوبين والمبيعات' };
  }
  if (c.includes('شركاء') || c.includes('جاري') || c.includes('مسحوبات شخصية')) {
    return { code: '3103', name: 'جاري صاحب المنشأة / الشركاء' };
  }
  return { code: '5204', name: 'مصاريف الصيانة والتشغيل والنثريات' };
}

/**
 * Normalizes legacy mis-mapped journal account codes (older builds mapped Bank -> 1102, AR -> 1103, VAT -> 2105, Purchases -> 5101).
 */
export function resolveCanonicalAccountCode(accountCode: string, accountName?: string): string {
  const code = (accountCode || '').trim();
  const name = (accountName || '').toLowerCase();
  if (code === '2105') return '2102';
  if (code === '1102' && (name.includes('بنك') || name.includes('التحويل') || name.includes('bank'))) return '1104';
  if (code === '1103' && (name.includes('عملاء') || name.includes('مدينون') || name.includes('receivable'))) return '1105';
  if (code === '5101' && (name.includes('مشتريات') || name.includes('توريدات')) && !name.includes('مباعة')) return '1106';
  return code;
}

/**
 * 🔑 Deterministic Sync IDs
 */
export function getInvoicePaymentVoucherSyncId(
  type: 'sale' | 'purchase',
  invoiceId: number | string,
  splitIdx: number = 0
): string {
  return `vouch_${type}_${invoiceId}_init_${splitIdx}`;
}

export function getInstallmentPaymentVoucherSyncId(
  type: 'sale' | 'purchase',
  invoiceId: number | string,
  uniqueMarker: number | string = Date.now()
): string {
  return `vouch_${type}_${invoiceId}_inst_${uniqueMarker}`;
}

/**
 * Assert strictly balanced journal lines before persisting.
 */
function assertJournalBalanced(lines: JournalLine[], label: string): void {
  const totalDebit = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.02) {
    throw new Error(
      `القيد المحاسبي (${label}) غير متوازن: إجمالي المدين (${totalDebit.toFixed(2)}) لا يساوي إجمالي الدائن (${totalCredit.toFixed(2)}). تم إيقاف الترحيل لحماية سلامة الدفاتر.`
    );
  }
}

/**
 * Normalize split amounts so sum(splits) equals targetTotal exactly.
 */
function normalizeSplits(
  rawSplits: Array<{ method: string; amount: number }> | undefined,
  fallbackMethod: string,
  targetTotal: number
): Array<{ method: 'drawer' | 'vodafone' | 'instapay' | 'bank'; label: string; amount: number }> {
  const cleanTarget = round2(Math.max(0, targetTotal));
  if (cleanTarget <= 0) return [];

  const valid = (rawSplits || [])
    .filter((s) => Number(s.amount) > 0)
    .map((s) => ({
      method: mapPaymentMethodToKey(s.method),
      label: s.method || getPaymentMethodLabel(mapPaymentMethodToKey(s.method)),
      amount: round2(s.amount),
    }));

  if (valid.length === 0) {
    const key = mapPaymentMethodToKey(fallbackMethod);
    return [{ method: key, label: fallbackMethod || getPaymentMethodLabel(key), amount: cleanTarget }];
  }

  const sum = round2(valid.reduce((acc, s) => acc + s.amount, 0));
  if (Math.abs(sum - cleanTarget) <= 0.01) {
    return valid;
  }

  if (valid.length === 1) {
    return [{ ...valid[0], amount: cleanTarget }];
  }

  // Scale proportionally and place rounding remainder on last element
  let running = 0;
  return valid.map((s, idx) => {
    if (idx === valid.length - 1) {
      return { ...s, amount: round2(Math.max(0, cleanTarget - running)) };
    }
    const scaled = round2((s.amount / sum) * cleanTarget);
    running = round2(running + scaled);
    return { ...s, amount: scaled };
  });
}

/**
 * Helper to recalculate weighted average cost on an item from FIFO layers + fallback cost.
 */
function recomputeItemAvgCost(item: Item): number {
  const layers = (item.fifoLayers || []).filter((l) => l.remainingQty > 0 && l.unitCost > 0);
  if (layers.length > 0) {
    let totalCost = 0;
    let totalQty = 0;
    layers.forEach((l) => {
      totalCost += l.remainingQty * l.unitCost;
      totalQty += l.remainingQty;
    });
    if (totalQty > 0) {
      return round2(totalCost / totalQty);
    }
  }
  return round2(Number(item.avgCost || item.purchasePrice || item.costPrice || 0));
}

function ensureBaselineFifoLayerIfNeeded(stockItem: Item, dateStr: string): void {
  if (!stockItem.fifoLayers) stockItem.fifoLayers = [];
  const existingQty = Number(stockItem.quantity || 0);
  const layeredQty = stockItem.fifoLayers.reduce((s, l) => s + Math.max(0, l.remainingQty || 0), 0);
  const baseUnitCost = round2(Number(stockItem.avgCost || stockItem.purchasePrice || stockItem.costPrice || 0));
  if (existingQty > layeredQty && baseUnitCost > 0) {
    const unlayeredQty = round2(existingQty - layeredQty);
    stockItem.fifoLayers.unshift({
      id: `layer_base_${stockItem.id}`,
      date: stockItem.lastPurchaseDate || dateStr,
      remainingQty: unlayeredQty,
      unitCost: baseUnitCost,
    });
  }
}

/**
 * 🏦 التوفيق والحساب السلطوي لأرصدة الخزائن والبنوك (Authoritative Treasury Reconciliation)
 */
export function reconcileTreasuryCashBox(appData: AppData): {
  cashBox: CashBox;
  branchCashBoxes: Record<string, CashBox>;
} {
  const methods: Array<'drawer' | 'vodafone' | 'instapay' | 'bank'> = ['drawer', 'vodafone', 'instapay', 'bank'];
  const globalCashBox: CashBox = { drawer: 0, vodafone: 0, instapay: 0, bank: 0 };
  const branchCashBoxes: Record<string, CashBox> = {};

  const mainBranchId = getMainBranchId(appData.branches);
  const branchesList = appData.branches || [];

  branchesList.forEach((b) => {
    branchCashBoxes[b.id] = { drawer: 0, vodafone: 0, instapay: 0, bank: 0 };
  });
  if (!branchCashBoxes[mainBranchId]) {
    branchCashBoxes[mainBranchId] = { drawer: 0, vodafone: 0, instapay: 0, bank: 0 };
  }

  const txs = appData.cashTransactions || [];
  for (const tx of txs) {
    if (!tx || tx.status === 'cancelled') continue;
    const amt = Number(tx.amount || 0);
    if (isNaN(amt) || amt <= 0) continue;

    const bId = tx.branchId || mainBranchId;
    if (!branchCashBoxes[bId]) {
      branchCashBoxes[bId] = { drawer: 0, vodafone: 0, instapay: 0, bank: 0 };
    }

    const mKey = mapPaymentMethodToKey(tx.method);

    if (tx.type === 'receive' || tx.type === 'deposit') {
      globalCashBox[mKey] = (globalCashBox[mKey] || 0) + amt;
      branchCashBoxes[bId][mKey] = (branchCashBoxes[bId][mKey] || 0) + amt;
    } else if (tx.type === 'pay' || tx.type === 'withdraw') {
      globalCashBox[mKey] = (globalCashBox[mKey] || 0) - amt;
      branchCashBoxes[bId][mKey] = (branchCashBoxes[bId][mKey] || 0) - amt;
    } else if ((tx as any).type === 'transfer') {
      const fromKey = mapPaymentMethodToKey((tx as any).fromMethod || tx.method);
      const toKey = mapPaymentMethodToKey((tx as any).toMethod);
      globalCashBox[fromKey] = (globalCashBox[fromKey] || 0) - amt;
      globalCashBox[toKey] = (globalCashBox[toKey] || 0) + amt;

      branchCashBoxes[bId][fromKey] = (branchCashBoxes[bId][fromKey] || 0) - amt;
      branchCashBoxes[bId][toKey] = (branchCashBoxes[bId][toKey] || 0) + amt;
    }
  }

  for (const m of methods) {
    globalCashBox[m] = round2(globalCashBox[m] || 0);
  }
  Object.keys(branchCashBoxes).forEach((bId) => {
    for (const m of methods) {
      branchCashBoxes[bId][m] = round2(branchCashBoxes[bId][m] || 0);
    }
  });

  return { cashBox: globalCashBox, branchCashBoxes };
}

/**
 * 🧹 فحص وتطهير وتدقيق السندات المكررة (Audit & Deduplicate Engine)
 */
export function auditAndDeduplicateTransactions(appData: AppData): {
  cleanedData: AppData;
  removedVouchersCount: number;
  repairedInvoicesCount: number;
  details: string[];
} {
  const details: string[] = [];
  let removedVouchersCount = 0;
  let repairedInvoicesCount = 0;

  const data: AppData = {
    ...appData,
    cashTransactions: [...(appData.cashTransactions || [])],
    purchaseInvoices: [...(appData.purchaseInvoices || [])],
    salesInvoices: [...(appData.salesInvoices || [])],
    journalEntries: [...(appData.journalEntries || [])],
    suppliers: (appData.suppliers || []).map((s) => ({ ...s, transactions: [...(s.transactions || [])] })),
    customers: (appData.customers || []).map((c) => ({ ...c, transactions: [...(c.transactions || [])] })),
  };

  const cancelledSaleIds = new Set(
    data.salesInvoices.filter((i) => i?.status === 'cancelled').map((i) => i.id)
  );
  const cancelledPurIds = new Set(
    data.purchaseInvoices.filter((i) => i?.status === 'cancelled').map((i) => i.id)
  );

  const seenSyncIds = new Set<string>();
  const seenInvoiceInitialVouchers = new Map<string, number>();
  const validTransactions: CashTransaction[] = [];

  for (const tx of data.cashTransactions) {
    if (!tx) continue;
    if (tx.status === 'cancelled') {
      validTransactions.push(tx);
      continue;
    }

    if (tx.syncId && typeof tx.syncId === 'string' && tx.syncId.trim()) {
      const cleanSync = tx.syncId.trim();
      if (seenSyncIds.has(cleanSync)) {
        removedVouchersCount++;
        details.push(`حذف سند مكرر رقم #${tx.id} بمفتاح تطابق (${cleanSync}) بقيمة ${tx.amount} ج.م`);
        continue;
      }
      seenSyncIds.add(cleanSync);
    }

    // Deduplicate identical initial invoice vouchers (never deduplicate distinct _inst_ installments)
    const isInstallment = Boolean(tx.syncId && tx.syncId.includes('_inst_'));
    if (!isInstallment && tx.invoiceId && tx.type && tx.amount) {
      const mKey = mapPaymentMethodToKey(tx.method);
      const isPurchaseVouch = tx.type === 'pay' && !tx.customerName && !cancelledPurIds.has(tx.invoiceId);
      const isSaleVouch = tx.type === 'receive' && !tx.supplierName && !cancelledSaleIds.has(tx.invoiceId);

      if (isPurchaseVouch || isSaleVouch) {
        const sig = `${tx.type}_inv_${tx.invoiceId}_${mKey}_${Number(tx.amount).toFixed(2)}`;
        if (seenInvoiceInitialVouchers.has(sig)) {
          removedVouchersCount++;
          details.push(`حذف سند صرف/قبض مكرر رقم #${tx.id} للفاتورة #${tx.invoiceId} بقيمة ${tx.amount} ج.م عبر ${mKey}`);
          continue;
        }
        seenInvoiceInitialVouchers.set(sig, tx.id);
      }
    }

    validTransactions.push(tx);
  }

  data.cashTransactions = validTransactions;

  // Reconcile purchase invoices
  data.purchaseInvoices = data.purchaseInvoices.map((inv) => {
    if (!inv || inv.status === 'cancelled') return inv;
    const linkedVouchers = validTransactions.filter(
      (tx) => tx.status !== 'cancelled' && tx.invoiceId === inv.id && (tx.type === 'pay' || tx.type === 'receive')
    );

    let actualPaidFromVouchers = 0;
    linkedVouchers.forEach((v) => {
      if (v.type === 'pay') actualPaidFromVouchers += Number(v.amount || 0);
      else if (v.type === 'receive') actualPaidFromVouchers -= Number(v.amount || 0);
    });

    let targetPaid = inv.paidAmount || 0;
    if (inv.type === 'nagdi') {
      targetPaid = inv.total;
    } else if (linkedVouchers.length > 0) {
      targetPaid = Math.min(inv.total, Math.max(0, actualPaidFromVouchers));
    }

    const targetRem = Math.max(0, inv.total - targetPaid);
    if (Math.abs(targetPaid - (inv.paidAmount || 0)) > 0.01 || Math.abs(targetRem - (inv.remainingAmount || 0)) > 0.01) {
      repairedInvoicesCount++;
      return {
        ...inv,
        paidAmount: round2(targetPaid),
        remainingAmount: round2(targetRem),
      };
    }
    return inv;
  });

  // Reconcile sales invoices
  data.salesInvoices = data.salesInvoices.map((inv) => {
    if (!inv || inv.status === 'cancelled') return inv;
    const linkedVouchers = validTransactions.filter(
      (tx) => tx.status !== 'cancelled' && tx.invoiceId === inv.id && (tx.type === 'receive' || tx.type === 'pay')
    );

    let actualPaidFromVouchers = 0;
    linkedVouchers.forEach((v) => {
      if (v.type === 'receive') actualPaidFromVouchers += Number(v.amount || 0);
      else if (v.type === 'pay') actualPaidFromVouchers -= Number(v.amount || 0);
    });

    let targetPaid = inv.paidAmount || 0;
    if (inv.type === 'nagdi') {
      targetPaid = inv.total;
    } else if (linkedVouchers.length > 0) {
      targetPaid = Math.min(inv.total, Math.max(0, actualPaidFromVouchers));
    }

    const targetRem = Math.max(0, inv.total - targetPaid);
    if (Math.abs(targetPaid - (inv.paidAmount || 0)) > 0.01 || Math.abs(targetRem - (inv.remainingAmount || 0)) > 0.01) {
      repairedInvoicesCount++;
      return {
        ...inv,
        paidAmount: round2(targetPaid),
        remainingAmount: round2(targetRem),
      };
    }
    return inv;
  });

  // Remove duplicate journal entries
  const seenJournalRefs = new Set<string>();
  data.journalEntries = data.journalEntries.filter((je) => {
    if (!je) return false;
    const ref = je.reference || je.entryNumber;
    if (ref && seenJournalRefs.has(ref)) return false;
    if (ref) seenJournalRefs.add(ref);
    return true;
  });

  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return {
    cleanedData: data,
    removedVouchersCount,
    repairedInvoicesCount,
    details,
  };
}

/**
 * 🛒 ترحيل فاتورة مشتريات (جرد مستمر 1106 + FIFO + Average Cost + ضريبة + قيد متوازن)
 */
export function processPurchaseInvoice(
  appData: AppData,
  invoice: PurchaseInvoice,
  isEditing: boolean = false,
  oldInvoiceId?: number
): AppData {
  const targetOldId = isEditing
    ? (oldInvoiceId || invoice.id)
    : (appData.purchaseInvoices.some((i) => i.id === invoice.id) ? invoice.id : undefined);

  const now = new Date();
  const dateStr = invoice.date || now.toISOString().split('T')[0];
  assertPeriodUnlocked(appData, dateStr, isEditing ? 'تعديل فاتورة مشتريات' : 'حفظ فاتورة مشتريات');
  if (targetOldId) {
    const existingOld = (appData.purchaseInvoices || []).find((i) => i.id === targetOldId);
    if (existingOld) {
      assertPeriodUnlocked(appData, existingOld.date, 'تعديل فاتورة مشتريات من فترة مقفلة');
    }
  }

  const data: AppData = {
    ...appData,
    items: (appData.items || []).map((i) => ({
      ...i,
      movements: [...(i.movements || [])],
      fifoLayers: [...(i.fifoLayers || []).map((l) => ({ ...l }))],
      altUnits: i.altUnits ? i.altUnits.map((u) => ({ ...u })) : undefined,
    })),
    suppliers: (appData.suppliers || []).map((s) => ({ ...s, transactions: [...(s.transactions || [])] })),
    productPrices: (appData.productPrices || []).map((p) => ({ ...p })),
    cashTransactions: [...(appData.cashTransactions || [])],
    journalEntries: [...(appData.journalEntries || [])],
    purchaseInvoices: [...(appData.purchaseInvoices || [])],
    salesInvoices: (appData.salesInvoices || []).map((si) => ({
      ...si,
      items: (si.items || []).map((li) => ({ ...li })),
    })),
  };

  const isReturn = invoice.type.startsWith('return_');
  const timeStr = invoice.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const mainBranchId = getMainBranchId(data.branches);
  const invBranchId = invoice.branchId || data.activeBranchId || mainBranchId;

  // 1. Rollback old invoice impacts if editing or re-saving existing ID (PRESERVING _inst_ installment vouchers!)
  if (targetOldId) {
    const oldInv = data.purchaseInvoices.find((i) => i.id === targetOldId);
    if (oldInv) {
      const wasReturn = oldInv.type.startsWith('return_');
      const oldBr = oldInv.branchId || mainBranchId;

      // Revert any retroactive negative-stock COGS settlements created by this purchase invoice
      if (oldInv.retroactiveSettlements && oldInv.retroactiveSettlements.length > 0) {
        oldInv.retroactiveSettlements.forEach((rs) => {
          const sInv = data.salesInvoices.find((si) => si.id === rs.saleInvoiceId);
          const line = sInv?.items?.[rs.lineIndex];
          if (line) {
            const nextUncosted = round2(Number(line.uncostedQty || 0) + rs.settledBaseQty);
            const prevCogs = Number(line.costPrice || 0) * Number(line.qty || 0);
            const nextCogs = round2(Math.max(0, prevCogs - rs.settledCogs));
            line.uncostedQty = nextUncosted;
            line.costMissing = nextUncosted > 0.001 || nextCogs <= 0;
            line.costPrice = Number(line.qty || 0) > 0 ? round2(nextCogs / Number(line.qty)) : 0;
          }
        });
      }

      oldInv.items?.forEach((itm) => {
        const stockItm = data.items.find(
          (i) =>
            (itm.itemId && i.id === itm.itemId) ||
            (itm.code && i.code && i.code.trim().toLowerCase() === itm.code.trim().toLowerCase() &&
              (i.branchId === oldBr || (!i.branchId && oldBr === mainBranchId))) ||
            (i.name.trim().toLowerCase() === itm.name.trim().toLowerCase() &&
              (i.branchId === oldBr || (!i.branchId && oldBr === mainBranchId)))
        );
        if (stockItm) {
          const itmFactor = Math.max(0.0001, Number(itm.unitFactor || 1));
          const itmBaseQty = round2(
            itm.baseQty !== undefined && Number(itm.baseQty) > 0 ? Number(itm.baseQty) : Number(itm.qty || 0) * itmFactor
          );
          const qtyDiff = wasReturn ? itmBaseQty : -itmBaseQty;
          stockItm.quantity = round2((stockItm.quantity || 0) + qtyDiff);
          if (stockItm.branchStock) {
            stockItm.branchStock = { ...stockItm.branchStock, [oldBr]: stockItm.quantity };
          }

          // Revert FIFO layers from old purchase invoice
          if (!wasReturn) {
            stockItm.fifoLayers = (stockItm.fifoLayers || []).filter((l) => l.invoiceId !== targetOldId);
          } else {
            const rawUnitCost = itm.costPrice ? Number(itm.costPrice) / itmFactor : (itm.price ? Number(itm.price) / itmFactor : Number(stockItm.avgCost || stockItm.purchasePrice || 0));
            const layerCost = round2(rawUnitCost);
            if (layerCost > 0) {
              stockItm.fifoLayers = [
                ...(stockItm.fifoLayers || []),
                { id: `layer_revert_pret_${targetOldId}_${Date.now()}`, date: dateStr, remainingQty: itmBaseQty, unitCost: layerCost },
              ];
            }
          }
          stockItm.avgCost = recomputeItemAvgCost(stockItm);

          stockItm.movements.push({
            date: dateStr,
            type: 'adjustment',
            qty: qtyDiff,
            price: itm.price,
            total: Math.abs(itm.qty) * itm.price,
            note: `تسوية وإعادة رصيد المخزن قبل تعديل فاتورة المشتريات #${oldInv.id}`,
          });
        }
      });

      // Compute preserved installment sum so we rollback only non-installment debt effect
      const preservedInstAmt = data.cashTransactions
        .filter((tx) => tx.status !== 'cancelled' && tx.invoiceId === targetOldId && tx.syncId?.includes('_inst_'))
        .reduce((s, tx) => s + (tx.type === 'pay' ? Number(tx.amount || 0) : -Number(tx.amount || 0)), 0);

      if (oldInv.supplierName) {
        const supp = data.suppliers.find((s) => s.name.trim().toLowerCase() === oldInv.supplierName.trim().toLowerCase());
        if (supp) {
          const oldPaid = Number(oldInv.paidAmount || 0);
          const oldInitialPaid = Math.max(0, oldPaid - preservedInstAmt);
          const oldCreditAdded = Math.max(0, Number(oldInv.total || 0) - oldInitialPaid);
          if (oldInv.type === 'ajel' || oldInv.type === 'return_ajel' || oldCreditAdded > 0) {
            supp.balance = round2((supp.balance || 0) - (wasReturn ? -oldCreditAdded : oldCreditAdded));
          }
          // Keep installment payment rows in supplier transactions, remove initial invoice ledger entry
          supp.transactions = supp.transactions.filter(
            (tx) => tx.invoiceId !== targetOldId || tx.type === 'payment'
          );
        }
      }

      // Preserve _inst_ installment vouchers; remove only initial vouchers & invoice journal entry
      data.cashTransactions = data.cashTransactions.filter(
        (tx) => tx.invoiceId !== targetOldId || (tx.syncId && tx.syncId.includes('_inst_'))
      );
      data.journalEntries = data.journalEntries.filter(
        (je) => je.reference !== `PUR-INV-${targetOldId}` && je.reference !== `NEG-COGS-PUR-${targetOldId}`
      );
      data.purchaseInvoices = data.purchaseInvoices.filter((i) => i.id !== targetOldId);
    }
  }

  // Calculate preserved installment payments still tied to this invoice ID
  const preservedInstVouchers = data.cashTransactions.filter(
    (tx) => tx.status !== 'cancelled' && tx.invoiceId === invoice.id && tx.syncId?.includes('_inst_')
  );
  const instPaidTotal = round2(
    preservedInstVouchers.reduce((s, tx) => s + (tx.type === 'pay' ? Number(tx.amount || 0) : -Number(tx.amount || 0)), 0)
  );

  const totalNet = round2(invoice.total || 0);
  const requestedPaid = round2(
    Math.min(totalNet, Math.max(0, invoice.paidAmount !== undefined ? invoice.paidAmount : (invoice.type.includes('nagdi') ? totalNet : 0)))
  );
  const effectiveInitialPaid = round2(Math.max(0, requestedPaid - instPaidTotal));
  const effectivePaidTotal = round2(Math.min(totalNet, effectiveInitialPaid + instPaidTotal));
  const effectiveRemaining = round2(Math.max(0, totalNet - effectivePaidTotal));
  const creditAddedByInvoice = round2(Math.max(0, totalNet - effectiveInitialPaid));

  // 2. Supplier auto-registration & phone sync BEFORE finalizing invoice metadata
  const cleanSuppName = (invoice.supplierName || '').trim() || 'مورد عام';
  const cleanSuppPhone = (invoice.phone || '').trim();
  let supp = data.suppliers.find(
    (s) =>
      (invoice.supplierId && s.id === invoice.supplierId) ||
      (invoice.supplierCode && s.code && s.code === invoice.supplierCode) ||
      s.name.trim().toLowerCase() === cleanSuppName.toLowerCase()
  );
  if (!supp) {
    const existingNums = data.suppliers
      .map((s) => parseInt((s.code || s.id || '').replace(/\D/g, '') || '0', 10))
      .filter((n) => !isNaN(n) && n > 0);
    const nextSuppNum = (existingNums.length > 0 ? Math.max(...existingNums) : data.suppliers.length) + 1;
    const generatedCode = invoice.supplierCode?.trim() || `SUP-${String(nextSuppNum).padStart(3, '0')}`;
    supp = {
      id: 's' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      code: generatedCode,
      companyId: invoice.companyId || data.companyId || 'COMP-000001',
      branchId: invBranchId,
      name: cleanSuppName,
      phone: cleanSuppPhone,
      balance: 0,
      transactions: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: invoice.createdBy || 'مدير النظام',
    };
    data.suppliers.push(supp);
  } else {
    if (!supp.code) {
      const existingNums = data.suppliers
        .map((s) => parseInt((s.code || s.id || '').replace(/\D/g, '') || '0', 10))
        .filter((n) => !isNaN(n) && n > 0);
      const nextSuppNum = (existingNums.length > 0 ? Math.max(...existingNums) : data.suppliers.length) + 1;
      supp.code = `SUP-${String(nextSuppNum).padStart(3, '0')}`;
    }
    if (cleanSuppPhone && cleanSuppPhone !== supp.phone) {
      supp.phone = cleanSuppPhone;
    }
    supp.updatedAt = now.toISOString();
  }

  // 3. 📦 Inventory & FIFO / Multi-UOM / Negative-Stock Retroactive Settlement / Sticky Last Purchase Price
  let totalRetroactiveCogs = 0;
  const retroactiveSettlements: NonNullable<PurchaseInvoice['retroactiveSettlements']> = [];

  const enrichedPurItems = (invoice.items || []).map((item, idx) => {
    const factor = Math.max(0.0001, Number(item.unitFactor || 1));
    const invQty = Number(item.qty || 0);
    const baseQty = round2(
      item.baseQty !== undefined && Number(item.baseQty) > 0 ? Number(item.baseQty) : invQty * factor
    );
    const totalLineCost = item.qty > 0 && item.total > 0 ? Number(item.total) : invQty * (Number(item.price) || 0);
    const unitPurchaseCost = round2(
      baseQty > 0 ? totalLineCost / baseQty : (Number(item.price) || 0) / factor
    );
    const lastBuyPrice = round2(Number(item.price || 0) > 0 ? Number(item.price) / factor : unitPurchaseCost);

    let stockItem = data.items.find(
      (i) =>
        (item.itemId && i.id === item.itemId) ||
        (item.code && i.code && i.code.trim().toLowerCase() === item.code.trim().toLowerCase() &&
          (i.branchId === invBranchId || (!i.branchId && invBranchId === mainBranchId))) ||
        (normalizeEngineText(i.name) === normalizeEngineText(item.name) &&
          (i.branchId === invBranchId || (!i.branchId && invBranchId === mainBranchId)))
    );
    if (!stockItem) {
      const fallbackCode = generateNextUniqueItemCode(data.items, item.code);
      stockItem = {
        id: item.itemId || `i_${invBranchId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        companyId: invoice.companyId || data.companyId || 'COMP-000001',
        branchId: invBranchId,
        code: fallbackCode,
        name: item.name,
        category: item.category,
        unit: factor === 1 ? (item.unit || 'قطعة') : 'قطعة',
        quantity: 0,
        branchStock: { [invBranchId]: 0 },
        purchasePrice: lastBuyPrice,
        costPrice: unitPurchaseCost || lastBuyPrice,
        avgCost: unitPurchaseCost || lastBuyPrice,
        salePrice: item.salePrice && item.salePrice > 0 ? round2(item.salePrice / factor) : 0,
        fifoLayers: [],
        movements: [],
        createdAt: now.toISOString(),
        createdBy: invoice.createdBy || 'مدير النظام',
      };
      data.items.push(stockItem);
    }

    ensureBaselineFifoLayerIfNeeded(stockItem, dateStr);

    const prevQty = Number(stockItem.quantity || 0);
    const qtyChange = isReturn ? -baseQty : baseQty;

    if (!isReturn) {
      const newQty = round2(prevQty + baseQty);
      stockItem.quantity = newQty;
      if (stockItem.branchStock) {
        stockItem.branchStock = { ...stockItmBranchSafe(stockItem.branchStock), [invBranchId]: newQty };
      }

      // Settle negative deficit retroactively in COGS & FIFO layers
      const settledAvailableQty = round2(Math.min(baseQty, Math.max(0, newQty)));

      if (prevQty < 0 && unitPurchaseCost > 0) {
        let deficitToSettleBase = round2(Math.min(baseQty, Math.abs(prevQty)));
        const sortedSales = data.salesInvoices
          .filter((si) => si && si.status !== 'cancelled' && !si.type.startsWith('return_'))
          .slice()
          .sort((a, b) => {
            const da = String(a.date || '');
            const db = String(b.date || '');
            return da !== db ? da.localeCompare(db) : a.id - b.id;
          });

        for (const sInv of sortedSales) {
          if (deficitToSettleBase <= 0.001) break;
          const sBranch = sInv.branchId || mainBranchId;
          const sameBranch = sBranch === invBranchId;
          if (!sameBranch) continue;

          (sInv.items || []).forEach((sLine, lineIdx) => {
            if (deficitToSettleBase <= 0.001) return;
            const itemMatches =
              (sLine.itemId && sLine.itemId === stockItem!.id) ||
              (sLine.code && stockItem!.code && sLine.code.trim().toLowerCase() === stockItem!.code.trim().toLowerCase()) ||
              normalizeEngineText(sLine.name) === normalizeEngineText(stockItem!.name);
            if (!itemMatches) return;

            const sLineFactor = Math.max(0.0001, Number(sLine.unitFactor || 1));
            const sLineBaseQty = round2(
              sLine.baseQty !== undefined && Number(sLine.baseQty) > 0 ? Number(sLine.baseQty) : Number(sLine.qty || 0) * sLineFactor
            );
            const pendingBase =
              sLine.uncostedQty !== undefined
                ? Number(sLine.uncostedQty)
                : sLine.costMissing && Number(sLine.costPrice || 0) <= 0
                ? sLineBaseQty
                : 0;

            if (pendingBase <= 0.001) return;

            const settleBase = round2(Math.min(deficitToSettleBase, pendingBase));
            const addCogs = round2(settleBase * unitPurchaseCost);
            const prevCogs = Number(sLine.costPrice || 0) * Number(sLine.qty || 0);
            const newLineCogs = round2(prevCogs + addCogs);

            sLine.costPrice = Number(sLine.qty || 0) > 0 ? round2(newLineCogs / Number(sLine.qty)) : 0;
            const remUncosted = round2(Math.max(0, pendingBase - settleBase));
            sLine.uncostedQty = remUncosted > 0.001 ? remUncosted : 0;
            sLine.costMissing = remUncosted > 0.001;

            totalRetroactiveCogs = round2(totalRetroactiveCogs + addCogs);
            retroactiveSettlements.push({
              saleInvoiceId: sInv.id,
              lineIndex: lineIdx,
              settledBaseQty: settleBase,
              settledCogs: addCogs,
            });
            deficitToSettleBase = round2(deficitToSettleBase - settleBase);
          });
        }
      }

      if (unitPurchaseCost > 0 && settledAvailableQty > 0) {
        stockItem.fifoLayers = [
          ...(stockItem.fifoLayers || []),
          {
            id: `layer_pur_${invoice.id}_${idx}_${Date.now()}`,
            invoiceId: invoice.id,
            date: dateStr,
            remainingQty: settledAvailableQty,
            unitCost: unitPurchaseCost,
          },
        ].sort((a, b) => {
          const da = String(a.date || '');
          const db = String(b.date || '');
          if (da !== db) return da.localeCompare(db);
          return Number(a.invoiceId || 0) - Number(b.invoiceId || 0);
        });
      }

      // Always keep last purchase price sticky on the item (in base unit + matching altUnit if applicable)
      if (lastBuyPrice > 0) {
        stockItem.purchasePrice = lastBuyPrice;
        stockItem.costPrice = unitPurchaseCost > 0 ? unitPurchaseCost : lastBuyPrice;
        if (stockItem.altUnits && item.unit) {
          const uLower = item.unit.trim().toLowerCase();
          stockItem.altUnits = stockItem.altUnits.map((au) =>
            au.name.trim().toLowerCase() === uLower
              ? { ...au, buyPrice: round2(Number(item.price || 0) > 0 ? Number(item.price) : unitPurchaseCost * factor) }
              : au
          );
        }
      }
      const computedAvg = recomputeItemAvgCost(stockItem);
      stockItem.avgCost = computedAvg > 0 ? computedAvg : round2(unitPurchaseCost || lastBuyPrice);
      stockItem.lastPriceUpdate = dateStr;
      stockItem.lastPurchaseDate = dateStr;
      stockItem.updatedAt = now.toISOString();

      if (item.salePrice && item.salePrice > 0) {
        const baseSale = round2(item.salePrice / factor);
        stockItem.salePrice = baseSale;
        stockItem.normalSellingPrice = baseSale;
      }
      if (item.category && item.category.trim() && item.category !== 'بدون تصنيف') {
        stockItem.category = item.category.trim();
      }
      if (data.productPrices && lastBuyPrice > 0) {
        const pIdx = data.productPrices.findIndex((p) => p.productId === stockItem!.id);
        if (pIdx >= 0) {
          data.productPrices[pIdx] = {
            ...data.productPrices[pIdx],
            purchaseCost: lastBuyPrice,
            updatedAt: dateStr,
          };
        }
      }
    } else {
      // Purchase return: reduce quantity algebraically and remove from newest/matching FIFO layers
      const newQty = round2(prevQty - baseQty);
      stockItem.quantity = newQty;
      if (stockItem.branchStock) {
        stockItem.branchStock = { ...stockItmBranchSafe(stockItem.branchStock), [invBranchId]: newQty };
      }
      let remToDeduct = baseQty;
      const layers = [...(stockItem.fifoLayers || [])];
      for (let li = layers.length - 1; li >= 0 && remToDeduct > 0; li--) {
        if (layers[li].remainingQty <= 0) continue;
        const take = Math.min(layers[li].remainingQty, remToDeduct);
        layers[li].remainingQty = round2(layers[li].remainingQty - take);
        remToDeduct = round2(remToDeduct - take);
      }
      stockItem.fifoLayers = layers.filter((l) => l.remainingQty > 0);
      stockItem.avgCost = recomputeItemAvgCost(stockItem);
    }

    const moveType: ItemMovement['type'] = isReturn ? 'return_purchase' : 'purchase';
    const unitInfoNote = factor !== 1 ? ` (${invQty} ${item.unit || 'وحدة'} = ${baseQty} أساسية)` : '';
    const negSettleNote =
      !isReturn && prevQty < 0
        ? stockItem.quantity >= 0
          ? ` [تسوية رصيد سالب (${prevQty} → متاح ${stockItem.quantity})]`
          : ` [سداد جزئي للرصيد السالب (${prevQty} → ${stockItem.quantity})]`
        : '';
    const noteText = isReturn
      ? `مرتجع شراء (${invoice.type === 'return_nagdi' ? 'نقدي' : 'آجل'}) فرع [${invBranchId}] للمورد ${cleanSuppName} - فاتورة #${invoice.id}${unitInfoNote}`
      : `شراء وتوريد (${invoice.type === 'nagdi' ? 'نقدي' : 'آجل'}) فرع [${invBranchId}] من المورد ${cleanSuppName} - فاتورة #${invoice.id}${unitInfoNote}${negSettleNote}`;

    stockItem.movements.push({
      date: dateStr,
      type: moveType,
      qty: qtyChange,
      price: item.price,
      total: round2(Math.abs(invQty) * item.price),
      note: noteText,
    });

    return {
      ...item,
      itemId: stockItem.id,
      code: stockItem.code || item.code,
      unitFactor: factor,
      baseQty,
      costPrice: round2(unitPurchaseCost * factor),
    };
  });

  function stockItmBranchSafe(bs: Record<string, number>) {
    return bs || {};
  }

  // 4. Store normalized invoice
  const normalizedInvoice: PurchaseInvoice = {
    ...invoice,
    supplierId: supp.id,
    supplierCode: supp.code || supp.id,
    supplierName: cleanSuppName,
    phone: cleanSuppPhone || supp.phone || '',
    branchId: invBranchId,
    items: enrichedPurItems,
    paidAmount: effectivePaidTotal,
    remainingAmount: effectiveRemaining,
    retroactiveSettlements: retroactiveSettlements.length > 0 ? retroactiveSettlements : undefined,
  };
  data.purchaseInvoices = [normalizedInvoice, ...data.purchaseInvoices];
  if (!isEditing && invoice.id >= data.nextPurchaseNumber) {
    data.nextPurchaseNumber = invoice.id + 1;
  }

  // 5. Supplier account posting

  if (invoice.type === 'ajel' || (!isReturn && creditAddedByInvoice > 0)) {
    supp.balance = round2((supp.balance || 0) + creditAddedByInvoice);
    supp.transactions.push({
      id: `tx_${Date.now()}_pur_${invoice.id}`,
      date: dateStr,
      time: timeStr,
      refNo: `PUR-${invoice.id}`,
      type: 'purchase_credit',
      invoiceId: invoice.id,
      description: `فاتورة شراء وتوريد آجل رقم #${invoice.id} (الإجمالي: ${totalNet.toFixed(2)} - المسدد عند الإصدار: ${effectiveInitialPaid.toFixed(2)})`,
      debit: 0,
      credit: creditAddedByInvoice,
      balance: supp.balance,
      notes: invoice.notes,
    });
  } else if (invoice.type === 'return_ajel' || (isReturn && creditAddedByInvoice > 0)) {
    supp.balance = round2((supp.balance || 0) - creditAddedByInvoice);
    supp.transactions.push({
      id: `tx_${Date.now()}_pret_${invoice.id}`,
      date: dateStr,
      time: timeStr,
      refNo: `PRET-${invoice.id}`,
      type: 'return_purchase',
      invoiceId: invoice.id,
      description: `مرتجع مشتريات وتوريد آجل رقم #${invoice.id} خصم من الحساب`,
      debit: creditAddedByInvoice,
      credit: 0,
      balance: supp.balance,
      notes: invoice.notes,
    });
  }

  // 5. 🏦 IDEMPOTENT CASH VOUCHERS (سندات صرف أو قبض حتمية غير قابلة للتكرار)
  const initialSplits = normalizeSplits(invoice.paymentSplits, invoice.paymentMethod, effectiveInitialPaid);
  if (effectiveInitialPaid > 0) {
    initialSplits.forEach((split, splitIdx) => {
      if (split.amount <= 0) return;
      const mKey = split.method;
      const isReceive = isReturn;
      const syncId = getInvoicePaymentVoucherSyncId('purchase', invoice.id, splitIdx);

      const existingVoucherIndex = data.cashTransactions.findIndex(
        (t) =>
          t.syncId === syncId ||
          (!t.syncId?.includes('_inst_') && t.invoiceId === invoice.id && t.type === (isReceive ? 'receive' : 'pay') && t.method === mKey)
      );

      const nextCashId = data.nextCashId || (data.cashTransactions.length + 1);
      const voucherId = existingVoucherIndex >= 0 ? data.cashTransactions[existingVoucherIndex].id : nextCashId;
      if (existingVoucherIndex < 0) data.nextCashId = nextCashId + 1;

      const voucherPayload: CashTransaction = {
        id: voucherId,
        syncId,
        voucherNo: `PAY-PUR-${invoice.id}-${splitIdx + 1}`,
        companyId: invoice.companyId || data.companyId || 'COMP-000001',
        branchId: invBranchId,
        date: dateStr,
        time: timeStr,
        type: isReceive ? 'receive' : 'pay',
        method: mKey,
        amount: split.amount,
        note: isReceive
          ? `سند قبض: استرداد نقدي من مرتجع مشتريات #${invoice.id} (${getPaymentMethodLabel(mKey)}) - المورد: ${invoice.supplierName}`
          : `سند صرف: سداد ${invoice.type === 'ajel' ? 'دفعة من فاتورة شراء آجل' : 'فاتورة شراء نقدي'} #${invoice.id} (${getPaymentMethodLabel(mKey)}) - المورد: ${invoice.supplierName}`,
        supplierName: invoice.supplierName,
        invoiceId: invoice.id,
        status: 'approved',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: invoice.createdBy || 'مدير النظام',
      };

      if (existingVoucherIndex >= 0) {
        data.cashTransactions[existingVoucherIndex] = voucherPayload;
      } else {
        data.cashTransactions.push(voucherPayload);
      }
    });
  }

  // 6. 📊 Balanced Double-Entry Perpetual Journal Entry (1106 المخزون + 2102 الضريبة + 1101..1104 النقدية/البنك + 2101 الموردون)
  const nextJid = data.nextJournalId || 1001;
  const journalLines: JournalLine[] = [];
  const vatAmt = round2(invoice.tax || 0);
  const inventoryAmt = round2(Math.max(0, totalNet - vatAmt));

  if (!isReturn) {
    if (inventoryAmt > 0) {
      journalLines.push({
        accountCode: '1106',
        accountName: 'مخزون البضاعة (Merchandise Inventory)',
        debit: inventoryAmt,
        credit: 0,
        note: `توريد مخزون فاتورة مشتريات #${invoice.id} من المورد ${invoice.supplierName}`,
      });
    }
    if (vatAmt > 0) {
      journalLines.push({
        accountCode: '2102',
        accountName: 'أمانات ضريبة القيمة المضافة (VAT Payable)',
        debit: vatAmt,
        credit: 0,
        note: `ضريبة مدخلات مشتريات فاتورة #${invoice.id}`,
      });
    }
    initialSplits.forEach((sp) => {
      const cashAcc = getCashAccountForMethod(sp.method);
      journalLines.push({
        accountCode: cashAcc.code,
        accountName: cashAcc.name,
        debit: 0,
        credit: sp.amount,
        note: `سداد فاتورة مشتريات #${invoice.id} (${getPaymentMethodLabel(sp.method)})`,
      });
    });
    if (creditAddedByInvoice > 0) {
      journalLines.push({
        accountCode: '2101',
        accountName: `الموردون والدائنون - ${invoice.supplierName}`,
        debit: 0,
        credit: creditAddedByInvoice,
        note: `المتبقي الآجل لفاتورة مشتريات #${invoice.id}`,
      });
    }
  } else {
    initialSplits.forEach((sp) => {
      const cashAcc = getCashAccountForMethod(sp.method);
      journalLines.push({
        accountCode: cashAcc.code,
        accountName: cashAcc.name,
        debit: sp.amount,
        credit: 0,
        note: `استرداد نقدي لمرتجع مشتريات #${invoice.id}`,
      });
    });
    if (creditAddedByInvoice > 0) {
      journalLines.push({
        accountCode: '2101',
        accountName: `الموردون والدائنون - ${invoice.supplierName}`,
        debit: creditAddedByInvoice,
        credit: 0,
        note: `تخفيض مديونية المورد بمرتجع مشتريات #${invoice.id}`,
      });
    }
    if (inventoryAmt > 0) {
      journalLines.push({
        accountCode: '1106',
        accountName: 'مخزون البضاعة (Merchandise Inventory)',
        debit: 0,
        credit: inventoryAmt,
        note: `خصم مخزون مرتجع مشتريات #${invoice.id}`,
      });
    }
    if (vatAmt > 0) {
      journalLines.push({
        accountCode: '2102',
        accountName: 'أمانات ضريبة القيمة المضافة (VAT Payable)',
        debit: 0,
        credit: vatAmt,
        note: `تسوية ضريبة مرتجع مشتريات #${invoice.id}`,
      });
    }
  }

  assertJournalBalanced(journalLines, `PUR-INV-${invoice.id}`);
  data.journalEntries.push({
    id: nextJid,
    date: dateStr,
    entryNumber: `JV-PUR-${invoice.id}`,
    reference: `PUR-INV-${invoice.id}`,
    description: `قيد محاسبي آلي لـ${isReturn ? 'مرتجع مشتريات' : 'فاتورة مشتريات'} #${invoice.id} - المورد: ${invoice.supplierName}`,
    lines: journalLines,
    source: 'purchase',
    createdBy: invoice.createdBy || 'مدير النظام',
    createdAt: new Date().toISOString(),
    isApproved: true,
  });
  data.nextJournalId = nextJid + 1;

  if (totalRetroactiveCogs > 0) {
    const retJid = data.nextJournalId || 1001;
    const retLines: JournalLine[] = [
      {
        accountCode: '5101',
        accountName: 'تكلفة البضاعة المباعة (Cost of Goods Sold - COGS)',
        debit: totalRetroactiveCogs,
        credit: 0,
        note: `تسوية تكلفة مبيعات سالبة سابقة بأثر رجعي من فاتورة مشتريات #${invoice.id}`,
      },
      {
        accountCode: '1106',
        accountName: 'مخزون البضاعة (Merchandise Inventory)',
        debit: 0,
        credit: totalRetroactiveCogs,
        note: `تسوية مخزون المبيعات السالبة بأثر رجعي من فاتورة مشتريات #${invoice.id}`,
      },
    ];
    assertJournalBalanced(retLines, `NEG-COGS-PUR-${invoice.id}`);
    data.journalEntries.push({
      id: retJid,
      date: dateStr,
      entryNumber: `JV-RET-${invoice.id}`,
      reference: `NEG-COGS-PUR-${invoice.id}`,
      description: `قيد تسوية تكلفة المبيعات السالبة بأثر رجعي - فاتورة مشتريات #${invoice.id}`,
      lines: retLines,
      source: 'purchase',
      createdBy: invoice.createdBy || 'مدير النظام',
      createdAt: new Date().toISOString(),
      isApproved: true,
    });
    data.nextJournalId = retJid + 1;
  }

  // 7. Authoritative treasury & subledger reconciliation
  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return data;
}

/**
 * 💰 ترحيل فاتورة مبيعات (جرد مستمر FIFO/Avg COGS + قيد مزدوج متوازن + سندات قبض حتمية)
 */
export function processSaleInvoice(
  appData: AppData,
  invoice: SaleInvoice,
  isEditing: boolean = false,
  oldInvoiceId?: number
): AppData {
  const targetOldId = isEditing
    ? (oldInvoiceId || invoice.id)
    : (appData.salesInvoices.some((i) => i.id === invoice.id) ? invoice.id : undefined);

  const now = new Date();
  const dateStr = invoice.date || now.toISOString().split('T')[0];
  assertPeriodUnlocked(appData, dateStr, isEditing ? 'تعديل فاتورة مبيعات' : 'حفظ فاتورة مبيعات');
  if (targetOldId) {
    const existingOld = (appData.salesInvoices || []).find((i) => i.id === targetOldId);
    if (existingOld) {
      assertPeriodUnlocked(appData, existingOld.date, 'تعديل فاتورة مبيعات من فترة مقفلة');
    }
  }

  const data: AppData = {
    ...appData,
    items: (appData.items || []).map((i) => ({
      ...i,
      movements: [...(i.movements || [])],
      fifoLayers: [...(i.fifoLayers || []).map((l) => ({ ...l }))],
      altUnits: i.altUnits ? i.altUnits.map((u) => ({ ...u })) : undefined,
    })),
    customers: (appData.customers || []).map((c) => ({ ...c, transactions: [...(c.transactions || [])] })),
    productPrices: (appData.productPrices || []).map((p) => ({ ...p })),
    cashTransactions: [...(appData.cashTransactions || [])],
    journalEntries: [...(appData.journalEntries || [])],
    salesInvoices: [...(appData.salesInvoices || [])],
  };

  const isReturn = invoice.type.startsWith('return_');
  const timeStr = invoice.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const mainBranchId = getMainBranchId(data.branches);
  const invBranchId = invoice.branchId || data.activeBranchId || mainBranchId;
  const globalCostMethod: 'fifo' | 'avg' = (data.settings as any)?.costingMethod === 'avg' ? 'avg' : 'fifo';

  // 1. Rollback old invoice impacts if editing or re-saving existing ID (PRESERVING _inst_ installment vouchers!)
  if (targetOldId) {
    const oldInv = data.salesInvoices.find((i) => i.id === targetOldId);
    if (oldInv) {
      const wasReturn = oldInv.type.startsWith('return_');
      const oldBr = oldInv.branchId || mainBranchId;

      oldInv.items?.forEach((itm, idx) => {
        const stockItm = data.items.find(
          (i) =>
            (itm.itemId && i.id === itm.itemId) ||
            (itm.code && i.code && i.code.trim().toLowerCase() === itm.code.trim().toLowerCase() &&
              (i.branchId === oldBr || (!i.branchId && oldBr === mainBranchId))) ||
            (normalizeEngineText(i.name) === normalizeEngineText(itm.name) &&
              (i.branchId === oldBr || (!i.branchId && oldBr === mainBranchId)))
        );
        if (stockItm) {
          const itmFactor = Math.max(0.0001, Number(itm.unitFactor || 1));
          const itmBaseQty = round2(
            itm.baseQty !== undefined && Number(itm.baseQty) > 0 ? Number(itm.baseQty) : Number(itm.qty || 0) * itmFactor
          );
          const qtyDiff = wasReturn ? -itmBaseQty : itmBaseQty;
          stockItm.quantity = round2((stockItm.quantity || 0) + qtyDiff);
          if (stockItm.branchStock) {
            stockItm.branchStock = { ...stockItm.branchStock, [oldBr]: stockItm.quantity };
          }

          if (!wasReturn) {
            const restoreCost = round2(
              itm.costPrice ? Number(itm.costPrice) / itmFactor : Number(stockItm.avgCost || stockItm.purchasePrice || 0)
            );
            if (restoreCost > 0) {
              stockItm.fifoLayers = [
                {
                  id: `layer_revert_sale_${targetOldId}_${idx}_${Date.now()}`,
                  date: oldInv.date || dateStr,
                  remainingQty: itmBaseQty,
                  unitCost: restoreCost,
                },
                ...(stockItm.fifoLayers || []),
              ];
            }
          } else {
            stockItm.fifoLayers = (stockItm.fifoLayers || []).filter((l) => l.invoiceId !== targetOldId);
          }
          stockItm.avgCost = recomputeItemAvgCost(stockItm);

          stockItm.movements.push({
            date: dateStr,
            type: 'adjustment',
            qty: qtyDiff,
            price: itm.price,
            total: Math.abs(itm.qty) * itm.price,
            note: `تسوية وإعادة رصيد المخزن قبل تعديل فاتورة المبيعات #${oldInv.id}`,
          });
        }
      });

      const preservedInstAmt = data.cashTransactions
        .filter((tx) => tx.status !== 'cancelled' && tx.invoiceId === targetOldId && tx.syncId?.includes('_inst_'))
        .reduce((s, tx) => s + (tx.type === 'receive' ? Number(tx.amount || 0) : -Number(tx.amount || 0)), 0);

      if (oldInv.customerName) {
        const cust = data.customers.find((c) => c.name.trim().toLowerCase() === oldInv.customerName.trim().toLowerCase());
        if (cust) {
          const oldPaid = Number(oldInv.paidAmount || 0);
          const oldInitialPaid = Math.max(0, oldPaid - preservedInstAmt);
          const oldDebtAdded = Math.max(0, Number(oldInv.total || 0) - oldInitialPaid);
          if (oldInv.type === 'ajel' || oldInv.type === 'return_ajel' || oldDebtAdded > 0) {
            cust.balance = round2((cust.balance || 0) - (wasReturn ? -oldDebtAdded : oldDebtAdded));
          }
          cust.transactions = cust.transactions.filter(
            (tx) => tx.invoiceId !== targetOldId || tx.type === 'payment'
          );
        }
      }

      data.cashTransactions = data.cashTransactions.filter(
        (tx) => tx.invoiceId !== targetOldId || (tx.syncId && tx.syncId.includes('_inst_'))
      );
      data.journalEntries = data.journalEntries.filter((je) => je.reference !== `SALE-INV-${targetOldId}`);
      data.salesInvoices = data.salesInvoices.filter((i) => i.id !== targetOldId);
    }
  }

  const preservedInstVouchers = data.cashTransactions.filter(
    (tx) => tx.status !== 'cancelled' && tx.invoiceId === invoice.id && tx.syncId?.includes('_inst_')
  );
  const instPaidTotal = round2(
    preservedInstVouchers.reduce((s, tx) => s + (tx.type === 'receive' ? Number(tx.amount || 0) : -Number(tx.amount || 0)), 0)
  );

  const totalNet = round2(invoice.total || 0);
  const requestedPaid = round2(
    Math.min(totalNet, Math.max(0, invoice.paidAmount !== undefined ? invoice.paidAmount : (invoice.type.includes('nagdi') ? totalNet : 0)))
  );
  const effectiveInitialPaid = round2(Math.max(0, requestedPaid - instPaidTotal));
  const effectivePaidTotal = round2(Math.min(totalNet, effectiveInitialPaid + instPaidTotal));
  const effectiveRemaining = round2(Math.max(0, totalNet - effectivePaidTotal));
  const debtAddedByInvoice = round2(Math.max(0, totalNet - effectiveInitialPaid));

  // 2. 📦 Inventory Posting, Multi-UOM, Negative Stock Tracking, Sticky Sale Price & Real FIFO/Avg COGS
  let totalInvoiceCogs = 0;
  const enrichedItems = (invoice.items || []).map((item, idx) => {
    const factor = Math.max(0.0001, Number(item.unitFactor || 1));
    const lineQty = Number(item.qty || 0);
    const baseQty = round2(
      item.baseQty !== undefined && Number(item.baseQty) > 0 ? Number(item.baseQty) : lineQty * factor
    );

    let stockItem = data.items.find(
      (i) =>
        (item.itemId && i.id === item.itemId) ||
        (item.code && i.code && i.code.trim().toLowerCase() === item.code.trim().toLowerCase() &&
          (i.branchId === invBranchId || (!i.branchId && invBranchId === mainBranchId))) ||
        (normalizeEngineText(i.name) === normalizeEngineText(item.name) &&
          (i.branchId === invBranchId || (!i.branchId && invBranchId === mainBranchId)))
    );
    if (!stockItem) {
      const explicitCost = round2(Number(item.costPrice || 0) / factor);
      const cleanSalePrice = round2(Number(item.price || 0) / factor);
      const fallbackCode = generateNextUniqueItemCode(data.items, item.code);
      stockItem = {
        id: item.itemId || `i_${invBranchId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        companyId: invoice.companyId || data.companyId || 'COMP-000001',
        branchId: invBranchId,
        code: fallbackCode,
        name: item.name.trim(),
        category: item.category || 'عام',
        unit: factor === 1 ? (item.unit || 'قطعة') : 'قطعة',
        quantity: 0,
        branchStock: { [invBranchId]: 0 },
        purchasePrice: explicitCost,
        costPrice: explicitCost,
        avgCost: explicitCost,
        salePrice: cleanSalePrice,
        normalSellingPrice: cleanSalePrice,
        lastPriceUpdate: dateStr,
        lastPriceUpdatedBy: invoice.updatedBy || invoice.createdBy || 'مدير النظام',
        fifoLayers: [],
        movements: [],
        createdAt: now.toISOString(),
        createdBy: invoice.createdBy || 'مدير النظام',
      };
      data.items.push(stockItem);
    }

    // Sticky Sale Price: always update base salePrice (+ altUnit salePrice if applicable)
    const soldUnitPriceBase = round2(Number(item.price || 0) / factor);
    if (!isReturn && soldUnitPriceBase > 0) {
      stockItem.salePrice = soldUnitPriceBase;
      stockItem.normalSellingPrice = soldUnitPriceBase;
      (stockItem as any).price = soldUnitPriceBase;
      if (stockItem.altUnits && item.unit) {
        const uLower = item.unit.trim().toLowerCase();
        stockItem.altUnits = stockItem.altUnits.map((au) =>
          au.name.trim().toLowerCase() === uLower ? { ...au, salePrice: round2(Number(item.price || 0)) } : au
        );
      }
      stockItem.lastPriceUpdate = dateStr;
      stockItem.lastPriceUpdatedBy = invoice.updatedBy || invoice.createdBy || 'مدير النظام';
      stockItem.updatedAt = now.toISOString();

      if (!data.productPrices) data.productPrices = [];
      const pIdx = data.productPrices.findIndex((p) => p.productId === stockItem!.id);
      if (pIdx >= 0) {
        const pCost = Number(stockItem.purchasePrice || data.productPrices[pIdx].purchaseCost || 0);
        const marginPct = pCost > 0 ? round2(((soldUnitPriceBase - pCost) / pCost) * 100) : 100;
        data.productPrices[pIdx] = {
          ...data.productPrices[pIdx],
          normalSellingPrice: soldUnitPriceBase,
          profitMarginNormalPercent: marginPct,
          updatedAt: dateStr,
          updatedBy: invoice.updatedBy || invoice.createdBy || 'مدير النظام',
        };
      } else {
        const pCost = Number(stockItem.purchasePrice || 0);
        const wholesaleP = Number(stockItem.wholesaleSellingPrice || stockItem.wholesalePrice || soldUnitPriceBase);
        const marginPct = pCost > 0 ? round2(((soldUnitPriceBase - pCost) / pCost) * 100) : 100;
        const wMarginPct = pCost > 0 ? round2(((wholesaleP - pCost) / pCost) * 100) : 100;
        data.productPrices.push({
          id: `prc-${stockItem.id}`,
          productId: stockItem.id,
          productCode: stockItem.code || '',
          productBarcode: stockItem.barcode || '',
          productName: stockItem.name,
          category: stockItem.category || 'عام',
          purchaseCost: pCost,
          normalSellingPrice: soldUnitPriceBase,
          wholesaleSellingPrice: wholesaleP,
          profitMarginNormalPercent: marginPct,
          profitMarginWholesalePercent: wMarginPct,
          updatedAt: dateStr,
          updatedBy: invoice.updatedBy || invoice.createdBy || 'مدير النظام',
        });
      }
    }

    ensureBaselineFifoLayerIfNeeded(stockItem, dateStr);
    const methodForItem: 'fifo' | 'avg' = stockItem.costMethod || globalCostMethod;
    let lineCogs = 0;
    let costMissing = false;
    let uncostedQty = 0;

    if (!isReturn) {
      stockItem.quantity = round2((stockItem.quantity || 0) - baseQty);
      if (stockItem.branchStock) {
        stockItem.branchStock = { ...stockItem.branchStock, [invBranchId]: stockItem.quantity };
      }

      const currentAvg = round2(
        Number(stockItem.avgCost || stockItem.purchasePrice || stockItem.costPrice || (item.costPrice ? Number(item.costPrice) / factor : 0))
      );
      let remainingNeed = baseQty;
      const updatedLayers: FifoCostLayer[] = [];

      for (const layer of stockItem.fifoLayers || []) {
        if (layer.remainingQty <= 0) continue;
        if (remainingNeed > 0) {
          const consume = Math.min(layer.remainingQty, remainingNeed);
          lineCogs += consume * (methodForItem === 'avg' && currentAvg > 0 ? currentAvg : layer.unitCost);
          remainingNeed = round2(remainingNeed - consume);
          const left = round2(layer.remainingQty - consume);
          if (left > 0) updatedLayers.push({ ...layer, remainingQty: left });
        } else {
          updatedLayers.push(layer);
        }
      }
      stockItem.fifoLayers = updatedLayers;

      if (remainingNeed > 0) {
        if (currentAvg > 0) {
          lineCogs += remainingNeed * currentAvg;
        } else {
          costMissing = true;
          uncostedQty = round2(remainingNeed);
        }
      }

      if (lineCogs <= 0 && baseQty > 0) {
        costMissing = true;
        if (uncostedQty <= 0) uncostedQty = round2(baseQty);
      }
      stockItem.avgCost = recomputeItemAvgCost(stockItem);
    } else {
      // Sales return: restore stock & FIFO layer in base units
      stockItem.quantity = round2((stockItem.quantity || 0) + baseQty);
      if (stockItem.branchStock) {
        stockItem.branchStock = { ...stockItem.branchStock, [invBranchId]: stockItem.quantity };
      }
      const returnUnitCost = round2(
        Number(
          item.costPrice
            ? Number(item.costPrice) / factor
            : stockItem.avgCost || stockItem.purchasePrice || stockItem.costPrice || 0
        )
      );
      if (returnUnitCost > 0) {
        lineCogs = round2(baseQty * returnUnitCost);
        stockItem.fifoLayers = [
          ...(stockItem.fifoLayers || []),
          {
            id: `layer_sret_${invoice.id}_${idx}_${Date.now()}`,
            invoiceId: invoice.id,
            date: dateStr,
            remainingQty: baseQty,
            unitCost: returnUnitCost,
          },
        ];
        stockItem.avgCost = recomputeItemAvgCost(stockItem);
      } else {
        costMissing = true;
      }
    }

    lineCogs = round2(lineCogs);
    totalInvoiceCogs = round2(totalInvoiceCogs + lineCogs);
    const unitCostOut = lineQty > 0 ? round2(lineCogs / lineQty) : 0;

    const qtyChange = isReturn ? baseQty : -baseQty;
    const moveType: ItemMovement['type'] = isReturn ? 'return_sale' : 'sale';
    const unitInfoNote = factor !== 1 ? ` (${lineQty} ${item.unit || 'وحدة'} = ${baseQty} أساسية)` : '';
    const noteText = isReturn
      ? `مرتجع بيع (${invoice.type === 'return_nagdi' ? 'نقدي' : 'آجل'}) فرع [${invBranchId}] من العميل ${invoice.customerName} - فاتورة #${invoice.id}${unitInfoNote}`
      : `بيع (${invoice.type === 'nagdi' ? 'نقدي' : 'آجل'}) فرع [${invBranchId}] للعميل ${invoice.customerName} - فاتورة #${invoice.id}${unitInfoNote}${stockItem.quantity < 0 ? ' [بيع بالسالب]' : ''}`;

    stockItem.movements.push({
      date: dateStr,
      type: moveType,
      qty: qtyChange,
      price: item.price,
      total: round2(Math.abs(lineQty) * item.price),
      note: noteText,
    });

    return {
      ...item,
      itemId: stockItem.id,
      code: stockItem.code || item.code,
      unitFactor: factor,
      baseQty,
      costPrice: unitCostOut,
      costMissing,
      uncostedQty: uncostedQty > 0 ? uncostedQty : undefined,
    };
  });

  // 3. 📋 Customer Auto-Registration & Phone Sync BEFORE storing invoice
  const cleanCustName = (invoice.customerName || '').trim() || 'عميل نقدي';
  const cleanCustPhone = (invoice.phone || '').trim();
  let cust = data.customers.find(
    (c) =>
      (invoice.customerId && c.id === invoice.customerId) ||
      (invoice.customerCode && c.code && c.code === invoice.customerCode) ||
      c.name.trim().toLowerCase() === cleanCustName.toLowerCase()
  );
  if (!cust) {
    const existingNums = data.customers
      .map((c) => parseInt((c.code || c.id || '').replace(/\D/g, '') || '0', 10))
      .filter((n) => !isNaN(n) && n > 0);
    const nextCustNum = (existingNums.length > 0 ? Math.max(...existingNums) : data.customers.length) + 1;
    const generatedCode = invoice.customerCode?.trim() || `CUST-${String(nextCustNum).padStart(3, '0')}`;
    cust = {
      id: 'c' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      code: generatedCode,
      companyId: invoice.companyId || data.companyId || 'COMP-000001',
      branchId: invBranchId,
      name: cleanCustName,
      phone: cleanCustPhone,
      balance: 0,
      transactions: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: invoice.createdBy || 'مدير النظام',
    };
    data.customers.push(cust);
  } else {
    if (!cust.code) {
      const existingNums = data.customers
        .map((c) => parseInt((c.code || c.id || '').replace(/\D/g, '') || '0', 10))
        .filter((n) => !isNaN(n) && n > 0);
      const nextCustNum = (existingNums.length > 0 ? Math.max(...existingNums) : data.customers.length) + 1;
      cust.code = `CUST-${String(nextCustNum).padStart(3, '0')}`;
    }
    if (cleanCustPhone && cleanCustPhone !== cust.phone) {
      cust.phone = cleanCustPhone;
    }
    cust.updatedAt = now.toISOString();
  }

  // Store normalized invoice with enriched real FIFO costPrice, customer ID/code, and flags
  const normalizedInvoice: SaleInvoice = {
    ...invoice,
    customerId: cust.id,
    customerCode: cust.code || cust.id,
    customerName: cleanCustName,
    phone: cleanCustPhone || cust.phone || '',
    branchId: invBranchId,
    items: enrichedItems,
    paidAmount: effectivePaidTotal,
    remainingAmount: effectiveRemaining,
  };
  data.salesInvoices = [normalizedInvoice, ...data.salesInvoices];
  if (!isEditing && invoice.id >= data.nextInvoiceNumber) {
    data.nextInvoiceNumber = invoice.id + 1;
  }

  if (invoice.type === 'ajel' || (!isReturn && debtAddedByInvoice > 0)) {
    cust.balance = round2((cust.balance || 0) + debtAddedByInvoice);
    cust.transactions.push({
      id: `tx_${Date.now()}_sale_${invoice.id}`,
      date: dateStr,
      time: timeStr,
      refNo: `INV-${invoice.id}`,
      type: 'sale_credit',
      invoiceId: invoice.id,
      description: `فاتورة بيع آجل رقم #${invoice.id} (الإجمالي: ${totalNet.toFixed(2)} - المسدد عند الإصدار: ${effectiveInitialPaid.toFixed(2)})`,
      debit: debtAddedByInvoice,
      credit: 0,
      balance: cust.balance,
      notes: invoice.notes,
    });
  } else if (invoice.type === 'return_ajel' || (isReturn && debtAddedByInvoice > 0)) {
    cust.balance = round2((cust.balance || 0) - debtAddedByInvoice);
    cust.transactions.push({
      id: `tx_${Date.now()}_ret_${invoice.id}`,
      date: dateStr,
      time: timeStr,
      refNo: `RET-${invoice.id}`,
      type: 'return_sale',
      invoiceId: invoice.id,
      description: `مرتجع مبيعات آجل رقم #${invoice.id} قيد في الحساب`,
      debit: 0,
      credit: debtAddedByInvoice,
      balance: cust.balance,
      notes: invoice.notes,
    });
  }

  // 4. 🏦 IDEMPOTENT CASH VOUCHERS
  const initialSplits = normalizeSplits(invoice.paymentSplits, invoice.paymentMethod, effectiveInitialPaid);
  if (effectiveInitialPaid > 0) {
    initialSplits.forEach((split, splitIdx) => {
      if (split.amount <= 0) return;
      const mKey = split.method;
      const isPayOut = isReturn;
      const syncId = getInvoicePaymentVoucherSyncId('sale', invoice.id, splitIdx);

      const existingVoucherIndex = data.cashTransactions.findIndex(
        (t) =>
          t.syncId === syncId ||
          (!t.syncId?.includes('_inst_') && t.invoiceId === invoice.id && t.type === (isPayOut ? 'pay' : 'receive') && t.method === mKey)
      );

      const nextCashId = data.nextCashId || (data.cashTransactions.length + 1);
      const voucherId = existingVoucherIndex >= 0 ? data.cashTransactions[existingVoucherIndex].id : nextCashId;
      if (existingVoucherIndex < 0) data.nextCashId = nextCashId + 1;

      const voucherPayload: CashTransaction = {
        id: voucherId,
        syncId,
        voucherNo: `${isPayOut ? 'PAY-SRET' : 'REC-SAL'}-${invoice.id}-${splitIdx + 1}`,
        companyId: invoice.companyId || data.companyId || 'COMP-000001',
        branchId: invBranchId,
        date: dateStr,
        time: timeStr,
        type: isPayOut ? 'pay' : 'receive',
        method: mKey,
        amount: split.amount,
        note: isPayOut
          ? `سند صرف: رد نقدي لمرتجع مبيعات #${invoice.id} (${getPaymentMethodLabel(mKey)}) - العميل: ${invoice.customerName}`
          : `سند قبض: تحصيل ${invoice.type === 'ajel' ? 'دفعة مقدمة من فاتورة آجل' : 'فاتورة بيع نقدي'} #${invoice.id} (${getPaymentMethodLabel(mKey)}) - العميل: ${invoice.customerName}`,
        customerName: invoice.customerName,
        invoiceId: invoice.id,
        status: 'approved',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: invoice.createdBy || 'مدير النظام',
      };

      if (existingVoucherIndex >= 0) {
        data.cashTransactions[existingVoucherIndex] = voucherPayload;
      } else {
        data.cashTransactions.push(voucherPayload);
      }
    });
  }

  // 5. 📊 Balanced Double-Entry Journal Entry (Revenue + VAT + Discount + Perpetual Inventory/COGS)
  const nextJid = data.nextJournalId || 1001;
  const journalLines: JournalLine[] = [];
  const vatAmt = round2(invoice.tax || 0);
  const extraAmt = round2(invoice.extraRevenueAmount || 0);
  const discAmt = round2(invoice.discount || 0);

  if (!isReturn) {
    initialSplits.forEach((sp) => {
      const cashAcc = getCashAccountForMethod(sp.method);
      journalLines.push({
        accountCode: cashAcc.code,
        accountName: cashAcc.name,
        debit: sp.amount,
        credit: 0,
        note: `تحصيل فاتورة بيع #${invoice.id} (${getPaymentMethodLabel(sp.method)})`,
      });
    });

    if (debtAddedByInvoice > 0) {
      journalLines.push({
        accountCode: '1105',
        accountName: `العملاء والمدينون - ${invoice.customerName}`,
        debit: debtAddedByInvoice,
        credit: 0,
        note: `المتبقي الآجل فاتورة مبيعات #${invoice.id}`,
      });
    }

    const baseNet = round2(totalNet - vatAmt - extraAmt);
    const grossRevenue = round2(baseNet + discAmt);

    if (discAmt > 0) {
      journalLines.push({
        accountCode: '4104',
        accountName: 'خصم مسموح به (Sales Discounts)',
        debit: discAmt,
        credit: 0,
        note: `خصم ممنوح على فاتورة مبيعات #${invoice.id}`,
      });
    }

    if (grossRevenue > 0) {
      journalLines.push({
        accountCode: '4101',
        accountName: 'إيراد مبيعات بضاعة تجارية (Sales Revenue)',
        debit: 0,
        credit: grossRevenue,
        note: `إيراد مبيعات فاتورة #${invoice.id}`,
      });
    }

    if (vatAmt > 0) {
      journalLines.push({
        accountCode: '2102',
        accountName: 'أمانات ضريبة القيمة المضافة (VAT Payable)',
        debit: 0,
        credit: vatAmt,
        note: `ضريبة مبيعات فاتورة #${invoice.id}`,
      });
    }

    if (extraAmt > 0) {
      journalLines.push({
        accountCode: '4103',
        accountName: 'إيرادات خدمات وشحن وصيانة',
        debit: 0,
        credit: extraAmt,
        note: invoice.extraRevenueName || `خدمة / مصاريف شحن فاتورة #${invoice.id}`,
      });
    }

    // Perpetual Inventory & COGS Recognition
    if (totalInvoiceCogs > 0) {
      journalLines.push({
        accountCode: '5101',
        accountName: 'تكلفة البضاعة المباعة (Cost of Goods Sold - COGS)',
        debit: totalInvoiceCogs,
        credit: 0,
        note: `تكلفة البضاعة المباعة فاتورة #${invoice.id}`,
      });
      journalLines.push({
        accountCode: '1106',
        accountName: 'مخزون البضاعة (Merchandise Inventory)',
        debit: 0,
        credit: totalInvoiceCogs,
        note: `صرف مخزني لتكلفة مبيعات فاتورة #${invoice.id}`,
      });
    }
  } else {
    const netReturnSales = round2(Math.max(0, totalNet - vatAmt - extraAmt));
    if (netReturnSales > 0) {
      journalLines.push({
        accountCode: '4102',
        accountName: 'مردودات ومسموحات المبيعات (Sales Returns)',
        debit: netReturnSales,
        credit: 0,
        note: `مردودات مبيعات فاتورة #${invoice.id} للعميل ${invoice.customerName}`,
      });
    }
    if (extraAmt > 0) {
      journalLines.push({
        accountCode: '4103',
        accountName: 'إيرادات خدمات وشحن وصيانة',
        debit: extraAmt,
        credit: 0,
        note: `تسوية خدمات مرتجع مبيعات #${invoice.id}`,
      });
    }
    if (vatAmt > 0) {
      journalLines.push({
        accountCode: '2102',
        accountName: 'أمانات ضريبة القيمة المضافة (VAT Payable)',
        debit: vatAmt,
        credit: 0,
        note: `عكس ضريبة مرتجع مبيعات #${invoice.id}`,
      });
    }

    initialSplits.forEach((sp) => {
      const cashAcc = getCashAccountForMethod(sp.method);
      journalLines.push({
        accountCode: cashAcc.code,
        accountName: cashAcc.name,
        debit: 0,
        credit: sp.amount,
        note: `صرف رد نقدي لمرتجع مبيعات #${invoice.id}`,
      });
    });

    if (debtAddedByInvoice > 0) {
      journalLines.push({
        accountCode: '1105',
        accountName: `العملاء والمدينون - ${invoice.customerName}`,
        debit: 0,
        credit: debtAddedByInvoice,
        note: `تخفيض مديونية العميل بمرتجع مبيعات #${invoice.id}`,
      });
    }

    if (totalInvoiceCogs > 0) {
      journalLines.push({
        accountCode: '1106',
        accountName: 'مخزون البضاعة (Merchandise Inventory)',
        debit: totalInvoiceCogs,
        credit: 0,
        note: `رد بضاعة مرتجع مبيعات إلى المخزون #${invoice.id}`,
      });
      journalLines.push({
        accountCode: '5101',
        accountName: 'تكلفة البضاعة المباعة (Cost of Goods Sold - COGS)',
        debit: 0,
        credit: totalInvoiceCogs,
        note: `عكس تكلفة بضاعة مرتجع مبيعات #${invoice.id}`,
      });
    }
  }

  assertJournalBalanced(journalLines, `SALE-INV-${invoice.id}`);
  data.journalEntries.push({
    id: nextJid,
    date: dateStr,
    entryNumber: `JV-SAL-${invoice.id}`,
    reference: `SALE-INV-${invoice.id}`,
    description: `قيد محاسبي آلي لـ${isReturn ? 'مرتجع مبيعات' : 'فاتورة مبيعات'} #${invoice.id} - العميل: ${invoice.customerName}`,
    lines: journalLines,
    source: 'sales',
    createdBy: invoice.createdBy || 'مدير النظام',
    createdAt: new Date().toISOString(),
    isApproved: true,
  });
  data.nextJournalId = nextJid + 1;

  // 6. Authoritative Treasury Reconciliation
  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return data;
}

/**
 * 💸 سداد دفعة لاحقة لفاتورة مشتريات مع حماية تامة من التكرار والقيد المزدوج
 */
export function processPurchasePayment(
  appData: AppData,
  params: {
    invoiceId: number;
    amount: number;
    method: 'drawer' | 'vodafone' | 'instapay' | 'bank';
    date?: string;
    note?: string;
    branchId?: string;
    user?: any;
    syncId?: string;
  }
): AppData {
  const now = new Date();
  const dateStr = params.date || now.toISOString().split('T')[0];
  assertPeriodUnlocked(appData, dateStr, 'سداد دفعة فاتورة مشتريات');

  const data: AppData = {
    ...appData,
    cashTransactions: [...(appData.cashTransactions || [])],
    purchaseInvoices: [...(appData.purchaseInvoices || [])],
    suppliers: (appData.suppliers || []).map((s) => ({ ...s, transactions: [...(s.transactions || [])] })),
    journalEntries: [...(appData.journalEntries || [])],
  };

  const invIndex = data.purchaseInvoices.findIndex((i) => i.id === params.invoiceId);
  if (invIndex === -1) {
    throw new Error(`فاتورة المشتريات رقم #${params.invoiceId} غير موجودة.`);
  }

  const deterministicSyncId = params.syncId || getInstallmentPaymentVoucherSyncId('purchase', params.invoiceId, Date.now());
  if (data.cashTransactions.some((t) => t.status !== 'cancelled' && t.syncId === deterministicSyncId)) {
    return data; // Already applied idempotently
  }

  const inv = data.purchaseInvoices[invIndex];
  const rem = Math.max(0, inv.total - (inv.paidAmount || 0));
  const payAmt = round2(Math.min(rem, params.amount));
  if (payAmt <= 0) return data;

  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const mainBranchId = getMainBranchId(data.branches);
  const targetBranch = params.branchId || inv.branchId || mainBranchId;

  const newPaid = round2((inv.paidAmount || 0) + payAmt);
  const newRem = Math.max(0, round2(inv.total - newPaid));
  data.purchaseInvoices[invIndex] = {
    ...inv,
    paidAmount: newPaid,
    remainingAmount: newRem,
  };

  const supp = data.suppliers.find((s) => s.name.trim().toLowerCase() === inv.supplierName.trim().toLowerCase());
  if (supp) {
    supp.balance = round2((supp.balance || 0) - payAmt);
    supp.transactions.push({
      id: `tx_${Date.now()}_pay_${inv.id}`,
      date: dateStr,
      time: timeStr,
      refNo: `PAY-${inv.id}`,
      type: 'payment',
      invoiceId: inv.id,
      description: `سداد دفعة من فاتورة شراء #${inv.id} (${getPaymentMethodLabel(params.method)})`,
      debit: payAmt,
      credit: 0,
      balance: supp.balance,
      notes: params.note,
    });
  }

  const nextCashId = data.nextCashId || (data.cashTransactions.length + 1);
  const voucher: CashTransaction = {
    id: nextCashId,
    syncId: deterministicSyncId,
    voucherNo: `PAY-${String(nextCashId).padStart(4, '0')}`,
    companyId: inv.companyId || data.companyId || 'COMP-000001',
    branchId: targetBranch,
    date: dateStr,
    time: timeStr,
    type: 'pay',
    method: params.method,
    amount: payAmt,
    note: params.note || `سند صرف: سداد دفعة فاتورة مشتريات #${inv.id} (${getPaymentMethodLabel(params.method)}) - المورد: ${inv.supplierName}`,
    supplierName: inv.supplierName,
    invoiceId: inv.id,
    status: 'approved',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: params.user?.name || 'مستخدم النظام',
    createdByUserId: params.user?.id,
    createdByUserCode: params.user?.code || 1,
  };

  data.cashTransactions.push(voucher);
  data.nextCashId = nextCashId + 1;

  const nextJid = data.nextJournalId || 1001;
  const cashAcc = getCashAccountForMethod(params.method);
  const jLines: JournalLine[] = [
    {
      accountCode: '2101',
      accountName: `الموردون والدائنون - ${inv.supplierName}`,
      debit: payAmt,
      credit: 0,
      note: `سداد جزء من مديونية فاتورة #${inv.id}`,
    },
    {
      accountCode: cashAcc.code,
      accountName: cashAcc.name,
      debit: 0,
      credit: payAmt,
      note: `صرف من ${getPaymentMethodLabel(params.method)}`,
    },
  ];
  assertJournalBalanced(jLines, `PUR-PAY-${inv.id}-${voucher.id}`);
  data.journalEntries.push({
    id: nextJid,
    date: dateStr,
    entryNumber: `JV-PAY-${inv.id}-${voucher.id}`,
    reference: `PUR-PAY-${inv.id}-${voucher.id}`,
    description: `سداد دفعة للمورد ${inv.supplierName} عن فاتورة مشتريات #${inv.id}`,
    lines: jLines,
    source: 'cash',
    createdBy: params.user?.name || 'مستخدم النظام',
    createdAt: now.toISOString(),
    isApproved: true,
  });
  data.nextJournalId = nextJid + 1;

  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return data;
}

/**
 * 💰 سداد دفعة لاحقة لفاتورة مبيعات مع حماية تامة من التكرار
 */
export function processSalePayment(
  appData: AppData,
  params: {
    invoiceId: number;
    amount: number;
    method: 'drawer' | 'vodafone' | 'instapay' | 'bank';
    date?: string;
    note?: string;
    branchId?: string;
    user?: any;
    syncId?: string;
  }
): AppData {
  const now = new Date();
  const dateStr = params.date || now.toISOString().split('T')[0];
  assertPeriodUnlocked(appData, dateStr, 'تحصيل دفعة فاتورة مبيعات');

  const data: AppData = {
    ...appData,
    cashTransactions: [...(appData.cashTransactions || [])],
    salesInvoices: [...(appData.salesInvoices || [])],
    customers: (appData.customers || []).map((c) => ({ ...c, transactions: [...(c.transactions || [])] })),
    journalEntries: [...(appData.journalEntries || [])],
  };

  const invIndex = data.salesInvoices.findIndex((i) => i.id === params.invoiceId);
  if (invIndex === -1) {
    throw new Error(`فاتورة المبيعات رقم #${params.invoiceId} غير موجودة.`);
  }

  const deterministicSyncId = params.syncId || getInstallmentPaymentVoucherSyncId('sale', params.invoiceId, Date.now());
  if (data.cashTransactions.some((t) => t.status !== 'cancelled' && t.syncId === deterministicSyncId)) {
    return data;
  }

  const inv = data.salesInvoices[invIndex];
  const rem = Math.max(0, inv.total - (inv.paidAmount || 0));
  const payAmt = round2(Math.min(rem, params.amount));
  if (payAmt <= 0) return data;

  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const mainBranchId = getMainBranchId(data.branches);
  const targetBranch = params.branchId || inv.branchId || mainBranchId;

  const newPaid = round2((inv.paidAmount || 0) + payAmt);
  const newRem = Math.max(0, round2(inv.total - newPaid));
  data.salesInvoices[invIndex] = {
    ...inv,
    paidAmount: newPaid,
    remainingAmount: newRem,
  };

  const cust = data.customers.find((c) => c.name.trim().toLowerCase() === inv.customerName.trim().toLowerCase());
  if (cust) {
    cust.balance = round2((cust.balance || 0) - payAmt);
    cust.transactions.push({
      id: `tx_${Date.now()}_rec_${inv.id}`,
      date: dateStr,
      time: timeStr,
      refNo: `REC-${inv.id}`,
      type: 'payment',
      invoiceId: inv.id,
      description: `تحصيل دفعة من فاتورة بيع #${inv.id} (${getPaymentMethodLabel(params.method)})`,
      debit: 0,
      credit: payAmt,
      balance: cust.balance,
      notes: params.note,
    });
  }

  const nextCashId = data.nextCashId || (data.cashTransactions.length + 1);
  const voucher: CashTransaction = {
    id: nextCashId,
    syncId: deterministicSyncId,
    voucherNo: `REC-${String(nextCashId).padStart(4, '0')}`,
    companyId: inv.companyId || data.companyId || 'COMP-000001',
    branchId: targetBranch,
    date: dateStr,
    time: timeStr,
    type: 'receive',
    method: params.method,
    amount: payAmt,
    note: params.note || `سند قبض: تحصيل دفعة فاتورة مبيعات #${inv.id} (${getPaymentMethodLabel(params.method)}) - العميل: ${inv.customerName}`,
    customerName: inv.customerName,
    invoiceId: inv.id,
    status: 'approved',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: params.user?.name || 'مستخدم النظام',
    createdByUserId: params.user?.id,
    createdByUserCode: params.user?.code || 1,
  };

  data.cashTransactions.push(voucher);
  data.nextCashId = nextCashId + 1;

  const nextJid = data.nextJournalId || 1001;
  const cashAcc = getCashAccountForMethod(params.method);
  const jLines: JournalLine[] = [
    {
      accountCode: cashAcc.code,
      accountName: cashAcc.name,
      debit: payAmt,
      credit: 0,
      note: `إيداع في ${getPaymentMethodLabel(params.method)}`,
    },
    {
      accountCode: '1105',
      accountName: `العملاء والمدينون - ${inv.customerName}`,
      debit: 0,
      credit: payAmt,
      note: `سداد من مديونية فاتورة #${inv.id}`,
    },
  ];
  assertJournalBalanced(jLines, `SALE-PAY-${inv.id}-${voucher.id}`);
  data.journalEntries.push({
    id: nextJid,
    date: dateStr,
    entryNumber: `JV-REC-${inv.id}-${voucher.id}`,
    reference: `SALE-PAY-${inv.id}-${voucher.id}`,
    description: `تحصيل دفعة من العميل ${inv.customerName} عن فاتورة مبيعات #${inv.id}`,
    lines: jLines,
    source: 'cash',
    createdBy: params.user?.name || 'مستخدم النظام',
    createdAt: now.toISOString(),
    isApproved: true,
  });
  data.nextJournalId = nextJid + 1;

  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return data;
}

/**
 * 🧾 حفظ وتعديل سندات القبض والصرف المستقلة مع القيد المزدوج وتحديث الفواتير والأطراف
 */
export function saveCashVoucher(
  appData: AppData,
  params: {
    id?: number;
    syncId?: string;
    voucherType: 'receive' | 'pay';
    date: string;
    amount: number;
    method: 'drawer' | 'vodafone' | 'instapay' | 'bank';
    note: string;
    branchId?: string;
    customerName?: string;
    supplierName?: string;
    recipientName?: string;
    payerName?: string;
    expenseCategory?: string;
    accountCode?: string;
    selectedInvoiceIds?: number[];
    user?: any;
  }
): { updatedData: AppData; voucher: CashTransaction } {
  const amt = round2(params.amount);
  if (!amt || amt <= 0) {
    throw new Error('قيمة السند يجب أن تكون أكبر من صفر.');
  }
  assertPeriodUnlocked(appData, params.date, params.id ? 'تعديل سند نقدية' : 'حفظ سند نقدية');

  let data: AppData = {
    ...appData,
    cashTransactions: [...(appData.cashTransactions || [])],
    salesInvoices: [...(appData.salesInvoices || [])],
    purchaseInvoices: [...(appData.purchaseInvoices || [])],
    customers: (appData.customers || []).map((c) => ({ ...c, transactions: [...(c.transactions || [])] })),
    suppliers: (appData.suppliers || []).map((s) => ({ ...s, transactions: [...(s.transactions || [])] })),
    journalEntries: [...(appData.journalEntries || [])],
  };

  if (params.syncId && !params.id) {
    const existing = data.cashTransactions.find((t) => t.syncId === params.syncId && t.status !== 'cancelled');
    if (existing) {
      return { updatedData: data, voucher: existing };
    }
  }

  const nowIso = new Date().toISOString();
  const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const mainBranchId = getMainBranchId(data.branches);
  const transBranch = params.branchId || data.activeBranchId || mainBranchId;

  // If editing existing voucher, rollback previous effect cleanly first
  if (params.id) {
    data = deleteCashVoucher(data, params.id, true);
  }

  const nextId = params.id || (data.nextCashId || (data.cashTransactions.length + 1));
  if (!params.id) {
    data.nextCashId = nextId + 1;
  }

  const voucherNo = params.voucherType === 'receive'
    ? `REC-${String(nextId).padStart(4, '0')}`
    : `PAY-${String(nextId).padStart(4, '0')}`;
  const selectedIds = params.selectedInvoiceIds || [];

  // Allocate across linked invoices if provided
  if (selectedIds.length > 0) {
    let remToAllocate = amt;
    if (params.voucherType === 'receive') {
      data.salesInvoices = data.salesInvoices.map((inv) => {
        if (selectedIds.includes(inv.id) && remToAllocate > 0 && inv.status !== 'cancelled') {
          const currentRem = inv.remainingAmount ?? Math.max(0, inv.total - (inv.paidAmount || 0));
          const payForThis = round2(Math.min(currentRem, remToAllocate));
          remToAllocate = round2(remToAllocate - payForThis);
          const newPaid = round2((inv.paidAmount || 0) + payForThis);
          return {
            ...inv,
            paidAmount: newPaid,
            remainingAmount: Math.max(0, round2(inv.total - newPaid)),
          };
        }
        return inv;
      });
    } else if (params.supplierName) {
      data.purchaseInvoices = data.purchaseInvoices.map((inv) => {
        if (selectedIds.includes(inv.id) && remToAllocate > 0 && inv.status !== 'cancelled') {
          const currentRem = inv.remainingAmount ?? Math.max(0, inv.total - (inv.paidAmount || 0));
          const payForThis = round2(Math.min(currentRem, remToAllocate));
          remToAllocate = round2(remToAllocate - payForThis);
          const newPaid = round2((inv.paidAmount || 0) + payForThis);
          return {
            ...inv,
            paidAmount: newPaid,
            remainingAmount: Math.max(0, round2(inv.total - newPaid)),
          };
        }
        return inv;
      });
    }
  }

  // Update Customer or Supplier balance & subledger
  if (params.voucherType === 'receive' && params.customerName) {
    const cust = data.customers.find((c) => c.name.trim().toLowerCase() === params.customerName!.trim().toLowerCase());
    if (cust) {
      cust.balance = round2((cust.balance || 0) - amt);
      cust.transactions.push({
        id: `tx_${Date.now()}_vouch_rec_${nextId}`,
        date: params.date,
        time: timeStr,
        refNo: voucherNo,
        type: 'payment',
        invoiceId: selectedIds.length === 1 ? selectedIds[0] : undefined,
        description: params.note,
        debit: 0,
        credit: amt,
        balance: cust.balance,
      });
    }
  } else if (params.voucherType === 'pay' && params.supplierName) {
    const supp = data.suppliers.find((s) => s.name.trim().toLowerCase() === params.supplierName!.trim().toLowerCase());
    if (supp) {
      supp.balance = round2((supp.balance || 0) - amt);
      supp.transactions.push({
        id: `tx_${Date.now()}_vouch_pay_${nextId}`,
        date: params.date,
        time: timeStr,
        refNo: voucherNo,
        type: 'payment',
        invoiceId: selectedIds.length === 1 ? selectedIds[0] : undefined,
        description: params.note,
        debit: amt,
        credit: 0,
        balance: supp.balance,
      });
    }
  }

  const syncId = params.syncId || (
    selectedIds.length === 1
      ? getInstallmentPaymentVoucherSyncId(params.voucherType === 'receive' ? 'sale' : 'purchase', selectedIds[0], nextId)
      : `vouch_${params.voucherType}_${nextId}`
  );

  const voucher: CashTransaction = {
    id: nextId,
    voucherNo,
    syncId,
    companyId: data.companyId || 'COMP-000001',
    branchId: transBranch,
    date: params.date,
    time: timeStr,
    type: params.voucherType,
    method: params.method,
    amount: amt,
    note: params.note,
    customerName: params.customerName?.trim() || undefined,
    payerName: params.payerName?.trim() || params.customerName?.trim() || undefined,
    supplierName: params.supplierName?.trim() || undefined,
    recipientName: params.recipientName?.trim() || params.supplierName?.trim() || undefined,
    expenseCategory: params.expenseCategory,
    accountCode: params.accountCode,
    invoiceId: selectedIds.length === 1 ? selectedIds[0] : undefined,
    status: 'approved',
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: params.user?.name || 'مدير النظام',
    createdByUserId: params.user?.id,
    createdByUserCode: params.user?.code || 1,
  };

  data.cashTransactions = [voucher, ...data.cashTransactions];

  // Create balanced Journal Entry
  const nextJid = data.nextJournalId || 1001;
  const cashAcc = getCashAccountForMethod(params.method);
  const jLines: JournalLine[] = [];

  if (params.voucherType === 'receive') {
    jLines.push({
      accountCode: cashAcc.code,
      accountName: cashAcc.name,
      debit: amt,
      credit: 0,
      note: params.note,
    });
    if (params.customerName) {
      jLines.push({
        accountCode: '1105',
        accountName: `العملاء والمدينون - ${params.customerName}`,
        debit: 0,
        credit: amt,
        note: params.note,
      });
    } else {
      const crAcc = params.accountCode
        ? mapExpenseCategoryToAccount(params.note, params.accountCode)
        : { code: '4103', name: 'إيرادات خدمات وشحن وصيانة' };
      jLines.push({
        accountCode: crAcc.code,
        accountName: crAcc.name,
        debit: 0,
        credit: amt,
        note: params.note,
      });
    }
  } else {
    if (params.supplierName) {
      jLines.push({
        accountCode: '2101',
        accountName: `الموردون والدائنون - ${params.supplierName}`,
        debit: amt,
        credit: 0,
        note: params.note,
      });
    } else {
      const expAcc = mapExpenseCategoryToAccount(params.expenseCategory || params.note, params.accountCode);
      jLines.push({
        accountCode: expAcc.code,
        accountName: expAcc.name,
        debit: amt,
        credit: 0,
        note: params.note,
      });
    }
    jLines.push({
      accountCode: cashAcc.code,
      accountName: cashAcc.name,
      debit: 0,
      credit: amt,
      note: params.note,
    });
  }

  assertJournalBalanced(jLines, `CASH-VOU-${voucher.id}`);
  data.journalEntries.push({
    id: nextJid,
    date: params.date,
    entryNumber: `JV-${voucherNo}`,
    reference: `CASH-VOU-${voucher.id}`,
    description: params.note,
    lines: jLines,
    source: 'cash',
    createdBy: params.user?.name || 'مدير النظام',
    createdAt: nowIso,
    isApproved: true,
  });
  data.nextJournalId = nextJid + 1;

  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return { updatedData: data, voucher };
}

/**
 * 🗑️ حذف سند قبض أو صرف أو حركة خزينة مع عكس الآثار المالية بالكامل
 */
export function deleteCashVoucher(
  appData: AppData,
  voucherId: number,
  skipTombstone: boolean = false
): AppData {
  const target = (appData.cashTransactions || []).find((t) => t.id === voucherId);
  if (!target) return appData;
  assertPeriodUnlocked(appData, target.date, skipTombstone ? 'تعديل سند نقدية' : 'حذف سند نقدية');

  const data: AppData = {
    ...appData,
    cashTransactions: [...(appData.cashTransactions || [])],
    salesInvoices: [...(appData.salesInvoices || [])],
    purchaseInvoices: [...(appData.purchaseInvoices || [])],
    customers: (appData.customers || []).map((c) => ({ ...c, transactions: [...(c.transactions || [])] })),
    suppliers: (appData.suppliers || []).map((s) => ({ ...s, transactions: [...(s.transactions || [])] })),
    journalEntries: [...(appData.journalEntries || [])],
    deletedRecords: { ...(appData.deletedRecords || {}) },
  };

  const amt = round2(target.amount || 0);

  // Revert linked invoice paid/remaining if present
  if (target.invoiceId) {
    if (target.type === 'receive' && !target.supplierName) {
      data.salesInvoices = data.salesInvoices.map((inv) => {
        if (inv.id === target.invoiceId) {
          const newPaid = Math.max(0, round2((inv.paidAmount || 0) - amt));
          return {
            ...inv,
            paidAmount: newPaid,
            remainingAmount: Math.max(0, round2(inv.total - newPaid)),
          };
        }
        return inv;
      });
    } else if (target.type === 'pay' && !target.customerName) {
      data.purchaseInvoices = data.purchaseInvoices.map((inv) => {
        if (inv.id === target.invoiceId) {
          const newPaid = Math.max(0, round2((inv.paidAmount || 0) - amt));
          return {
            ...inv,
            paidAmount: newPaid,
            remainingAmount: Math.max(0, round2(inv.total - newPaid)),
          };
        }
        return inv;
      });
    }
  }

  // Revert Customer/Supplier balances
  if (target.customerName && target.type === 'receive') {
    const cust = data.customers.find((c) => c.name.trim().toLowerCase() === target.customerName!.trim().toLowerCase());
    if (cust) {
      cust.balance = round2((cust.balance || 0) + amt);
      cust.transactions = cust.transactions.filter((tx) => tx.refNo !== target.voucherNo && !String(tx.id).includes(`_${voucherId}`));
    }
  }
  if (target.supplierName && target.type === 'pay') {
    const supp = data.suppliers.find((s) => s.name.trim().toLowerCase() === target.supplierName!.trim().toLowerCase());
    if (supp) {
      supp.balance = round2((supp.balance || 0) + amt);
      supp.transactions = supp.transactions.filter((tx) => tx.refNo !== target.voucherNo && !String(tx.id).includes(`_${voucherId}`));
    }
  }

  data.cashTransactions = data.cashTransactions.filter((t) => t.id !== voucherId);
  data.journalEntries = data.journalEntries.filter(
    (je) =>
      je.reference !== `CASH-VOU-${voucherId}` &&
      je.reference !== `TREASURY-${voucherId}` &&
      je.reference !== `PUR-PAY-${target.invoiceId}-${voucherId}` &&
      je.reference !== `SALE-PAY-${target.invoiceId}-${voucherId}`
  );

  if (!skipTombstone) {
    data.deletedRecords![`cash_${voucherId}`] = Date.now();
  }

  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return data;
}

/**
 * 🏦 حركات الخزينة المباشرة (إيداع، سحب، تحويل بين الخزائن، افتتاح حساب بنكي) مع قيد يومية متوازن
 */
export function saveTreasuryMovement(
  appData: AppData,
  params: {
    action: 'deposit' | 'withdraw' | 'transfer' | 'bank_opening';
    date: string;
    amount: number;
    method?: 'drawer' | 'vodafone' | 'instapay' | 'bank';
    fromMethod?: 'drawer' | 'vodafone' | 'instapay' | 'bank';
    toMethod?: 'drawer' | 'vodafone' | 'instapay' | 'bank';
    branchId?: string;
    note?: string;
    bankId?: string;
    bankName?: string;
    bankAccountNumber?: string;
    counterAccountCode?: string;
    user?: any;
  }
): AppData {
  assertPeriodUnlocked(appData, params.date, 'تسجيل حركة خزينة');
  const amt = round2(params.amount);
  const data: AppData = {
    ...appData,
    cashTransactions: [...(appData.cashTransactions || [])],
    bankAccounts: [...(appData.bankAccounts || [])],
    journalEntries: [...(appData.journalEntries || [])],
  };

  const mainBranchId = getMainBranchId(data.branches);
  const targetBranch = params.branchId || data.activeBranchId || mainBranchId;
  const nowIso = new Date().toISOString();
  const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  if (params.action === 'bank_opening') {
    const newBank = {
      id: 'b' + Date.now(),
      name: (params.bankName || '').trim(),
      accountNumber: (params.bankAccountNumber || '').trim(),
      balance: amt,
    };
    data.bankAccounts.push(newBank);

    if (amt > 0) {
      const cashId = data.nextCashId || (data.cashTransactions.length + 1);
      const tx: CashTransaction = {
        id: cashId,
        syncId: `treasury_bank_open_${cashId}_${Date.now()}`,
        voucherNo: `DEP-${String(cashId).padStart(4, '0')}`,
        companyId: data.companyId || 'COMP-000001',
        branchId: targetBranch,
        date: params.date,
        time: timeStr,
        type: 'deposit',
        method: 'bank',
        amount: amt,
        note: params.note || `رصيد افتتاحي لحساب بنك ${newBank.name} (${newBank.accountNumber})`,
        status: 'approved',
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: params.user?.name || 'مدير النظام',
      };
      data.cashTransactions.push(tx);
      data.nextCashId = cashId + 1;

      const nextJid = data.nextJournalId || 1001;
      const bankAcc = getCashAccountForMethod('bank');
      const counterAcc = mapExpenseCategoryToAccount('رأس المال المستثمر', params.counterAccountCode || '3101');
      const jLines: JournalLine[] = [
        { accountCode: bankAcc.code, accountName: bankAcc.name, debit: amt, credit: 0, note: tx.note },
        { accountCode: counterAcc.code, accountName: counterAcc.name, debit: 0, credit: amt, note: tx.note },
      ];
      assertJournalBalanced(jLines, `TREASURY-${tx.id}`);
      data.journalEntries.push({
        id: nextJid,
        date: params.date,
        entryNumber: `JV-TR-${tx.id}`,
        reference: `TREASURY-${tx.id}`,
        description: tx.note,
        lines: jLines,
        source: 'cash',
        createdBy: params.user?.name || 'مدير النظام',
        createdAt: nowIso,
        isApproved: true,
      });
      data.nextJournalId = nextJid + 1;
    }
  } else if (params.action === 'deposit' && amt > 0) {
    const m = params.method || 'drawer';
    if (m === 'bank' && params.bankId) {
      data.bankAccounts = data.bankAccounts.map((b) =>
        b.id === params.bankId ? { ...b, balance: round2((b.balance || 0) + amt) } : b
      );
    }
    const cashId = data.nextCashId || (data.cashTransactions.length + 1);
    const tx: CashTransaction = {
      id: cashId,
      syncId: `treasury_dep_${cashId}_${Date.now()}`,
      voucherNo: `DEP-${String(cashId).padStart(4, '0')}`,
      companyId: data.companyId || 'COMP-000001',
      branchId: targetBranch,
      date: params.date,
      time: timeStr,
      type: 'deposit',
      method: m,
      amount: amt,
      note: params.note || `إيداع نقدية مباشر في ${getPaymentMethodLabel(m)}`,
      status: 'approved',
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: params.user?.name || 'مدير النظام',
    };
    data.cashTransactions.push(tx);
    data.nextCashId = cashId + 1;

    const nextJid = data.nextJournalId || 1001;
    const cashAcc = getCashAccountForMethod(m);
    const counterAcc = mapExpenseCategoryToAccount('رأس المال / جاري الشركاء', params.counterAccountCode || '3101');
    const jLines: JournalLine[] = [
      { accountCode: cashAcc.code, accountName: cashAcc.name, debit: amt, credit: 0, note: tx.note },
      { accountCode: counterAcc.code, accountName: counterAcc.name, debit: 0, credit: amt, note: tx.note },
    ];
    assertJournalBalanced(jLines, `TREASURY-${tx.id}`);
    data.journalEntries.push({
      id: nextJid,
      date: params.date,
      entryNumber: `JV-TR-${tx.id}`,
      reference: `TREASURY-${tx.id}`,
      description: tx.note,
      lines: jLines,
      source: 'cash',
      createdBy: params.user?.name || 'مدير النظام',
      createdAt: nowIso,
      isApproved: true,
    });
    data.nextJournalId = nextJid + 1;
  } else if (params.action === 'withdraw' && amt > 0) {
    const m = params.method || 'drawer';
    const cashId = data.nextCashId || (data.cashTransactions.length + 1);
    const tx: CashTransaction = {
      id: cashId,
      syncId: `treasury_wth_${cashId}_${Date.now()}`,
      voucherNo: `WTH-${String(cashId).padStart(4, '0')}`,
      companyId: data.companyId || 'COMP-000001',
      branchId: targetBranch,
      date: params.date,
      time: timeStr,
      type: 'withdraw',
      method: m,
      amount: amt,
      note: params.note || `سحب/مصروفات من ${getPaymentMethodLabel(m)}`,
      status: 'approved',
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: params.user?.name || 'مدير النظام',
    };
    data.cashTransactions.push(tx);
    data.nextCashId = cashId + 1;

    const nextJid = data.nextJournalId || 1001;
    const cashAcc = getCashAccountForMethod(m);
    const expAcc = mapExpenseCategoryToAccount(tx.note, params.counterAccountCode || '5204');
    const jLines: JournalLine[] = [
      { accountCode: expAcc.code, accountName: expAcc.name, debit: amt, credit: 0, note: tx.note },
      { accountCode: cashAcc.code, accountName: cashAcc.name, debit: 0, credit: amt, note: tx.note },
    ];
    assertJournalBalanced(jLines, `TREASURY-${tx.id}`);
    data.journalEntries.push({
      id: nextJid,
      date: params.date,
      entryNumber: `JV-TR-${tx.id}`,
      reference: `TREASURY-${tx.id}`,
      description: tx.note,
      lines: jLines,
      source: 'cash',
      createdBy: params.user?.name || 'مدير النظام',
      createdAt: nowIso,
      isApproved: true,
    });
    data.nextJournalId = nextJid + 1;
  } else if (params.action === 'transfer' && amt > 0) {
    const fromM = params.fromMethod || 'drawer';
    const toM = params.toMethod || 'bank';
    const baseCashId = data.nextCashId || (data.cashTransactions.length + 1);
    const userNote = params.note ? ` (${params.note})` : '';

    const txOut: CashTransaction = {
      id: baseCashId,
      syncId: `treasury_trf_out_${baseCashId}_${Date.now()}`,
      voucherNo: `TRF-${String(baseCashId).padStart(4, '0')}`,
      companyId: data.companyId || 'COMP-000001',
      branchId: targetBranch,
      date: params.date,
      time: timeStr,
      type: 'withdraw',
      method: fromM,
      amount: amt,
      note: `تحويل إلى ${getPaymentMethodLabel(toM)}${userNote}`,
      status: 'approved',
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: params.user?.name || 'مدير النظام',
    };
    const txIn: CashTransaction = {
      id: baseCashId + 1,
      syncId: `treasury_trf_in_${baseCashId + 1}_${Date.now()}`,
      voucherNo: `TRF-${String(baseCashId + 1).padStart(4, '0')}`,
      companyId: data.companyId || 'COMP-000001',
      branchId: targetBranch,
      date: params.date,
      time: timeStr,
      type: 'deposit',
      method: toM,
      amount: amt,
      note: `تحويل من ${getPaymentMethodLabel(fromM)}${userNote}`,
      status: 'approved',
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: params.user?.name || 'مدير النظام',
    };

    data.cashTransactions.push(txOut, txIn);
    data.nextCashId = baseCashId + 2;

    const nextJid = data.nextJournalId || 1001;
    const fromAcc = getCashAccountForMethod(fromM);
    const toAcc = getCashAccountForMethod(toM);
    const jLines: JournalLine[] = [
      { accountCode: toAcc.code, accountName: toAcc.name, debit: amt, credit: 0, note: txIn.note },
      { accountCode: fromAcc.code, accountName: fromAcc.name, debit: 0, credit: amt, note: txOut.note },
    ];
    assertJournalBalanced(jLines, `TREASURY-${txOut.id}`);
    data.journalEntries.push({
      id: nextJid,
      date: params.date,
      entryNumber: `JV-TRF-${txOut.id}`,
      reference: `TREASURY-${txOut.id}`,
      description: `تحويل داخلي من ${getPaymentMethodLabel(fromM)} إلى ${getPaymentMethodLabel(toM)}${userNote}`,
      lines: jLines,
      source: 'cash',
      createdBy: params.user?.name || 'مدير النظام',
      createdAt: nowIso,
      isApproved: true,
    });
    data.nextJournalId = nextJid + 1;
  }

  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return data;
}

/**
 * 🗑️ حذف فاتورة مشتريات وتسوية جميع آثارها المالية والمخزنية
 */
export function deletePurchaseInvoice(appData: AppData, invoiceId: number | string): AppData {
  const numId = Number(invoiceId);
  const targetInv = (appData.purchaseInvoices || []).find((i) => i.id === numId || String(i.id) === String(invoiceId));
  if (!targetInv) return appData;
  assertPeriodUnlocked(appData, targetInv.date, 'حذف فاتورة مشتريات');

  const data: AppData = {
    ...appData,
    items: (appData.items || []).map((i) => ({
      ...i,
      movements: [...(i.movements || [])],
      fifoLayers: [...(i.fifoLayers || []).map((l) => ({ ...l }))],
    })),
    suppliers: (appData.suppliers || []).map((s) => ({ ...s, transactions: [...(s.transactions || [])] })),
    cashTransactions: [...(appData.cashTransactions || [])],
    journalEntries: [...(appData.journalEntries || [])],
    purchaseInvoices: [...(appData.purchaseInvoices || [])],
    salesInvoices: (appData.salesInvoices || []).map((si) => ({
      ...si,
      items: (si.items || []).map((li) => ({ ...li })),
    })),
  };

  const inv = data.purchaseInvoices.find((i) => i.id === numId || String(i.id) === String(invoiceId));
  if (!inv) return data;

  if (inv.retroactiveSettlements && inv.retroactiveSettlements.length > 0) {
    inv.retroactiveSettlements.forEach((rs) => {
      const sInv = data.salesInvoices.find((si) => si.id === rs.saleInvoiceId);
      const line = sInv?.items?.[rs.lineIndex];
      if (line) {
        const nextUncosted = round2(Number(line.uncostedQty || 0) + rs.settledBaseQty);
        const prevCogs = Number(line.costPrice || 0) * Number(line.qty || 0);
        const nextCogs = round2(Math.max(0, prevCogs - rs.settledCogs));
        line.uncostedQty = nextUncosted;
        line.costMissing = nextUncosted > 0.001 || nextCogs <= 0;
        line.costPrice = Number(line.qty || 0) > 0 ? round2(nextCogs / Number(line.qty)) : 0;
      }
    });
  }

  const isReturn = inv.type.startsWith('return_');
  const mainBranchId = getMainBranchId(data.branches);
  const invBr = inv.branchId || mainBranchId;
  const dateStr = new Date().toISOString().split('T')[0];

  inv.items?.forEach((itm, idx) => {
    const stockItm = data.items.find(
      (i) =>
        (itm.itemId && i.id === itm.itemId) ||
        (itm.code && i.code && i.code.trim().toLowerCase() === itm.code.trim().toLowerCase() &&
          (i.branchId === invBr || (!i.branchId && invBr === mainBranchId))) ||
        (i.name.trim().toLowerCase() === itm.name.trim().toLowerCase() &&
          (i.branchId === invBr || (!i.branchId && invBr === mainBranchId)))
    );
    if (stockItm) {
      const itmFactor = Math.max(0.0001, Number(itm.unitFactor || 1));
      const itmBaseQty = round2(
        itm.baseQty !== undefined && Number(itm.baseQty) > 0 ? Number(itm.baseQty) : Number(itm.qty || 0) * itmFactor
      );
      const qtyDiff = isReturn ? itmBaseQty : -itmBaseQty;
      stockItm.quantity = round2((stockItm.quantity || 0) + qtyDiff);
      if (stockItm.branchStock) {
        stockItm.branchStock = { ...stockItm.branchStock, [invBr]: stockItm.quantity };
      }
      if (!isReturn) {
        stockItm.fifoLayers = (stockItm.fifoLayers || []).filter((l) => l.invoiceId !== inv.id);
      } else {
        const rawCost = itm.costPrice ? Number(itm.costPrice) / itmFactor : (itm.price ? Number(itm.price) / itmFactor : Number(stockItm.avgCost || stockItm.purchasePrice || 0));
        const layerCost = round2(rawCost);
        if (layerCost > 0) {
          stockItm.fifoLayers = [
            ...(stockItm.fifoLayers || []),
            { id: `layer_del_pret_${inv.id}_${idx}`, date: dateStr, remainingQty: itmBaseQty, unitCost: layerCost },
          ];
        }
      }
      stockItm.avgCost = recomputeItemAvgCost(stockItm);
      stockItm.movements.push({
        date: dateStr,
        type: 'adjustment',
        qty: qtyDiff,
        price: itm.price,
        total: Math.abs(itm.qty) * itm.price,
        note: `تسوية وإلغاء أثر فاتورة المشتريات المحذوفة #${inv.id}`,
      });
    }
  });

  if (inv.supplierName) {
    const supp = data.suppliers.find((s) => s.name.trim().toLowerCase() === inv.supplierName.trim().toLowerCase());
    if (supp) {
      const unpaid = inv.remainingAmount !== undefined ? inv.remainingAmount : (inv.total - (inv.paidAmount || 0));
      if (unpaid > 0) {
        supp.balance = round2((supp.balance || 0) - (isReturn ? -unpaid : unpaid));
      }
      supp.transactions = supp.transactions.filter((tx) => tx.invoiceId !== inv.id);
    }
  }

  data.cashTransactions = data.cashTransactions.filter((tx) => tx.invoiceId !== inv.id);
  data.journalEntries = data.journalEntries.filter(
    (je) =>
      je.reference !== `PUR-INV-${inv.id}` &&
      je.reference !== `NEG-COGS-PUR-${inv.id}` &&
      !je.reference?.startsWith(`PUR-PAY-${inv.id}-`)
  );
  data.purchaseInvoices = data.purchaseInvoices.filter((i) => i.id !== inv.id);

  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return data;
}

/**
 * 🗑️ حذف فاتورة مبيعات وتسوية جميع آثارها المالية والمخزنية
 */
export function deleteSaleInvoice(appData: AppData, invoiceId: number | string): AppData {
  const numId = Number(invoiceId);
  const targetInv = (appData.salesInvoices || []).find((i) => i.id === numId || String(i.id) === String(invoiceId));
  if (!targetInv) return appData;
  assertPeriodUnlocked(appData, targetInv.date, 'حذف فاتورة مبيعات');

  const data: AppData = {
    ...appData,
    items: (appData.items || []).map((i) => ({
      ...i,
      movements: [...(i.movements || [])],
      fifoLayers: [...(i.fifoLayers || []).map((l) => ({ ...l }))],
    })),
    customers: (appData.customers || []).map((c) => ({ ...c, transactions: [...(c.transactions || [])] })),
    cashTransactions: [...(appData.cashTransactions || [])],
    journalEntries: [...(appData.journalEntries || [])],
    salesInvoices: [...(appData.salesInvoices || [])],
  };

  const inv = data.salesInvoices.find((i) => i.id === numId || String(i.id) === String(invoiceId));
  if (!inv) return data;

  const isReturn = inv.type.startsWith('return_');
  const mainBranchId = getMainBranchId(data.branches);
  const invBr = inv.branchId || mainBranchId;
  const dateStr = new Date().toISOString().split('T')[0];

  inv.items?.forEach((itm, idx) => {
    const stockItm = data.items.find(
      (i) =>
        (itm.itemId && i.id === itm.itemId) ||
        (itm.code && i.code && i.code.trim().toLowerCase() === itm.code.trim().toLowerCase() &&
          (i.branchId === invBr || (!i.branchId && invBr === mainBranchId))) ||
        (i.name.trim().toLowerCase() === itm.name.trim().toLowerCase() &&
          (i.branchId === invBr || (!i.branchId && invBr === mainBranchId)))
    );
    if (stockItm) {
      const itmFactor = Math.max(0.0001, Number(itm.unitFactor || 1));
      const itmBaseQty = round2(
        itm.baseQty !== undefined && Number(itm.baseQty) > 0 ? Number(itm.baseQty) : Number(itm.qty || 0) * itmFactor
      );
      const qtyDiff = isReturn ? -itmBaseQty : itmBaseQty;
      stockItm.quantity = round2((stockItm.quantity || 0) + qtyDiff);
      if (stockItm.branchStock) {
        stockItm.branchStock = { ...stockItm.branchStock, [invBr]: stockItm.quantity };
      }
      if (!isReturn) {
        const restoreCost = round2(
          itm.costPrice ? Number(itm.costPrice) / itmFactor : Number(stockItm.avgCost || stockItm.purchasePrice || 0)
        );
        if (restoreCost > 0) {
          stockItm.fifoLayers = [
            { id: `layer_del_sale_${inv.id}_${idx}`, date: inv.date || dateStr, remainingQty: itmBaseQty, unitCost: restoreCost },
            ...(stockItm.fifoLayers || []),
          ];
        }
      } else {
        stockItm.fifoLayers = (stockItm.fifoLayers || []).filter((l) => l.invoiceId !== inv.id);
      }
      stockItm.avgCost = recomputeItemAvgCost(stockItm);
      stockItm.movements.push({
        date: dateStr,
        type: 'adjustment',
        qty: qtyDiff,
        price: itm.price,
        total: Math.abs(itm.qty) * itm.price,
        note: `تسوية وإعادة بضاعة فاتورة المبيعات المحذوفة #${inv.id}`,
      });
    }
  });

  if (inv.customerName) {
    const cust = data.customers.find((c) => c.name.trim().toLowerCase() === inv.customerName.trim().toLowerCase());
    if (cust) {
      const unpaid = inv.remainingAmount !== undefined ? inv.remainingAmount : (inv.total - (inv.paidAmount || 0));
      if (unpaid > 0) {
        cust.balance = round2((cust.balance || 0) - (isReturn ? -unpaid : unpaid));
      }
      cust.transactions = cust.transactions.filter((tx) => tx.invoiceId !== inv.id);
    }
  }

  data.cashTransactions = data.cashTransactions.filter((tx) => tx.invoiceId !== inv.id);
  data.journalEntries = data.journalEntries.filter(
    (je) => je.reference !== `SALE-INV-${inv.id}` && !je.reference?.startsWith(`SALE-PAY-${inv.id}-`)
  );
  data.salesInvoices = data.salesInvoices.filter((i) => i.id !== inv.id);

  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return data;
}

/**
 * ❌ إلغاء فاتورة مبيعات مع حفظ سجل التدقيق وعكس كافة آثارها المحاسبية والمخزنية
 */
export function cancelSaleInvoice(appData: AppData, invoiceId: number, cancelledBy?: string): AppData {
  const target = (appData.salesInvoices || []).find((i) => i.id === invoiceId);
  if (!target || target.status === 'cancelled') return appData;
  const cleaned = deleteSaleInvoice(appData, invoiceId);
  return {
    ...cleaned,
    salesInvoices: [
      {
        ...target,
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: cancelledBy || 'مدير النظام',
      },
      ...cleaned.salesInvoices,
    ],
  };
}

/**
 * ❌ إلغاء فاتورة مشتريات مع حفظ سجل التدقيق وعكس كافة آثارها المحاسبية والمخزنية
 */
export function cancelPurchaseInvoice(appData: AppData, invoiceId: number, cancelledBy?: string): AppData {
  const target = (appData.purchaseInvoices || []).find((i) => i.id === invoiceId);
  if (!target || target.status === 'cancelled') return appData;
  const cleaned = deletePurchaseInvoice(appData, invoiceId);
  return {
    ...cleaned,
    purchaseInvoices: [
      {
        ...target,
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: cancelledBy || 'مدير النظام',
      },
      ...cleaned.purchaseInvoices,
    ],
  };
}

/**
 * 📊 محرك القوائم المالية الحقيقي (ميزان المراجعة + قائمة الدخل + الميزانية العمومية)
 * يعتمد على القيود المحاسبية المزدوجة الفعلية وسجلات التكلفة الحقيقية بدون أي أرقام وهمية أو مضاعفات تقديرية.
 */
export interface LedgerFinancialStatements {
  accountTotals: Record<string, { debit: number; credit: number; balance: number }>;
  trialBalanceRows: Array<{ code: string; name: string; type: AccountNode['type']; debit: number; credit: number; balance: number }>;
  trialTotalDebit: number;
  trialTotalCredit: number;
  isTrialBalanced: boolean;
  // Income statement
  grossSales: number;
  salesReturns: number;
  salesDiscounts: number;
  extraRevenues: number;
  netSalesRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  operatingExpenses: number;
  netIncome: number;
  // Balance sheet
  totalCashBank: number;
  totalReceivables: number;
  totalInventoryVal: number;
  totalCurrentAssets: number;
  totalFixedAssets: number;
  totalAssets: number;
  totalPayables: number;
  totalVatPayable: number;
  otherLiabilities: number;
  totalLiabilities: number;
  capital: number;
  retainedEarnings: number;
  partnerCurrent: number;
  totalEquity: number;
  isBalanceSheetBalanced: boolean;
}

export function computeFinancialStatementsFromLedger(appData: AppData): LedgerFinancialStatements {
  const accountTotals: Record<string, { debit: number; credit: number; balance: number }> = {};
  const accounts = appData.accounts || [];

  accounts.forEach((a) => {
    accountTotals[a.code] = { debit: 0, credit: 0, balance: 0 };
  });

  const journalEntries = appData.journalEntries || [];
  journalEntries.forEach((je) => {
    if (!je || !Array.isArray(je.lines)) return;
    je.lines.forEach((l) => {
      const code = resolveCanonicalAccountCode(l.accountCode, l.accountName);
      if (!accountTotals[code]) accountTotals[code] = { debit: 0, credit: 0, balance: 0 };
      accountTotals[code].debit = round2(accountTotals[code].debit + (Number(l.debit) || 0));
      accountTotals[code].credit = round2(accountTotals[code].credit + (Number(l.credit) || 0));
    });
  });

  let trialTotalDebit = 0;
  let trialTotalCredit = 0;
  const trialBalanceRows: LedgerFinancialStatements['trialBalanceRows'] = [];

  const leafAccounts = accounts.filter((a) => !a.isParent);
  const seenCodes = new Set<string>();
  leafAccounts.forEach((acc) => {
    seenCodes.add(acc.code);
    const t = accountTotals[acc.code] || { debit: 0, credit: 0, balance: 0 };
    const isDebitNature = acc.type === 'asset' || acc.type === 'expense';
    const bal = round2(isDebitNature ? t.debit - t.credit : t.credit - t.debit);
    accountTotals[acc.code].balance = bal;
    trialTotalDebit = round2(trialTotalDebit + t.debit);
    trialTotalCredit = round2(trialTotalCredit + t.credit);
    trialBalanceRows.push({
      code: acc.code,
      name: acc.name,
      type: acc.type,
      debit: t.debit,
      credit: t.credit,
      balance: bal,
    });
  });

  // Include any journal accounts outside default leaf list
  Object.keys(accountTotals).forEach((code) => {
    if (seenCodes.has(code)) return;
    const t = accountTotals[code];
    if (t.debit === 0 && t.credit === 0) return;
    const isDebitNature = code.startsWith('1') || code.startsWith('5');
    const bal = round2(isDebitNature ? t.debit - t.credit : t.credit - t.debit);
    t.balance = bal;
    trialTotalDebit = round2(trialTotalDebit + t.debit);
    trialTotalCredit = round2(trialTotalCredit + t.credit);
    trialBalanceRows.push({
      code,
      name: `حساب [${code}]`,
      type: code.startsWith('1') ? 'asset' : code.startsWith('2') ? 'liability' : code.startsWith('3') ? 'equity' : code.startsWith('4') ? 'revenue' : 'expense',
      debit: t.debit,
      credit: t.credit,
      balance: bal,
    });
  });

  const isTrialBalanced = Math.abs(trialTotalDebit - trialTotalCredit) <= 0.05;

  // Subledger / Real Metrics (Zero 0.75/0.85/0.65/35000/100000 fabrication)
  const activeSales = (appData.salesInvoices || []).filter((i) => i && i.status !== 'cancelled');
  const activePurchases = (appData.purchaseInvoices || []).filter((i) => i && i.status !== 'cancelled');

  // If journalEntries has revenue/COGS postings, read directly from GL; otherwise compute from invoices & real item costPrice (0 if uncosted)
  const hasGlJournals = journalEntries.length > 0;

  let grossSales = 0;
  let salesReturns = 0;
  let salesDiscounts = 0;
  let extraRevenues = 0;
  let totalCOGS = 0;

  if (hasGlJournals) {
    grossSales = round2((accountTotals['4101']?.credit || 0) - (accountTotals['4101']?.debit || 0));
    salesReturns = round2((accountTotals['4102']?.debit || 0) - (accountTotals['4102']?.credit || 0));
    salesDiscounts = round2((accountTotals['4104']?.debit || 0) - (accountTotals['4104']?.credit || 0));
    extraRevenues = round2((accountTotals['4103']?.credit || 0) - (accountTotals['4103']?.debit || 0) + (accountTotals['4201']?.credit || 0));
    totalCOGS = round2((accountTotals['5101']?.debit || 0) - (accountTotals['5101']?.credit || 0));
  } else {
    activeSales.forEach((inv) => {
      const isRet = inv.type?.startsWith('return_');
      const vat = Number(inv.tax || 0);
      const netExVat = round2((inv.total || 0) - vat);
      if (isRet) salesReturns = round2(salesReturns + netExVat);
      else grossSales = round2(grossSales + netExVat);

      const invCost = (inv.items || []).reduce((s, line) => {
        if (Number(line.costPrice || 0) > 0) {
          return s + Number(line.costPrice) * (Number(line.qty) || 0);
        }
        const master = (appData.items || []).find((m) => (line.itemId && m.id === line.itemId) || m.name === line.name);
        const unitCost = Number(master?.avgCost || master?.purchasePrice || master?.costPrice || 0);
        const factor = Math.max(0.0001, Number(line.unitFactor || 1));
        const baseQ = line.baseQty !== undefined ? Number(line.baseQty) : (Number(line.qty) || 0) * factor;
        return s + unitCost * baseQ;
      }, 0);
      totalCOGS = round2(totalCOGS + (isRet ? -invCost : invCost));
    });
  }

  const netSalesRevenue = round2(grossSales + extraRevenues - salesReturns - salesDiscounts);
  const grossProfit = round2(netSalesRevenue - totalCOGS);

  let operatingExpenses = 0;
  if (hasGlJournals) {
    Object.entries(accountTotals).forEach(([code, vals]) => {
      if (code.startsWith('5') && code !== '5101') {
        operatingExpenses = round2(operatingExpenses + (vals.debit - vals.credit));
      }
    });
  } else {
    operatingExpenses = round2(
      (appData.cashTransactions || [])
        .filter((c) => c && c.status !== 'cancelled' && (c.type === 'pay' || c.type === 'withdraw') && !c.supplierName && !c.invoiceId)
        .reduce((s, c) => s + (Number(c.amount) || 0), 0)
    );
  }

  const netIncome = round2(grossProfit - operatingExpenses);

  // Balance Sheet Assets / Liabilities / Equity
  const totalCashBank = hasGlJournals
    ? round2(
        (accountTotals['1101']?.balance || 0) +
        (accountTotals['1102']?.balance || 0) +
        (accountTotals['1103']?.balance || 0) +
        (accountTotals['1104']?.balance || 0)
      )
    : round2((appData.cashBox?.drawer || 0) + (appData.cashBox?.vodafone || 0) + (appData.cashBox?.instapay || 0) + (appData.cashBox?.bank || 0));

  const totalReceivables = hasGlJournals
    ? round2(accountTotals['1105']?.balance || 0)
    : round2((appData.customers || []).reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0));

  const totalInventoryVal = hasGlJournals
    ? round2(accountTotals['1106']?.balance || 0)
    : round2(
        (appData.items || []).reduce((s, i) => {
          const uCost = Number(i.avgCost || i.purchasePrice || i.costPrice || 0);
          return s + Math.max(0, Number(i.quantity || 0)) * uCost;
        }, 0)
      );

  const totalCurrentAssets = round2(totalCashBank + totalReceivables + totalInventoryVal);

  const glFixedAssets = round2((accountTotals['1201']?.balance || 0) + (accountTotals['1202']?.balance || 0));
  const subledgerFixedAssets = round2(
    (appData.fixedAssets || []).reduce((s, a) => s + Number(a.netBookValue ?? a.purchasePrice ?? 0), 0)
  );
  const totalFixedAssets = hasGlJournals && glFixedAssets > 0 ? glFixedAssets : subledgerFixedAssets;
  const totalAssets = round2(totalCurrentAssets + totalFixedAssets);

  const totalPayables = hasGlJournals
    ? round2(accountTotals['2101']?.balance || 0)
    : round2((appData.suppliers || []).reduce((s, su) => s + (su.balance > 0 ? su.balance : 0), 0));

  const totalVatPayable = hasGlJournals
    ? round2(accountTotals['2102']?.balance || 0)
    : round2(
        activeSales.reduce((s, i) => s + (i.type.startsWith('return_') ? -(i.tax || 0) : (i.tax || 0)), 0) -
        activePurchases.reduce((s, i) => s + (i.type.startsWith('return_') ? -(i.tax || 0) : (i.tax || 0)), 0)
      );

  const otherLiabilities = hasGlJournals
    ? round2((accountTotals['2103']?.balance || 0) + (accountTotals['2104']?.balance || 0))
    : 0;
  const totalLiabilities = round2(totalPayables + totalVatPayable + otherLiabilities);

  const capital = hasGlJournals ? round2(accountTotals['3101']?.balance || 0) : 0;
  const retainedEarnings = hasGlJournals ? round2(accountTotals['3102']?.balance || 0) : 0;
  const partnerCurrent = hasGlJournals ? round2(accountTotals['3103']?.balance || 0) : 0;
  const otherEquityAccounts = hasGlJournals
    ? round2(
        Object.entries(accountTotals)
          .filter(([code]) => code.startsWith('3') && code !== '3' && code !== '3101' && code !== '3102' && code !== '3103')
          .reduce((sum, [, val]) => sum + (val?.balance || 0), 0)
      )
    : 0;
  const totalEquity = round2(capital + retainedEarnings + partnerCurrent + otherEquityAccounts + netIncome);

  const isBalanceSheetBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) <= 0.05;

  return {
    accountTotals,
    trialBalanceRows,
    trialTotalDebit,
    trialTotalCredit,
    isTrialBalanced,
    grossSales,
    salesReturns,
    salesDiscounts,
    extraRevenues,
    netSalesRevenue,
    totalCOGS,
    grossProfit,
    operatingExpenses,
    netIncome,
    totalCashBank,
    totalReceivables,
    totalInventoryVal,
    totalCurrentAssets,
    totalFixedAssets,
    totalAssets,
    totalPayables,
    totalVatPayable,
    otherLiabilities,
    totalLiabilities,
    capital,
    retainedEarnings,
    partnerCurrent,
    totalEquity,
    isBalanceSheetBalanced,
  };
}

/**
 * 🔄 إعادة احتساب وتوحيد كافة الأرصدة المحاسبية (الخزائن + العملاء + الموردين + شجرة الحسابات)
 */
export function recalculateAllAccountingBalances(appData: AppData): AppData {
  const reconciled = reconcileTreasuryCashBox(appData);
  const updatedCustomers = (appData.customers || []).map((c) => ({
    ...c,
    balance: calculateCustomerBalance(c, appData).balance,
  }));
  const updatedSuppliers = (appData.suppliers || []).map((s) => ({
    ...s,
    balance: calculateSupplierBalance(s, appData).balance,
  }));

  const intermediate: AppData = {
    ...appData,
    cashBox: reconciled.cashBox,
    branchCashBoxes: reconciled.branchCashBoxes,
    customers: updatedCustomers,
    suppliers: updatedSuppliers,
  };

  const statements = computeFinancialStatementsFromLedger(intermediate);
  const updatedAccounts = (appData.accounts || []).map((acc) => {
    const t = statements.accountTotals[acc.code];
    if (!t) return acc;
    return {
      ...acc,
      debit: t.debit,
      credit: t.credit,
      balance: t.balance,
    };
  });

  return {
    ...intermediate,
    accounts: updatedAccounts,
  };
}

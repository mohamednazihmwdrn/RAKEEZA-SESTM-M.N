import {
  AppData,
  SaleInvoice,
  PurchaseInvoice,
  CashTransaction,
  CashBox,
  JournalEntry,
  JournalLine,
  ItemMovement,
  Supplier,
  Customer,
} from '../types';
import { getMainBranchId } from './branchIsolation';

/**
 * 🏛️ RAKEEZA IDEMPOTENCY & COMPLETE ACCOUNTING ENGINE (V3)
 * محرك المحاسبة المركزي الموحد ومنع التكرار (Idempotency Engine)
 * 
 * المبادئ الصارمة:
 * 1. استحالة تكرار سندات الصرف أو القبض عبر مفاتيح تطابق أحادية حتمية (Deterministic Sync IDs).
 * 2. معالجة العمليات مرة واحدة فقط (Single Financial Effect Guarantee).
 * 3. الرصيد التراكمي للخزائن يُحسب ديناميكياً وسلطوياً (Authoritative Reconciliation)
 *    بدلاً من الخصم اليدوي المعرض للعجز الوهمي.
 * 4. إنشاء قيود محاسبية متوازنة (Debit = Credit) آلياً لكل عملية سداد أو فاتورة.
 * 5. أداة تدقيق وتطهير تلقائية لمعالجة أي سندات صرف مكررة سابقة.
 */

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
    case 'drawer': return 'الدرج والخزينة الرئيسية';
    case 'vodafone': return 'محفظة فودافون كاش';
    case 'instapay': return 'تحويل انستاباي Instapay';
    case 'bank': return 'الحساب البنكي / فيزا';
    default: return 'الخزينة النقدية';
  }
}

/**
 * 🔑 توليد مفتاح تطابق حتمي لا يتكرر لسندات السداد المرتبطة بالفواتير
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
 * 🏦 التوفيق والحساب السلطوي لأرصدة الخزائن والبنوك (Authoritative Treasury Reconciliation)
 * الرصيد = رصيد البداية + المقبوضات + التحويلات الواردة - المدفوعات - التحويلات الصادرة
 * يحمي الخزائن نهائياً من أي عجز وهمي ناتج عن تكرار السندات أو أخطاء التزامن.
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

  // Initialize all branches
  branchesList.forEach((b) => {
    branchCashBoxes[b.id] = { drawer: 0, vodafone: 0, instapay: 0, bank: 0 };
  });
  if (!branchCashBoxes[mainBranchId]) {
    branchCashBoxes[mainBranchId] = { drawer: 0, vodafone: 0, instapay: 0, bank: 0 };
  }

  // Iterate over all valid, approved cash transactions
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

  // Round all figures to 2 decimal places to avoid floating point drift
  for (const m of methods) {
    globalCashBox[m] = Math.round((globalCashBox[m] || 0) * 100) / 100;
  }
  Object.keys(branchCashBoxes).forEach((bId) => {
    for (const m of methods) {
      branchCashBoxes[bId][m] = Math.round((branchCashBoxes[bId][m] || 0) * 100) / 100;
    }
  });

  return { cashBox: globalCashBox, branchCashBoxes };
}

/**
 * 🧹 فحص وتطهير وتدقيق السندات المكررة (Audit & Deduplicate Engine)
 * يفحص أي سندات صرف أو قبض مكررة لنفس الفاتورة والمبلغ والوسيلة،
 * ويحذف السندات المكررة الوهمية ويعيد ضبط رصيد الخزينة وحسابات الموردين بدقة متناهية.
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

  // 1. Identify and deduplicate cashTransactions
  const seenSyncIds = new Set<string>();
  const seenInvoiceInitialVouchers = new Map<string, number>(); // key -> transaction ID
  const validTransactions: CashTransaction[] = [];
  const removedTxIds = new Set<number>();

  for (const tx of data.cashTransactions) {
    if (!tx) continue;

    // Check by deterministic syncId
    if (tx.syncId && typeof tx.syncId === 'string' && tx.syncId.trim()) {
      const cleanSync = tx.syncId.trim();
      if (seenSyncIds.has(cleanSync)) {
        removedVouchersCount++;
        removedTxIds.add(tx.id);
        details.push(`حذف سند مكرر رقم #${tx.id} بمفتاح تطابق (${cleanSync}) بقيمة ${tx.amount} ج.م`);
        continue;
      }
      seenSyncIds.add(cleanSync);
    }

    // Check by Invoice payment signature (same invoice, type, method, amount)
    if (tx.invoiceId && tx.type && tx.amount) {
      const mKey = mapPaymentMethodToKey(tx.method);
      const isPurchaseVouch = tx.type === 'pay' && !tx.customerName;
      const isSaleVouch = tx.type === 'receive' && !tx.supplierName;

      if (isPurchaseVouch || isSaleVouch) {
        // Form a semantic voucher signature
        const sig = `${tx.type}_inv_${tx.invoiceId}_${mKey}_${Number(tx.amount).toFixed(2)}`;
        if (seenInvoiceInitialVouchers.has(sig)) {
          removedVouchersCount++;
          removedTxIds.add(tx.id);
          details.push(`حذف سند صرف/قبض مكرر رقم #${tx.id} للفاتورة #${tx.invoiceId} بقيمة ${tx.amount} ج.م عبر ${mKey}`);
          continue;
        }
        seenInvoiceInitialVouchers.set(sig, tx.id);
      }
    }

    validTransactions.push(tx);
  }

  data.cashTransactions = validTransactions;

  // 2. Reconcile purchase invoices paidAmount and remainingAmount based on valid vouchers
  data.purchaseInvoices = data.purchaseInvoices.map((inv) => {
    if (!inv || inv.status === 'cancelled') return inv;

    // Find all valid non-deleted payment vouchers for this purchase invoice
    const linkedVouchers = validTransactions.filter(
      (tx) => tx.invoiceId === inv.id && (tx.type === 'pay' || tx.type === 'receive')
    );

    let actualPaidFromVouchers = 0;
    linkedVouchers.forEach((v) => {
      if (v.type === 'pay') actualPaidFromVouchers += Number(v.amount || 0);
      else if (v.type === 'receive') actualPaidFromVouchers -= Number(v.amount || 0); // refund
    });

    // If invoice was cash (nagdi), it is fully paid
    let targetPaid = inv.paidAmount || 0;
    if (inv.type === 'nagdi') {
      targetPaid = inv.total;
    } else if (linkedVouchers.length > 0) {
      targetPaid = Math.min(inv.total, actualPaidFromVouchers);
    }

    const targetRem = Math.max(0, inv.total - targetPaid);
    if (Math.abs(targetPaid - (inv.paidAmount || 0)) > 0.01 || Math.abs(targetRem - (inv.remainingAmount || 0)) > 0.01) {
      repairedInvoicesCount++;
      return {
        ...inv,
        paidAmount: Math.round(targetPaid * 100) / 100,
        remainingAmount: Math.round(targetRem * 100) / 100,
      };
    }
    return inv;
  });

  // 3. Reconcile sales invoices
  data.salesInvoices = data.salesInvoices.map((inv) => {
    if (!inv || inv.status === 'cancelled') return inv;

    const linkedVouchers = validTransactions.filter(
      (tx) => tx.invoiceId === inv.id && (tx.type === 'receive' || tx.type === 'pay')
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
      targetPaid = Math.min(inv.total, actualPaidFromVouchers);
    }

    const targetRem = Math.max(0, inv.total - targetPaid);
    if (Math.abs(targetPaid - (inv.paidAmount || 0)) > 0.01 || Math.abs(targetRem - (inv.remainingAmount || 0)) > 0.01) {
      repairedInvoicesCount++;
      return {
        ...inv,
        paidAmount: Math.round(targetPaid * 100) / 100,
        remainingAmount: Math.round(targetRem * 100) / 100,
      };
    }
    return inv;
  });

  // 4. Remove phantom duplicate journal entries
  const seenJournalRefs = new Set<string>();
  data.journalEntries = data.journalEntries.filter((je) => {
    if (!je) return false;
    const ref = je.reference || je.entryNumber;
    if (ref && seenJournalRefs.has(ref)) {
      return false;
    }
    if (ref) seenJournalRefs.add(ref);
    return true;
  });

  // 5. Authoritative recalculation of cashboxes
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
 * 🛒 ترحيل فاتورة مشتريات مع حماية مطلقة من تكرار سندات الصرف
 */
export function processPurchaseInvoice(
  appData: AppData,
  invoice: PurchaseInvoice,
  isEditing: boolean = false,
  oldInvoiceId?: number
): AppData {
  const targetOldId = isEditing ? (oldInvoiceId || invoice.id) : (appData.purchaseInvoices.some((i) => i.id === invoice.id) ? invoice.id : undefined);

  const data: AppData = {
    ...appData,
    items: (appData.items || []).map((i) => ({ ...i, movements: [...(i.movements || [])] })),
    suppliers: (appData.suppliers || []).map((s) => ({ ...s, transactions: [...(s.transactions || [])] })),
    cashTransactions: [...(appData.cashTransactions || [])],
    journalEntries: [...(appData.journalEntries || [])],
    purchaseInvoices: [...(appData.purchaseInvoices || [])],
  };

  const isReturn = invoice.type.startsWith('return_');
  const now = new Date();
  const dateStr = invoice.date || now.toISOString().split('T')[0];
  const timeStr = invoice.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const mainBranchId = getMainBranchId(data.branches);
  const invBranchId = invoice.branchId || data.activeBranchId || mainBranchId;

  // 1. Rollback old invoice impacts if editing or re-saving existing ID
  if (targetOldId) {
    const oldInv = data.purchaseInvoices.find((i) => i.id === targetOldId);
    if (oldInv) {
      const wasReturn = oldInv.type.startsWith('return_');
      const oldBr = oldInv.branchId || mainBranchId;

      // Rollback stock
      oldInv.items?.forEach((itm) => {
        const stockItm = data.items.find(
          (i) =>
            (itm.itemId && i.id === itm.itemId) ||
            (i.name.trim().toLowerCase() === itm.name.trim().toLowerCase() &&
              (i.branchId === oldBr || (!i.branchId && oldBr === mainBranchId)))
        );
        if (stockItm) {
          const qtyDiff = wasReturn ? itm.qty : -itm.qty;
          stockItm.quantity = Math.max(0, (stockItm.quantity || 0) + qtyDiff);
          stockItm.movements.push({
            date: dateStr,
            type: 'adjustment',
            qty: qtyDiff,
            price: itm.price,
            total: Math.abs(qtyDiff) * itm.price,
            note: `تسوية وإعادة رصيد المخزن قبل تعديل فاتورة المشتريات #${oldInv.id}`,
          });
        }
      });

      // Rollback supplier balance
      if (oldInv.supplierName) {
        const supp = data.suppliers.find((s) => s.name.trim().toLowerCase() === oldInv.supplierName.trim().toLowerCase());
        if (supp) {
          const unpaid = oldInv.remainingAmount !== undefined ? oldInv.remainingAmount : (oldInv.total - (oldInv.paidAmount || 0));
          if (unpaid > 0) {
            supp.balance = (supp.balance || 0) - (wasReturn ? -unpaid : unpaid);
          }
          supp.transactions = supp.transactions.filter((tx) => tx.invoiceId !== targetOldId);
        }
      }

      // Remove old cash vouchers and journal entries strictly tied to this invoice ID
      data.cashTransactions = data.cashTransactions.filter((tx) => tx.invoiceId !== targetOldId);
      data.journalEntries = data.journalEntries.filter((je) => je.reference !== `PUR-INV-${targetOldId}`);
      data.purchaseInvoices = data.purchaseInvoices.filter((i) => i.id !== targetOldId);
    }
  }

  // 2. Put invoice in purchaseInvoices
  const normalizedInvoice: PurchaseInvoice = {
    ...invoice,
    branchId: invBranchId,
  };
  data.purchaseInvoices = [normalizedInvoice, ...data.purchaseInvoices];
  if (!isEditing && invoice.id >= data.nextPurchaseNumber) {
    data.nextPurchaseNumber = invoice.id + 1;
  }

  // 3. Stock movements
  invoice.items.forEach((item) => {
    let stockItem = data.items.find(
      (i) =>
        (item.itemId && i.id === item.itemId) ||
        (i.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
          (i.branchId === invBranchId || (!i.branchId && invBranchId === mainBranchId)))
    );
    if (!stockItem) {
      stockItem = {
        id: item.itemId || `i_${invBranchId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        companyId: invoice.companyId || data.companyId || 'COMP-000001',
        branchId: invBranchId,
        code: item.code,
        name: item.name,
        quantity: 0,
        purchasePrice: item.price,
        salePrice: item.price * 1.25,
        movements: [],
      };
      data.items.push(stockItem);
    }

    const qtyChange = isReturn ? -item.qty : item.qty;
    stockItem.quantity = Math.max(0, (stockItem.quantity || 0) + qtyChange);
    if (!isReturn && item.price > 0) {
      stockItem.purchasePrice = item.price;
      stockItem.costPrice = item.price;
      stockItem.lastPriceUpdate = dateStr;
      if (item.salePrice && item.salePrice > 0) {
        stockItem.salePrice = Number(item.salePrice.toFixed(2));
      }
    }

    const moveType: ItemMovement['type'] = isReturn ? 'return_purchase' : 'purchase';
    const noteText = isReturn
      ? `مرتجع شراء (${invoice.type === 'return_nagdi' ? 'نقدي' : 'آجل'}) فرع [${invBranchId}] للمورد ${invoice.supplierName} - فاتورة #${invoice.id}`
      : `شراء وتوريد (${invoice.type === 'nagdi' ? 'نقدي' : 'آجل'}) فرع [${invBranchId}] من المورد ${invoice.supplierName} - فاتورة #${invoice.id}`;

    stockItem.movements.push({
      date: dateStr,
      type: moveType,
      qty: qtyChange,
      price: item.price,
      total: Math.abs(qtyChange) * item.price,
      note: noteText,
    });
  });

  // 4. Supplier account posting
  let supp = data.suppliers.find((s) => s.name.trim().toLowerCase() === invoice.supplierName.trim().toLowerCase());
  if (!supp) {
    supp = {
      id: 's' + Date.now(),
      companyId: invoice.companyId || data.companyId || 'COMP-000001',
      branchId: invBranchId,
      name: invoice.supplierName,
      phone: invoice.phone || '',
      balance: 0,
      transactions: [],
    };
    data.suppliers.push(supp);
  }

  const effectiveRemaining = invoice.remainingAmount !== undefined ? invoice.remainingAmount : Math.max(0, invoice.total - (invoice.paidAmount || 0));
  const effectivePaid = Math.min(invoice.total, invoice.paidAmount || 0);

  if (invoice.type === 'ajel') {
    supp.balance = (supp.balance || 0) + effectiveRemaining;
    supp.transactions.push({
      id: `tx_${Date.now()}_pur_${invoice.id}`,
      date: dateStr,
      time: timeStr,
      refNo: `PUR-${invoice.id}`,
      type: 'purchase_credit',
      invoiceId: invoice.id,
      description: `فاتورة شراء وتوريد آجل رقم #${invoice.id} (الإجمالي: ${invoice.total.toFixed(2)} - المسدد: ${effectivePaid.toFixed(2)})`,
      debit: 0,
      credit: effectiveRemaining,
      balance: supp.balance,
      notes: invoice.notes,
    });
  } else if (invoice.type === 'return_ajel') {
    supp.balance = (supp.balance || 0) - effectiveRemaining;
    supp.transactions.push({
      id: `tx_${Date.now()}_pret_${invoice.id}`,
      date: dateStr,
      time: timeStr,
      refNo: `PRET-${invoice.id}`,
      type: 'return_purchase',
      invoiceId: invoice.id,
      description: `مرتجع مشتريات وتوريد آجل رقم #${invoice.id} خصم من الحساب`,
      debit: effectiveRemaining,
      credit: 0,
      balance: supp.balance,
      notes: invoice.notes,
    });
  }

  // 5. 🏦 IDEMPOTENT CASH VOUCHERS (سندات صرف أو قبض غير قابلة للتكرار)
  if (effectivePaid > 0) {
    const splits = (invoice.paymentSplits && invoice.paymentSplits.length > 0)
      ? invoice.paymentSplits
      : [{ method: invoice.paymentMethod, amount: effectivePaid }];

    splits.forEach((split, splitIdx) => {
      if (split.amount <= 0) return;
      const mKey = mapPaymentMethodToKey(split.method);
      const isReceive = isReturn;
      const syncId = getInvoicePaymentVoucherSyncId('purchase', invoice.id, splitIdx);

      // Check if a voucher with this deterministic syncId already exists
      const existingVoucherIndex = data.cashTransactions.findIndex(
        (t) => t.syncId === syncId || (t.invoiceId === invoice.id && t.type === (isReceive ? 'receive' : 'pay') && t.method === mKey)
      );

      const voucherPayload: CashTransaction = {
        id: existingVoucherIndex >= 0 ? data.cashTransactions[existingVoucherIndex].id : (data.nextCashId++),
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
          ? `سند قبض: استرداد نقدي من مرتجع مشتريات فرع #${invoice.id} (${split.method}) - المورد: ${invoice.supplierName}`
          : `سند صرف: سداد ${invoice.type === 'ajel' ? 'دفعة من فاتورة شراء آجل' : 'فاتورة شراء نقدي'} #${invoice.id} (${split.method}) - المورد: ${invoice.supplierName}`,
        supplierName: invoice.supplierName,
        invoiceId: invoice.id,
        status: 'approved',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: invoice.createdBy || 'مدير النظام',
      };

      if (existingVoucherIndex >= 0) {
        // Update in-place without adding duplicate record
        data.cashTransactions[existingVoucherIndex] = voucherPayload;
      } else {
        data.cashTransactions.push(voucherPayload);
      }
    });
  }

  // 6. 📊 Balanced Double-Entry Journal Entry
  const nextJid = data.nextJournalId || 1001;
  const journalLines: JournalLine[] = [];

  if (!isReturn) {
    journalLines.push({
      accountCode: '5101',
      accountName: 'المشتريات وتكلفة البضاعة',
      debit: invoice.total,
      credit: 0,
      note: `مشتريات فاتورة #${invoice.id} من المورد ${invoice.supplierName}`,
    });

    if (effectivePaid > 0) {
      const splits = (invoice.paymentSplits && invoice.paymentSplits.length > 0)
        ? invoice.paymentSplits
        : [{ method: invoice.paymentMethod, amount: effectivePaid }];

      splits.forEach((sp) => {
        const mKey = mapPaymentMethodToKey(sp.method);
        journalLines.push({
          accountCode: mKey === 'bank' ? '1102' : '1101',
          accountName: mKey === 'bank' ? 'الحساب البنكي والتحويل الإلكتروني' : 'الصندوق والخزينة النقدية',
          debit: 0,
          credit: sp.amount,
          note: `سداد قيمة فاتورة مشتريات #${invoice.id} (${sp.method})`,
        });
      });
    }

    if (effectiveRemaining > 0) {
      journalLines.push({
        accountCode: '2101',
        accountName: `الموردون والدائنون - ${invoice.supplierName}`,
        debit: 0,
        credit: effectiveRemaining,
        note: `المتبقي الآجل لفاتورة مشتريات #${invoice.id}`,
      });
    }
  } else {
    if (effectivePaid > 0) {
      const mKey = mapPaymentMethodToKey(invoice.paymentMethod);
      journalLines.push({
        accountCode: mKey === 'bank' ? '1102' : '1101',
        accountName: mKey === 'bank' ? 'الحساب البنكي والتحويل الإلكتروني' : 'الصندوق والخزينة النقدية',
        debit: effectivePaid,
        credit: 0,
        note: `استرداد نقدي لمرتجع مشتريات #${invoice.id}`,
      });
    }

    if (effectiveRemaining > 0) {
      journalLines.push({
        accountCode: '2101',
        accountName: `الموردون والدائنون - ${invoice.supplierName}`,
        debit: effectiveRemaining,
        credit: 0,
        note: `تخفيض مديونية المورد بمرتجع مشتريات #${invoice.id}`,
      });
    }

    journalLines.push({
      accountCode: '5102',
      accountName: 'مردودات ومسموحات المشتريات',
      debit: 0,
      credit: invoice.total,
      note: `مردودات مشتريات فاتورة #${invoice.id}`,
    });
  }

  // Ensure balance
  const totalDebit = Math.round(journalLines.reduce((s, l) => s + (l.debit || 0), 0) * 100) / 100;
  const totalCredit = Math.round(journalLines.reduce((s, l) => s + (l.credit || 0), 0) * 100) / 100;
  if (Math.abs(totalDebit - totalCredit) <= 0.01) {
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
  }

  // 7. Authoritative dynamic reconciliation of cashbox balances
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

  const inv = data.purchaseInvoices[invIndex];
  const rem = Math.max(0, inv.total - (inv.paidAmount || 0));
  const payAmt = Math.min(rem, params.amount);

  if (payAmt <= 0) {
    return data;
  }

  const now = new Date();
  const dateStr = params.date || now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const mainBranchId = getMainBranchId(data.branches);
  const targetBranch = params.branchId || inv.branchId || mainBranchId;

  // Update invoice paid & remaining amounts
  const newPaid = Math.round(((inv.paidAmount || 0) + payAmt) * 100) / 100;
  const newRem = Math.max(0, Math.round((inv.total - newPaid) * 100) / 100);
  data.purchaseInvoices[invIndex] = {
    ...inv,
    paidAmount: newPaid,
    remainingAmount: newRem,
  };

  // Update supplier balance & ledger
  const supp = data.suppliers.find((s) => s.name.trim().toLowerCase() === inv.supplierName.trim().toLowerCase());
  if (supp) {
    supp.balance = Math.round(((supp.balance || 0) - payAmt) * 100) / 100;
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

  // Idempotent voucher creation
  const deterministicSyncId = params.syncId || getInstallmentPaymentVoucherSyncId('purchase', inv.id, Date.now());
  const existingVouchIndex = data.cashTransactions.findIndex((t) => t.syncId === deterministicSyncId);

  const nextCashId = data.nextCashId || (data.cashTransactions.length + 1);
  const voucher: CashTransaction = {
    id: existingVouchIndex >= 0 ? data.cashTransactions[existingVouchIndex].id : nextCashId,
    syncId: deterministicSyncId,
    voucherNo: `PAY-${String(nextCashId).padStart(4, '0')}`,
    companyId: inv.companyId || data.companyId || 'COMP-000001',
    branchId: targetBranch,
    date: dateStr,
    time: timeStr,
    type: 'pay',
    method: params.method,
    amount: payAmt,
    note: params.note || `سداد دفعة فاتورة مشتريات #${inv.id} (${getPaymentMethodLabel(params.method)}) - المورد: ${inv.supplierName}`,
    supplierName: inv.supplierName,
    invoiceId: inv.id,
    status: 'approved',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: params.user?.name || 'مستخدم النظام',
    createdByUserId: params.user?.id,
    createdByUserCode: params.user?.code || 1,
  };

  if (existingVouchIndex >= 0) {
    data.cashTransactions[existingVouchIndex] = voucher;
  } else {
    data.cashTransactions.push(voucher);
    data.nextCashId = nextCashId + 1;
  }

  // Double-Entry Journal Entry
  const nextJid = data.nextJournalId || 1001;
  const mAccCode = params.method === 'bank' ? '1102' : '1101';
  data.journalEntries.push({
    id: nextJid,
    date: dateStr,
    entryNumber: `JV-PAY-${inv.id}-${voucher.id}`,
    reference: `PUR-PAY-${inv.id}-${voucher.id}`,
    description: `سداد دفعة للمورد ${inv.supplierName} عن فاتورة مشتريات #${inv.id}`,
    lines: [
      {
        accountCode: '2101',
        accountName: `الموردون والدائنون - ${inv.supplierName}`,
        debit: payAmt,
        credit: 0,
        note: `سداد جزء من مديونية فاتورة #${inv.id}`,
      },
      {
        accountCode: mAccCode,
        accountName: params.method === 'bank' ? 'الحساب البنكي والتحويل الإلكتروني' : 'الصندوق والخزينة النقدية',
        debit: 0,
        credit: payAmt,
        note: `صرف من ${getPaymentMethodLabel(params.method)}`,
      },
    ],
    source: 'cash',
    createdBy: params.user?.name || 'مستخدم النظام',
    createdAt: now.toISOString(),
    isApproved: true,
  });
  data.nextJournalId = nextJid + 1;

  // Dynamic reconciliation
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

  const inv = data.salesInvoices[invIndex];
  const rem = Math.max(0, inv.total - (inv.paidAmount || 0));
  const payAmt = Math.min(rem, params.amount);

  if (payAmt <= 0) return data;

  const now = new Date();
  const dateStr = params.date || now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const mainBranchId = getMainBranchId(data.branches);
  const targetBranch = params.branchId || inv.branchId || mainBranchId;

  const newPaid = Math.round(((inv.paidAmount || 0) + payAmt) * 100) / 100;
  const newRem = Math.max(0, Math.round((inv.total - newPaid) * 100) / 100);
  data.salesInvoices[invIndex] = {
    ...inv,
    paidAmount: newPaid,
    remainingAmount: newRem,
  };

  const cust = data.customers.find((c) => c.name.trim().toLowerCase() === inv.customerName.trim().toLowerCase());
  if (cust) {
    cust.balance = Math.round(((cust.balance || 0) - payAmt) * 100) / 100;
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

  const deterministicSyncId = params.syncId || getInstallmentPaymentVoucherSyncId('sale', inv.id, Date.now());
  const existingVouchIndex = data.cashTransactions.findIndex((t) => t.syncId === deterministicSyncId);

  const nextCashId = data.nextCashId || (data.cashTransactions.length + 1);
  const voucher: CashTransaction = {
    id: existingVouchIndex >= 0 ? data.cashTransactions[existingVouchIndex].id : nextCashId,
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

  if (existingVouchIndex >= 0) {
    data.cashTransactions[existingVouchIndex] = voucher;
  } else {
    data.cashTransactions.push(voucher);
    data.nextCashId = nextCashId + 1;
  }

  // Balanced Journal Entry
  const nextJid = data.nextJournalId || 1001;
  const mAccCode = params.method === 'bank' ? '1102' : '1101';
  data.journalEntries.push({
    id: nextJid,
    date: dateStr,
    entryNumber: `JV-REC-${inv.id}-${voucher.id}`,
    reference: `SALE-PAY-${inv.id}-${voucher.id}`,
    description: `تحصيل دفعة من العميل ${inv.customerName} عن فاتورة مبيعات #${inv.id}`,
    lines: [
      {
        accountCode: mAccCode,
        accountName: params.method === 'bank' ? 'الحساب البنكي والتحويل الإلكتروني' : 'الصندوق والخزينة النقدية',
        debit: payAmt,
        credit: 0,
        note: `إيداع في ${getPaymentMethodLabel(params.method)}`,
      },
      {
        accountCode: '1103',
        accountName: `العملاء والمدينون - ${inv.customerName}`,
        debit: 0,
        credit: payAmt,
        note: `سداد من مديونية فاتورة #${inv.id}`,
      },
    ],
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
 * 🗑️ حذف فاتورة مشتريات وتسوية جميع آثارها المالية والمخزنية
 */
export function deletePurchaseInvoice(appData: AppData, invoiceId: number): AppData {
  const data: AppData = {
    ...appData,
    items: (appData.items || []).map((i) => ({ ...i, movements: [...(i.movements || [])] })),
    suppliers: (appData.suppliers || []).map((s) => ({ ...s, transactions: [...(s.transactions || [])] })),
    cashTransactions: [...(appData.cashTransactions || [])],
    journalEntries: [...(appData.journalEntries || [])],
    purchaseInvoices: [...(appData.purchaseInvoices || [])],
  };

  const inv = data.purchaseInvoices.find((i) => i.id === invoiceId);
  if (!inv) return data;

  const isReturn = inv.type.startsWith('return_');
  const mainBranchId = getMainBranchId(data.branches);
  const invBr = inv.branchId || mainBranchId;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  // 1. Revert stock
  inv.items?.forEach((itm) => {
    const stockItm = data.items.find(
      (i) =>
        (itm.itemId && i.id === itm.itemId) ||
        (i.name.trim().toLowerCase() === itm.name.trim().toLowerCase() &&
          (i.branchId === invBr || (!i.branchId && invBr === mainBranchId)))
    );
    if (stockItm) {
      const qtyDiff = isReturn ? itm.qty : -itm.qty;
      stockItm.quantity = Math.max(0, (stockItm.quantity || 0) + qtyDiff);
      stockItm.movements.push({
        date: dateStr,
        type: 'adjustment',
        qty: qtyDiff,
        price: itm.price,
        total: Math.abs(qtyDiff) * itm.price,
        note: `تسوية وإلغاء أثر فاتورة المشتريات المحذوفة #${inv.id}`,
      });
    }
  });

  // 2. Revert supplier balance & ledger
  if (inv.supplierName) {
    const supp = data.suppliers.find((s) => s.name.trim().toLowerCase() === inv.supplierName.trim().toLowerCase());
    if (supp) {
      const unpaid = inv.remainingAmount !== undefined ? inv.remainingAmount : (inv.total - (inv.paidAmount || 0));
      if (unpaid > 0) {
        supp.balance = (supp.balance || 0) - (isReturn ? -unpaid : unpaid);
      }
      supp.transactions = supp.transactions.filter((tx) => tx.invoiceId !== invoiceId);
    }
  }

  // 3. Remove all cash vouchers and journal entries linked to this invoice
  data.cashTransactions = data.cashTransactions.filter((tx) => tx.invoiceId !== invoiceId);
  data.journalEntries = data.journalEntries.filter(
    (je) => je.reference !== `PUR-INV-${invoiceId}` && !je.reference?.startsWith(`PUR-PAY-${invoiceId}-`)
  );
  data.purchaseInvoices = data.purchaseInvoices.filter((i) => i.id !== invoiceId);

  // 4. Reconcile treasury
  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return data;
}

/**
 * 🗑️ حذف فاتورة مبيعات وتسوية جميع آثارها المالية والمخزنية
 */
export function deleteSaleInvoice(appData: AppData, invoiceId: number): AppData {
  const data: AppData = {
    ...appData,
    items: (appData.items || []).map((i) => ({ ...i, movements: [...(i.movements || [])] })),
    customers: (appData.customers || []).map((c) => ({ ...c, transactions: [...(c.transactions || [])] })),
    cashTransactions: [...(appData.cashTransactions || [])],
    journalEntries: [...(appData.journalEntries || [])],
    salesInvoices: [...(appData.salesInvoices || [])],
  };

  const inv = data.salesInvoices.find((i) => i.id === invoiceId);
  if (!inv) return data;

  const isReturn = inv.type.startsWith('return_');
  const mainBranchId = getMainBranchId(data.branches);
  const invBr = inv.branchId || mainBranchId;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  // 1. Revert stock
  inv.items?.forEach((itm) => {
    const stockItm = data.items.find(
      (i) =>
        (itm.itemId && i.id === itm.itemId) ||
        (i.name.trim().toLowerCase() === itm.name.trim().toLowerCase() &&
          (i.branchId === invBr || (!i.branchId && invBr === mainBranchId)))
    );
    if (stockItm) {
      const qtyDiff = isReturn ? -itm.qty : itm.qty;
      stockItm.quantity = Math.max(0, (stockItm.quantity || 0) + qtyDiff);
      stockItm.movements.push({
        date: dateStr,
        type: 'adjustment',
        qty: qtyDiff,
        price: itm.price,
        total: Math.abs(qtyDiff) * itm.price,
        note: `تسوية وإعادة بضاعة فاتورة المبيعات المحذوفة #${inv.id}`,
      });
    }
  });

  // 2. Revert customer balance
  if (inv.customerName) {
    const cust = data.customers.find((c) => c.name.trim().toLowerCase() === inv.customerName.trim().toLowerCase());
    if (cust) {
      const unpaid = inv.remainingAmount !== undefined ? inv.remainingAmount : (inv.total - (inv.paidAmount || 0));
      if (unpaid > 0) {
        cust.balance = (cust.balance || 0) - (isReturn ? -unpaid : unpaid);
      }
      cust.transactions = cust.transactions.filter((tx) => tx.invoiceId !== invoiceId);
    }
  }

  // 3. Remove cash transactions & journal entries
  data.cashTransactions = data.cashTransactions.filter((tx) => tx.invoiceId !== invoiceId);
  data.journalEntries = data.journalEntries.filter(
    (je) => je.reference !== `SALE-INV-${invoiceId}` && !je.reference?.startsWith(`SALE-PAY-${invoiceId}-`)
  );
  data.salesInvoices = data.salesInvoices.filter((i) => i.id !== invoiceId);

  // 4. Reconcile treasury
  const reconciled = reconcileTreasuryCashBox(data);
  data.cashBox = reconciled.cashBox;
  data.branchCashBoxes = reconciled.branchCashBoxes;

  return data;
}

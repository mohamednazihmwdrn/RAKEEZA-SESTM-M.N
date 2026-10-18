import { AppData, Branch, Item, SaleInvoice, PurchaseInvoice, CashTransaction, CashBox } from '../types';

/**
 * 🏢 Universal Branch Isolation Engine for RAKEEZA ERP
 * محرك عزل واستقلالية الفروع الشامل:
 * يضمن أن كل فرع يبدأ على نظافة بكافة الأصناف بدون أعداد وبدون أسعار،
 * وأن يكون كل فرع مختصاً بذاته كلياً في المخزون، الحركات، الأموال، والتقارير.
 */

export function getMainBranch(branches?: Branch[]): Branch | undefined {
  if (!branches || branches.length === 0) return undefined;
  return branches.find((b) => b.isMain) || branches[0];
}

export function getMainBranchId(branches?: Branch[]): string {
  const main = getMainBranch(branches);
  return main?.id || 'br-main';
}

/**
 * Extracts unique master item templates from existing company items.
 * Deduplicates by item code or lowercase item name.
 */
export function getUniqueMasterItems(items?: Item[]): Item[] {
  if (!items || items.length === 0) return [];
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  const uniqueList: Item[] = [];

  for (const item of items) {
    const code = (item.code || '').trim().toLowerCase();
    const name = (item.name || '').trim().toLowerCase();

    if (code && seenCodes.has(code)) continue;
    if (name && seenNames.has(name)) continue;

    if (code) seenCodes.add(code);
    if (name) seenNames.add(name);

    uniqueList.push(item);
  }

  return uniqueList;
}

/**
 * Clones existing master items for a new branch:
 * Starts completely clean with 0 stock and 0 prices ("على نظافة بدون أعداد وبدون أسعار")
 */
export function createCleanItemsForBranch(
  masterItems: Item[],
  branchId: string,
  companyId?: string
): Item[] {
  const now = new Date().toISOString();
  return masterItems.map((master) => {
    const safeCode = (master.code || '').trim();
    const cleanId = `i_${branchId}_${safeCode || Math.random().toString(36).substring(2, 8)}`;

    return {
      id: cleanId,
      companyId: companyId || master.companyId || 'COMP-000001',
      branchId,
      code: master.code,
      name: master.name,
      barcode: master.barcode,
      category: master.category,
      unit: master.unit || 'قطعة',
      description: master.description,
      // ⚠️ صفر أعداد وصفر أسعار للفرع الجديد (يبدأ على نظافة تامة)
      quantity: 0,
      purchasePrice: 0,
      costPrice: 0,
      salePrice: 0,
      normalSellingPrice: 0,
      wholesaleSellingPrice: 0,
      minStockAlert: master.minStockAlert || 5,
      material: master.material,
      imageUrl: master.imageUrl,
      showInCatalog: master.showInCatalog,
      lastPurchaseDate: undefined,
      movements: [],
      createdAt: now,
      updatedAt: now,
    };
  });
}

/**
 * Ensures all existing items have a valid branchId assigned.
 * Any unassigned items default to the company's main branch.
 */
export function ensureItemsHaveBranchIds(items: Item[], mainBranchId: string): Item[] {
  return (items || []).map((it) => {
    if (!it.branchId) {
      return { ...it, branchId: mainBranchId };
    }
    return it;
  });
}

/**
 * Returns items belonging to a specific branch.
 */
export function getBranchItems(items?: Item[], branchId?: string, mainBranchId?: string): Item[] {
  if (!items || items.length === 0) return [];
  if (!branchId || branchId === 'all') return items;

  const isMain = branchId === mainBranchId || branchId === 'br-main';

  return items.filter((item) => {
    if (item.branchId === branchId) return true;
    // Legacy fallback: unassigned items belong to the main branch
    if (isMain && !item.branchId) return true;
    return false;
  });
}

/**
 * Filters sales invoices by branch.
 */
export function filterSalesInvoicesByBranch(
  invoices?: SaleInvoice[],
  branchId?: string,
  mainBranchId?: string,
  allowAll: boolean = false
): SaleInvoice[] {
  if (!invoices) return [];
  if (!branchId || (allowAll && branchId === 'all')) return invoices;

  const isMain = branchId === mainBranchId || branchId === 'br-main';

  return invoices.filter((inv) => {
    const invBr = inv.branchId || (inv as any).branch;
    if (invBr === branchId) return true;
    if (isMain && !invBr) return true;
    return false;
  });
}

/**
 * Filters purchase invoices by branch.
 */
export function filterPurchaseInvoicesByBranch(
  invoices?: PurchaseInvoice[],
  branchId?: string,
  mainBranchId?: string,
  allowAll: boolean = false
): PurchaseInvoice[] {
  if (!invoices) return [];
  if (!branchId || (allowAll && branchId === 'all')) return invoices;

  const isMain = branchId === mainBranchId || branchId === 'br-main';

  return invoices.filter((inv) => {
    const invBr = inv.branchId || (inv as any).branch;
    if (invBr === branchId) return true;
    if (isMain && !invBr) return true;
    return false;
  });
}

/**
 * Filters cash transactions by branch.
 */
export function filterCashTransactionsByBranch(
  transactions?: CashTransaction[],
  branchId?: string,
  mainBranchId?: string,
  allowAll: boolean = false
): CashTransaction[] {
  if (!transactions) return [];
  if (!branchId || (allowAll && branchId === 'all')) return transactions;

  const isMain = branchId === mainBranchId || branchId === 'br-main';

  return transactions.filter((tx) => {
    if (tx.branchId === branchId) return true;
    if (isMain && !tx.branchId) return true;
    return false;
  });
}

/**
 * Calculates real-time liquid assets (drawer, vodafone, instapay, bank) for a specific branch.
 */
export function calculateBranchCashBox(
  appData: AppData,
  branchId?: string,
  mainBranchId?: string
): CashBox {
  const targetBranch = branchId || appData.activeBranchId || getMainBranchId(appData.branches);
  const isMain = targetBranch === (mainBranchId || getMainBranchId(appData.branches));

  // If explicit stored branch cashbox exists and matches
  const stored = appData.branchCashBoxes?.[targetBranch];

  // Derive dynamic liquidity from branch's cash transactions
  const txs = filterCashTransactionsByBranch(
    appData.cashTransactions,
    targetBranch,
    mainBranchId || getMainBranchId(appData.branches),
    false
  );

  const calculated: CashBox = {
    drawer: stored?.drawer || (isMain ? (appData.cashBox?.drawer || 0) : 0),
    vodafone: stored?.vodafone || (isMain ? (appData.cashBox?.vodafone || 0) : 0),
    instapay: stored?.instapay || (isMain ? (appData.cashBox?.instapay || 0) : 0),
    bank: stored?.bank || (isMain ? (appData.cashBox?.bank || 0) : 0),
  };

  // If there are recorded transactions for this branch, compute receipts minus payments
  if (!stored && !isMain) {
    let d = 0;
    let v = 0;
    let i = 0;
    let b = 0;
    txs.forEach((t) => {
      const amt = Number(t.amount || 0);
      const isPositive = t.type === 'receive' || t.type === 'deposit';
      const factor = isPositive ? 1 : -1;
      if (t.method === 'drawer') d += factor * amt;
      else if (t.method === 'vodafone') v += factor * amt;
      else if (t.method === 'instapay') i += factor * amt;
      else if (t.method === 'bank') b += factor * amt;
      else d += factor * amt;
    });
    return {
      drawer: Math.max(0, d),
      vodafone: Math.max(0, v),
      instapay: Math.max(0, i),
      bank: Math.max(0, b),
    };
  }

  return calculated;
}

/**
 * Updates a specific branch's cash box by delta and returns the updated map.
 */
export function updateBranchCashBoxDelta(
  appData: AppData,
  branchId: string,
  method: 'drawer' | 'vodafone' | 'instapay' | 'bank' | string,
  amountDelta: number
): Record<string, CashBox> {
  const currentBoxes = { ...(appData.branchCashBoxes || {}) };
  const targetId = branchId || appData.activeBranchId || getMainBranchId(appData.branches);
  const currentBox = currentBoxes[targetId] || calculateBranchCashBox(appData, targetId);

  const key = (['drawer', 'vodafone', 'instapay', 'bank'].includes(method)
    ? method
    : 'drawer') as keyof CashBox;

  const updatedBox: CashBox = {
    ...currentBox,
    [key]: Math.max(0, (currentBox[key] || 0) + amountDelta),
  };

  return {
    ...currentBoxes,
    [targetId]: updatedBox,
  };
}

/**
 * Returns a scoped AppData projection for a specific branch.
 * All collections (items, salesInvoices, purchaseInvoices, cashTransactions, cashBox)
 * are filtered strictly for this branch.
 */
export function getScopedAppDataForBranch(appData: AppData, branchId?: string): AppData {
  const targetBranchId = branchId || appData.activeBranchId || getMainBranchId(appData.branches);
  const mainId = getMainBranchId(appData.branches);

  const scopedItems = getBranchItems(appData.items, targetBranchId, mainId);
  const scopedSales = filterSalesInvoicesByBranch(appData.salesInvoices, targetBranchId, mainId, false);
  const scopedPurchases = filterPurchaseInvoicesByBranch(appData.purchaseInvoices, targetBranchId, mainId, false);
  const scopedCashTxs = filterCashTransactionsByBranch(appData.cashTransactions, targetBranchId, mainId, false);
  const scopedCashBox = calculateBranchCashBox(appData, targetBranchId, mainId);

  return {
    ...appData,
    activeBranchId: targetBranchId,
    items: scopedItems,
    salesInvoices: scopedSales,
    purchaseInvoices: scopedPurchases,
    cashTransactions: scopedCashTxs,
    cashBox: scopedCashBox,
  };
}

/**
 * Auto-synchronizes clean zeroed items for any existing branch that doesn't have items yet.
 */
export function syncMissingBranchItems(appData: AppData): { items: Item[]; createdCount: number } {
  const mainId = getMainBranchId(appData.branches);
  const normalizedExisting = ensureItemsHaveBranchIds(appData.items || [], mainId);
  const uniqueMasters = getUniqueMasterItems(normalizedExisting);
  const branches = appData.branches || [];

  let allItems = [...normalizedExisting];
  let createdCount = 0;

  for (const br of branches) {
    if (br.id === mainId) continue; // main branch already has the master items

    const existingBranchItemCodes = new Set(
      allItems
        .filter((i) => i.branchId === br.id)
        .map((i) => (i.code || i.name || '').trim().toLowerCase())
    );

    const missingMasters = uniqueMasters.filter((m) => {
      const codeOrName = (m.code || m.name || '').trim().toLowerCase();
      return !existingBranchItemCodes.has(codeOrName);
    });

    if (missingMasters.length > 0) {
      const cleanItems = createCleanItemsForBranch(missingMasters, br.id, appData.companyId);
      allItems.push(...cleanItems);
      createdCount += cleanItems.length;
    }
  }

  return { items: allItems, createdCount };
}

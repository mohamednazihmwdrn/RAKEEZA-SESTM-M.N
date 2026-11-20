import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppData, SaleInvoice, PurchaseInvoice, Item, Customer, Supplier, ItemAltUnit } from '../types';
import { calculateCustomerBalance, calculateSupplierBalance } from '../utils/accounting';
import { postSaleInvoice, postPurchaseInvoice, mapPaymentMethodToKey } from '../utils/posting';
import { printInvoiceWindow } from '../utils/printInvoice';
import { registerModalBackHandler } from '../utils/navigationHistory';
import { getBranchItems, getMainBranchId } from '../utils/branchIsolation';
import { hasPermission } from '../utils/permissions';
import { Camera, ShieldAlert, X } from 'lucide-react';
import { BarcodeCameraModal } from './BarcodeCameraModal';
import { SupervisorPinModal } from './SupervisorPinModal';

export interface RakeezaInvoiceWorkspaceProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'sale' | 'purchase';
  invoiceType: 'nagdi' | 'ajel' | 'return_nagdi' | 'return_ajel';
  pricingType?: 'cash' | 'wholesale' | 'buy';
  editingInvoice?: SaleInvoice | PurchaseInvoice | null;
  appData: AppData;
  onUpdateData: (
    newData: AppData,
    actionInfo?: { action?: string; module?: string; details?: string; deletedId?: string | number }
  ) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export interface WorkspaceItemRow {
  rowId: string;
  code: string;
  name: string;
  unit?: string;
  spec: string;
  qty: number;
  price: number;
  total: number;
  discVal?: number;
  discType?: 'val' | 'percent';
  actualDisc?: number;
  taxVal?: number;
  taxType?: 'val' | 'percent';
  actualTax?: number;
  itemId?: string;
  costPrice?: number;
  cashPrice?: number;
  wholesalePrice?: number;
  buyPrice?: number;
  unitFactor?: number;
  baseQty?: number;
  altUnits?: ItemAltUnit[];
}

export interface WorkspacePayRow {
  id: string;
  method: string;
  amount: number;
}

export function findMatchingInvoiceRowIndex(
  rows: WorkspaceItemRow[],
  resolvedName: string,
  matchedCatalog: { code?: string; itemId?: string | number },
  spec: string,
  hasLineMods: boolean,
  unit?: string
): number {
  if (hasLineMods) return -1;
  const targetName = resolvedName.trim().toLowerCase();
  const targetCode = (matchedCatalog.code || '').trim().toLowerCase();
  const targetId = matchedCatalog.itemId !== undefined && matchedCatalog.itemId !== null ? String(matchedCatalog.itemId) : '';
  const targetSpec = spec.trim();
  const targetUnit = (unit || '').trim();

  const isSameItem = (r: WorkspaceItemRow): boolean => {
    const rName = (r.name || '').trim().toLowerCase();
    // Different item names MUST NEVER merge into the same row
    if (!rName || !targetName || rName !== targetName) return false;

    if (targetUnit && (r.unit || 'قطعة').trim() !== targetUnit) return false;

    const rId = r.itemId !== undefined && r.itemId !== null ? String(r.itemId) : '';
    if (rId && targetId && rId !== targetId) return false;

    const rCode = (r.code || '').trim().toLowerCase();
    if (
      rCode &&
      targetCode &&
      !rCode.startsWith('itm-adhoc-') &&
      !targetCode.startsWith('itm-adhoc-') &&
      rCode !== targetCode
    ) {
      return false;
    }
    return true;
  };

  if (targetSpec !== '') {
    return rows.findIndex(
      (r) => isSameItem(r) && (r.spec || '').trim() === targetSpec && !(r.actualDisc || 0) && !(r.actualTax || 0)
    );
  }

  const exactEmptySpecIdx = rows.findIndex(
    (r) => isSameItem(r) && (r.spec || '').trim() === '' && !(r.actualDisc || 0) && !(r.actualTax || 0)
  );
  if (exactEmptySpecIdx > -1) return exactEmptySpecIdx;

  return rows.findIndex((r) => isSameItem(r) && !(r.actualDisc || 0) && !(r.actualTax || 0));
}

export const RakeezaInvoiceWorkspace: React.FC<RakeezaInvoiceWorkspaceProps> = ({
  isOpen,
  onClose,
  mode: initialMode,
  invoiceType: initialInvoiceType,
  pricingType: initialPricingType,
  editingInvoice,
  appData,
  onUpdateData,
  showToast,
}) => {
  // Register phone back button listener when workspace is open
  useEffect(() => {
    if (isOpen) {
      const unregister = registerModalBackHandler(() => {
        onClose();
        return true;
      });
      return () => unregister();
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 🏛️ Current Department (Sales vs Purchases)
  const [currentDept] = useState<'sale' | 'purchase'>(() => {
    if (editingInvoice) {
      return (editingInvoice as any).supplierName ? 'purchase' : 'sale';
    }
    return initialMode;
  });

  const isSale = currentDept === 'sale';

  // 🏷️ نظام تسعير الفاتورة الموحد: 'cash' (سعر البيع) أو 'buy' (آخر سعر شراء)
  const [activePricingTier, setActivePricingTier] = useState<'cash' | 'wholesale' | 'buy'>(() => {
    if (editingInvoice) {
      if ((editingInvoice as any).supplierName) return 'buy';
      return 'cash';
    }
    if (initialPricingType === 'buy') return 'buy';
    return isSale ? 'cash' : 'buy';
  });

  // Invoice type (nagdi / ajel / return_nagdi / return_ajel)
  const [selectedInvoiceType, setSelectedInvoiceType] = useState<'nagdi' | 'ajel' | 'return_nagdi' | 'return_ajel'>(() => {
    if (editingInvoice?.type) return editingInvoice.type;
    return initialInvoiceType || 'nagdi';
  });

  useEffect(() => {
    if (initialInvoiceType) {
      setSelectedInvoiceType(initialInvoiceType);
    }
  }, [initialInvoiceType]);

  const isReturn = selectedInvoiceType.startsWith('return_');

  // 🎨 هوية الفاتورة اللونيّة الديناميكية طبقاً للأنظمة العالمية (لكل نوع حركة لون وعنوان مختلف)
  const invoiceTheme = useMemo(() => {
    if (isSale) {
      if (selectedInvoiceType === 'return_nagdi' || selectedInvoiceType === 'return_ajel') {
        return {
          bg: 'linear-gradient(135deg, #881337 0%, #be123c 100%)',
          border: '#e11d48',
          badgeText: selectedInvoiceType === 'return_ajel' ? '↩ مرتجع مبيعات آجل' : '↩ مرتجع مبيعات نقدي',
          icon: 'fa-rotate-left',
        };
      }
      if (selectedInvoiceType === 'ajel') {
        return {
          bg: 'linear-gradient(135deg, #78350f 0%, #b45309 100%)',
          border: '#d97706',
          badgeText: '⏳ فاتورة مبيعات آجل',
          icon: 'fa-clock',
        };
      }
      return {
        bg: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
        border: '#059669',
        badgeText: '💵 فاتورة مبيعات نقدي',
        icon: 'fa-cash-register',
      };
    } else {
      // Purchases
      if (selectedInvoiceType === 'return_nagdi' || selectedInvoiceType === 'return_ajel') {
        return {
          bg: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
          border: '#dc2626',
          badgeText: selectedInvoiceType === 'return_ajel' ? '↩ مرتجع شراء آجل' : '↩ مرتجع شراء نقدي',
          icon: 'fa-rotate-left',
        };
      }
      if (selectedInvoiceType === 'ajel') {
        return {
          bg: 'linear-gradient(135deg, #713f12 0%, #9a3412 100%)',
          border: '#ea580c',
          badgeText: '⏳ فاتورة شراء آجل (ذمم موردين)',
          icon: 'fa-file-invoice-dollar',
        };
      }
      return {
        bg: 'linear-gradient(135deg, #134e4a 0%, #0f766e 100%)',
        border: '#0d9488',
        badgeText: '🛒 فاتورة شراء نقدي',
        icon: 'fa-cart-shopping',
      };
    }
  }, [isSale, selectedInvoiceType]);

  // Window Maximize Toggle
  const [isMaximized, setIsMaximized] = useState(false);

  // Live Digital Clock (HH:MM ص/م)
  const [liveTime, setLiveTime] = useState('12:00 م');
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setLiveTime(d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Invoice ID & Sequence
  const invoiceId = useMemo(() => {
    if (editingInvoice?.id) return editingInvoice.id;
    const list = isSale ? (appData.salesInvoices || []) : (appData.purchaseInvoices || []);
    let maxId = 0;
    list.forEach((i) => {
      const num = Number(i.id) || 0;
      if (num > maxId) maxId = num;
    });
    return maxId + 1;
  }, [editingInvoice, isSale, appData]);

  const [invNum] = useState<string>(
    (editingInvoice as any)?.invoiceNumber ? String((editingInvoice as any).invoiceNumber) : String(invoiceId)
  );

  const [invDate, setInvDate] = useState<string>(
    editingInvoice?.date || new Date().toISOString().split('T')[0]
  );

  const now = new Date();
  const [invTime, setInvTime] = useState<string>(
    editingInvoice?.time ||
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  );

  // Party State (Customer in Sales, Supplier in Purchases)
  const [custCode, setCustCode] = useState<string>(() => {
    if (isSale) return (editingInvoice as any)?.customerCode || (editingInvoice as any)?.customerId || '';
    return (editingInvoice as any)?.supplierCode || (editingInvoice as any)?.supplierId || '';
  });
  const [custName, setCustName] = useState<string>(() => {
    if (isSale) return (editingInvoice as SaleInvoice)?.customerName || 'عميل نقدي';
    return (editingInvoice as PurchaseInvoice)?.supplierName || 'مورد عام';
  });
  const [custPhone, setCustPhone] = useState<string>(editingInvoice?.phone || '');
  const [jobSite, setJobSite] = useState<string>(
    (editingInvoice as any)?.jobSite || editingInvoice?.notes || ''
  );

  // Return Traceability State (Optional Original Invoice Ref & Full/Partial Return Kind)
  const [originalInvoiceId, setOriginalInvoiceId] = useState<number | undefined>(() =>
    (editingInvoice as any)?.originalInvoiceId ? Number((editingInvoice as any).originalInvoiceId) : undefined
  );
  const [returnKind, setReturnKind] = useState<'full' | 'partial'>(() =>
    (editingInvoice as any)?.returnKind === 'full' ? 'full' : 'partial'
  );

  // Autocomplete Suggestions State
  const [showCustDropdown, setShowCustDropdown] = useState(false);

  const partySuggestions = useMemo(() => {
    const q = custName.trim().toLowerCase();
    const list = isSale ? (appData.customers || []) : (appData.suppliers || []);
    if (!q) return list.slice(0, 8);
    return list
      .filter((p) => p.name.toLowerCase().includes(q) || (p.phone && p.phone.includes(q)) || (p.code && p.code.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [custName, isSale, appData.customers, appData.suppliers]);

  // 🟡 حساب رصيد وحالة الحساب (الدائن / المدين) للعميل أو المورد المختار
  const matchedParty = useMemo(() => {
    if (isSale) {
      return appData.customers?.find(
        (c) =>
          (custCode && (c.code === custCode || c.id === custCode)) ||
          (custName && c.name.trim().toLowerCase() === custName.trim().toLowerCase())
      );
    } else {
      return appData.suppliers?.find(
        (s) =>
          (custCode && (s.code === custCode || s.id === custCode)) ||
          (custName && s.name.trim().toLowerCase() === custName.trim().toLowerCase())
      );
    }
  }, [custName, custCode, isSale, appData.customers, appData.suppliers]);

  const partyBalance: number = useMemo(() => {
    if (!matchedParty) return 0;
    if (isSale) {
      const res = calculateCustomerBalance(matchedParty as Customer, appData);
      return typeof res === 'number' ? res : (res?.balance || 0);
    } else {
      const res = calculateSupplierBalance(matchedParty as Supplier, appData);
      return typeof res === 'number' ? res : (res?.balance || 0);
    }
  }, [matchedParty, isSale, appData]);

  // 🏢 Integrated Items Database (مستقل ومحصور حصرياً بأصناف وأسعار ومخزون الفرع النشط)
  const activeBranchId = appData.activeBranchId || appData.branches?.[0]?.id || 'br-main';
  const mainBranchId = getMainBranchId(appData.branches);
  const scopedBranchItems = useMemo(() => {
    return getBranchItems(appData.items, activeBranchId, mainBranchId);
  }, [appData.items, activeBranchId, mainBranchId]);

  // Map raw Item array into Workspace DB format (prioritize last purchasePrice & latest salePrice)
  const mapRawItemsToDb = (itemsList: Item[]) => {
    return itemsList.map((i, idx) => {
      const bPrice = Number(i.purchasePrice || i.costPrice || i.avgCost || 0);
      const cPrice = Number(i.normalSellingPrice || i.salePrice || i.price || 0);
      const wPrice = Number(i.wholesalePrice || i.wholesaleSellingPrice || 0);
      const wbPrice = Number((i as any).wholesalePurchasePrice || (i as any).wholesaleBuyPrice || bPrice || 0);
      return {
        code: i.code || `ITM-${String(idx + 1).padStart(3, '0')}`,
        barcode: i.barcode || '',
        name: i.name,
        group: i.category || 'عام',
        company: i.material || 'عام',
        typeName: i.unit || 'قطعة',
        stock: Number(i.quantity ?? 0),
        buyPrice: bPrice,
        cashPrice: cPrice,
        wholesalePrice: wPrice,
        wholesaleBuyPrice: wbPrice,
        itemId: i.id,
        altUnits: i.altUnits || [],
      };
    });
  };

  const rawAvailableItems = useMemo(() => {
    if (scopedBranchItems && scopedBranchItems.length > 0) return scopedBranchItems;
    if (appData.items && appData.items.length > 0) return appData.items;
    return [];
  }, [scopedBranchItems, appData.items]);

  // ⚡ Stable items database state synced with memoized rawAvailableItems
  const [localItemsDatabase, setLocalItemsDatabase] = useState(() => mapRawItemsToDb(rawAvailableItems));

  useEffect(() => {
    setLocalItemsDatabase(mapRawItemsToDb(rawAvailableItems));
  }, [rawAvailableItems]);

  // 🔍 Quick Search Bar on-screen state
  const [workspaceItemSearch, setWorkspaceItemSearch] = useState('');
  const [showWorkspaceItemDropdown, setShowWorkspaceItemDropdown] = useState(false);

  const filteredWorkspaceItems = useMemo(() => {
    const q = workspaceItemSearch.trim().toLowerCase();
    if (!q) return [];
    return localItemsDatabase.filter(
      (i) =>
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.code && i.code.toLowerCase().includes(q)) ||
        (i.barcode && i.barcode.toLowerCase().includes(q)) ||
        (i.altUnits || []).some((u) => u.barcode && u.barcode.toLowerCase().includes(q))
    ).slice(0, 15);
  }, [workspaceItemSearch, localItemsDatabase]);

  // Current Invoice Items
  const [currentInvoiceItems, setCurrentInvoiceItems] = useState<WorkspaceItemRow[]>(() => {
    if (editingInvoice?.items && editingInvoice.items.length > 0) {
      return editingInvoice.items.map((i, idx) => {
        const uFactor = Number((i as any).unitFactor || 1);
        const qVal = Number(i.qty || (i as any).quantity || 1);
        return {
          rowId: (i as any).rowId || `row_${idx}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          code: i.code || '',
          name: i.name,
          unit: (i as any).unit || 'قطعة',
          unitFactor: uFactor,
          baseQty: Number((i as any).baseQty || qVal * uFactor),
          spec: i.spec || i.notes || '',
          qty: qVal,
          price: Number(i.price || 0),
          total: Number(i.total || (qVal * Number(i.price || 0))),
          discVal: Number((i as any).discountValue ?? (i as any).discVal ?? 0),
          discType: ((i as any).discType === 'val' || (i as any).discountType === 'fixed') ? 'val' : 'percent',
          actualDisc: Number((i as any).actualDisc ?? (i as any).discount ?? 0),
          taxVal: Number((i as any).taxValue ?? (i as any).taxVal ?? 0),
          taxType: ((i as any).taxType === 'val' || (i as any).taxType === 'fixed') ? 'val' : 'percent',
          actualTax: Number((i as any).actualTax ?? (i as any).tax ?? 0),
          itemId: i.itemId,
          costPrice: i.costPrice,
        };
      });
    }
    return [];
  });

  // Creator & Active Editor Display State
  const loggedInUserName =
    appData.users?.find((u) => u.id === appData.currentUser)?.name ||
    appData.users?.[0]?.name ||
    'مدير النظام';
  const creatorName = editingInvoice?.createdBy || loggedInUserName;
  const [activeEditorName, setActiveEditorName] = useState<string>(loggedInUserName);

  // Payment Mode & Treasury Quick Bar State
  const resolveInitialTreasury = (): string => {
    const pm = String(editingInvoice?.paymentMethod || 'drawer').toLowerCase();
    if (pm.includes('vodafone') || pm.includes('فودافون')) return 'فودافون كاش';
    if (pm.includes('instapay') || pm.includes('انستاباي') || pm.includes('إنستاباي')) return 'انستاباي';
    if (pm.includes('visa') || pm.includes('فيزا') || pm.includes('pos')) return 'فيزا';
    if (pm.includes('bank') || pm.includes('بنك') || pm.includes('تحويل')) return 'بنك';
    return 'نقدي';
  };
  const [selectedTreasuryMethod, setSelectedTreasuryMethod] = useState<string>(resolveInitialTreasury);
  const [paymentStatusMode, setPaymentStatusMode] = useState<'paid' | 'credit' | 'partial'>(() => {
    if (editingInvoice) {
      if (editingInvoice.type === 'nagdi' || editingInvoice.type === 'return_nagdi') return 'paid';
      if (Number(editingInvoice.paidAmount || 0) > 0.01) return 'partial';
      return 'credit';
    }
    return initialInvoiceType === 'ajel' || initialInvoiceType === 'return_ajel' ? 'credit' : 'paid';
  });
  const [partialPaidInput, setPartialPaidInput] = useState<string>(() =>
    editingInvoice && Number(editingInvoice.paidAmount || 0) > 0 && (editingInvoice.type === 'ajel' || editingInvoice.type === 'return_ajel')
      ? String(editingInvoice.paidAmount)
      : ''
  );

  // Helper to extract sticky last sale price or last purchase price
  const getItemPriceForTier = (dbItem: any, tier: 'cash' | 'wholesale' | 'buy'): number => {
    if (!dbItem) return 0;
    const cPrice = Number(dbItem.cashPrice || dbItem.normalSellingPrice || dbItem.salePrice || dbItem.price || 0);
    const bPrice = Number(dbItem.buyPrice || dbItem.purchasePrice || dbItem.costPrice || dbItem.avgCost || 0);

    if (tier === 'buy') {
      return bPrice;
    }

    return cPrice;
  };

  useEffect(() => {
    setActivePricingTier(isSale ? 'cash' : 'buy');
  }, [isSale]);

  // Options & Payments Modal State
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);
  const [invDiscType, setInvDiscType] = useState<'val' | 'percent'>('val');
  const [globalInvDisc, setGlobalInvDisc] = useState<string>(
    editingInvoice?.discount ? String(editingInvoice.discount) : ''
  );
  const [invTaxType, setInvTaxType] = useState<'val' | 'percent'>('percent');
  const [globalInvTax, setGlobalInvTax] = useState<string>(
    editingInvoice?.tax ? String(editingInvoice.tax) : ''
  );
  const [extraIncomeName, setExtraIncomeName] = useState<string>(
    (editingInvoice as any)?.extraRevenueName || (editingInvoice as any)?.extraIncomeName || ''
  );
  const [extraIncomeVal, setExtraIncomeVal] = useState<string>(
    (editingInvoice as any)?.extraRevenueAmount ? String((editingInvoice as any).extraRevenueAmount) : ''
  );

  const [paymentRows, setPaymentRows] = useState<WorkspacePayRow[]>(() => {
    if ((editingInvoice as any)?.paymentSplits && (editingInvoice as any).paymentSplits.length > 0) {
      return (editingInvoice as any).paymentSplits.map((p: any, idx: number) => ({
        id: String(idx + 1),
        method: p.method,
        amount: Number(p.amount),
      }));
    }
    if (editingInvoice?.paidAmount && Number(editingInvoice.paidAmount) > 0) {
      return [{ id: '1', method: editingInvoice.paymentMethod || 'نقدي', amount: Number(editingInvoice.paidAmount) }];
    }
    return [];
  });

  // Hierarchy Lookup Modal State
  const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
  const [globalLookupSearch, setGlobalLookupSearch] = useState('');
  const [hierarchyState, setHierarchyState] = useState<{
    step: 'groups' | 'companies' | 'types' | 'items' | 'search';
    selectedGroup: string | null;
    selectedCompany: string | null;
    selectedType: string | null;
  }>({
    step: 'groups',
    selectedGroup: null,
    selectedCompany: null,
    selectedType: null,
  });

  const currentUserObj =
    appData.users?.find((u) => u.id === appData.currentUser) || appData.users?.[0];
  const canViewCost = hasPermission(currentUserObj, 'view_cost_price');
  const allowBelowCost = hasPermission(currentUserObj, 'allow_below_cost_sale');

  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [pinGuardState, setPinGuardState] = useState<null | {
    mode: 'below_cost' | 'credit_limit';
    title: string;
    message: string;
    details: string[];
    belowCostApproved: boolean;
    creditLimitApproved: boolean;
  }>(null);
  const [creditWarnModal, setCreditWarnModal] = useState<null | {
    message: string;
    belowCostApproved: boolean;
  }>(null);

  // Item Detail / Quick Add Card Modal State (7fca626a.png)
  const [isDetailCardOpen, setIsDetailCardOpen] = useState(false);
  const [cardItem, setCardItem] = useState<any>(null);
  const [cardItemSearch, setCardItemSearch] = useState<string>('');
  const [showCardDropdown, setShowCardDropdown] = useState<boolean>(false);
  const [cardUnit, setCardUnit] = useState<string>('قطعة');
  const [cardUnitFactor, setCardUnitFactor] = useState<number>(1);
  const [cardQty, setCardQty] = useState<string>('1');
  const [cardPrice, setCardPrice] = useState<string>('');
  const [cardDiscVal, setCardDiscVal] = useState<string>('');
  const [cardDiscType, setCardDiscType] = useState<'val' | 'percent'>('val');
  const [cardTaxVal, setCardTaxVal] = useState<string>('');
  const [cardTaxType, setCardTaxType] = useState<'val' | 'percent'>('val');
  const [cardTotal, setCardTotal] = useState<string>('');
  const [cardLastEdited, setCardLastEdited] = useState<'price' | 'total'>('price');
  const [cardSpec, setCardSpec] = useState<string>('');
  const cardSearchInputRef = useRef<HTMLInputElement | null>(null);
  const cardQtyInputRef = useRef<HTMLInputElement | null>(null);

  const cardSearchMatches = useMemo(() => {
    const q = cardItemSearch.trim().toLowerCase();
    if (!q) return localItemsDatabase.slice(0, 10);
    return localItemsDatabase
      .filter(
        (i) =>
          (i.name && i.name.toLowerCase().includes(q)) ||
          (i.code && i.code.toLowerCase().includes(q)) ||
          (i.barcode && i.barcode.toLowerCase().includes(q)) ||
          (i.altUnits || []).some((u) => u.barcode && u.barcode.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [cardItemSearch, localItemsDatabase]);

  // Modify Invoice Item Modal State
  const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
  const [modifyItemIndex, setModifyItemIndex] = useState<number>(-1);
  const [modifyItemName, setModifyItemName] = useState<string>('');
  const [modifyItemQty, setModifyItemQty] = useState<string>('');
  const [modifyItemPrice, setModifyItemPrice] = useState<string>('');
  const [modifyItemTotal, setModifyItemTotal] = useState<string>('');
  const [modifyItemSpec, setModifyItemSpec] = useState<string>('');
  const modifyQtyInputRef = useRef<HTMLInputElement | null>(null);

  // New Item Registration Modal State
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [newInputItemName, setNewInputItemName] = useState('');
  const [newInputItemCode, setNewInputItemCode] = useState('');
  const [editBuyPrice, setEditBuyPrice] = useState('');
  const [editItemCategory, setEditItemCategory] = useState('');
  const [editCashPriceManual, setEditCashPriceManual] = useState('');
  const [editWholesalePriceManual, setEditWholesalePriceManual] = useState('');
  const [editQty, setEditQty] = useState('');

  // 🌳 نافذة إضافة هيكل شجري متكامل للصنف الجديد (مجموعة > تصنيف > نوع > صنف)
  const [isNewHierarchyModalOpen, setIsNewHierarchyModalOpen] = useState(false);
  const [hierGroup, setHierGroup] = useState('');
  const [hierCompany, setHierCompany] = useState('');
  const [hierType, setHierType] = useState('');
  const [hierItemName, setHierItemName] = useState('');
  const [hierItemCode, setHierItemCode] = useState('');
  const [hierBuyPrice, setHierBuyPrice] = useState('');
  const [hierCashPrice, setHierCashPrice] = useState('');
  const [hierWholesalePrice, setHierWholesalePrice] = useState('');
  const [hierStock, setHierStock] = useState('');

  // Auto-Focus helper for modals
  const autoFocusModalFirstInput = (containerRefId: string) => {
    setTimeout(() => {
      const container = document.getElementById(containerRefId);
      if (container) {
        const input = container.querySelector<HTMLInputElement | HTMLSelectElement>(
          'input:not([readonly]):not([type="hidden"]), select'
        );
        if (input) {
          input.focus();
          if ((input as HTMLInputElement).select) (input as HTMLInputElement).select();
        }
      }
    }, 80);
  };

  useEffect(() => {
    if (isOptionsModalOpen) autoFocusModalFirstInput('optionsModal');
  }, [isOptionsModalOpen]);

  useEffect(() => {
    if (isLookupModalOpen) autoFocusModalFirstInput('lookupModal');
  }, [isLookupModalOpen]);

  useEffect(() => {
    if (isNewItemModalOpen) autoFocusModalFirstInput('editItemModal');
  }, [isNewItemModalOpen]);

  // Keyboard Enter Navigation
  const handleKeyDownEnterNav = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
        if (isDetailCardOpen && target.id === 'input-card-qty') {
          e.preventDefault();
          confirmAddDetailedItem();
          return;
        }

        const modalContainer =
          target.closest('.modal-box') ||
          target.closest('.lookup-modal-box') ||
          target.closest('.app-container');

        if (modalContainer) {
          const focusable = Array.from(
            modalContainer.querySelectorAll<HTMLElement>(
              'input:not([readonly]):not([disabled]):not([type="hidden"]), select:not([disabled]), button:not([disabled])'
            )
          ).filter((el) => el.offsetParent !== null);

          const index = focusable.indexOf(target);
          if (index > -1 && index + 1 < focusable.length) {
            e.preventDefault();
            const nextEl = focusable[index + 1];
            nextEl.focus();
            if ((nextEl as HTMLInputElement).select) {
              (nextEl as HTMLInputElement).select();
            }
          }
        }
      }
    }
  };

  const computeQuickCardLine = (
    qStr: string,
    pStr: string,
    dStr: string,
    dType: 'val' | 'percent',
    tStr: string,
    tType: 'val' | 'percent'
  ) => {
    const q = Math.max(0, parseFloat(qStr) || 0);
    const p = Math.max(0, parseFloat(pStr) || 0);
    const d = Math.max(0, parseFloat(dStr) || 0);
    const t = Math.max(0, parseFloat(tStr) || 0);
    const gross = q * p;
    const actualDisc = dType === 'val' ? d : (gross * d) / 100;
    const afterDisc = Math.max(0, gross - actualDisc);
    const actualTax = tType === 'val' ? t : (afterDisc * t) / 100;
    const net = Math.max(0, afterDisc + actualTax);
    return { q, p, d, t, actualDisc, actualTax, net };
  };

  const syncCardTotalForward = (
    qStr: string,
    pStr: string,
    dStr: string,
    dType: 'val' | 'percent',
    tStr: string,
    tType: 'val' | 'percent'
  ) => {
    const pNum = parseFloat(pStr);
    const qNum = parseFloat(qStr) || 0;
    if (!isNaN(pNum) && qNum > 0) {
      const { net } = computeQuickCardLine(qStr, pStr, dStr, dType, tStr, tType);
      setCardTotal(net % 1 === 0 ? net.toString() : net.toFixed(2));
    } else if (pStr.trim() === '') {
      setCardTotal('');
    }
  };

  const handleCardPriceChange = (val: string) => {
    setCardPrice(val);
    setCardLastEdited('price');
    syncCardTotalForward(cardQty, val, cardDiscVal, cardDiscType, cardTaxVal, cardTaxType);
  };

  const handleCardQtyChange = (val: string) => {
    setCardQty(val);
    const q = parseFloat(val) || 0;
    if (cardLastEdited === 'total') {
      const tot = parseFloat(cardTotal);
      if (!isNaN(tot) && tot >= 0 && q > 0) {
        const t = Math.max(0, parseFloat(cardTaxVal) || 0);
        const d = Math.max(0, parseFloat(cardDiscVal) || 0);
        const afterDisc = cardTaxType === 'val' ? Math.max(0, tot - t) : tot / (1 + t / 100);
        const gross = cardDiscType === 'val' ? afterDisc + d : afterDisc / Math.max(0.0001, 1 - d / 100);
        const unitP = gross / q;
        const cleanP = Number(unitP.toFixed(4));
        setCardPrice(cleanP % 1 === 0 ? cleanP.toString() : cleanP.toFixed(2));
      }
    } else {
      syncCardTotalForward(val, cardPrice, cardDiscVal, cardDiscType, cardTaxVal, cardTaxType);
    }
  };

  const handleCardDiscChange = (val: string, nextType: 'val' | 'percent' = cardDiscType) => {
    setCardDiscVal(val);
    setCardDiscType(nextType);
    syncCardTotalForward(cardQty, cardPrice, val, nextType, cardTaxVal, cardTaxType);
  };

  const handleCardTaxChange = (val: string, nextType: 'val' | 'percent' = cardTaxType) => {
    setCardTaxVal(val);
    setCardTaxType(nextType);
    syncCardTotalForward(cardQty, cardPrice, cardDiscVal, cardDiscType, val, nextType);
  };

  const handleCardTotalChange = (val: string) => {
    setCardTotal(val);
    setCardLastEdited('total');
    const tot = parseFloat(val);
    const q = parseFloat(cardQty) || 0;
    if (!isNaN(tot) && tot >= 0 && q > 0) {
      const t = Math.max(0, parseFloat(cardTaxVal) || 0);
      const d = Math.max(0, parseFloat(cardDiscVal) || 0);
      const afterDisc = cardTaxType === 'val' ? Math.max(0, tot - t) : tot / (1 + t / 100);
      const gross = cardDiscType === 'val' ? afterDisc + d : afterDisc / Math.max(0.0001, 1 - d / 100);
      const unitP = gross / q;
      const cleanP = Number(unitP.toFixed(4));
      setCardPrice(cleanP % 1 === 0 ? cleanP.toString() : cleanP.toFixed(2));
    } else if (val.trim() === '') {
      setCardPrice('');
    }
  };

  const recalcRowTotal = (row: WorkspaceItemRow, nextQty: number, nextPrice: number): WorkspaceItemRow => {
    const gross = nextQty * nextPrice;
    const dVal = Number(row.discVal || 0);
    const actualDisc = row.discType === 'val' ? dVal : (gross * dVal) / 100;
    const afterDisc = Math.max(0, gross - actualDisc);
    const tVal = Number(row.taxVal || 0);
    const actualTax = row.taxType === 'val' ? tVal : (afterDisc * tVal) / 100;
    const factor = row.unitFactor || 1;
    return {
      ...row,
      qty: nextQty,
      baseQty: Number((nextQty * factor).toFixed(4)),
      price: nextPrice,
      actualDisc: Number(actualDisc.toFixed(2)),
      actualTax: Number(actualTax.toFixed(2)),
      total: Number(Math.max(0, afterDisc + actualTax).toFixed(2)),
    };
  };

  const updateTableRowQty = (index: number, val: string) => {
    const q = parseFloat(val) || 0;
    setCurrentInvoiceItems((prev) =>
      prev.map((r, i) => (i !== index ? r : recalcRowTotal(r, q, r.price)))
    );
  };

  const updateTableRowPrice = (index: number, val: string) => {
    const p = parseFloat(val) || 0;
    setCurrentInvoiceItems((prev) =>
      prev.map((r, i) => (i !== index ? r : recalcRowTotal(r, r.qty, p)))
    );
  };

  const updateTableRowTotal = (index: number, val: string) => {
    const tot = parseFloat(val) || 0;
    setCurrentInvoiceItems((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const unitP = r.qty > 0 ? tot / r.qty : tot;
        return { ...r, price: Number(unitP.toFixed(4)), total: tot };
      })
    );
  };

  // Open Blank Quick-Add Card (+ إضافة صنف)
  const openBlankQuickAddCard = () => {
    setCardItem(null);
    setCardItemSearch('');
    setShowCardDropdown(false);
    setCardUnit('قطعة');
    setCardUnitFactor(1);
    setCardQty('1');
    setCardPrice('');
    setCardDiscVal('');
    setCardDiscType('val');
    setCardTaxVal('');
    setCardTaxType('val');
    setCardTotal('');
    setCardLastEdited('price');
    setCardSpec('');
    setIsDetailCardOpen(true);

    requestAnimationFrame(() => {
      setTimeout(() => {
        if (cardSearchInputRef.current) {
          cardSearchInputRef.current.focus();
        }
      }, 60);
    });
  };

  // Open Item Detail Card prefilled from search or catalog tree
  const openItemDetailCard = (
    item: any,
    preselectedUnit?: { name: string; factor: number; price?: number }
  ) => {
    setCardItem(item);
    setCardItemSearch(item.name || '');
    setShowCardDropdown(false);
    const chosenUnit = preselectedUnit?.name || item.typeName || 'قطعة';
    const chosenFactor = preselectedUnit?.factor && preselectedUnit.factor > 0 ? preselectedUnit.factor : 1;
    setCardUnit(chosenUnit);
    setCardUnitFactor(chosenFactor);
    const baseP = getItemPriceForTier(item, activePricingTier);
    const calculatedP =
      preselectedUnit?.price && preselectedUnit.price > 0
        ? preselectedUnit.price
        : Number((baseP * chosenFactor).toFixed(2));
    const pStr = calculatedP > 0 ? calculatedP.toString() : '';
    setCardPrice(pStr);
    setCardQty('1');
    setCardDiscVal('');
    setCardDiscType('val');
    setCardTaxVal('');
    setCardTaxType('val');
    setCardTotal(pStr);
    setCardLastEdited('price');
    setCardSpec('');
    setIsLookupModalOpen(false);
    setIsDetailCardOpen(true);

    requestAnimationFrame(() => {
      setTimeout(() => {
        if (cardQtyInputRef.current) {
          cardQtyInputRef.current.focus();
          cardQtyInputRef.current.select();
        }
      }, 60);
    });
  };

  const handleSelectCardUnit = (unitName: string) => {
    setCardUnit(unitName);
    if (!cardItem) {
      setCardUnitFactor(1);
      return;
    }
    const baseName = cardItem.typeName || 'قطعة';
    const basePrice = getItemPriceForTier(cardItem, activePricingTier);
    let nextFactor = 1;
    let nextPrice = basePrice;

    if (unitName !== baseName) {
      const au = (cardItem.altUnits || []).find((u: ItemAltUnit) => u.name === unitName);
      if (au) {
        nextFactor = au.factor > 0 ? au.factor : 1;
        const unitCustom = isSale
          ? activePricingTier === 'wholesale'
            ? au.wholesalePrice || au.salePrice
            : au.salePrice
          : au.buyPrice;
        nextPrice = unitCustom && unitCustom > 0 ? unitCustom : Number((basePrice * nextFactor).toFixed(2));
      }
    }

    setCardUnitFactor(nextFactor);
    const pStr = nextPrice > 0 ? nextPrice.toString() : '';
    setCardPrice(pStr);
    setCardLastEdited('price');
    syncCardTotalForward(cardQty, pStr, cardDiscVal, cardDiscType, cardTaxVal, cardTaxType);
  };

  const handleBarcodeDetected = (scannedCode: string) => {
    const clean = scannedCode.trim().toLowerCase();
    if (!clean) return;
    setIsCameraScannerOpen(false);

    for (const item of localItemsDatabase) {
      const matchedAlt = (item.altUnits || []).find(
        (u: ItemAltUnit) => u.barcode && u.barcode.trim().toLowerCase() === clean
      );
      if (matchedAlt) {
        const unitCustom = isSale
          ? activePricingTier === 'wholesale'
            ? matchedAlt.wholesalePrice || matchedAlt.salePrice
            : matchedAlt.salePrice
          : matchedAlt.buyPrice;
        openItemDetailCard(item, {
          name: matchedAlt.name,
          factor: matchedAlt.factor || 1,
          price: unitCustom,
        });
        showToast(`تم قراءة الصنف: ${item.name} (${matchedAlt.name})`, 'success');
        return;
      }
      if (
        (item.barcode && item.barcode.trim().toLowerCase() === clean) ||
        (item.code && item.code.trim().toLowerCase() === clean)
      ) {
        openItemDetailCard(item);
        showToast(`تم قراءة الصنف: ${item.name}`, 'success');
        return;
      }
    }

    setWorkspaceItemSearch(scannedCode.trim());
    setShowWorkspaceItemDropdown(true);
    showToast(`لم يتم العثور على صنف مطابق للباركود: ${scannedCode}`, 'warning');
  };

  // Confirm Adding Item from Dark Quick-Add Card
  const confirmAddDetailedItem = () => {
    const resolvedName = (cardItem?.name || cardItemSearch || '').trim();
    if (!resolvedName) {
      showToast('يرجى إدخال أو اختيار اسم الصنف أولاً', 'warning');
      return;
    }

    const q = parseFloat(cardQty) || 0;
    if (q <= 0) {
      showToast('يرجى إدخال كمية صحيحة أكبر من صفر', 'warning');
      return;
    }

    let p = parseFloat(cardPrice) || 0;
    const totVal = parseFloat(cardTotal);
    const { actualDisc, actualTax, net } = computeQuickCardLine(
      cardQty,
      p.toString(),
      cardDiscVal,
      cardDiscType,
      cardTaxVal,
      cardTaxType
    );

    if ((p <= 0 || isNaN(p)) && !isNaN(totVal) && totVal > 0 && q > 0) {
      p = Number((totVal / q).toFixed(4));
    }

    const finalItemTotal =
      cardLastEdited === 'total' && !isNaN(totVal) && totVal >= 0
        ? Number(totVal.toFixed(2))
        : Number(net.toFixed(2));
    const s = cardSpec.trim();
    const dVal = parseFloat(cardDiscVal) || 0;
    const tVal = parseFloat(cardTaxVal) || 0;

    const matchedCatalog =
      cardItem ||
      localItemsDatabase.find((i) => i.name.trim().toLowerCase() === resolvedName.toLowerCase()) || {
        code: `ITM-ADHOC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: resolvedName,
        typeName: 'قطعة',
        stock: 0,
        buyPrice: isSale ? 0 : p,
        cashPrice: isSale ? p : 0,
        wholesalePrice: 0,
        itemId: undefined,
        altUnits: [],
      };

    const resolvedUnit = cardUnit || matchedCatalog.typeName || 'قطعة';
    const resolvedFactor = cardUnitFactor > 0 ? cardUnitFactor : 1;
    const addedBaseQty = Number((q * resolvedFactor).toFixed(4));

    if (isSale && matchedCatalog.itemId) {
      setLocalItemsDatabase((prev) =>
        prev.map((i) =>
          i.code === matchedCatalog.code ? { ...i, stock: Number(((i.stock || 0) - addedBaseQty).toFixed(2)) } : i
        )
      );
    }

    setCurrentInvoiceItems((prev) => {
      const hasLineMods = dVal > 0 || tVal > 0;
      const targetIndex = findMatchingInvoiceRowIndex(
        prev,
        resolvedName,
        matchedCatalog,
        s,
        hasLineMods,
        resolvedUnit
      );

      if (targetIndex > -1) {
        return prev.map((row, idx) => {
          if (idx === targetIndex) {
            const newQty = Number((row.qty + q).toFixed(2));
            const newPrice = p > 0 ? p : row.price;
            return recalcRowTotal(row, newQty, newPrice);
          }
          return row;
        });
      }

      const cPrice = Number(matchedCatalog.cashPrice || getItemPriceForTier(matchedCatalog, 'cash'));
      const wPrice = Number(matchedCatalog.wholesalePrice || getItemPriceForTier(matchedCatalog, 'wholesale'));
      const bPrice = Number(matchedCatalog.buyPrice || getItemPriceForTier(matchedCatalog, 'buy'));

      const newRow: WorkspaceItemRow = {
        rowId: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        code: matchedCatalog.code,
        name: resolvedName,
        unit: resolvedUnit,
        unitFactor: resolvedFactor,
        baseQty: addedBaseQty,
        altUnits: (matchedCatalog as any).altUnits || [],
        spec: s,
        qty: q,
        price: p,
        total: finalItemTotal,
        discVal: dVal,
        discType: cardDiscType,
        actualDisc: Number(actualDisc.toFixed(2)),
        taxVal: tVal,
        taxType: cardTaxType,
        actualTax: Number(actualTax.toFixed(2)),
        itemId: matchedCatalog.itemId,
        costPrice: Number(((matchedCatalog.buyPrice || 0) * resolvedFactor).toFixed(4)),
        cashPrice: cPrice > 0 ? cPrice : p,
        wholesalePrice: wPrice > 0 ? wPrice : cPrice > 0 ? cPrice : p,
        buyPrice: bPrice > 0 ? bPrice : 0,
      };
      return [...prev, newRow];
    });

    showToast(s ? `تم إدراج البند: ${resolvedName}` : `تمت إضافة الصنف: ${resolvedName}`, 'info');
    setIsDetailCardOpen(false);
    setCardItem(null);
    setCardItemSearch('');
  };

  // Modify Row
  const openModifyInvoiceItem = (index: number) => {
    const item = currentInvoiceItems[index];
    if (!item) return;
    setModifyItemIndex(index);
    setModifyItemName(item.name);
    setModifyItemQty(item.qty.toString());
    setModifyItemPrice(item.price.toString());
    setModifyItemTotal((item.qty * item.price).toFixed(2));
    setModifyItemSpec(item.spec || '');
    setIsModifyModalOpen(true);

    setTimeout(() => {
      if (modifyQtyInputRef.current) {
        modifyQtyInputRef.current.focus();
        modifyQtyInputRef.current.select();
      }
    }, 60);
  };

  const saveModifiedInvoiceItem = () => {
    if (modifyItemIndex < 0 || modifyItemIndex >= currentInvoiceItems.length) return;
    const q = parseFloat(modifyItemQty) || 0;
    const p = parseFloat(modifyItemPrice) || 0;
    const s = modifyItemSpec.trim();

    if (q <= 0) {
      showToast('يرجى إدخال كمية صحيحة أكبر من صفر', 'warning');
      return;
    }

    setCurrentInvoiceItems((prev) =>
      prev.map((item, idx) =>
        idx === modifyItemIndex
          ? {
              ...recalcRowTotal(item, q, p),
              spec: s,
            }
          : item
      )
    );

    setIsModifyModalOpen(false);
  };

  const removeItem = (index: number) => {
    const removed = currentInvoiceItems[index];
    if (removed && isSale && removed.itemId) {
      const removedBaseQty = Number(((removed.qty || 0) * (removed.unitFactor || 1)).toFixed(2));
      setLocalItemsDatabase((prev) =>
        prev.map((i) => (i.code === removed.code ? { ...i, stock: (i.stock || 0) + removedBaseQty } : i))
      );
    }
    setCurrentInvoiceItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Add Payment Row
  const addPaymentRow = (defaultMethod: string = 'نقدي', defaultAmount: number = 0) => {
    setPaymentRows((prev) => [
      ...prev,
      { id: String(Date.now() + Math.random()), method: defaultMethod, amount: defaultAmount || 0 },
    ]);
  };

  const removePaymentRow = (id: string) => {
    setPaymentRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Payment Mode & Treasury Quick Helpers
  const handleSelectPaymentStatusMode = (modeChoice: 'paid' | 'credit' | 'partial') => {
    setPaymentStatusMode(modeChoice);
    if (modeChoice === 'paid') {
      setSelectedInvoiceType(isReturn ? 'return_nagdi' : 'nagdi');
      setPaymentRows([]);
      setPartialPaidInput('');
    } else if (modeChoice === 'credit') {
      setSelectedInvoiceType(isReturn ? 'return_ajel' : 'ajel');
      setPaymentRows([]);
      setPartialPaidInput('');
    } else {
      setSelectedInvoiceType(isReturn ? 'return_ajel' : 'ajel');
      const existingPaid = paymentRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      if (existingPaid > 0) {
        setPartialPaidInput(String(existingPaid));
      } else {
        setPaymentRows([{ id: 'partial_1', method: selectedTreasuryMethod, amount: 0 }]);
        setPartialPaidInput('');
      }
    }
  };

  const handleSelectTreasuryChip = (methodName: string) => {
    setSelectedTreasuryMethod(methodName);
    if (paymentRows.length > 0) {
      setPaymentRows((prev) => prev.map((r, idx) => (idx === 0 ? { ...r, method: methodName } : r)));
    }
  };

  // Calculations
  const totals = useMemo(() => {
    let totalQtySum = 0;
    let itemsSubTotal = 0;
    let itemDiscountsSum = 0;
    let itemTaxesSum = 0;

    currentInvoiceItems.forEach((i) => {
      totalQtySum += Number(i.qty) || 0;
      itemsSubTotal += (Number(i.price) || 0) * (Number(i.qty) || 0);
      itemDiscountsSum += Number(i.actualDisc) || 0;
      itemTaxesSum += Number(i.actualTax) || 0;
    });

    const afterItemDiscBase = Math.max(0, itemsSubTotal - itemDiscountsSum);
    const globalDiscInput = parseFloat(globalInvDisc) || 0;
    const globalDiscCalculated =
      invDiscType === 'percent' ? afterItemDiscBase * (globalDiscInput / 100) : globalDiscInput;

    const globalTaxInput = parseFloat(globalInvTax) || 0;
    const taxableBase = Math.max(0, afterItemDiscBase - globalDiscCalculated);
    const globalTaxCalculated =
      invTaxType === 'percent' ? taxableBase * (globalTaxInput / 100) : globalTaxInput;

    const totalDiscount = itemDiscountsSum + globalDiscCalculated;
    const totalTax = itemTaxesSum + globalTaxCalculated;
    const extraVal = parseFloat(extraIncomeVal) || 0;
    const netTotal = Math.max(0, itemsSubTotal - totalDiscount + totalTax + extraVal);

    let paidTotal = 0;
    if (paymentRows.length === 0) {
      paidTotal = selectedInvoiceType === 'nagdi' || selectedInvoiceType === 'return_nagdi' ? netTotal : 0;
    } else {
      paymentRows.forEach((r) => {
        paidTotal += Math.max(0, Number(r.amount) || 0);
      });
    }

    const remainTotal = Math.max(0, netTotal - paidTotal);

    return {
      qtySum: totalQtySum,
      subtotal: itemsSubTotal,
      discount: totalDiscount,
      tax: totalTax,
      extra: extraVal,
      net: netTotal,
      paid: paidTotal,
      remain: remainTotal,
    };
  }, [currentInvoiceItems, globalInvDisc, invDiscType, globalInvTax, invTaxType, extraIncomeVal, paymentRows, selectedInvoiceType]);

  // Open New Item Modal
  const openEditModalForNewItem = () => {
    setNewInputItemName('');
    const newCode = 'UA' + String(localItemsDatabase.length + 101);
    setNewInputItemCode(newCode);
    setEditBuyPrice('');
    setEditCashPriceManual('');
    setEditWholesalePriceManual('');
    setEditQty('');
    const groups = [...new Set(localItemsDatabase.map((i) => i.group))];
    setEditItemCategory(groups[0] || 'بويات');
    setIsNewItemModalOpen(true);
  };

  // 🌳 فتح نافذة إضافة هيكل شجري متكامل (مجموعة > تصنيف/شركة > نوع > صنف) - خالي تماماً ليدخل المستخدم بياناته لأول مرة
  const openNewHierarchyModal = () => {
    setHierGroup('');
    setHierCompany('');
    setHierType('');
    setHierItemName('');
    const newCode = localItemsDatabase.length > 0 ? ('UA' + String(localItemsDatabase.length + 101)) : '';
    setHierItemCode(newCode);
    setHierBuyPrice('');
    setHierCashPrice('');
    setHierWholesalePrice('');
    setHierStock('');
    setIsNewHierarchyModalOpen(true);
  };

  const saveNewHierarchyModal = () => {
    const grp = hierGroup.trim();
    const comp = hierCompany.trim();
    const typ = hierType.trim();
    const name = hierItemName.trim();
    const code = hierItemCode.trim() || ('UA' + String(localItemsDatabase.length + 101));

    if (!grp) {
      alert('يرجى تحديد أو كتابة اسم المجموعة الرئيسية');
      return;
    }
    if (!comp) {
      alert('يرجى تحديد أو كتابة اسم التصنيف أو الشركة');
      return;
    }
    if (!typ) {
      alert('يرجى تحديد أو كتابة اسم النوع أو القسم الفرعي');
      return;
    }
    if (!name) {
      alert('يرجى إدخال اسم الصنف');
      return;
    }

    const buyP = parseFloat(hierBuyPrice) || 0;
    const cashP = parseFloat(hierCashPrice) || buyP;
    const wholesaleP = parseFloat(hierWholesalePrice) || cashP;
    const qtyP = parseFloat(hierStock) || 0;

    const newItem = {
      code,
      name,
      barcode: '',
      altUnits: [],
      group: grp,
      company: comp,
      typeName: typ,
      stock: qtyP,
      buyPrice: buyP,
      cashPrice: cashP,
      wholesalePrice: wholesaleP,
      wholesaleBuyPrice: buyP,
      itemId: `item_${Date.now()}`,
    };

    setLocalItemsDatabase((prev) => [...prev, newItem]);

    const newAppItem: Item = {
      id: newItem.itemId,
      code,
      name,
      category: grp,
      material: comp,
      unit: typ,
      quantity: qtyP,
      purchasePrice: buyP,
      salePrice: cashP,
      wholesalePrice: wholesaleP,
    };

    onUpdateData(
      {
        ...appData,
        items: [...(appData.items || []), newAppItem],
      },
      {
        action: 'create_item',
        module: 'المخزون',
        details: `إضافة هيكل شجري كامل: ${grp} > ${comp} > ${typ} > ${name}`,
      }
    );

    setIsNewHierarchyModalOpen(false);

    // توجيه الشجرة فوراً إلى موقع الصنف الجديد لاختياره بنقرة واحدة
    setHierarchyState({
      step: 'items',
      selectedGroup: grp,
      selectedCompany: comp,
      selectedType: typ,
    });
    setGlobalLookupSearch('');

    showToast(`تمت إضافة المجموعة [${grp}] والتصنيف [${comp}] والنوع [${typ}] والصنف [${name}] بنجاح`, 'success');
  };

  const saveNewItemData = () => {
    const name = newInputItemName.trim();
    const code = newInputItemCode.trim();
    if (!name) {
      showToast('يرجى إدخال اسم الصنف', 'warning');
      return;
    }

    const buyP = parseFloat(editBuyPrice) || 0;
    const cashP = parseFloat(editCashPriceManual) || buyP;
    const wholesaleP = parseFloat(editWholesalePriceManual) || cashP;
    const qtyP = parseFloat(editQty) || 0;

    const newItem = {
      code,
      barcode: '',
      altUnits: [],
      name,
      group: editItemCategory || 'عام',
      company: 'عام',
      typeName: 'عام',
      stock: qtyP,
      buyPrice: buyP,
      cashPrice: cashP,
      wholesalePrice: wholesaleP,
      wholesaleBuyPrice: buyP,
      itemId: `item_${Date.now()}`,
    };

    setLocalItemsDatabase((prev) => [...prev, newItem]);

    const newAppItem: Item = {
      id: newItem.itemId,
      code,
      name,
      category: newItem.group,
      quantity: qtyP,
      purchasePrice: buyP,
      salePrice: cashP,
      wholesalePrice: wholesaleP,
    };

    onUpdateData(
      {
        ...appData,
        items: [...(appData.items || []), newAppItem],
      },
      {
        action: 'create_item',
        module: 'المخزون',
        details: `إضافة صنف جديد: ${name} بكود ${code}`,
      }
    );

    setIsNewItemModalOpen(false);
    openItemDetailCard(newItem);
  };

  // Save Invoice & Post to Ledger & Database
  const saveInvoice = (bypassFlags?: { belowCostApproved?: boolean; creditLimitApproved?: boolean }) => {
    if (currentInvoiceItems.length === 0) {
      showToast('الفاتورة فارغة! يرجى إدراج صنف واحد على الأقل.', 'warning');
      return;
    }

    const belowCostApproved = !!bypassFlags?.belowCostApproved;
    const creditLimitApproved = !!bypassFlags?.creditLimitApproved;

    // 🛡️ Below-Cost Sale Guard
    if (isSale && !isReturn && appData.settings?.preventBelowCostSale && !allowBelowCost && !belowCostApproved) {
      const violations: string[] = [];
      currentInvoiceItems.forEach((row) => {
        const dbItm = localItemsDatabase.find((it) => it.itemId === row.itemId || it.name === row.name);
        const factor = row.unitFactor || 1;
        const baseCost = Number(dbItm?.buyPrice || 0);
        const unitCost = baseCost > 0 ? baseCost * factor : Number(row.costPrice || 0);
        const effectiveUnitPrice = row.qty > 0 ? row.total / row.qty : row.price;
        if (unitCost > 0 && effectiveUnitPrice < unitCost - 0.01) {
          violations.push(
            `${row.name}: سعر البيع (${effectiveUnitPrice.toFixed(2)}) أقل من التكلفة (${unitCost.toFixed(2)})`
          );
        }
      });
      if (violations.length > 0) {
        setPinGuardState({
          mode: 'below_cost',
          title: 'تنبيه البيع بأقل من سعر التكلفة',
          message: 'تم تفعيل قيد منع البيع بأقل من سعر التكلفة. أدخل كود اعتماد المدير لإتمام حفظ الفاتورة.',
          details: violations,
          belowCostApproved: true,
          creditLimitApproved,
        });
        return;
      }
    }

    // 🛡️ Credit Limit Enforcement (warn / pin / block)
    if (isSale && !isReturn && matchedParty && totals.remain > 0 && !creditLimitApproved) {
      const custLimit = Number((matchedParty as Customer).creditLimit || 0);
      const projectedBal = partyBalance + totals.remain;
      if (custLimit > 0 && projectedBal > custLimit) {
        const policy = appData.settings?.enforceCreditLimit || 'warn';
        if (policy === 'block') {
          showToast(
            `ممنوع الحفظ: العميل "${matchedParty.name}" سيتجاوز سقف الائتمان المسموح (${custLimit.toFixed(2)} ج.م). الرصيد المتوقع: ${projectedBal.toFixed(2)} ج.م`,
            'error'
          );
          return;
        }
        if (policy === 'pin') {
          setPinGuardState({
            mode: 'credit_limit',
            title: 'اعتماد تجاوز حد الائتمان',
            message: `العميل "${matchedParty.name}" سيتجاوز حد الائتمان المسموح (${custLimit.toFixed(2)} ج.م). الرصيد بعد الفاتورة سيكون ${projectedBal.toFixed(2)} ج.م.`,
            details: [
              `الرصيد الحالي: ${partyBalance.toFixed(2)} ج.م`,
              `الآجل بالفاتورة: ${totals.remain.toFixed(2)} ج.م`,
              `حد الائتمان المحدد: ${custLimit.toFixed(2)} ج.م`,
            ],
            belowCostApproved,
            creditLimitApproved: true,
          });
          return;
        }
        setCreditWarnModal({
          message: `العميل "${matchedParty.name}" سيتجاوز حد الائتمان المسموح (${custLimit.toFixed(2)} ج.م). الرصيد بعد الحفظ سيكون ${projectedBal.toFixed(2)} ج.م.`,
          belowCostApproved,
        });
        return;
      }
    }

    const defaultPartyName = isSale
      ? custName.trim() || 'عميل نقدي'
      : custName.trim() || 'مورد عام';

    let finalPayments = [...paymentRows];
    if (finalPayments.length === 0) {
      if (selectedInvoiceType === 'nagdi' || selectedInvoiceType === 'return_nagdi') {
        finalPayments = [{ id: '1', method: selectedTreasuryMethod || 'نقدي', amount: totals.net }];
      }
    }

    const primaryMethodKey = finalPayments.length > 1
      ? 'split'
      : mapPaymentMethodToKey(finalPayments[0]?.method || selectedTreasuryMethod);

    const paymentSplits = finalPayments
      .filter((r) => (Number(r.amount) || 0) > 0)
      .map((r) => ({
        method: mapPaymentMethodToKey(r.method),
        label: r.method,
        amount: Number(r.amount) || 0,
      }));

    const activeBranchName =
      appData.branches?.find((b) => b.id === activeBranchId)?.name || 'الفرع الرئيسي';
    const resolvedPartyCode = custCode.trim() || matchedParty?.code || matchedParty?.id || undefined;

    if (isSale) {
      const invoiceData: SaleInvoice = {
        id: editingInvoice?.id || invoiceId,
        date: invDate,
        time: invTime,
        type: selectedInvoiceType,
        salesType: 'cash',
        customerId: matchedParty?.id,
        customerCode: resolvedPartyCode,
        customerName: defaultPartyName,
        phone: custPhone.trim(),
        notes: jobSite,
        items: currentInvoiceItems.map((i) => {
          const factor = i.unitFactor || 1;
          return {
            itemId: i.itemId || undefined,
            code: i.code,
            name: i.name,
            unit: i.unit || 'قطعة',
            unitFactor: factor,
            baseQty: Number(((i.qty || 0) * factor).toFixed(4)),
            qty: i.qty,
            price: i.price,
            total: i.total,
            spec: i.spec,
            costPrice: i.costPrice || 0,
            discount: i.actualDisc || 0,
            discountType: i.discType === 'val' ? 'fixed' : 'percent',
            discountValue: i.discVal || 0,
            tax: i.actualTax || 0,
            taxType: i.taxType === 'val' ? 'fixed' : 'percent',
            taxValue: i.taxVal || 0,
          };
        }),
        subtotal: totals.subtotal,
        discount: totals.discount,
        discountType: invDiscType === 'percent' ? 'percent' : 'fixed',
        tax: totals.tax,
        taxType: invTaxType === 'percent' ? 'percent' : 'fixed',
        extraRevenueAmount: totals.extra,
        extraRevenueName: extraIncomeName,
        fees: 0,
        total: totals.net,
        paidAmount: totals.paid,
        remainingAmount: totals.remain,
        paymentMethod: primaryMethodKey,
        paymentSplits,
        originalInvoiceId: isReturn && originalInvoiceId ? originalInvoiceId : undefined,
        returnKind: isReturn ? returnKind : undefined,
        classificationStatus: 'classified',
        status: 'approved',
        branchId: activeBranchId,
        branchName: activeBranchName,
        createdAt: editingInvoice?.createdAt || new Date().toISOString(),
        createdBy: creatorName,
        updatedBy: activeEditorName,
      };

      const isEditing = !!editingInvoice?.id;
      try {
        const updated = postSaleInvoice(appData, invoiceData, isEditing, editingInvoice?.id);

        onUpdateData(updated, {
          action: isEditing ? 'تعديل فاتورة مبيعات' : 'حفظ فاتورة مبيعات',
          module: 'المبيعات',
          details: `فاتورة مبيعات #${invNum} - العميل: ${defaultPartyName} - الصافي: ${totals.net.toFixed(2)} ج.م`,
        });

        showToast(`✅ تم حفظ وترحيل فاتورة المبيعات #${invNum} وتحديث الحسابات والمخزن والأسعار بنجاح`, 'success');
        onClose();
      } catch (err: any) {
        showToast(err?.message || 'تعذر حفظ فاتورة المبيعات', 'error');
      }
    } else {
      const invoiceData: PurchaseInvoice = {
        id: editingInvoice?.id || invoiceId,
        date: invDate,
        time: invTime,
        type: selectedInvoiceType,
        purchaseType: 'cash',
        supplierId: matchedParty?.id,
        supplierCode: resolvedPartyCode,
        supplierName: defaultPartyName,
        phone: custPhone.trim(),
        notes: jobSite,
        items: currentInvoiceItems.map((i) => {
          const factor = i.unitFactor || 1;
          return {
            itemId: i.itemId || undefined,
            code: i.code,
            name: i.name,
            unit: i.unit || 'قطعة',
            unitFactor: factor,
            baseQty: Number(((i.qty || 0) * factor).toFixed(4)),
            qty: i.qty,
            price: i.price,
            total: i.total,
            spec: i.spec,
            costPrice: i.price,
            discount: i.actualDisc || 0,
            discountType: i.discType === 'val' ? 'fixed' : 'percent',
            discountValue: i.discVal || 0,
            tax: i.actualTax || 0,
            taxType: i.taxType === 'val' ? 'fixed' : 'percent',
            taxValue: i.taxVal || 0,
          };
        }),
        subtotal: totals.subtotal,
        discount: totals.discount,
        discountType: invDiscType === 'percent' ? 'percent' : 'fixed',
        tax: totals.tax,
        taxType: invTaxType === 'percent' ? 'percent' : 'fixed',
        extraRevenueAmount: totals.extra,
        extraRevenueName: extraIncomeName,
        fees: 0,
        total: totals.net,
        paidAmount: totals.paid,
        remainingAmount: totals.remain,
        paymentMethod: primaryMethodKey,
        paymentSplits,
        originalInvoiceId: isReturn && originalInvoiceId ? originalInvoiceId : undefined,
        returnKind: isReturn ? returnKind : undefined,
        classificationStatus: 'classified',
        status: 'approved',
        branchId: activeBranchId,
        branchName: activeBranchName,
        createdAt: editingInvoice?.createdAt || new Date().toISOString(),
        createdBy: creatorName,
        updatedBy: activeEditorName,
      };

      const isEditing = !!editingInvoice?.id;
      try {
        const updated = postPurchaseInvoice(appData, invoiceData, isEditing, editingInvoice?.id);

        onUpdateData(updated, {
          action: isEditing ? 'تعديل فاتورة مشتريات' : 'حفظ فاتورة مشتريات',
          module: 'المشتريات',
          details: `فاتورة مشتريات #${invNum} - المورد: ${defaultPartyName} - الصافي: ${totals.net.toFixed(2)} ج.م`,
        });

        showToast(`✅ تم حفظ وترحيل فاتورة المشتريات #${invNum} وتحديث التوريدات والمخزن بنجاح`, 'success');
        onClose();
      } catch (err: any) {
        showToast(err?.message || 'تعذر حفظ فاتورة المشتريات', 'error');
      }
    }
  };

  // Direct Print Invoice (Mode A - Strictly Read-Only)
  const handlePrintCurrentInvoice = () => {
    const defaultPartyName = isSale
      ? custName.trim() || 'عميل نقدي'
      : custName.trim() || 'مورد عام';

    const resolvedPartyCode = custCode.trim() || matchedParty?.code || matchedParty?.id || '-';
    const activeBranchName =
      appData.branches?.find((b) => b.id === activeBranchId)?.name || 'الفرع الرئيسي';

    const tempInvoice: any = {
      id: Number(invNum) || invoiceId,
      date: invDate,
      time: invTime,
      type: selectedInvoiceType,
      salesType: isSale ? 'cash' : undefined,
      purchaseType: !isSale ? 'cash' : undefined,
      customerId: isSale ? matchedParty?.id : undefined,
      customerCode: isSale ? resolvedPartyCode : undefined,
      supplierId: !isSale ? matchedParty?.id : undefined,
      supplierCode: !isSale ? resolvedPartyCode : undefined,
      customerName: defaultPartyName,
      supplierName: defaultPartyName,
      phone: custPhone,
      notes: jobSite,
      originalInvoiceId: isReturn && originalInvoiceId ? originalInvoiceId : undefined,
      returnKind: isReturn ? returnKind : undefined,
      items: currentInvoiceItems.map((i) => ({
        itemId: i.itemId || i.code,
        code: i.code,
        name: i.name,
        unit: i.unit || 'قطعة',
        qty: i.qty,
        price: i.price,
        total: i.total,
        spec: i.spec,
        discount: i.actualDisc || 0,
        tax: i.actualTax || 0,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      extraRevenueAmount: totals.extra,
      extraRevenueName: extraIncomeName,
      total: totals.net,
      paidAmount: totals.paid,
      remainingAmount: totals.remain,
      paymentMethod: mapPaymentMethodToKey(paymentRows[0]?.method || selectedTreasuryMethod || 'نقدي'),
      branchId: activeBranchId,
      branchName: activeBranchName,
      createdBy: creatorName,
      updatedBy: activeEditorName,
    };

    printInvoiceWindow(tempInvoice, isSale, appData.settings, showToast, 'A5', appData);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 lg:p-5 bg-slate-900/65 select-none overflow-hidden"
      dir="rtl"
      onKeyDown={handleKeyDownEnterNav}
    >
      {/* 📱 Scoped CSS — Enterprise Arabic ERP Workspace (Tajawal + Responsive Ergonomics + Tabular Numerals) */}
      <style>{`
        .app-container {
          width: 100%;
          max-width: 100%;
          background: #ffffff;
          border-radius: 0px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14);
          display: flex;
          flex-direction: column;
          height: 100%;
          max-height: 100dvh;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
          font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @media (min-width: 640px) {
          .app-container {
            border-radius: 10px;
            max-width: 720px;
            max-height: 94vh;
          }
        }
        @media (min-width: 1024px) {
          .app-container {
            max-width: 1040px;
            max-height: 92vh;
          }
        }
        .header-title {
          background: #1e293b;
          color: #ffffff;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
          box-sizing: border-box;
          border-top-left-radius: inherit;
          border-top-right-radius: inherit;
        }
        #liveTime {
          font-size: 12px;
          font-family: inherit;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          opacity: 0.92;
        }
        .main-content {
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
          overflow-x: hidden;
          overflow-y: auto;
          min-height: 0;
          box-sizing: border-box;
          background: #f8fafc;
        }
        @media (min-width: 640px) {
          .main-content {
            padding: 12px 14px;
            gap: 10px;
          }
        }
        .invoice-card {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          flex-shrink: 0;
          box-sizing: border-box;
          width: 100%;
        }
        @media (min-width: 640px) {
          .invoice-card {
            gap: 9px;
            padding: 11px 12px;
          }
        }
        .field-inline {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          position: relative;
          box-sizing: border-box;
        }
        .field-inline label {
          font-size: 11px;
          font-weight: 600;
          color: #475569;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .field-inline input, .field-inline select {
          padding: 5px 8px;
          border: 1px solid #cbd5e1;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
          outline: none;
          background: #f8fafc;
          width: 100%;
          min-height: 36px;
          box-sizing: border-box;
          font-family: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
        @media (min-width: 768px) {
          .field-inline input, .field-inline select {
            font-size: 13px;
            min-height: 36px;
            padding: 5px 10px;
          }
        }
        .field-inline input:focus, .field-inline select:focus {
          border-color: #2563eb;
          background: #ffffff;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.14);
        }
        .span-2 { grid-column: span 2; }
        .span-3 { grid-column: 1 / -1; }

        /* شريط حالة الحساب والدائن/المدين */
        .account-status-bar {
          background: #fef9c3;
          border: 1px solid #fde047;
          border-radius: 8px;
          padding: 7px 10px;
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 6px 10px;
          font-size: 12px;
          font-weight: 600;
          flex-shrink: 0;
          width: 100%;
          box-sizing: border-box;
        }

        .btn-action-top {
          width: 100%;
          min-height: 40px;
          padding: 8px 10px;
          background: #2563eb;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          box-sizing: border-box;
          white-space: nowrap;
          transition: background 0.15s ease;
        }
        .btn-action-top:hover {
          background: #1d4ed8;
        }
        .btn-action-alt {
          background: #1e293b;
        }
        .btn-action-alt:hover {
          background: #0f172a;
        }
        .table-responsive {
          width: 100%;
          flex: 1 1 200px;
          min-height: 160px;
          overflow-y: auto;
          overflow-x: hidden;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #ffffff;
          box-sizing: border-box;
        }
        .table-responsive table.invoice-items-grid-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          text-align: center;
          box-sizing: border-box;
          font-variant-numeric: tabular-nums;
        }
        .table-responsive th, .table-responsive td {
          border-bottom: 1px solid #e2e8f0;
          border-left: 1px solid #e2e8f0;
          vertical-align: middle;
          box-sizing: border-box;
        }
        .table-responsive th:last-child, .table-responsive td:last-child {
          border-left: none;
        }
        .table-responsive th {
          background: #f1f5f9;
          color: #1e293b;
          font-weight: 700;
          height: 36px;
          font-size: 11px;
          padding: 6px 3px;
          position: sticky;
          top: 0;
          z-index: 2;
          text-align: center;
          white-space: nowrap;
          border-bottom: 1px solid #cbd5e1;
        }
        @media (min-width: 768px) {
          .table-responsive th {
            font-size: 12px;
            padding: 6px 8px;
          }
        }
        .table-responsive tbody tr:hover {
          background: #f8fafc;
        }
        .table-responsive tbody tr td {
          padding: 6px 3px;
          line-height: 1.35;
          font-size: 11.5px;
          color: #0f172a;
        }
        @media (min-width: 768px) {
          .table-responsive tbody tr td {
            padding: 7px 8px;
            font-size: 12.5px;
          }
        }
        .col-seq { width: 42px; text-align: center; color: #64748b; }
        .col-item { text-align: right; font-weight: 600; word-break: normal; overflow-wrap: break-word; }
        .col-desc { text-align: center; color: #475569; word-break: normal; overflow-wrap: break-word; }
        .col-qty { text-align: center; }
        .col-price { text-align: center; }
        .col-total { font-weight: 700; text-align: center; }
        .col-action { width: 74px; text-align: center; }

        .invoice-item-actions {
          display: inline-flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
        }
        .invoice-item-actions i {
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
          border-radius: 4px;
        }
        .bottom-fixed-area {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 7px;
          background: #ffffff;
          padding: 8px 10px;
          border-top: 1px solid #cbd5e1;
          box-sizing: border-box;
          width: 100%;
        }
        .btn-action {
          min-height: 42px;
          padding: 8px 6px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 12px;
          color: #ffffff;
          cursor: pointer;
          text-align: center;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          white-space: nowrap;
          transition: filter 0.15s ease;
        }
        @media (min-width: 640px) {
          .btn-action {
            font-size: 13px;
            padding: 10px 12px;
          }
        }
        .btn-action:hover {
          filter: brightness(0.95);
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.62);
          z-index: 2000;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 10px;
          box-sizing: border-box;
          overflow: hidden;
        }
        .modal-box {
          background: #ffffff;
          width: 100%;
          max-width: 520px;
          border-radius: 10px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 1px solid #cbd5e1;
          box-shadow: 0 14px 35px rgba(15, 23, 42, 0.22);
          box-sizing: border-box;
        }
        .modal-header {
          background: #1e293b;
          color: #ffffff;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
          font-weight: 600;
          box-sizing: border-box;
        }
        .modal-body {
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-sizing: border-box;
          max-height: 84vh;
          overflow-y: auto;
        }
        .big-toggle-group {
          display: flex;
          border: 1px solid #2563eb;
          border-radius: 6px;
          overflow: hidden;
          min-height: 32px;
          width: 120px;
        }
        .big-toggle-btn {
          flex: 1;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          background: #ffffff;
          color: #2563eb;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .big-toggle-btn.active {
          background: #2563eb;
          color: #ffffff;
        }
        .edit-card-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          box-sizing: border-box;
          width: 100%;
        }
        .lookup-modal-box {
          background: #ffffff;
          width: 100%;
          max-width: 820px;
          height: 90vh;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          border: 1px solid #94a3b8;
          overflow: hidden;
          box-sizing: border-box;
          box-shadow: 0 16px 38px rgba(15, 23, 42, 0.22);
        }
        .hierarchy-nav-bar {
          background: #ffffff;
          padding: 10px 14px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
          flex-shrink: 0;
          box-sizing: border-box;
        }
        .hierarchy-btns-group {
          display: flex;
          gap: 6px;
        }
        .hier-btn {
          background: #f8fafc;
          color: #0f172a;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          min-height: 36px;
          padding: 6px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
          transition: background 0.15s ease;
        }
        .hier-btn:hover {
          background: #f1f5f9;
        }
        .hier-btn.success {
          background: #16a34a;
          color: #ffffff;
          border-color: #15803d;
        }
        .hierarchy-content-area {
          flex: 1;
          background: #f8fafc;
          padding: 10px 12px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-sizing: border-box;
        }
        .hierarchy-card-item {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          color: #1e293b;
          box-sizing: border-box;
          width: 100%;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .hierarchy-card-item:hover {
          background: #eff6ff;
          border-color: #2563eb;
        }
        .search-quick-bar {
          background: #ffffff;
          padding: 10px 12px;
          border-bottom: 1px solid #cbd5e1;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          flex-shrink: 0;
          box-sizing: border-box;
          width: 100%;
        }
      `}</style>

      {/* 📦 Main Rakeeza App Container */}
      <div
        className={`app-container ${
          isMaximized ? '!max-w-none !w-full !h-full !max-h-full !rounded-none' : ''
        }`}
      >
        {/* 🏷️ Header Bar */}
        <div className="header-title" style={{ background: invoiceTheme.bg, borderBottom: `1px solid ${invoiceTheme.border}` }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm truncate">
              <i className={`fa-solid ${invoiceTheme.icon} ml-1.5`}></i>
              {invoiceTheme.badgeText}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span id="liveTime" className="bg-black/25 px-2.5 py-0.5 rounded-full text-xs">
              {liveTime}
            </span>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="hidden sm:flex w-7 h-7 items-center justify-center rounded-md text-white hover:bg-white/15 transition cursor-pointer shrink-0"
              title={isMaximized ? 'تصغير' : 'تكبير'}
            >
              <i className={`fa-solid ${isMaximized ? 'fa-compress' : 'fa-expand'} text-xs`}></i>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-white hover:bg-white/15 hover:text-rose-200 transition cursor-pointer shrink-0"
              title="إغلاق"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* 📑 Main Content Area */}
        <div className="main-content">
          {/* 0. Active Branch + Creator + Editor Metadata Strip (27f5081e.png) */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-md px-2 py-0.5 truncate max-w-full">
                <i className="fa-solid fa-building text-[10px]"></i>
                <span className="truncate">
                  {appData.branches?.find((b) => b.id === activeBranchId)?.name || 'الفرع الرئيسي'}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md px-2 py-0.5 truncate">
                <span>المنشئ:</span>
                <span>{creatorName}</span>
              </span>
            </div>
            <div className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 rounded-md px-2 py-0.5">
              <span className="shrink-0">المحرر:</span>
              <select
                value={activeEditorName}
                onChange={(e) => setActiveEditorName(e.target.value)}
                className="bg-transparent text-amber-950 font-bold text-[11px] focus:outline-none cursor-pointer max-w-[140px]"
              >
                {!(appData.users || []).some((u) => u.name === activeEditorName) && (
                  <option value={activeEditorName}>{activeEditorName}</option>
                )}
                {(appData.users || []).map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 1. Header Information Card (9e11f2f6.png & 27f5081e.png) */}
          <div className="invoice-card">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              <div className="field-inline">
                <label>رقم الفاتورة</label>
                <input
                  type="text"
                  value={invNum}
                  readOnly
                  className="tabular-nums text-center !bg-slate-100 !font-bold"
                />
              </div>
              <div className="field-inline">
                <label>التاريخ</label>
                <input
                  type="date"
                  value={invDate}
                  onChange={(e) => setInvDate(e.target.value)}
                  className="tabular-nums !text-xs sm:!text-[13px] !px-1.5 sm:!px-2"
                />
              </div>
              <div className="field-inline">
                <label>الوقت</label>
                <input
                  type="time"
                  value={invTime}
                  onChange={(e) => setInvTime(e.target.value)}
                  className="tabular-nums !text-xs sm:!text-[13px] !px-1.5 sm:!px-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              <div className="field-inline col-span-1">
                <label>{isSale ? 'كود العميل' : 'كود المورد'}</label>
                <input
                  type="text"
                  value={custCode}
                  onChange={(e) => setCustCode(e.target.value)}
                  placeholder="تلقائي"
                  className="tabular-nums text-center"
                />
              </div>
              <div className="field-inline col-span-2">
                <label>{isSale ? 'اسم العميل (بحث أو تسجيل جديد)' : 'اسم المورد (بحث أو تسجيل جديد)'}</label>
                <div className="relative">
                  <input
                    type="text"
                    value={custName}
                    onFocus={() => setShowCustDropdown(true)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustName(val);
                      if (matchedParty && matchedParty.name.trim().toLowerCase() !== val.trim().toLowerCase()) {
                        setCustCode('');
                      }
                      setShowCustDropdown(true);
                    }}
                    placeholder={isSale ? 'اكتب اسم العميل (جديد أو مسجل)...' : 'اكتب اسم المورد (جديد أو مسجل)...'}
                    className="pl-7"
                  />
                  {custName && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustName('');
                        setCustCode('');
                        setShowCustDropdown(true);
                      }}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 text-sm cursor-pointer"
                      title="مسح"
                    >
                      ×
                    </button>
                  )}
                </div>
                {showCustDropdown && partySuggestions.length > 0 && (
                  <div className="absolute top-full mt-1 right-0 left-0 bg-white border border-slate-300 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto text-xs">
                    {partySuggestions.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setCustName(p.name);
                          setCustCode(p.code || p.id);
                          setCustPhone(p.phone || '');
                          setShowCustDropdown(false);
                        }}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 flex justify-between items-center gap-2"
                      >
                        <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                        <span className="text-slate-500 font-mono text-[11px] tabular-nums shrink-0">
                          {p.phone || p.code || p.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <div className="field-inline">
                <label>رقم الهاتف</label>
                <input
                  type="text"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  placeholder="رقم الهاتف (يُثبّت تلقائياً)..."
                  className="tabular-nums"
                />
              </div>
              <div className="field-inline">
                <label>البيان / جهة العمل</label>
                <input
                  type="text"
                  value={jobSite}
                  onChange={(e) => setJobSite(e.target.value)}
                  placeholder="جهة العمل أو ملاحظات الفاتورة..."
                />
              </div>
            </div>

            {custName.trim() &&
              custName.trim() !== 'عميل نقدي' &&
              custName.trim() !== 'مورد عام' &&
              !matchedParty && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1 text-[11px] font-semibold text-emerald-800 flex items-center gap-1.5">
                  <i className="fa-solid fa-user-plus text-emerald-600"></i>
                  <span>
                    سيتم تثبيت &quot;{custName.trim()}&quot;{custPhone.trim() ? ` (${custPhone.trim()})` : ''} تلقائياً في قسم {isSale ? 'العملاء' : 'الموردين'} عند الحفظ
                  </span>
                </div>
              )}
          </div>

          {/* 🟡 2. شريط حالة الحساب والرصيد الجاري */}
          <div className="account-status-bar">
            <div>
              <span className="text-slate-700">حالة الحساب: </span>
              <span
                style={{
                  color:
                    selectedInvoiceType === 'ajel' || selectedInvoiceType === 'return_ajel'
                      ? '#d97706'
                      : partyBalance > 0
                      ? '#dc2626'
                      : partyBalance < 0
                      ? '#2563eb'
                      : '#16a34a',
                }}
              >
                {selectedInvoiceType === 'ajel' || selectedInvoiceType === 'return_ajel'
                  ? 'آجل'
                  : partyBalance > 0
                  ? (isSale ? 'مدين (عليه مديونية)' : 'دائن (له مستحقات)')
                  : partyBalance < 0
                  ? (isSale ? 'دائن (له رصيد)' : 'مدين (عليه رصيد)')
                  : 'نقدي'}
              </span>
            </div>
            <div>
              <span className="text-amber-950">الرصيد الجاري: </span>
              <span
                className="tabular-nums"
                style={{
                  color:
                    partyBalance > 0
                      ? '#dc2626'
                      : partyBalance < 0
                      ? '#2563eb'
                      : '#0f172a',
                }}
              >
                {partyBalance !== 0
                  ? `${Math.abs(partyBalance).toFixed(2)} ج.م ${
                      isSale
                        ? partyBalance > 0
                          ? '(عليه)'
                          : '(له)'
                        : partyBalance > 0
                        ? '(له)'
                        : '(عليه)'
                    }`
                  : '0.00 ج.م'}
              </span>
            </div>
          </div>

          {/* 💳 3. لوحة السداد والخزينة والتسعير الداكنة (9e11f2f6.png & 27f5081e.png) */}
          <div className="bg-[#0f172a] text-white rounded-xl p-2.5 sm:p-3 space-y-2.5 border border-slate-800 shadow-xs shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <i className="fa-solid fa-wallet text-sm"></i>
                <span>
                  {paymentStatusMode === 'credit'
                    ? isReturn
                      ? 'مرتجع آجل / ذمم'
                      : 'آجل / ذمم'
                    : paymentStatusMode === 'partial'
                    ? `سداد جزئي: ${selectedTreasuryMethod}`
                    : `${isReturn ? 'مرتجع مسدد' : 'مسدد'}: ${selectedTreasuryMethod}`}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectPaymentStatusMode('paid')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition flex items-center gap-1 ${
                    paymentStatusMode === 'paid'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-[#1e293b] border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <i className="fa-regular fa-circle-check"></i>
                  <span>مسدد</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPaymentStatusMode('credit')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition flex items-center gap-1 ${
                    paymentStatusMode === 'credit'
                      ? 'bg-amber-600 border-amber-500 text-white'
                      : 'bg-[#1e293b] border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <i className="fa-solid fa-file-invoice"></i>
                  <span>آجل</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPaymentStatusMode('partial')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition flex items-center gap-1 ${
                    paymentStatusMode === 'partial'
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-[#1e293b] border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <i className="fa-regular fa-credit-card"></i>
                  <span>جزئي</span>
                </button>
              </div>
            </div>

            {paymentStatusMode === 'partial' && (
              <div className="flex items-center gap-2 bg-[#162238] border border-blue-500/40 rounded-lg px-2.5 py-1.5">
                <span className="text-[11px] font-semibold text-blue-300 shrink-0">المدفوع الآن (ج.م):</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={partialPaidInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPartialPaidInput(val);
                    const amt = Math.max(0, parseFloat(val) || 0);
                    setPaymentRows([{ id: 'partial_1', method: selectedTreasuryMethod, amount: amt }]);
                  }}
                  placeholder="أدخل المبلغ المسدد..."
                  className="flex-1 min-w-0 bg-[#0f172a] border border-slate-700 rounded-md px-2.5 py-1 text-xs font-bold text-white tabular-nums focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-emerald-400">الخزينة:</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'نقدي', label: 'نقدي' },
                  { key: 'فودافون كاش', label: 'فودافون كاش' },
                  { key: 'انستاباي', label: 'إنستاباي' },
                  { key: 'فيزا', label: 'فيزا POS' },
                  { key: 'بنك', label: 'تحويل بنكي' },
                ].map((ch) => (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => handleSelectTreasuryChip(ch.key)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition ${
                      selectedTreasuryMethod === ch.key
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-[#1e293b] border-slate-700 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {ch.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsOptionsModalOpen(true)}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-700 bg-[#1e293b] text-slate-200 hover:bg-slate-700 cursor-pointer transition"
                >
                  + مقسم
                </button>
              </div>
            </div>

          </div>

          {/* ↩ ربط المرتجع بالفاتورة الأصلية وتحديد نوع المرتجع */}
          {isReturn && (
            <div className="bg-rose-50/70 border border-rose-200 rounded-lg p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end text-xs">
              <div className="field-inline sm:col-span-2">
                <label className="!text-rose-900">ربط بالفاتورة الأصلية (اختياري)</label>
                <select
                  value={originalInvoiceId || ''}
                  onChange={(e) => {
                    const idNum = Number(e.target.value) || undefined;
                    setOriginalInvoiceId(idNum);
                    if (idNum) {
                      const origList = isSale ? appData.salesInvoices : appData.purchaseInvoices;
                      const orig = origList?.find((x) => Number(x.id) === idNum);
                      if (orig) {
                        const pName = isSale ? (orig as SaleInvoice).customerName : (orig as PurchaseInvoice).supplierName;
                        if (pName) setCustName(pName);
                        if (orig.phone) setCustPhone(orig.phone);
                        if (currentInvoiceItems.length === 0 && orig.items && orig.items.length > 0) {
                          setCurrentInvoiceItems(
                            orig.items.map((it, idx) => ({
                              rowId: `ret_${idx}_${Date.now()}`,
                              code: it.code || '',
                              name: it.name,
                              unit: (it as any).unit || 'قطعة',
                              spec: it.spec || it.notes || '',
                              qty: Number(it.qty || (it as any).quantity || 1),
                              price: Number(it.price || 0),
                              total: Number(it.total || Number(it.qty || 1) * Number(it.price || 0)),
                              itemId: it.itemId,
                              costPrice: it.costPrice,
                            }))
                          );
                          setReturnKind('full');
                          showToast(`تم تحميل أصناف الفاتورة الأصلية #${idNum} للمرتجع`, 'info');
                        }
                      }
                    }
                  }}
                >
                  <option value="">-- بدون ربط / مرتجع حر --</option>
                  {(isSale ? appData.salesInvoices || [] : appData.purchaseInvoices || [])
                    .filter((x) => !x.type.startsWith('return_') && x.status !== 'cancelled')
                    .slice(0, 100)
                    .map((orig) => (
                      <option key={orig.id} value={orig.id}>
                        #{orig.id} · {orig.date} · {isSale ? (orig as SaleInvoice).customerName : (orig as PurchaseInvoice).supplierName} ({Number(orig.total || 0).toFixed(2)} ج.م)
                      </option>
                    ))}
                </select>
              </div>
              <div className="field-inline">
                <label className="!text-rose-900">نوع المرتجع</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setReturnKind('full')}
                    className={`flex-1 min-h-[36px] rounded-md font-semibold border cursor-pointer ${
                      returnKind === 'full'
                        ? 'bg-rose-700 border-rose-700 text-white'
                        : 'bg-white border-rose-200 text-rose-900 hover:bg-rose-100'
                    }`}
                  >
                    مرتجع كلي
                  </button>
                  <button
                    type="button"
                    onClick={() => setReturnKind('partial')}
                    className={`flex-1 min-h-[36px] rounded-md font-semibold border cursor-pointer ${
                      returnKind === 'partial'
                        ? 'bg-rose-700 border-rose-700 text-white'
                        : 'bg-white border-rose-200 text-rose-900 hover:bg-rose-100'
                    }`}
                  >
                    مرتجع جزئي
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. Top Action Buttons Grid (3 columns: + إضافة صنف | الخصم والسداد | دليل الأصناف) */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={openBlankQuickAddCard}
              className="min-h-[40px] px-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition whitespace-nowrap"
              title="فتح كارت إضافة صنف سريع"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              <span>إضافة صنف</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOptionsModalOpen(true)}
              className="min-h-[40px] px-2 py-2 bg-[#1e293b] hover:bg-slate-800 text-white rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition whitespace-nowrap"
              title="الخصم، الضريبة وإدارة المدفوعات"
            >
              <i className="fa-solid fa-sliders text-xs"></i>
              <span>الخصم والسداد</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setHierarchyState({ step: 'groups', selectedGroup: null, selectedCompany: null, selectedType: null });
                setGlobalLookupSearch('');
                setIsLookupModalOpen(true);
              }}
              className="min-h-[40px] px-2 py-2 bg-[#1e293b] hover:bg-slate-800 text-white rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition whitespace-nowrap"
              title="دليل الأصناف والتنقل الهرمي لاختيار صنف"
            >
              <i className="fa-solid fa-cubes text-xs"></i>
              <span>دليل الأصناف</span>
            </button>
          </div>

          {/* 🔍 Quick Search Bar on-screen for direct mobile/desktop item addition */}
          <div className="relative w-full shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0 flex items-center bg-white rounded-lg border border-blue-400 shadow-2xs">
                <i className="fa-solid fa-magnifying-glass text-blue-600 text-sm pr-3 pl-2 shrink-0"></i>
                <input
                  type="text"
                  value={workspaceItemSearch}
                  onChange={(e) => {
                    setWorkspaceItemSearch(e.target.value);
                    setShowWorkspaceItemDropdown(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && workspaceItemSearch.trim()) {
                      const q = workspaceItemSearch.trim().toLowerCase();
                      const exact = localItemsDatabase.find(
                        (it) =>
                          (it.barcode && it.barcode.trim().toLowerCase() === q) ||
                          (it.code && it.code.trim().toLowerCase() === q) ||
                          (it.altUnits || []).some((u: ItemAltUnit) => u.barcode && u.barcode.trim().toLowerCase() === q)
                      );
                      if (exact) {
                        e.preventDefault();
                        handleBarcodeDetected(workspaceItemSearch.trim());
                        setWorkspaceItemSearch('');
                        setShowWorkspaceItemDropdown(false);
                      }
                    }
                  }}
                  onFocus={() => {
                    if (workspaceItemSearch.trim()) setShowWorkspaceItemDropdown(true);
                  }}
                  placeholder={`بحث ديناميكي لإضافة صنف فوراً بالاسم أو الباركود (${localItemsDatabase.length} صنف)...`}
                  className="w-full text-xs sm:text-sm min-h-[38px] py-1.5 pl-8 bg-transparent focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
                {workspaceItemSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceItemSearch('');
                      setShowWorkspaceItemDropdown(false);
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-base px-1.5 cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsCameraScannerOpen(true)}
                className="min-h-[38px] px-2.5 sm:px-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-800 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 transition"
                title="مسح الباركود بكاميرا الهاتف"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">كاميرا</span>
              </button>
            </div>

            {/* Quick Autocomplete Dropdown + Direct New Item Option */}
            {showWorkspaceItemDropdown && workspaceItemSearch.trim() !== '' && (
              <div className="absolute top-full right-0 left-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100">
                {filteredWorkspaceItems.map((item) => {
                  const itemPrice = getItemPriceForTier(item, activePricingTier);
                  return (
                    <div
                      key={item.itemId || item.code}
                      onClick={() => {
                        openItemDetailCard(item);
                        setWorkspaceItemSearch('');
                        setShowWorkspaceItemDropdown(false);
                      }}
                      className="p-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="flex flex-col text-right min-w-0">
                        <span className="font-semibold text-xs sm:text-sm text-slate-900 truncate">{item.name}</span>
                        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {item.code} {item.typeName ? `· ${item.typeName}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 text-left shrink-0">
                        <div className="flex flex-col items-end tabular-nums">
                          <span className="text-xs font-semibold text-emerald-700">
                            {itemPrice > 0 ? `${itemPrice.toFixed(2)} ج.م` : 'بدون سعر'}
                          </span>
                          <span className={`text-[11px] ${item.stock < 0 ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                            مخزون: {item.stock}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md whitespace-nowrap"
                        >
                          + إضافة
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!filteredWorkspaceItems.some(
                  (i) => i.name.trim().toLowerCase() === workspaceItemSearch.trim().toLowerCase()
                ) && (
                  <div
                    onClick={() => {
                      const typedName = workspaceItemSearch.trim();
                      setCardItem(null);
                      setCardItemSearch(typedName);
                      setShowCardDropdown(false);
                      setCardQty('1');
                      setCardPrice('');
                      setCardDiscVal('');
                      setCardTaxVal('');
                      setCardTotal('');
                      setCardLastEdited('price');
                      setCardSpec('');
                      setWorkspaceItemSearch('');
                      setShowWorkspaceItemDropdown(false);
                      setIsDetailCardOpen(true);
                      requestAnimationFrame(() => {
                        setTimeout(() => {
                          if (cardQtyInputRef.current) {
                            cardQtyInputRef.current.focus();
                            cardQtyInputRef.current.select();
                          }
                        }, 60);
                      });
                    }}
                    className="p-2.5 bg-emerald-50/70 hover:bg-emerald-100 cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div className="flex flex-col text-right min-w-0">
                      <span className="font-bold text-xs sm:text-sm text-emerald-900 truncate">
                        + إضافة صنف جديد: &quot;{workspaceItemSearch.trim()}&quot;
                      </span>
                      <span className="text-[10px] text-emerald-700">
                        {isSale
                          ? 'صنف غير مضاف للمخزون — سيتم بيعه وتثبيته بالسالب تلقائياً حتى الشراء'
                          : 'صنف جديد — سيُضاف للمخزون بهذه الكمية وسعر الشراء'}
                      </span>
                    </div>
                    <span className="bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md whitespace-nowrap shrink-0">
                      إدراج جديد
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Unified Columnar Items Table (Mobile & Desktop — Zero Horizontal Scroll) */}
          <div className="table-responsive">
            <table className="invoice-items-grid-table">
              <thead>
                <tr>
                  <th className="hidden md:table-cell col-seq w-[5%]">م</th>
                  <th className="w-[27%] md:w-[29%] text-right pr-2">اسم الصنف</th>
                  <th className="w-[19%] md:w-[20%]">البيان</th>
                  <th className="w-[16%] md:w-[11%]">الكمية</th>
                  <th className="w-[18%] md:w-[13%]">السعر</th>
                  <th className="w-[20%] md:w-[14%]">الإجمالي</th>
                  <th className="hidden md:table-cell col-action w-[8%]">إجراء</th>
                </tr>
              </thead>
              <tbody id="invoiceItemsTable">
                {currentInvoiceItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-slate-400 py-10 px-3 text-xs sm:text-sm text-center">
                      لم يتم إدراج أصناف بعد (اضغط على &quot;إضافة صنف&quot; أو &quot;دليل الأصناف&quot;)
                    </td>
                  </tr>
                ) : (
                  currentInvoiceItems.map((item, index) => (
                    <tr key={item.rowId}>
                      <td className="hidden md:table-cell col-seq tabular-nums">{index + 1}</td>
                      <td className="col-item px-1.5 md:px-2.5">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <span className="md:hidden text-[10px] font-mono text-slate-400 ml-1">
                              #{index + 1}
                            </span>
                            <span className="font-semibold text-slate-900 break-words">{item.name}</span>
                            {item.unit && (item.unit !== 'قطعة' || (item.unitFactor || 1) > 1) && (
                              <span className="mr-1 inline-block text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                                {item.unit}
                                {(item.unitFactor || 1) > 1 ? ` ×${item.unitFactor}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        {((item.actualDisc || 0) > 0 || (item.actualTax || 0) > 0) && (
                          <div className="text-[10px] text-blue-700 font-normal tabular-nums mt-0.5">
                            {(item.actualDisc || 0) > 0 ? `خصم: ${Number(item.actualDisc).toFixed(2)} ` : ''}
                            {(item.actualTax || 0) > 0 ? `· ضريبة: ${Number(item.actualTax).toFixed(2)}` : ''}
                          </div>
                        )}
                        {/* Mobile compact actions inside item cell to keep 5 clean aligned columns */}
                        <div className="flex md:hidden items-center gap-1.5 mt-1">
                          <button
                            type="button"
                            onClick={() => openModifyInvoiceItem(index)}
                            className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold cursor-pointer"
                            title="تعديل"
                          >
                            <i className="fa-solid fa-pen-to-square"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-semibold cursor-pointer"
                            title="حذف"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </td>
                      <td className="col-desc px-1 md:px-2 text-[11px] md:text-xs">
                        {item.spec && item.spec.trim() !== '' ? item.spec : '—'}
                      </td>
                      <td className="col-qty px-0.5 md:px-1.5">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={item.qty}
                          onChange={(e) => updateTableRowQty(index, e.target.value)}
                          className="compact-table-input w-full max-w-[68px] h-8 text-center text-xs font-semibold border border-slate-300 rounded-md bg-white tabular-nums focus:border-blue-600 focus:outline-none"
                        />
                      </td>
                      <td className="col-price px-0.5 md:px-1.5">
                        <input
                          type="number"
                          step="any"
                          value={item.price}
                          onChange={(e) => updateTableRowPrice(index, e.target.value)}
                          className="compact-table-input w-full max-w-[82px] h-8 text-center text-xs font-semibold border border-slate-300 rounded-md bg-white tabular-nums focus:border-blue-600 focus:outline-none"
                        />
                      </td>
                      <td className="col-total px-0.5 md:px-1.5">
                        <input
                          type="number"
                          step="any"
                          value={item.total}
                          onChange={(e) => updateTableRowTotal(index, e.target.value)}
                          title="تعديل الإجمالي يقسم تلقائياً على العدد ليضبط سعر الوحدة"
                          className="compact-table-input w-full max-w-[92px] h-8 text-center text-xs font-semibold border border-emerald-400 bg-emerald-50 text-emerald-900 rounded-md tabular-nums focus:border-emerald-600 focus:outline-none"
                        />
                      </td>
                      <td className="hidden md:table-cell col-action">
                        <span className="invoice-item-actions">
                          <i
                            className="fa-solid fa-pen-to-square text-blue-600 hover:bg-blue-50"
                            title="تعديل"
                            onClick={() => openModifyInvoiceItem(index)}
                          ></i>
                          <i
                            className="fa-solid fa-trash text-rose-600 hover:bg-rose-50"
                            title="حذف"
                            onClick={() => removeItem(index)}
                          ></i>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. Bottom Fixed Summary & Action Bar (9e11f2f6.png & 27f5081e.png) */}
        <div className="bottom-fixed-area">
          <div className="bg-[#0f172a] text-white rounded-xl p-2 space-y-1.5 border border-slate-800">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-[11px] font-semibold tabular-nums">
              <div className="bg-[#1e293b] border border-slate-700/70 rounded-md px-2 py-1 flex items-center justify-between gap-1">
                <span className="text-slate-300">الكميات:</span>
                <span id="lblItemsTotal" className="text-emerald-400">{totals.qtySum.toFixed(2)}</span>
              </div>
              <div className="bg-[#1e293b] border border-slate-700/70 rounded-md px-2 py-1 flex items-center justify-between gap-1">
                <span className="text-slate-300">الخصم:</span>
                <span id="lblDiscTotal" className="text-emerald-400">{totals.discount.toFixed(2)}</span>
              </div>
              <div className="bg-[#1e293b] border border-slate-700/70 rounded-md px-2 py-1 flex items-center justify-between gap-1">
                <span className="text-slate-300">الضريبة:</span>
                <span id="lblTaxTotal" className="text-emerald-400">{totals.tax.toFixed(2)}</span>
              </div>
              <div className="bg-[#1e293b] border border-slate-700/70 rounded-md px-2 py-1 flex items-center justify-between gap-1">
                <span className="text-slate-300">إضافي:</span>
                <span id="lblExtraTotal" className="text-emerald-400">{totals.extra.toFixed(2)}</span>
              </div>
              <div className="bg-[#1e293b] border border-slate-700/70 rounded-md px-2 py-1 flex items-center justify-between gap-1">
                <span className="text-slate-300">المدفوع:</span>
                <span id="lblPaidTotal" className="text-sky-400">{totals.paid.toFixed(2)}</span>
              </div>
              <div className="bg-[#1e293b] border border-slate-700/70 rounded-md px-2 py-1 flex items-center justify-between gap-1">
                <span className="text-slate-300">المتبقي:</span>
                <span id="lblRemainTotal" className="text-rose-400">{totals.remain.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-[#14532d] border border-emerald-700 rounded-lg px-3 py-1.5 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold text-white">الصافي النهائي:</span>
              <span id="lblNetTotal" className="text-base sm:text-lg font-extrabold text-lime-300 tabular-nums">
                {totals.net.toFixed(2)} ج.م
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full">
            <button
              type="button"
              className="btn-action bg-emerald-600 hover:bg-emerald-700"
              onClick={() => saveInvoice()}
            >
              <i className="fa-solid fa-floppy-disk"></i>
              <span className="truncate">حفظ وترحيل الحسابات</span>
            </button>
            <button
              type="button"
              className="btn-action !bg-white !text-slate-700 border !border-slate-300 hover:!bg-slate-50"
              onClick={onClose}
            >
              <i className="fa-solid fa-xmark"></i>
              <span>إلغاء وخروج</span>
            </button>
            <button
              type="button"
              className="btn-action bg-blue-600 hover:bg-blue-700"
              onClick={handlePrintCurrentInvoice}
            >
              <i className="fa-solid fa-print"></i>
              <span>معاينة وطباعة</span>
            </button>
          </div>
        </div>
      </div>

      {/* ⚙️ نافذة الخيارات والمدفوعات (Options & Payments Modal) */}
      {isOptionsModalOpen && (
        <div className="modal-overlay" id="optionsModal">
          <div className="modal-box">
            <div className="modal-header">
              <span>
                <i className="fa-solid fa-sliders ml-1.5"></i> خصومات، ضرائب، إيرادات ودفع
              </span>
              <button
                type="button"
                onClick={() => setIsOptionsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-white hover:bg-white/15 text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              {/* Discount */}
              <div className="field-inline">
                <div className="flex justify-between items-center gap-2">
                  <label>خصم الفاتورة الكلية</label>
                  <div className="big-toggle-group">
                    <button
                      type="button"
                      className={`big-toggle-btn ${invDiscType === 'val' ? 'active' : ''}`}
                      onClick={() => setInvDiscType('val')}
                    >
                      ج.م
                    </button>
                    <button
                      type="button"
                      className={`big-toggle-btn ${invDiscType === 'percent' ? 'active' : ''}`}
                      onClick={() => setInvDiscType('percent')}
                    >
                      %
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  value={globalInvDisc}
                  onChange={(e) => setGlobalInvDisc(e.target.value)}
                  placeholder="أدخل قيمة أو نسبة الخصم..."
                  className="tabular-nums"
                />
              </div>

              {/* Tax */}
              <div className="field-inline">
                <div className="flex justify-between items-center gap-2">
                  <label>ضريبة الفاتورة الكلية</label>
                  <div className="big-toggle-group">
                    <button
                      type="button"
                      className={`big-toggle-btn ${invTaxType === 'percent' ? 'active' : ''}`}
                      onClick={() => setInvTaxType('percent')}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      className={`big-toggle-btn ${invTaxType === 'val' ? 'active' : ''}`}
                      onClick={() => setInvTaxType('val')}
                    >
                      ج.م
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  value={globalInvTax}
                  onChange={(e) => setGlobalInvTax(e.target.value)}
                  placeholder="أدخل قيمة أو نسبة الضريبة..."
                  className="tabular-nums"
                />
              </div>

              {/* Extra Income */}
              <div className="edit-card-grid">
                <div className="field-inline">
                  <label>اسم الإيراد الإضافي</label>
                  <input
                    type="text"
                    value={extraIncomeName}
                    onChange={(e) => setExtraIncomeName(e.target.value)}
                  />
                </div>
                <div className="field-inline">
                  <label>مبلغ الإيراد</label>
                  <input
                    type="number"
                    value={extraIncomeVal}
                    onChange={(e) => setExtraIncomeVal(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>

              {/* Multi-Payment Rows */}
              <div className="field-inline">
                <div className="flex justify-between items-center gap-2">
                  <label>طرق الدفع المتعددة</label>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md cursor-pointer"
                    onClick={() => addPaymentRow('نقدي', 0)}
                  >
                    + إضافة دفع
                  </button>
                </div>
                <div
                  id="paymentRowsContainer"
                  className="flex flex-col gap-2 max-h-40 overflow-y-auto mt-1"
                >
                  {paymentRows.map((r) => (
                    <div
                      key={r.id}
                      className="pay-row flex gap-2 items-center"
                    >
                      <select
                        value={r.method}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPaymentRows((prev) => prev.map((row) => (row.id === r.id ? { ...row, method: val } : row)));
                        }}
                        className="!w-32 shrink-0"
                      >
                        <option value="نقدي">نقدي</option>
                        <option value="انستاباي">انستاباي</option>
                        <option value="فودافون كاش">فودافون كاش</option>
                        <option value="فيزا">فيزا</option>
                        <option value="بنك">بنك</option>
                      </select>
                      <input
                        type="number"
                        value={r.amount || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setPaymentRows((prev) => prev.map((row) => (row.id === r.id ? { ...row, amount: val } : row)));
                        }}
                        placeholder="المبلغ"
                        className="flex-1 tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => removePaymentRow(r.id)}
                        className="w-9 h-9 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer shrink-0"
                        title="حذف"
                      >
                        <i className="fa-solid fa-circle-xmark text-base"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="btn-action-top mt-1"
                style={{ background: '#16a34a' }}
                onClick={() => setIsOptionsModalOpen(false)}
              >
                <i className="fa-solid fa-check"></i>
                <span>تم وحفظ الخيارات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📇 كارت إضافة صنف سريع (7fca626a.png Dark-Navy Modal) */}
      {isDetailCardOpen && (
        <div className="modal-overlay" id="itemDetailCardModal">
          <div className="modal-box !bg-[#0f172a] !text-white !border !border-slate-700/80 !rounded-2xl !max-w-md w-full !shadow-2xl overflow-hidden">
            <div className="bg-[#0f172a] border-b border-slate-700/70 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <i className="fa-solid fa-cubes text-blue-400"></i>
                <span>كارت إضافة صنف سريع (Enter)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDetailCardOpen(false);
                  setShowCardDropdown(false);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white text-lg cursor-pointer transition"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[84vh] overflow-y-auto">
              {/* 1. اسم الصنف (بحث بدليل الأصناف أو جديد) */}
              <div className="relative space-y-1.5">
                <label className="block text-[11px] font-semibold text-slate-300">
                  اسم الصنف (بحث بدليل الأصناف أو جديد) <span className="text-rose-400">*</span>
                </label>
                <div className="relative flex items-center bg-[#162238] border border-blue-500 rounded-xl px-3">
                  <i className="fa-solid fa-magnifying-glass text-slate-400 text-xs ml-2 shrink-0"></i>
                  <input
                    ref={cardSearchInputRef}
                    type="text"
                    value={cardItemSearch}
                    onFocus={() => setShowCardDropdown(true)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCardItemSearch(val);
                      setShowCardDropdown(true);
                      if (cardItem && cardItem.name !== val) {
                        setCardItem(null);
                      }
                    }}
                    placeholder="ابحث باسم الصنف أو الكود..."
                    className="w-full py-2.5 bg-transparent text-sm font-semibold text-white placeholder:text-slate-400 focus:outline-none"
                  />
                  {cardItemSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setCardItemSearch('');
                        setCardItem(null);
                        setShowCardDropdown(true);
                      }}
                      className="text-slate-400 hover:text-white px-1 text-base cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>

                {showCardDropdown && cardSearchMatches.length > 0 && (
                  <div className="absolute top-full right-0 left-0 mt-1 bg-[#162238] border border-slate-600 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-700/70">
                    {cardSearchMatches.map((m) => {
                      const p = getItemPriceForTier(m, activePricingTier);
                      return (
                        <div
                          key={m.itemId || m.code}
                          onClick={() => {
                            setCardItem(m);
                            setCardItemSearch(m.name);
                            setShowCardDropdown(false);
                            setCardUnit(m.typeName || 'قطعة');
                            setCardUnitFactor(1);
                            const tierPrice = getItemPriceForTier(m, activePricingTier);
                            const pStr = tierPrice > 0 ? tierPrice.toString() : '';
                            setCardPrice(pStr);
                            setCardLastEdited('price');
                            syncCardTotalForward(cardQty, pStr, cardDiscVal, cardDiscType, cardTaxVal, cardTaxType);
                            setTimeout(() => {
                              if (cardQtyInputRef.current) {
                                cardQtyInputRef.current.focus();
                                cardQtyInputRef.current.select();
                              }
                            }, 50);
                          }}
                          className="px-3 py-2 hover:bg-blue-600/25 cursor-pointer flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate">{m.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                              {m.code} · مخزون:{' '}
                              <span className={m.stock < 0 ? 'text-rose-400 font-bold' : ''}>{m.stock}</span>
                            </div>
                          </div>
                          <span className="text-emerald-400 font-bold tabular-nums shrink-0">
                            {p > 0 ? `${p.toFixed(2)} ج.م` : 'بدون سعر'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!cardItem && cardItemSearch.trim() !== '' && (
                  <div className="bg-amber-950/50 border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-[11px] text-amber-200 flex items-center gap-1.5">
                    <i className="fa-solid fa-box-open text-amber-400"></i>
                    <span>
                      {isSale
                        ? 'صنف جديد غير مسجل بالمخزون — سيُضاف للفاتورة ويُثبّت بالسالب حتى الشراء'
                        : 'صنف جديد — سيُضاف للمخزون تلقائياً بهذه الكمية وسعر الشراء'}
                    </span>
                  </div>
                )}

                {cardItem && (
                  <div className="flex flex-wrap items-center justify-between gap-1.5 bg-[#132038] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-[10px]">
                    <span className="text-slate-300 tabular-nums">
                      المتاح:{' '}
                      <strong className={cardItem.stock < 0 ? 'text-rose-400' : 'text-sky-400'}>
                        {cardItem.stock}
                      </strong>
                      {isSale &&
                        !isReturn &&
                        Number(cardItem.stock || 0) - (parseFloat(cardQty) || 0) < 0 && (
                          <span className="mr-1.5 text-amber-300">
                            ← بعد البيع: {Number(((cardItem.stock || 0) - (parseFloat(cardQty) || 0)).toFixed(2))} (بالسالب)
                          </span>
                        )}
                    </span>
                    <div className="flex items-center gap-1">
                      {isSale ? (
                        <button
                          type="button"
                          onClick={() => {
                            const p = getItemPriceForTier(cardItem, 'cash');
                            const pStr = p > 0 ? p.toString() : '';
                            setCardPrice(pStr);
                            setCardLastEdited('price');
                            syncCardTotalForward(cardQty, pStr, cardDiscVal, cardDiscType, cardTaxVal, cardTaxType);
                          }}
                          className="px-1.5 py-0.5 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/35 cursor-pointer tabular-nums"
                        >
                          سعر البيع ({getItemPriceForTier(cardItem, 'cash').toFixed(2)})
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const p = getItemPriceForTier(cardItem, 'buy');
                            const pStr = p > 0 ? p.toString() : '';
                            setCardPrice(pStr);
                            setCardLastEdited('price');
                            syncCardTotalForward(cardQty, pStr, cardDiscVal, cardDiscType, cardTaxVal, cardTaxType);
                          }}
                          className="px-1.5 py-0.5 rounded bg-amber-600/20 border border-amber-500/40 text-amber-300 hover:bg-amber-600/35 cursor-pointer tabular-nums"
                        >
                          آخر سعر شراء ({getItemPriceForTier(cardItem, 'buy').toFixed(2)})
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. بيان الصنف (وصف اختياري) */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-slate-300">
                  بيان الصنف (وصف اختياري)
                </label>
                <input
                  type="text"
                  value={cardSpec}
                  onChange={(e) => setCardSpec(e.target.value)}
                  placeholder="بيان / مواصفة / وصف الصنف..."
                  className="w-full bg-[#162238] border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* الوحدة (تعدد الوحدات إن وجد) */}
              {cardItem && (cardItem.altUnits?.length || 0) > 0 && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    الوحدة المختارة
                  </label>
                  <select
                    value={cardUnit}
                    onChange={(e) => handleSelectCardUnit(e.target.value)}
                    className="w-full bg-[#162238] border border-blue-500/60 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-white focus:outline-none focus:border-blue-400"
                  >
                    <option value={cardItem.typeName || 'قطعة'}>
                      {cardItem.typeName || 'قطعة'} (الوحدة الأساسية ×1)
                    </option>
                    {(cardItem.altUnits || []).map((au: ItemAltUnit) => (
                      <option key={au.id} value={au.name}>
                        {au.name} (معامل تحويل ×{au.factor})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3. الكمية (العدد) و السعر */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    الكمية ({cardUnit}) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    ref={cardQtyInputRef}
                    id="input-card-qty"
                    type="number"
                    min="0.01"
                    step="any"
                    value={cardQty}
                    onChange={(e) => handleCardQtyChange(e.target.value)}
                    className="w-full bg-[#162238] border border-slate-700 rounded-xl px-3 py-2 text-center text-sm font-bold text-white tabular-nums focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    السعر (لـ {cardUnit}) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={cardPrice}
                    onChange={(e) => handleCardPriceChange(e.target.value)}
                    placeholder="السعر..."
                    className="w-full bg-[#162238] border border-slate-700 rounded-xl px-3 py-2 text-center text-sm font-bold text-white placeholder:text-slate-400 tabular-nums focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 4. الخصم والضريبة */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-[#132038] border border-slate-700/80 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold text-slate-300">الخصم</span>
                    <div className="inline-flex bg-[#0f172a] border border-slate-700 rounded-lg p-0.5 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => handleCardDiscChange(cardDiscVal, 'val')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                          cardDiscType === 'val' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        ج.م
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCardDiscChange(cardDiscVal, 'percent')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                          cardDiscType === 'percent' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        %
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={cardDiscVal}
                    onChange={(e) => handleCardDiscChange(e.target.value)}
                    placeholder={cardDiscType === 'val' ? 'المبلغ ج.م' : 'النسبة %'}
                    className="w-full bg-[#162238] border border-slate-700 rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold text-white placeholder:text-slate-400 tabular-nums focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="bg-[#132038] border border-slate-700/80 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold text-slate-300">الضريبة</span>
                    <div className="inline-flex bg-[#0f172a] border border-slate-700 rounded-lg p-0.5 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => handleCardTaxChange(cardTaxVal, 'val')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                          cardTaxType === 'val' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        ج.م
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCardTaxChange(cardTaxVal, 'percent')}
                        className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                          cardTaxType === 'percent' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        %
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={cardTaxVal}
                    onChange={(e) => handleCardTaxChange(e.target.value)}
                    placeholder={cardTaxType === 'val' ? 'المبلغ ج.م' : 'النسبة %'}
                    className="w-full bg-[#162238] border border-slate-700 rounded-lg px-2.5 py-1.5 text-center text-xs font-semibold text-white placeholder:text-slate-400 tabular-nums focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 5. إجمالي الصنف (يعدل السعر تلقائياً) عكسي */}
              <div className="bg-[#132038] border border-blue-600/60 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-blue-300">إجمالي الصنف (يعدل السعر تلقائياً)</span>
                  <span className="text-slate-400 font-medium">عكسي</span>
                </div>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={cardTotal}
                  onChange={(e) => handleCardTotalChange(e.target.value)}
                  placeholder="إجمالي الصنف..."
                  title="أدخل الإجمالي هنا ليتم ضبط سعر الوحدة تلقائياً"
                  className="w-full bg-[#162238] border border-blue-500 rounded-lg px-3 py-2 text-center text-sm font-bold text-white placeholder:text-slate-400 tabular-nums focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* 6. زر الإضافة */}
              <button
                type="button"
                onClick={confirmAddDetailedItem}
                className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition shadow-md"
              >
                <i className="fa-solid fa-check"></i>
                <span>إضافة الصنف للفاتورة (Enter)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📚 دليل الأصناف التفاعلي المتقدم (التنقل الهرمي الذكي) */}
      {isLookupModalOpen && (
        <div className="modal-overlay" id="lookupModal">
          <div className="lookup-modal-box">
            <div className="modal-header">
              <span>
                <i className="fa-solid fa-boxes-stacked ml-1.5"></i> إضافة صنف (التنقل الهرمي)
              </span>
              <button
                type="button"
                onClick={() => setIsLookupModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-white hover:bg-white/15 text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="search-quick-bar">
              <input
                type="text"
                value={globalLookupSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalLookupSearch(val);
                  if (val.trim()) {
                    setHierarchyState((prev) => ({ ...prev, step: 'search' }));
                  } else {
                    setHierarchyState({ step: 'groups', selectedGroup: null, selectedCompany: null, selectedType: null });
                  }
                }}
                placeholder="بحث سريع بالاسم أو الكود في أي وقت..."
                className="w-full sm:flex-1 min-w-0 sm:min-w-[200px] min-h-[38px] px-3 py-1.5 text-base md:text-xs border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                className="hier-btn !bg-emerald-600 !text-white !border-emerald-700"
                onClick={openNewHierarchyModal}
                title="إضافة مجموعة وبداخلها تصنيف وبداخلة نوع وبداخلة الصنف للتنقل الهرمي السريع"
              >
                <i className="fa-solid fa-sitemap"></i>
                <span>+ إضافة مجموعة وتصنيف ونوع وصنف</span>
              </button>
              <button
                type="button"
                className="hier-btn success"
                onClick={openEditModalForNewItem}
              >
                <i className="fa-solid fa-plus"></i>
                <span>صنف جديد</span>
              </button>
            </div>

            <div className="hierarchy-nav-bar" id="hierarchyNavBar">
              <span id="hierPathTitle">
                {hierarchyState.step === 'search'
                  ? `نتائج البحث عن: "${globalLookupSearch}"`
                  : hierarchyState.step === 'companies'
                  ? `${hierarchyState.selectedGroup} > اختر الشركة:`
                  : hierarchyState.step === 'types'
                  ? `${hierarchyState.selectedGroup} > ${hierarchyState.selectedCompany} > اختر النوع:`
                  : hierarchyState.step === 'items'
                  ? `الأصناف التابعة لـ: ${hierarchyState.selectedType}`
                  : 'المجموعات الرئيسية'}
              </span>
              <div className="hierarchy-btns-group">
                <button
                  type="button"
                  className="hier-btn"
                  onClick={() => {
                    setHierarchyState({ step: 'groups', selectedGroup: null, selectedCompany: null, selectedType: null });
                    setGlobalLookupSearch('');
                  }}
                >
                  <i className="fa-solid fa-house"></i>
                  <span>الرئيسية</span>
                </button>
                {hierarchyState.step !== 'groups' && (
                  <button
                    type="button"
                    className="hier-btn"
                    onClick={() => {
                      if (hierarchyState.step === 'companies' || hierarchyState.step === 'search') {
                        setHierarchyState({ step: 'groups', selectedGroup: null, selectedCompany: null, selectedType: null });
                      } else if (hierarchyState.step === 'types') {
                        setHierarchyState((prev) => ({ ...prev, step: 'companies', selectedType: null }));
                      } else if (hierarchyState.step === 'items') {
                        setHierarchyState((prev) => ({ ...prev, step: 'types' }));
                      }
                    }}
                  >
                    <i className="fa-solid fa-arrow-right"></i>
                    <span>رجوع</span>
                  </button>
                )}
              </div>
            </div>

            <div className="hierarchy-content-area" id="hierarchyContentArea">
              {/* Step 1: Search results */}
              {hierarchyState.step === 'search' && (
                (() => {
                  const q = globalLookupSearch.trim().toLowerCase();
                  const results = localItemsDatabase.filter(
                    (i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)
                  );
                  if (results.length === 0) {
                    return (
                      <div className="text-center py-8 text-slate-400 text-sm">
                        لا توجد أصناف مطابقة للبحث
                      </div>
                    );
                  }
                  return results.map((item) => (
                    <div
                      key={item.code}
                      className="hierarchy-card-item flex-col !items-stretch gap-2"
                      onClick={() => openItemDetailCard(item)}
                    >
                      <div className="flex justify-between items-center font-semibold text-sm text-slate-800">
                        <span>{item.name}</span>
                        <span className="text-blue-600 text-xs font-mono tabular-nums">كود: {item.code}</span>
                      </div>
                      <div className={`grid ${isSale && !canViewCost ? 'grid-cols-2' : 'grid-cols-3'} gap-2 text-xs text-center bg-slate-50 p-2 rounded-md border border-slate-200 font-normal tabular-nums`}>
                        <div>المخزون: <strong className={item.stock < 0 ? 'text-rose-600' : 'text-blue-600'}>{item.stock}</strong></div>
                        {(!isSale || canViewCost) && (
                          <div>شراء: <strong className="text-rose-600">{Number(item.buyPrice || 0).toFixed(2)}</strong></div>
                        )}
                        <div>بيع: <strong className="text-emerald-600">{Number(item.cashPrice || 0).toFixed(2)}</strong></div>
                      </div>
                    </div>
                  ));
                })()
              )}

              {/* Step 2: Groups */}
              {hierarchyState.step === 'groups' && (
                (() => {
                  const groups = [...new Set(localItemsDatabase.map((i) => i.group))];
                  return groups.map((g) => (
                    <div
                      key={g}
                      className="hierarchy-card-item"
                      onClick={() => setHierarchyState({ step: 'companies', selectedGroup: g, selectedCompany: null, selectedType: null })}
                    >
                      <span>
                        <i className="fa-solid fa-folder ml-2 text-blue-600"></i> {g}
                      </span>
                      <i className="fa-solid fa-chevron-left text-xs text-slate-400"></i>
                    </div>
                  ));
                })()
              )}

              {/* Step 3: Companies */}
              {hierarchyState.step === 'companies' && (
                (() => {
                  const comps = [
                    ...new Set(
                      localItemsDatabase.filter((i) => i.group === hierarchyState.selectedGroup).map((i) => i.company)
                    ),
                  ];
                  return comps.map((c) => (
                    <div
                      key={c}
                      className="hierarchy-card-item"
                      onClick={() => setHierarchyState((prev) => ({ ...prev, step: 'types', selectedCompany: c }))}
                    >
                      <span>
                        <i className="fa-solid fa-building ml-2 text-amber-600"></i> {c}
                      </span>
                      <i className="fa-solid fa-chevron-left text-xs text-slate-400"></i>
                    </div>
                  ));
                })()
              )}

              {/* Step 4: Types */}
              {hierarchyState.step === 'types' && (
                (() => {
                  const types = [
                    ...new Set(
                      localItemsDatabase
                        .filter((i) => i.group === hierarchyState.selectedGroup && i.company === hierarchyState.selectedCompany)
                        .map((i) => i.typeName)
                    ),
                  ];
                  return types.map((t) => (
                    <div
                      key={t}
                      className="hierarchy-card-item"
                      onClick={() => setHierarchyState((prev) => ({ ...prev, step: 'items', selectedType: t }))}
                    >
                      <span>
                        <i className="fa-solid fa-tag ml-2 text-emerald-600"></i> {t}
                      </span>
                      <i className="fa-solid fa-chevron-left text-xs text-slate-400"></i>
                    </div>
                  ));
                })()
              )}

              {/* Step 5: Items list under type */}
              {hierarchyState.step === 'items' && (
                (() => {
                  const items = localItemsDatabase.filter(
                    (i) =>
                      i.group === hierarchyState.selectedGroup &&
                      i.company === hierarchyState.selectedCompany &&
                      i.typeName === hierarchyState.selectedType
                  );
                  if (items.length === 0) {
                    return (
                      <div className="text-center py-8 text-slate-400 text-sm">
                        لا توجد أصناف في هذا النوع
                      </div>
                    );
                  }
                  return items.map((item) => (
                    <div
                      key={item.code}
                      className="hierarchy-card-item flex-col !items-stretch gap-2"
                      onClick={() => openItemDetailCard(item)}
                    >
                      <div className="flex justify-between items-center font-semibold text-sm text-slate-800">
                        <span>{item.name}</span>
                        <span className="text-blue-600 text-xs font-mono tabular-nums">كود: {item.code}</span>
                      </div>
                      <div className={`grid ${isSale && !canViewCost ? 'grid-cols-2' : 'grid-cols-3'} gap-2 text-xs text-center bg-slate-50 p-2 rounded-md border border-slate-200 font-normal tabular-nums`}>
                        <div>المخزون: <strong className={item.stock < 0 ? 'text-rose-600' : 'text-blue-600'}>{item.stock}</strong></div>
                        {(!isSale || canViewCost) && (
                          <div>شراء: <strong className="text-rose-600">{Number(item.buyPrice || 0).toFixed(2)}</strong></div>
                        )}
                        <div>بيع: <strong className="text-emerald-600">{Number(item.cashPrice || 0).toFixed(2)}</strong></div>
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* ➕ نافذة إضافة صنف جديد للمخزون (New Item Modal) */}
      {isNewItemModalOpen && (
        <div className="modal-overlay" id="editItemModal">
          <div className="modal-box">
            <div className="modal-header">
              <span>إضافة صنف جديد للمخزون</span>
              <button
                type="button"
                onClick={() => setIsNewItemModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-white hover:bg-white/15 text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="edit-card-grid">
                <div className="field-inline span-2">
                  <label>اسم الصنف</label>
                  <input
                    type="text"
                    value={newInputItemName}
                    onChange={(e) => setNewInputItemName(e.target.value)}
                  />
                </div>
                <div className="field-inline span-2">
                  <label>الكود الفريد</label>
                  <input
                    type="text"
                    readOnly
                    value={newInputItemCode}
                    className="!bg-slate-100 !font-semibold tabular-nums"
                  />
                </div>
                <div className="field-inline">
                  <label>سعر الشراء</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editBuyPrice}
                    onChange={(e) => setEditBuyPrice(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
                <div className="field-inline">
                  <label>المجموعة</label>
                  <select
                    value={editItemCategory}
                    onChange={(e) => setEditItemCategory(e.target.value)}
                  >
                    {[...new Set(localItemsDatabase.map((i) => i.group))].map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-inline">
                  <label>سعر البيع</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editCashPriceManual}
                    onChange={(e) => setEditCashPriceManual(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
                <div className="field-inline">
                  <label>العدد بالمخزون</label>
                  <input
                    type="number"
                    step="any"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>
              <button
                type="button"
                className="btn-action-top mt-1"
                style={{ background: '#16a34a' }}
                onClick={saveNewItemData}
              >
                <i className="fa-solid fa-check"></i>
                <span>حفظ الصنف</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌳 نافذة إضافة هيكل شجري متكامل */}
      {isNewHierarchyModalOpen && (
        <div className="modal-overlay" id="newHierarchyModal">
          <div className="modal-box" style={{ maxWidth: '500px' }}>
            <div className="modal-header" style={{ background: '#ffffff', color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>
              <span className="font-semibold">
                <i className="fa-solid fa-sitemap ml-1.5 text-emerald-600"></i> إضافة شجرة صنف (مجموعة &gt; تصنيف &gt; نوع &gt; صنف)
              </span>
              <button
                type="button"
                onClick={() => setIsNewHierarchyModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-600 leading-relaxed">
                اكتب اسم المجموعة والتصنيف والنوع والصنف النهائي ليتم تثبيته فوراً في شجرة الفاتورة والمخزون.
              </div>

              <div className="edit-card-grid">
                <div className="field-inline span-2">
                  <label className="!text-teal-700">1. المجموعة الرئيسية</label>
                  <input
                    type="text"
                    value={hierGroup}
                    onChange={(e) => setHierGroup(e.target.value)}
                    placeholder="اكتب اسم المجموعة الرئيسية..."
                  />
                </div>

                <div className="field-inline span-2">
                  <label className="!text-sky-700">2. التصنيف / الشركة / الماركة</label>
                  <input
                    type="text"
                    value={hierCompany}
                    onChange={(e) => setHierCompany(e.target.value)}
                    placeholder="اكتب اسم التصنيف أو الشركة..."
                  />
                </div>

                <div className="field-inline span-2">
                  <label className="!text-violet-700">3. النوع / القسم الفرعي</label>
                  <input
                    type="text"
                    value={hierType}
                    onChange={(e) => setHierType(e.target.value)}
                    placeholder="اكتب اسم النوع أو القسم الفرعي..."
                  />
                </div>

                <div className="field-inline span-2">
                  <label className="!text-slate-900">4. اسم الصنف النهائي</label>
                  <input
                    type="text"
                    value={hierItemName}
                    onChange={(e) => setHierItemName(e.target.value)}
                    placeholder="اكتب اسم الصنف النهائي..."
                    className="!border-blue-500"
                  />
                </div>

                <div className="field-inline">
                  <label>كود الصنف</label>
                  <input
                    type="text"
                    value={hierItemCode}
                    onChange={(e) => setHierItemCode(e.target.value)}
                    placeholder="كود..."
                    className="text-center tabular-nums"
                  />
                </div>

                <div className="field-inline">
                  <label>العدد بالمخزن</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={hierStock}
                    onChange={(e) => setHierStock(e.target.value)}
                    placeholder="0"
                    className="text-center tabular-nums"
                  />
                </div>

                <div className="field-inline">
                  <label>سعر الشراء (التكلفة)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={hierBuyPrice}
                    onChange={(e) => setHierBuyPrice(e.target.value)}
                    placeholder="0.00"
                    className="text-center tabular-nums"
                  />
                </div>

                <div className="field-inline">
                  <label>سعر البيع</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={hierCashPrice}
                    onChange={(e) => setHierCashPrice(e.target.value)}
                    placeholder="0.00"
                    className="text-center tabular-nums"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="btn-action-top flex-1"
                  style={{ background: '#059669' }}
                  onClick={saveNewHierarchyModal}
                >
                  <i className="fa-solid fa-check"></i>
                  <span>حفظ وتثبيت في الشجرة</span>
                </button>
                <button
                  type="button"
                  className="btn-action-top btn-action-alt !w-24"
                  onClick={() => setIsNewHierarchyModalOpen(false)}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✏️ نافذة تعديل بند في الفاتورة (Modify Invoice Item Modal) */}
      {isModifyModalOpen && (
        <div className="modal-overlay" id="modifyInvoiceItemModal">
          <div className="modal-box">
            <div className="modal-header">
              <span>
                <i className="fa-solid fa-pen-to-square ml-1.5"></i> تعديل صنف في الفاتورة
              </span>
              <button
                type="button"
                onClick={() => setIsModifyModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-white hover:bg-white/15 text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <input type="hidden" value={modifyItemIndex} />
              <div className="field-inline">
                <label>اسم الصنف</label>
                <input
                  type="text"
                  readOnly
                  value={modifyItemName}
                  className="!bg-slate-100 !font-semibold"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="field-inline">
                  <label>العدد (الكمية)</label>
                  <input
                    ref={modifyQtyInputRef}
                    type="number"
                    min="0.01"
                    step="any"
                    value={modifyItemQty}
                    onChange={(e) => {
                      setModifyItemQty(e.target.value);
                      const q = parseFloat(e.target.value) || 0;
                      const p = parseFloat(modifyItemPrice) || 0;
                      if (p > 0 && q > 0) setModifyItemTotal((q * p).toFixed(2));
                      else if (q > 0 && parseFloat(modifyItemTotal) > 0) {
                        const unitP = parseFloat(modifyItemTotal) / q;
                        const cleanP = Number(unitP.toFixed(2));
                        setModifyItemPrice(cleanP % 1 === 0 ? cleanP.toString() : cleanP.toFixed(2));
                      }
                    }}
                    className="text-center tabular-nums"
                  />
                </div>
                <div className="field-inline">
                  <label>سعر الوحدة</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={modifyItemPrice}
                    onChange={(e) => {
                      setModifyItemPrice(e.target.value);
                      const p = parseFloat(e.target.value) || 0;
                      const q = parseFloat(modifyItemQty) || 0;
                      if (q > 0 && p > 0) setModifyItemTotal((q * p).toFixed(2));
                    }}
                    className="text-center tabular-nums"
                  />
                </div>
                <div className="field-inline">
                  <label>الإجمالي (المبلغ)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={modifyItemTotal}
                    onChange={(e) => {
                      setModifyItemTotal(e.target.value);
                      const tot = parseFloat(e.target.value) || 0;
                      const q = parseFloat(modifyItemQty) || 0;
                      if (q > 0) {
                        const unitPrice = tot / q;
                        const cleanP = Number(unitPrice.toFixed(4));
                        setModifyItemPrice(cleanP % 1 === 0 ? cleanP.toString() : cleanP.toFixed(2));
                      }
                    }}
                    placeholder="1000..."
                    title="اكتب الإجمالي وسيتم حسابه وقسمته على الكمية تلقائياً لتحديث سعر الوحدة"
                    className="text-center tabular-nums !bg-emerald-50 !border-emerald-400 !text-emerald-900 !font-semibold"
                  />
                </div>
              </div>
              <div className="field-inline">
                <label>الوصف / البيان</label>
                <input
                  type="text"
                  value={modifyItemSpec}
                  onChange={(e) => setModifyItemSpec(e.target.value)}
                  placeholder="اختياري..."
                />
              </div>
              <button
                type="button"
                className="btn-action-top mt-1"
                style={{ background: '#16a34a' }}
                onClick={saveModifiedInvoiceItem}
              >
                <i className="fa-solid fa-check"></i>
                <span>حفظ التعديل</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <BarcodeCameraModal
        isOpen={isCameraScannerOpen}
        title="مسح باركود الصنف بالكاميرا"
        onClose={() => setIsCameraScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      <SupervisorPinModal
        isOpen={pinGuardState !== null}
        title={pinGuardState?.title || 'اعتماد المدير'}
        message={pinGuardState?.message || ''}
        details={pinGuardState?.details}
        settings={appData.settings}
        users={appData.users}
        onCancel={() => {
          setPinGuardState(null);
          showToast('تم إلغاء حفظ الفاتورة لعدم اعتماد المدير', 'info');
        }}
        onSuccess={() => {
          const st = pinGuardState;
          setPinGuardState(null);
          if (st) {
            saveInvoice({
              belowCostApproved: st.belowCostApproved,
              creditLimitApproved: st.creditLimitApproved,
            });
          }
        }}
      />

      {creditWarnModal && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4" dir="rtl">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-amber-300 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-amber-600 text-white">
              <div className="flex items-center gap-2 font-bold text-sm">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <span>تنبيه تجاوز حد الائتمان</span>
              </div>
              <button
                type="button"
                onClick={() => setCreditWarnModal(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs sm:text-sm text-slate-800 leading-relaxed bg-amber-50 border border-amber-200 rounded-xl p-3">
                {creditWarnModal.message}
              </p>
              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreditWarnModal(null);
                    showToast('تم إلغاء الحفظ لمراجعة سقف ائتمان العميل', 'info');
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs sm:text-sm hover:bg-slate-50"
                >
                  إلغاء وتعديل الدفع
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const st = creditWarnModal;
                    setCreditWarnModal(null);
                    saveInvoice({
                      belowCostApproved: st.belowCostApproved,
                      creditLimitApproved: true,
                    });
                  }}
                  className="w-full sm:flex-1 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm"
                >
                  تأكيد ومتابعة الحفظ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppData, SaleInvoice, PurchaseInvoice, Item, Customer, Supplier } from '../types';
import { calculateCustomerBalance, calculateSupplierBalance } from '../utils/accounting';
import { postSaleInvoice, postPurchaseInvoice, mapPaymentMethodToKey } from '../utils/posting';
import { printInvoiceWindow } from '../utils/printInvoice';
import { registerModalBackHandler } from '../utils/navigationHistory';
import { getBranchItems, getMainBranchId } from '../utils/branchIsolation';
import { PDF_CATALOG_ITEMS_1001 } from '../data/pdfMasterItems';

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
  itemId?: string;
  costPrice?: number;
  cashPrice?: number;
  wholesalePrice?: number;
  buyPrice?: number;
}

export interface WorkspacePayRow {
  id: string;
  method: string;
  amount: number;
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

  // 🏷️ نظام تسعير الفاتورة: 'cash' (سعر نقدي), 'wholesale' (سعر جملة), 'buy' (سعر شراء)
  const [activePricingTier, setActivePricingTier] = useState<'cash' | 'wholesale' | 'buy'>(() => {
    if (editingInvoice) {
      const sType = (editingInvoice as any).salesType;
      if (sType === 'wholesale') return 'wholesale';
      if ((editingInvoice as any).supplierName) return 'buy';
      return 'cash';
    }
    if (initialPricingType === 'wholesale') return 'wholesale';
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
      if (activePricingTier === 'wholesale') {
        return {
          bg: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 100%)',
          border: '#4f46e5',
          badgeText: '🏷️ فاتورة مبيعات جملة',
          icon: 'fa-tags',
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
      if (activePricingTier === 'wholesale') {
        return {
          bg: 'linear-gradient(135deg, #164e63 0%, #0e7490 100%)',
          border: '#0891b2',
          badgeText: '📦 فاتورة توريد / مشتريات جملة',
          icon: 'fa-boxes-packing',
        };
      }
      return {
        bg: 'linear-gradient(135deg, #134e4a 0%, #0f766e 100%)',
        border: '#0d9488',
        badgeText: '🛒 فاتورة شراء نقدي',
        icon: 'fa-cart-shopping',
      };
    }
  }, [isSale, selectedInvoiceType, activePricingTier]);

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

  // Map raw Item array into Workspace DB format (no fabricated fallback multipliers)
  const mapRawItemsToDb = (itemsList: Item[]) => {
    return itemsList.map((i, idx) => {
      const bPrice = Number(i.avgCost || i.purchasePrice || i.costPrice || 0);
      const cPrice = Number(i.salePrice || i.price || 0);
      const wPrice = Number(i.wholesalePrice || i.wholesaleSellingPrice || 0);
      const wbPrice = Number((i as any).wholesalePurchasePrice || (i as any).wholesaleBuyPrice || bPrice || 0);
      return {
        code: i.code || `ITM-${String(idx + 1).padStart(3, '0')}`,
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
      };
    });
  };

  // Multi-company isolation: only legacy default company (COMP-000001) falls back to legacy catalog if missing
  const isDefaultLegacyCompany = !appData.companyId || appData.companyId === 'COMP-000001';

  const rawAvailableItems = useMemo(() => {
    if (scopedBranchItems && scopedBranchItems.length > 0) return scopedBranchItems;
    if (appData.items && appData.items.length > 0) return appData.items;
    return isDefaultLegacyCompany ? PDF_CATALOG_ITEMS_1001 : [];
  }, [scopedBranchItems, appData.items, isDefaultLegacyCompany]);

  // ⚡ Stable items database state synced with memoized rawAvailableItems
  const [localItemsDatabase, setLocalItemsDatabase] = useState(() => mapRawItemsToDb(rawAvailableItems));

  useEffect(() => {
    setLocalItemsDatabase(mapRawItemsToDb(rawAvailableItems));
  }, [rawAvailableItems]);

  // Auto-healing guard: run ONLY for legacy default company (never inject sample items into new companies)
  const hasRestoredItemsRef = useRef(false);
  useEffect(() => {
    if (isDefaultLegacyCompany && (!appData.items || appData.items.length === 0) && !hasRestoredItemsRef.current) {
      hasRestoredItemsRef.current = true;
      const restored = PDF_CATALOG_ITEMS_1001.map((it) => ({
        ...it,
        companyId: appData.companyId || 'COMP-000001',
        branchId: activeBranchId,
      }));
      onUpdateData(
        { ...appData, items: restored },
        { action: 'restore_items', module: 'الأصناف', details: 'استعادة الأصناف التلقائية (1001 صنف)' }
      );
    }
  }, [appData.items, activeBranchId, isDefaultLegacyCompany]);

  // 🔍 Quick Search Bar on-screen state
  const [workspaceItemSearch, setWorkspaceItemSearch] = useState('');
  const [showWorkspaceItemDropdown, setShowWorkspaceItemDropdown] = useState(false);

  const filteredWorkspaceItems = useMemo(() => {
    const q = workspaceItemSearch.trim().toLowerCase();
    if (!q) return [];
    return localItemsDatabase.filter(
      (i) => (i.name && i.name.toLowerCase().includes(q)) || (i.code && i.code.toLowerCase().includes(q))
    ).slice(0, 15);
  }, [workspaceItemSearch, localItemsDatabase]);

  // Current Invoice Items
  const [currentInvoiceItems, setCurrentInvoiceItems] = useState<WorkspaceItemRow[]>(() => {
    if (editingInvoice?.items && editingInvoice.items.length > 0) {
      return editingInvoice.items.map((i, idx) => ({
        rowId: (i as any).rowId || `row_${idx}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        code: i.code || '',
        name: i.name,
        unit: (i as any).unit || 'قطعة',
        spec: i.spec || i.notes || '',
        qty: Number(i.qty || (i as any).quantity || 1),
        price: Number(i.price || 0),
        total: Number(i.total || (Number(i.qty || 1) * Number(i.price || 0))),
        itemId: i.itemId,
        costPrice: i.costPrice,
      }));
    }
    return [];
  });

  // Helper to extract item price based on active pricing tier (zero fabricated margins)
  const getItemPriceForTier = (dbItem: any, tier: 'cash' | 'wholesale' | 'buy'): number => {
    if (!dbItem) return 0;
    const cPrice = Number(dbItem.cashPrice || dbItem.salePrice || dbItem.normalSellingPrice || dbItem.price || 0);
    const bPrice = Number(dbItem.buyPrice || dbItem.avgCost || dbItem.purchasePrice || dbItem.costPrice || 0);
    const wPrice = Number(dbItem.wholesalePrice || dbItem.wholesaleSellingPrice || 0);

    if (tier === 'cash') {
      return cPrice;
    }

    if (tier === 'wholesale') {
      return wPrice > 0 ? wPrice : cPrice;
    }

    if (tier === 'buy') {
      return bPrice;
    }

    return cPrice;
  };

  // 🔄 تغيير نظام التسعير (سعر نقدي / سعر جملة / سعر شراء) يُحدث أسعار كافة الأصناف فوراً
  const handleChangePricingTier = (newTier: 'cash' | 'wholesale' | 'buy') => {
    setActivePricingTier(newTier);

    // تحديث السعر فوراً داخل كارت الصنف إذا كان الكارت مفتوحاً حالياً
    if (cardItem) {
      const updatedCardPrice = getItemPriceForTier(cardItem, newTier);
      if (updatedCardPrice > 0) {
        setCardPrice(updatedCardPrice.toString());
      }
    }

    setCurrentInvoiceItems((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((invItem) => {
        let newPrice = 0;

        // 1. الاسترجاع من الأسعار المحفوظة مسبقاً في السطر
        if (newTier === 'cash' && invItem.cashPrice && invItem.cashPrice > 0) {
          newPrice = invItem.cashPrice;
        } else if (newTier === 'wholesale' && invItem.wholesalePrice && invItem.wholesalePrice > 0) {
          newPrice = invItem.wholesalePrice;
        } else if (newTier === 'buy' && (invItem.buyPrice || invItem.costPrice)) {
          newPrice = Number(invItem.buyPrice || invItem.costPrice || 0);
        }

        // 2. البحث في قاعدة الأصناف المحلية أو أصناف التطبيق
        if (newPrice <= 0) {
          const dbItem =
            localItemsDatabase.find(
              (i) =>
                (i.code && invItem.code && i.code.trim().toLowerCase() === invItem.code.trim().toLowerCase()) ||
                (invItem.itemId && (String(i.itemId) === String(invItem.itemId) || String((i as any).id) === String(invItem.itemId))) ||
                (i.name && invItem.name && i.name.trim().toLowerCase() === invItem.name.trim().toLowerCase())
            ) ||
            appData.items?.find(
              (i) =>
                (i.code && invItem.code && i.code.trim().toLowerCase() === invItem.code.trim().toLowerCase()) ||
                (invItem.itemId && String(i.id) === String(invItem.itemId)) ||
                (i.name && invItem.name && i.name.trim().toLowerCase() === invItem.name.trim().toLowerCase())
            );

          if (dbItem) {
            newPrice = getItemPriceForTier(dbItem, newTier);
          }
        }

        // 3. الحفاظ على السعر الحالي أو الفعلي المسجل بدون نسب مصطنعة
        if (newPrice <= 0) {
          const baseP = Number(invItem.cashPrice || invItem.price || 0);
          if (newTier === 'buy') {
            newPrice = Number(invItem.costPrice || invItem.buyPrice || 0);
          } else {
            newPrice = baseP;
          }
        }

        if (newPrice <= 0) {
          newPrice = invItem.price;
        }

        return {
          ...invItem,
          price: newPrice,
          total: Number((invItem.qty * newPrice).toFixed(2)),
        };
      });
    });

    const tierName = newTier === 'cash' ? 'النقدي' : newTier === 'wholesale' ? 'الجملة' : 'الشراء';
    showToast(`تم تطبيق سعر ${tierName} على كافة بنود الفاتورة بنجاح`, 'info');
  };

  // Sync pricing tier when initialPricingType prop changes
  useEffect(() => {
    if (initialPricingType && (initialPricingType === 'cash' || initialPricingType === 'wholesale' || initialPricingType === 'buy')) {
      handleChangePricingTier(initialPricingType);
    }
  }, [initialPricingType]);

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

  // Item Detail Card Modal State (Auto-Focus & Select on Quantity)
  const [isDetailCardOpen, setIsDetailCardOpen] = useState(false);
  const [cardItem, setCardItem] = useState<any>(null);
  const [cardQty, setCardQty] = useState<string>('1');
  const [cardPrice, setCardPrice] = useState<string>('0');
  const [cardTotal, setCardTotal] = useState<string>('0');
  const [cardLastEdited, setCardLastEdited] = useState<'price' | 'total'>('price');
  const [cardSpec, setCardSpec] = useState<string>('');
  const cardQtyInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleCardPriceChange = (val: string) => {
    setCardPrice(val);
    setCardLastEdited('price');
    const p = parseFloat(val);
    const q = parseFloat(cardQty) || 0;
    if (!isNaN(p) && q > 0) {
      setCardTotal((p * q).toFixed(2));
    } else if (val.trim() === '') {
      setCardTotal('');
    }
  };

  const handleCardQtyChange = (val: string) => {
    setCardQty(val);
    const q = parseFloat(val) || 0;
    if (cardLastEdited === 'total') {
      const tot = parseFloat(cardTotal) || 0;
      if (tot > 0 && q > 0) {
        const unitP = tot / q;
        const cleanP = Number(unitP.toFixed(4));
        setCardPrice(cleanP % 1 === 0 ? cleanP.toString() : cleanP.toFixed(2));
      }
    } else {
      const p = parseFloat(cardPrice) || 0;
      if (p > 0 && q > 0) {
        setCardTotal((p * q).toFixed(2));
      }
    }
  };

  const handleCardTotalChange = (val: string) => {
    setCardTotal(val);
    setCardLastEdited('total');
    const tot = parseFloat(val);
    const q = parseFloat(cardQty) || 0;
    if (!isNaN(tot) && tot >= 0 && q > 0) {
      const unitP = tot / q;
      const cleanP = Number(unitP.toFixed(4));
      setCardPrice(cleanP % 1 === 0 ? cleanP.toString() : cleanP.toFixed(2));
    } else if (val.trim() === '') {
      setCardPrice('');
    }
  };

  const updateTableRowQty = (index: number, val: string) => {
    const q = parseFloat(val) || 0;
    setCurrentInvoiceItems((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const tot = q * r.price;
        return { ...r, qty: q, total: Number(tot.toFixed(2)) };
      })
    );
  };

  const updateTableRowPrice = (index: number, val: string) => {
    const p = parseFloat(val) || 0;
    setCurrentInvoiceItems((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const tot = r.qty * p;
        return { ...r, price: p, total: Number(tot.toFixed(2)) };
      })
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

  // Open Item Detail Card and Auto-Focus & Select on Quantity
  const openItemDetailCard = (item: any) => {
    setCardItem(item);
    const calculatedP = getItemPriceForTier(item, activePricingTier);
    const pStr = calculatedP > 0 ? calculatedP.toString() : '0';
    setCardPrice(pStr);
    setCardQty('1');
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

  // Confirm Adding Item from Detail Card
  const confirmAddDetailedItem = () => {
    if (!cardItem) return;
    const q = parseFloat(cardQty) || 1;
    let p = parseFloat(cardPrice) || 0;
    const totVal = parseFloat(cardTotal);
    if ((p <= 0 || isNaN(p)) && !isNaN(totVal) && totVal > 0 && q > 0) {
      p = Number((totVal / q).toFixed(4));
    }
    const finalItemTotal = cardLastEdited === 'total' && !isNaN(totVal) && totVal > 0 ? totVal : Number((q * p).toFixed(2));
    const s = cardSpec.trim();

    if (isSale) {
      setLocalItemsDatabase((prev) =>
        prev.map((i) => (i.code === cardItem.code ? { ...i, stock: Math.max(0, (i.stock || 0) - q) } : i))
      );
    }

    // 🔍 فحص ما إذا كان البند مضافاً مسبقاً في الفاتورة:
    // إذا لم يُكتب له وصف أو بيان جديد، يزيد العدد ولا ينزل بنداً منفرداً.
    // وينزل بنداً منفرداً فقط في حالة كتابة وصف أو بيان محدد ومختلف طبقاً لطلب المستخدم بدقة.
    setCurrentInvoiceItems((prev) => {
      let targetIndex = -1;

      if (s !== '') {
        // إذا كتب المستخدم بياناً أو وصفاً: يبحث عن بند يحمل نفس هذا البيان تماماً، وإلا ينزل بنداً منفرداً
        targetIndex = prev.findIndex((r) => {
          const isSame =
            (r.code && cardItem.code && r.code.trim().toLowerCase() === cardItem.code.trim().toLowerCase()) ||
            (r.itemId && cardItem.itemId && String(r.itemId) === String(cardItem.itemId)) ||
            (r.name && cardItem.name && r.name.trim().toLowerCase() === cardItem.name.trim().toLowerCase());
          return isSame && (r.spec || '').trim() === s;
        });
      } else {
        // إذا لم يكتب المستخدم أي بيان أو وصف: يزيد العدد على البند القائم (الخالي من الوصف، أو أول بند من الصنف)
        targetIndex = prev.findIndex((r) => {
          const isSame =
            (r.code && cardItem.code && r.code.trim().toLowerCase() === cardItem.code.trim().toLowerCase()) ||
            (r.itemId && cardItem.itemId && String(r.itemId) === String(cardItem.itemId)) ||
            (r.name && cardItem.name && r.name.trim().toLowerCase() === cardItem.name.trim().toLowerCase());
          return isSame && (r.spec || '').trim() === '';
        });

        if (targetIndex === -1) {
          // إذا لم يجد بنداً بدون وصف، يبحث عن أي بند من هذا الصنف لزيادة عدده
          targetIndex = prev.findIndex((r) =>
            (r.code && cardItem.code && r.code.trim().toLowerCase() === cardItem.code.trim().toLowerCase()) ||
            (r.itemId && cardItem.itemId && String(r.itemId) === String(cardItem.itemId)) ||
            (r.name && cardItem.name && r.name.trim().toLowerCase() === cardItem.name.trim().toLowerCase())
          );
        }
      }

      if (targetIndex > -1) {
        // زيادة العدد للبند القائم بدلاً من تكراره في سطر منفصل
        return prev.map((row, idx) => {
          if (idx === targetIndex) {
            const newQty = Number((row.qty + q).toFixed(2));
            const newPrice = p > 0 ? p : row.price;
            return {
              ...row,
              qty: newQty,
              price: newPrice,
              total: Number((newQty * newPrice).toFixed(2)),
            };
          }
          return row;
        });
      }

      // إضافة بند جديد في سطر منفصل (في حال كان صنفاً جديداً أو كُتب له وصف/بيان خاص)
      const cPrice = Number(cardItem.cashPrice || getItemPriceForTier(cardItem, 'cash'));
      const wPrice = Number(cardItem.wholesalePrice || getItemPriceForTier(cardItem, 'wholesale'));
      const bPrice = Number(cardItem.buyPrice || getItemPriceForTier(cardItem, 'buy'));

      const newRow: WorkspaceItemRow = {
        rowId: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        code: cardItem.code,
        name: cardItem.name,
        unit: cardItem.typeName || 'قطعة',
        spec: s,
        qty: q,
        price: p,
        total: finalItemTotal,
        itemId: cardItem.itemId,
        costPrice: cardItem.buyPrice || 0,
        cashPrice: cPrice > 0 ? cPrice : p,
        wholesalePrice: wPrice > 0 ? wPrice : (cPrice > 0 ? cPrice : p),
        buyPrice: bPrice > 0 ? bPrice : 0,
      };
      return [...prev, newRow];
    });

    showToast(s ? `تم إدراج البند مع الوصف: ${cardItem.name}` : `تمت زيادة العدد للصنف: ${cardItem.name}`, 'info');
    setIsDetailCardOpen(false);
    setCardItem(null);
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
      alert('يرجى إدخال كمية صحيحة أكبر من صفر');
      return;
    }

    setCurrentInvoiceItems((prev) =>
      prev.map((item, idx) =>
        idx === modifyItemIndex
          ? {
              ...item,
              qty: q,
              price: p,
              spec: s,
              total: Number((q * p).toFixed(2)),
            }
          : item
      )
    );

    setIsModifyModalOpen(false);
  };

  const removeItem = (index: number) => {
    const removed = currentInvoiceItems[index];
    if (removed && isSale) {
      setLocalItemsDatabase((prev) =>
        prev.map((i) => (i.code === removed.code ? { ...i, stock: (i.stock || 0) + Number(removed.qty || 0) } : i))
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

  // Calculations
  const totals = useMemo(() => {
    let totalQtySum = 0;
    let itemsSubTotal = 0;

    currentInvoiceItems.forEach((i) => {
      totalQtySum += Number(i.qty) || 0;
      itemsSubTotal += (Number(i.price) || 0) * (Number(i.qty) || 0);
    });

    const globalDiscInput = parseFloat(globalInvDisc) || 0;
    const globalDiscCalculated =
      invDiscType === 'percent' ? itemsSubTotal * (globalDiscInput / 100) : globalDiscInput;

    const globalTaxInput = parseFloat(globalInvTax) || 0;
    const taxableBase = Math.max(0, itemsSubTotal - globalDiscCalculated);
    const globalTaxCalculated =
      invTaxType === 'percent' ? taxableBase * (globalTaxInput / 100) : globalTaxInput;

    const extraVal = parseFloat(extraIncomeVal) || 0;
    const netTotal = Math.max(0, itemsSubTotal - globalDiscCalculated + globalTaxCalculated + extraVal);

    let paidTotal = 0;
    if (paymentRows.length === 0) {
      paidTotal = (selectedInvoiceType === 'nagdi' || selectedInvoiceType === 'return_nagdi') ? netTotal : 0;
    } else {
      paymentRows.forEach((r) => {
        paidTotal += Math.max(0, Number(r.amount) || 0);
      });
    }

    const remainTotal = Math.max(0, netTotal - paidTotal);

    return {
      qtySum: totalQtySum,
      subtotal: itemsSubTotal,
      discount: globalDiscCalculated,
      tax: globalTaxCalculated,
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
      alert('يرجى إدخال اسم الصنف');
      return;
    }

    const buyP = parseFloat(editBuyPrice) || 0;
    const cashP = parseFloat(editCashPriceManual) || buyP;
    const wholesaleP = parseFloat(editWholesalePriceManual) || cashP;
    const qtyP = parseFloat(editQty) || 0;

    const newItem = {
      code,
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
  const saveInvoice = () => {
    if (currentInvoiceItems.length === 0) {
      alert('الفاتورة فارغة! يرجى إدراج صنف واحد على الأقل من دليل الأصناف.');
      return;
    }

    const defaultPartyName = isSale
      ? custName.trim() || 'عميل نقدي'
      : custName.trim() || 'مورد عام';

    let finalPayments = [...paymentRows];
    if (finalPayments.length === 0) {
      if (selectedInvoiceType === 'nagdi' || selectedInvoiceType === 'return_nagdi') {
        finalPayments = [{ id: '1', method: 'نقدي', amount: totals.net }];
      }
    }

    const primaryMethodKey = finalPayments.length > 1
      ? 'split'
      : mapPaymentMethodToKey(finalPayments[0]?.method);

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
        salesType: activePricingTier === 'wholesale' ? 'wholesale' : 'cash',
        customerId: matchedParty?.id,
        customerCode: resolvedPartyCode,
        customerName: defaultPartyName,
        phone: custPhone,
        notes: jobSite,
        items: currentInvoiceItems.map((i) => ({
          itemId: i.itemId || i.code,
          code: i.code,
          name: i.name,
          unit: i.unit || 'قطعة',
          qty: i.qty,
          price: i.price,
          total: i.total,
          spec: i.spec,
          costPrice: i.costPrice || 0,
        })),
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
        createdBy: editingInvoice?.createdBy || (appData.users?.find((u) => u.id === appData.currentUser)?.name || 'مدير النظام'),
      };

      const isEditing = !!editingInvoice?.id;
      const updated = postSaleInvoice(appData, invoiceData, isEditing, editingInvoice?.id);

      onUpdateData(updated, {
        action: isEditing ? 'تعديل فاتورة مبيعات' : 'حفظ فاتورة مبيعات',
        module: 'المبيعات',
        details: `فاتورة مبيعات #${invNum} - العميل: ${defaultPartyName} - الصافي: ${totals.net.toFixed(2)} ج.م`,
      });

      showToast(`✅ تم حفظ وترحيل فاتورة المبيعات #${invNum} وتحديث الحسابات والمخزن بنجاح`, 'success');
      onClose();
    } else {
      const invoiceData: PurchaseInvoice = {
        id: editingInvoice?.id || invoiceId,
        date: invDate,
        time: invTime,
        type: selectedInvoiceType,
        purchaseType: activePricingTier === 'wholesale' ? 'wholesale' : 'cash',
        supplierId: matchedParty?.id,
        supplierCode: resolvedPartyCode,
        supplierName: defaultPartyName,
        phone: custPhone,
        notes: jobSite,
        items: currentInvoiceItems.map((i) => ({
          itemId: i.itemId || i.code,
          code: i.code,
          name: i.name,
          unit: i.unit || 'قطعة',
          qty: i.qty,
          price: i.price,
          total: i.total,
          spec: i.spec,
          costPrice: i.price,
        })),
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
        createdBy: editingInvoice?.createdBy || (appData.users?.find((u) => u.id === appData.currentUser)?.name || 'مدير النظام'),
      };

      const isEditing = !!editingInvoice?.id;
      const updated = postPurchaseInvoice(appData, invoiceData, isEditing, editingInvoice?.id);

      onUpdateData(updated, {
        action: isEditing ? 'تعديل فاتورة مشتريات' : 'حفظ فاتورة مشتريات',
        module: 'المشتريات',
        details: `فاتورة مشتريات #${invNum} - المورد: ${defaultPartyName} - الصافي: ${totals.net.toFixed(2)} ج.م`,
      });

      showToast(`✅ تم حفظ وترحيل فاتورة المشتريات #${invNum} وتحديث التوريدات والمخزن بنجاح`, 'success');
      onClose();
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
      salesType: isSale ? (activePricingTier === 'wholesale' ? 'wholesale' : 'cash') : undefined,
      purchaseType: !isSale ? (activePricingTier === 'wholesale' ? 'wholesale' : 'cash') : undefined,
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
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      extraRevenueAmount: totals.extra,
      extraRevenueName: extraIncomeName,
      total: totals.net,
      paidAmount: totals.paid,
      remainingAmount: totals.remain,
      paymentMethod: mapPaymentMethodToKey(paymentRows[0]?.method || 'نقدي'),
      branchId: activeBranchId,
      branchName: activeBranchName,
      createdBy: appData.users?.find((u) => u.id === appData.currentUser)?.name || 'مدير النظام',
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
          border-radius: 8px;
          padding: 10px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          flex-shrink: 0;
          box-sizing: border-box;
          width: 100%;
        }
        @media (min-width: 640px) {
          .invoice-card {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            padding: 12px;
          }
        }
        .field-inline {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          position: relative;
          box-sizing: border-box;
        }
        .field-inline label {
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .field-inline input, .field-inline select {
          padding: 6px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 500;
          color: #0f172a;
          outline: none;
          background: #ffffff;
          width: 100%;
          min-height: 40px;
          box-sizing: border-box;
          font-family: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
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
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.14);
        }
        .span-2 { grid-column: span 2; }
        .span-3 { grid-column: 1 / -1; }

        /* شريط حالة الحساب والدائن/المدين */
        .account-status-bar {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 8px 12px;
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 6px 12px;
          font-size: 12.5px;
          font-weight: 600;
          flex-shrink: 0;
          width: 100%;
          box-sizing: border-box;
        }

        /* نظام تسعير الفاتورة */
        .pricing-tier-bar {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 10px;
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
          width: 100%;
          box-sizing: border-box;
          gap: 8px;
        }
        .pricing-tier-btn {
          flex: 1;
          min-height: 38px;
          padding: 6px 10px;
          font-size: 12.5px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #334155;
          text-align: center;
          white-space: nowrap;
          box-sizing: border-box;
          transition: all 0.15s ease;
        }
        .pricing-tier-btn:hover {
          background: #f1f5f9;
        }
        .pricing-tier-btn.active-cash {
          background: #16a34a !important;
          color: #ffffff !important;
          border-color: #15803d !important;
        }
        .pricing-tier-btn.active-wholesale {
          background: #2563eb !important;
          color: #ffffff !important;
          border-color: #1d4ed8 !important;
        }
        .pricing-tier-btn.active-buy {
          background: #d97706 !important;
          color: #ffffff !important;
          border-color: #b45309 !important;
        }

        .top-actions-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          flex-shrink: 0;
          box-sizing: border-box;
          width: 100%;
        }
        .btn-action-top {
          width: 100%;
          min-height: 42px;
          padding: 8px 12px;
          background: #2563eb;
          color: #ffffff;
          border: none;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          box-sizing: border-box;
          white-space: nowrap;
          transition: background 0.15s ease;
        }
        .btn-action-top:hover {
          background: #1d4ed8;
        }
        .btn-action-alt {
          background: #475569;
        }
        .btn-action-alt:hover {
          background: #334155;
        }
        .table-responsive {
          width: 100%;
          flex: 1 1 200px;
          min-height: 160px;
          overflow-y: auto;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #ffffff;
          box-sizing: border-box;
        }
        .table-responsive table {
          width: 100%;
          min-width: 620px;
          border-collapse: collapse;
          text-align: center;
          box-sizing: border-box;
          font-variant-numeric: tabular-nums;
        }
        .table-responsive th, .table-responsive td {
          border-bottom: 1px solid #e2e8f0;
          border-left: 1px solid #e2e8f0;
          vertical-align: middle;
          white-space: nowrap;
          box-sizing: border-box;
        }
        .table-responsive th:last-child, .table-responsive td:last-child {
          border-left: none;
        }
        .table-responsive th {
          background: #f1f5f9;
          color: #334155;
          font-weight: 600;
          height: 36px;
          font-size: 12px;
          padding: 6px 8px;
          position: sticky;
          top: 0;
          z-index: 2;
          text-align: center;
          border-bottom: 1px solid #cbd5e1;
        }
        .table-responsive tbody tr:hover {
          background: #f8fafc;
        }
        .table-responsive tbody tr td {
          padding: 6px 8px;
          height: 40px;
          line-height: 1.35;
          font-size: 12.5px;
          color: #0f172a;
        }
        .col-seq { width: 42px; text-align: center; color: #64748b; }
        .col-item { min-width: 150px; text-align: right; font-weight: 600; white-space: normal !important; }
        .col-desc { min-width: 100px; max-width: 160px; text-align: right; color: #64748b; overflow: hidden; text-overflow: ellipsis; }
        .col-qty { width: 78px; text-align: center; }
        .col-price { width: 92px; text-align: center; }
        .col-total { width: 104px; font-weight: 600; text-align: center; }
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
          gap: 8px;
          background: #ffffff;
          padding: 10px;
          border-top: 1px solid #cbd5e1;
          box-sizing: border-box;
          width: 100%;
        }
        .summary-bar {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          background: #ffffff;
          color: #0f172a;
          box-sizing: border-box;
          width: 100%;
          font-variant-numeric: tabular-nums;
        }
        @media (min-width: 768px) {
          .summary-bar {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }
        }
        .summary-item {
          font-size: 11.5px;
          font-weight: 500;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #475569;
          padding: 6px 8px;
          border-radius: 6px;
          text-align: center;
          box-sizing: border-box;
        }
        .summary-item span {
          font-weight: 700;
          color: #16a34a;
          display: block;
          font-size: 13px;
          margin-top: 2px;
        }
        .summary-net {
          grid-column: 1 / -1;
          background: #f0fdf4 !important;
          border: 1px solid #86efac !important;
          color: #166534 !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 14px;
        }
        .summary-net span {
          color: #15803d !important;
          font-size: 16px !important;
          font-weight: 700 !important;
          margin-top: 0;
        }
        .btn-action-bar {
          display: flex;
          gap: 8px;
          width: 100%;
          box-sizing: border-box;
        }
        .btn-action {
          flex: 1;
          min-height: 44px;
          padding: 10px 14px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13.5px;
          color: #ffffff;
          cursor: pointer;
          text-align: center;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: filter 0.15s ease;
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
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-white hover:bg-white/15 hover:text-rose-200 transition cursor-pointer shrink-0"
              title="إغلاق"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="w-8 h-8 flex items-center justify-center rounded-md text-white hover:bg-white/15 transition cursor-pointer shrink-0"
              title={isMaximized ? 'تصغير' : 'تكبير'}
            >
              <i className={`fa-solid ${isMaximized ? 'fa-compress' : 'fa-expand'} text-xs`}></i>
            </button>
            <span className="font-semibold text-sm truncate">
              <i className={`fa-solid ${invoiceTheme.icon} ml-1.5`}></i>
              {invoiceTheme.badgeText}
            </span>
          </div>
          <span id="liveTime" className="shrink-0">{liveTime}</span>
        </div>

        {/* 📑 Main Content Area */}
        <div className="main-content">
          {/* 1. Header Information Card */}
          <div className="invoice-card">
            <div className="field-inline">
              <label>رقم الفاتورة</label>
              <input type="text" value={invNum} readOnly className="tabular-nums bg-slate-50" />
            </div>
            <div className="field-inline">
              <label>التاريخ</label>
              <input
                type="date"
                value={invDate}
                onChange={(e) => setInvDate(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="field-inline">
              <label>الوقت</label>
              <input
                type="time"
                value={invTime}
                onChange={(e) => setInvTime(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="field-inline">
              <label>{isSale ? 'كود العميل' : 'كود المورد'}</label>
              <input
                type="text"
                value={custCode}
                onChange={(e) => setCustCode(e.target.value)}
                placeholder="الكود..."
                className="tabular-nums"
              />
            </div>
            <div className="field-inline">
              <label>{isSale ? 'اسم العميل (بحث)' : 'اسم المورد (بحث)'}</label>
              <input
                type="text"
                value={custName}
                onFocus={() => setShowCustDropdown(true)}
                onChange={(e) => {
                  setCustName(e.target.value);
                  setShowCustDropdown(true);
                }}
                placeholder="اكتب للبحث..."
              />
              {showCustDropdown && partySuggestions.length > 0 && (
                <div className="absolute top-full mt-1 right-0 left-0 bg-white border border-slate-300 rounded-md shadow-lg z-50 max-h-48 overflow-y-auto text-xs">
                  {partySuggestions.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setCustName(p.name);
                        setCustCode(p.code || p.id);
                        if (p.phone) setCustPhone(p.phone);
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
            <div className="field-inline">
              <label>رقم الهاتف (بحث)</label>
              <input
                type="text"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="ابحث برقم الهاتف..."
                className="tabular-nums"
              />
            </div>
            <div className="field-inline span-3">
              <label>البيان / جهة العمل</label>
              <input
                type="text"
                value={jobSite}
                onChange={(e) => setJobSite(e.target.value)}
                placeholder="البيان..."
              />
            </div>
          </div>

          {/* 🟡 2. شريط حالة الحساب والدائن/المدين */}
          <div className="account-status-bar">
            <div>
              <span className="text-slate-600">حالة الحساب: </span>
              <span
                style={{
                  color:
                    selectedInvoiceType === 'ajel'
                      ? '#d97706'
                      : partyBalance > 0
                      ? '#dc2626'
                      : partyBalance < 0
                      ? '#2563eb'
                      : '#16a34a',
                }}
              >
                {selectedInvoiceType === 'ajel'
                  ? 'آجل'
                  : partyBalance > 0
                  ? (isSale ? 'مدين (عليه مديونية)' : 'دائن (له مستحقات)')
                  : partyBalance < 0
                  ? (isSale ? 'دائن (له رصيد)' : 'مدين (عليه رصيد)')
                  : 'نقدي'}
              </span>
            </div>
            <div>
              <span className="text-amber-900">المبلغ (له / عليه): </span>
              <span
                className="tabular-nums"
                style={{
                  color:
                    partyBalance > 0
                      ? '#dc2626'
                      : partyBalance < 0
                      ? '#2563eb'
                      : '#16a34a',
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

          {/* 🏷️ 3. نظام تسعير الفاتورة ونوع السداد */}
          <div className="pricing-tier-bar">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[230px]">
              <span className="text-xs font-semibold text-slate-700 shrink-0">
                التسعير:
              </span>
              <div className="flex gap-1.5 flex-1 max-w-[300px]">
                <button
                  type="button"
                  onClick={() => handleChangePricingTier('cash')}
                  className={`pricing-tier-btn ${activePricingTier === 'cash' ? 'active-cash' : ''}`}
                  title="سعر البيع النقدي (القطاعي)"
                >
                  سعر نقدي
                </button>
                <button
                  type="button"
                  onClick={() => handleChangePricingTier('wholesale')}
                  className={`pricing-tier-btn ${activePricingTier === 'wholesale' ? 'active-wholesale' : ''}`}
                  title="سعر بيع الجملة"
                >
                  سعر جملة
                </button>
                <button
                  type="button"
                  onClick={() => handleChangePricingTier('buy')}
                  className={`pricing-tier-btn ${activePricingTier === 'buy' ? 'active-buy' : ''}`}
                  title="سعر الشراء والتكلفة"
                >
                  سعر شراء
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-semibold text-slate-700">الدفع:</span>
              <button
                type="button"
                onClick={() => setSelectedInvoiceType(isReturn ? 'return_nagdi' : 'nagdi')}
                className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-semibold border cursor-pointer transition ${
                  selectedInvoiceType === 'nagdi' || selectedInvoiceType === 'return_nagdi'
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {isReturn ? 'مرتجع نقدي' : 'كاش / نقدي'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedInvoiceType(isReturn ? 'return_ajel' : 'ajel')}
                className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-semibold border cursor-pointer transition ${
                  selectedInvoiceType === 'ajel' || selectedInvoiceType === 'return_ajel'
                    ? 'bg-amber-700 border-amber-700 text-white'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {isReturn ? 'مرتجع آجل' : 'آجل / ذمم'}
              </button>
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
                        if (isSale && (orig as SaleInvoice).salesType === 'wholesale') {
                          setActivePricingTier('wholesale');
                        }
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

          {/* 4. Top Action Buttons Grid */}
          <div className="top-actions-grid">
            <button
              type="button"
              className="btn-action-top"
              onClick={() => {
                setHierarchyState({ step: 'groups', selectedGroup: null, selectedCompany: null, selectedType: null });
                setGlobalLookupSearch('');
                setIsLookupModalOpen(true);
              }}
              title="دليل الأصناف والتنقل الهرمي لاختيار صنف"
            >
              <i className="fa-solid fa-boxes-stacked"></i>
              <span>دليل الأصناف</span>
            </button>
            <button
              type="button"
              className="btn-action-top btn-action-alt"
              onClick={() => {
                setIsOptionsModalOpen(true);
              }}
              title="الخصم، الضريبة وإدارة المدفوعات"
            >
              <i className="fa-solid fa-sliders"></i>
              <span>الخصم والدفع</span>
            </button>
          </div>

          {/* 🔍 Quick Search Bar on-screen for direct mobile/desktop item addition */}
          <div className="relative w-full">
            <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-300">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={workspaceItemSearch}
                  onChange={(e) => {
                    setWorkspaceItemSearch(e.target.value);
                    setShowWorkspaceItemDropdown(true);
                  }}
                  onFocus={() => {
                    if (workspaceItemSearch.trim()) setShowWorkspaceItemDropdown(true);
                  }}
                  placeholder="اكتب اسم أو كود الصنف للإضافة المباشرة..."
                  className="w-full text-base md:text-xs min-h-[38px] py-1.5 px-3 rounded-md bg-slate-50 border border-slate-300 focus:outline-none focus:bg-white focus:border-blue-600 text-slate-900"
                />
                {workspaceItemSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceItemSearch('');
                      setShowWorkspaceItemDropdown(false);
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-base px-1.5"
                  >
                    ×
                  </button>
                )}
              </div>
              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap shrink-0 tabular-nums px-1">
                {localItemsDatabase.length} صنف
              </span>
            </div>

            {/* Quick Autocomplete Dropdown */}
            {showWorkspaceItemDropdown && filteredWorkspaceItems.length > 0 && (
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
                          <span className="text-[11px] text-slate-500">
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
              </div>
            )}
          </div>

          {/* 5. Items Table */}
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th className="col-seq">م</th>
                  <th className="col-item">الصنف</th>
                  <th className="col-desc">الوصف</th>
                  <th className="col-qty">العدد</th>
                  <th className="col-price">سعر</th>
                  <th className="col-total">اجمالي</th>
                  <th className="col-action">إجراء</th>
                </tr>
              </thead>
              <tbody id="invoiceItemsTable">
                {currentInvoiceItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-slate-400 py-8 text-sm">
                      لم يتم إدراج أصناف بعد
                    </td>
                  </tr>
                ) : (
                  currentInvoiceItems.map((item, index) => (
                    <tr key={item.rowId}>
                      <td className="col-seq tabular-nums">{index + 1}</td>
                      <td className="col-item">
                        <span className="font-semibold text-slate-900">{item.name}</span>
                      </td>
                      <td className="col-desc">
                        {item.spec || '-'}
                      </td>
                      <td className="col-qty">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={item.qty}
                          onChange={(e) => updateTableRowQty(index, e.target.value)}
                          className="w-16 h-8 text-center text-sm md:text-xs font-semibold border border-slate-300 rounded-md bg-white tabular-nums focus:border-blue-600 focus:outline-none"
                        />
                      </td>
                      <td className="col-price">
                        <input
                          type="number"
                          step="any"
                          value={item.price}
                          onChange={(e) => updateTableRowPrice(index, e.target.value)}
                          className="w-20 h-8 text-center text-sm md:text-xs font-semibold border border-slate-300 rounded-md bg-white tabular-nums focus:border-blue-600 focus:outline-none"
                        />
                      </td>
                      <td className="col-total">
                        <input
                          type="number"
                          step="any"
                          value={item.total}
                          onChange={(e) => updateTableRowTotal(index, e.target.value)}
                          title="تعديل الإجمالي يقسم تلقائياً على العدد ليضبط سعر الوحدة"
                          className="w-24 h-8 text-center text-sm md:text-xs font-semibold border border-emerald-400 bg-emerald-50 text-emerald-900 rounded-md tabular-nums focus:border-emerald-600 focus:outline-none"
                        />
                      </td>
                      <td className="col-action">
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

        {/* 6. Bottom Fixed Summary & Action Bar */}
        <div className="bottom-fixed-area">
          <div className="summary-bar">
            <div className="summary-item">
              اجمالي العدد: <span id="lblItemsTotal">{totals.qtySum.toFixed(2)}</span>
            </div>
            <div className="summary-item">
              الخصومات: <span id="lblDiscTotal">{totals.discount.toFixed(2)}</span>
            </div>
            <div className="summary-item">
              الضرائب: <span id="lblTaxTotal">{totals.tax.toFixed(2)}</span>
            </div>
            <div className="summary-item">
              الإيراد: <span id="lblExtraTotal">{totals.extra.toFixed(2)}</span>
            </div>
            <div className="summary-item">
              المدفوع: <span id="lblPaidTotal" style={{ color: '#2563eb' }}>{totals.paid.toFixed(2)}</span>
            </div>
            <div className="summary-item">
              المتبقي: <span id="lblRemainTotal" style={{ color: '#dc2626' }}>{totals.remain.toFixed(2)}</span>
            </div>
            <div className="summary-item summary-net">
              اجمالي الصافي: <span id="lblNetTotal">{totals.net.toFixed(2)}</span>
            </div>
          </div>

          <div className="btn-action-bar">
            <button
              type="button"
              className="btn-action"
              style={{ background: '#16a34a' }}
              onClick={saveInvoice}
            >
              <i className="fa-solid fa-save"></i>
              <span>حفظ وترحيل الحسابات</span>
            </button>
            <button
              type="button"
              className="btn-action"
              style={{ background: '#2563eb' }}
              onClick={handlePrintCurrentInvoice}
            >
              <i className="fa-solid fa-print"></i>
              <span>طباعة</span>
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

      {/* 📇 كارت الصنف التفصيلي */}
      {isDetailCardOpen && cardItem && (
        <div className="modal-overlay" id="itemDetailCardModal">
          <div className="modal-box">
            <div className="modal-header">
              <span>
                <i className="fa-solid fa-pen-to-square ml-1.5"></i> كارت الصنف التفصيلي
              </span>
              <button
                type="button"
                onClick={() => setIsDetailCardOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-white hover:bg-white/15 text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <input type="hidden" value={cardItem.code} />
              <div className="field-inline">
                <label>اسم الصنف:</label>
                <input
                  type="text"
                  readOnly
                  value={cardItem.name}
                  className="!bg-slate-100 !font-semibold"
                />
              </div>
              <div className="edit-card-grid">
                <div className="field-inline">
                  <label>المتاح بالمخزن:</label>
                  <input
                    type="text"
                    readOnly
                    value={cardItem.stock}
                    className="!bg-slate-100 !font-semibold !text-blue-700 text-center tabular-nums"
                  />
                </div>
                <div className="field-inline">
                  <label>سعر الشراء:</label>
                  <input
                    type="text"
                    readOnly
                    value={`${Number(cardItem.buyPrice || 0).toFixed(2)} ج.م`}
                    className="!bg-slate-100 !font-semibold !text-rose-700 text-center tabular-nums"
                  />
                </div>
              </div>
              {/* أزرار التسعير السريعة داخل كارت الصنف */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const p = getItemPriceForTier(cardItem, 'cash');
                    setCardPrice(p.toString());
                    setCardLastEdited('price');
                    const q = parseFloat(cardQty) || 1;
                    setCardTotal((p * q).toFixed(2));
                  }}
                  className="min-h-[36px] px-2 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-md cursor-pointer tabular-nums hover:bg-emerald-100"
                >
                  نقدي ({getItemPriceForTier(cardItem, 'cash').toFixed(2)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = getItemPriceForTier(cardItem, 'wholesale');
                    setCardPrice(p.toString());
                    setCardLastEdited('price');
                    const q = parseFloat(cardQty) || 1;
                    setCardTotal((p * q).toFixed(2));
                  }}
                  className="min-h-[36px] px-2 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-300 rounded-md cursor-pointer tabular-nums hover:bg-indigo-100"
                >
                  جملة ({getItemPriceForTier(cardItem, 'wholesale').toFixed(2)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = getItemPriceForTier(cardItem, 'buy');
                    setCardPrice(p.toString());
                    setCardLastEdited('price');
                    const q = parseFloat(cardQty) || 1;
                    setCardTotal((p * q).toFixed(2));
                  }}
                  className="min-h-[36px] px-2 py-1.5 text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300 rounded-md cursor-pointer tabular-nums hover:bg-rose-100"
                >
                  شراء ({getItemPriceForTier(cardItem, 'buy').toFixed(2)})
                </button>
              </div>

              <div className="edit-card-grid">
                <div className="field-inline">
                  <label>سعر الحركة (الوحدة):</label>
                  <input
                    type="number"
                    step="any"
                    value={cardPrice}
                    onChange={(e) => handleCardPriceChange(e.target.value)}
                    placeholder="سعر الوحدة..."
                    className="!font-semibold !text-emerald-700 text-center tabular-nums"
                  />
                </div>
                <div className="field-inline">
                  <label>سعر الجملة الإضافي:</label>
                  <input
                    type="number"
                    readOnly
                    value={cardItem.wholesalePrice || 0}
                    className="!bg-slate-100 !font-semibold !text-amber-700 text-center tabular-nums"
                  />
                </div>
              </div>
              <div className="edit-card-grid">
                <div className="field-inline">
                  <label>العدد المطلوب:</label>
                  <input
                    ref={cardQtyInputRef}
                    id="input-card-qty"
                    type="number"
                    min="0.01"
                    step="any"
                    value={cardQty}
                    onChange={(e) => handleCardQtyChange(e.target.value)}
                    className="text-center !font-semibold tabular-nums"
                  />
                </div>
                <div className="field-inline">
                  <label className="!text-emerald-800">
                    الإجمالي (حساب عكسي للسعر):
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={cardTotal}
                    onChange={(e) => handleCardTotalChange(e.target.value)}
                    placeholder="اكتب الإجمالي..."
                    title="أدخل الإجمالي هنا ليتم تقسيم السعر على الكمية تلقائياً"
                    className="!bg-emerald-50 !border-emerald-400 !font-semibold !text-emerald-800 text-center tabular-nums"
                  />
                </div>
              </div>

              {/* شريط توضيح ميزة الحساب العكسي التلقائي */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 text-xs text-emerald-800 flex flex-wrap items-center justify-between gap-1 font-medium">
                <span>الحساب العكسي:</span>
                <span>اكتب الإجمالي ليتم ضبط سعر الوحدة تلقائياً (السعر = الإجمالي ÷ الكمية)</span>
              </div>
              <div className="field-inline">
                <label>الوصف / البيان / ملاحظات البند:</label>
                <input
                  type="text"
                  value={cardSpec}
                  onChange={(e) => setCardSpec(e.target.value)}
                  placeholder="ملاحظات..."
                />
              </div>
              <button
                type="button"
                className="btn-action-top mt-1"
                style={{ background: '#16a34a' }}
                onClick={confirmAddDetailedItem}
              >
                <i className="fa-solid fa-check"></i>
                <span>إضافة للفاتورة</span>
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
                className="flex-1 min-w-[200px] min-h-[38px] px-3 py-1.5 text-base md:text-xs border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
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
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-center bg-slate-50 p-2 rounded-md border border-slate-200 font-normal tabular-nums">
                        <div>المخزون: <strong className="text-blue-600">{item.stock}</strong></div>
                        <div>شراء: <strong className="text-rose-600">{Number(item.buyPrice || 0).toFixed(2)}</strong></div>
                        <div>قطاعي: <strong className="text-emerald-600">{Number(item.cashPrice || 0).toFixed(2)}</strong></div>
                        <div>جملة: <strong className="text-amber-600">{Number(item.wholesalePrice || 0).toFixed(2)}</strong></div>
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
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-center bg-slate-50 p-2 rounded-md border border-slate-200 font-normal tabular-nums">
                        <div>المخزون: <strong className="text-blue-600">{item.stock}</strong></div>
                        <div>شراء: <strong className="text-rose-600">{Number(item.buyPrice || 0).toFixed(2)}</strong></div>
                        <div>قطاعي: <strong className="text-emerald-600">{Number(item.cashPrice || 0).toFixed(2)}</strong></div>
                        <div>جملة: <strong className="text-amber-600">{Number(item.wholesalePrice || 0).toFixed(2)}</strong></div>
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
                  <label>سعر القطاعي</label>
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
                  <label>سعر الجملة</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editWholesalePriceManual}
                    onChange={(e) => setEditWholesalePriceManual(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
                <div className="field-inline span-2">
                  <label>العدد بالمخزون</label>
                  <input
                    type="number"
                    min="0"
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
                  <label>سعر القطاعي (نقدي)</label>
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

                <div className="field-inline span-2">
                  <label>سعر بيع الجملة</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={hierWholesalePrice}
                    onChange={(e) => setHierWholesalePrice(e.target.value)}
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
    </div>
  );
};

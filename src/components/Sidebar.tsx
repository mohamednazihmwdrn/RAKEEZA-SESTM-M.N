import React, { useState } from 'react';
import {
  LayoutDashboard,
  Zap,
  ShoppingCart,
  Tag,
  FileText,
  Target,
  Inbox,
  ShoppingBag,
  Package,
  Wallet,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  UserCheck,
  Briefcase,
  Building2,
  Scale,
  FolderTree,
  Boxes,
  BookOpen,
  Receipt,
  TrendingUp,
  BarChart3,
  Landmark,
  History,
  Settings,
  UserCog,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Folder,
  FileBarChart,
  X,
} from 'lucide-react';
import { User } from '../types';
import { canAccessPage } from '../utils/permissions';
import {
  vendorReports,
  purchaseReports,
  customerReports,
  salesReports,
  inventoryReports,
  financialReports,
  receiptsReports,
  paymentsReports,
  repsReports,
  banksReports,
  miscReports,
} from '../utils/reportsData';

interface SidebarProps {
  isOpen: boolean;
  activePage: string;
  onNavigate: (page: string) => void;
  pendingWebOrdersCount?: number;
  onClose?: () => void;
  onLogout?: () => void;
  currentUser?: User;
  companyName?: string;
  branchesCount?: number;
  usersCount?: number;
  activeBranchName?: string;
}

interface ReportGroupDef {
  key: string;
  label: string;
  reports: string[];
}

const reportGroups: ReportGroupDef[] = [
  { key: 'vendors', label: 'تقارير الموردين', reports: vendorReports },
  { key: 'purchases', label: 'تقارير المشتريات', reports: purchaseReports },
  { key: 'customers', label: 'تقارير العملاء', reports: customerReports },
  { key: 'sales', label: 'تقارير المبيعات', reports: salesReports },
  { key: 'inventory', label: 'تقارير المخزون والمستودعات', reports: inventoryReports },
  { key: 'financial', label: 'تقارير الأرباح والقوائم والضرائب', reports: financialReports },
  { key: 'receipts', label: 'تقارير المقبوضات', reports: receiptsReports },
  { key: 'payments', label: 'تقارير المدفوعات', reports: paymentsReports },
  { key: 'reps', label: 'تقارير المندوبين', reports: repsReports },
  { key: 'banks', label: 'تقارير البنوك والوسائل', reports: banksReports },
  { key: 'misc', label: 'تقارير محاسبية متنوعة', reports: miscReports },
];

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  activePage,
  onNavigate,
  pendingWebOrdersCount = 0,
  onClose,
  onLogout,
  currentUser,
  companyName,
  branchesCount,
  usersCount,
}) => {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({
    items: false,
    operations: false,
    accounting_tree: false,
    reports_group: false,
  });

  const [secretClicks, setSecretClicks] = useState(0);
  const [lastSecretTime, setLastSecretTime] = useState(0);

  const handleSecretRakeezaClicks = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastSecretTime < 3000) {
      const next = secretClicks + 1;
      if (next >= 5) {
        setSecretClicks(0);
        window.dispatchEvent(new CustomEvent('trigger_rakeeza_owner_modal'));
      } else {
        setSecretClicks(next);
      }
    } else {
      setSecretClicks(1);
    }
    setLastSecretTime(now);
  };

  const toggleItem = (key: string) => {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleNav = (page: string) => {
    onNavigate(page);
    if (typeof window !== 'undefined' && window.innerWidth < 1024 && onClose) {
      onClose();
    }
  };

  const navItemClass = (pageKey: string, extraActiveStyle?: string) => {
    const isActive = activePage === pageKey;
    if (isActive) {
      return (
        extraActiveStyle ||
        'bg-blue-50/80 text-blue-900 font-semibold border-r-[3px] border-blue-700'
      );
    }
    return 'text-slate-700 hover:text-slate-950 hover:bg-slate-50 active:bg-slate-100 font-medium';
  };

  return (
    <nav
      className={`fixed top-0 lg:top-[56px] right-0 bottom-0 w-[85vw] max-w-[300px] lg:w-[280px] bg-white text-slate-900 overflow-y-auto transition-transform duration-300 z-50 lg:z-40 flex flex-col border-l border-slate-200 shadow-lg lg:shadow-none no-print ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      dir="rtl"
    >
      <div className="flex flex-col text-sm flex-1">
        {/* Mobile & Tablet Drawer Top Bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="flex items-center gap-2.5 min-w-0 cursor-pointer" onClick={handleSecretRakeezaClicks}>
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-slate-900 text-sm block truncate">
                {companyName || 'المنظومة المحاسبية'}
              </span>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center transition cursor-pointer"
              aria-label="إغلاق القائمة"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Desktop Sidebar System Branding Header */}
        <div
          className="hidden lg:flex items-center gap-2.5 px-4 py-3 bg-white border-b border-slate-200 cursor-pointer"
          onClick={handleSecretRakeezaClicks}
        >
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-slate-900 text-sm block truncate">
              {companyName || 'المنظومة المحاسبية'}
            </span>
          </div>
        </div>

        {/* الرئيسية / Dashboard */}
        {canAccessPage(currentUser, 'home') && (
          <div
            onClick={() => handleNav('home')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('home')}`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">الرئيسية ولوحة التحكم</span>
          </div>
        )}

        {/* نقطة البيع السريعة POS */}
        {canAccessPage(currentUser, 'pos') && (
          <div
            onClick={() => handleNav('pos')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('pos')}`}
          >
            <Zap className="w-4 h-4 shrink-0 text-amber-600" />
            <span className="text-[13.5px]">نقطة البيع (POS)</span>
          </div>
        )}

        {/* إدارة المبيعات */}
        {canAccessPage(currentUser, 'sales') && (
          <div
            onClick={() => handleNav('sales')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('sales')}`}
          >
            <ShoppingCart className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">إدارة المبيعات والفواتير</span>
          </div>
        )}

        {/* إدارة الأسعار */}
        {canAccessPage(currentUser, 'price_management') && (
          <div
            onClick={() => handleNav('price_management')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('price_management')}`}
          >
            <Tag className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">إدارة الأسعار والتسعير</span>
          </div>
        )}

        {/* قائمة أسعار الشركات والتصنيفات */}
        {canAccessPage(currentUser, 'company_prices') && (
          <div
            onClick={() => handleNav('company_prices')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('company_prices')}`}
          >
            <Building2 className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">أسعار الشركات والتصنيفات</span>
          </div>
        )}

        {/* عروض الأسعار والطلبيات */}
        {canAccessPage(currentUser, 'quotes_orders') && (
          <div
            onClick={() => handleNav('quotes_orders')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('quotes_orders')}`}
          >
            <FileText className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">عروض الأسعار والطلبيات</span>
          </div>
        )}

        {/* علاقات العملاء CRM */}
        {canAccessPage(currentUser, 'crm_pipeline') && (
          <div
            onClick={() => handleNav('crm_pipeline')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('crm_pipeline')}`}
          >
            <Target className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">علاقات العملاء (CRM)</span>
          </div>
        )}

        {/* طلبات الويب سايت */}
        {canAccessPage(currentUser, 'web_orders') && (
          <div
            onClick={() => handleNav('web_orders')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex justify-between items-center ${navItemClass('web_orders')}`}
          >
            <div className="flex items-center gap-2.5">
              <Inbox className="w-4 h-4 shrink-0 text-slate-500" />
              <span className="text-[13.5px]">طلبات الويب سايت</span>
            </div>
            {(pendingWebOrdersCount ?? 0) > 0 && (
              <span className="bg-rose-600 text-white text-[11px] px-2 py-0.5 rounded font-semibold financial-num">
                {pendingWebOrdersCount}
              </span>
            )}
          </div>
        )}

        {/* منتجات وأسعار الكتالوج */}
        {canAccessPage(currentUser, 'catalog_manager') && (
          <div
            onClick={() => handleNav('catalog_manager')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('catalog_manager')}`}
          >
            <ShoppingBag className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">المتجر والكتالوج الإلكتروني</span>
          </div>
        )}

        {/* إدارة المشتريات */}
        {canAccessPage(currentUser, 'purchases') && (
          <div
            onClick={() => handleNav('purchases')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('purchases')}`}
          >
            <Package className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">إدارة المشتريات والتوريد</span>
          </div>
        )}

        {/* حسابات العملاء والموردين */}
        {canAccessPage(currentUser, 'accounts') && (
          <div
            onClick={() => handleNav('accounts')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('accounts')}`}
          >
            <Users className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">حسابات العملاء والموردين</span>
          </div>
        )}

        {/* العملاء */}
        {canAccessPage(currentUser, 'customers') && (
          <div
            onClick={() => handleNav('customers')}
            className={`min-h-[40px] pr-8 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center gap-2 ${navItemClass('customers')}`}
          >
            <Users className="w-3.5 h-3.5 shrink-0 text-slate-500" />
            <span className="text-[13px]">إدارة العملاء</span>
          </div>
        )}

        {/* الموردين */}
        {canAccessPage(currentUser, 'suppliers') && (
          <div
            onClick={() => handleNav('suppliers')}
            className={`min-h-[40px] pr-8 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center gap-2 ${navItemClass('suppliers')}`}
          >
            <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-500" />
            <span className="text-[13px]">إدارة الموردين</span>
          </div>
        )}

        {/* سندات القبض والصرف */}
        {canAccessPage(currentUser, 'cash') && (
          <div
            onClick={() => handleNav('cash')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('cash')}`}
          >
            <Wallet className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">سندات القبض والصرف والخزينة</span>
          </div>
        )}

        {/* سندات القبض */}
        {canAccessPage(currentUser, 'receipts') && (
          <div
            onClick={() => handleNav('receipts')}
            className={`min-h-[40px] pr-8 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center gap-2 ${navItemClass('receipts')}`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 shrink-0 text-slate-500" />
            <span className="text-[13px]">سندات القبض (التحصيل)</span>
          </div>
        )}

        {/* سندات الصرف */}
        {canAccessPage(currentUser, 'payments') && (
          <div
            onClick={() => handleNav('payments')}
            className={`min-h-[40px] pr-8 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center gap-2 ${navItemClass('payments')}`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-slate-500" />
            <span className="text-[13px]">سندات الصرف والمصروفات</span>
          </div>
        )}

        {/* أرصدة الخزائن والبنوك */}
        {canAccessPage(currentUser, 'treasury') && (
          <div
            onClick={() => handleNav('treasury')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('treasury')}`}
          >
            <Landmark className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">أرصدة الخزائن والبنوك</span>
          </div>
        )}

        {/* الشيكات وأوراق القبض والدفع */}
        {canAccessPage(currentUser, 'cheques') && (
          <div
            onClick={() => handleNav('cheques')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('cheques')}`}
          >
            <CreditCard className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">الشيكات وأوراق الدفع والقبض</span>
          </div>
        )}

        {/* التسوية البنكية والاعتمادات */}
        {canAccessPage(currentUser, 'bank_reconciliation') && (
          <div
            onClick={() => handleNav('bank_reconciliation')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('bank_reconciliation')}`}
          >
            <Scale className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">التسوية البنكية والاعتمادات</span>
          </div>
        )}

        {/* المخزون والأصناف (Collapsible) */}
        {(canAccessPage(currentUser, 'items') || canAccessPage(currentUser, 'inventory')) && (
          <div>
            <div
              onClick={() => toggleItem('items')}
              className="min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 flex justify-between items-center text-slate-700 font-medium"
            >
              <div className="flex items-center gap-2.5">
                <Boxes className="w-4 h-4 shrink-0 text-slate-500" />
                <span className="text-[13.5px]">المخزون والأصناف والمستودعات</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 transition-transform text-slate-500 ${
                  openItems.items ? 'rotate-180 text-slate-800' : ''
                }`}
              />
            </div>
            {openItems.items && (
              <div className="bg-slate-50/70 border-y border-slate-200 text-[13px]">
                {canAccessPage(currentUser, 'items') && (
                  <div
                    onClick={() => handleNav('items')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('items')}`}
                  >
                    <span>دليل الأصناف والباركود</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'items') && (
                  <div
                    onClick={() => handleNav('item_movement')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('item_movement')}`}
                  >
                    <span>سجل حركة الصنف</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'inventory') && (
                  <div
                    onClick={() => handleNav('inventory')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('inventory')}`}
                  >
                    <span>تقييم المخزون الإجمالي</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'physical_inventory') && (
                  <div
                    onClick={() => handleNav('physical_inventory')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('physical_inventory')}`}
                  >
                    <span>الجرد الفعلي وتسوية المخازن</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'serial_warranty') && (
                  <div
                    onClick={() => handleNav('serial_warranty')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('serial_warranty')}`}
                  >
                    <span>الأرقام التسلسلية وتتبع الضمان</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'manufacturing') && (
                  <div
                    onClick={() => handleNav('manufacturing')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('manufacturing')}`}
                  >
                    <span>التصنيع ومعادلات الإنتاج (BOM)</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* الفروع والتحويلات */}
        {canAccessPage(currentUser, 'branches') && (
          <div
            onClick={() => handleNav('branches')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex justify-between items-center ${navItemClass('branches')}`}
          >
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 shrink-0 text-slate-500" />
              <span className="text-[13.5px]">إدارة الفروع والتحويلات</span>
            </div>
            {branchesCount !== undefined && (
              <span className="text-xs text-slate-500 font-medium financial-num">
                {branchesCount}
              </span>
            )}
          </div>
        )}

        {/* المحاسبة والقوائم المالية (Collapsible) */}
        {(canAccessPage(currentUser, 'daily_operations') || canAccessPage(currentUser, 'trial_balance')) && (
          <div>
            <div
              onClick={() => toggleItem('operations')}
              className="min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 flex justify-between items-center text-slate-700 font-medium"
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 shrink-0 text-slate-500" />
                <span className="text-[13.5px]">المحاسبة والقيود والقوائم المالية</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 transition-transform text-slate-500 ${
                  openItems.operations ? 'rotate-180 text-slate-800' : ''
                }`}
              />
            </div>
            {openItems.operations && (
              <div className="bg-slate-50/70 border-y border-slate-200 text-[13px]">
                {canAccessPage(currentUser, 'accounts_tree') && (
                  <div
                    onClick={() => handleNav('accounts_tree')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center gap-2 ${navItemClass('accounts_tree')}`}
                  >
                    <FolderTree className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>دليل الحسابات ومراكز التكلفة</span>
                  </div>
                )}
                {(canAccessPage(currentUser, 'daily_operations') || canAccessPage(currentUser, 'daily_entries')) && (
                  <div
                    onClick={() => handleNav('daily_operations')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('daily_operations')}`}
                  >
                    <span>العمليات اليومية ودفتر القيود</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'trial_balance') && (
                  <div
                    onClick={() => handleNav('trial_balance')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('trial_balance')}`}
                  >
                    <span>ميزان المراجعة</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'income_statement') && (
                  <div
                    onClick={() => handleNav('income_statement')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('income_statement')}`}
                  >
                    <span>قائمة الدخل والأرباح والخسائر</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'balance_sheet') && (
                  <div
                    onClick={() => handleNav('balance_sheet')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('balance_sheet')}`}
                  >
                    <span>الميزانية العمومية</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'monthly_profit_report') && (
                  <div
                    onClick={() => handleNav('monthly_profit_report')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('monthly_profit_report')}`}
                  >
                    <span>تقرير الأرباح وتكلفة المبيعات (COGS)</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'cash_flow_closing') && (
                  <div
                    onClick={() => handleNav('cash_flow_closing')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('cash_flow_closing')}`}
                  >
                    <span>قائمة التدفقات النقدية</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'fixed_assets') && (
                  <div
                    onClick={() => handleNav('fixed_assets')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('fixed_assets')}`}
                  >
                    <span>الأصول الثابتة والإهلاكات</span>
                  </div>
                )}
                {canAccessPage(currentUser, 'year_end_closing') && (
                  <div
                    onClick={() => handleNav('year_end_closing')}
                    className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center ${navItemClass('year_end_closing')}`}
                  >
                    <span>الإقفال السنوي والترحيل المالي</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* الفاتورة الإلكترونية والضرائب */}
        {canAccessPage(currentUser, 'e_invoicing') && (
          <div
            onClick={() => handleNav('e_invoicing')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('e_invoicing')}`}
          >
            <Receipt className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">الفاتورة الإلكترونية والضرائب</span>
          </div>
        )}

        {/* المندوبين والعمولات والائتمان */}
        {canAccessPage(currentUser, 'sales_reps') && (
          <div
            onClick={() => handleNav('sales_reps')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('sales_reps')}`}
          >
            <UserCheck className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">المندوبين والعمولات وسقف الائتمان</span>
          </div>
        )}

        {/* الموارد البشرية والرواتب */}
        {canAccessPage(currentUser, 'hr_payroll') && (
          <div
            onClick={() => handleNav('hr_payroll')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('hr_payroll')}`}
          >
            <Briefcase className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">الموارد البشرية والرواتب</span>
          </div>
        )}

        {/* ذكاء الأعمال والتحليلات BI */}
        {canAccessPage(currentUser, 'bi_analytics') && (
          <div
            onClick={() => handleNav('bi_analytics')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('bi_analytics')}`}
          >
            <TrendingUp className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">ذكاء الأعمال والتحليلات (BI)</span>
          </div>
        )}

        {/* التقارير الشاملة (Collapsible) */}
        {canAccessPage(currentUser, 'reports_group') && (
          <div>
            <div
              onClick={() => toggleItem('reports_group')}
              className="min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 flex justify-between items-center text-slate-700 font-medium"
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 shrink-0 text-slate-500" />
                <span className="text-[13.5px]">التقارير الشاملة والمصنفة</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 transition-transform text-slate-500 ${
                  openItems.reports_group ? 'rotate-180 text-slate-800' : ''
                }`}
              />
            </div>
            {openItems.reports_group && (
              <div className="bg-slate-50/70 border-y border-slate-200 text-[13px]">
                <div
                  onClick={() => handleNav('reports_group')}
                  className={`min-h-[40px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex items-center gap-2 ${
                    activePage === 'reports_group'
                      ? 'bg-blue-50/80 text-blue-900 font-semibold border-r-[3px] border-blue-700'
                      : 'text-slate-700 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <FileBarChart className="w-3.5 h-3.5 text-slate-500" />
                  <span>نظرة عامة على جميع التقارير</span>
                </div>
                {reportGroups.map((group) => {
                  const catPageId = `reports_${group.key}`;
                  const isCatActive = activePage === catPageId || activePage.startsWith(`${catPageId}_`);
                  return (
                    <div
                      key={group.key}
                      onClick={() => handleNav(catPageId)}
                      className={`min-h-[38px] pr-9 pl-4 py-2 cursor-pointer border-b border-slate-100 transition flex justify-between items-center ${
                        isCatActive
                          ? 'bg-blue-50/80 text-blue-900 font-semibold border-r-[3px] border-blue-700'
                          : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100 font-normal'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{group.label}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium financial-num">
                        {group.reports.length}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* سجل التدقيق والرقابة */}
        {canAccessPage(currentUser, 'audit_trail') && (
          <div
            onClick={() => handleNav('audit_trail')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('audit_trail')}`}
          >
            <History className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">سجل التدقيق والأمان والرقابة</span>
          </div>
        )}

        {/* الإعدادات العامة */}
        {canAccessPage(currentUser, 'settings') && (
          <div
            onClick={() => handleNav('settings')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('settings')}`}
          >
            <Settings className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">الإعدادات العامة للنظام</span>
          </div>
        )}

        {/* المستخدمين والصلاحيات */}
        {canAccessPage(currentUser, 'users') && (
          <div
            onClick={() => handleNav('users')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex justify-between items-center ${navItemClass('users')}`}
          >
            <div className="flex items-center gap-2.5">
              <UserCog className="w-4 h-4 shrink-0 text-slate-500" />
              <span className="text-[13.5px]">المستخدمين والصلاحيات</span>
            </div>
            {usersCount !== undefined && (
              <span className="text-xs text-slate-500 font-medium financial-num">
                {usersCount}
              </span>
            )}
          </div>
        )}

        {/* النسخ الاحتياطي والاستعادة */}
        {canAccessPage(currentUser, 'backup') && (
          <div
            onClick={() => handleNav('backup')}
            className={`min-h-[44px] px-4 py-2.5 cursor-pointer border-b border-slate-100 transition flex items-center gap-2.5 ${navItemClass('backup')}`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="text-[13.5px]">النسخ الاحتياطي والأمان</span>
          </div>
        )}
      </div>

      {/* Pinned Bottom User & Logout Section */}
      <div className="sticky bottom-0 mt-auto bg-slate-50 border-t border-slate-200 p-3 z-20">
        <div className="flex items-center gap-2.5 mb-2.5 px-0.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-semibold text-xs flex items-center justify-center shrink-0">
            {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900 truncate leading-tight">
              {currentUser?.name || 'مدير المنظومة'}
            </p>
            <p className="text-[11px] text-slate-500 font-normal truncate leading-tight mt-0.5">
              {companyName || 'المنظومة المحاسبية'}
            </p>
          </div>
        </div>

        {onLogout && (
          <button
            type="button"
            onClick={() => {
              if (onClose) onClose();
              onLogout();
            }}
            className="w-full min-h-[40px] flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>تسجيل الخروج</span>
          </button>
        )}
      </div>
    </nav>
  );
};

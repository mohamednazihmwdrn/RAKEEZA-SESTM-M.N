import React, { useState, useEffect } from 'react';
import { User, AppData } from '../types';
import {
  Menu,
  Building2,
  Cloud,
  ShoppingBag,
  User as UserIcon,
  LogOut,
  Sparkles,
  Crown,
  X,
  KeyRound,
  Activity,
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  GitBranch,
  Plus,
  MoreVertical,
  Share2,
  Download,
  Database,
} from 'lucide-react';
import { loginOwnerApi } from '../services/cloudApi';
import { downloadBackupJsonFile } from '../utils/autoBackup';

export function getCleanPageName(page?: string): string {
  if (!page) return 'الرئيسية';
  switch (page) {
    case 'home':
      return 'الرئيسية';
    case 'sales':
      return 'المبيعات';
    case 'purchases':
      return 'المشتريات';
    case 'accounts_tree':
      return 'شجرة الحسابات';
    case 'accounts':
      return 'الحسابات';
    case 'items':
      return 'دليل الأصناف';
    case 'inventory':
      return 'المخزن';
    case 'physical_inventory':
      return 'جرد المخازن';
    case 'inventory_settlement':
      return 'تسوية الجرد';
    case 'item_movement':
      return 'حركة الأصناف';
    case 'pos':
      return 'الكاشير';
    case 'cash':
      return 'القبض والصرف';
    case 'treasury':
      return 'الخزينة';
    case 'cheques':
      return 'الشيكات';
    case 'customers':
      return 'العملاء';
    case 'suppliers':
      return 'الموردين';
    case 'reports':
    case 'reports_group':
      return 'التقارير';
    case 'bi_analytics':
      return 'تحليلات الأعمال';
    case 'daily_operations':
      return 'العمليات اليومية';
    case 'daily_entries':
      return 'القيود اليومية';
    case 'trial_balance':
      return 'ميزان المراجعة';
    case 'income_statement':
      return 'الأرباح والخسائر';
    case 'balance_sheet':
      return 'الميزانية العمومية';
    case 'monthly_profit_report':
      return 'الأرباح الشهرية';
    case 'year_end_closing':
      return 'الإقفال السنوي';
    case 'price_management':
      return 'إدارة الأسعار';
    case 'quotes_orders':
      return 'عروض الأسعار';
    case 'web_orders':
      return 'طلبات المتجر';
    case 'catalog_manager':
      return 'إدارة الكتالوج';
    case 'catalog':
      return 'الكتالوج';
    case 'branches':
      return 'الفروع';
    case 'e_invoicing':
      return 'الفاتورة الإلكترونية';
    case 'sales_reps':
      return 'المندوبين';
    case 'hr_payroll':
      return 'الموارد البشرية';
    case 'fixed_assets':
      return 'الأصول الثابتة';
    case 'manufacturing':
      return 'التصنيع';
    case 'bank_reconciliation':
      return 'التسوية البنكية';
    case 'audit_trail':
      return 'سجل التدقيق';
    case 'company_prices':
    case 'company_catalog':
      return 'أسعار الشركات والتصنيفات';
    case 'settings':
      return 'الإعدادات';
    case 'users':
      return 'المستخدمين';
    case 'backup':
      return 'النسخ الاحتياطي';
    case 'owner_panel':
      return 'لوحة المالك';
    default:
      if (page.startsWith('reports_')) return 'التقارير';
      return 'الرئيسية';
  }
}

interface HeaderProps {
  currentUser?: User | undefined;
  companyName?: string;
  companyCode?: string;
  subscriptionPlan?: string;
  onToggleSidebar?: () => void;
  onLogout?: () => void;
  autoBackupActive?: boolean;
  onNavigateBackup?: () => void;
  onNavigateOwner?: () => void;
  onOwnerLoginSuccess?: (ownerSession: any) => void;
  onShareCatalog?: () => void;
  onOpenCatalog?: () => void;
  pendingWebOrdersCount?: number;
  onNavigateWebOrders?: () => void;
  appData?: AppData;
  onUpdateData?: (newData: AppData, logMeta?: { action: string; module: string; details: string }) => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onNavigateReports?: (fiscalYear?: string) => void;
  onNavigate?: (page: string) => void;
  currentPage?: string;
  onOpenDiagnostics?: () => void;
  onGoBack?: () => void;
  canGoBack?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  companyName,
  companyCode,
  subscriptionPlan,
  onToggleSidebar,
  onLogout,
  autoBackupActive = true,
  onNavigateBackup,
  onNavigateOwner,
  onOwnerLoginSuccess,
  onShareCatalog,
  onOpenCatalog,
  pendingWebOrdersCount = 0,
  onNavigateWebOrders,
  showToast,
  onNavigate,
  currentPage = 'home',
  onOpenDiagnostics,
  onGoBack,
  canGoBack = false,
  appData,
  onUpdateData,
}) => {
  const pageTitle = getCleanPageName(currentPage);

  // 🏢 Active Branch Dropdown state
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const branchDropdownRef = React.useRef<HTMLDivElement>(null);

  // 📱 Mobile 3-Dots Action Menu state (جمع الأزرار التفاعلية للهاتف)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = React.useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(event.target as Node)) {
        setIsBranchDropdownOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBranchDropdownOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Close dropdowns on route navigation
  useEffect(() => {
    setIsBranchDropdownOpen(false);
    setIsMobileMenuOpen(false);
  }, [currentPage]);

  const branches = appData?.branches || [];
  const activeBranchId = appData?.activeBranchId || branches[0]?.id || 'br-main';
  const currentActiveBranch = branches.find((b) => b.id === activeBranchId) || branches[0];

  // 👑 Secret 5-clicks state for Owner Panel under "RAKEEZA"
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [isSecretModalOpen, setIsSecretModalOpen] = useState(false);
  const [secretPassword, setSecretPassword] = useState('');
  const [secretError, setSecretError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Handle 5 consecutive clicks on the company name in the Header to open the Owner Panel
  const handleCompanyClicks = (e?: React.MouseEvent) => {
    const now = Date.now();
    if (now - lastClickTime < 2500) {
      const nextCount = clickCount + 1;
      if (nextCount >= 5) {
        e?.preventDefault();
        e?.stopPropagation();
        setClickCount(0);
        setIsSecretModalOpen(true);
        setSecretPassword('');
        setSecretError('');
        return;
      } else {
        setClickCount(nextCount);
      }
    } else {
      setClickCount(1);
    }
    setLastClickTime(now);

    // If single click, navigate to home
    if (clickCount === 0) {
      onNavigate?.('home');
    }
  };

  // Listen to custom event from Sidebar or Footer clicking "RAKEEZA" 5 times
  useEffect(() => {
    const handleGlobalTrigger = () => {
      setIsSecretModalOpen(true);
      setSecretPassword('');
      setSecretError('');
    };
    window.addEventListener('trigger_rakeeza_owner_modal', handleGlobalTrigger);
    return () => {
      window.removeEventListener('trigger_rakeeza_owner_modal', handleGlobalTrigger);
    };
  }, []);

  const handleVerifySecretPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = secretPassword.trim();
    if (!clean) {
      setSecretError('يرجى إدخال كلمة المرور.');
      return;
    }

    setIsVerifying(true);
    setSecretError('');

    try {
      // 1. Authoritative secret password verification: 29190615
      if (clean === '29190615') {
        const ownerSessionData = {
          token: `tok_owner_${Date.now()}`,
          user: {
            id: 'owner-mohamed-nazih',
            name: 'Mohamed Nazih (مالك المنظومة)',
            username: 'MohamedNazih',
            role: 'owner',
            permissions: { all: true },
          },
        };

        try {
          localStorage.setItem('rakeeza_owner_token', ownerSessionData.token);
          localStorage.setItem('rakeeza_owner_session_token', ownerSessionData.token);
          localStorage.setItem('rakeeza_owner_user', JSON.stringify(ownerSessionData.user));
          localStorage.setItem('rakeeza_current_page', 'owner_panel');
        } catch {}

        onOwnerLoginSuccess?.(ownerSessionData);
        setIsSecretModalOpen(false);
        setSecretPassword('');
        showToast?.('👑 تم التحقق بنجاح! مرحباً بمالك المنظومة [Mohamed Nazih]', 'success');
        onNavigateOwner?.();
        return;
      }

      // 2. Fallback to server API if another authorized password entered
      const res = await loginOwnerApi('MohamedNazih', clean);
      if (res && res.success && res.token) {
        onOwnerLoginSuccess?.(res);
        setIsSecretModalOpen(false);
        setSecretPassword('');
        showToast?.(`👑 تم التحقق بنجاح! مرحباً بمالك المنظومة [${res.user?.name || 'Mohamed Nazih'}]`, 'success');
        onNavigateOwner?.();
        return;
      }

      setSecretError(res.error || 'كلمة المرور غير صحيحة.');
    } catch (err: any) {
      setSecretError(err.message || 'فشل التحقق من كلمة المرور.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <>
      <header
        className="fixed top-0 right-0 left-0 h-[56px] bg-white text-slate-900 px-2 sm:px-4 flex items-center justify-between z-50 shadow-xs border-b border-slate-200 no-print select-none"
        dir="rtl"
      >
        {/* الجانب الأيمن: القائمة، زر الرجوع، الشعار، اسم المنشأة، واختيار الفرع */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1 sm:flex-initial">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 border border-slate-200 transition cursor-pointer flex items-center justify-center shrink-0 shadow-2xs"
              title="القائمة الجانبية"
              aria-label="القائمة الجانبية"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* زر الرجوع الذكي للهواتف والشاشات */}
          {canGoBack && onGoBack && (
            <button
              type="button"
              onClick={onGoBack}
              className="p-1.5 sm:p-2 rounded-xl bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 transition cursor-pointer flex items-center gap-1 select-none shadow-2xs shrink-0"
              title="الرجوع للصفحة السابقة"
              aria-label="الرجوع للصفحة السابقة"
            >
              <ArrowRight className="w-5 h-5 text-blue-700 shrink-0" />
              <span className="hidden md:inline text-xs font-bold text-blue-800">رجوع</span>
            </button>
          )}

          {/* شعار واسم المنشأة */}
          <div
            className="flex items-center gap-1.5 sm:gap-2 cursor-pointer transition hover:opacity-90 min-w-0"
            onClick={handleCompanyClicks}
            title="الصفحة الرئيسية (اضغط 5 مرات لفتح لوحة تحكم المالك)"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600 border border-blue-500 flex items-center justify-center text-white shadow-2xs shrink-0">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col text-right min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-extrabold text-xs sm:text-sm text-slate-900 tracking-wide truncate max-w-[85px] sm:max-w-[150px] md:max-w-[200px]">
                  {companyName || 'المنظومة المحاسبية'}
                </span>
                {companyCode && (
                  <span className="hidden md:inline-flex items-center text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                    {companyCode}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-500 font-semibold leading-none">
                نظام إدارة الفروع والمستخدمين
              </span>
            </div>
          </div>

          {/* 🏢 مبدل واختيار فروع الشركة التفاعلي */}
          {branches.length > 0 && (
            <div className="relative mr-0.5 sm:mr-1 shrink-0" ref={branchDropdownRef}>
              <button
                type="button"
                onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 border border-slate-300 text-xs font-black transition cursor-pointer shadow-2xs select-none max-w-[95px] sm:max-w-[160px]"
                title="الفرع النشط حالياً - انقر لاختيار فرع آخر أو إضافة فرع جديد"
              >
                <GitBranch className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                <span className="truncate">
                  {currentActiveBranch?.name || 'الفرع الرئيسي'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-700 shrink-0" />
              </button>

              {isBranchDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-300 rounded-2xl shadow-2xl z-50 p-2 text-right text-slate-900 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2.5 py-1.5 border-b border-slate-200 text-xs font-bold text-slate-600 flex justify-between items-center">
                    <span>🏢 فروع الشركة ({branches.length})</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-black">
                      الفرع النشط
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto py-1.5 space-y-1">
                    {branches.map((b) => {
                      const isCurrent = (appData?.activeBranchId || branches[0]?.id) === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            if (onUpdateData && appData) {
                              onUpdateData({ ...appData, activeBranchId: b.id });
                            }
                            setIsBranchDropdownOpen(false);
                            showToast?.(`تم تبديل فرع العمل بنجاح إلى: ${b.name}`, 'info');
                          }}
                          className={`w-full text-right px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                            isCurrent
                              ? 'bg-blue-600 text-white font-black shadow-xs'
                              : 'hover:bg-slate-100 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                isCurrent ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-800'
                              }`}
                            >
                              {b.code}
                            </span>
                            <span className="truncate">{b.name}</span>
                            {b.isMain && <span title="الفرع الرئيسي">⭐</span>}
                          </div>
                          {isCurrent && <CheckCircle2 className="w-4 h-4 text-white shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-200 pt-1.5 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsBranchDropdownOpen(false);
                        onNavigate?.('branches');
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>إدارة وإضافة فرع جديد للشركة</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* مسار الصفحة الحالية - للشاشات الكبيرة */}
          <div className="hidden lg:flex items-center gap-1.5 border-r border-slate-200 pr-2.5 mr-1">
            <span className="text-xs sm:text-sm font-bold text-slate-800">
              {pageTitle}
            </span>
          </div>
        </div>

        {/* الجانب الأيسر: زر ثلاث نقاط للهواتف يجمع كل الأزرار التفاعلية / وشريط كامل للشاشات الكبيرة */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* ========================================================= */}
          {/* 📱 وضع الهاتف: زر ثلاث نقاط رأسي يجمع كل الأزرار التفاعلية */}
          {/* ========================================================= */}
          {/* ========================================================= */}
          {/* 📱💻 زر الثلاث نقاط أعلى الشمال: قائمة منظمة وواضحة وليست طولية */}
          {/* ========================================================= */}
          <div className="relative" ref={mobileMenuRef}>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center relative shadow-sm ${
                isMobileMenuOpen
                  ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                  : 'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 border border-slate-200'
              }`}
              title="خيارات وإجراءات المنظومة (المزامنة والنسخ الاحتياطي والمتجر)"
              aria-label="خيارات وإجراءات المنظومة"
            >
              <MoreVertical className="w-5 h-5 shrink-0" />

              {/* نقطة تنبيه حمراء نابضة إذا وُجدت طلبات متجر أو تنبيهات نشطة */}
              {Boolean(pendingWebOrdersCount && pendingWebOrdersCount > 0) && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-600 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white animate-bounce shadow-xs">
                  {pendingWebOrdersCount > 9 ? '!' : pendingWebOrdersCount}
                </span>
              )}
            </button>

            {/* نافذة / صفحة خاصة لمحتويات الثلاث نقاط كاملة وواضحة ومنظمة بدون أي ضغط أو تداخل */}
            {isMobileMenuOpen && (
              <div
                className="fixed inset-0 z-[1000] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
                dir="rtl"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setIsMobileMenuOpen(false);
                }}
              >
                <div
                  className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border-2 border-slate-200 overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* ترويسة النافذة المميزة */}
                  <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-blue-600/90 text-white flex items-center justify-center text-lg font-black shadow-md shrink-0 border border-blue-400/40">
                        {currentUser?.name ? currentUser.name.slice(0, 1).toUpperCase() : <UserIcon className="w-6 h-6" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base sm:text-lg font-black text-white truncate">
                            {currentUser?.name || 'مدير النظام'}
                          </h2>
                          <span className="text-[11px] bg-blue-500/30 text-blue-200 border border-blue-400/30 font-bold px-2.5 py-0.5 rounded-full shrink-0">
                            {currentUser?.role === 'admin' || currentUser?.role === 'company_admin'
                              ? 'مدير عام المنظومة'
                              : currentUser?.role === 'cashier'
                              ? 'كاشير'
                              : currentUser?.role === 'accountant'
                              ? 'محاسب'
                              : currentUser?.role === 'warehouse_keeper'
                              ? 'أمين مخزن'
                              : currentUser?.role === 'sales_rep'
                              ? 'مندوب مبيعات'
                              : currentUser?.role || 'مستخدم'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 font-medium truncate mt-1 flex items-center gap-2">
                          <span>🏢 {companyName || 'الشركة'} ({companyCode || '01029190615'})</span>
                          <span>•</span>
                          <span className="text-blue-300 font-bold">{currentActiveBranch?.name || 'الفرع الرئيسي'}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-slate-200 hover:text-white flex items-center justify-center border border-white/10 transition cursor-pointer shrink-0"
                      title="إغلاق النافذة"
                      aria-label="إغلاق النافذة"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* شريط الإحصائية / الإشعار العلوي */}
                  <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span>مركز الخدمات والمهام السريعة للمنظومة</span>
                    </span>
                    <span className="text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full font-black flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                      <span>سحابي متصل</span>
                    </span>
                  </div>

                  {/* قائمة الإجراءات والخدمات بصورة بطاقات كبيرة وواضحة جداً */}
                  <div className="p-4 sm:p-6 space-y-3 max-h-[62vh] overflow-y-auto">
                    {/* 1. النسخ السحابي وقاعدة البيانات */}
                    {onNavigateBackup && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onNavigateBackup();
                        }}
                        className="w-full text-right p-3.5 sm:p-4 rounded-2xl bg-white hover:bg-emerald-50/70 active:bg-emerald-100/70 border-2 border-slate-200 hover:border-emerald-400 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs hover:shadow-md group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-300 group-hover:scale-105 transition-transform shadow-2xs">
                            <Cloud className="w-6 h-6" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm sm:text-base font-black text-slate-900 group-hover:text-emerald-800 transition-colors">
                              النسخ السحابي والمزامنة اللحظية
                            </span>
                            <span className="text-xs text-slate-500 font-medium truncate mt-0.5">
                              مزامنة البيانات والحفظ التلقائي مع السحابة لحظة بلحظة
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-3 py-1.5 rounded-xl shrink-0 flex items-center gap-1.5">
                          <span>فتح المركز</span>
                          <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                        </span>
                      </button>
                    )}

                    {/* 2. سحب نسخة احتياطية فورية لجهازك */}
                    <button
                      type="button"
                      onClick={() => {
                        if (appData) {
                          downloadBackupJsonFile(appData);
                          showToast?.('💾 تم سحب وتنزيل النسخة الاحتياطية بنجاح! يتم أخذ نسخة تلقائياً كل 12 ساعة.', 'success');
                          setIsMobileMenuOpen(false);
                        } else if (onNavigateBackup) {
                          onNavigateBackup();
                          setIsMobileMenuOpen(false);
                        }
                      }}
                      className="w-full text-right p-3.5 sm:p-4 rounded-2xl bg-blue-50/50 hover:bg-blue-100/60 active:bg-blue-200/60 border-2 border-blue-200 hover:border-blue-400 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs hover:shadow-md group"
                      title="سحب نسخة احتياطية فورية الآن لجهازك بصيغة JSON"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                          <Download className="w-6 h-6" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm sm:text-base font-black text-blue-950 group-hover:text-blue-900 transition-colors">
                            سحب نسخة احتياطية للجهاز (JSON)
                          </span>
                          <span className="text-xs text-blue-700 font-medium truncate mt-0.5">
                            تنزيل ملف البيانات فوراً (ويتم النسخ التلقائي كل 12 ساعة)
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-black text-blue-900 bg-white border border-blue-300 px-3 py-1.5 rounded-xl shrink-0 shadow-2xs">
                        تنزيل فوري 💾
                      </span>
                    </button>

                    {/* 3. مركز فحص النزاهة وصحة البيانات (10M+) */}
                    {onOpenDiagnostics && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onOpenDiagnostics();
                        }}
                        className="w-full text-right p-3.5 sm:p-4 rounded-2xl bg-white hover:bg-indigo-50/70 active:bg-indigo-100/70 border-2 border-slate-200 hover:border-indigo-400 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs hover:shadow-md group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-300 group-hover:scale-105 transition-transform shadow-2xs">
                            <Activity className="w-6 h-6" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm sm:text-base font-black text-slate-900 group-hover:text-indigo-800 transition-colors">
                              صحة النظام والبيانات (10M+ Enterprise)
                            </span>
                            <span className="text-xs text-slate-500 font-medium truncate mt-0.5">
                              فحص الفهارس وسرعة الاستجابة والنزاهة المحاسبية
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-indigo-800 bg-indigo-50 border border-indigo-300 px-3 py-1.5 rounded-xl shrink-0 flex items-center gap-1.5">
                          <span>بدء الفحص</span>
                          <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                        </span>
                      </button>
                    )}

                    {/* 4. طلبات المتجر الإلكتروني */}
                    {onNavigateWebOrders && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onNavigateWebOrders();
                        }}
                        className="w-full text-right p-3.5 sm:p-4 rounded-2xl bg-white hover:bg-amber-50/70 active:bg-amber-100/70 border-2 border-slate-200 hover:border-amber-400 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs hover:shadow-md group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-300 group-hover:scale-105 transition-transform shadow-2xs">
                            <ShoppingBag className="w-6 h-6" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm sm:text-base font-black text-slate-900 group-hover:text-amber-800 transition-colors">
                              طلبات المتجر الإلكتروني
                            </span>
                            <span className="text-xs text-slate-500 font-medium truncate mt-0.5">
                              متابعة الطلبيات الواردة من المتجر والكتالوج أونلاين
                            </span>
                          </div>
                        </div>
                        {Boolean(pendingWebOrdersCount && pendingWebOrdersCount > 0) ? (
                          <span className="text-xs font-black text-white bg-rose-600 px-3 py-1.5 rounded-xl animate-bounce shrink-0 shadow-xs">
                            {pendingWebOrdersCount} جديدة 🔔
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl shrink-0">
                            0 طلبات
                          </span>
                        )}
                      </button>
                    )}

                    {/* 5. مشاركة الكتالوج والمتجر الإلكتروني */}
                    {onShareCatalog && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onShareCatalog();
                        }}
                        className="w-full text-right p-3.5 sm:p-4 rounded-2xl bg-white hover:bg-teal-50/70 active:bg-teal-100/70 border-2 border-slate-200 hover:border-teal-400 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs hover:shadow-md group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 border border-teal-300 group-hover:scale-105 transition-transform shadow-2xs">
                            <Share2 className="w-6 h-6" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm sm:text-base font-black text-slate-900 group-hover:text-teal-800 transition-colors">
                              مشاركة المتجر والكتالوج للعملاء
                            </span>
                            <span className="text-xs text-slate-500 font-medium truncate mt-0.5">
                              إرسال رابط الكتالوج بالأسعار والصور عبر واتساب
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-300 px-3 py-1.5 rounded-xl shrink-0">
                          واتساب 📲
                        </span>
                      </button>
                    )}

                    {/* 6. لوحة مالك المنظومة */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setIsSecretModalOpen(true);
                        setSecretPassword('');
                        setSecretError('');
                      }}
                      className="w-full text-right p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border-2 border-amber-300 hover:border-amber-400 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-xs hover:shadow-md group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0 border border-amber-400 group-hover:scale-105 transition-transform shadow-2xs">
                          <Crown className="w-6 h-6 text-amber-800" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm sm:text-base font-black text-amber-950 group-hover:text-amber-900 transition-colors">
                            لوحة مالك المنظومة 👑
                          </span>
                          <span className="text-xs text-amber-800 font-medium truncate mt-0.5">
                            إدارة تراخيص الشركات وتعديل الاشتراكات والصلاحيات
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-black text-amber-950 bg-white border border-amber-400 px-3 py-1.5 rounded-xl shrink-0 shadow-2xs">
                        المالك
                      </span>
                    </button>

                    {/* تنويه الجدولة التلقائية كل 12 ساعة */}
                    <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-2.5 leading-relaxed">
                      <span className="text-blue-700 text-base font-bold shrink-0 mt-0.5">ℹ️</span>
                      <div>
                        <strong>النسخ الاحتياطي التلقائي الدوري:</strong> يقوم النظام بحفظ وأرشفة نسخة احتياطية مشفرة كل 12 ساعة تلقائياً، مع إمكانية تنزيل نسخة يدوية على جهازك في أي لحظة.
                      </div>
                    </div>
                  </div>

                  {/* تذييل النافذة: تسجيل خروج وإغلاق */}
                  <div className="p-4 sm:p-5 border-t-2 border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                    {onLogout ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onLogout();
                        }}
                        className="py-2.5 px-5 rounded-2xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer shadow-sm hover:shadow-md"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>تسجيل الخروج الآمن</span>
                      </button>
                    ) : (
                      <div />
                    )}

                    <button
                      type="button"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="py-2.5 px-5 rounded-2xl bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-800 font-bold text-xs sm:text-sm transition cursor-pointer"
                    >
                      إغلاق النافذة
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 💻 نمط الشاشات الكبيرة (Desktop / Tablet: md:flex) */}
          {/* ========================================================= */}
          <div className="hidden md:flex items-center gap-1.5 sm:gap-2">
            {/* مؤشر النسخ السحابي */}
            {onNavigateBackup && (
              <button
                type="button"
                onClick={onNavigateBackup}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-medium text-slate-700 transition cursor-pointer"
                title={autoBackupActive ? 'النسخ الاحتياطي السحابي نشط - انقر للإدارة' : 'النسخ الاحتياطي'}
              >
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="hidden xl:inline text-[11px] text-emerald-700">النسخ السحابي</span>
              </button>
            )}

            {/* زر فحص النزاهة وصحة البيانات الضخمة (10M+) */}
            {onOpenDiagnostics && (
              <button
                type="button"
                onClick={onOpenDiagnostics}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold text-indigo-900 transition cursor-pointer"
                title="مركز فحص النزاهة المحاسبية وإدارة البيانات الضخمة (10M+ Enterprise Hub)"
              >
                <Activity className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden xl:inline text-[11px] text-indigo-800">صحة النظام (10M+)</span>
              </button>
            )}

            {/* طلبات المتجر */}
            {onNavigateWebOrders && (
              <button
                type="button"
                onClick={onNavigateWebOrders}
                className="relative flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-medium transition cursor-pointer"
                title="طلبات المتجر الإلكتروني الواردة"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden lg:inline text-[11px]">الطلبات</span>
                {Boolean(pendingWebOrdersCount && pendingWebOrdersCount > 0) && (
                  <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-md">
                    {pendingWebOrdersCount}
                  </span>
                )}
              </button>
            )}

            {/* معلومات المستخدم الحالي */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200">
              <div className="w-6 h-6 rounded-full bg-blue-100 border border-blue-300 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                {currentUser?.name ? currentUser.name.slice(0, 1).toUpperCase() : <UserIcon className="w-3 h-3" />}
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-bold text-slate-800 leading-tight">
                  {currentUser?.name || 'مدير النظام'}
                </span>
                <span className="text-[9px] text-slate-500 leading-none">
                  {currentUser?.role === 'admin' || currentUser?.role === 'company_admin'
                    ? 'مدير عام'
                    : currentUser?.role === 'cashier'
                    ? 'كاشير'
                    : currentUser?.role === 'accountant'
                    ? 'محاسب'
                    : currentUser?.role === 'warehouse_keeper'
                    ? 'أمين مخزن'
                    : currentUser?.role === 'sales_rep'
                    ? 'مندوب مبيعات'
                    : currentUser?.role || 'مستخدم'}
                  {currentUser?.branchId && (
                    <span className="text-blue-700 font-bold mr-1">
                      • {branches.find((b) => b.id === currentUser?.branchId)?.name || 'فرع مخصص'}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* زر تسجيل الخروج */}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="p-1.5 sm:px-2 sm:py-1 rounded-lg bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 transition flex items-center gap-1 text-xs cursor-pointer"
                title="تسجيل الخروج الآمن"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                <span className="hidden md:inline text-[11px] font-bold">خروج</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 🔐 نافذة إدخال كلمة مرور مالك المنظومة (تظهر بعد الضغط 5 مرات على RAKEEZA) */}
      {isSecretModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div
            className="bg-slate-900 border border-amber-500/50 rounded-2xl max-w-sm w-full p-5 text-white shadow-2xl text-right animate-in fade-in zoom-in-95 duration-200"
            dir="rtl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Crown className="w-5 h-5 text-amber-400 animate-pulse" />
                <span>لوحة تحكم مالك المنظومة</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSecretModalOpen(false);
                  setSecretPassword('');
                  setSecretError('');
                }}
                className="text-slate-400 hover:text-white transition cursor-pointer p-1"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              يرجى إدخال كلمة المرور الخاصة بمالك المنظومة لفتح لوحة التحكم المركزية:
            </p>

            {secretError && (
              <div className="mb-3 p-2.5 rounded-lg bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs font-semibold">
                {secretError}
              </div>
            )}

            <form onSubmit={handleVerifySecretPassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={secretPassword}
                    onChange={(e) => {
                      setSecretPassword(e.target.value);
                      if (secretError) setSecretError('');
                    }}
                    placeholder="أدخل كلمة المرور..."
                    autoFocus
                    required
                    className="w-full bg-slate-800/90 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-hidden transition text-left"
                    dir="ltr"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSecretModalOpen(false);
                    setSecretPassword('');
                    setSecretError('');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-95 text-slate-950 font-black text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-amber-900/30"
                >
                  {isVerifying ? 'جار التحقق...' : 'دخول لوحة المالك 👑'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

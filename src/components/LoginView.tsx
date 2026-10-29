import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  CheckCircle2,
  AlertCircle,
  Mail,
  Shield,
  KeyRound,
  RotateCcw,
  Unlink,
  Laptop,
  ChevronDown,
  ShieldCheck,
  Sparkles,
  Store,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import {
  getStoredBoundDevice,
  setStoredBoundDevice,
  clearStoredBoundDevice,
  fetchCompanyPublicDetailsApi,
  registerNewCompanyDeviceApi,
  loginToCloud,
  verifyOwnerSecretApi,
  normalizeArabicNumerals,
  BoundDeviceData,
} from '../services/cloudApi';
import { TenantCompany, User as AppUser } from '../types';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import { DEFAULT_COMPANIES } from '../utils/multiTenantService';

interface LoginViewProps {
  onLoginSuccess: (session: {
    user: AppUser;
    company: TenantCompany;
    subscription: any;
  }) => void;
  onOpenOwnerPanelDirectly?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onOpenOwnerPanelDirectly,
}) => {
  // 💻 Device Binding State (Locked permanently to مؤسسة الموان)
  const [boundDevice, setBoundDevice] = useState<BoundDeviceData | null>(null);
  const [isCheckingDevice, setIsCheckingDevice] = useState<boolean>(true);
  const [showUnbindConfirmModal, setShowUnbindConfirmModal] = useState<boolean>(false);
  const [isRememberUserOnDevice, setIsRememberUserOnDevice] = useState<boolean>(true);

  // 📝 Setup tab
  const [setupTab, setSetupTab] = useState<'bind_existing' | 'register_new'>('bind_existing');

  // Form 1: Register New Company State
  const [regCompanyName, setRegCompanyName] = useState<string>('');
  const [regAdminEmail, setRegAdminEmail] = useState<string>('');
  const [regAdminUsername, setRegAdminUsername] = useState<string>('admin');
  const [regAdminPassword, setRegAdminPassword] = useState<string>('');
  const [regBranchName, setRegBranchName] = useState<string>('الفرع الرئيسي');
  const [regLink, setRegLink] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('link') || p.get('reg') || p.get('ref') || p.get('token') || '';
    }
    return '';
  });
  const [showRegPassword, setShowRegPassword] = useState<boolean>(false);

  // Form 2: Bind to Existing Company State
  const [existingCompanyCode, setExistingCompanyCode] = useState<string>('');

  // ⚡ Bound Mode (Desktop-Style Quick Login) State
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showLoginPassword, setShowLoginPassword] = useState<boolean>(false);
  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState<boolean>(false);
  const [isManualUserInput, setIsManualUserInput] = useState<boolean>(false);
  const [manualUserInput, setManualUserInput] = useState<string>('');

  // Feedback & Loading States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 🔐 Secret Owner Access State (Long-press on RAKEEZA logo)
  const [isHoldingLogo, setIsHoldingLogo] = useState<boolean>(false);
  const [showSecretOwnerModal, setShowSecretOwnerModal] = useState<boolean>(false);
  const [secretOwnerPin, setSecretOwnerPin] = useState<string>('');
  const [ownerPinError, setOwnerPinError] = useState<string | null>(null);
  const [isVerifyingOwner, setIsVerifyingOwner] = useState<boolean>(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Password Input Ref for Auto-focus
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 1️⃣ On Mount: Check and Auto-Bind to مؤسسة الموان للتجارة
   */
  useEffect(() => {
    const checkDeviceBinding = async () => {
      setIsCheckingDevice(true);
      let stored = getStoredBoundDevice();

      const primaryComp = DEFAULT_COMPANIES[0];
      const defaultMowan: BoundDeviceData = {
        companyId: 'COMP-000001',
        companyCode: '101',
        companyName: 'مؤسسة الموان للتجارة',
        boundAt: new Date().toISOString(),
        deviceId: (typeof window !== 'undefined' ? localStorage.getItem('rakeeza_device_uuid') : '') || `mowan-${Date.now()}`,
        branches: (primaryComp as any).branches || [
          { id: 'br-main', code: 'HQ-01', name: 'فرع الاخوة', location: 'المقر الرئيسي', phone: '01029190615', isMain: true, manager: 'Mohamed Nazih' },
          { id: 'br-mowan', code: 'BR-02', name: 'فرع الموان', location: 'فرع الموان', phone: '01100000000', isMain: false, manager: 'محمود سعيد' },
        ],
        users: ((primaryComp as any).users || []) as any[],
      };

      if (!stored) {
        stored = defaultMowan;
        setStoredBoundDevice(defaultMowan);
      }
      setBoundDevice(stored);

      // Check if a user was previously assigned/remembered on this device
      const installedUser =
        typeof window !== 'undefined'
          ? localStorage.getItem(`rakeeza_installed_user_${stored.companyId}`) ||
            localStorage.getItem('mowan_installed_user')
          : null;
      if (installedUser) {
        setSelectedUsername(installedUser);
      } else if (stored.users && stored.users.length > 0) {
        setSelectedUsername(stored.users[0].username || stored.users[0].name);
      }

      if (stored.branches && stored.branches.length > 0) {
        const mainBranch = stored.branches.find((b) => b.isMain) || stored.branches[0];
        setSelectedBranchId(mainBranch.id);
      }

      // Silent cloud update of company users & branches for this company
      try {
        const res = await fetchCompanyPublicDetailsApi(stored.companyId);
        if (res.success && res.company) {
          const updated: BoundDeviceData = {
            ...stored,
            companyName: res.company.name || stored.companyName,
            companyCode: res.company.code || (res.company as any).companyCode || stored.companyCode,
            branches: res.branches || stored.branches,
            users: res.users || stored.users,
          };
          setStoredBoundDevice(updated);
          setBoundDevice(updated);

          if (installedUser && updated.users?.some((u: any) => u.username === installedUser || u.name === installedUser)) {
            setSelectedUsername(installedUser);
          }
        }
      } catch {}

      setIsCheckingDevice(false);
    };

    checkDeviceBinding();
  }, []);

  // Auto focus password input whenever user selects a user in bound mode
  useEffect(() => {
    if (boundDevice && passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  }, [boundDevice, selectedUsername]);

  /**
   * 🔄 Refresh Company Branches & Users dynamically
   */
  const handleRefreshMetadata = async () => {
    if (!boundDevice?.companyId || isRefreshingMetadata) return;
    setIsRefreshingMetadata(true);
    setErrorMessage(null);
    try {
      const res = await fetchCompanyPublicDetailsApi(boundDevice.companyId);
      if (res.success && res.branches && res.users) {
        const updated: BoundDeviceData = {
          ...boundDevice,
          companyName: res.company?.name || boundDevice.companyName,
          branches: res.branches,
          users: res.users,
        };
        setStoredBoundDevice(updated);
        setBoundDevice(updated);
        setSuccessMessage('تم تحديث قائمة الفروع والمستخدمين بنجاح.');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch {
      setErrorMessage('تعذر تحديث البيانات من السحابة.');
    } finally {
      setIsRefreshingMetadata(false);
    }
  };

  /**
   * 🏢 Handler: Register New Company & Bind Device
   */
  const handleRegisterNewCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanName = regCompanyName.trim();
    const cleanEmail = regAdminEmail.trim().toLowerCase();
    const cleanUsername = regAdminUsername.trim() || 'admin';
    const cleanPassword = regAdminPassword.trim();
    const cleanBranch = regBranchName.trim() || 'الفرع الرئيسي';

    if (!cleanName) {
      setErrorMessage('يرجى إدخال اسم المنشأة أو الشركة.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('يرجى إدخال بريد إلكتروني صالح للمدير (Gmail أو بريد العمل للتحقق من الهوية).');
      return;
    }
    if (!cleanPassword) {
      setErrorMessage('يرجى تحديد كلمة مرور لحساب المدير العام.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await registerNewCompanyDeviceApi({
        companyName: cleanName,
        adminEmail: cleanEmail,
        adminUsername: cleanUsername,
        adminPassword: cleanPassword,
        branchName: cleanBranch,
        registrationLink: regLink.trim() || undefined,
      });

      if (res.success && res.company && res.user) {
        setSuccessMessage('تهانينا! تم تسجيل المنشأة واعتماد ربط هذا الجهاز بنجاح. جاري فتح النظام...');

        const freshBound = getStoredBoundDevice();
        if (freshBound) {
          setBoundDevice(freshBound);
        }

        setTimeout(() => {
          onLoginSuccess({
            user: res.user!,
            company: res.company!,
            subscription: res.subscription || {
              status: res.company?.status || 'trial',
              planName: res.company?.planName || 'التجربة المجانية (30 يوم)',
              daysRemaining: 30,
              isExpired: false,
            },
          });
        }, 800);
      } else {
        setErrorMessage(res.error || 'فشل تسجيل المنشأة وربط الجهاز.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ في الاتصال بالخادم السحابي.');
    } finally {
      setIsLoading(false);
    }
  };

  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 🔍 Lookup and bind company by code or ID
   */
  const handleLookupCompany = async (codeToLookup?: string): Promise<boolean> => {
    const rawCode = codeToLookup !== undefined ? codeToLookup : existingCompanyCode;
    const cleanCode = normalizeArabicNumerals(rawCode || '').trim().toUpperCase();
    if (!cleanCode) {
      setErrorMessage('يرجى إدخال كود المنشأة (مثل: 101 أو 108 أو معرّف الشركة).');
      return false;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetchCompanyPublicDetailsApi(cleanCode);

      if (res.success && res.company) {
        const boundData: BoundDeviceData = {
          companyId: res.company.id,
          companyCode: res.company.code || (res.company as any).companyCode || cleanCode,
          companyName: res.company.name,
          adminEmail: res.company.email || res.company.adminEmail,
          boundAt: new Date().toISOString(),
          branches: res.branches || [{ id: `br-${res.company.id}-main`, name: 'الفرع الرئيسي', isMain: true }],
          users: res.users || [
            {
              id: `u-${res.company.id}-admin`,
              code: 1,
              name: res.company.adminName || 'المدير العام',
              username: res.company.adminUsername || 'admin',
              role: 'company_admin',
            },
          ],
        };

        setStoredBoundDevice(boundData);
        setBoundDevice(boundData);

        if (boundData.branches?.length > 0) {
          setSelectedBranchId(boundData.branches[0].id);
        }
        if (res.preselectedUsername) {
          setSelectedUsername(res.preselectedUsername);
        } else if (boundData.users?.length > 0) {
          setSelectedUsername(boundData.users[0].username || boundData.users[0].name);
        }

        const displayCode = res.company.code || res.company.companyCode || res.company.id;
        setSuccessMessage(
          `✓ تم التعرف على منشأة: "${res.company.name}" (كود: ${displayCode}) بنجاح! تم تحميل (${boundData.users.length}) مستخدمين. اختر اسمك وأدخل كلمة المرور.`
        );
        setTimeout(() => setSuccessMessage(null), 4000);
        return true;
      } else {
        setErrorMessage(res.error || `لم يتم العثور على منشأة بالكود "${cleanCode}". يرجى التأكد من كتابة كود الشركة بشكل صحيح.`);
        return false;
      }
    } catch {
      setErrorMessage('تعذر التحقق من كود المنشأة، يرجى التحقق من الاتصال.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 🔗 Handler: Bind to Existing Company using Company Code or ID
   */
  const handleBindExistingCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLookupCompany(existingCompanyCode);
  };

  /**
   * 🚀 Handler: Quick Desktop-Style Login (Bound Device Mode)
   */
  const handleQuickLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!boundDevice?.companyId) {
      setErrorMessage('الجهاز غير مربوط بأي منشأة.');
      return;
    }
    const userToLogin = isManualUserInput ? manualUserInput.trim() : selectedUsername;
    if (!userToLogin) {
      setErrorMessage(isManualUserInput ? 'يرجى كتابة كود أو اسم المستخدم.' : 'يرجى اختيار اسم المستخدم من القائمة.');
      return;
    }
    if (!loginPassword) {
      setErrorMessage('يرجى إدخال كلمة المرور.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginToCloud(boundDevice.companyId, userToLogin, loginPassword);

      if (res.success && res.user && res.company) {
        // Save installed user on device if checkbox selected
        if (isRememberUserOnDevice) {
          try {
            localStorage.setItem('mowan_installed_user', userToLogin);
            if (selectedBranchId) {
              localStorage.setItem('mowan_installed_branch', selectedBranchId);
            }
          } catch {}
        }

        // Attach selected branch to user session if available
        const activeUser: AppUser = {
          ...res.user,
          branchId: selectedBranchId || res.user.branchId,
        };

        setSuccessMessage('جاري تسجيل الدخول...');
        setTimeout(() => {
          onLoginSuccess({
            user: activeUser,
            company: res.company!,
            subscription: res.subscription,
          });
        }, 500);
      } else {
        setErrorMessage(res.error || 'كلمة المرور غير صحيحة لهذا المستخدم.');
      }
    } catch {
      setErrorMessage('فشل الاتصال بالخادم السحابي.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 🌐 Google / Gmail Sign-In linked to مؤسسة الموان
   */
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;
      const email = googleUser.email || '';
      const displayName = googleUser.displayName || 'مستخدم مؤسسة الموان';

      // Find user in مؤسسة الموان or map to current user
      let matchedUser = boundDevice?.users?.find(
        (u: any) =>
          (u.email && u.email.toLowerCase() === email.toLowerCase()) ||
          (u.username && email.toLowerCase().includes(u.username.toLowerCase()))
      );

      if (!matchedUser) {
        matchedUser =
          boundDevice?.users?.find((u: any) => u.username === selectedUsername || u.name === selectedUsername) ||
          boundDevice?.users?.[0] || {
            id: `u-mowan-${googleUser.uid.substring(0, 8)}`,
            code: 1,
            name: displayName,
            username: email.split('@')[0],
            role: 'company_admin',
          };
      }

      if (isRememberUserOnDevice) {
        try {
          localStorage.setItem('mowan_installed_user', matchedUser.username || matchedUser.name);
          if (selectedBranchId) localStorage.setItem('mowan_installed_branch', selectedBranchId);
        } catch {}
      }

      setSuccessMessage(`مرحباً بك! تم تسجيل الدخول بنجاح عبر حساب Google: ${displayName}`);
      setTimeout(() => {
        onLoginSuccess({
          user: {
            ...matchedUser,
            name: displayName || matchedUser.name,
            email: email,
            branchId: selectedBranchId || matchedUser.branchId || 'br-main',
          } as any,
          company: {
            id: boundDevice?.companyId || 'COMP-000001',
            code: boundDevice?.companyCode || '101',
            name: 'مؤسسة الموان للتجارة',
            tradeName: 'الموان',
            email: 'admin@mowan.com',
            adminName: 'مؤسسة الموان',
            adminUsername: 'admin',
            status: 'active',
            planName: 'Enterprise Plan',
          } as any,
          subscription: {
            status: 'active',
            planName: 'Enterprise Plan',
            daysRemaining: 365,
            isExpired: false,
          },
        });
      }, 600);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(err?.message || 'تعذر تسجيل الدخول بحساب Google. يمكنك تسجيل الدخول باسم المستخدم وكلمة المرور.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 🔓 Handler: Unbind Device & Switch Organization
   */
  const handleConfirmUnbindDevice = () => {
    clearStoredBoundDevice();
    setBoundDevice(null);
    setSelectedUsername('');
    setLoginPassword('');
    setSelectedBranchId('');
    setShowUnbindConfirmModal(false);
    setSuccessMessage('تم إلغاء ربط الجهاز بنجاح.');
  };

  /**
   * 👑 Secret Owner Handler (Long-press on RAKEEZA title)
   */
  const handleHoldStart = () => {
    setIsHoldingLogo(true);
    holdTimerRef.current = setTimeout(() => {
      setIsHoldingLogo(false);
      setShowSecretOwnerModal(true);
      setSecretOwnerPin('');
      setOwnerPinError(null);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(70);
      }
    }, 1500);
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHoldingLogo(false);
  };

  const handleSecretOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = secretOwnerPin.trim();
    if (!clean) {
      setOwnerPinError('يرجى إدخال كلمة المرور السرية لمالك المنظومة');
      return;
    }

    setIsVerifyingOwner(true);
    setOwnerPinError(null);

    try {
      const res = await verifyOwnerSecretApi(clean);
      if (res.success && res.user && res.company) {
        setShowSecretOwnerModal(false);
        onLoginSuccess({
          user: res.user,
          company: res.company,
          subscription: res.subscription,
        });
      } else {
        setOwnerPinError(res.error || 'رمز المرور السري غير صحيح.');
      }
    } catch {
      setOwnerPinError('فشل الاتصال بالخادم السحابي.');
    } finally {
      setIsVerifyingOwner(false);
    }
  };

  if (isCheckingDevice) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4 font-sans"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-amber-400 p-0.5 animate-pulse mb-4">
          <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
            <span className="text-2xl font-black text-amber-400">R</span>
          </div>
        </div>
        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin mb-2" />
        <p className="text-xs text-slate-400">جاري التحقق من ربط الجهاز وحالة المنشأة...</p>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col justify-between selection:bg-blue-500 selection:text-white relative font-sans"
    >
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-4 py-4 sm:py-5 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          {/* Logo with Secret Owner Long-Press */}
          <div
            id="rakeeza-brand-header"
            className={`flex items-center gap-3 cursor-pointer select-none px-2 py-1 rounded-xl transition-all relative ${
              isHoldingLogo
                ? 'scale-105 bg-amber-400/20 ring-2 ring-amber-400 shadow-lg shadow-amber-400/30'
                : 'hover:bg-white/5 active:scale-95'
            }`}
            onMouseDown={handleHoldStart}
            onMouseUp={handleHoldEnd}
            onMouseLeave={handleHoldEnd}
            onTouchStart={handleHoldStart}
            onTouchEnd={handleHoldEnd}
            onTouchCancel={handleHoldEnd}
            title="منظومة ركيزة RAKEEZA Cloud ERP"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-amber-400 p-0.5 shadow-xl shadow-blue-500/20 flex items-center justify-center shrink-0">
              <img
                src="/pwa-192x192.png"
                alt="شعار ركيزة ERP"
                className="w-full h-full rounded-[14px] bg-[#000e28] object-contain p-1"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl sm:text-2xl tracking-wider text-white">
                  RAKEEZA
                </span>
                <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Cloud ERP
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                منظومة المحاسبة وإدارة الأعمال المتكاملة
              </p>
            </div>
            {isHoldingLogo && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-amber-400 rounded-full animate-pulse" />
            )}
          </div>
        </div>

        {/* Device Status Indicator */}
        <div className="flex items-center gap-2">
          {boundDevice ? (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-full shadow-inner">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-bold text-white max-w-[150px] sm:max-w-none truncate">
                {boundDevice.companyName}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium text-amber-300 bg-amber-950/60 border border-amber-500/30 px-3 py-1.5 rounded-full">
              <Laptop className="w-4 h-4 text-amber-400 shrink-0" />
              <span>غير متصل بمنشأة</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-lg mx-auto">
          {/* Main Card */}
          <div className="w-full bg-slate-900/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-2xl shadow-black/80">
            {/* Global Error Banner */}
            {errorMessage && (
              <div
                id="login-error-banner"
                className="mb-5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in"
              >
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Global Success Banner */}
            {successMessage && (
              <div
                id="login-success-banner"
                className="mb-5 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                <div className="flex-1 leading-relaxed">{successMessage}</div>
              </div>
            )}

            {boundDevice ? (
              /* ========================================================================= */
              /* 🖥️ STATE 2: DEVICE IS BOUND -> QUICK DESKTOP-STYLE USER LOGIN INTERFACE   */
              /* ========================================================================= */
              <div id="quick-login-container" className="space-y-6 animate-in fade-in">
                {/* Organization Header Box */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm sm:text-base font-bold text-white truncate">
                          {boundDevice.companyName}
                        </h2>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          كود: {boundDevice.companyCode}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {boundDevice.adminEmail || 'منظومة سحابية معتمدة'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <button
                      type="button"
                      id="btn-switch-company-login"
                      onClick={() => setShowUnbindConfirmModal(true)}
                      className="px-2.5 py-1.5 text-xs text-amber-300 hover:text-white bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-bold"
                      title="ربط الجهاز بشركة أو منشأة أخرى"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>تبديل المنشأة</span>
                    </button>
                    <button
                      type="button"
                      id="btn-refresh-company-users"
                      onClick={handleRefreshMetadata}
                      disabled={isRefreshingMetadata}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="تحديث قائمة الفروع والمستخدمين"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshingMetadata ? 'animate-spin text-blue-400' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Quick Login Form */}
                <form id="quick-login-form" onSubmit={handleQuickLoginSubmit} className="space-y-4">
                  {/* 1. Branch / Department Dropdown */}
                  <div>
                    <label
                      htmlFor="select-login-branch"
                      className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5 text-right"
                    >
                      الفرع / القسم <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                        <Store className="w-4 h-4 text-blue-400" />
                      </div>
                      <select
                        id="select-login-branch"
                        value={selectedBranchId}
                        onChange={(e) => setSelectedBranchId(e.target.value)}
                        className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none cursor-pointer text-right"
                        disabled={isLoading}
                      >
                        {boundDevice.branches && boundDevice.branches.length > 0 ? (
                          boundDevice.branches.map((b) => (
                            <option key={b.id} value={b.id} className="bg-slate-900 text-white py-2">
                              {b.name} {b.isMain ? '(الرئيسي)' : ''}
                            </option>
                          ))
                        ) : (
                          <option value="main" className="bg-slate-900 text-white">
                            الفرع الرئيسي
                          </option>
                        )}
                      </select>
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* 2. User Dropdown or Code Input (Strictly isolated to this company's users) */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <button
                        type="button"
                        onClick={handleRefreshMetadata}
                        disabled={isRefreshingMetadata}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 cursor-pointer select-none"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRefreshingMetadata ? 'animate-spin' : ''}`} />
                        <span>{isRefreshingMetadata ? 'جاري التحديث...' : 'تحديث'}</span>
                      </button>
                      <label
                        htmlFor={isManualUserInput ? 'input-login-manual-user' : 'select-login-user'}
                        className="block text-xs sm:text-sm font-semibold text-slate-200 text-right"
                      >
                        {isManualUserInput ? 'كود أو اسم المستخدم' : 'اسم المستخدم'} <span className="text-rose-400">*</span>
                      </label>
                    </div>

                    {isManualUserInput ? (
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                          <User className="w-4 h-4 text-indigo-400" />
                        </div>
                        <input
                          id="input-login-manual-user"
                          type="text"
                          value={manualUserInput}
                          onChange={(e) => {
                            setManualUserInput(e.target.value);
                            setLoginPassword('');
                          }}
                          placeholder="كود أو اسم المستخدم"
                          dir="ltr"
                          className="w-full pl-3 pr-10 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-left font-bold"
                          disabled={isLoading}
                          required
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                          <User className="w-4 h-4 text-indigo-400" />
                        </div>
                        <select
                          id="select-login-user"
                          value={selectedUsername}
                          onChange={(e) => {
                            setSelectedUsername(e.target.value);
                            setLoginPassword('');
                          }}
                          className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none cursor-pointer text-right font-medium"
                          disabled={isLoading}
                          required
                        >
                          {boundDevice.users && boundDevice.users.length > 0 ? (
                            boundDevice.users.map((u) => (
                              <option
                                key={u.id}
                                value={u.username || u.name}
                                className="bg-slate-900 text-white py-2"
                              >
                                {u.name} ({u.username || 'user'})
                              </option>
                            ))
                          ) : (
                            <option value="admin" className="bg-slate-900 text-white">
                              المدير العام (admin)
                            </option>
                          )}
                        </select>
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>
                    )}

                    {/* Toggle button between Dropdown and Manual User Code */}
                    <div className="flex justify-start mt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsManualUserInput(!isManualUserInput);
                          if (!isManualUserInput && !manualUserInput && selectedUsername) {
                            setManualUserInput(selectedUsername);
                          }
                        }}
                        className="text-[11px] text-slate-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isManualUserInput ? 'اختيار من القائمة' : 'إدخال يدوي'}</span>
                      </button>
                    </div>
                  </div>

                  {/* 3. Password Field */}
                  <div>
                    <label
                      htmlFor="input-login-password"
                      className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5 text-right"
                    >
                      كلمة المرور <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4 text-amber-400" />
                      </div>
                      <input
                        id="input-login-password"
                        ref={passwordInputRef}
                        type={showLoginPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="كلمة المرور"
                        dir="ltr"
                        autoComplete="current-password"
                        className="w-full pl-11 pr-11 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-left"
                        disabled={isLoading}
                        required
                      />
                      <button
                        type="button"
                        id="btn-toggle-login-password"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        tabIndex={-1}
                      >
                        {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember / Install Device for this User */}
                  <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition select-none">
                    <input
                      type="checkbox"
                      id="checkbox-remember-device"
                      checked={isRememberUserOnDevice}
                      onChange={(e) => setIsRememberUserOnDevice(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer accent-blue-600"
                    />
                    <div className="flex-1 text-right">
                      <span className="font-bold text-white block">تثبيت وضبط هذا الجهاز لهذا المستخدم</span>
                      <span className="text-[10px] text-slate-400 block">حفظ الحساب على هذا الهاتف/الكمبيوتر بصلاحياته المحددة</span>
                    </div>
                  </label>

                  {/* 4. Action Button: دخول */}
                  <button
                    type="submit"
                    id="btn-quick-login-submit"
                    disabled={isLoading}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 active:scale-[0.99] text-white font-bold text-sm sm:text-base rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>جاري الدخول...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-5 h-5" />
                        <span>تسجيل الدخول للنظام</span>
                      </>
                    )}
                  </button>

                  {/* Divider */}
                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-slate-800"></div>
                    <span className="flex-shrink mx-3 text-[11px] text-slate-500">أو عبر حساب Google (Gmail)</span>
                    <div className="flex-grow border-t border-slate-800"></div>
                  </div>

                  {/* Google Gmail Sign In Button */}
                  <button
                    type="button"
                    id="btn-google-login"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs sm:text-sm rounded-xl shadow transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>تسجيل الدخول السريع عبر Google (Gmail)</span>
                  </button>
                </form>

                {/* Manager Instant Realtime Sync Notice */}
                <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/20 flex items-center gap-2.5 text-right">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <p className="text-[11px] text-blue-200 leading-relaxed">
                    <span className="font-bold text-white">مزامنة سحابية لحظية:</span> أي حركة بيع أو شراء أو سند أو مخزون تتم من هذا الجهاز تسمع فوراً على جهاز المدير العام.
                  </p>
                </div>
              </div>
            ) : (
              /* ========================================================================= */
              /* 📱 STATE 1: DEVICE IS NOT BOUND -> FIRST TIME COMPANY SETUP / DEVICE BIND */
              /* ========================================================================= */
              <div id="unbound-device-container" className="space-y-6 animate-in fade-in">
                {/* Title */}
                <div className="text-center">
                  <div className="inline-flex p-3 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 mb-3 shadow-inner">
                    <Laptop className="w-7 h-7" />
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
                    تسجيل الدخول
                  </h2>
                </div>

                {/* Setup Mode Tabs */}
                <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                  <button
                    type="button"
                    id="tab-bind-existing-company"
                    onClick={() => {
                      setSetupTab('bind_existing');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      setupTab === 'bind_existing'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>ربط بكود المنشأة</span>
                  </button>

                  <button
                    type="button"
                    id="tab-register-new-company"
                    onClick={() => {
                      setSetupTab('register_new');
                      setErrorMessage(null);
                    }}
                    className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      setupTab === 'register_new'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>تسجيل منشأة جديدة</span>
                  </button>
                </div>

                {setupTab === 'bind_existing' ? (
                  /* TAB 1: BIND TO EXISTING COMPANY */
                  <form
                    id="form-bind-existing-company"
                    onSubmit={handleBindExistingCompanySubmit}
                    className="space-y-4"
                  >
                    <div>
                      <label
                        htmlFor="input-existing-company-code"
                        className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5 text-right"
                      >
                        كود المنشأة <span className="text-rose-400">*</span>
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                            <Building2 className="w-4 h-4 text-blue-400" />
                          </div>
                          <input
                            id="input-existing-company-code"
                            type="text"
                            value={existingCompanyCode}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setExistingCompanyCode(val);
                              setErrorMessage(null);
                              if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
                              if (val.trim().length >= 3) {
                                lookupTimeoutRef.current = setTimeout(() => {
                                  handleLookupCompany(val);
                                }, 600);
                              }
                            }}
                            placeholder="كود المنشأة"
                            dir="ltr"
                            className="w-full pl-3 pr-10 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-left uppercase font-bold"
                            disabled={isLoading}
                            required
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLookupCompany(existingCompanyCode)}
                          disabled={isLoading || !existingCompanyCode.trim()}
                          className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50 shadow-md shadow-blue-600/20"
                        >
                          {isLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <span>🔍</span>
                          )}
                          <span>عرض المستخدمين</span>
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      id="btn-submit-bind-existing"
                      disabled={isLoading}
                      className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 active:scale-[0.99] text-white font-bold text-sm sm:text-base rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                      {isLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>جاري التحميل...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-5 h-5" />
                          <span>ربط المنشأة</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  /* TAB 2: REGISTER NEW COMPANY */
                  <form
                    id="form-register-new-company"
                    onSubmit={handleRegisterNewCompanySubmit}
                    className="space-y-4"
                  >
                    {/* Field 1: Company Name */}
                    <div>
                      <label
                        htmlFor="reg-company-name"
                        className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1 text-right"
                      >
                        اسم المنشأة <span className="text-rose-400">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <input
                          id="reg-company-name"
                          type="text"
                          value={regCompanyName}
                          onChange={(e) => setRegCompanyName(e.target.value)}
                          placeholder="اسم المنشأة"
                          className="w-full pl-3 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-right"
                          disabled={isLoading}
                          required
                        />
                      </div>
                    </div>

                    {/* Field 2: Admin Gmail */}
                    <div>
                      <label
                        htmlFor="reg-admin-email"
                        className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1 text-right"
                      >
                        البريد الإلكتروني <span className="text-rose-400">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          id="reg-admin-email"
                          type="email"
                          value={regAdminEmail}
                          onChange={(e) => setRegAdminEmail(e.target.value)}
                          placeholder="name@example.com"
                          dir="ltr"
                          className="w-full pl-3 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-left font-mono"
                          disabled={isLoading}
                          required
                        />
                      </div>
                    </div>

                    {/* Field 3 & 4: Admin Username & Password in 2 Columns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="reg-admin-username"
                          className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1 text-right"
                        >
                          اسم المستخدم <span className="text-rose-400">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                            <User className="w-4 h-4" />
                          </div>
                          <input
                            id="reg-admin-username"
                            type="text"
                            value={regAdminUsername}
                            onChange={(e) => setRegAdminUsername(e.target.value)}
                            placeholder="admin"
                            dir="ltr"
                            className="w-full pl-3 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-left font-mono"
                            disabled={isLoading}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="reg-admin-password"
                          className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1 text-right"
                        >
                          كلمة المرور <span className="text-rose-400">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                            <Lock className="w-4 h-4" />
                          </div>
                          <input
                            id="reg-admin-password"
                            type={showRegPassword ? 'text' : 'password'}
                            value={regAdminPassword}
                            onChange={(e) => setRegAdminPassword(e.target.value)}
                            placeholder="••••••"
                            dir="ltr"
                            className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-left font-mono"
                            disabled={isLoading}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword(!showRegPassword)}
                            className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                            tabIndex={-1}
                          >
                            {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Field 5: Branch Name */}
                    <div>
                      <label
                        htmlFor="reg-branch-name"
                        className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1 text-right"
                      >
                        اسم الفرع
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                          <Store className="w-4 h-4 text-emerald-400" />
                        </div>
                        <input
                          id="reg-branch-name"
                          type="text"
                          value={regBranchName}
                          onChange={(e) => setRegBranchName(e.target.value)}
                          placeholder="الفرع الرئيسي"
                          className="w-full pl-3 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-right"
                          disabled={isLoading}
                        />
                      </div>
                    </div>

                    {/* Field 6: Registration Link / Token */}
                    <div>
                      <label
                        htmlFor="reg-link-identifier"
                        className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1 text-right"
                      >
                        كود أو رابط التسجيل (اختياري)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                        </div>
                        <input
                          id="reg-link-identifier"
                          type="text"
                          value={regLink}
                          onChange={(e) => setRegLink(e.target.value)}
                          placeholder="كود أو رابط التسجيل"
                          dir="ltr"
                          className="w-full pl-3 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-left font-mono"
                          disabled={isLoading}
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      id="btn-submit-register-company"
                      disabled={isLoading}
                      className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                    >
                      {isLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>جاري التسجيل...</span>
                        </>
                      ) : (
                        <>
                          <Laptop className="w-5 h-5" />
                          <span>تسجيل منشأة جديدة</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Confirmation Modal: Unbind Device */}
      {showUnbindConfirmModal && (
        <div
          id="unbind-device-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base sm:text-lg font-bold text-white">
                تبديل المنشأة أو الدخول لشركة أخرى
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                هل ترغب في تغيير المنشأة الحالية{' '}
                <span className="font-bold text-amber-400">"{boundDevice?.companyName}"</span> والربط بمنشأة أخرى بكود مختلف أو تسجيل منشأة جديدة؟
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                id="btn-confirm-unbind"
                onClick={handleConfirmUnbindDevice}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold transition cursor-pointer shadow-lg shadow-blue-600/30"
              >
                نعم، اختيار منشأة أخرى
              </button>
              <button
                type="button"
                id="btn-cancel-unbind"
                onClick={() => setShowUnbindConfirmModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition cursor-pointer"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secret Owner Modal */}
      {showSecretOwnerModal && (
        <div
          id="secret-owner-modal"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-sm w-full p-6 shadow-2xl shadow-amber-500/10 space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">
                بوابة مالك المنظومة (Platform Owner)
              </h3>
            </div>

            {ownerPinError && (
              <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {ownerPinError}
              </div>
            )}

            <form onSubmit={handleSecretOwnerSubmit} className="space-y-3">
              <div className="relative">
                <input
                  type="password"
                  value={secretOwnerPin}
                  onChange={(e) => setSecretOwnerPin(e.target.value)}
                  placeholder="أدخل الرمز السري"
                  dir="ltr"
                  autoFocus
                  className="w-full py-2.5 px-3 bg-slate-950 border border-slate-700 rounded-xl text-center text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-400 font-mono tracking-widest"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isVerifyingOwner}
                  className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer transition"
                >
                  {isVerifyingOwner ? 'جاري التحقق...' : 'دخول المالك'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSecretOwnerModal(false)}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-slate-500 border-t border-slate-800/60">
        <p>منظومة ركيزة المحاسبية RAKEEZA Cloud ERP © {new Date().getFullYear()} — جميع الحقوق محفوظة</p>
      </footer>
    </div>
  );
};

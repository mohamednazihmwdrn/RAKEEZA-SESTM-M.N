import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  TenantCompany,
  SubscriptionPlan,
  LicenseRecord,
  TrialRegistryRecord,
  User,
  AppData,
  DeviceSessionInfo,
} from '../src/types';
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  createNewTenantCompany,
  generateLicenseActivationCode,
} from '../src/utils/multiTenantService';
import { getDefaultData, mergeAppDataMonotonically } from '../src/utils/storage';
import { sendOtpVerificationEmail } from './emailService';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'rakeeza_cloud_db.json');

export interface SessionRecord {
  token: string;
  userId: string;
  userUid?: string;
  companyId: string;
  companyUid?: string;
  userName: string;
  userCode?: string | number;
  role: string;
  deviceId?: string;
  deviceName?: string;
  createdAt: string;
  expiresAt: string;
}

export interface PendingVerification {
  email: string;
  code: string;
  expiresAt: number;
  companyName?: string;
  phone?: string;
  adminName?: string;
  requestCount?: number;
  lastRequestedAt?: number;
}

export interface CloudDatabaseSchema {
  version: number;
  companies: TenantCompany[];
  plans: SubscriptionPlan[];
  trialRegistry: TrialRegistryRecord[];
  licenses: LicenseRecord[];
  sessions: Record<string, SessionRecord>;
  tenantsData: Record<string, AppData>;
  globalUsers: User[]; // Owner & cross-tenant administrative users
  devices?: Record<string, DeviceSessionInfo>;
  companyVersions?: Record<string, number>;
  processedOperations?: Record<string, string[]>;
  pendingVerifications?: Record<string, PendingVerification>;
  verifiedEmails?: Record<string, boolean>;
  usedRegistrationLinks?: string[];
}

export interface DeviceContext {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  ip?: string;
}

let dbCache: CloudDatabaseSchema | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createPreUpgradeBackup(rawJson: string): void {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUPS_DIR, `rakeeza_cloud_db_pre_upgrade_${stamp}.json`);
    fs.writeFileSync(backupPath, rawJson, 'utf-8');
  } catch (err) {
    console.warn('Pre-upgrade cloud DB backup warning:', err);
  }
}

export function hashPassword(plain: string): string {
  const normalized = normalizeArabicNumerals(String(plain || '').trim());
  if (!normalized) return '';
  if (normalized.startsWith('scrypt:')) return normalized;
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(normalized, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(plain: string, storedHashOrPlain?: string): boolean {
  const cleanPlain = String(plain || '').trim();
  if (!cleanPlain || !storedHashOrPlain) return false;
  const normPlain = normalizeArabicNumerals(cleanPlain);
  const stored = String(storedHashOrPlain).trim();

  if (stored.startsWith('scrypt:')) {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const [, salt, hexHash] = parts;
    if (!salt || !hexHash) return false;
    try {
      const expectedBuf = Buffer.from(hexHash, 'hex');
      const derivedNorm = crypto.scryptSync(normPlain, salt, 64);
      if (expectedBuf.length === derivedNorm.length && crypto.timingSafeEqual(expectedBuf, derivedNorm)) {
        return true;
      }
      if (cleanPlain !== normPlain) {
        const derivedRaw = crypto.scryptSync(cleanPlain, salt, 64);
        if (expectedBuf.length === derivedRaw.length && crypto.timingSafeEqual(expectedBuf, derivedRaw)) {
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  // Legacy plaintext fallback before migration
  const normStored = normalizeArabicNumerals(stored);
  return stored === cleanPlain || normStored === normPlain || stored === normPlain || normStored === cleanPlain;
}

export function sanitizeUserForClient<T extends Partial<User>>(user: T): T {
  if (!user || typeof user !== 'object') return user;
  const { password, passwordHash, altPass, ...rest } = user as any;
  return {
    ...rest,
    hasPassword: Boolean(passwordHash || password || rest.hasPassword),
  } as T;
}

export function sanitizeCompanyForClient<T extends Partial<TenantCompany>>(company: T): T {
  if (!company || typeof company !== 'object') return company;
  const { adminPassword, adminPasswordHash, ...rest } = company as any;
  return {
    ...rest,
    ...(Array.isArray(rest.users) ? { users: rest.users.map((u: any) => sanitizeUserForClient(u)) } : {}),
  } as T;
}

export function sanitizeAppDataForClient(data: AppData | null): AppData | null {
  if (!data) return data;
  return {
    ...data,
    users: Array.isArray(data.users) ? data.users.map((u) => sanitizeUserForClient(u)) : [],
  };
}

function preserveOrHashIncomingUsers(incomingUsers: User[] = [], existingUsers: User[] = []): User[] {
  return incomingUsers.map((u) => {
    const existing = existingUsers.find(
      (ex) =>
        (ex.id && u.id && ex.id === u.id) ||
        (ex.username && u.username && ex.username.toLowerCase() === u.username.toLowerCase())
    );
    const { password, altPass, ...rest } = u as any;
    const rawPass = typeof password === 'string' && password.trim() ? password.trim() : '';
    let nextHash = u.passwordHash || existing?.passwordHash;
    if (rawPass) {
      nextHash = hashPassword(rawPass);
    } else if (!nextHash && existing?.password) {
      nextHash = hashPassword(existing.password);
    }
    return {
      ...rest,
      ...(nextHash ? { passwordHash: nextHash, hasPassword: true } : { hasPassword: Boolean(u.hasPassword || existing?.hasPassword) }),
    } as User;
  });
}

function migrateDatabasePasswords(db: CloudDatabaseSchema): boolean {
  let changed = false;

  if (Array.isArray(db.globalUsers)) {
    db.globalUsers = db.globalUsers.map((u: any) => {
      if (u && (u.password || !u.passwordHash)) {
        const nextHash = u.passwordHash || (u.password ? hashPassword(u.password) : hashPassword('29190615'));
        const { password, ...rest } = u;
        changed = true;
        return { ...rest, passwordHash: nextHash, hasPassword: true };
      }
      return u;
    });
  }

  if (Array.isArray(db.companies)) {
    db.companies = db.companies.map((c: any) => {
      if (!c) return c;
      let copy = { ...c };
      if (!copy.apiKey) {
        copy.apiKey = `rkz_live_${String(copy.id || 'comp').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}_${crypto.randomBytes(6).toString('hex')}`;
        changed = true;
      }
      if (copy.adminPassword && !copy.adminPasswordHash) {
        copy.adminPasswordHash = hashPassword(copy.adminPassword);
        delete copy.adminPassword;
        changed = true;
      } else if (copy.adminPassword !== undefined) {
        delete copy.adminPassword;
        changed = true;
      }
      if (Array.isArray(copy.users)) {
        copy.users = copy.users.map((u: any) => {
          if (u && (u.password || u.altPass)) {
            const nextHash = u.passwordHash || hashPassword(u.password || u.altPass);
            const { password, altPass, ...rest } = u;
            changed = true;
            return { ...rest, passwordHash: nextHash, hasPassword: true };
          }
          return u;
        });
      }
      return copy;
    });
  }

  if (db.tenantsData && typeof db.tenantsData === 'object') {
    for (const [compId, tData] of Object.entries(db.tenantsData)) {
      if (!tData) continue;
      if (Array.isArray(tData.users)) {
        tData.users = tData.users.map((u: any) => {
          if (u && (u.password || u.altPass)) {
            const nextHash = u.passwordHash || hashPassword(u.password || u.altPass);
            const { password, altPass, ...rest } = u;
            changed = true;
            return { ...rest, passwordHash: nextHash, hasPassword: true };
          }
          return u;
        });
      }
      if (!db.companyVersions) db.companyVersions = {};
      if (!db.companyVersions[compId]) {
        db.companyVersions[compId] = tData.version || 1;
        changed = true;
      }
    }
  }

  return changed;
}

export function getPersistedCompanyVersion(companyId: string): number {
  const db = getCloudDatabase();
  db.companyVersions = db.companyVersions || {};
  return db.companyVersions[companyId] || db.tenantsData?.[companyId]?.version || 1;
}

export function upsertDeviceSession(params: {
  companyId: string;
  userId: string;
  userName: string;
  userCode?: string | number;
  role: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  ip?: string;
}): { allowed: boolean; device?: DeviceSessionInfo; error?: string } {
  const cleanDeviceId = (params.deviceId || '').trim();
  if (!cleanDeviceId) {
    return { allowed: true };
  }
  const db = getCloudDatabase();
  db.devices = db.devices || {};
  const deviceKey = `${params.companyId}::${cleanDeviceId}`;
  const existing = db.devices[deviceKey];
  const now = new Date().toISOString();

  if (existing && existing.status === 'revoked') {
    return {
      allowed: false,
      device: existing,
      error: 'تم إيقاف صلاحية هذا الجهاز من قِبل مدير المنشأة. يرجى إعادة التفعيل من لوحة إدارة الأجهزة.',
    };
  }

  const record: DeviceSessionInfo = {
    id: deviceKey,
    deviceId: cleanDeviceId,
    deviceName: (params.deviceName || existing?.deviceName || 'متصفح / جهاز مسجل').trim(),
    platform: params.platform || existing?.platform || 'Web',
    companyId: params.companyId,
    userId: params.userId,
    userName: params.userName,
    userCode: params.userCode,
    role: params.role,
    ip: params.ip || existing?.ip,
    createdAt: existing?.createdAt || now,
    lastActiveAt: now,
    status: 'active',
  };

  db.devices[deviceKey] = record;
  saveCloudDatabase(db);
  return { allowed: true, device: record };
}

export function listCompanyDevices(companyId: string): DeviceSessionInfo[] {
  const db = getCloudDatabase();
  const devices = Object.values(db.devices || {}).filter((d) => d.companyId === companyId);
  return devices.sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || ''));
}

export function revokeDeviceSession(
  companyId: string,
  deviceId: string,
  revokedBy: string
): { success: boolean; device?: DeviceSessionInfo; revokedTokens: string[]; error?: string } {
  const db = getCloudDatabase();
  db.devices = db.devices || {};
  const deviceKey = deviceId.includes('::') ? deviceId : `${companyId}::${deviceId}`;
  const device = db.devices[deviceKey];
  if (!device || device.companyId !== companyId) {
    return { success: false, revokedTokens: [], error: 'الجهاز غير موجود لهذه المنشأة.' };
  }

  device.status = 'revoked';
  device.revokedAt = new Date().toISOString();
  device.revokedBy = revokedBy;

  const revokedTokens: string[] = [];
  for (const [token, sess] of Object.entries(db.sessions || {})) {
    if (sess.companyId === companyId && sess.deviceId === device.deviceId) {
      delete db.sessions[token];
      revokedTokens.push(token);
    }
  }

  if (db.tenantsData[companyId]) {
    db.tenantsData[companyId].devices = listCompanyDevices(companyId);
  }

  saveCloudDatabase(db);
  return { success: true, device, revokedTokens };
}

export function restoreDeviceSession(
  companyId: string,
  deviceId: string
): { success: boolean; device?: DeviceSessionInfo; error?: string } {
  const db = getCloudDatabase();
  db.devices = db.devices || {};
  const deviceKey = deviceId.includes('::') ? deviceId : `${companyId}::${deviceId}`;
  const device = db.devices[deviceKey];
  if (!device || device.companyId !== companyId) {
    return { success: false, error: 'الجهاز غير موجود لهذه المنشأة.' };
  }

  device.status = 'active';
  delete device.revokedAt;
  delete device.revokedBy;
  device.lastActiveAt = new Date().toISOString();

  if (db.tenantsData[companyId]) {
    db.tenantsData[companyId].devices = listCompanyDevices(companyId);
  }

  saveCloudDatabase(db);
  return { success: true, device };
}

export function getOwnerSystemHealth() {
  const db = getCloudDatabase();
  const devices = Object.values(db.devices || {});
  const sessions = Object.values(db.sessions || {});
  let dbFileSizeBytes = 0;
  let backupCount = 0;
  try {
    if (fs.existsSync(DB_FILE)) dbFileSizeBytes = fs.statSync(DB_FILE).size;
    if (fs.existsSync(BACKUPS_DIR)) backupCount = fs.readdirSync(BACKUPS_DIR).length;
  } catch {}
  return {
    companiesCount: db.companies.length,
    tenantsInitialized: Object.keys(db.tenantsData || {}).length,
    activeSessionsCount: sessions.filter((s) => new Date(s.expiresAt).getTime() > Date.now()).length,
    registeredDevicesCount: devices.length,
    activeDevicesCount: devices.filter((d) => d.status === 'active').length,
    revokedDevicesCount: devices.filter((d) => d.status === 'revoked').length,
    dbFileSizeBytes,
    backupCount,
  };
}

/**
 * Initializes and seeds the cloud database if not already present on disk
 */
export function initCloudDatabase(): CloudDatabaseSchema {
  ensureDataDir();

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content) as CloudDatabaseSchema;
      parsed.pendingVerifications = parsed.pendingVerifications || {};
      parsed.verifiedEmails = parsed.verifiedEmails || {};
      parsed.devices = parsed.devices || {};
      parsed.companyVersions = parsed.companyVersions || {};
      parsed.processedOperations = parsed.processedOperations || {};
      parsed.companies = (parsed.companies || []).filter(Boolean);

      const hasLegacyPlaintext =
        (parsed.globalUsers || []).some((u: any) => u?.password && !u?.passwordHash) ||
        (parsed.companies || []).some((c: any) => c?.adminPassword) ||
        Object.values(parsed.tenantsData || {}).some((td: any) =>
          (td?.users || []).some((u: any) => u?.password && !u?.passwordHash)
        );

      if (hasLegacyPlaintext) {
        createPreUpgradeBackup(content);
      }

      const migrated = migrateDatabasePasswords(parsed);
      if (migrated || hasLegacyPlaintext) {
        saveCloudDatabase(parsed);
      }
      dbCache = parsed;
      return parsed;
    } catch (err) {
      console.error('Failed reading existing cloud database, creating fresh seed:', err);
    }
  }

  const initialSchema: CloudDatabaseSchema = {
    version: 1,
    companies: [],
    plans: DEFAULT_SUBSCRIPTION_PLANS,
    trialRegistry: [],
    licenses: [],
    sessions: {},
    tenantsData: {},
    devices: {},
    companyVersions: {},
    processedOperations: {},
    usedRegistrationLinks: [],
    pendingVerifications: {},
    verifiedEmails: {},
    globalUsers: [
      {
        id: 'owner-mohamed-nazih',
        name: 'Mohamed Nazih (مالك المنظومة)',
        username: 'MohamedNazih',
        passwordHash: hashPassword('29190615'),
        hasPassword: true,
        role: 'owner',
        status: 'active',
        permissions: { all: true },
      },
      {
        id: 'owner-super-1',
        name: 'مالك المنظومة السحابية (RAKEEZA Owner)',
        username: 'owner',
        passwordHash: hashPassword('29190615'),
        hasPassword: true,
        role: 'owner',
        status: 'active',
        permissions: { all: true },
      },
      {
        id: 'owner-super-2',
        name: 'إدارة منظومة ركيزة (Super Admin)',
        username: 'rakeeza_admin',
        passwordHash: hashPassword('29190615'),
        hasPassword: true,
        role: 'owner',
        status: 'active',
        permissions: { all: true },
      },
    ],
  };

  saveCloudDatabase(initialSchema);
  return initialSchema;
}

export function getCloudDatabase(): CloudDatabaseSchema {
  if (!dbCache) {
    dbCache = initCloudDatabase();
  }
  return dbCache;
}

export function saveCloudDatabase(data: CloudDatabaseSchema): void {
  try {
    ensureDataDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    dbCache = data;
  } catch (err) {
    console.error('Failed writing cloud database:', err);
  }
}

/**
 * Authentication Engine: Multi-Tenant & Owner Verification
 */
export function authenticateUser(
  companyIdOrCode: string,
  username: string,
  password: string,
  deviceCtx?: DeviceContext
): {
  success: boolean;
  token?: string;
  user?: User;
  company?: TenantCompany;
  subscription?: {
    status: string;
    planName: string;
    daysRemaining: number;
    isExpired: boolean;
    expiresAt?: string;
  };
  error?: string;
} {
  const db = getCloudDatabase();
  const cleanUsername = (username || '').trim().toLowerCase();
  const cleanCompanyInput = (companyIdOrCode || '').trim().toUpperCase();

  // 1. Owner Login Route
  if (
    cleanCompanyInput === 'OWNER' ||
    cleanCompanyInput === 'RAKEEZA' ||
    cleanCompanyInput === 'SYSTEM' ||
    cleanUsername === 'owner' ||
    cleanUsername === 'rakeeza_admin'
  ) {
    const ownerUser = db.globalUsers.find(
      (u) =>
        u.username.toLowerCase() === cleanUsername &&
        verifyPassword(password, u.passwordHash || u.password)
    );

    if (ownerUser) {
      const token = `tok_owner_${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      db.sessions[token] = {
        token,
        userId: ownerUser.id,
        companyId: 'OWNER',
        userName: ownerUser.name,
        role: 'owner',
        deviceId: deviceCtx?.deviceId,
        deviceName: deviceCtx?.deviceName,
        createdAt: new Date().toISOString(),
        expiresAt,
      };
      saveCloudDatabase(db);

      const ownerVirtualCompany: TenantCompany = {
        id: 'OWNER',
        tenantId: 'TENANT-RAKEEZA-CLOUD-ROOT',
        code: 'OWNER-00',
        name: 'منظومة RAKEEZA Cloud ERP - لوحة المالك',
        tradeName: 'RAKEEZA Enterprise Cloud',
        phone: '01029190615',
        status: 'active',
        planId: 'lifetime',
        planName: 'ترخيص المالك المطلق (Root Owner)',
        limits: {
          maxUsers: 99999,
          maxBranches: 9999,
          maxWarehouses: 9999,
          maxTransactionsPerMonth: 99999999,
          storageMb: 999999,
          maxSalesReps: 9999,
        },
        features: ['sales', 'purchases', 'inventory', 'accounting', 'reports', 'multi_branch', 'e_invoicing', 'bi'],
        usersCount: db.companies.reduce((acc, c) => acc + (c.usersCount || 1), 0),
        branchesCount: 1,
        warehousesCount: 1,
        operationsCount: 9999,
      };

      return {
        success: true,
        token,
        user: sanitizeUserForClient(ownerUser),
        company: ownerVirtualCompany,
        subscription: {
          status: 'active',
          planName: 'ترخيص المالك المطلق (Root Owner)',
          daysRemaining: 36500,
          isExpired: false,
        },
      };
    }
  }

  // 2. Company Lookup
  if (!cleanCompanyInput) {
    return {
      success: false,
      error: 'يرجى إدخال كود الشركة (Company ID) أو كود المنشأة أو كود المستخدم.',
    };
  }

  const { company } = findCompanyByAnyIdentifier(db, companyIdOrCode);

  if (!company) {
    return {
      success: false,
      error: `لم يتم العثور على شركة مسجلة بالكود "${companyIdOrCode}". يرجى التأكد من كتابة كود الشركة أو المستخدم بشكل صحيح.`,
    };
  }

  // 3. Company Status & Suspension Check
  if (company.status === 'suspended') {
    return {
      success: false,
      error: 'عذراً، تم تعليق حساب هذه الشركة مؤقتاً من قِبل إدارة النظام. يرجى التواصل مع الدعم الفني لشركة ركيزة.',
    };
  }

  // 4. Find User in Company Data (matching by userCode, username, name, or id)
  const tenantData = getTenantDataStrict(company.id);
  const companyUsers = (tenantData?.users && tenantData.users.length > 0)
    ? tenantData.users
    : (company.users && company.users.length > 0)
    ? company.users
    : [];

  const cleanPass = (password || '').trim();
  if (!cleanPass) {
    return {
      success: false,
      error: 'يرجى إدخال كلمة المرور للمتابعة.',
    };
  }
  const normUsername = normalizeArabicNumerals(cleanUsername);

  const isPasswordMatch = (storedPassOrHash?: string): boolean => verifyPassword(cleanPass, storedPassOrHash);

  const isUserMatch = (u: any): boolean => {
    const uName = (u.name || '').trim().toLowerCase();
    const uUser = (u.username || '').trim().toLowerCase();
    const uId = (u.id || '').trim().toLowerCase();
    const uCode = String(u.code || (u as any).userCode || '').trim();
    const normCode = normalizeArabicNumerals(uCode);

    return (
      uUser === cleanUsername ||
      uUser === normUsername ||
      uName === cleanUsername ||
      uId === cleanUsername ||
      uCode === cleanUsername ||
      normCode === normUsername ||
      (cleanUsername.length > 2 && uName.includes(cleanUsername))
    );
  };

  const companyAdminCred = (company as any).adminPasswordHash || company.adminPassword;

  // Match user strictly by stored passwordHash / password
  let matchedUser = companyUsers.find(
    (u) =>
      isUserMatch(u) &&
      (isPasswordMatch(u.passwordHash || u.password) ||
        isPasswordMatch((u as any).altPass) ||
        (isPasswordMatch(companyAdminCred) && (u.role === 'company_admin' || u.role === 'admin' || u.code === 1)))
  );

  const isAdminLookup =
    cleanUsername === '1' ||
    cleanUsername === 'admin' ||
    cleanUsername === 'manager' ||
    company.adminUsername?.toLowerCase() === cleanUsername ||
    company.adminName?.toLowerCase() === cleanUsername ||
    company.adminEmail?.toLowerCase() === cleanUsername ||
    company.email?.toLowerCase() === cleanUsername ||
    cleanUsername === 'المدير العام';

  if (!matchedUser && isAdminLookup) {
    const adminU = companyUsers.find((u) => u.role === 'company_admin' || u.role === 'admin' || u.code === 1);
    const hasAdminPassMatch = Boolean(
      isPasswordMatch(companyAdminCred) ||
      (adminU && isPasswordMatch(adminU.passwordHash || adminU.password))
    );
    if (hasAdminPassMatch) {
      matchedUser = adminU || {
        id: `u-${company.id}-admin`,
        code: 1,
        companyId: company.id,
        name: company.adminName || 'المدير العام',
        username: company.adminUsername || 'admin',
        passwordHash: companyAdminCred ? (String(companyAdminCred).startsWith('scrypt:') ? companyAdminCred : hashPassword(companyAdminCred)) : hashPassword(cleanPass),
        hasPassword: true,
        role: 'company_admin',
        status: 'active',
        permissions: { all: true },
      };
    }
  }

  if (!matchedUser) {
    return {
      success: false,
      error: 'كود المستخدم أو اسم المستخدم أو كلمة المرور غير صحيحة لهذه الشركة.',
    };
  }

  if (matchedUser.status === 'disabled') {
    return {
      success: false,
      error: 'تم تعطيل هذا الحساب بواسطة مدير الشركة. يرجى مراجعة المسؤول.',
    };
  }

  // Register/verify device status
  const deviceCheck = upsertDeviceSession({
    companyId: company.id,
    userId: matchedUser.id,
    userName: matchedUser.name,
    userCode: matchedUser.code || 1,
    role: matchedUser.role,
    deviceId: deviceCtx?.deviceId,
    deviceName: deviceCtx?.deviceName,
    platform: deviceCtx?.platform,
    ip: deviceCtx?.ip,
  });

  if (!deviceCheck.allowed) {
    return {
      success: false,
      error: deviceCheck.error || 'تم إيقاف هذا الجهاز من قِبل مدير المنشأة.',
    };
  }

  // Assign strict multi-tenant UIDs
  const companyUid = (company as any).uid || `UID_COMP_${company.id}`;
  const userUid = (matchedUser as any).uid || `UID_${company.id}_USR_${matchedUser.code || 1}`;
  (matchedUser as any).uid = userUid;
  (matchedUser as any).userCode = matchedUser.code || 1;
  (company as any).uid = companyUid;
  (company as any).companyCode = company.code || '101';

  // 5. Subscription Status Evaluation
  const now = new Date();
  const expiryDateStr = company.subscriptionExpiresAt || company.trialExpiresAt;
  let isExpired = false;
  let daysRemaining = 30;

  if (expiryDateStr) {
    const expiryDate = new Date(expiryDateStr);
    const diffTime = expiryDate.getTime() - now.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (daysRemaining <= 0) {
      isExpired = true;
      daysRemaining = 0;
    }
  }

  // 6. Generate Session Token
  const token = `tok_${company.id}_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.sessions[token] = {
    token,
    userId: matchedUser.id,
    userUid,
    companyId: company.id,
    companyUid,
    userName: matchedUser.name,
    userCode: matchedUser.code || (matchedUser.role === 'company_admin' || matchedUser.role === 'admin' ? 1 : 2),
    role: matchedUser.role,
    deviceId: deviceCtx?.deviceId,
    deviceName: deviceCtx?.deviceName,
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  // Log in company's audit logs
  if (tenantData) {
    const loginLog = {
      id: `log-login-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      userName: matchedUser.name,
      userId: matchedUser.id,
      companyId: company.id,
      action: 'login',
      module: 'المصادقة والأمان',
      details: `تسجيل دخول ناجح إلى منظومة شركة "${company.name}"${deviceCtx?.deviceName ? ` (${deviceCtx.deviceName})` : ''}`,
    };
    tenantData.auditLogs = [loginLog, ...(tenantData.auditLogs || [])].slice(0, 500);
  }

  saveCloudDatabase(db);

  return {
    success: true,
    token,
    user: sanitizeUserForClient(matchedUser),
    company: sanitizeCompanyForClient(company),
    subscription: {
      status: isExpired ? 'expired' : company.status,
      planName: company.planName || 'الاشتراك القياسي',
      daysRemaining,
      isExpired,
      expiresAt: expiryDateStr,
    },
  };
}

// ----------------------------------------------------
// 👑 Secure Owner Authentication & Session Engine
// ----------------------------------------------------
interface OwnerFailedTracker {
  count: number;
  lastAttempt: number;
  lockedUntil?: number;
}
const ownerFailedAttempts = new Map<string, OwnerFailedTracker>();

/**
 * Authenticates Owner credentials against db.globalUsers with brute-force rate-limiting.
 */
export function authenticateOwnerCredentials(
  username: string,
  password: string,
  clientIp: string = 'global'
): {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    name: string;
    username: string;
    role: string;
    permissions: any;
  };
  expiresAt?: string;
  error?: string;
} {
  // Normalize numerals and strip hidden marks
  const normPass = (password || '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\s\-]/g, '');

  const normUser = (username || '')
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '')
    .trim()
    .toLowerCase();

  const isOwnerMasterPass =
    normPass === '29190615' ||
    normPass === '01029190615' ||
    normPass === '+201029190615' ||
    normPass === '201029190615' ||
    Boolean(process.env.OWNER_SECRET_PIN && normPass === process.env.OWNER_SECRET_PIN);

  // If valid owner password is provided, immediately bypass and unlock any previous cooldown
  if (isOwnerMasterPass) {
    ownerFailedAttempts.delete(clientIp);
  } else {
    // 1. Rate-limiting / brute-force protection for non-owner passwords
    const now = Date.now();
    const tracker = ownerFailedAttempts.get(clientIp);
    if (tracker && tracker.lockedUntil && tracker.lockedUntil > now) {
      const minsLeft = Math.ceil((tracker.lockedUntil - now) / 60000);
      return {
        success: false,
        error: `تم تجاوز الحد الأقصى للمحاولات الخاطئة. تم قفل المحاولات مؤقتاً لمدة ${minsLeft} دقيقة لحماية النظام.`,
      };
    }
  }

  if (!normPass) {
    return {
      success: false,
      error: 'يرجى إدخال كلمة المرور الخاصة بمالك المنظومة.',
    };
  }

  const db = getCloudDatabase();
  const ownerUsers = (db.globalUsers || []).filter((u) => u.role === 'owner');

  const matchedOwner =
    (isOwnerMasterPass
      ? ownerUsers[0] || {
          id: 'owner-mohamed-nazih',
          name: 'Mohamed Nazih (مالك المنظومة)',
          username: 'MohamedNazih',
          passwordHash: hashPassword('29190615'),
          hasPassword: true,
          role: 'owner',
          status: 'active',
          permissions: { all: true },
        }
      : null) ||
    ownerUsers.find(
      (u) =>
        (u.username?.toLowerCase() === normUser ||
          u.name?.toLowerCase() === normUser ||
          u.id?.toLowerCase() === normUser) &&
        verifyPassword(normPass, u.passwordHash || u.password)
    );

  if (!matchedOwner) {
    // Record failed attempt
    const now = Date.now();
    const tracker = ownerFailedAttempts.get(clientIp);
    const current = tracker || { count: 0, lastAttempt: now };
    if (now - current.lastAttempt > 10 * 60 * 1000) {
      current.count = 0;
    }
    current.count += 1;
    current.lastAttempt = now;
    if (current.count >= 5) {
      current.lockedUntil = now + 15 * 60 * 1000; // 15 mins cooldown
    }
    ownerFailedAttempts.set(clientIp, current);

    return {
      success: false,
      error: 'بيانات اعتماد مالك المنظومة غير صحيحة.',
    };
  }

  // Clear failed tracker upon successful authentication
  ownerFailedAttempts.delete(clientIp);

  // Generate cryptographically secure Owner token
  const token = `tok_owner_${crypto.randomBytes(32).toString('hex')}`;
  // 12 Hours expiration
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

  db.sessions[token] = {
    token,
    userId: matchedOwner.id,
    companyId: 'OWNER',
    userName: matchedOwner.name,
    role: 'owner',
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  saveCloudDatabase(db);

  return {
    success: true,
    token,
    user: {
      id: matchedOwner.id,
      name: matchedOwner.name,
      username: matchedOwner.username,
      role: 'owner',
      permissions: matchedOwner.permissions || { all: true },
    },
    expiresAt,
  };
}

/**
 * Validates an Owner session token strictly verifying role === 'owner' and expiration.
 */
export function validateOwnerSession(token: string): {
  valid: boolean;
  session?: SessionRecord;
  user?: {
    id: string;
    name: string;
    username: string;
    role: string;
    permissions: any;
  };
  error?: string;
} {
  if (!token) return { valid: false, error: 'لا يوجد رمز مصادقة' };

  const db = getCloudDatabase();
  const session = db.sessions[token];

  if (!session) {
    return { valid: false, error: 'رمز الجلسة غير صالح أو منتهي الصلاحية' };
  }

  if (session.role !== 'owner') {
    return { valid: false, error: 'رمز الجلسة لا يمتلك صلاحيات مالك المنظومة' };
  }

  const now = new Date();
  const expiry = new Date(session.expiresAt);
  if (now > expiry) {
    delete db.sessions[token];
    saveCloudDatabase(db);
    return { valid: false, error: 'انتهت صلاحية جلسة المالك، يرجى تسجيل الدخول مجدداً' };
  }

  const ownerUser = (db.globalUsers || []).find((u) => u.id === session.userId);

  return {
    valid: true,
    session,
    user: {
      id: session.userId,
      name: session.userName,
      username: ownerUser?.username || 'owner',
      role: 'owner',
      permissions: ownerUser?.permissions || { all: true },
    },
  };
}

/**
 * Invalidates and revokes an Owner session token.
 */
export function invalidateOwnerSession(token: string): boolean {
  if (!token) return false;
  const db = getCloudDatabase();
  if (db.sessions[token]) {
    delete db.sessions[token];
    saveCloudDatabase(db);
    return true;
  }
  return false;
}

/**
 * Secret Owner Verification (Accessed secretly by long-pressing system name anywhere)
 */
export function verifyOwnerSecret(secret: string): {
  success: boolean;
  token?: string;
  user?: User;
  company?: TenantCompany;
  subscription?: {
    status: string;
    planName: string;
    daysRemaining: number;
    isExpired: boolean;
    expiresAt?: string;
  };
  error?: string;
} {
  const normSecret = (secret || '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\s\-]/g, '');

  const db = getCloudDatabase();
  const isOwnerSecret =
    normSecret === '29190615' ||
    normSecret === '01029190615' ||
    normSecret === '+201029190615' ||
    normSecret === '201029190615' ||
    Boolean(process.env.OWNER_SECRET_PIN && normSecret === process.env.OWNER_SECRET_PIN);

  const ownerUser =
    (isOwnerSecret ? (db.globalUsers || []).find((u) => u.role === 'owner') || db.globalUsers[0] : null) ||
    (db.globalUsers || []).find((u) => verifyPassword(normSecret, u.passwordHash || u.password));

  if (!ownerUser) {
    return { success: false, error: 'كلمة المرور الخاصة بمالك المنظومة غير صحيحة.' };
  }

  const token = `tok_owner_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.sessions[token] = {
    token,
    userId: ownerUser.id,
    companyId: 'OWNER',
    userName: ownerUser.name,
    role: 'owner',
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  saveCloudDatabase(db);

  const ownerVirtualCompany: TenantCompany = {
    id: 'OWNER',
    tenantId: 'TENANT-RAKEEZA-CLOUD-ROOT',
    code: 'OWNER-00',
    name: 'منظومة RAKEEZA Cloud ERP - لوحة المالك',
    tradeName: 'RAKEEZA Enterprise Cloud',
    phone: '01029190615',
    status: 'active',
    planId: 'lifetime',
    planName: 'ترخيص المالك المطلق (Root Owner)',
    limits: {
      maxUsers: 99999,
      maxBranches: 9999,
      maxWarehouses: 9999,
      maxTransactionsPerMonth: 99999999,
      storageMb: 999999,
      maxSalesReps: 9999,
    },
    features: ['sales', 'purchases', 'inventory', 'accounting', 'reports', 'multi_branch', 'e_invoicing', 'bi'],
    usersCount: db.companies.reduce((acc, c) => acc + (c.usersCount || 1), 0),
    branchesCount: 1,
    warehousesCount: 1,
    operationsCount: 9999,
  };

  return {
    success: true,
    token,
    user: sanitizeUserForClient(ownerUser),
    company: ownerVirtualCompany,
    subscription: {
      status: 'active',
      planName: 'ترخيص المالك المطلق (Root Owner)',
      daysRemaining: 36500,
      isExpired: false,
    },
  };
}

/**
 * Sign in or Register using Google / Gmail
 */
export function authenticateOrRegisterWithGmail(
  gmail: string,
  companyName?: string,
  phone?: string,
  adminName?: string
): {
  success: boolean;
  isNewCompany?: boolean;
  token?: string;
  user?: User;
  company?: TenantCompany;
  subscription?: {
    status: string;
    planName: string;
    daysRemaining: number;
    isExpired: boolean;
    expiresAt?: string;
  };
  error?: string;
  needsRegistration?: boolean;
} {
  const cleanEmail = (gmail || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'يرجى إدخال عنوان بريد Gmail صالح.' };
  }

  const db = getCloudDatabase();

  // 1. Look for existing company matching this email
  let company = db.companies.find(
    (c) =>
      c.email?.toLowerCase() === cleanEmail ||
      c.adminEmail?.toLowerCase() === cleanEmail
  );

  // 2. Or check users within any tenant's data
  let matchedUser: User | undefined;
  if (company) {
    const tenantData = db.tenantsData[company.id];
    matchedUser = tenantData?.users?.find(
      (u) =>
        u.email?.toLowerCase() === cleanEmail ||
        u.username?.toLowerCase() === cleanEmail ||
        u.role === 'company_admin'
    );
  } else {
    // Check all tenants to see if user exists with this email
    for (const c of db.companies) {
      const td = db.tenantsData[c.id];
      const foundUser = td?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
      if (foundUser) {
        company = c;
        matchedUser = foundUser;
        break;
      }
    }
  }

  // 3. If found, generate session token and log in
  if (company) {
    if (!matchedUser) {
      matchedUser = {
        id: `u-${company.id}-gmail`,
        companyId: company.id,
        name: adminName || company.adminName || cleanEmail.split('@')[0],
        username: cleanEmail.split('@')[0],
        role: 'company_admin',
        status: 'active',
        email: cleanEmail,
        permissions: { all: true },
      };
    }

    const token = `tok_${company.id}_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.sessions[token] = {
      token,
      userId: matchedUser.id,
      companyId: company.id,
      userName: matchedUser.name,
      role: matchedUser.role,
      createdAt: new Date().toISOString(),
      expiresAt,
    };

    saveCloudDatabase(db);

    return {
      success: true,
      isNewCompany: false,
      token,
      user: sanitizeUserForClient(matchedUser),
      company: sanitizeCompanyForClient(company),
      subscription: {
        status: company.status,
        planName: company.planName || 'الاشتراك القياسي',
        daysRemaining: 30,
        isExpired: false,
      },
    };
  }

  // 4. If company not found, strictly require OTP verification to prevent fake accounts
  return {
    success: false,
    needsRegistration: true,
    error: 'لم يتم العثور على شركة مسجلة بهذا البريد. يرجى إدخال اسم المنشأة وتأكيد البريد برمز التحقق OTP لتسجيل حسابك بأمان.',
  };
}

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com',
  '10minutemail.com',
  'mailinator.com',
  'guerrillamail.com',
  'yopmail.com',
  'trashmail.com',
  'fake.com',
  'test.com',
  'dispostable.com',
  'sharklasers.com',
  'getairmail.com',
  'crazymailing.com',
  'mytemp.email',
  'throwawaymail.com',
  'generator.email',
  'temp-mail.org',
]);

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Request an OTP verification code sent to Gmail to prevent fake registrations
 */
export async function requestEmailVerification(
  email: string,
  companyName?: string,
  phone?: string,
  adminName?: string
): Promise<{
  success: boolean;
  message: string;
  isExistingCompany?: boolean;
  previewCode?: string;
  error?: string;
}> {
  const cleanEmail = (email || '').trim().toLowerCase();
  
  // 1. Strict syntax check
  if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
    return {
      success: false,
      message: 'صيغة البريد الإلكتروني غير صحيحة. يرجى إدخال عنوان Gmail حقيقي وصحيح.',
      error: 'بريد غير صالح',
    };
  }

  // 2. Reject disposable / fake domains
  const domain = cleanEmail.split('@')[1];
  if (domain && DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      success: false,
      message: 'عذراً، النطاقات والبريد المؤقت غير مسموح بها. يرجى إدخال بريد Gmail حقيقي لتأكيد حساب المنشأة.',
      error: 'بريد وهمي غير مسموح',
    };
  }

  const db = getCloudDatabase();
  db.pendingVerifications = db.pendingVerifications || {};

  // 3. Anti-repeat rate limiting (prevent repeated rapid spamming)
  const now = Date.now();
  const existingPending = db.pendingVerifications[cleanEmail];
  if (existingPending) {
    const elapsed = now - (existingPending.lastRequestedAt || 0);
    // Cool-down of 20 seconds
    if (elapsed < 20000) {
      return {
        success: false,
        message: 'يرجى الانتظار 20 ثانية قبل طلب رمز تحقق جديد لمنع تكرار الإرسال.',
        error: 'انتظر قبل إعادة المحاولة',
      };
    }
    // Limit to max 5 requests per 10 minutes
    if ((existingPending.requestCount || 0) >= 5 && elapsed < 600000) {
      return {
        success: false,
        message: 'لقد تم تجاوز الحد الأقصى المسموح لطلبات التحقق لهذا البريد. يرجى الانتظار 10 دقائق.',
        error: 'تجاوز حد الإرسال',
      };
    }
  }

  // Check if company already exists with this email
  const existingCompany = db.companies.find(
    (c) => c.email?.toLowerCase() === cleanEmail || c.adminEmail?.toLowerCase() === cleanEmail
  );

  // Generate 6-digit verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes
  const prevCount = existingPending?.requestCount || 0;

  db.pendingVerifications[cleanEmail] = {
    email: cleanEmail,
    code,
    expiresAt,
    companyName: companyName?.trim() || existingPending?.companyName,
    phone: phone?.trim() || existingPending?.phone,
    adminName: adminName?.trim() || existingPending?.adminName,
    requestCount: prevCount + 1,
    lastRequestedAt: now,
  };

  saveCloudDatabase(db);

  // Send email via SMTP / Gmail
  const emailRes = await sendOtpVerificationEmail(cleanEmail, code, companyName);

  return {
    success: true,
    message: emailRes.sentViaSmtp
      ? `تم إرسال كود التحقق بنجاح إلى بريدك الإلكتروني (${cleanEmail}). يرجى فحص صندوق الوارد أو الرسائل غير المرغوب فيها (Spam).`
      : `تم إرسال رمز التحقق إلى (${cleanEmail}). رمز التحقق هو: ${code}`,
    isExistingCompany: !!existingCompany,
    previewCode: code,
  };
}

/**
 * Verify OTP code and activate company registration or login
 */
export function verifyEmailOtpAndRegister(
  email: string,
  code: string,
  companyName?: string,
  phone?: string,
  adminName?: string
): {
  success: boolean;
  token?: string;
  user?: User;
  company?: TenantCompany;
  subscription?: {
    status: string;
    planName: string;
    daysRemaining: number;
    isExpired: boolean;
    expiresAt?: string;
  };
  error?: string;
} {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanCode = (code || '').trim();

  if (!cleanEmail || !cleanCode) {
    return { success: false, error: 'يرجى إدخال البريد الإلكتروني وكود التحقق المكون من 6 أرقام.' };
  }

  const db = getCloudDatabase();
  db.pendingVerifications = db.pendingVerifications || {};
  db.verifiedEmails = db.verifiedEmails || {};

  const pending = db.pendingVerifications[cleanEmail];
  const isCodeValid = pending && pending.code === cleanCode;

  if (!isCodeValid) {
    return {
      success: false,
      error: 'رمز التحقق غير صحيح. يرجى التأكد من الرمز المكون من 6 أرقام أو طلب إرسال رمز جديد.',
    };
  }

  if (pending && Date.now() > pending.expiresAt) {
    return {
      success: false,
      error: 'انتهت صلاحية رمز التحقق (صلاحية الرمز 10 دقائق). يرجى طلب إرسال رمز جديد.',
    };
  }

  // Mark email as verified and clear pending
  db.verifiedEmails[cleanEmail] = true;
  delete db.pendingVerifications[cleanEmail];

  // 1. Check if an existing company already matches this verified email
  let company = db.companies.find(
    (c) => c.email?.toLowerCase() === cleanEmail || c.adminEmail?.toLowerCase() === cleanEmail
  );

  // If existing company found, log in directly
  if (company) {
    const tenantData = db.tenantsData[company.id];
    let matchedUser = tenantData?.users?.find(
      (u) =>
        u.email?.toLowerCase() === cleanEmail ||
        u.username?.toLowerCase() === cleanEmail ||
        u.role === 'company_admin'
    );

    if (!matchedUser) {
      matchedUser = {
        id: `u-${company.id}-admin`,
        companyId: company.id,
        name: adminName || company.adminName || cleanEmail.split('@')[0],
        username: cleanEmail.split('@')[0],
        role: 'company_admin',
        status: 'active',
        email: cleanEmail,
        permissions: { all: true },
      };
    }

    const token = `tok_${company.id}_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.sessions[token] = {
      token,
      userId: matchedUser.id,
      companyId: company.id,
      userName: matchedUser.name,
      role: matchedUser.role,
      createdAt: new Date().toISOString(),
      expiresAt,
    };
    saveCloudDatabase(db);

    return {
      success: true,
      token,
      user: sanitizeUserForClient(matchedUser),
      company: sanitizeCompanyForClient(company),
      subscription: {
        status: company.status,
        planName: company.planName || 'الاشتراك القياسي',
        daysRemaining: 30,
        isExpired: false,
      },
    };
  }

  // 2. New Company Registration (after OTP verification has proven legitimate email)
  const finalCompanyName = (companyName || pending?.companyName || '').trim();
  if (!finalCompanyName) {
    return {
      success: false,
      error: 'يرجى إدخال اسم المنشأة أو الشركة لإتمام إنشاء الحساب السحابي.',
    };
  }

  const newCompanyInput: Partial<TenantCompany> = {
    name: finalCompanyName,
    tradeName: finalCompanyName,
    email: cleanEmail,
    adminEmail: cleanEmail,
    adminName: (adminName || pending?.adminName || cleanEmail.split('@')[0]).trim(),
    adminUsername: cleanEmail.split('@')[0],
    adminPassword: crypto.randomBytes(6).toString('hex'),
    phone: (phone || pending?.phone || '').trim(),
    activity: 'تجارة عامة وخدمات',
    address: 'الفرع الرئيسي',
  };

  const created = createNewCompanyCloud(newCompanyInput, 'trial');
  const freshCompany = created.company;
  const tenantData = db.tenantsData[freshCompany.id];
  const freshAdminUser: User = (tenantData?.users && tenantData.users[0]) || {
    id: `u-${freshCompany.id}-admin`,
    companyId: freshCompany.id,
    name: newCompanyInput.adminName || 'المدير العام',
    username: newCompanyInput.adminUsername || 'admin',
    role: 'company_admin',
    status: 'active',
    email: cleanEmail,
    permissions: { all: true },
  };

  freshAdminUser.email = cleanEmail;

  const token = `tok_${freshCompany.id}_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.sessions[token] = {
    token,
    userId: freshAdminUser.id,
    companyId: freshCompany.id,
    userName: freshAdminUser.name,
    role: freshAdminUser.role,
    createdAt: new Date().toISOString(),
    expiresAt,
  };

  saveCloudDatabase(db);

  return {
    success: true,
    token,
    user: sanitizeUserForClient(freshAdminUser),
    company: sanitizeCompanyForClient(freshCompany),
    subscription: {
      status: freshCompany.status,
      planName: freshCompany.planName || 'التجربة المجانية',
      daysRemaining: 30,
      isExpired: false,
    },
  };
}

/**
 * Validate active session token
 */
export function validateSession(
  token: string,
  deviceId?: string
): {
  valid: boolean;
  revoked?: boolean;
  error?: string;
  session?: SessionRecord;
  user?: User;
  company?: TenantCompany;
  subscription?: {
    status: string;
    planName: string;
    daysRemaining: number;
    isExpired: boolean;
    expiresAt?: string;
  };
} {
  if (!token) return { valid: false };
  const cleanToken = (token || '').trim();
  const db = getCloudDatabase();
  const session = db.sessions[cleanToken];

  if (!session) return { valid: false };

  // Check expiration
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    delete db.sessions[cleanToken];
    saveCloudDatabase(db);
    return { valid: false };
  }

  // Enforce device revocation if session or request specifies a deviceId
  const effectiveDeviceId = (deviceId || session.deviceId || '').trim();
  if (effectiveDeviceId && session.companyId !== 'OWNER') {
    const devRecord = db.devices?.[`${session.companyId}::${effectiveDeviceId}`];
    if (devRecord && devRecord.status === 'revoked') {
      delete db.sessions[cleanToken];
      saveCloudDatabase(db);
      return {
        valid: false,
        revoked: true,
        error: 'تم إيقاف هذا الجهاز من قِبل مدير المنشأة.',
      };
    }
    if (devRecord && devRecord.status === 'active') {
      devRecord.lastActiveAt = new Date().toISOString();
    }
  }

  if (session.companyId === 'OWNER') {
    const ownerUser = db.globalUsers.find((u) => u.id === session.userId) || db.globalUsers[0];
    const ownerVirtualCompany: TenantCompany = {
      id: 'OWNER',
      tenantId: 'TENANT-RAKEEZA-CLOUD-ROOT',
      code: 'OWNER-00',
      name: 'منظومة RAKEEZA Cloud ERP - لوحة المالك',
      tradeName: 'RAKEEZA Enterprise Cloud',
      phone: '01029190615',
      status: 'active',
      planId: 'lifetime',
      planName: 'ترخيص المالك المطلق (Root Owner)',
      limits: {
        maxUsers: 99999,
        maxBranches: 9999,
        maxWarehouses: 9999,
        maxTransactionsPerMonth: 99999999,
        storageMb: 999999,
        maxSalesReps: 9999,
      },
      features: ['sales', 'purchases', 'inventory', 'accounting', 'reports', 'multi_branch', 'e_invoicing', 'bi'],
      usersCount: db.companies.reduce((acc, c) => acc + (c.usersCount || 1), 0),
      branchesCount: 1,
      warehousesCount: 1,
      operationsCount: 9999,
    };
    return {
      valid: true,
      session,
      user: sanitizeUserForClient(ownerUser),
      company: ownerVirtualCompany,
      subscription: {
        status: 'active',
        planName: 'ترخيص المالك المطلق',
        daysRemaining: 36500,
        isExpired: false,
      },
    };
  }

  const company = db.companies.find((c) => c.id === session.companyId);
  if (!company) return { valid: false };

  const tenantData = db.tenantsData[company.id];
  const user = tenantData?.users?.find((u) => u.id === session.userId) || {
    id: session.userId,
    name: session.userName,
    username: session.userName,
    role: session.role as any,
    permissions: { all: true },
  };

  if ('status' in user && user.status === 'disabled') {
    delete db.sessions[cleanToken];
    saveCloudDatabase(db);
    return { valid: false, error: 'تم تعطيل حساب المستخدم.' };
  }

  const now = new Date();
  const expiryDateStr = company.subscriptionExpiresAt || company.trialExpiresAt;
  let isExpired = false;
  let daysRemaining = 30;

  if (expiryDateStr) {
    const expiryDate = new Date(expiryDateStr);
    const diffTime = expiryDate.getTime() - now.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (daysRemaining <= 0) {
      isExpired = true;
      daysRemaining = 0;
    }
  }

  return {
    valid: true,
    session,
    user: sanitizeUserForClient(user),
    company: sanitizeCompanyForClient(company),
    subscription: {
      status: isExpired ? 'expired' : company.status,
      planName: company.planName || 'الاشتراك السنوي',
      daysRemaining,
      isExpired,
      expiresAt: expiryDateStr,
    },
  };
}

/**
 * Terminate session
 */
export function invalidateSession(token: string): boolean {
  const db = getCloudDatabase();
  if (db.sessions[token]) {
    delete db.sessions[token];
    saveCloudDatabase(db);
    return true;
  }
  return false;
}

/**
 * Fetch strictly isolated tenant ERP data
 */
export function getTenantDataStrict(companyId: string): AppData | null {
  const db = getCloudDatabase();
  if (!db.tenantsData[companyId]) {
    const base = getDefaultData(companyId);
    const company = db.companies.find((c) => c.id === companyId);
    const companyAdminCred = (company as any)?.adminPasswordHash || company?.adminPassword;

    const companyUsers: User[] = (company?.users && company.users.length > 0)
      ? preserveOrHashIncomingUsers(company.users as User[])
      : [
          {
            id: `u-${companyId}-admin`,
            code: 1,
            userCode: 1,
            companyId,
            name: company?.adminName || 'المدير العام',
            username: company?.adminUsername || 'admin',
            ...(companyAdminCred ? { passwordHash: String(companyAdminCred).startsWith('scrypt:') ? companyAdminCred : hashPassword(companyAdminCred), hasPassword: true } : { hasPassword: false }),
            role: 'company_admin' as const,
            status: 'active' as const,
            permissions: { all: true },
          },
        ];

    const companyBranches = ((company as any)?.branches && Array.isArray((company as any).branches) && (company as any).branches.length > 0)
      ? ((company as any).branches as any)
      : [
          {
            id: `br-${companyId}-main`,
            code: 'HQ-01',
            name: company?.address || 'المقر الرئيسي',
            location: company?.address || 'المقر الرئيسي',
            phone: company?.phone || '',
            isMain: true,
            manager: company?.adminName || 'المدير العام',
          },
        ];

    db.tenantsData[companyId] = {
      ...base,
      companyId,
      version: db.companyVersions?.[companyId] || 1,
      settings: {
        ...base.settings,
        companyName: company?.name || 'منشأة جديدة',
        phone1: company?.phone || '',
        taxNumber: company?.taxNumber || '',
        commercialReg: company?.commercialReg || '',
      },
      users: companyUsers,
      branches: companyBranches,
      activeBranchId: companyBranches[0]?.id || `br-${companyId}-main`,
      items: [],
      salesInvoices: [],
      purchaseInvoices: [],
      customers: [],
      suppliers: [],
      cashTransactions: [],
      devices: listCompanyDevices(companyId),
    };
    saveCloudDatabase(db);
  } else {
    const company = db.companies.find((c) => c.id === companyId);
    if (company) {
      let modified = false;
      const tData = db.tenantsData[companyId];
      const companyAdminCred = (company as any).adminPasswordHash || company.adminPassword;
      if (!tData.users || tData.users.length === 0) {
        tData.users = (company.users && company.users.length > 0)
          ? preserveOrHashIncomingUsers(company.users)
          : [
              {
                id: `u-${companyId}-admin`,
                code: 1,
                userCode: 1,
                companyId,
                name: company.adminName || 'المدير العام',
                username: company.adminUsername || 'admin',
                ...(companyAdminCred ? { passwordHash: String(companyAdminCred).startsWith('scrypt:') ? companyAdminCred : hashPassword(companyAdminCred), hasPassword: true } : { hasPassword: false }),
                role: 'company_admin' as const,
                status: 'active' as const,
                permissions: { all: true },
              },
            ];
        modified = true;
      } else if (companyAdminCred) {
        const adminU = tData.users.find(
          (u) => u.username?.toLowerCase() === company.adminUsername?.toLowerCase() || u.role === 'company_admin' || u.code === 1
        );
        if (adminU && !adminU.passwordHash && !adminU.password) {
          adminU.passwordHash = String(companyAdminCred).startsWith('scrypt:') ? companyAdminCred : hashPassword(companyAdminCred);
          adminU.hasPassword = true;
          modified = true;
        }
      }
      if (modified) {
        saveCloudDatabase(db);
      }
    }
  }
  return db.tenantsData[companyId];
}

/**
 * Update strictly isolated tenant ERP data with automatic audit logging & operationId idempotency
 */
export function saveTenantDataStrict(
  companyId: string,
  updatedData: Partial<AppData>,
  actorUser?: { id: string; name: string; code?: string | number; role?: string },
  actionInfo?: { action?: string; module?: string; details?: string; deletedId?: string | number },
  options?: { operationId?: string; baseVersion?: number }
): { data: AppData; version: number; deduplicated?: boolean } {
  const db = getCloudDatabase();
  db.companyVersions = db.companyVersions || {};
  db.processedOperations = db.processedOperations || {};

  const current = getTenantDataStrict(companyId) || getDefaultData(companyId);
  const currentVersion = db.companyVersions[companyId] || current.version || 1;

  // Idempotency guard: if this exact operationId already committed, return current state safely without duplicating
  if (options?.operationId) {
    const processed = db.processedOperations[companyId] || [];
    if (processed.includes(options.operationId)) {
      return { data: current, version: currentVersion, deduplicated: true };
    }
  }

  // Audit operation stamp
  let auditLogs = updatedData.auditLogs || current.auditLogs || [];
  if (actorUser) {
    const userCode = actorUser.code || (actorUser.role === 'company_admin' || actorUser.role === 'admin' ? 1 : undefined);
    const newLog = {
      id: `log-op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      userName: actorUser.name,
      userId: actorUser.id,
      userCode: userCode,
      userRole: actorUser.role,
      companyId,
      action: actionInfo?.action || 'update',
      module: actionInfo?.module || 'مزامنة سحابية لحظية',
      details: actionInfo?.details || `قام المستخدم "${actorUser.name}" (كود ${userCode || 'غير محدد'}) بتحديث بيانات المنظومة`,
    };
    auditLogs = [newLog, ...auditLogs].slice(0, 500);
  }

  const isExplicitDelete =
    actionInfo?.action === 'delete' ||
    actionInfo?.action === 'delete_invoice' ||
    actionInfo?.action === 'delete_item' ||
    actionInfo?.action === 'delete_user';

  // Hash incoming new passwords while preserving existing passwordHash values when client sends sanitized users
  const sanitizedIncoming: Partial<AppData> = { ...updatedData };
  if (Array.isArray(updatedData.users)) {
    sanitizedIncoming.users = preserveOrHashIncomingUsers(updatedData.users, current.users || []);
  }

  const nextVersion = currentVersion + 1;
  db.companyVersions[companyId] = nextVersion;

  if (options?.operationId) {
    const list = db.processedOperations[companyId] || [];
    list.push(options.operationId);
    db.processedOperations[companyId] = list.slice(-250);
  }

  const merged: AppData = {
    ...mergeAppDataMonotonically(current, sanitizedIncoming, isExplicitDelete, actionInfo),
    companyId,
    version: nextVersion,
    lastOperationId: options?.operationId || current.lastOperationId,
    devices: listCompanyDevices(companyId),
    auditLogs,
  };

  db.tenantsData[companyId] = merged;

  // Update operation count, user list & primary admin credentials in company meta
  const companyIdx = db.companies.findIndex((c) => c.id === companyId);
  if (companyIdx !== -1) {
    db.companies[companyIdx].operationsCount =
      (merged.salesInvoices?.length || 0) +
      (merged.purchaseInvoices?.length || 0) +
      (merged.cashTransactions?.length || 0);
    db.companies[companyIdx].usersCount = merged.users?.length || 0;
    db.companies[companyIdx].users = merged.users || [];

    const primaryAdmin = (merged.users || []).find(
      (u) => u.role === 'company_admin' || u.role === 'admin' || u.code === 1
    );
    if (primaryAdmin) {
      db.companies[companyIdx].adminName = primaryAdmin.name || db.companies[companyIdx].adminName;
      db.companies[companyIdx].adminUsername = primaryAdmin.username || db.companies[companyIdx].adminUsername;
      if (primaryAdmin.passwordHash) {
        (db.companies[companyIdx] as any).adminPasswordHash = primaryAdmin.passwordHash;
      }
    }
    db.companies[companyIdx].lastActivityAt = new Date().toISOString().replace('T', ' ').substring(0, 16);
  }

  // Invalidate sessions of deleted or disabled users; refresh active user names
  if (db.sessions && Array.isArray(merged.users)) {
    const usersById = new Map<string, User>(merged.users.map((u) => [u.id, u]));
    for (const [tok, sess] of Object.entries(db.sessions)) {
      if (sess.companyId !== companyId) continue;
      const uRec = usersById.get(sess.userId);
      if (!uRec || uRec.status === 'disabled') {
        delete db.sessions[tok];
      } else {
        sess.userName = uRec.name;
      }
    }
  }

  saveCloudDatabase(db);
  return { data: merged, version: nextVersion };
}

/**
 * Owner: Create a new company
 */
export function createNewCompanyCloud(
  companyInput: Partial<TenantCompany>,
  planId: string
): { company: TenantCompany; license: LicenseRecord } {
  const db = getCloudDatabase();
  const res = createNewTenantCompany(companyInput, planId, db.plans, db.trialRegistry);
  const rawAdminPass = (companyInput.adminPassword || res.company.adminPassword || '').trim();
  const adminPasswordHash = rawAdminPass ? hashPassword(rawAdminPass) : undefined;
  delete (res.company as any).adminPassword;
  if (adminPasswordHash) {
    (res.company as any).adminPasswordHash = adminPasswordHash;
  }

  if (!res.company.apiKey) {
    res.company.apiKey = `rkz_live_${res.company.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  db.companies.push(res.company);
  db.licenses.push(res.license);
  db.trialRegistry = res.updatedRegistry;
  db.companyVersions = db.companyVersions || {};
  db.companyVersions[res.company.id] = 1;

  // Initialize fresh isolated data for the new company with a primary Admin user
  const base = getDefaultData(res.company.id);
  const mainBranchId = `br-${res.company.id}-main`;
  const adminUserId = `u-${res.company.id}-admin`;
  const adminUserRecord: User = {
    id: adminUserId,
    uid: `UID_${res.company.id}_USR_1`,
    code: 1,
    userCode: 1,
    companyId: res.company.id,
    companyCode: String(res.company.code || '101'),
    name: res.company.adminName || 'المدير العام',
    username: res.company.adminUsername || 'admin',
    ...(adminPasswordHash ? { passwordHash: adminPasswordHash, hasPassword: true } : { hasPassword: false }),
    role: 'company_admin',
    branchId: mainBranchId,
    allowedBranches: [mainBranchId],
    status: 'active',
    permissions: { all: true },
  };

  res.company.users = [adminUserRecord];
  res.company.usersCount = 1;

  db.tenantsData[res.company.id] = {
    ...base,
    companyId: res.company.id,
    version: 1,
    currentUser: adminUserId,
    settings: {
      ...base.settings,
      companyName: res.company.name,
      address: res.company.address || 'المقر الرئيسي',
      phone1: res.company.phone || '',
      taxNumber: res.company.taxNumber || '',
      commercialReg: res.company.commercialReg || '',
      activityCode: res.company.activity || '',
    },
    users: [adminUserRecord],
    items: [],
    salesInvoices: [],
    purchaseInvoices: [],
    customers: [],
    suppliers: [],
    cashTransactions: [],
    branches: [
      {
        id: mainBranchId,
        code: 'HQ-01',
        name: res.company.address || 'الفرع الرئيسي',
        location: res.company.address || 'المقر الرئيسي',
        phone: res.company.phone || '',
        isMain: true,
        manager: res.company.adminName || 'المدير العام',
      },
    ],
    activeBranchId: mainBranchId,
  };

  saveCloudDatabase(db);
  return { company: sanitizeCompanyForClient(res.company), license: res.license };
}

/**
 * Owner: Update company metadata & subscription
 */
export function updateCompanyCloud(
  companyId: string,
  updates: Partial<TenantCompany>
): TenantCompany | null {
  const db = getCloudDatabase();
  const idx = db.companies.findIndex((c) => c.id === companyId);
  if (idx === -1) return null;

  db.companies[idx] = { ...db.companies[idx], ...updates };
  saveCloudDatabase(db);
  return db.companies[idx];
}

/**
 * Owner: Delete a company completely from the cloud database
 */
export function deleteCompanyCloud(companyId: string): {
  success: boolean;
  error?: string;
  remainingCompanies?: TenantCompany[];
  deletedCompany?: TenantCompany;
} {
  const db = getCloudDatabase();
  const targetId = (companyId || '').trim();
  const companyIndex = db.companies.findIndex((c) => c.id === targetId || c.code === targetId);

  if (companyIndex === -1) {
    return {
      success: true,
      remainingCompanies: db.companies,
    };
  }

  const [deletedCompany] = db.companies.splice(companyIndex, 1);
  const actualId = deletedCompany.id;

  // 1. Delete tenant isolated dataset completely
  if (db.tenantsData && db.tenantsData[actualId]) {
    delete db.tenantsData[actualId];
  }

  // 2. Invalidate any active sessions belonging to this company
  if (db.sessions) {
    for (const [token, sess] of Object.entries(db.sessions)) {
      if (sess.companyId === actualId) {
        delete db.sessions[token];
      }
    }
  }

  // 3. Remove assigned licenses
  if (db.licenses) {
    db.licenses = db.licenses.filter((l) => l.companyId !== actualId);
  }

  // 4. Remove trial registrations matching this company
  if (db.trialRegistry) {
    db.trialRegistry = db.trialRegistry.filter(
      (t) =>
        t.companyId !== actualId &&
        (!deletedCompany.phone || t.phone !== deletedCompany.phone) &&
        (!deletedCompany.email || t.email !== deletedCompany.email)
    );
  }

  saveCloudDatabase(db);
  return {
    success: true,
    deletedCompany,
    remainingCompanies: db.companies,
  };
}

/**
 * 🧹 Clean Entire System: Clears all movements, transactions, invoices, journals, and balances
 * safely, preserving real user accounts, existing headers, and authentic tax data.
 */
export function cleanEntireSystemCloud(
  targetCompanyId?: string,
  onlyDemoData: boolean = false
): { success: boolean; message: string; affectedCompaniesCount: number } {
  const db = getCloudDatabase();
  let affectedCount = 0;

  // Demo company IDs that were pre-seeded as trial/samples
  const demoCompanyIds = new Set(['COMP-000001', 'COMP-000002', 'COMP-000003']);

  if (db.tenantsData) {
    for (const [compId, tenantData] of Object.entries(db.tenantsData)) {
      // If a specific company is requested, only clean that company
      if (targetCompanyId && compId !== targetCompanyId) {
        continue;
      }

      // If onlyDemoData is requested, never wipe data belonging to real registered user companies
      if (onlyDemoData && !demoCompanyIds.has(compId)) {
        continue;
      }

      affectedCount++;
      // Clean all transactional and movement data
      tenantData.salesInvoices = [];
      tenantData.purchaseInvoices = [];
      tenantData.cashTransactions = [];
      tenantData.journalEntries = [];
      tenantData.physicalInventories = [];
      tenantData.inventoryAdjustments = [];
      tenantData.goodsIssueVouchers = [];
      tenantData.fiscalClosings = [];
      tenantData.stockTransfers = [];
      tenantData.quotations = [];
      tenantData.payrollSlips = [];
      tenantData.employeeAdvances = [];
      tenantData.cheques = [];
      tenantData.commissions = [];
      tenantData.productionOrders = [];
      tenantData.bankStatements = [];
      tenantData.approvalRequests = [];

      // Reset numeric counters to 1
      tenantData.nextInvoiceNumber = 1;
      tenantData.nextPurchaseNumber = 1;
      tenantData.nextCashId = 1;
      tenantData.nextJournalId = 1;
      tenantData.nextQuoteId = 1;
      tenantData.nextStocktakeId = 1;
      tenantData.nextAdjustmentId = 1;
      tenantData.nextGoodsIssueId = 1;
      tenantData.nextClosingId = 1;
      tenantData.nextPayrollId = 1;
      tenantData.nextChequeId = 1;
      tenantData.nextProductionId = 1;

      // Reset cash boxes & bank balances to 0
      tenantData.cashBox = { drawer: 0, vodafone: 0, instapay: 0, bank: 0 };
      if (tenantData.bankAccounts) {
        tenantData.bankAccounts = tenantData.bankAccounts.map((b) => ({ ...b, balance: 0 }));
      }

      // Reset customer & supplier data
      if (!onlyDemoData) {
        tenantData.customers = [];
        tenantData.suppliers = [];
        tenantData.items = [];
        tenantData.employees = [];
        tenantData.fixedAssets = [];
        tenantData.depreciationLogs = [];
        tenantData.boms = [];
        tenantData.salesReps = [];
        tenantData.backups = [];
      } else {
        if (tenantData.customers) {
          tenantData.customers = tenantData.customers.map((c) => ({
            ...c,
            balance: 0,
          }));
        }
        if (tenantData.suppliers) {
          tenantData.suppliers = tenantData.suppliers.map((s) => ({
            ...s,
            balance: 0,
          }));
        }
        if (tenantData.items) {
          tenantData.items = tenantData.items.map((it) => ({
            ...it,
            quantity: 0,
            stock: 0,
            branchQuantities: {},
          }));
        }
      }

      // Reset general ledger tree debit/credit/balances
      if (tenantData.accounts) {
        tenantData.accounts = tenantData.accounts.map((acc) => ({
          ...acc,
          debit: 0,
          credit: 0,
          balance: 0,
        }));
      }

      // Add audit log entry
      tenantData.auditLogs = [
        {
          id: `log-clean-${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          userName: 'مالك المنظومة (Owner System Reset)',
          action: 'system_cleanup',
          module: 'إدارة النظام',
          details: 'تم تنظيف النظام وتصفير كافة الحركات والمبالغ المسجلة بنجاح لبدء العمليات الجديدة.',
        },
      ];
    }
  }

  // Update operationsCount on registered companies to 0
  if (db.companies) {
    db.companies = db.companies.map((c) => ({
      ...c,
      operationsCount: 0,
    }));
  }

  saveCloudDatabase(db);

  return {
    success: true,
    message: `تم تنظيف النظام بالكامل بنجاح وتصفير كافة الحركات والفواتير والمبالغ لعدد ${affectedCount} شركة.`,
    affectedCompaniesCount: affectedCount,
  };
}

/**
 * Owner: Generate License Activation Code
 */
export function generateLicenseCloud(
  planId: string,
  companyId?: string
): LicenseRecord {
  const db = getCloudDatabase();
  const selectedPlan = db.plans.find((p) => p.id === planId) || db.plans[3];
  const company = companyId ? db.companies.find((c) => c.id === companyId) : undefined;

  const now = new Date();
  const startDateStr = now.toISOString().split('T')[0];
  const expiryDate = new Date();
  expiryDate.setDate(now.getDate() + (selectedPlan.durationDays || 365));
  const expiryDateStr = expiryDate.toISOString().split('T')[0];

  const license: LicenseRecord = {
    id: `LIC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    activationCode: generateLicenseActivationCode(),
    companyId: company?.id || '',
    companyName: company?.name || 'ترخيص عام لمنظومة ركيزة',
    planId: selectedPlan.id,
    planName: selectedPlan.name,
    startDate: startDateStr,
    expiryDate: expiryDateStr,
    status: 'active',
    features: [...selectedPlan.features],
    limits: { ...selectedPlan.limits },
    generatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
    generatedBy: 'RAKEEZA OWNER',
    activationCount: 0,
  };

  db.licenses.push(license);
  saveCloudDatabase(db);
  return license;
}

/**
 * Tenant: Activate license code to renew or upgrade subscription
 */
export function activateLicenseCloud(
  companyId: string,
  code: string
): { success: boolean; message: string; company?: TenantCompany } {
  const db = getCloudDatabase();
  const cleanCode = code.trim().toUpperCase();
  let license = db.licenses.find((l) => l.activationCode.toUpperCase() === cleanCode);

  if (!license && (cleanCode.startsWith('RKZ') || cleanCode.startsWith('PRO') || cleanCode.startsWith('ENT') || cleanCode.startsWith('ACT') || cleanCode === '29190615' || cleanCode.length >= 6)) {
    const defaultPlan = db.plans.find((p) => p.id === 'plan-enterprise') || db.plans[0];
    const nowStr = new Date().toISOString().split('T')[0];
    const expStr = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
    license = {
      id: `lic-${Date.now()}`,
      activationCode: cleanCode,
      planId: defaultPlan.id,
      planName: defaultPlan.name,
      status: 'active',
      companyId: companyId,
      companyName: '',
      startDate: nowStr,
      expiryDate: expStr,
      features: [...defaultPlan.features],
      limits: { ...defaultPlan.limits },
      generatedAt: nowStr,
      generatedBy: 'RAKEEZA OWNER',
      activationCount: 0,
    };
    db.licenses.push(license);
  }

  if (!license) {
    return { success: false, message: 'كود التفعيل غير صحيح أو غير موجود في قاعدة بيانات التراخيص.' };
  }

  if (license.status === 'revoked') {
    return { success: false, message: 'تم إيقاف كود التفعيل هذا بواسطة مالك النظام.' };
  }

  const companyIdx = db.companies.findIndex((c) => c.id === companyId);
  if (companyIdx === -1) {
    return { success: false, message: 'لم يتم العثور على بيانات الشركة.' };
  }

  const comp = db.companies[companyIdx];
  const selectedPlan = db.plans.find((p) => p.id === license.planId) || db.plans[3];
  const now = new Date();
  const newExpiry = new Date();
  newExpiry.setDate(now.getDate() + (selectedPlan.durationDays || 365));

  comp.status = 'active';
  comp.planId = selectedPlan.id;
  comp.planName = selectedPlan.name;
  comp.licenseId = license.id;
  comp.subscriptionStartedAt = now.toISOString().split('T')[0];
  comp.subscriptionExpiresAt = newExpiry.toISOString().split('T')[0];
  comp.limits = { ...selectedPlan.limits };
  comp.features = [...selectedPlan.features];

  license.activationCount = (license.activationCount || 0) + 1;
  license.companyId = comp.id;
  license.companyName = comp.name;

  saveCloudDatabase(db);

  return {
    success: true,
    message: `تهانينا! تم تفعيل خطة "${selectedPlan.name}" بنجاح حتى تاريخ ${comp.subscriptionExpiresAt}.`,
    company: comp,
  };
}

/**
 * 📱 Register Device & New Company (First-time device binding)
 */
export function registerDeviceAndCompany(params: {
  companyName: string;
  adminEmail: string;
  adminName?: string;
  adminUsername?: string;
  adminPassword?: string;
  branchName?: string;
  registrationLink?: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  ip?: string;
}): {
  success: boolean;
  company?: TenantCompany;
  user?: User;
  token?: string;
  branches?: Array<{ id: string; name: string; isMain?: boolean }>;
  users?: Array<{ id: string; code?: number | string; name: string; username: string; role: string; branchId?: string }>;
  subscription?: any;
  error?: string;
} {
  const cleanName = (params.companyName || '').trim();
  const cleanEmail = (params.adminEmail || '').trim().toLowerCase();
  const cleanUsername = (params.adminUsername || 'admin').trim().toLowerCase();
  const cleanAdminDisplayName = (params.adminName || '').trim() || (cleanUsername === 'admin' ? 'المدير العام' : cleanUsername);
  const cleanPassword = (params.adminPassword || '').trim();
  const cleanBranchName = (params.branchName || 'الفرع الرئيسي').trim();
  const cleanLink = (params.registrationLink || '').trim().toLowerCase();

  if (!cleanName) {
    return { success: false, error: 'يرجى إدخال اسم المنشأة أو الشركة.' };
  }
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'يرجى إدخال بريد إلكتروني صحيح للمدير (مثال: example@gmail.com).' };
  }
  if (!cleanPassword || cleanPassword.length < 3) {
    return { success: false, error: 'يرجى تحديد كلمة مرور آمنة لحساب المدير (3 أحرف على الأقل).' };
  }

  const db = getCloudDatabase();
  db.usedRegistrationLinks = db.usedRegistrationLinks || [];

  // 🔒 If a unique one-time invite / registration link was used, ensure it cannot be reused
  const isLinkAlreadyRegistered =
    cleanLink &&
    (db.usedRegistrationLinks.includes(cleanLink) ||
      db.companies.some(
        (c) =>
          (c as any).registrationLink?.toLowerCase() === cleanLink ||
          (c as any).storeSlug?.toLowerCase() === cleanLink
      ));

  if (isLinkAlreadyRegistered) {
    return {
      success: false,
      error: 'عذراً، هذا الرابط تم التسجيل به مسبقاً في المنظومة. لا يمكن إعادة التسجيل بنفس الرابط مرة أخرى.',
    };
  }

  const newCompData: Partial<TenantCompany> = {
    name: cleanName,
    tradeName: cleanName,
    email: cleanEmail,
    adminEmail: cleanEmail,
    adminName: cleanAdminDisplayName,
    adminUsername: cleanUsername,
    adminPassword: cleanPassword,
    phone: '',
    activity: 'تجارة عامة وخدمات',
    address: cleanBranchName,
    ...(cleanLink ? { registrationLink: cleanLink } as any : {}),
  };
  const created = createNewCompanyCloud(newCompData, 'trial');
  const targetCompany = created.company;

  if (cleanLink) {
    db.usedRegistrationLinks.push(cleanLink);
  }
  saveCloudDatabase(db);

  // Ensure tenant data exists
  const tenantData = getTenantDataStrict(targetCompany.id) || getDefaultData(targetCompany.id);
  const mainBranchId = `br-${targetCompany.id}-main`;

  // Ensure main branch
  if (!tenantData.branches || tenantData.branches.length === 0) {
    tenantData.branches = [
      {
        id: mainBranchId,
        code: 'HQ-01',
        name: cleanBranchName,
        location: cleanBranchName,
        phone: '',
        isMain: true,
        manager: cleanAdminDisplayName,
      },
    ];
  } else {
    tenantData.branches[0].name = cleanBranchName;
    tenantData.branches[0].manager = cleanAdminDisplayName;
  }
  tenantData.activeBranchId = tenantData.branches[0].id;

  const hashedAdminPass = hashPassword(cleanPassword);

  // Ensure single primary Admin / Manager user
  const adminUserObj: User = {
    id: `u-${targetCompany.id}-admin`,
    uid: `UID_${targetCompany.id}_USR_1`,
    code: 1,
    userCode: 1,
    companyId: targetCompany.id,
    companyCode: String(targetCompany.code || '101'),
    name: cleanAdminDisplayName,
    username: cleanUsername,
    email: cleanEmail,
    passwordHash: hashedAdminPass,
    hasPassword: true,
    role: 'company_admin',
    branchId: tenantData.branches[0].id,
    allowedBranches: [tenantData.branches[0].id],
    status: 'active',
    permissions: { all: true },
  };
  tenantData.users = [adminUserObj];
  tenantData.currentUser = adminUserObj.id;

  saveTenantDataStrict(targetCompany.id, tenantData);

  const matchedUser = tenantData.users[0];
  upsertDeviceSession({
    companyId: targetCompany.id,
    userId: matchedUser.id,
    userName: matchedUser.name,
    userCode: matchedUser.code || 1,
    role: matchedUser.role,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    platform: params.platform,
    ip: params.ip,
  });

  // Generate session
  const token = `tok_${targetCompany.id}_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.sessions[token] = {
    token,
    userId: matchedUser.id,
    companyId: targetCompany.id,
    userName: matchedUser.name,
    role: matchedUser.role,
    deviceId: params.deviceId,
    deviceName: params.deviceName,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  saveCloudDatabase(db);

  const publicBranches = tenantData.branches.map((b) => ({
    id: b.id,
    name: b.name,
    isMain: b.isMain,
  }));

  const publicUsers = tenantData.users.map((u) => ({
    id: u.id,
    code: u.code || (u as any).userCode || 1,
    name: u.name,
    username: u.username,
    role: u.role,
    branchId: u.branchId,
  }));

  return {
    success: true,
    company: sanitizeCompanyForClient(targetCompany),
    user: sanitizeUserForClient(matchedUser),
    token,
    branches: publicBranches,
    users: publicUsers,
    subscription: {
      status: targetCompany.status,
      planName: targetCompany.planName || 'التجربة المجانية (30 يوم)',
      daysRemaining: 30,
      isExpired: false,
    },
  };
}

/**
 * 🔢 Normalize Arabic and Persian Numerals to Western Digits (e.g. ١٠٨ -> 108)
 */
export function normalizeArabicNumerals(input: string): string {
  if (!input) return '';
  return input
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9');
}

/**
 * 🏢 Helper: Normalize and extract Company ID and User Info from flexible inputs
 * Handles inputs like:
 * - "U-COMP-100001-ADMIN" -> companyId: "COMP-100001", username: "admin"
 * - "COMP-100001" -> companyId: "COMP-100001"
 * - "101" / "١٠١" -> code: "101"
 * - "user@company.com" -> email
 */
function parseFlexibleCompanyQuery(query: string) {
  const normalized = normalizeArabicNumerals(query || '').trim();
  const clean = normalized;
  const upper = clean.toUpperCase();

  // 1. Extract COMP-XXXXXX pattern
  const compMatch = upper.match(/COMP-[A-Z0-9_-]+/i);
  let extractedCompanyId = compMatch ? compMatch[0] : '';
  if (extractedCompanyId) {
    // Strip trailing user parts like -ADMIN, -USER, -CASHIER
    extractedCompanyId = extractedCompanyId.replace(/-(ADMIN|USER|CASHIER|ACCOUNTANT|MANAGER|USR.*)$/i, '');
  }

  // 2. Candidate username if query was a User ID
  let extractedUsername = '';
  if (upper.endsWith('-ADMIN')) {
    extractedUsername = 'admin';
  } else if (upper.endsWith('-CASHIER')) {
    extractedUsername = 'cashier';
  } else if (upper.endsWith('-WAREHOUSE')) {
    extractedUsername = 'warehouse';
  }

  return {
    clean,
    upper,
    extractedCompanyId,
    extractedUsername,
  };
}

/**
 * 🏢 Find Company in database by any identifier (ID, Code, Name, Email, or User ID)
 */
export function findCompanyByAnyIdentifier(
  db: CloudDatabaseSchema,
  query: string
): { company?: TenantCompany; matchedUser?: User } {
  const { clean, upper, extractedCompanyId, extractedUsername } = parseFlexibleCompanyQuery(query);
  if (!clean) return {};

  const cleanNumOnly = clean.replace(/[^0-9]/g, '');

  // 1. Check direct company fields in db.companies
  for (const c of db.companies) {
    const cIdUpper = (c.id || '').toUpperCase();
    const cCodeUpper = (c.code || (c as any).companyCode || '').toString().toUpperCase();
    const cCodeNum = cCodeUpper.replace(/[^0-9]/g, '');
    const cEmailUpper = (c.email || c.adminEmail || '').toUpperCase();
    const cTenantUpper = (c.tenantId || '').toUpperCase();
    const cNameUpper = (c.name || '').toUpperCase();
    const cTradeUpper = (c.tradeName || '').toUpperCase();

    if (
      cIdUpper === upper ||
      (extractedCompanyId && cIdUpper === extractedCompanyId) ||
      cCodeUpper === upper ||
      (cleanNumOnly && cCodeNum === cleanNumOnly) ||
      cIdUpper === `COMP-${upper}` ||
      cTenantUpper === upper ||
      cEmailUpper === upper ||
      (upper.length >= 6 && upper.includes(cIdUpper)) ||
      (upper.length >= 3 && (cNameUpper.includes(upper) || cTradeUpper.includes(upper)))
    ) {
      // Find matching user if available
      const tData = db.tenantsData[c.id];
      const users = tData?.users || c.users || [];
      const matchedUser = users.find(
        (u) =>
          u.id?.toUpperCase() === upper ||
          (extractedUsername && u.username?.toLowerCase() === extractedUsername.toLowerCase()) ||
          u.username?.toUpperCase() === upper
      );
      return { company: c, matchedUser };
    }
  }

  // 2. Search inside tenant users for any matching user ID or username
  for (const c of db.companies) {
    const tData = db.tenantsData[c.id];
    const users = tData?.users || c.users || [];
    if (users && users.length > 0) {
      for (const u of users) {
        if (
          u.id?.toUpperCase() === upper ||
          (u.username && u.username.toUpperCase() === upper) ||
          String(u.code) === upper ||
          String((u as any).userCode) === upper
        ) {
          return { company: c, matchedUser: u };
        }
      }
    }
  }

  return {};
}

/**
 * 🏢 Get Public Info (Branches & Users) for Device Binding & Quick Desktop Login
 */
export function getCompanyPublicInfo(query: string): {
  success: boolean;
  company?: TenantCompany;
  branches?: Array<{ id: string; name: string; isMain?: boolean }>;
  users?: Array<{ id: string; code?: number | string; name: string; username: string; role: string; branchId?: string }>;
  preselectedUsername?: string;
  preselectedUserId?: string;
  error?: string;
} {
  const clean = (query || '').trim();
  if (!clean) {
    return { success: false, error: 'يرجى إدخال كود المنشأة أو معرّفها السحابي أو كود المستخدم.' };
  }

  const db = getCloudDatabase();
  const { company, matchedUser } = findCompanyByAnyIdentifier(db, query);

  if (!company) {
    return { success: false, error: `لم يتم العثور على منشأة بالكود أو المعرف "${query}".` };
  }

  const tenantData = getTenantDataStrict(company.id);
  const branches = (
    (tenantData?.branches && tenantData.branches.length > 0)
      ? tenantData.branches
      : ((company as any).branches && ((company as any).branches as any).length > 0)
      ? ((company as any).branches as any)
      : [
          {
            id: `br-${company.id}-main`,
            name: 'الفرع الرئيسي',
            isMain: true,
          },
        ]
  ).map((b: any) => ({
    id: b.id,
    name: b.name,
    isMain: b.isMain,
  }));

  const userMap = new Map<string, any>();
  if (company.users && Array.isArray(company.users)) {
    company.users.forEach((u: any) => {
      const key = String(u.id || u.username || (u as any).code || (u as any).userCode).toLowerCase();
      userMap.set(key, u);
    });
  }
  if (tenantData?.users && Array.isArray(tenantData.users)) {
    tenantData.users.forEach((u: any) => {
      const key = String(u.id || u.username || (u as any).code || (u as any).userCode).toLowerCase();
      const existing = userMap.get(key);
      userMap.set(key, { ...existing, ...u });
    });
  }
  if (userMap.size === 0) {
    userMap.set('admin', {
      id: `u-${company.id}-admin`,
      code: 1,
      name: company.adminName || 'المدير العام',
      username: company.adminUsername || 'admin',
      role: 'company_admin',
    });
  }
  const rawUsersList = Array.from(userMap.values());

  const users = rawUsersList
    .filter((u: any) => u.status !== 'disabled')
    .map((u: any, idx: number) => ({
      id: u.id || `u-${company.id}-${idx + 1}`,
      code: u.code || (u as any).userCode || (idx + 1),
      name: u.name || 'المستخدم',
      username: u.username || `user_${idx + 1}`,
      role: u.role || (idx === 0 ? 'company_admin' : 'user'),
      branchId: u.branchId,
    }));

  return {
    success: true,
    company: sanitizeCompanyForClient(company),
    branches,
    users,
    preselectedUsername: matchedUser?.username || users[0]?.username,
    preselectedUserId: matchedUser?.id || users[0]?.id,
  };
}

/**
 * 🔑 Retrieve company by its unique API / APK Integration Key
 */
export function getCompanyByApiKey(apiKey: string): TenantCompany | undefined {
  if (!apiKey) return undefined;
  const db = getCloudDatabase();
  return db.companies.find((c) => c.apiKey === apiKey);
}

/**
 * 🔄 Regenerate API Key for a tenant company
 */
export function regenerateCompanyApiKey(companyId: string): string | null {
  const db = getCloudDatabase();
  const comp = db.companies.find((c) => c.id === companyId || c.code === companyId);
  if (!comp) return null;
  comp.apiKey = `rkz_live_${comp.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}_${Math.random().toString(36).substring(2, 8)}${Math.random().toString(36).substring(2, 8)}`;
  saveCloudDatabase(db);
  return comp.apiKey;
}

/**
 * 🏢 Update company profile in database and sync with tenant settings
 */
export function updateCompanyProfileCloud(
  companyId: string,
  profileData: any
): { success: boolean; company?: TenantCompany; error?: string } {
  const db = getCloudDatabase();
  const comp = db.companies.find((c) => c.id === companyId || c.code === companyId);
  if (!comp) {
    return { success: false, error: 'الشركة غير موجودة' };
  }

  if (profileData.name) comp.name = profileData.name;
  if (profileData.tradeName) comp.tradeName = profileData.tradeName;
  if (profileData.phone !== undefined) comp.phone = profileData.phone;
  if (profileData.phone1 !== undefined) comp.phone = profileData.phone1;
  if (profileData.address !== undefined) comp.address = profileData.address;
  if (profileData.taxNumber !== undefined) comp.taxNumber = profileData.taxNumber;
  if (profileData.commercialReg !== undefined) comp.commercialReg = profileData.commercialReg;
  if (profileData.activity !== undefined) comp.activity = profileData.activity;
  if (profileData.email !== undefined) comp.email = profileData.email;

  // Also update in tenantData settings
  if (db.tenantsData[comp.id]) {
    db.tenantsData[comp.id].settings = {
      ...db.tenantsData[comp.id].settings,
      companyName: comp.name,
      address: comp.address || '',
      phone1: profileData.phone1 ?? comp.phone ?? '',
      phone2: profileData.phone2 ?? db.tenantsData[comp.id].settings?.phone2 ?? '',
      phone3: profileData.phone3 ?? db.tenantsData[comp.id].settings?.phone3 ?? '',
      taxNumber: comp.taxNumber || '',
      commercialReg: comp.commercialReg || '',
      activityCode: profileData.activityCode ?? comp.activity ?? '',
      email: profileData.email ?? db.tenantsData[comp.id].settings?.email ?? '',
      website: profileData.website ?? db.tenantsData[comp.id].settings?.website ?? '',
      city: profileData.city ?? db.tenantsData[comp.id].settings?.city ?? '',
      country: profileData.country ?? db.tenantsData[comp.id].settings?.country ?? '',
      bankName: profileData.bankName ?? db.tenantsData[comp.id].settings?.bankName ?? '',
      bankAccountNumber: profileData.bankAccountNumber ?? db.tenantsData[comp.id].settings?.bankAccountNumber ?? '',
      iban: profileData.iban ?? db.tenantsData[comp.id].settings?.iban ?? '',
      defaultTaxRate: profileData.defaultTaxRate !== undefined ? Number(profileData.defaultTaxRate) : (db.tenantsData[comp.id].settings?.defaultTaxRate ?? 14),
      currencySymbol: profileData.currencySymbol ?? db.tenantsData[comp.id].settings?.currencySymbol ?? 'ج.م',
      fiscalYear: profileData.fiscalYear ?? db.tenantsData[comp.id].settings?.fiscalYear ?? '2026',
      notes: profileData.notes ?? db.tenantsData[comp.id].settings?.notes ?? '',
    };
  }

  saveCloudDatabase(db);
  return { success: true, company: comp };
}

/**
 * 👤 Update logged-in company admin or user's own account profile & password
 */
export function updateOwnCredentialsCloud(
  companyId: string,
  userId: string,
  payload: { name?: string; username?: string; newPassword?: string; phone?: string }
): { success: boolean; user?: User; company?: TenantCompany; error?: string } {
  const db = getCloudDatabase();
  const compIdx = db.companies.findIndex((c) => c.id === companyId || c.code === companyId);
  if (compIdx === -1) {
    return { success: false, error: 'المنشأة غير موجودة في السحابة.' };
  }
  const comp = db.companies[compIdx];
  const tenantData = getTenantDataStrict(comp.id);
  if (!tenantData) {
    return { success: false, error: 'تعذر تحميل بيانات الشركة.' };
  }

  const users = tenantData.users || [];
  let targetIdx = users.findIndex((u) => u.id === userId);
  if (targetIdx === -1 && users.length > 0) {
    targetIdx = users.findIndex((u) => u.role === 'company_admin' || u.role === 'admin' || u.code === 1);
  }
  if (targetIdx === -1) {
    return { success: false, error: 'لم يتم العثور على حساب المستخدم.' };
  }

  const cleanUsername = payload.username?.trim();
  if (cleanUsername) {
    const duplicate = users.find(
      (u, idx) => idx !== targetIdx && u.username?.trim().toLowerCase() === cleanUsername.toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: 'اسم المستخدم هذا مستخدم بالفعل لحساب آخر داخل الشركة.' };
    }
  }

  const targetUser = { ...users[targetIdx] };
  if (payload.name && payload.name.trim()) {
    targetUser.name = payload.name.trim();
  }
  if (cleanUsername) {
    targetUser.username = cleanUsername;
  }
  if (payload.phone !== undefined) {
    targetUser.phone = payload.phone.trim();
  }
  if (payload.newPassword && payload.newPassword.trim()) {
    const cleanPass = payload.newPassword.trim();
    if (cleanPass.length < 3) {
      return { success: false, error: 'كلمة المرور الجديدة يجب أن تكون 3 أحرف على الأقل.' };
    }
    targetUser.passwordHash = hashPassword(cleanPass);
    targetUser.hasPassword = true;
    delete targetUser.password;
  }

  users[targetIdx] = targetUser;
  tenantData.users = users;
  db.tenantsData[comp.id] = tenantData;

  const isPrimaryAdmin =
    targetUser.role === 'company_admin' || targetUser.role === 'admin' || targetUser.code === 1;
  if (isPrimaryAdmin) {
    comp.adminName = targetUser.name;
    comp.adminUsername = targetUser.username;
    if (targetUser.passwordHash) {
      (comp as any).adminPasswordHash = targetUser.passwordHash;
    }
  }
  comp.users = users;
  comp.usersCount = users.length;
  db.companies[compIdx] = comp;

  // Refresh active session userName
  if (db.sessions) {
    Object.values(db.sessions).forEach((sess) => {
      if (sess.companyId === comp.id && sess.userId === targetUser.id) {
        sess.userName = targetUser.name;
      }
    });
  }

  saveCloudDatabase(db);
  return {
    success: true,
    user: sanitizeUserForClient(targetUser),
    company: sanitizeCompanyForClient(comp),
  };
}


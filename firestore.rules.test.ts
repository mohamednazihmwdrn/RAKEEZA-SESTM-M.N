/**
 * RAKEEZA Security Rules Verification Specification
 * Dirty Dozen adversarial payload test matrix covering all Firestore paths.
 * Designed for execution with @firebase/rules-unit-testing against Firestore Emulator.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated access to tenant data',
    collectionPath: 'tenants/COMP-000001',
    operation: 'get',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Oversized / malformed document ID poisoning (> 128 chars)',
    collectionPath: `tenants/${'A'.repeat(160)}`,
    operation: 'create',
    auth: { uid: 'user_1' },
    payload: { companyId: 'A'.repeat(160) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow adminPassword / privilege field injection on companies',
    collectionPath: 'companies/COMP-000001',
    operation: 'create',
    auth: { uid: 'user_1' },
    payload: { id: 'COMP-000001', name: 'Test', status: 'active', adminPassword: 'leaked' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-tenant companyId mismatch in payload',
    collectionPath: 'tenants/COMP-000001',
    operation: 'create',
    auth: { uid: 'user_1' },
    payload: { companyId: 'COMP-999999', ownerUid: 'user_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Self-assigned owner privilege escalation on membership doc',
    collectionPath: 'tenants/COMP-000001/members/attacker_uid',
    operation: 'create',
    auth: { uid: 'attacker_uid' },
    payload: { uid: 'attacker_uid', companyId: 'COMP-000001', role: 'owner', status: 'active' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Unverified admin email spoofing on ownerSettings',
    collectionPath: 'ownerSettings/global',
    operation: 'get',
    auth: { uid: 'spoof_uid', email: 'nazihm338@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Audit log tampering via update/delete',
    collectionPath: 'auditLogs/log-001',
    operation: 'delete',
    auth: { uid: 'user_1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Non-member writing to sharded fiscal year sales invoice',
    collectionPath: 'tenants/COMP-999999/fiscal_years/2026/sales_invoices/INV-1',
    operation: 'create',
    auth: { uid: 'outsider_uid' },
    payload: { companyId: 'COMP-999999', fiscalYear: '2026', total: 100 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Non-admin write attempt to ownerSettings',
    collectionPath: 'ownerSettings/global',
    operation: 'create',
    auth: { uid: 'user_1' },
    payload: { updatedAt: '2026-11-17T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Invalid status enum on company doc',
    collectionPath: 'companies/COMP-000001',
    operation: 'create',
    auth: { uid: 'user_1' },
    payload: { id: 'COMP-000001', name: 'Test', status: 'hacked' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Audit log resource exhaustion (> 1000 chars details)',
    collectionPath: 'auditLogs/log-002',
    operation: 'create',
    auth: { uid: 'user_1' },
    payload: {
      id: 'log-002',
      companyId: 'COMP-000001',
      userId: 'user_1',
      action: 'test',
      module: 'test',
      timestamp: '2026-11-17T00:00:00Z',
      details: 'X'.repeat(1500),
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Write test probe document rejection (/test/connection is read-only)',
    collectionPath: 'test/connection',
    operation: 'create',
    auth: { uid: 'user_1' },
    payload: { ok: true },
    expected: 'PERMISSION_DENIED',
  },
];

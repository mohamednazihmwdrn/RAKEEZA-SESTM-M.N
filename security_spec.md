# RAKEEZA | ركيزة — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default-Deny Catch-All**: All undefined Firestore paths (`/{document=**}`) deny `read` and `write` by default.
2. **Authentication Gate**: Unauthenticated clients (`request.auth == null`) cannot read or write any business document (`companies`, `tenants`, `ownerSettings`, `auditLogs`, or subcollections).
3. **Tenant Membership Master Gate**: Subcollections under `/tenants/{companyId}/**` (`fiscal_years`, `sales_invoices`, `closing_snapshot`, `archives`) require either platform Admin/Owner status (`isAdmin()`) OR active membership in `/tenants/{companyId}/members/{request.auth.uid}` where `status == 'active'`.
4. **Zero-Credential Storage**: Firestore documents (`companies/{companyId}` and `tenants/{companyId}`) MUST NEVER contain `adminPassword`, `password`, `passwordHash`, or `altPass` fields.
5. **Path Variable Hardening (`isValidId`)**: Single-document IDs (`companyId`, `fiscalYear`, `invoiceId`, `archiveId`, `auditId`, `docId`) MUST match `^[a-zA-Z0-9_-]+$` and be `<= 128` characters.
6. **Immutable Append-Only Audit Trail**: `/auditLogs/{auditId}` forbids `update` and `delete` for all non-admin clients and restricts `list` queries by `resource.data.userId == request.auth.uid || isAdmin()`.
7. **Owner-Only Governance**: `/ownerSettings/{docId}` and `/admins/{uid}` are restricted exclusively to verified platform admins (`isAdmin()`).
8. **No Blanket List Queries**: Collection `list` queries never return unrestricted company or tenant data without authentication and tenant/ownership scoping.

## 2. The "Dirty Dozen" Attack Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated read/write to `/tenants/COMP-000001`.
2. Oversized document ID (`> 128` chars) or path traversal characters (`../etc`) at `/tenants/{companyId}`.
3. Shadow/ghost field injection (`{ companyId: "COMP-000001", isAdmin: true, adminPassword: "123" }`) on `/companies/COMP-000001`.
4. Cross-tenant overwrite where path `{companyId}` (`COMP-000001`) differs from `incoming().companyId` (`COMP-000002`).
5. Privilege escalation via `/tenants/{companyId}/members/{uid}` writing `role: "owner"` when requester is not `isAdmin()`.
6. Spoofed email claim where `request.auth.token.email == "nazihm338@gmail.com"` but `email_verified == false`.
7. Attacker attempting `update` or `delete` on `/auditLogs/{auditId}` to erase audit history.
8. Non-member attempting `get`/`create` on `/tenants/COMP-999999/fiscal_years/2026/sales_invoices/INV-1`.
9. Non-admin attempting to read or mutate `/ownerSettings/global`.
10. Attacker writing an invalid `status` (`"hacked"`) on `/companies/{companyId}`.
11. Resource exhaustion payload on `/auditLogs/{auditId}` with `details` string `> 1000` chars.
12. Revoked member (`status == "revoked"` in `/tenants/{companyId}/members/{uid}`) attempting to read/write sharded invoices.

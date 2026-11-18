import { Settings } from '../types';

export type UniversalPaperSize =
  | 'a5-portrait'
  | 'a5-landscape'
  | 'a4-portrait'
  | 'a4-landscape'
  | 'a3-landscape'
  | 'thermal-80'
  | 'thermal-58';

export type UniversalDocKind =
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'sales_return'
  | 'purchase_return'
  | 'receipt_voucher'
  | 'payment_voucher'
  | 'account_statement'
  | 'treasury_movement'
  | 'treasury_transfer'
  | 'treasury_balances'
  | 'inventory_valuation'
  | 'inventory_movement'
  | 'inventory_stocktaking'
  | 'inventory_settlement'
  | 'inventory_transfer'
  | 'journal_entry'
  | 'trial_balance'
  | 'income_statement'
  | 'balance_sheet'
  | 'sales_report'
  | 'purchases_report'
  | 'tax_report'
  | 'expenses_report'
  | 'revenues_report'
  | 'customers_balances'
  | 'suppliers_balances'
  | 'debt_aging'
  | 'bank_reconciliation'
  | 'audit_trail'
  | 'batch_invoices'
  | 'generic_report';

export interface PrintCompanyInfo {
  name: string;
  tradeName?: string;
  address?: string;
  phones?: string[];
  code?: string;
  taxNumber?: string;
  commercialReg?: string;
  logo?: string;
  branchName?: string;
}

export interface UniversalPrintItem {
  index?: number;
  code?: string;
  name: string;
  unit?: string;
  qty: number | string;
  price: number | string;
  discount?: number | string;
  tax?: number | string;
  total: number | string;
  cost?: number | string;
  balance?: number | string;
  notes?: string;
}

export interface UniversalPrintSummaryItem {
  label: string;
  value: string | number;
  isHighlight?: boolean;
  isTotal?: boolean;
  color?: string;
}

export interface UniversalBatchSummary {
  title: string;
  subtitle?: string;
  kpis: Array<{ title: string; value: string }>;
  columns?: string[];
  rows?: (string | number | undefined | null)[][];
  footerNotes?: string[];
}

export interface UniversalPrintPayload {
  kind: UniversalDocKind;
  title: string;
  subTitle?: string;
  docNumber?: string | number;
  date?: string;
  time?: string;
  period?: { from?: string; to?: string };
  branch?: string;
  user?: string;
  statusBadge?: string;
  pricingTierLabel?: string;
  partyName?: string;
  partyCode?: string;
  partyPhone?: string;
  partyAddress?: string;
  partyLabel?: string;
  partyCodeLabel?: string;
  partyBalanceAfter?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  treasuryOrBank?: string;
  referenceNumber?: string;
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  extraCharges?: number;
  extraChargesLabel?: string;
  paidAmount?: number;
  remainingAmount?: number;
  amount?: number;
  amountInWords?: string;
  statementOrReason?: string;
  notes?: string;
  authorizedBy?: string;
  receivedBy?: string;
  linkedInvoiceNumber?: string | number;
  originalInvoiceNumber?: string | number;
  isFullReturn?: boolean;
  returnKindLabel?: string;
  returnSettlementMode?: string;
  openingBalance?: number;
  closingBalance?: number;
  balanceStatus?: 'مدين' | 'دائن' | 'متزن';
  totalDebit?: number;
  totalCredit?: number;
  columns?: string[];
  rows?: (string | number | undefined | null)[][];
  items?: UniversalPrintItem[];
  summaries?: UniversalPrintSummaryItem[];
  kpis?: Array<{ title: string; value: string }>;
  signatures?: string[];
  footerTermsNote?: string;
  preferredPaperSize?: UniversalPaperSize;
  settings?: Settings;
  documents?: UniversalPrintPayload[];
  batchSummary?: UniversalBatchSummary;
  includeSummarySheet?: boolean;
  onClose?: () => void;
}

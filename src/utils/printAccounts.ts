import { AppData, AccountNode, CostCenter, Settings } from '../types';
import { openUniversalPrint } from '../services/centralizedPrintService';

/**
 * Print Chart of Accounts (دليل الحسابات الشجري)
 */
export function printAccountsTreeWindow(
  accounts: AccountNode[],
  computeStats: (code: string) => { totalDebit: number; totalCredit: number; balance: number },
  settings?: Settings
) {
  const curSymbol = settings?.currencySymbol || 'ج.م';
  const totalAssets = accounts
    .filter((a) => a.type === 'asset' && !a.isParent)
    .reduce((sum, a) => sum + computeStats(a.code).balance, 0);
  const totalLiabilities = accounts
    .filter((a) => a.type === 'liability' && !a.isParent)
    .reduce((sum, a) => sum + computeStats(a.code).balance, 0);
  const totalEquities = accounts
    .filter((a) => a.type === 'equity' && !a.isParent)
    .reduce((sum, a) => sum + computeStats(a.code).balance, 0);
  const totalRevenues = accounts
    .filter((a) => a.type === 'revenue' && !a.isParent)
    .reduce((sum, a) => sum + computeStats(a.code).balance, 0);
  const totalExpenses = accounts
    .filter((a) => a.type === 'expense' && !a.isParent)
    .reduce((sum, a) => sum + computeStats(a.code).balance, 0);

  const getTypeNameAr = (type: string) => {
    switch (type) {
      case 'asset':
        return 'أصول';
      case 'liability':
        return 'خصوم';
      case 'equity':
        return 'حقوق ملكية';
      case 'revenue':
        return 'إيرادات';
      case 'expense':
        return 'مصروفات';
      default:
        return type;
    }
  };

  const rows = accounts.map((acc, idx) => {
    const stats = computeStats(acc.code);
    const prefix = acc.parentCode ? '↳ ' : '';
    return [
      idx + 1,
      acc.code,
      `${prefix}${acc.name}`,
      getTypeNameAr(acc.type),
      acc.parentCode || '-',
      (stats?.totalDebit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      (stats?.totalCredit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      (stats?.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    ];
  });

  const fmt = (n: number) => `${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curSymbol}`;

  openUniversalPrint({
    kind: 'trial_balance',
    title: 'دليل الحسابات الشجري وأرصدة الدفاتر',
    subTitle: 'شجرة الحسابات المعتمدة والأرصدة الجارية',
    docNumber: `COA-${new Date().toISOString().slice(0, 10)}`,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    branch: (settings as any)?.branchName || 'الإدارة المالية',
    kpis: [
      { title: 'إجمالي الأصول', value: fmt(totalAssets) },
      { title: 'إجمالي الخصوم', value: fmt(totalLiabilities) },
      { title: 'حقوق الملكية', value: fmt(totalEquities) },
      { title: 'الإيرادات / المصروفات', value: `${fmt(totalRevenues)} / ${fmt(totalExpenses)}` },
    ],
    columns: ['#', 'الكود', 'اسم الحساب', 'التصنيف', 'الأب', 'إجمالي المدين', 'إجمالي الدائن', 'الرصيد الصافي'],
    rows,
    summaries: [
      { label: 'عدد الحسابات بالشجرة', value: `${accounts.length} حساب` },
      { label: 'إجمالي الأصول', value: fmt(totalAssets), color: '#16a34a' },
      { label: 'إجمالي الخصوم وحقوق الملكية', value: fmt(totalLiabilities + totalEquities), isTotal: true },
    ],
    signatures: ['المحاسب العام', 'المراجع المالي', 'المدير المالي'],
    footerTermsNote: 'دليل الحسابات الشجري المستخرج من النظام المحاسبي المتكامل',
    preferredPaperSize: 'a4-portrait',
    settings,
  });
}

/**
 * Print Cost Centers (مراكز التكلفة والمشاريع)
 */
export function printCostCentersWindow(
  costCenters: CostCenter[],
  journalEntries: any[],
  settings?: Settings
) {
  const curSymbol = settings?.currencySymbol || 'ج.م';
  let grandDebit = 0;
  let grandCredit = 0;

  const rows = costCenters.map((cc, idx) => {
    let totalDebits = 0;
    let totalCredits = 0;
    let count = 0;

    journalEntries.forEach((entry) => {
      (entry.lines || []).forEach((line: any) => {
        if (line.costCenter === cc.name || line.costCenter === cc.code) {
          totalDebits += line.debit || 0;
          totalCredits += line.credit || 0;
          count += 1;
        }
      });
    });

    grandDebit += totalDebits;
    grandCredit += totalCredits;
    const netBalance = totalDebits - totalCredits;

    return [
      idx + 1,
      cc.code,
      cc.name,
      cc.manager || 'المدير العام',
      `${count} حركة`,
      (totalDebits || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      (totalCredits || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      (netBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
    ];
  });

  const fmt = (n: number) => `${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${curSymbol}`;

  openUniversalPrint({
    kind: 'generic_report',
    title: 'تقرير مراكز التكلفة والمشاريع والأقسام',
    subTitle: 'قياس الأداء وتوزيع التكاليف والإيرادات التشغيلية',
    docNumber: `CC-${new Date().toISOString().slice(0, 10)}`,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    branch: (settings as any)?.branchName || 'الإدارة المالية والمشاريع',
    kpis: [
      { title: 'عدد مراكز التكلفة', value: `${costCenters.length} مركز` },
      { title: 'إجمالي المدين', value: fmt(grandDebit) },
      { title: 'إجمالي الدائن', value: fmt(grandCredit) },
      { title: 'صافي المراكز', value: fmt(grandDebit - grandCredit) },
    ],
    columns: ['#', 'كود المركز', 'اسم مركز التكلفة / المشروع', 'المسؤول', 'الحركات', 'إجمالي المدين', 'إجمالي الدائن', 'صافي الرصيد'],
    rows,
    summaries: [
      { label: 'عدد مراكز التكلفة والمشاريع', value: `${costCenters.length} مركز` },
      { label: 'إجمالي المدين', value: fmt(grandDebit), color: '#16a34a' },
      { label: 'إجمالي الدائن', value: fmt(grandCredit), color: '#dc2626' },
      { label: 'صافي الأرصدة', value: fmt(grandDebit - grandCredit), isTotal: true },
    ],
    signatures: ['محاسب التكاليف', 'المراجع المالي', 'المدير العام'],
    footerTermsNote: 'تقرير مراكز التكلفة والمشاريع المستخرج من دفاتر اليومية المعتمدة',
    preferredPaperSize: 'a4-portrait',
    settings,
  });
}

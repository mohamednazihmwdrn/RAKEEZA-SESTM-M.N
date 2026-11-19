import { AppData, Settings } from '../types';
import { ReportResult } from './reportsData';
import { generateUnifiedReportHtml, UnifiedReportConfig, inferDocKind } from './printUnified';
import { openUniversalPrint } from '../services/centralizedPrintService';

export function generateReportPrintHtml(
  reportData: ReportResult,
  appData: AppData,
  dateFrom?: string,
  dateTo?: string
): string {
  const settings: Partial<Settings> = appData.settings || {};
  const companyName = settings.companyName || 'المنظومة المحاسبية المعتمدة';
  const companySubtitle = settings.address || 'الفرع الرئيسي';
  const phones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];

  const currentUserObj = appData.users.find((u) => u.id === appData.currentUser) || appData.users[0];
  const createdBy = currentUserObj?.name || 'مدير النظام';

  const reportTitle = reportData.title || 'تقرير عام';
  const now = new Date();
  const fromStr = dateFrom || reportData.fromDate || '2026-01-01';
  const toStr = dateTo || reportData.toDate || now.toISOString().split('T')[0];
  const storeName = appData.activeBranchId
    ? (appData.branches?.find((b) => b.id === appData.activeBranchId)?.name || 'الفرع الرئيسي')
    : 'الفرع الرئيسي';

  const kpis = (reportData.kpis || []).map((k) => ({
    title: k.label,
    value: typeof k.value === 'number' ? `${k.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م` : String(k.value),
  }));

  const summary = [
    {
      label: 'عدد السجلات',
      value: `${reportData.count || reportData.rows.length} حركة`,
    },
    {
      label: 'إجمالي القيمة',
      value: `${(reportData.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`,
      isTotal: true,
      isHighlight: true,
    },
  ];

  const unifiedConfig: UnifiedReportConfig = {
    reportTitle,
    subTitle: `${reportTitle} (الفترة: ${fromStr} إلى ${toStr})`,
    branch: storeName,
    company: {
      name: companyName,
      address: companySubtitle,
      phones,
      logo: settings.logo || settings.logoUrl || '',
    },
    partyLabel: 'الفرع / النطاق',
    partyName: storeName,
    statementNote: `المسؤول: ${createdBy}`,
    columns: reportData.columns,
    rows: reportData.rows,
    kpis,
    summary,
    preferredPaperSize: 'A4',
    footerNote: 'تم استخراج هذا التقرير آلياً من السجلات المحاسبية المعتمدة بالنظام',
  };

  return generateUnifiedReportHtml(unifiedConfig);
}

export function printReportWindow(
  reportData: ReportResult,
  appData: AppData,
  dateFrom?: string,
  dateTo?: string,
  showToast?: (msg: string, type: 'warning' | 'error' | 'success' | 'info') => void
) {
  const settings: Settings = appData.settings || ({} as Settings);
  const curSymbol = settings.currencySymbol || 'ج.م';
  const currentUserObj = appData.users.find((u) => u.id === appData.currentUser) || appData.users[0];
  const createdBy = currentUserObj?.name || 'مدير النظام';
  const reportTitle = reportData.title || 'تقرير مالي معتمد';
  const now = new Date();
  const fromStr = dateFrom || reportData.fromDate || '';
  const toStr = dateTo || reportData.toDate || now.toISOString().split('T')[0];
  const storeName = appData.activeBranchId
    ? (appData.branches?.find((b) => b.id === appData.activeBranchId)?.name || 'الفرع الرئيسي')
    : 'الفرع الرئيسي';

  const kpis = (reportData.kpis || []).map((k) => ({
    title: k.label,
    value:
      typeof k.value === 'number'
        ? `${k.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curSymbol}`
        : String(k.value),
  }));

  const summaries = [
    {
      label: 'عدد السجلات',
      value: `${reportData.count || reportData.rows.length} حركة`,
    },
    {
      label: 'إجمالي القيمة',
      value: `${(reportData.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curSymbol}`,
      isTotal: true,
      isHighlight: true,
    },
  ];

  openUniversalPrint({
    kind: inferDocKind(reportTitle, reportData.columns),
    title: reportTitle,
    docNumber: `REP-${now.toISOString().split('T')[0]}`,
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    period: fromStr || toStr ? { from: fromStr, to: toStr } : undefined,
    branch: storeName,
    user: createdBy,
    kpis,
    columns: reportData.columns,
    rows: reportData.rows,
    summaries,
    amount: reportData.total || 0,
    preferredPaperSize: 'a4-portrait',
    footerTermsNote: 'تم استخراج هذا التقرير آلياً من السجلات المحاسبية المعتمدة بالنظام',
    settings,
  });

  if (showToast) {
    showToast(`تم تجهيز معاينة وطباعة "${reportTitle}" بنجاح`, 'success');
  }
}

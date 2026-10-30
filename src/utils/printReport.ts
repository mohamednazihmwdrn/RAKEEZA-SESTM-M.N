import { AppData, Settings } from '../types';
import { ReportResult } from './reportsData';
import { generateUnifiedReportHtml, UnifiedReportConfig } from './printUnified';

export function generateReportPrintHtml(
  reportData: ReportResult,
  appData: AppData,
  dateFrom?: string,
  dateTo?: string
): string {
  const settings: Partial<Settings> = appData.settings || {};
  const companyName = settings.companyName || 'RAKEEZA';
  const companySubtitle = settings.address || 'الفرع الرئيسي - ش المعهد الديني';
  const phones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];
  const finalPhones = phones.length > 0 ? phones : ['01029190615'];

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
      phones: finalPhones,
      logo: settings.logo || settings.logoUrl || '',
    },
    partyLabel: 'الفرع / النطاق',
    partyName: storeName,
    partyCode: finalPhones[0] || '01029190615',
    partyCodeLabel: 'كود المؤسسة',
    statementNote: `المسؤول: ${createdBy}`,
    columns: reportData.columns,
    rows: reportData.rows,
    kpis,
    summary,
    preferredPaperSize: 'A4',
    footerNote: '* تطابق هذه المستندات الأرصدة والبيانات مع السجلات الرسمية بالنظام. | صفحة 1 من 1',
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
  const printWin = window.open('', '_blank', 'width=950,height=900');
  if (!printWin) {
    if (showToast) {
      showToast('يرجى السماح بالنوافذ المنبثقة للطباعة', 'warning');
    }
    return;
  }

  const html = generateReportPrintHtml(reportData, appData, dateFrom, dateTo);
  printWin.document.write(html);
  printWin.document.close();
}

import { AppData, Settings } from '../types';
import { getPrintToolbarStyles, getPrintToolbarHtml, getPrintToolbarScript } from './printToolbarHelper';
import { openUniversalPrint } from '../services/centralizedPrintService';

export interface DailyTransactionItem {
  id: string | number;
  time: string;
  txNumber: string;
  type: string;
  paymentMethod: string;
  party: string;
  income: number;
  expense: number;
  description: string;
  rawDate: string;
}

export function formatNumber(num: number): string {
  const n = Number(num) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function compileDailyTransactionsData(
  appData: AppData,
  targetDate?: string,
  branchName?: string
): {
  company: Settings;
  issuerName: string;
  branchName: string;
  targetDate: string;
  items: DailyTransactionItem[];
  totalIncome: number;
  totalExpense: number;
  netMovement: number;
  totalCount: number;
} {
  const company = appData.settings || {
    companyName: 'RAKEEZA',
    address: 'الفرع الرئيسي - ش المعهد الديني، القاهرة',
    phone1: '01029190615',
    phone2: '',
    phone3: '',
    taxNumber: '123-456-789',
    currencySymbol: 'ج.م',
    showLogoInPrint: true,
    notes: '',
    defaultTaxRate: 14,
  };

  const currentUserObj = appData.users?.find((u) => u.id === appData.currentUser) || appData.users?.[0];
  const issuerName = currentUserObj?.name || 'Mohamed Nazih';
  const selectedDate = targetDate || new Date().toISOString().split('T')[0];
  const displayBranch = branchName || (appData.branches && appData.branches[0]?.name ? `الخزينة الرئيسية - ${appData.branches[0].name}` : 'الخزينة الرئيسية - الفرع الرئيسي');

  const items: DailyTransactionItem[] = [];

  // Helper to map payment method labels in Arabic
  const getMethodLabel = (method?: string): string => {
    if (!method) return 'نقداً';
    if (method === 'drawer' || method === 'cash' || method === 'نقدي') return 'نقداً';
    if (method === 'bank' || method === 'visa' || method === 'شبكة') return 'تحويل بنكي / فيزا';
    if (method === 'vodafone') return 'فودافون كاش';
    if (method === 'instapay') return 'إنستاباي';
    if (method === 'cheque' || method === 'شيك') return 'شيك';
    if (method === 'split') return 'دفع مجزأ';
    return method;
  };

  // 1. Sales Invoices
  (appData.salesInvoices || []).forEach((inv) => {
    if (inv.status === 'cancelled') return;
    if (inv.date !== selectedDate) return;

    const isReturn = inv.type.includes('return');
    const paid = inv.paidAmount !== undefined ? inv.paidAmount : (inv.type === 'nagdi' ? inv.total : 0);

    if (paid > 0) {
      const timeStr = inv.createdAt ? new Date(inv.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '09:00 ص';
      items.push({
        id: `SALES-${inv.id}`,
        time: timeStr,
        txNumber: `INV-${inv.id}`,
        type: isReturn ? 'مرتجع مبيعات' : 'فاتورة مبيعات',
        paymentMethod: getMethodLabel(inv.paymentMethod),
        party: inv.customerName || 'عميل نقدي عام',
        income: isReturn ? 0 : paid,
        expense: isReturn ? paid : 0,
        description: isReturn ? `رد قيمة مرتجع مبيعات فاتورة #${inv.id}` : `تحصيل قيمة فاتورة مبيعات #${inv.id} (${inv.type === 'nagdi' ? 'نقدي' : 'دفعة آجل'})`,
        rawDate: inv.date,
      });
    }
  });

  // 2. Purchase Invoices
  (appData.purchaseInvoices || []).forEach((inv) => {
    if (inv.status === 'cancelled') return;
    if (inv.date !== selectedDate) return;

    const isReturn = inv.type.includes('return');
    const paid = inv.paidAmount !== undefined ? inv.paidAmount : (inv.type === 'nagdi' ? inv.total : 0);

    if (paid > 0) {
      const timeStr = inv.createdAt ? new Date(inv.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '11:00 ص';
      items.push({
        id: `PURCH-${inv.id}`,
        time: timeStr,
        txNumber: `PUR-${inv.id}`,
        type: isReturn ? 'مرتجع مشتريات' : 'فاتورة مشتريات',
        paymentMethod: getMethodLabel(inv.paymentMethod),
        party: inv.supplierName || 'مورد بضاعة عام',
        income: isReturn ? paid : 0,
        expense: isReturn ? 0 : paid,
        description: isReturn ? `استرداد نقدية مرتجع مشتريات #${inv.id}` : `سداد قيمة فاتورة مشتريات #${inv.id} (${inv.type === 'nagdi' ? 'نقدي' : 'دفعة مورد'})`,
        rawDate: inv.date,
      });
    }
  });

  // 3. Cash Transactions (سندات القبض والصرف، الإيداع، السحب، المصروفات)
  (appData.cashTransactions || []).forEach((trx) => {
    if (trx.date !== selectedDate) return;

    const timeStr = '01:00 م';
    const isIncome = trx.type === 'receive' || trx.type === 'deposit';
    const isExpense = trx.type === 'pay' || trx.type === 'withdraw';

    let typeLabel = 'حركة نقدية';
    if (trx.type === 'receive') {
      typeLabel = trx.customerName ? 'سند قبض عميل' : 'سند قبض عام';
    } else if (trx.type === 'pay') {
      typeLabel = trx.supplierName ? 'سند صرف مورد' : 'سند صرف مصروفات';
    } else if (trx.type === 'deposit') {
      typeLabel = 'إيداع نقدي بالخزينة';
    } else if (trx.type === 'withdraw') {
      typeLabel = 'سحب نقدي / مسحوبات';
    }

    const party = trx.customerName || trx.supplierName || (trx.type === 'pay' ? 'مصاريف تشغيل ونثريات' : 'الخزينة العامة');

    items.push({
      id: `CASH-${trx.id}`,
      time: timeStr,
      txNumber: `TRX-${String(trx.id).padStart(4, '0')}`,
      type: typeLabel,
      paymentMethod: getMethodLabel(trx.method),
      party: party,
      income: isIncome ? trx.amount : 0,
      expense: isExpense ? trx.amount : 0,
      description: trx.note || (isIncome ? 'قبض وتحصيل نقدية' : 'صرف نقدية ومصاريف'),
      rawDate: trx.date,
    });
  });

  // Calculate totals from real transactions only

  // Calculate totals
  const totalIncome = items.reduce((sum, item) => sum + (item.income || 0), 0);
  const totalExpense = items.reduce((sum, item) => sum + (item.expense || 0), 0);
  const netMovement = totalIncome - totalExpense;
  const totalCount = items.length;

  return {
    company,
    issuerName,
    branchName: displayBranch,
    targetDate: selectedDate,
    items,
    totalIncome,
    totalExpense,
    netMovement,
    totalCount,
  };
}

export function generateDailyTransactionsReportHtml(appData: AppData, targetDate?: string, branchName?: string): string {
  const data = compileDailyTransactionsData(appData, targetDate, branchName);

  const phone = data.company.phone1 || '01029190615';
  const companyTitle = data.company.companyName || 'RAKEEZA';
  const branchAddress = data.company.address || 'الفرع الرئيسي - ش المعهد الديني';

  const now = new Date();
  const printDate = now.toLocaleDateString('ar-EG');
  const printTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  // Rows HTML
  let rowsHtml = '';
  data.items.forEach((item) => {
    const incomeStr = item.income > 0 ? formatNumber(item.income) : '-';
    const expenseStr = item.expense > 0 ? formatNumber(item.expense) : '-';

    rowsHtml += `
      <tr>
        <td>${item.time}</td>
        <td style="font-family: monospace; font-weight: bold;">${item.txNumber}</td>
        <td>${item.type}</td>
        <td>${item.paymentMethod}</td>
        <td style="text-align: right; font-weight: 600;">${item.party}</td>
        <td class="income-val">${incomeStr}</td>
        <td class="expense-val">${expenseStr}</td>
        <td style="text-align: right;">${item.description}</td>
      </tr>
    `;
  });

  const netPrefix = data.netMovement >= 0 ? '+ ' : '- ';
  const netAbsFormatted = formatNumber(Math.abs(data.netMovement));
  const netText = `${netPrefix}${netAbsFormatted} ج.م`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تقرير حركة العمليات اليومية</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: auto; margin: 5mm; }
  * { box-sizing: border-box; font-family: 'Tajawal', system-ui, -apple-system, sans-serif; }

  html, body {
    background-color: #f1f5f9; margin: 0; padding: 10px; color: #0f172a;
    width: 100%; display: flex; flex-direction: column; align-items: center;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  .report-container {
    background: #fff; width: 100%; max-width: 210mm; min-height: auto;
    margin: 0 auto; padding: 8mm 10mm; border: 1px solid #cbd5e1; border-radius: 4px;
    box-shadow: 0 2px 12px rgba(15,23,42,0.06);
    display: flex; flex-direction: column; justify-content: space-between;
  }

  .header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #1e293b; padding-bottom: 6px; margin-bottom: 8px; width: 100%; gap: 8px; }
  .header-right h2 { margin: 0 0 2px 0; font-size: 1.15rem; font-weight: 700; color: #0f172a; }
  .header-right p { margin: 0; font-size: 0.78rem; color: #475569; }
  .logo-img { max-width: 85px; max-height: 48px; object-fit: contain; }
  .phones-list { list-style: none; padding: 0; margin: 0; font-size: 0.75rem; direction: ltr; text-align: left; color: #334155; }
  .phones-list li { margin-bottom: 1px; font-weight: 500; }

  .info-box {
    display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px;
    border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;
    font-size: 0.78rem; line-height: 1.4; width: 100%; background-color: #f8fafc;
  }
  .info-item p { margin: 1px 0; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px; margin-bottom: 8px; }
  .kpi-card { border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; text-align: center; background-color: #f8fafc; }
  .kpi-card .kpi-title { font-size: 0.72rem; font-weight: 500; color: #475569; }
  .kpi-card .kpi-value { font-size: 0.9rem; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }

  .table-wrapper { width: 100%; overflow-x: auto; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 5px; text-align: center; font-size: 0.74rem; font-variant-numeric: tabular-nums; }
  th { background-color: #f1f5f9; color: #0f172a; font-weight: 600; }
  tfoot tr { background-color: #f1f5f9; font-weight: 600; }

  .income-val { color: #15803d; font-weight: 600; }
  .expense-val { color: #b91c1c; font-weight: 600; }

  .bottom-section { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px; margin-top: 8px; margin-bottom: 6px; width: 100%; font-size: 0.78rem; font-weight: 600; }
  .report-footer-note { border-top: 1px solid #cbd5e1; padding-top: 5px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; font-size: 0.72rem; font-weight: 500; color: #475569; width: 100%; }
  .copyright-outside { width: 100%; text-align: center; font-size: 0.72rem; font-weight: 500; color: #64748b; padding: 6px 0; direction: rtl; }

  ${getPrintToolbarStyles()}

  @media print {
    html, body { background: #fff !important; padding: 0 !important; margin: 0 !important; height: auto !important; overflow: visible !important; }
    .no-print-toolbar, .no-print { display: none !important; }
    .report-container { border: none !important; width: 100% !important; max-width: 100% !important; height: auto !important; padding: 0 !important; box-shadow: none !important; }
    .table-wrapper { overflow: visible !important; }
  }
</style>
</head>
<body>

${getPrintToolbarHtml('تقرير حركة العمليات اليومية - ' + data.targetDate)}

<div class="report-container">
  <div>
    <!-- الترويسة -->
    <div class="header">
      <div class="header-right">
        <h2>${companyTitle}</h2>
        <p>${branchAddress}</p>
      </div>
      <div class="header-center">
        <!-- يمكن إضافة صورة اللوجو هنا -->
      </div>
      <div class="header-left">
        <ul class="phones-list">
          <li>${phone}</li>
        </ul>
      </div>
    </div>

    <!-- صندوق البيانات والفلترة -->
    <div class="info-box">
      <div class="info-item" style="text-align: right;">
        <p><strong>نوع التقرير:</strong> <span style="font-weight:bold; font-size:0.85rem;">تقرير حركة العمليات اليومية</span></p>
        <p><strong>الفرع / الخزينة:</strong> <span>${data.branchName}</span></p>
      </div>
      <div class="info-item" style="text-align: center;">
        <p><strong>تاريخ الحركة:</strong> <span id="lblTransactionDate">${data.targetDate}</span></p>
        <p><strong>مسؤول الحركة اليومية:</strong> <span>${data.issuerName}</span></p>
      </div>
      <div class="info-item" style="text-align: left;">
        <p><strong>تاريخ الطباعة:</strong> <span id="lblPrintDate">${printDate}</span></p>
        <p><strong>وقت الطباعة:</strong> <span id="lblPrintTime">${printTime}</span></p>
      </div>
    </div>

    <!-- كروت الإحصائيات (KPIs) -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">إجمالي المقبوضات (+)</div>
        <div class="kpi-value income-val">+ ${formatNumber(data.totalIncome)} ج.م</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي المدفوعات (-)</div>
        <div class="kpi-value expense-val">- ${formatNumber(data.totalExpense)} ج.م</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">صافي الحركة اليومية</div>
        <div class="kpi-value" style="color:${data.netMovement >= 0 ? '#16a34a' : '#dc2626'};">${netText}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">عدد العمليات المسجلة</div>
        <div class="kpi-value">${data.totalCount} عملية</div>
      </div>
    </div>

    <!-- جدول العمليات اليومية -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th style="width: 6%;">الوقت</th>
            <th style="width: 10%;">رقم الحركة</th>
            <th style="width: 12%;">نوع العملية</th>
            <th style="width: 10%;">طريقة الدفع</th>
            <th style="width: 22%; text-align: right;">الحساب / الطرف الثاني</th>
            <th style="width: 11%;">وارد (مقبوضات)</th>
            <th style="width: 11%;">صادر (مدفوعات)</th>
            <th style="width: 18%;">البيان / السبب</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="text-align: right;">الإجمالـــي العام لعمليات اليوم</td>
            <td class="income-val">${formatNumber(data.totalIncome)}</td>
            <td class="expense-val">${formatNumber(data.totalExpense)}</td>
            <td style="color:${data.netMovement >= 0 ? '#16a34a' : '#dc2626'};">الصافي: ${netText}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- التوقيعات والاعتماد -->
    <div class="bottom-section">
      <div>مسؤول الخزينة / الخزينة: ....................</div>
      <div>المراجع المحاسبي: ....................</div>
      <div>يعتمد / المدير المالي: ....................</div>
    </div>
  </div>

  <div>
    <div class="report-footer-note">
      <div>* يوضح هذا التقرير كافة الحركات المالية والمخزنية المسجلة بالنظام خلال اليوم ويتم مطابقة النقدية بناءً عليه</div>
      <div>صفحة رقم: 1/1</div>
    </div>
  </div>
</div>

<div class="copyright-outside">
  جميع حقوق الملكية محفوظة لمطور النظام Mohamed Nazih ت 01029190615
</div>

${getPrintToolbarScript()}
</body>
</html>`;
}

export function printDailyTransactionsReportWindow(
  appData: AppData,
  targetDate?: string,
  branchName?: string,
  showToast?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
): void {
  try {
    const data = compileDailyTransactionsData(appData, targetDate, branchName);
    const curSymbol = appData.settings?.currencySymbol || 'ج.م';

    const rows = data.items.map((item, idx) => [
      idx + 1,
      item.time,
      item.txNumber,
      item.party,
      item.paymentMethod,
      item.income > 0 ? item.income.toFixed(2) : '-',
      item.expense > 0 ? item.expense.toFixed(2) : '-',
      item.description,
    ]);

    openUniversalPrint({
      kind: 'treasury_movement',
      title: 'تقرير حركة العمليات اليومية',
      subTitle: 'المحاسبة العامة والحركة اليومية',
      docNumber: targetDate || new Date().toISOString().split('T')[0],
      date: targetDate || new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      branch: branchName || 'جميع الفروع',
      columns: ['م', 'الوقت', 'رقم الحركة', 'الطرف والعميل', 'طريقة الدفع', 'إيرادات (+)', 'مصروفات (-)', 'البيان'],
      rows,
      kpis: [
        { title: 'عدد العمليات', value: `${data.totalCount} حركة` },
        { title: 'إجمالي المقبوضات', value: `${data.totalIncome.toFixed(2)} ${curSymbol}` },
        { title: 'إجمالي المدفوعات', value: `${data.totalExpense.toFixed(2)} ${curSymbol}` },
        { title: 'صافي الحركة اليومية', value: `${data.netMovement.toFixed(2)} ${curSymbol}` },
      ],
      amount: Math.abs(data.netMovement),
      summaries: [
        { label: 'عدد العمليات', value: `${data.totalCount} حركة` },
        { label: 'إجمالي المقبوضات', value: `${data.totalIncome.toFixed(2)} ${curSymbol}`, color: '#16a34a' },
        { label: 'إجمالي المدفوعات', value: `${data.totalExpense.toFixed(2)} ${curSymbol}`, color: '#dc2626' },
        { label: 'صافي الحركة اليومية', value: `${data.netMovement.toFixed(2)} ${curSymbol}`, isTotal: true },
      ],
      signatures: ['مسؤول الخزينة', 'المراجع المحاسبي', 'المدير المالي'],
      settings: appData.settings,
      preferredPaperSize: 'a4-portrait',
    });

    if (showToast) {
      showToast('تم تجهيز وفتح تقرير حركة العمليات بنجاح للطباعة والمعاينة', 'success');
    }
  } catch (err) {
    console.error('Error printing daily transactions report:', err);
    if (showToast) {
      showToast('حدث خطأ أثناء إعداد تقرير حركة العمليات للطباعة', 'error');
    }
  }
}


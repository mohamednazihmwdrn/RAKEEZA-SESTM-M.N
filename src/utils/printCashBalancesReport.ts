import { AppData, Settings } from '../types';
import { getPrintToolbarStyles, getPrintToolbarHtml, getPrintToolbarScript } from './printToolbarHelper';

export interface CashLocationBalance {
  location: string;
  amounts: Record<string, number>;
}

export function compileCashBalancesData(appData: AppData): {
  company: Settings;
  issuerName: string;
  cashData: CashLocationBalance[];
  targetDate: string;
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
  const targetDate = new Date().toISOString().split('T')[0];

  const cash = appData.cashBox || { drawer: 0, vodafone: 0, instapay: 0, bank: 0 };

  // Calculate POS sales today or total
  let posCash = 0;
  let posVisa = 0;
  let posVodafone = 0;
  let posInstapay = 0;

  (appData.salesInvoices || []).forEach((inv) => {
    if (inv.status === 'cancelled') return;
    const paid = inv.paidAmount || (inv.type === 'nagdi' ? inv.total : 0);
    if (inv.paymentMethod === 'drawer' || inv.paymentMethod === 'split') {
      posCash += paid;
    } else if (inv.paymentMethod === 'vodafone') {
      posVodafone += paid;
    } else if (inv.paymentMethod === 'instapay') {
      posInstapay += paid;
    } else if (inv.paymentMethod === 'bank') {
      posVisa += paid;
    }
  });

  // Calculate cheques under collection
  const chequesTotal = (appData.cheques || [])
    .filter((c: any) => c.type === 'received' && (c.status === 'under_collection' || c.status === 'registered' || !c.status))
    .reduce((sum: number, c: any) => sum + (c.amount || 0), 0);

  // Bank accounts
  const bankAccounts = appData.bankAccounts || [];
  const primaryBank = bankAccounts[0];
  const otherBanks = bankAccounts.slice(1);

  const cashData: CashLocationBalance[] = [];

  // 1. الخزينة الرئيسية (الدرج)
  cashData.push({
    location: 'الخزينة الرئيسية',
    amounts: {
      'نقدي (Cash)': cash.drawer || 0,
      'شيكات بالخزينة': chequesTotal || 0,
    },
  });

  // 2. خزينة نقطة البيع (POS)
  cashData.push({
    location: 'خزينة نقطة البيع (POS)',
    amounts: {
      'نقدي (Cash)': posCash || 0,
      'فيزا (POS)': posVisa || 0,
      'فودافون كاش': posVodafone || cash.vodafone || 0,
    },
  });

  // 3. الحسابات البنكية
  if (primaryBank) {
    cashData.push({
      location: `${primaryBank.name} (${primaryBank.accountNumber || 'جاري'})`,
      amounts: {
        'تحويل بنكي': primaryBank.balance || cash.bank || 0,
      },
    });
  } else if (cash.bank) {
    cashData.push({
      location: 'الحساب البنكي',
      amounts: {
        'تحويل بنكي': cash.bank || 0,
      },
    });
  }

  // Other banks if any
  otherBanks.forEach((b) => {
    cashData.push({
      location: `${b.name} (${b.accountNumber || 'جاري'})`,
      amounts: {
        'تحويل بنكي': b.balance || 0,
      },
    });
  });

  // 4. محفظة إنستا باي
  cashData.push({
    location: 'محفظة إنستا باي',
    amounts: {
      'تحويل لحظي (InstaPay)': cash.instapay || posInstapay || 0,
    },
  });

  return {
    company,
    issuerName,
    cashData,
    targetDate,
  };
}

export function formatEnNumber(num: number): string {
  const n = Number(num) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateCashBalancesReportHtml(appData: AppData): string {
  const { company, issuerName, cashData, targetDate } = compileCashBalancesData(appData);

  const phone = company.phone1 || '01029190615';
  const companyTitle = company.companyName || 'RAKEEZA';
  const branchAddress = company.address || 'الفرع الرئيسي - ش المعهد الديني';

  const now = new Date();
  const printDate = now.toLocaleDateString('en-GB');
  const printTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Extract payment methods
  const paymentMethodsSet = new Set<string>();
  cashData.forEach((item) => {
    Object.keys(item.amounts).forEach((method) => paymentMethodsSet.add(method));
  });
  const methods = Array.from(paymentMethodsSet);

  // Totals
  const methodTotals: Record<string, number> = {};
  methods.forEach((m) => (methodTotals[m] = 0));
  let grandTotal = 0;

  cashData.forEach((item) => {
    methods.forEach((m) => {
      const val = item.amounts[m] || 0;
      methodTotals[m] += val;
      grandTotal += val;
    });
  });

  // KPI cards html
  let kpiCardsHtml = '';
  methods.forEach((m) => {
    kpiCardsHtml += `
      <div class="kpi-card">
        <div class="kpi-title">${m}</div>
        <div class="kpi-value">${formatEnNumber(methodTotals[m])} EGP</div>
      </div>
    `;
  });

  kpiCardsHtml += `
    <div class="kpi-card" style="background-color: #eff6ff; border-color: #2563eb;">
      <div class="kpi-title" style="color: #1e40af;">إجمالي جميع الوسائل</div>
      <div class="kpi-value" style="color: #1d4ed8;">${formatEnNumber(grandTotal)} EGP</div>
    </div>
  `;

  // Head html
  let headHtml = `<tr><th style="width: 26%; text-align: right; font-weight: bold;">جهة الحساب / الخزينة</th>`;
  methods.forEach((m) => {
    headHtml += `<th>${m}</th>`;
  });
  headHtml += `<th style="background-color:#e2e8f0; font-weight: bold;">إجمالي الحساب</th></tr>`;

  // Body html
  let bodyHtml = '';
  cashData.forEach((item) => {
    let rowTotal = 0;
    bodyHtml += `<tr><td style="text-align: right; font-weight: bold;">${item.location}</td>`;
    methods.forEach((m) => {
      const val = item.amounts[m] || 0;
      rowTotal += val;
      bodyHtml += `<td class="amount-cell">${val > 0 ? formatEnNumber(val) : '-'}</td>`;
    });
    bodyHtml += `<td class="total-col">${formatEnNumber(rowTotal)}</td></tr>`;
  });

  // Foot html
  let footHtml = `<tr><td style="text-align: right; font-weight: bold;">الإجمالـــي العــام</td>`;
  methods.forEach((m) => {
    footHtml += `<td class="amount-cell" style="font-weight: bold;">${formatEnNumber(methodTotals[m])}</td>`;
  });
  footHtml += `<td class="total-col" style="color: #1d4ed8; font-size: 0.8rem; font-weight: bold;">${formatEnNumber(grandTotal)}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تقرير الخزينة والأرصدة النقدية التفاعلي</title>
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
  .kpi-card .kpi-value { font-size: 0.9rem; font-weight: 600; margin-top: 2px; color: #1d4ed8; direction: ltr; font-variant-numeric: tabular-nums; }

  .table-wrapper { width: 100%; overflow-x: auto; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 5px; text-align: center; font-size: 0.74rem; font-variant-numeric: tabular-nums; }
  th { background-color: #f1f5f9; color: #0f172a; font-weight: 600; font-size: 0.75rem; }
  tfoot tr { background-color: #f1f5f9; font-weight: 600; }

  .amount-cell { direction: ltr; }
  .total-col { font-weight: 600; background-color: #f8fafc; direction: ltr; }

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

${getPrintToolbarHtml('تقرير أرصدة النقدية والحسابات البنكية')}

<div class="report-container">
  <div>
    <!-- الترويسة -->
    <div class="header">
      <div class="header-right">
        <h2>${companyTitle}</h2>
        <p>${branchAddress}</p>
      </div>
      <div class="header-center"></div>
      <div class="header-left">
        <ul class="phones-list">
          <li>${phone}</li>
        </ul>
      </div>
    </div>

    <!-- صندوق البيانات -->
    <div class="info-box">
      <div class="info-item" style="text-align: right;">
        <p><strong>نوع التقرير:</strong> <span style="font-weight:bold; font-size:0.85rem;">تقرير الأرصدة النقدية ووسائل الدفع</span></p>
        <p><strong>نطاق التقرير:</strong> <span>جميع الخزائن والحسابات</span></p>
      </div>
      <div class="info-item" style="text-align: center;">
        <p><strong>حتى تاريخ:</strong> <span>${targetDate}</span></p>
        <p><strong>مُستخرج التقرير:</strong> <span>${issuerName}</span></p>
      </div>
      <div class="info-item" style="text-align: left;">
        <p><strong>تاريخ الطباعة:</strong> <span id="lblPrintDate">${printDate}</span></p>
        <p><strong>وقت الطباعة:</strong> <span id="lblPrintTime">${printTime}</span></p>
      </div>
    </div>

    <!-- كروت الإحصائيات (Dynamic KPIs Grid) -->
    <div class="kpi-grid" id="kpiGrid">
      ${kpiCardsHtml}
    </div>

    <!-- جدول الأرصدة والتفاصيل -->
    <div class="table-wrapper">
      <table id="mainTable">
        <thead id="tableHead">${headHtml}</thead>
        <tbody id="tableBody">${bodyHtml}</tbody>
        <tfoot id="tableFoot">${footHtml}</tfoot>
      </table>
    </div>

    <!-- التوقيعات -->
    <div class="bottom-section">
      <div>أمين الخزينة: ....................</div>
      <div>المراجع المحاسبي: ....................</div>
      <div>يعتمد / المدير المالي: ....................</div>
    </div>
  </div>

  <div>
    <div class="report-footer-note">
      <div>* أرقام المبالغ معروضة بالصيغة الإنجليزية مع التنسيق الآلي</div>
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

export function printCashBalancesReportWindow(
  appData: AppData,
  showToast?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
): void {
  try {
    const htmlContent = generateCashBalancesReportHtml(appData);
    const printWindow = window.open('', '_blank', 'width=1100,height=850,menubar=no,toolbar=no,location=no,status=no');

    if (!printWindow) {
      if (showToast) {
        showToast('يرجى السماح بالنوافذ المنبثقة لطباعة تقرير الأرصدة النقدية ووسائل الدفع', 'warning');
      }
      return;
    }

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    if (showToast) {
      showToast('تم تجهيز وفتح تقرير الأرصدة النقدية ووسائل الدفع للطباعة والمعاينة بنجاح', 'success');
    }
  } catch (err) {
    console.error('Error printing cash balances matrix:', err);
    if (showToast) {
      showToast('حدث خطأ أثناء إعداد تقرير الأرصدة والوسائل للطباعة', 'error');
    }
  }
}

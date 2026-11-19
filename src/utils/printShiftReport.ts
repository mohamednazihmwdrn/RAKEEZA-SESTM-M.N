import { AppData, Settings, SaleInvoice } from '../types';
import { getPrintToolbarStyles, getPrintToolbarHtml, getPrintToolbarScript } from './printToolbarHelper';
import { openUniversalPrint } from '../services/centralizedPrintService';

export interface ShiftReportData {
  cashierName?: string;
  cashierId?: string;
  serialNo?: string | number;
  branch?: string;
  date?: string;
  time?: string;
  salesCount?: number;
  salesGross?: number;
  salesDiscount?: number;
  salesNet?: number;
  returnsCount?: number;
  returnsGross?: number;
  returnsDiscount?: number;
  returnsNet?: number;
  totalInvoicesCount?: number;
  totalGross?: number;
  totalDiscount?: number;
  totalNet?: number;
  costOfGoodsSold?: number;
  grossProfit?: number;
  totalExpenses?: number;
  netProfit?: number;
  company?: {
    name?: string;
    companyName?: string;
    address?: string;
    logoUrl?: string;
    logo?: string;
    phones?: string[];
    showLogoInPrint?: boolean;
  };
}

export function compileShiftReportData(
  appData: AppData,
  filterDate?: string,
  customCashierName?: string
): ShiftReportData {
  const targetDate = filterDate || new Date().toISOString().split('T')[0];
  const settings: Partial<Settings> = appData.settings || {};
  const currentUserObj = appData.users.find((u) => u.id === appData.currentUser) || appData.users[0];
  const cashierName = customCashierName || currentUserObj?.name || 'كاشير الشفت';
  const cashierId = currentUserObj?.id ? `#USR-${currentUserObj.id}` : '#001';

  // Filter sales invoices for target date
  const dateInvoices = (appData.salesInvoices || []).filter((inv: SaleInvoice) => {
    return (inv.date || '').split('T')[0] === targetDate;
  });

  let salesCount = 0;
  let salesGross = 0;
  let salesDiscount = 0;
  let salesNet = 0;
  let cashSalesIn = 0;
  let creditSalesRemaining = 0;
  let returnsCount = 0;
  let returnsGross = 0;
  let returnsDiscount = 0;
  let returnsNet = 0;
  let returnsCashOut = 0;
  let costOfGoodsSold = 0;

  dateInvoices.forEach((inv) => {
    const isRet = inv.type?.startsWith('return_');
    const invSubtotal = Number(inv.subtotal || inv.total || 0);
    const invDiscount = Number(inv.discount || 0);
    const invNet = Number(inv.total !== undefined ? inv.total : Math.max(0, invSubtotal - invDiscount));
    const invPaid = Number(inv.paidAmount !== undefined ? inv.paidAmount : (inv.type === 'nagdi' || inv.type === 'return_nagdi' ? invNet : 0));
    const invRem = Math.max(0, invNet - invPaid);

    let invCogs = 0;
    if (inv.items && inv.items.length > 0) {
      inv.items.forEach((item) => {
        const matchedCatalog = appData.items.find((i) => i.name === item.name || i.id === item.itemId);
        const itemCost = Number(item.costPrice || matchedCatalog?.purchasePrice || 0);
        invCogs += itemCost * Number((item as any).quantity ?? item.qty ?? 1);
      });
    }

    if (isRet) {
      returnsCount += 1;
      returnsGross += invSubtotal;
      returnsDiscount += invDiscount;
      returnsNet += invNet;
      returnsCashOut += invPaid;
      costOfGoodsSold -= invCogs;
    } else {
      salesCount += 1;
      salesGross += invSubtotal;
      salesDiscount += invDiscount;
      salesNet += invNet;
      cashSalesIn += invPaid;
      creditSalesRemaining += invRem;
      costOfGoodsSold += invCogs;
    }
  });

  // Calculate cash receipts & expenses/payments for target date
  const dateCashTxs = (appData.cashTransactions || []).filter(
    (tx) => (tx.date || '').split('T')[0] === targetDate
  );

  const receiptsTotal = dateCashTxs
    .filter((tx) => tx.type === 'receive' || tx.type === 'deposit')
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0);

  const voucherPaymentsTotal = dateCashTxs
    .filter((tx) => tx.type === 'pay' || tx.type === 'withdraw')
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0);

  const dateExpensesList = dateCashTxs.filter(
    (tx) => (tx.type === 'pay' || tx.type === 'withdraw') && !tx.supplierName
  );
  const directExpensesTotal = 0;

  const totalExpenses = dateExpensesList.reduce((acc, tx) => acc + Number(tx.amount || 0), 0);

  const purchasePaidToday = (appData.purchaseInvoices || [])
    .filter((inv) => (inv.date || '').split('T')[0] === targetDate)
    .reduce((acc, inv) => {
      const p = Number(inv.paidAmount !== undefined ? inv.paidAmount : (inv.type === 'nagdi' ? inv.total : 0));
      return inv.type?.startsWith('return_') ? acc - p : acc + p;
    }, 0);

  const totalInvoicesCount = salesCount + returnsCount;
  const totalGross = salesGross - returnsGross;
  const totalDiscount = salesDiscount - returnsDiscount;
  const totalNet = salesNet - returnsNet;
  const grossProfit = totalNet - costOfGoodsSold;
  const netProfit = grossProfit - totalExpenses;

  const activeBranchObj = appData.activeBranchId
    ? appData.branches?.find((b) => b.id === appData.activeBranchId)
    : undefined;
  const branchName = activeBranchObj?.name || 'الفرع الرئيسي';

  const branchCash = activeBranchObj?.id ? appData.branchCashBoxes?.[activeBranchObj.id] : undefined;
  const currentCashDrawer = Number(branchCash?.drawer ?? appData.cashBox?.drawer ?? 0);
  const totalCashPaymentsOut = voucherPaymentsTotal + directExpensesTotal + returnsCashOut + Math.max(0, purchasePaidToday);
  const netTodayCashDelta = cashSalesIn + receiptsTotal - totalCashPaymentsOut;
  const openingCashBalance = currentCashDrawer - netTodayCashDelta;
  const expectedCashBalance = openingCashBalance + cashSalesIn + receiptsTotal - totalCashPaymentsOut;

  const logoSrc = settings.logo || settings.logoUrl || '';

  return {
    cashierName,
    cashierId,
    serialNo: `SHIFT-${targetDate.replace(/-/g, '')}`,
    branch: branchName,
    date: targetDate,
    time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    salesCount,
    salesGross,
    salesDiscount,
    salesNet,
    returnsCount,
    returnsGross,
    returnsDiscount,
    returnsNet,
    totalInvoicesCount,
    totalGross,
    totalDiscount,
    totalNet,
    costOfGoodsSold,
    grossProfit,
    totalExpenses,
    netProfit,
    // Extended cash & variance telemetry
    ...( {
      cashSalesIn,
      creditSalesRemaining,
      receiptsTotal,
      totalCashPaymentsOut,
      openingCashBalance,
      expectedCashBalance,
      actualCashBalance: currentCashDrawer,
    } as any ),
    company: {
      name: settings.companyName || 'منظومة RAKEEZA للمحاسبة والمبيعات',
      companyName: settings.companyName || 'منظومة RAKEEZA للمحاسبة والمبيعات',
      address: settings.address || 'جمهورية مصر العربية',
      logoUrl: logoSrc,
      logo: logoSrc,
      phones: [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[],
      showLogoInPrint: settings.showLogoInPrint !== false,
    },
  };
}

export function generateShiftReportPrintHtml(
  reportData: ShiftReportData,
  appDataOrSettings?: AppData | Settings
): string {
  const serializedData = JSON.stringify(reportData);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تقرير ملخص الشفت والأرباح اليومية</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page {
    size: A4 portrait;
    margin: 6mm;
  }
  * {
    box-sizing: border-box;
  }

  html, body {
    font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, sans-serif;
    background-color: #f8fafc;
    margin: 0; padding: 10px 8px; color: #0f172a;
    width: 100%; min-height: 100%;
    display: flex; flex-direction: column; align-items: center;
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }

  .report-container {
    background: #fff;
    width: 100%; max-width: 210mm;
    margin: 0 auto; padding: 6mm 7mm;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    display: flex; flex-direction: column; gap: 8px;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  }

  .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-bottom: 1.5px solid #0f172a; padding-bottom: 6px; width: 100%; }
  .header.is-empty { display: none !important; }
  .header-right h2 { margin: 0 0 2px 0; font-size: 1.15rem; font-weight: 700; color: #0f172a; }
  .header-right p { margin: 0; font-size: 0.78rem; font-weight: 500; color: #475569; }
  .header-center { text-align: center; }
  .logo-img { max-height: 52px; max-width: 120px; object-fit: contain; }
  .header-left { text-align: left; }
  .phones-list { list-style: none; padding: 0; margin: 0; font-size: 0.76rem; font-weight: 600; color: #334155; direction: ltr; text-align: left; font-variant-numeric: tabular-nums; }
  .phones-list li { margin-bottom: 1px; }

  .info-box { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; font-size: 0.8rem; background-color: #f8fafc; }
  .info-item p { margin: 1px 0; font-weight: 500; color: #1e293b; }

  .table-wrapper { width: 100%; margin-bottom: 4px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; text-align: center; font-size: 0.8rem; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 5px; }
  th { background-color: #f1f5f9; font-weight: 600; color: #0f172a; }
  td { font-weight: 500; font-variant-numeric: tabular-nums; }
  .total-row { font-weight: 700; background-color: #f8fafc; }

  .bottom-section { display: flex; justify-content: flex-end; margin-bottom: 4px; }
  .summary-vertical-list { width: 100%; max-width: 360px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.82rem; overflow: hidden; }
  .summary-line { display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #e2e8f0; font-variant-numeric: tabular-nums; }
  .summary-line:last-child { border-bottom: none; }
  .total-line { font-weight: 700; font-size: 0.92rem; background-color: #f1f5f9; border-top: 1px solid #cbd5e1; }

  .report-footer-note { border-top: 1px solid #cbd5e1; padding-top: 5px; font-size: 0.72rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; width: 100%; color: #64748b; }

  .copyright-outside {
    font-size: 0.72rem;
    font-weight: 600;
    color: #475569;
    margin-top: 8px;
    text-align: center;
    width: 100%;
    direction: rtl;
  }

  @media (max-width: 640px) {
    .report-container { padding: 10px; }
    .summary-vertical-list { max-width: 100%; }
  }

  @media print {
    html, body {
      background-color: #fff !important;
      padding: 0 !important;
      margin: 0 !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
      display: block !important;
    }
    .report-container {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      border: 1px solid #94a3b8 !important;
      border-radius: 0 !important;
      padding: 4mm 6mm !important;
      box-shadow: none !important;
    }
    .table-wrapper { overflow: visible !important; }
    .copyright-outside {
      display: block !important;
      margin-top: 6px !important;
      color: #0f172a !important;
    }
    .no-print { display: none !important; }
  }
  ${getPrintToolbarStyles()}
</style>
</head>
<body>

${getPrintToolbarHtml('تقرير ملخص الشفت والأرباح')}

<div class="report-container">
  <div>
    <!-- 1. الترويسة الديناميكية -->
    <div class="header" id="invoiceHeader">
      <div class="header-right">
        <h2 id="settingCompanyName">منظومة RAKEEZA للمحاسبة والمبيعات</h2>
        <p id="settingCompanyAddress">📍 المركز الرئيسي</p>
      </div>
      <div class="header-center">
        <img id="settingCompanyLogo" class="logo-img" src="" alt="شعار المؤسسة" style="display:none;">
      </div>
      <div class="header-left">
        <ul class="phones-list" id="settingPhonesList"></ul>
      </div>
    </div>

    <!-- 2. صندوق البيانات -->
    <div class="info-box">
      <div class="info-item" style="text-align: right;">
        <p><strong>الكاشير / المسؤول:</strong> <span id="lblCashierName">-</span></p>
        <p><strong>كود المستخدم:</strong> <span id="lblCashierId">-</span></p>
      </div>
      <div class="info-item" style="text-align: center;">
        <p><strong id="lblDocType" style="font-size: 0.95rem;">تقرير ملخص الشفت والأرباح اليومية</strong></p>
        <p><strong>رقم الشفت:</strong> <span id="lblSerialNo">1</span></p>
      </div>
      <div class="info-item" style="text-align: left;">
        <p><strong>الفرع:</strong> <span id="lblBranch">الرئيسي</span></p>
        <p><strong>التاريخ:</strong> <span id="lblReportDate">2026-08-28</span> | <span id="lblReportTime">00:00</span></p>
      </div>
    </div>

    <!-- 3. جدول ملخص الشفت -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th style="width: 35%;">البيــــان</th>
            <th style="width: 15%;">عدد الفواتير</th>
            <th style="width: 25%;">الإجمالي قبل الخصم</th>
            <th style="width: 25%;">صافي القيمة</th>
          </tr>
        </thead>
        <tbody id="shiftSummaryTable">
          <!-- ديناميكي من الجافاسكريبت -->
        </tbody>
      </table>
    </div>

    <!-- 4. الحسابات والمؤشرات المالية للأرباح -->
    <div class="bottom-section">
      <div class="summary-vertical-list">
        <div class="summary-line">
          <span>إجمالي المبيعات الإجمالية:</span>
          <span id="val-gross-sales">0.00 ج.م</span>
        </div>
        <div class="summary-line">
          <span>إجمالي الخصومات الممنوحة:</span>
          <span id="val-total-discount">0.00 ج.م</span>
        </div>
        <div class="summary-line">
          <span>صافي المبيعات (الإيراد الفعلي):</span>
          <span id="val-net-sales">0.00 ج.م</span>
        </div>
        <div class="summary-line">
          <span>تكلفة البضاعة المباعة (COGS):</span>
          <span id="val-cogs">0.00 ج.م</span>
        </div>
        <div class="summary-line">
          <span>مجمل الربح التشغيلي:</span>
          <span id="val-gross-profit" style="color: #1b5e20; font-weight: bold;">0.00 ج.م</span>
        </div>
        <div class="summary-line">
          <span>المصروفات والنثريات خلال الشفت:</span>
          <span id="val-expenses" style="color: #b71c1c;">0.00 ج.م</span>
        </div>
        <div class="summary-line total-line">
          <span>صافي أرباح الشفت (النهائي):</span>
          <span id="val-net-profit" style="color: #1a237e;">0.00 ج.م</span>
        </div>
      </div>
    </div>
  </div>

  <div>
    <div class="report-footer-note">
      <div>* هذا التقرير يوضح الأداء المالي والأرباح التقديرية للشفت بناءً على تكلفة وفواتير البيع المسجلة</div>
      <div>صفحة رقم: 1/1</div>
    </div>
  </div>
</div>

<!-- حقوق الملكية خارج الإطار الخارجي تماماً -->
<div class="copyright-outside">
  جميع حقوق الملكية محفوظة لمطور النظام Mohamed Nazih ت 01029190615
</div>

<script>
  // دالة التنسيق المعيارية للأرقام والمبالغ الإنجليزية 0-9
  function formatMoney(num) {
    const n = Number(num) || 0;
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // 1. ترويسة الشركة
  function setCompanyHeader(companyData) {
    const header = document.getElementById('invoiceHeader');
    let hasData = false;

    if (companyData && (companyData.name || companyData.address || companyData.companyName)) {
      document.getElementById('settingCompanyName').innerText = companyData.companyName || companyData.name || '';
      document.getElementById('settingCompanyAddress').innerText = companyData.address ? '📍 ' + companyData.address : '';
      hasData = true;
    }

    const logoEl = document.getElementById('settingCompanyLogo');
    const logoSrc = companyData ? (companyData.logoUrl || companyData.logo || '') : '';
    if (logoEl && logoSrc && companyData.showLogoInPrint !== false) {
      logoEl.src = logoSrc;
      logoEl.style.display = 'block';
      hasData = true;
    } else if (logoEl) {
      logoEl.style.display = 'none';
    }

    const phonesList = document.getElementById('settingPhonesList');
    if (phonesList) {
      phonesList.innerHTML = '';
      const phoneArr = companyData ? (companyData.phones || [companyData.phone1, companyData.phone2, companyData.phone3].filter(Boolean)) : [];
      if (phoneArr && phoneArr.length > 0) {
        phoneArr.slice(0, 3).forEach((phone) => {
          if (phone) {
            const li = document.createElement('li');
            li.innerText = '📞 ' + phone;
            phonesList.appendChild(li);
          }
        });
        hasData = true;
      }
    }

    if (!hasData && header) header.classList.add('is-empty');
    else if (header) header.classList.remove('is-empty');
  }

  // 2. تحميل بيانات الشفت
  function loadShiftData(data) {
    document.getElementById('lblCashierName').innerText = data.cashierName || 'مدير النظام';
    document.getElementById('lblCashierId').innerText = data.cashierId || '#001';
    document.getElementById('lblSerialNo').innerText = data.serialNo || '1';
    document.getElementById('lblBranch').innerText = data.branch || 'الرئيسي';
    document.getElementById('lblReportDate').innerText = data.date || '';
    document.getElementById('lblReportTime').innerText = data.time || '';

    const tbody = document.getElementById('shiftSummaryTable');
    tbody.innerHTML = \`
      <tr>
        <td style="text-align: right; padding-right: 8px;">إجمالي المبيعات (فواتير الصادرة)</td>
        <td><strong>\${data.salesCount || 0}</strong></td>
        <td>\${formatMoney(data.salesGross || 0)} ج.م</td>
        <td><strong>\${formatMoney(data.salesNet || 0)} ج.م</strong></td>
      </tr>
      <tr>
        <td style="text-align: right; padding-right: 8px;">مردودات ومسترجعات المبيعات</td>
        <td><strong>\${data.returnsCount || 0}</strong></td>
        <td>\${formatMoney(data.returnsGross || 0)} ج.م</td>
        <td><strong>\${formatMoney(data.returnsNet || 0)} ج.م</strong></td>
      </tr>
      <tr class="total-row">
        <td style="text-align: right; padding-right: 8px;">صافي العمليات التجارية للشفت</td>
        <td><strong>\${data.totalInvoicesCount || 0}</strong></td>
        <td>\${formatMoney(data.totalGross || 0)} ج.م</td>
        <td><strong>\${formatMoney(data.totalNet || 0)} ج.م</strong></td>
      </tr>
    \`;

    document.getElementById('val-gross-sales').innerText = formatMoney(data.salesGross || 0) + ' ج.م';
    document.getElementById('val-total-discount').innerText = formatMoney(data.salesDiscount || 0) + ' ج.م';
    document.getElementById('val-net-sales').innerText = formatMoney(data.totalNet || 0) + ' ج.م';
    document.getElementById('val-cogs').innerText = formatMoney(data.costOfGoodsSold || 0) + ' ج.م';
    document.getElementById('val-gross-profit').innerText = formatMoney(data.grossProfit || 0) + ' ج.م';
    document.getElementById('val-expenses').innerText = formatMoney(data.totalExpenses || 0) + ' ج.م';

    const netProfitEl = document.getElementById('val-net-profit');
    netProfitEl.innerText = formatMoney(data.netProfit || 0) + ' ج.م';
    if ((data.netProfit || 0) < 0) {
      netProfitEl.style.color = '#b71c1c';
    } else {
      netProfitEl.style.color = '#1a237e';
    }
  }

  const shiftData = ${serializedData};

  if (shiftData.company) {
    setCompanyHeader(shiftData.company);
  }

  loadShiftData(shiftData);
</script>

${getPrintToolbarScript()}

</body>
</html>`;
}

export function printShiftReportWindow(
  appData: AppData,
  filterDate?: string,
  customCashierName?: string,
  showToast?: (msg: string, type: 'warning' | 'error' | 'success' | 'info') => void
) {
  const shiftData = compileShiftReportData(appData, filterDate, customCashierName);

  // 🖨️ Dispatch to Centralized Universal Print Modal using dedicated shift_closing template
  try {
    const curSymbol = appData.settings?.currencySymbol || 'ج.م';
    const ext = shiftData as any;
    const totalInvoices = shiftData.totalInvoicesCount || (shiftData.salesCount || 0) + (shiftData.returnsCount || 0);
    const cashSales = Number(ext.cashSalesIn || 0);
    const creditSales = Number(ext.creditSalesRemaining || 0);
    const receipts = Number(ext.receiptsTotal || 0);
    const payments = Number(ext.totalCashPaymentsOut || shiftData.totalExpenses || 0);
    const opening = Number(ext.openingCashBalance || 0);
    const expected = Number(ext.expectedCashBalance || 0);
    const actual = Number(ext.actualCashBalance ?? expected);
    const variance = actual - expected;

    openUniversalPrint({
      kind: 'shift_closing',
      title: 'تقرير إغلاق الوردية واليومية',
      docNumber: shiftData.serialNo || 1,
      date: shiftData.date || new Date().toISOString().split('T')[0],
      time: shiftData.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      branch: shiftData.branch || 'الفرع الرئيسي',
      user: shiftData.cashierName || 'كاشير الوردية',
      partyName: shiftData.cashierName || 'كاشير الوردية',
      partyLabel: 'الكاشير المسؤول',
      columns: ['الحركة / البند', 'القيمة', 'ملاحظات'],
      rows: [
        ['مبيعات نقدية محصلة', cashSales.toFixed(2), `${shiftData.salesCount || 0} فاتورة صادرة`],
        ['مبيعات آجلة (متبقية)', creditSales.toFixed(2), 'على حسابات العملاء'],
        ['مرتجعات المبيعات', (shiftData.returnsNet || 0).toFixed(2), `${shiftData.returnsCount || 0} إذن مرتجع`],
        ['تحصيلات وسندات قبض', receipts.toFixed(2), 'دفعات وتحصيلات نقدية'],
        ['مصروفات ومدفوعات', payments.toFixed(2), 'سندات صرف ومشتريات ومصروفات'],
        ['تكلفة البضاعة المباعة (COGS)', (shiftData.costOfGoodsSold || 0).toFixed(2), `إجمالي الفواتير: ${totalInvoices}`],
        ['صافي ربح الوردية', (shiftData.netProfit || 0).toFixed(2), 'بعد خصم التكلفة والمصروفات'],
      ],
      shiftMetrics: {
        opening,
        cashSales,
        creditSales,
        returns: shiftData.returnsNet || 0,
        receipts,
        payments,
        expenses: shiftData.totalExpenses || 0,
        profit: shiftData.netProfit || 0,
        expected,
        actual,
        variance,
      },
      amount: expected,
      summaries: [
        { label: 'الرصيد المتوقع', value: `${expected.toFixed(2)} ${curSymbol}` },
        { label: 'الرصيد الفعلي', value: `${actual.toFixed(2)} ${curSymbol}` },
        { label: 'العجز / الزيادة', value: `${variance.toFixed(2)} ${curSymbol}`, isTotal: true },
      ],
      signatures: ['كاشير الوردية', 'المراجع المالي', 'الاعتماد'],
      settings: appData.settings,
      preferredPaperSize: 'a5-portrait',
    });
    showToast?.('تم تجهيز تقرير إغلاق الوردية للمعاينة والطباعة بنجاح', 'success');
  } catch (err) {
    console.error('Error dispatching shift report print:', err);
    showToast?.('حدث خطأ أثناء تجهيز تقرير الوردية للطباعة', 'error');
  }
}


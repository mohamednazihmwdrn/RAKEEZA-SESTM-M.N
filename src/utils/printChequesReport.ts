import { AppData, Cheque, Settings } from '../types';
import { tafqeetArabic } from './tafqeet';
import { getPrintToolbarStyles, getPrintToolbarHtml, getPrintToolbarScript } from './printToolbarHelper';

export interface ChequeReportOptions {
  cheques?: Cheque[];
  title?: string;
  bankFilter?: string;
  fromDate?: string;
  toDate?: string;
  filterType?: 'all' | 'receivable' | 'payable';
  filterStatus?: string;
  extractorName?: string;
}

/**
 * Generates the unified print HTML for an individual Cheque Voucher / Note (إشعار استلام / صرف شيك - ورقة قبض / ورقة دفع)
 */
export function generateChequeVoucherPrintHtml(cheque: Cheque, appData: AppData): string {
  const settings: Partial<Settings> = appData.settings || {};
  const companyName = settings.companyName || 'RAKEEZA';
  const companySubtitle = settings.address || 'الفرع الرئيسي - ش المعهد الديني';
  const logoSrc = settings.logo || settings.logoUrl || '';
  const showLogo = settings.showLogoInPrint !== false && Boolean(logoSrc);
  const paperSize = settings.paperSize || 'A4';
  const pageMargin = settings.pageMargin !== undefined ? settings.pageMargin : 4;

  const phoneNumbers = [
    settings.phone1,
    settings.phone2,
    settings.phone3,
  ].filter(Boolean) as string[];
  const finalPhones = phoneNumbers.length > 0 ? phoneNumbers : ['01029190615'];

  const now = new Date();
  const printDate = now.toLocaleDateString('ar-EG');
  const printTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const currentUserObj = appData.users?.find((u) => u.id === appData.currentUser) || appData.users?.[0];
  const creatorName = cheque.createdBy || currentUserObj?.name || 'Mohamed Nazih';

  const isReceivable = cheque.type === 'receivable';
  const docTitle = isReceivable ? 'إشعار استلام شيك (ورقة قبض)' : 'إشعار صرف شيك (ورقة دفع)';
  const docNumber = isReceivable
    ? (cheque.chequeNumber.startsWith('REC-') ? cheque.chequeNumber : `REC-CHK-${cheque.chequeNumber}`)
    : (cheque.chequeNumber.startsWith('PAY-') ? cheque.chequeNumber : `PAY-CHK-${cheque.chequeNumber}`);

  const partyLabel = isReceivable ? 'استلمنا من السيد / الشركة:' : 'اصرفوا إلى السيد / الشركة:';
  const partyName = isReceivable ? (cheque.drawerName || 'العميل') : (cheque.beneficiaryName || 'المورد');
  const actionTypeLabel = isReceivable ? 'استلام ورقة قبض' : 'إصدار ورقة دفع';
  const actionTypeColor = isReceivable ? '#2563eb' : '#7c3aed';

  const formattedAmount = (cheque.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const amountWords = tafqeetArabic(cheque.amount || 0, { currency: 'جنيه مصري', fractionName: 'قرش' });

  let statusLabel = 'تحت التحصيل';
  let statusColor = '#d97706';
  if (cheque.status === 'collected') {
    statusLabel = 'تم التحصيل بالبنك';
    statusColor = '#16a34a';
  } else if (cheque.status === 'bounced') {
    statusLabel = 'مرتجع (بدون رصيد)';
    statusColor = '#dc2626';
  } else if (cheque.status === 'endorsed') {
    statusLabel = 'مظهر لمورد';
    statusColor = '#7c3aed';
  } else if (cheque.type === 'payable') {
    statusLabel = 'مستحق الصرف';
    statusColor = '#2563eb';
  } else if (cheque.status === 'received') {
    statusLabel = 'مستلم بالحافظة';
    statusColor = '#d97706';
  }

  // Account / Branch Number
  const matchedBank = appData.bankAccounts?.find((b) => b.id === cheque.collectingBankAccountId);
  const accountBranch = matchedBank ? `${matchedBank.name} (${matchedBank.accountNumber})` : (cheque.bankName || 'خزينة المركز الرئيسي');
  const portfolioLabel = isReceivable ? 'خزينة الأوراق المالية (حافظة واردة)' : 'خزينة أوراق الدفع (شيكات صادرة)';

  const reasonText = cheque.notes || (isReceivable
    ? `سداد دفعة من الحساب الجاري والمعاملات التجارية الخاصة بالطرف (${partyName})، وذلك حسب الاتفاق المالي المبرم.`
    : `سداد دفعة ومستحقات تجارية لصالح الطرف المستفيد (${partyName})، وذلك بموجب المعاملات المعتمدة.`);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${docTitle}</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --page-size: ${paperSize === 'A5' ? 'A5 portrait' : paperSize === 'Letter' ? 'letter portrait' : 'A4 portrait'};
    --page-margin: ${pageMargin}mm;
  }
  @page { size: var(--page-size, auto); margin: var(--page-margin, 6mm); }
  * { box-sizing: border-box; }

  html, body {
    font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, sans-serif;
    background-color: #f8fafc; margin: 0; padding: 10px 8px; color: #0f172a;
    width: 100%; min-height: 100%; display: flex; flex-direction: column; align-items: center;
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }

  .report-container {
    background: #fff; width: 100%; max-width: 210mm;
    margin: 0 auto; padding: 7mm 8mm; border: 1px solid #cbd5e1; border-radius: 4px;
    display: flex; flex-direction: column; gap: 10px;
    box-sizing: border-box;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  }

  .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; width: 100%; }
  .header-right h2 { margin: 0 0 2px 0; font-size: 1.15rem; font-weight: 700; color: #0f172a; }
  .header-right p { margin: 0; font-size: 0.78rem; color: #475569; font-weight: 500; }
  .header-center { text-align: center; }
  .logo-img { max-width: 85px; max-height: 50px; object-fit: contain; }
  .header-left { text-align: left; }
  .phones-list { list-style: none; padding: 0; margin: 0; font-size: 0.78rem; direction: ltr; text-align: left; color: #334155; font-variant-numeric: tabular-nums; }
  .phones-list li { margin-bottom: 2px; font-weight: 600; }

  .doc-title { text-align: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 18px; margin: 0 auto; background-color: #f8fafc; font-weight: 700; font-size: 1rem; color: #0f172a; width: fit-content; }

  .info-box {
    display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;
    border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 12px;
    font-size: 0.8rem; line-height: 1.45; width: 100%; background-color: #f8fafc;
  }
  .info-item p { margin: 2px 0; font-weight: 500; color: #1e293b; }

  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; }
  .kpi-card { border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; text-align: center; background-color: #f8fafc; }
  .kpi-card .kpi-title { font-size: 0.74rem; font-weight: 600; color: #475569; }
  .kpi-card .kpi-value { font-size: 1.05rem; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }

  .table-wrapper { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 6px; text-align: center; font-size: 0.78rem; }
  th { background-color: #f1f5f9; font-weight: 600; color: #0f172a; }
  td { font-weight: 500; font-variant-numeric: tabular-nums; }

  .text-details { border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 10px; font-size: 0.8rem; line-height: 1.6; background-color: #fff; color: #1e293b; }

  .bottom-section { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 12px; margin-bottom: 6px; width: 100%; font-size: 0.8rem; font-weight: 600; color: #334155; }
  .report-footer-note { border-top: 1px solid #cbd5e1; padding-top: 6px; margin-top: 6px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 0.72rem; font-weight: 500; color: #64748b; width: 100%; }
  .copyright-outside {
    width: 100%;
    text-align: center;
    font-size: 0.72rem;
    font-weight: 600;
    color: #475569;
    margin-top: 8px;
    padding: 4px 0;
    direction: rtl;
  }

  @media (max-width: 640px) {
    .kpi-grid { grid-template-columns: 1fr; }
    .report-container { padding: 10px; }
  }

  @media print {
    html, body {
      background: #fff !important;
      padding: 0 !important;
      margin: 0 !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
      display: block !important;
    }
    .report-container {
      border: 1px solid #94a3b8 !important;
      border-radius: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      padding: 5mm 6mm !important;
      box-shadow: none !important;
    }
    .table-wrapper { overflow: visible !important; }
    .copyright-outside {
      display: block !important;
      margin-top: 6px !important;
      font-size: 0.72rem !important;
      color: #0f172a !important;
    }
    .no-print { display: none !important; }
  }
  ${getPrintToolbarStyles()}
</style>
</head>
<body>

${getPrintToolbarHtml(docTitle + ' #' + cheque.chequeNumber)}

<div class="report-container">
  <div>
    <!-- الترويسة -->
    <div class="header">
      <div class="header-right">
        <h2>${companyName}</h2>
        <p>${companySubtitle}</p>
      </div>
      <div class="header-center">
        ${showLogo ? `<img src="${logoSrc}" alt="Logo" class="logo-img" />` : ''}
      </div>
      <div class="header-left">
        <ul class="phones-list">
          ${finalPhones.map((p) => `<li>${p}</li>`).join('')}
        </ul>
      </div>
    </div>

    <!-- عنوان الإشعار (استلام / صرف) -->
    <div class="doc-title">
      ${docTitle}
    </div>

    <!-- صندوق البيانات -->
    <div class="info-box">
      <div class="info-item" style="text-align: right;">
        <p><strong>رقم الإشعار:</strong> <span style="font-weight:bold;">${docNumber}</span></p>
        <p><strong>${partyLabel}</strong> <span style="font-weight:bold;">${partyName}</span></p>
      </div>
      <div class="info-item" style="text-align: center;">
        <p><strong>نوع الإجراء:</strong> <span style="color:${actionTypeColor}; font-weight:bold;">${actionTypeLabel}</span></p>
        <p><strong>مُحرر السند:</strong> <span>${creatorName}</span></p>
      </div>
      <div class="info-item" style="text-align: left;">
        <p><strong>تاريخ الإشعار:</strong> <span id="lblPrintDate">${printDate}</span></p>
        <p><strong>وقت التسجيل:</strong> <span id="lblPrintTime">${printTime}</span></p>
      </div>
    </div>

    <!-- كروت قيمة الشيك والتفقيط -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">مبلغ الشيك (بالأرقام)</div>
        <div class="kpi-value" style="color:#16a34a;">${formattedAmount} ج.م</div>
      </div>
      <div class="kpi-card" style="grid-column: span 2;">
        <div class="kpi-title">المبلغ بالحروف (فقط وقدره)</div>
        <div class="kpi-value" style="font-size: 0.85rem; padding-top:2px;">${amountWords}</div>
      </div>
    </div>

    <!-- جدول بيانات الشيك التفصيلية -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th style="width: 15%;">رقم الشيك</th>
            <th style="width: 25%;">البنك المسحوب عليه</th>
            <th style="width: 15%;">تاريخ الاستحقاق</th>
            <th style="width: 15%;">رقم الحساب / الفرع</th>
            <th style="width: 15%;">حالة الورقة</th>
            <th style="width: 15%;">حافظة الإيداع</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight:bold;">${cheque.chequeNumber.startsWith('CHK-') || cheque.chequeNumber.startsWith('PAY-') ? cheque.chequeNumber : (isReceivable ? 'CHK-' : 'PAY-') + cheque.chequeNumber}</td>
            <td>${cheque.bankName || 'البنك المسحوب عليه'}</td>
            <td>${cheque.dueDate || '-'}</td>
            <td>${accountBranch}</td>
            <td style="color:${statusColor}; font-weight:bold;">${statusLabel}</td>
            <td>${portfolioLabel}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- التفاصيل والسبب -->
    <div class="text-details">
      <strong>البيان / سبب الإجراء:</strong> 
      ${reasonText}
    </div>

    <!-- التوقيعات -->
    <div class="bottom-section">
      ${
        isReceivable
          ? `<div>المستلم / أمين الخزينة: ....................</div>
             <div>المراجع المالي: ....................</div>
             <div>توقيع وتسليم العميل/الساحب: ....................</div>`
          : `<div>المُحرر / أمين الخزينة: ....................</div>
             <div>المراجع المالي: ....................</div>
             <div>توقيع واستلام المستفيد/المورد: ....................</div>`
      }
    </div>
  </div>

  <div>
    <div class="report-footer-note">
      <div>* يعتبر هذا الإشعار مبدئياً ولا تبرأ ذمة المحرر إلا بعد سداد/تحصيل قيمة الشيك فعلياً بالحساب البنكي</div>
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

/**
 * Triggers printing of an individual Cheque Voucher / Note
 */
export function printChequeVoucher(cheque: Cheque, appData: AppData): void {
  const html = generateChequeVoucherPrintHtml(cheque, appData);
  const printWin = window.open('', '_blank', 'width=1000,height=850');
  if (!printWin) {
    alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
    return;
  }
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}

/**
 * Generates the unified print HTML for Cheques, Notes Receivable & Payable (تقرير الشيكات وأوراق القبض والدفع)
 */
export function generateChequesReportPrintHtml(options: ChequeReportOptions, appData: AppData): string {
  const settings: Partial<Settings> = appData.settings || {};
  const companyName = settings.companyName || 'RAKEEZA';
  const companySubtitle = settings.address || 'الفرع الرئيسي - ش المعهد الديني';
  const logoSrc = settings.logo || settings.logoUrl || '';
  const showLogo = settings.showLogoInPrint !== false && Boolean(logoSrc);
  const paperSize = settings.paperSize || 'A4';
  const pageMargin = settings.pageMargin !== undefined ? settings.pageMargin : 4;

  const phoneNumbers = [
    settings.phone1,
    settings.phone2,
    settings.phone3,
  ].filter(Boolean) as string[];
  const finalPhones = phoneNumbers.length > 0 ? phoneNumbers : ['01029190615'];

  const now = new Date();
  const printDate = now.toLocaleDateString('ar-EG');
  const printTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const currentUserObj = appData.users?.find((u) => u.id === appData.currentUser) || appData.users?.[0];
  const extractor = options.extractorName || currentUserObj?.name || 'Mohamed Nazih';

  const fromDate = options.fromDate || '2026-01-01';
  const toDate = options.toDate || now.toISOString().substring(0, 10);
  const bankTitle = options.bankFilter ? options.bankFilter : 'جميع البنوك والحافظات';
  const reportTitle = options.title || 'تقرير حركة الشيكات وأوراق القبض/الدفع';

  // Base dataset
  let chequesList = options.cheques || appData.cheques || [];

  if (options.filterType && options.filterType !== 'all') {
    chequesList = chequesList.filter((c) => c.type === options.filterType);
  }
  if (options.filterStatus && options.filterStatus !== 'all') {
    chequesList = chequesList.filter((c) => c.status === options.filterStatus);
  }

  // Calculate comprehensive KPIs
  const allCheques = appData.cheques || [];
  
  // 1. أوراق قبض تحت التحصيل
  const pendingReceivableTotal = allCheques
    .filter((c) => c.type === 'receivable' && (c.status === 'received' || c.status === 'under_collection'))
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  // 2. أوراق قبض محصلة
  const collectedReceivableTotal = allCheques
    .filter((c) => c.type === 'receivable' && c.status === 'collected')
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  // 3. أوراق دفع مستحقة علينا
  const pendingPayableTotal = allCheques
    .filter((c) => c.type === 'payable' && (c.status === 'received' || c.status === 'under_collection'))
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  // 4. شيكات مرتجعة / مرفوضة
  const bouncedTotal = allCheques
    .filter((c) => c.status === 'bounced')
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  // Rows and totals for displayed table
  let displayedTotal = 0;
  const rowsHtml = chequesList
    .map((c) => {
      displayedTotal += c.amount || 0;
      const isRec = c.type === 'receivable';
      const typeClass = isRec ? 'type-rec' : 'type-pay';
      const typeLabel = isRec ? 'قبض (شيك)' : 'دفع (شيك)';
      const party = isRec ? c.drawerName : c.beneficiaryName;

      let statusClass = 'status-pending';
      let statusLabel = 'تحت التحصيل';
      if (c.status === 'collected') {
        statusClass = 'status-collected';
        statusLabel = 'تم التحصيل';
      } else if (c.status === 'bounced') {
        statusClass = 'status-rejected';
        statusLabel = 'مرتجع (بدون رصيد)';
      } else if (c.status === 'endorsed') {
        statusClass = 'type-pay';
        statusLabel = 'مظهر لمورد';
      } else if (c.type === 'payable') {
        statusLabel = 'مستحق الصرف';
      }

      let note = c.notes || '';
      if (c.status === 'collected' && !note) note = 'مضاف للحساب';
      if (c.status === 'bounced' && !note) note = 'تم إعادته للعميل';
      if (c.status === 'endorsed' && c.endorsedToSupplier) note = `مظهر إلى: ${c.endorsedToSupplier}`;
      if (!note) note = isRec ? 'حافظة شيكات واردة' : 'خزينة أوراق الدفع';

      return `<tr>
        <td style="font-family: monospace; font-weight: bold;">${c.chequeNumber.startsWith('CHK-') || c.chequeNumber.startsWith('PAY-') ? c.chequeNumber : (isRec ? 'CHK-' : 'PAY-') + c.chequeNumber}</td>
        <td class="${typeClass}">${typeLabel}</td>
        <td style="text-align: right; font-weight: 600;">${party}</td>
        <td>${c.bankName}</td>
        <td>${c.dueDate || '-'}</td>
        <td style="font-weight: bold;">${(c.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="${statusClass}">${statusLabel}</td>
        <td>${note}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تقرير الشيكات وأوراق القبض والدفع</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --page-size: ${paperSize === 'A5' ? 'A5 portrait' : paperSize === 'Letter' ? 'letter portrait' : 'A4 portrait'};
    --page-margin: ${pageMargin}mm;
  }
  @page { size: var(--page-size, auto); margin: var(--page-margin, 6mm); }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, sans-serif;
    background-color: #f8fafc; margin: 0; padding: 10px 8px; color: #0f172a;
    width: 100%; min-height: 100%; display: flex; flex-direction: column; align-items: center;
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }

  .report-container {
    background: #fff; width: 100%; max-width: 210mm;
    margin: 0 auto; padding: 6mm 7mm; border: 1px solid #cbd5e1; border-radius: 4px;
    display: flex; flex-direction: column; gap: 8px;
    box-sizing: border-box;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  }

  .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-bottom: 1.5px solid #0f172a; padding-bottom: 6px; width: 100%; }
  .header-right h2 { margin: 0 0 2px 0; font-size: 1.1rem; font-weight: 700; color: #0f172a; }
  .header-right p { margin: 0; font-size: 0.76rem; color: #475569; font-weight: 500; }
  .header-center { text-align: center; }
  .logo-img { max-width: 85px; max-height: 50px; object-fit: contain; }
  .header-left { text-align: left; }
  .phones-list { list-style: none; padding: 0; margin: 0; font-size: 0.76rem; direction: ltr; text-align: left; color: #334155; font-variant-numeric: tabular-nums; }
  .phones-list li { margin-bottom: 1px; font-weight: 600; }

  .info-box {
    display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;
    border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px;
    font-size: 0.78rem; line-height: 1.4; width: 100%; background-color: #f8fafc;
  }
  .info-item p { margin: 1px 0; font-weight: 500; color: #1e293b; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; width: 100%; }
  .kpi-card { border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; text-align: center; background-color: #f8fafc; }
  .kpi-card .kpi-title { font-size: 0.72rem; font-weight: 600; color: #475569; }
  .kpi-card .kpi-value { font-size: 0.94rem; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }

  .table-wrapper { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 5px; text-align: center; font-size: 0.75rem; }
  th { background-color: #f1f5f9; font-weight: 600; color: #0f172a; }
  td { font-weight: 500; font-variant-numeric: tabular-nums; }
  tfoot tr { background-color: #f8fafc; font-weight: 700; }

  .status-pending { color: #b45309; font-weight: 600; }
  .status-collected { color: #15803d; font-weight: 600; }
  .status-rejected { color: #dc2626; font-weight: 600; }
  .type-rec { color: #1d4ed8; font-weight: 600; }
  .type-pay { color: #6d28d9; font-weight: 600; }

  .bottom-section { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 8px; margin-bottom: 4px; width: 100%; font-size: 0.78rem; font-weight: 600; color: #334155; }
  .report-footer-note { border-top: 1px solid #cbd5e1; padding-top: 5px; margin-top: 4px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 0.72rem; font-weight: 500; color: #64748b; width: 100%; }
  .copyright-outside {
    width: 100%;
    text-align: center;
    font-size: 0.72rem;
    font-weight: 600;
    color: #475569;
    margin-top: 8px;
    padding: 4px 0;
    direction: rtl;
  }

  @media (max-width: 768px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .report-container { padding: 10px; }
  }

  @media print {
    html, body {
      background: #fff !important;
      padding: 0 !important;
      margin: 0 !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
      display: block !important;
    }
    .report-container {
      border: 1px solid #94a3b8 !important;
      border-radius: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      padding: 4mm 6mm !important;
      box-shadow: none !important;
    }
    .table-wrapper { overflow: visible !important; }
    .copyright-outside {
      display: block !important;
      margin-top: 6px !important;
      font-size: 0.72rem !important;
      color: #0f172a !important;
    }
    .no-print { display: none !important; }
  }
  ${getPrintToolbarStyles()}
</style>
</head>
<body>

${getPrintToolbarHtml(reportTitle)}

<div class="report-container">
  <div>
    <!-- الترويسة -->
    <div class="header">
      <div class="header-right">
        <h2>${companyName}</h2>
        <p>${companySubtitle}</p>
      </div>
      <div class="header-center">
        ${showLogo ? `<img src="${logoSrc}" alt="Logo" class="logo-img" />` : ''}
      </div>
      <div class="header-left">
        <ul class="phones-list">
          ${finalPhones.map((p) => `<li>${p}</li>`).join('')}
        </ul>
      </div>
    </div>

    <!-- صندوق البيانات والفلترة -->
    <div class="info-box">
      <div class="info-item" style="text-align: right;">
        <p><strong>نوع التقرير:</strong> <span style="font-weight:bold; font-size:0.85rem;">${reportTitle}</span></p>
        <p><strong>الفرع / البنك:</strong> <span>${bankTitle}</span></p>
      </div>
      <div class="info-item" style="text-align: center;">
        <p><strong>الفترة من:</strong> <span>${fromDate}</span> <strong>إلى:</strong> <span>${toDate}</span></p>
        <p><strong>مُستخرج التقرير:</strong> <span>${extractor}</span></p>
      </div>
      <div class="info-item" style="text-align: left;">
        <p><strong>تاريخ الاستخراج:</strong> <span id="lblPrintDate">${printDate}</span></p>
        <p><strong>وقت الطباعة:</strong> <span id="lblPrintTime">${printTime}</span></p>
      </div>
    </div>

    <!-- كروت المؤشرات الخاصة بالأوراق المالية -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">أوراق قبض (تحت التحصيل)</div>
        <div class="kpi-value status-pending">${(pendingReceivableTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">أوراق قبض (مُحصلة)</div>
        <div class="kpi-value status-collected">${(collectedReceivableTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">أوراق دفع مستحقة (علينا)</div>
        <div class="kpi-value type-pay">${(pendingPayableTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">شيكات مرتجعة / مرفوضة</div>
        <div class="kpi-value status-rejected">${(bouncedTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</div>
      </div>
    </div>

    <!-- جدول الشيكات وأوراق القبض والدفع -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th style="width: 8%;">رقم الورقة</th>
            <th style="width: 9%;">نوع الورقة</th>
            <th style="width: 22%; text-align: right;">الطرف الثاني (العميل/المورد)</th>
            <th style="width: 12%;">البنك المسحوب عليه</th>
            <th style="width: 9%;">تاريخ الاستحقاق</th>
            <th style="width: 11%;">المبلغ</th>
            <th style="width: 11%;">حالة الورقة</th>
            <th style="width: 18%;">ملاحظات / الخزينة</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="8" style="padding:16px;color:#888;">لا توجد أوراق تجارية أو شيكات مسجلة</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4">الإجمالـــي العام للأوراق المعروضة</td>
            <td>-</td>
            <td style="font-weight:bold;">${(displayedTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td colspan="2">صافي الأوراق النشطة</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- التوقيعات -->
    <div class="bottom-section">
      <div>مسؤول الأوراق المالية: ....................</div>
      <div>المراجع المالي: ....................</div>
      <div>اعتماد المدير العام: ....................</div>
    </div>
  </div>

  <div>
    <div class="report-footer-note">
      <div>* هذا التقرير كشف حساب تفصيلي بحركة الأوراق المالية (الشيكات والكمبيالات) ولا يعد إيصال سداد رسمي</div>
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

/**
 * Triggers printing of the Cheques and Notes Report
 */
export function printChequesReport(options: ChequeReportOptions, appData: AppData): void {
  const html = generateChequesReportPrintHtml(options, appData);
  const printWin = window.open('', '_blank', 'width=1100,height=900');
  if (!printWin) {
    alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
    return;
  }
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}

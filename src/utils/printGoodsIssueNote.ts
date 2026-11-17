import { AppData, GoodsIssueVoucher, Settings } from '../types';
import { getPrintToolbarStyles, getPrintToolbarHtml, getPrintToolbarScript } from './printToolbarHelper';
import { openUniversalPrint } from '../services/centralizedPrintService';

/**
 * Generate Ultra-Precise HTML for Goods Issue Note (إذن صرف مخزني)
 * Built to 100% exact ERP standards matching official warehouse management systems.
 */
export function generateGoodsIssuePrintHtml(
  issue: GoodsIssueVoucher,
  appData: AppData
): string {
  const company = appData.settings || {
    companyName: 'منظومة RAKEEZA للمحاسبة والمستودعات',
    address: 'القاهرة، جمهورية مصر العربية',
    phone1: '01029190615',
    phone2: '',
    phone3: '',
    taxNumber: '123-456-789',
    currencySymbol: 'ج.م',
    showLogoInPrint: true,
    notes: '',
    defaultTaxRate: 14,
  };

  const currency = company.currencySymbol || 'ج.م';
  const issueDate = issue.date || new Date().toISOString().split('T')[0];
  const printTime =
    issue.time ||
    new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

  const totalItemsCount = issue.items?.length || 0;
  const totalQty = issue.items?.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) || 0;
  const grandTotalCost =
    issue.items?.reduce((sum, item) => sum + (Number(item.totalCost) || Number(item.qty) * Number(item.unitCost) || 0), 0) ||
    issue.totalCost ||
    0;

  const phoneNumbers = [company.phone1, company.phone2, company.phone3].filter(Boolean);
  const phonesHtml =
    phoneNumbers.length > 0
      ? phoneNumbers.map((p) => `<li>${p}</li>`).join('')
      : '<li>01029190615</li>';

  const logoSrc = (company.showLogoInPrint !== false && (company.logo || company.logoUrl)) ? (company.logo || company.logoUrl) : '';

  const tableRowsHtml = issue.items?.length
    ? issue.items
        .map(
          (item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.code || `ITM-${String(idx + 1).padStart(3, '0')}`}</td>
        <td class="text-right">${item.name || 'صنف غير مسمى'}</td>
        <td>${item.unit || 'قطعة'}</td>
        <td class="amount-cell">${(Number(item.qty) || 0).toLocaleString('en-US')}</td>
        <td class="amount-cell">${(Number(item.unitCost) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="amount-cell">${(Number(item.totalCost) || Number(item.qty || 0) * Number(item.unitCost || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `
        )
        .join('')
    : `
      <tr>
        <td colspan="7" style="padding: 15px; color: #777;">لا توجد أصناف مسجلة في هذا الإذن</td>
      </tr>
    `;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>إذن صرف مخزني - ${issue.voucherNumber || 'GIN'}</title>
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
  .phone-list { list-style: none; padding: 0; margin: 0; font-size: 0.75rem; direction: ltr; text-align: left; color: #334155; }
  .logo-img { max-height: 48px; max-width: 130px; object-fit: contain; }

  .info-box {
    display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; border: 1px solid #cbd5e1; border-radius: 4px;
    padding: 6px 10px; margin-bottom: 8px; font-size: 0.78rem; background: #f8fafc; line-height: 1.45;
  }
  .info-item { display: flex; flex-direction: column; gap: 2px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px; margin-bottom: 8px; }
  .kpi-card { border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; text-align: center; background: #f8fafc; }
  .kpi-title { font-size: 0.72rem; font-weight: 500; color: #475569; margin-bottom: 2px; }
  .kpi-value { font-size: 0.92rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .kpi-total { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }

  .table-container { width: 100%; overflow-x: auto; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 6px; font-size: 0.75rem; text-align: center; font-variant-numeric: tabular-nums; }
  th { background-color: #f1f5f9; color: #0f172a; font-weight: 600; }
  .text-right { text-align: right; padding-right: 6px; }
  .amount-cell { font-weight: 600; font-variant-numeric: tabular-nums; }
  tfoot tr { background-color: #f1f5f9; font-weight: 600; }

  .notes-section { border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 8px; font-size: 0.75rem; margin-bottom: 8px; background: #fff; }
  .notes-title { font-weight: 600; margin-bottom: 2px; color: #0f172a; }

  .signatures { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-bottom: 6px; font-size: 0.76rem; font-weight: 600; padding: 0 6px; }
  .footer { border-top: 1px solid #cbd5e1; padding-top: 5px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; font-size: 0.7rem; color: #475569; }
  .copyright-outside { font-size: 0.72rem; font-weight: 500; text-align: center; padding: 6px 0; width: 100%; color: #64748b; }

  ${getPrintToolbarStyles()}

  @media print {
    html, body { background: #fff !important; width: 100% !important; height: auto !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; }
    .no-print, .no-print-toolbar { display: none !important; }
    .report-container { border: none !important; height: auto !important; width: 100% !important; max-width: 100% !important; padding: 0 !important; box-shadow: none !important; }
    .table-container { overflow: visible !important; }
  }
</style>
</head>
<body>

  ${getPrintToolbarHtml('إذن صرف مخزني #' + (issue.voucherNumber || 'GIN'))}

  <div class="report-container">
    
    <!-- 1. الترويسة -->
    <div class="header">
      <div class="header-right">
        <h2>${company.companyName}</h2>
        <p>${company.address}</p>
        ${company.taxNumber ? `<p style="font-size:0.7rem; color:#555;">الرقم الضريبي: ${company.taxNumber}</p>` : ''}
      </div>
      <div class="header-center">
        ${logoSrc ? `<img src="${logoSrc}" alt="شعار المؤسسة" class="logo-img" onerror="this.style.display='none'">` : `<div style="font-weight:bold; font-size:0.9rem; color:#1a237e; border:1px dashed #999; padding:3px 8px; border-radius:4px;">${company.companyName}</div>`}
      </div>
      <div class="header-left">
        <ul class="phone-list">
          ${phonesHtml}
        </ul>
      </div>
    </div>

    <!-- 2. بيانات إذن الصرف -->
    <div class="info-box">
      <div class="info-item">
        <span><strong>نوع المستند:</strong> <span style="color: #dc2626; font-weight: bold;">إذن صرف مخزني</span></span>
        <span><strong>المخزن المحول منه:</strong> ${issue.sourceBranchName || 'المخزن الرئيسي'}</span>
      </div>
      <div class="info-item">
        <span><strong>رقم الإذن:</strong> ${issue.voucherNumber || 'GIN-2026-001'}</span>
        <span><strong>الجهة / المستلم:</strong> ${issue.recipientName || 'قسم الصيانة / التشغيل'}</span>
      </div>
      <div class="info-item">
        <span><strong>تاريخ الصرف:</strong> ${issueDate}</span>
        <span><strong>وقت الطباعة:</strong> ${printTime}</span>
      </div>
    </div>

    <!-- 3. كروت الإجماليات (KPIs) -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">عدد الأصناف المصروفة</div>
        <div class="kpi-value">${totalItemsCount} صنف</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي عدد الكميات</div>
        <div class="kpi-value amount-cell">${(totalQty || 0).toLocaleString('en-US')}</div>
      </div>
      <div class="kpi-card kpi-total">
        <div class="kpi-title" style="color: #1d4ed8;">إجمالي التكلفة المصروفة</div>
        <div class="kpi-value amount-cell">${(grandTotalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</div>
      </div>
    </div>

    <!-- 4. جدول الأصناف -->
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th style="width: 5%;">#</th>
            <th style="width: 15%;">كود الصنف</th>
            <th style="width: 30%;">اسم الصنف / الوصف</th>
            <th style="width: 10%;">الوحدة</th>
            <th style="width: 10%;">الكمية</th>
            <th style="width: 15%;">تكلفة الوحدة</th>
            <th style="width: 15%;">إجمالي التكلفة</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" class="text-right">الإجمالـــي العــام</td>
            <td class="amount-cell">${(totalQty || 0).toLocaleString('en-US')}</td>
            <td>-</td>
            <td class="amount-cell">${(grandTotalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 5. البيان والملاحظات -->
    <div class="notes-section">
      <div class="notes-title">السبب / الغرض من الصرف:</div>
      <div>${issue.purposeReason || issue.notes || 'صرف مواد ومستلزمات تشغيل بناءً على طلب الاحتياج المعتمد.'}</div>
    </div>

    <!-- 6. التوقيعات -->
    <div class="signatures">
      <div>أمين المخزن: ${issue.warehouseKeeper || '....................'}</div>
      <div>المستلم / طالب الصرف: ${issue.recipientSignatory || '....................'}</div>
      <div>يعتمد / مدير المخازن: ${issue.approvedBy || '....................'}</div>
    </div>

    <!-- 7. التذييل -->
    <div class="footer">
      <div>* يعتبر المستلم مسؤولاً مسؤولية كاملة عن البضائع المذكورة أعلاه فور التوقيع بالاستلام.</div>
      <div>صفحة رقم: 1/1</div>
    </div>

  </div>

  <!-- حقوق الملكية خارج الإطار -->
  <div class="copyright-outside">
    حقوق الملكية محفوظة Mohamed Nazih 01029190615
  </div>

  ${getPrintToolbarScript()}
</body>
</html>`;
}

/**
 * Open Goods Issue Note print popup and trigger print dialog.
 */
export function printGoodsIssueNote(
  issue: GoodsIssueVoucher,
  appData: AppData,
  showToast?: (msg: string, type: any) => void
): void {
  // 🖨️ Dispatch to Centralized Universal Print Modal
  try {
    const totalQty = issue.items?.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) || 0;
    const grandTotalCost =
      issue.items?.reduce((sum, item) => sum + (Number(item.totalCost) || Number(item.qty) * Number(item.unitCost) || 0), 0) ||
      issue.totalCost ||
      0;

    openUniversalPrint({
      kind: 'inventory_movement',
      title: 'إذن صرف مخزني',
      docNumber: (issue as any).serialNumber || issue.id,
      date: issue.date || new Date().toISOString().split('T')[0],
      time: issue.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      branch: (appData.settings as any)?.branchName || 'المستودع الرئيسي',
      partyName: issue.recipientName || 'أمين المستودع',
      partyLabel: 'جهة الصرف / المستلم',
      items: (issue.items || []).map((it, idx) => ({
        index: idx + 1,
        code: it.code || `ITM-${idx + 1}`,
        name: it.name,
        unit: it.unit || 'قطعة',
        qty: it.qty,
        price: it.unitCost,
        total: it.totalCost || Number(it.qty) * Number(it.unitCost),
      })),
      amount: grandTotalCost,
      summaries: [
        { label: 'عدد الأصناف', value: `${issue.items?.length || 0} صنف` },
        { label: 'إجمالي الكميات', value: `${totalQty}` },
        { label: 'إجمالي التكلفة', value: `${grandTotalCost.toFixed(2)} ${appData.settings?.currencySymbol || 'ج.م'}`, isTotal: true },
      ],
      settings: appData.settings,
      preferredPaperSize: 'a5-portrait',
    });
  } catch (err) {
    console.error('Error dispatching goods issue print:', err);
  }

  const html = generateGoodsIssuePrintHtml(issue, appData);
  let printWindow: Window | null = null;
  try {
    printWindow = window.open('', '_blank', 'width=1000,height=850');
  } catch {
    printWindow = null;
  }

  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }
}


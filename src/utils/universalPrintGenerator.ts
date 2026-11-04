import { UniversalPrintPayload, UniversalPaperSize, UniversalPrintItem, UniversalPrintSummaryItem } from '../types/universalPrint';
import { tafqeetNumber } from './tafqeet';

/**
 * 🎨 RAKEEZA UNIVERSAL PRINT ENGINE V1
 * Generates official accounting print templates matching the exact reference aesthetic:
 * - Crisp borders (#94a3b8 / #cbd5e1), #f8fafc table headers, official Segoe UI / Cairo Arabic font
 * - A5-Portrait default for all invoices and vouchers, with A5-Landscape, A4, A3, and Thermal options
 * - Purpose-built specialized layouts for every document type (Invoices, Returns, Vouchers, Statements, Reports)
 * - Number tafqeet in Arabic
 * - 3 official signature blocks
 * - Permanent copyright & official verification text
 */

export function getPaperSizeDimensions(size: UniversalPaperSize): { widthMm: number; heightMm: number; nameAr: string } {
  switch (size) {
    case 'a5-portrait':
      return { widthMm: 148, heightMm: 210, nameAr: 'ورق قياسي A5 عمودي (الافتراضي)' };
    case 'a5-landscape':
      return { widthMm: 210, heightMm: 148, nameAr: 'ورق قياسي A5 أفقي' };
    case 'a4-portrait':
      return { widthMm: 210, heightMm: 297, nameAr: 'ورق قياسي A4 عمودي' };
    case 'a4-landscape':
      return { widthMm: 297, heightMm: 210, nameAr: 'ورق قياسي A4 أفقي' };
    case 'a3-landscape':
      return { widthMm: 420, heightMm: 297, nameAr: 'ورق كبير A3 عريض' };
    case 'thermal-80':
      return { widthMm: 80, heightMm: 297, nameAr: 'إيصال حراري (80mm)' };
    case 'thermal-58':
      return { widthMm: 58, heightMm: 210, nameAr: 'إيصال حراري صغير (58mm)' };
    default:
      return { widthMm: 148, heightMm: 210, nameAr: 'ورق قياسي A5 عمودي' };
  }
}

export function generateUniversalPrintHtml(
  payload: UniversalPrintPayload,
  activeSize: UniversalPaperSize = payload.preferredPaperSize || 'a5-portrait'
): string {
  const settings = payload.settings || ({} as any);
  const companyName = settings.companyName || 'مؤسسة الموان للتجارة';
  const branchName = payload.branch || settings.branchName || 'المقر الرئيسي - مؤسسة الموان';
  const phones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];
  const finalPhones = phones.length > 0 ? phones : ['01029190615'];
  const companyCode = settings.code || finalPhones[0] || '01029190615';
  const logoUrl = settings.logo || settings.logoUrl || '';

  const now = new Date();
  const printDate = payload.date || now.toLocaleDateString('ar-EG');
  const printTime = payload.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const docSerial = payload.docNumber !== undefined && payload.docNumber !== '' ? `#${payload.docNumber}` : '#1';
  const approver = payload.user || 'Mohamed Nazih';

  const currencySymbol = settings.currencySymbol || 'ج.م';
  const currencyName = currencySymbol === 'ج.م' ? 'جنيه مصري' : currencySymbol;

  // Amount and Tafqeet
  const totalAmount = payload.amount !== undefined ? Number(payload.amount) : 0;
  const tafqeetText = payload.amountInWords || (totalAmount > 0 ? tafqeetNumber(totalAmount, currencyName, 'قرش') : '');

  // Page style according to size
  const pageCss = getPageCssForSize(activeSize);

  // Render Document-Specific Body
  const documentBodyHtml = renderDocumentBody(payload, currencySymbol);

  // Render Summaries Boxes (Cards matching reference: green for count, red for total)
  const summariesHtml = renderSummariesSection(payload, currencySymbol, tafqeetText);

  // Official Signatures block (3 lines: المحاسب، المراجعة والتدقيق الداخلي، يعتمد المدير المالي)
  const signaturesHtml = `
    <div class="signatures-divider"></div>
    <div class="signatures-row">
      <div class="sig-box">
        <span class="sig-title">المحاسب / مدخل البيانات:</span>
        <span class="sig-dots">...................................</span>
      </div>
      <div class="sig-box">
        <span class="sig-title">المراجعة والتدقيق الداخلي:</span>
        <span class="sig-dots">...................................</span>
      </div>
      <div class="sig-box">
        <span class="sig-title">يعتمد / المدير المالي:</span>
        <span class="sig-dots">...................................</span>
      </div>
    </div>
  `;

  // Permanent Official Footer
  const footerNote = payload.footerTermsNote || '* تطابق هذه المستندات الأرصدة والبيانات مع السجلات الرسمية بالنظام | صفحة 1 من 1';
  const copyrightNotice = 'حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت 01029190615';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${payload.title} ${docSerial} - ${companyName}</title>
  <style>
    ${pageCss}

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      background-color: #f1f5f9;
      color: #0f172a;
      line-height: 1.35;
      font-size: 11.5px;
    }

    /* Interactive Top Preview Toolbar (Hidden in Print) */
    .preview-toolbar {
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      background-color: #0f172a;
      color: #f8fafc;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      z-index: 9999;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    }

    .toolbar-left, .toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .size-select-label {
      font-size: 12px;
      font-weight: 600;
      color: #cbd5e1;
    }

    .paper-dropdown {
      background-color: #1e293b;
      color: #ffffff;
      border: 1px solid #475569;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: bold;
      outline: none;
      cursor: pointer;
    }

    .btn-print {
      background-color: #16a34a;
      hover: #15803d;
      color: white;
      border: none;
      padding: 6px 16px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 4px rgba(22, 163, 74, 0.3);
    }
    .btn-print:hover { background-color: #15803d; }

    .btn-close {
      background-color: #475569;
      color: #f8fafc;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      font-weight: bold;
    }
    .btn-close:hover { background-color: #334155; }

    /* Printable Page Container */
    .sheet-wrapper {
      display: flex;
      justify-content: center;
      padding: 16px 8px;
    }

    .print-sheet {
      background-color: #ffffff;
      border: 1px solid #cbd5e1;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      padding: 12px 14px;
      width: 100%;
      max-width: ${getSheetMaxWidth(activeSize)};
      min-height: ${getSheetMinHeight(activeSize)};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    /* Header Section */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }

    .header-table td {
      vertical-align: top;
      padding: 2px 0;
    }

    .comp-name {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
    }

    .comp-sub {
      font-size: 10.5px;
      color: #475569;
      font-weight: 600;
      margin-top: 2px;
    }

    .comp-code-date {
      font-size: 10px;
      color: #334155;
      text-align: left;
      font-weight: 600;
      line-height: 1.4;
    }

    /* Meta Table (3-row clean border grid) */
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      border: 1px solid #94a3b8;
    }

    .meta-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 7px;
      font-size: 10.5px;
    }

    .meta-label {
      background-color: #f8fafc;
      font-weight: 700;
      color: #334155;
      width: 15%;
      text-align: center;
      white-space: nowrap;
    }

    .meta-val {
      color: #0f172a;
      font-weight: 600;
      width: 35%;
    }

    .meta-val-highlight {
      font-weight: 800;
      color: #1e293b;
    }

    /* Data Table */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      border: 1px solid #94a3b8;
    }

    .data-table th {
      background-color: #f1f5f9;
      color: #0f172a;
      font-weight: 800;
      border: 1px solid #94a3b8;
      padding: 5px 6px;
      font-size: 10.5px;
      text-align: center;
      white-space: nowrap;
    }

    .data-table td {
      border: 1px solid #cbd5e1;
      padding: 4.5px 6px;
      font-size: 10px;
      color: #1e293b;
    }

    .data-table tr:nth-child(even) {
      background-color: #fcfcfd;
    }

    .col-center { text-align: center; }
    .col-right { text-align: right; }
    .col-left { text-align: left; }
    .col-bold { font-weight: 700; }

    /* Summaries Section (Cards with green/red borders matching reference) */
    .summaries-container {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      margin-bottom: 6px;
    }

    .summary-card {
      border-radius: 4px;
      padding: 4px 12px;
      font-size: 11px;
      font-weight: 800;
      background-color: #ffffff;
      min-width: 130px;
      text-align: center;
    }

    .summary-card.green-border {
      border: 1.5px solid #16a34a;
      color: #14532d;
    }

    .summary-card.red-border {
      border: 1.5px solid #dc2626;
      color: #7f1d1d;
    }

    .summary-card.neutral-border {
      border: 1.5px solid #94a3b8;
      color: #1e293b;
    }

    .tafqeet-line {
      font-size: 10.5px;
      font-weight: 700;
      color: #1e293b;
      margin-top: 4px;
      margin-bottom: 6px;
      padding: 3px 6px;
      background-color: #f8fafc;
      border-right: 3px solid #16a34a;
    }

    /* Signatures Section */
    .signatures-divider {
      border-top: 1px dashed #94a3b8;
      margin: 10px 0 6px 0;
    }

    .signatures-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0 6px 0;
    }

    .sig-box {
      font-size: 10px;
      color: #334155;
      font-weight: 700;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .sig-dots {
      color: #94a3b8;
      letter-spacing: 1px;
    }

    /* Official Footer */
    .footer-block {
      border-top: 1px solid #e2e8f0;
      padding-top: 4px;
      margin-top: auto;
      text-align: center;
      font-size: 9px;
      color: #475569;
      font-weight: 600;
      line-height: 1.3;
    }

    .footer-copyright {
      font-size: 8.5px;
      color: #64748b;
      margin-top: 2px;
    }

    /* Print Media Rules */
    @media print {
      body {
        background-color: #ffffff !important;
        padding: 0 !important;
      }
      .no-print, .preview-toolbar {
        display: none !important;
      }
      .sheet-wrapper {
        padding: 0 !important;
        margin: 0 !important;
      }
      .print-sheet {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        width: 100% !important;
        max-width: 100% !important;
        min-height: auto !important;
      }
      thead {
        display: table-header-group;
      }
      tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>

  <!-- Top Preview Toolbar (Non-printable) -->
  <div class="preview-toolbar no-print">
    <div class="toolbar-right">
      <span class="size-select-label">اختر مقاس العرض والطباعة:</span>
      <select class="paper-dropdown" id="paperSizeSelect" onchange="window.switchSize(this.value)">
        <option value="a5-portrait" ${activeSize === 'a5-portrait' ? 'selected' : ''}>ورق قياسي A5 عمودي (الافتراضي)</option>
        <option value="a5-landscape" ${activeSize === 'a5-landscape' ? 'selected' : ''}>ورق قياسي A5 أفقي</option>
        <option value="a4-portrait" ${activeSize === 'a4-portrait' ? 'selected' : ''}>ورق قياسي A4 عمودي</option>
        <option value="a4-landscape" ${activeSize === 'a4-landscape' ? 'selected' : ''}>ورق قياسي A4 أفقي</option>
        <option value="a3-landscape" ${activeSize === 'a3-landscape' ? 'selected' : ''}>ورق كبير A3 عريض</option>
        <option value="thermal-80" ${activeSize === 'thermal-80' ? 'selected' : ''}>إيصال حراري 80mm</option>
        <option value="thermal-58" ${activeSize === 'thermal-58' ? 'selected' : ''}>إيصال حراري 58mm</option>
      </select>
    </div>
    <div class="toolbar-left">
      <button class="btn-print" onclick="window.print()">
        <span>🖨️ طباعة فورية</span>
      </button>
      <button class="btn-close" onclick="window.closeWindow()">
        <span>✕ إغلاق</span>
      </button>
    </div>
  </div>

  <!-- Document Sheet -->
  <div class="sheet-wrapper">
    <div class="print-sheet">
      <div>
        <!-- Official Header (Triple Info) -->
        <table class="header-table">
          <tr>
            <td style="width: 55%;">
              <div class="comp-name">${companyName}</div>
              <div class="comp-sub">${branchName}</div>
            </td>
            ${logoUrl ? `<td style="width: 15%; text-align: center;"><img src="${logoUrl}" alt="logo" style="max-height: 40px; max-width: 90px; object-fit: contain;" /></td>` : ''}
            <td style="width: ${logoUrl ? '30%' : '45%'};">
              <div class="comp-code-date">
                <div>كود المؤسسة: [${companyCode}]</div>
                <div>تاريخ الطباعة: ${printDate} ${printTime}</div>
                ${phones.length > 1 ? `<div>هاتف: ${phones.slice(0, 2).join(' - ')}</div>` : ''}
              </div>
            </td>
          </tr>
        </table>

        <!-- Meta Table (.meta-table) -->
        ${renderMetaTable(payload, docSerial, printDate, approver, companyCode)}

        <!-- Specialized Document Body -->
        ${documentBodyHtml}

        <!-- Summaries & Tafqeet Section -->
        ${summariesHtml}
      </div>

      <!-- Bottom Signatures & Legal Verification -->
      <div>
        ${signaturesHtml}

        <div class="footer-block">
          <div>${footerNote}</div>
          <div class="footer-copyright">${copyrightNotice}</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    window.switchSize = function(size) {
      const url = new URL(window.location.href);
      url.searchParams.set('size', size);
      window.location.href = url.toString();
    };

    window.closeWindow = function() {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'rakeeza_close_print_modal' }, '*');
      }
      window.close();
    };
  </script>
</body>
</html>`;
}

function getPageCssForSize(size: UniversalPaperSize): string {
  switch (size) {
    case 'a5-portrait':
      return `@page { size: 148mm 210mm; margin: 4mm; }`;
    case 'a5-landscape':
      return `@page { size: 210mm 148mm; margin: 4mm; }`;
    case 'a4-portrait':
      return `@page { size: 210mm 297mm; margin: 5mm; }`;
    case 'a4-landscape':
      return `@page { size: 297mm 210mm; margin: 5mm; }`;
    case 'a3-landscape':
      return `@page { size: 420mm 297mm; margin: 6mm; }`;
    case 'thermal-80':
      return `@page { size: 80mm auto; margin: 2mm; }`;
    case 'thermal-58':
      return `@page { size: 58mm auto; margin: 1.5mm; }`;
    default:
      return `@page { size: 148mm 210mm; margin: 4mm; }`;
  }
}

function getSheetMaxWidth(size: UniversalPaperSize): string {
  switch (size) {
    case 'a5-portrait': return '144mm';
    case 'a5-landscape': return '204mm';
    case 'a4-portrait': return '200mm';
    case 'a4-landscape': return '287mm';
    case 'a3-landscape': return '410mm';
    case 'thermal-80': return '78mm';
    case 'thermal-58': return '56mm';
    default: return '144mm';
  }
}

function getSheetMinHeight(size: UniversalPaperSize): string {
  switch (size) {
    case 'a5-portrait': return '202mm';
    case 'a5-landscape': return '140mm';
    case 'a4-portrait': return '287mm';
    case 'a4-landscape': return '200mm';
    case 'a3-landscape': return '287mm';
    case 'thermal-80': return 'auto';
    case 'thermal-58': return 'auto';
    default: return '202mm';
  }
}

/**
 * 📋 Renders the standard .meta-table (matching the reference photo)
 */
function renderMetaTable(
  payload: UniversalPrintPayload,
  docSerial: string,
  printDate: string,
  approver: string,
  companyCode: string
): string {
  const periodStr = payload.period?.from && payload.period?.to
    ? ` (الفترة: ${payload.period.from} إلى ${payload.period.to})`
    : '';

  const docTitleFull = `${payload.title}${periodStr} ${docSerial}`;
  const movementDate = payload.date || printDate;
  const branchText = `${payload.branch || 'الفرع الرئيسي'} (كود: ${companyCode})`;

  const partyLabel = payload.partyLabel || 'الحساب / الطرف';
  const partyInfo = payload.partyName
    ? `${payload.partyName} ${payload.partyCode ? `[${payload.partyCode}]` : ''} ${payload.partyPhone && payload.partyPhone !== '-' ? `(هاتف: ${payload.partyPhone})` : ''}`
    : '';

  const statementOrNotes = payload.statementOrReason || payload.notes || `المسؤول: ${approver}`;

  // If partyInfo exists, present it in a dedicated row or slot
  return `
    <table class="meta-table">
      <tr>
        <td class="meta-label">نوع الحركة / التقرير</td>
        <td class="meta-val meta-val-highlight">${docTitleFull}</td>
        <td class="meta-label">تاريخ الحركة</td>
        <td class="meta-val">${movementDate}</td>
      </tr>
      <tr>
        <td class="meta-label">الفرع / النطاق</td>
        <td class="meta-val">${branchText}</td>
        <td class="meta-label">مسؤول الاعتماد</td>
        <td class="meta-val">${approver}</td>
      </tr>
      ${partyInfo ? `
      <tr>
        <td class="meta-label">${partyLabel}</td>
        <td class="meta-val">${partyInfo}</td>
        <td class="meta-label">وسيلة السداد</td>
        <td class="meta-val">${payload.paymentMethod || 'نقداً'}</td>
      </tr>` : ''}
      <tr>
        <td class="meta-label">البيان / ملاحظات</td>
        <td class="meta-val" colspan="3">${statementOrNotes}</td>
      </tr>
    </table>
  `;
}

/**
 * 📊 Renders Document Specific Body (Invoices, Vouchers, Statements, Reports)
 */
function renderDocumentBody(payload: UniversalPrintPayload, curSymbol: string): string {
  const kind = payload.kind;

  // 1. Receipt / Payment Voucher (Specialized Legal Form)
  if (kind === 'receipt_voucher' || kind === 'payment_voucher') {
    return renderVoucherBody(payload, curSymbol);
  }

  // 2. Tabular Documents: check if custom columns/rows are provided
  if (payload.columns && payload.rows) {
    return renderGenericTable(payload.columns, payload.rows);
  }

  // 3. Invoices / Returns (Items list)
  if (payload.items && payload.items.length > 0) {
    return renderInvoiceItemsTable(payload.items, kind, curSymbol);
  }

  // Default empty table
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>م</th>
          <th>البيان</th>
          <th>المبلغ (${curSymbol})</th>
          <th>ملاحظات</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td colspan="4" style="text-align: center; color: #64748b; padding: 10px;">لا توجد بيانات متاحة لهذا المستند</td>
        </tr>
      </tbody>
    </table>
  `;
}

/**
 * 🧾 Renders Receipt / Payment Legal Voucher Layout
 */
function renderVoucherBody(payload: UniversalPrintPayload, curSymbol: string): string {
  const isReceipt = payload.kind === 'receipt_voucher';
  const actionText = isReceipt ? 'استلمنا من السيد / السادة:' : 'اصرفوا إلى السيد / السادة:';
  const forText = 'وذلك عن:';
  const amountVal = payload.amount !== undefined ? Number(payload.amount).toFixed(2) : '0.00';
  const partyName = payload.partyName || 'طرف نقدي عام';

  return `
    <div style="border: 1px solid #94a3b8; background-color: #ffffff; padding: 8px 12px; margin-bottom: 8px; border-radius: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; margin-bottom: 6px;">
        <span style="font-weight: 700; color: #334155;">${actionText} <strong style="font-size: 13px; color: #0f172a;">${partyName}</strong></span>
        <span style="font-weight: 800; font-size: 14px; color: ${isReceipt ? '#16a34a' : '#dc2626'}; border: 1.5px solid ${isReceipt ? '#16a34a' : '#dc2626'}; padding: 2px 10px; border-radius: 4px;">
          ${amountVal} ${curSymbol}
        </span>
      </div>

      <div style="margin-bottom: 6px; font-size: 11px; line-height: 1.6;">
        <div><strong>مبلغاً وقدره:</strong> <span style="font-weight: 700; color: #0f172a;">${payload.amountInWords || ''}</span></div>
        <div><strong>${forText}</strong> <span>${payload.statementOrReason || payload.notes || 'سداد معتمد بالنظام'}</span></div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 10px; background-color: #f8fafc; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0; font-weight: 700; width: 25%;">طريقة السداد:</td>
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0; width: 25%; font-weight: 600;">${payload.paymentMethod || 'نقداً'}</td>
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0; font-weight: 700; width: 25%;">الخزينة / الحساب:</td>
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0; width: 25%; font-weight: 600;">${payload.treasuryOrBank || 'الخزينة الرئيسية'}</td>
        </tr>
        ${payload.referenceNumber ? `
        <tr>
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0; font-weight: 700;">رقم المرجع / الشيك:</td>
          <td style="padding: 4px 6px; border: 1px solid #e2e8f0;" colspan="3">${payload.referenceNumber}</td>
        </tr>` : ''}
      </table>
    </div>
  `;
}

/**
 * 📦 Renders Invoices & Returns Items Table
 */
function renderInvoiceItemsTable(items: UniversalPrintItem[], kind: string, curSymbol: string): string {
  const isReturn = kind.includes('return');
  const qtyHeader = isReturn ? 'الكمية المرتجعة' : 'الكمية';

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 5%;">م</th>
          <th style="width: 14%;">كود الصنف</th>
          <th style="width: 32%;">اسم الصنف / البيان</th>
          <th style="width: 9%;">الوحدة</th>
          <th style="width: 9%;">${qtyHeader}</th>
          <th style="width: 10%;">السعر (${curSymbol})</th>
          <th style="width: 9%;">الخصم</th>
          <th style="width: 12%;">الإجمالي (${curSymbol})</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it, idx) => `
          <tr>
            <td class="col-center">${it.index ?? idx + 1}</td>
            <td class="col-center" style="font-family: monospace; font-size: 9.5px;">${it.code || '-'}</td>
            <td class="col-right col-bold">${it.name}</td>
            <td class="col-center">${it.unit || 'قطعة'}</td>
            <td class="col-center col-bold">${it.qty}</td>
            <td class="col-center">${Number(it.price).toFixed(2)}</td>
            <td class="col-center">${Number(it.discount || 0).toFixed(2)}</td>
            <td class="col-center col-bold">${Number(it.total).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * 📑 Renders Generic Columns / Rows Table
 */
function renderGenericTable(columns: string[], rows: (string | number | undefined | null)[][]): string {
  if (rows.length === 0) {
    return `
      <table class="data-table">
        <thead>
          <tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="${Math.max(1, columns.length)}" style="text-align: center; color: #64748b; padding: 10px;">
              لا توجد بيانات متاحة لهذا المستند
            </td>
          </tr>
        </tbody>
      </table>
    `;
  }

  return `
    <table class="data-table">
      <thead>
        <tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${row.map((cell, cIdx) => {
              const isFirst = cIdx === 0;
              const isNum = typeof cell === 'number';
              const alignClass = isNum ? 'col-center col-bold' : isFirst && columns.length > 3 ? 'col-center' : 'col-right';
              return `<td class="${alignClass}">${cell !== null && cell !== undefined ? cell : '-'}</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * 🏷️ Renders Summary Section (Green box for count, Red box for totals, Tafqeet)
 */
function renderSummariesSection(
  payload: UniversalPrintPayload,
  curSymbol: string,
  tafqeetText: string
): string {
  const summaries = payload.summaries || [];

  // If no summaries provided, generate standard count & total
  const finalSummaries: UniversalPrintSummaryItem[] = summaries.length > 0 ? summaries : [
    { label: 'عدد السجلات', value: `${payload.items?.length || payload.rows?.length || 0} حركة`, color: '#16a34a' },
    { label: 'إجمالي القيمة', value: `${(payload.amount || 0).toFixed(2)} ${curSymbol}`, isHighlight: true, isTotal: true, color: '#dc2626' },
  ];

  const boxesHtml = finalSummaries.map((s) => {
    let borderClass = 'neutral-border';
    if (s.color === '#16a34a' || s.label.includes('عدد')) {
      borderClass = 'green-border';
    } else if (s.color === '#dc2626' || s.isHighlight || s.isTotal || s.label.includes('إجمالي') || s.label.includes('المطلوب')) {
      borderClass = 'red-border';
    }
    return `
      <div class="summary-card ${borderClass}">
        <span>${s.label}: </span>
        <span>${s.value}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="summaries-container">
      ${boxesHtml}
    </div>
    ${tafqeetText ? `<div class="tafqeet-line"><strong>المبلغ كتابة وتفقيطاً:</strong> ${tafqeetText}</div>` : ''}
  `;
}

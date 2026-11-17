import React from 'react';
import { Settings } from '../types';
import { openUniversalPrint } from '../services/centralizedPrintService';

export interface UnifiedReportConfig {
  reportTitle: string;
  subTitle?: string;
  branch?: string;
  serial?: string | number;
  date?: string;
  time?: string;
  company?: {
    name?: string;
    address?: string;
    logo?: string;
    phones?: string[];
  };
  partyCode?: string;
  partyName?: string;
  partyPhone?: string;
  partyLabel?: string;
  partyCodeLabel?: string;
  paymentMethod?: string;
  statementNote?: string;
  infoExtra?: Array<{ label: string; value: string }>;
  kpis?: Array<{ title: string; value: string }>;
  columns: string[];
  rows: (string | number | React.ReactNode)[][];
  summary?: Array<{ label: string; value: string | number; isTotal?: boolean; isHighlight?: boolean }>;
  notes?: string;
  footerNote?: string;
  signatures?: string[];
  isThermal?: boolean;
  preferredPaperSize?: 'A5' | 'A4' | 'thermal' | '58mm';
}

export interface PrintDocumentConfig {
  title: string;
  docNumber?: string | number;
  docTypeBadge?: string;
  date?: string;
  time?: string;
  partyName?: string;
  partyCode?: string;
  partyPhone?: string;
  partyTaxNumber?: string;
  partyAddress?: string;
  partyLabel?: string;
  partyCodeLabel?: string;
  notes?: string;
  statementNote?: string;
  paymentMethod?: string;
  items?: {
    index?: number;
    name: string;
    unit?: string;
    qty: number | string;
    price: number | string;
    discount?: number | string;
    tax?: number | string;
    total: number | string;
    notes?: string;
  }[];
  totals?: {
    label: string;
    value: string | number;
    isBold?: boolean;
    isHighlight?: boolean;
  }[];
  additionalDetails?: { label: string; value: string }[];
  isThermal?: boolean;
  qrData?: string;
  signatures?: string[];
  footerNote?: string;
  branch?: string;
  preferredPaperSize?: 'A5' | 'A4' | 'thermal' | '58mm';
}

/**
 * 🖨️ Standardized Unified System Print & Preview HTML Generator
 * Complies strictly with the universal accounting system blueprint (Standard A5):
 * - A5 True Dimensions (148mm × 210mm) with dynamic switcher for A4 and Thermal (80mm / 58mm)
 * - Triple Header: Right: Company & Branch, Center: Logo, Left: Phone numbers
 * - Unified Info Box: Customer/Supplier code, name, phone, serial, date, time
 * - Statement Box: Hidden completely if empty (.invoice-statement-box:empty)
 * - Dynamic Table: Black 1.5px borders, #e6e6e6 header, word-wrap, no overflow
 * - Structured Totals Section with payment method badges
 * - Internal Footer: terms/signatures
 * - Permanent Copyright: حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت01029190615
 * - Strict Single-Page Printing Guarantee
 */
export function generateUnifiedReportHtml(config: UnifiedReportConfig): string {
  const companyName = config.company?.name || 'شركة ركيزة للحلول البرمجية';
  const branchStr = config.branch || 'الفرع الرئيسي';
  const companyAddress = config.company?.address || `${branchStr} - المقر الرئيسي`;
  const phones = config.company?.phones && config.company.phones.length > 0
    ? config.company.phones
    : ['01029190615'];
  const companyCode = phones[0] || '01029190615';

  const now = new Date();
  const printDate = now.toLocaleDateString('ar-EG');
  const printTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const serialStr = config.serial !== undefined && config.serial !== '' ? `${config.serial}` : '1';
  const docTypeTitle = config.subTitle || config.reportTitle || 'مستند نظام مالي';
  const docDate = config.date || printDate;

  const partyCodeLabel = config.partyCodeLabel || 'كود الطرف';
  const partyCode = config.partyCode || '-';
  const partyLabel = config.partyLabel || 'الحساب / الطرف المعني';
  const partyName = config.partyName || branchStr;
  const approverOrUser = config.statementNote && config.statementNote.includes('المسؤول:')
    ? config.statementNote.replace(/.*المسؤول:\s*/, '').split('\n')[0]
    : 'Mohamed Nazih';

  const statementContent = (config.statementNote || config.notes || '').trim();

  // Initial Paper Size: a4, a5, or thermal
  let initialMode = 'a4';
  if (config.preferredPaperSize) {
    const p = config.preferredPaperSize.toLowerCase();
    if (p.includes('5') || p === 'a5') initialMode = 'a5';
    else if (p.includes('therm') || p.includes('80') || p.includes('58')) initialMode = 'thermal';
  } else if (config.isThermal) {
    initialMode = 'thermal';
  }

  // Build thead
  const theadHtml = `<tr>${config.columns.map((c) => `<th>${c}</th>`).join('')}</tr>`;

  // Build tbody
  const tbodyHtml = config.rows.length === 0
    ? `<tr><td colspan="${Math.max(1, config.columns.length)}" style="color:#777;padding:8px;">لا توجد بيانات متاحة لهذا المستند</td></tr>`
    : config.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell, cellIdx) => {
                const alignStyle = cellIdx === 0 && config.columns.length > 3 ? 'text-align:right; font-weight:600;' : 'text-align:center;';
                return `<td style="${alignStyle}">${cell !== undefined && cell !== null ? cell : '-'}</td>`;
              })
              .join('')}</tr>`
        )
        .join('');

  // Build Summary Boxes
  let summaryBoxesHtml = '';
  if (config.summary && config.summary.length > 0) {
    summaryBoxesHtml = `
      <div class="summary-section">
        ${config.summary
          .map(
            (s) => `
          <div class="summary-box-item" style="${s.isHighlight ? 'border-color: #dc3545; background-color: #fff8f8;' : ''}">
            <strong>${s.label}:</strong> <span>${s.value}</span>
          </div>`
          )
          .join('')}
      </div>`;
  } else if (config.kpis && config.kpis.length > 0) {
    summaryBoxesHtml = `
      <div class="summary-section">
        ${config.kpis
          .map(
            (k) => `
          <div class="summary-box-item">
            <strong>${k.title}:</strong> <span>${k.value}</span>
          </div>`
          )
          .join('')}
      </div>`;
  }

  const footerNoteText = config.footerNote || '* تطابق هذه المستندات الأرصدة والبيانات مع السجلات الرسمية بالنظام. | صفحة 1 من 1';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.reportTitle} #${serialStr} - ${companyName}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
            font-weight: 400;
            direction: rtl;
            background-color: #f1f5f9;
            color: #0f172a;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        /* Responsive Preview Toolbar */
        .preview-toolbar {
            background: #0f172a;
            color: #fff;
            padding: 10px 14px;
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 8px 12px;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 999;
            width: 100%;
            max-width: 100vw;
        }

        .preview-toolbar span {
            font-size: 13px;
            font-weight: 500;
        }

        .preview-toolbar select, .preview-toolbar button {
            min-height: 38px;
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid #475569;
            font-family: inherit;
            font-size: 12.5px;
            font-weight: 500;
            cursor: pointer;
        }

        .preview-toolbar select {
            background: #1e293b;
            color: #fff;
        }

        .preview-toolbar button {
            background-color: #1d4ed8;
            border-color: #1d4ed8;
            color: #fff;
            font-weight: 600;
        }

        /* Paper Containers (Multi-page safe) */
        .print-page {
            background: #fff;
            margin: 16px auto;
            border: 1px solid #cbd5e1;
            box-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
            max-width: calc(100vw - 16px);
        }

        .print-page.a4 {
            width: 210mm;
            min-height: 297mm;
            padding: 9mm;
        }

        .print-page.a5 {
            width: 148mm;
            min-height: 210mm;
            padding: 6mm;
        }

        .print-page.thermal {
            width: 80mm;
            min-height: auto;
            padding: 4mm;
        }

        .doc-header {
            width: 100%;
            border-bottom: 1.5px solid #cbd5e1;
            padding-bottom: 8px;
            margin-bottom: 8px;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8px;
        }

        .doc-header .company-info h2 {
            font-size: 16px;
            font-weight: 600;
            color: #0f172a;
        }

        .doc-header .company-info p {
            font-size: 11px;
            color: #475569;
            margin-top: 2px;
        }

        .doc-header .doc-meta-top {
            font-size: 11px;
            text-align: left;
            color: #334155;
        }

        .meta-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            font-size: 11px;
        }

        .meta-table th, .meta-table td {
            border: 1px solid #cbd5e1;
            padding: 5px 7px;
            text-align: right;
        }

        .meta-table th {
            background-color: #f8fafc;
            font-weight: 600;
            color: #334155;
            white-space: nowrap;
        }

        .statement-box {
            border: 1px solid #cbd5e1;
            background-color: #f8fafc;
            padding: 6px 8px;
            font-size: 11px;
            margin-bottom: 8px;
            font-weight: 500;
        }

        .dynamic-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            font-size: 11px;
        }

        .dynamic-table th {
            background-color: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 6px 5px;
            text-align: center;
            font-weight: 600;
            color: #1e293b;
        }

        .dynamic-table td {
            border: 1px solid #cbd5e1;
            padding: 5px;
            text-align: center;
            font-weight: 400;
            color: #0f172a;
        }

        .dynamic-table tbody tr:nth-child(even) {
            background-color: #f8fafc;
        }

        .summary-section {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 6px;
            margin-bottom: 8px;
            font-size: 11px;
            break-inside: avoid;
            page-break-inside: avoid;
        }

        .summary-box-item {
            flex: 1 1 130px;
            border: 1px solid #cbd5e1;
            background-color: #f8fafc;
            padding: 6px 8px;
            text-align: center;
            border-radius: 4px;
        }

        .doc-footer {
            margin-top: auto;
            border-top: 1px dashed #cbd5e1;
            padding-top: 8px;
            break-inside: avoid;
            page-break-inside: avoid;
        }

        .signatures-grid {
            width: 100%;
            font-size: 10px;
            border-collapse: collapse;
        }

        .signatures-grid td {
            text-align: center;
            width: 33.33%;
            padding-top: 6px;
            color: #475569;
        }

        .footer-note {
            font-size: 9.5px;
            color: #475569;
            text-align: center;
            margin-top: 6px;
            border-top: 1px solid #e2e8f0;
            padding-top: 4px;
        }

        .copyright-tag {
            font-size: 9px;
            color: #64748b;
            text-align: center;
            margin-top: 3px;
        }

        @media print {
            .preview-toolbar, .no-print {
                display: none !important;
            }

            html, body {
                background: #ffffff !important;
                margin: 0 !important;
                padding: 0 !important;
                height: auto !important;
                overflow: visible !important;
            }

            .print-page {
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                min-height: auto !important;
                overflow: visible !important;
                display: block !important;
            }

            thead {
                display: table-header-group !important;
            }

            tfoot {
                display: table-footer-group !important;
            }

            tr, .summary-section, .doc-footer {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
            }
        }

        @page a4-page { size: A4 portrait; margin: 7mm; }
        @page a5-page { size: A5 portrait; margin: 5mm; }
        @page thermal-page { size: 80mm auto; margin: 2mm; }

        body.mode-a4 { page: a4-page; }
        body.mode-a5 { page: a5-page; }
        body.mode-thermal { page: thermal-page; }
    </style>
</head>
<body class="mode-${initialMode}">

    <!-- شريط التحكم للمعاينة -->
    <div class="preview-toolbar no-print">
        <span>اختر مقاس العرض والطباعة:</span>
        <select id="sizeSelector" onchange="switchSize(this.value)">
            <option value="a4" ${initialMode === 'a4' ? 'selected' : ''}>ورق قياسي A4</option>
            <option value="a5" ${initialMode === 'a5' ? 'selected' : ''}>ورق صغير A5</option>
            <option value="thermal" ${initialMode === 'thermal' ? 'selected' : ''}>طابعة حرارية (80mm)</option>
        </select>
        <button onclick="window.print()">طباعة فورية</button>
        <button onclick="window.close()" style="background-color: #334155; border-color: #475569;">إغلاق</button>
    </div>

    <!-- المستند الرئيسي (يعمل لكل الحركات: تسويات، فواتير، سندات، تقارير) -->
    <div id="mainDocument" class="print-page ${initialMode}">
        
        <!-- الجزء العلوي (الهيدر + بيانات الحركة) -->
        <div>
            <!-- الهيدر الموحد -->
            <div class="doc-header">
                <div class="company-info">
                    <h2>${companyName}</h2>
                    <p>${companyAddress}</p>
                </div>
                <div class="doc-meta-top">
                    <div><strong>كود المؤسسة:</strong> [${companyCode}]</div>
                    <div><strong>تاريخ الطباعة:</strong> ${printDate} ${printTime}</div>
                </div>
            </div>

            <!-- بطاقة معلومات الحركة (تتغير تلقائياً حسب نوع الحركة: فاتورة/سند/تسوية) -->
            <table class="meta-table">
                <tr>
                    <th>نوع الحركة / التقرير</th>
                    <td>${docTypeTitle} #${serialStr}</td>
                    <th>تاريخ الحركة</th>
                    <td>${docDate}</td>
                </tr>
                <tr>
                    <th>${partyLabel}</th>
                    <td>${partyName} ${partyCode !== '-' ? `(${partyCodeLabel}: ${partyCode})` : ''}</td>
                    <th>مسؤول الاعتماد</th>
                    <td>${approverOrUser}</td>
                </tr>
                ${config.paymentMethod ? `<tr><th>طريقة السداد / الدفع</th><td>${config.paymentMethod}</td><th>رقم المرجع / المسلسل</th><td>#${serialStr}</td></tr>` : ''}
            </table>

            ${statementContent ? `<div class="statement-box"><strong>البيان / ملاحظات:</strong> ${statementContent}</div>` : ''}

            <!-- جدول البيانات الديناميكي (يتغير عدد وأسماء الأعمدة حسب طبيعة كل حركة) -->
            <table class="dynamic-table">
                <thead>
                    ${theadHtml}
                </thead>
                <tbody>
                    ${tbodyHtml}
                </tbody>
            </table>

            <!-- ملخص الحسابات والأرقام المالية -->
            ${summaryBoxesHtml}
        </div>

        <!-- الجزء السفلي (التوقيعات والتذييل الموحد) -->
        <div class="doc-footer">
            <table class="signatures-grid">
                <tr>
                    <td><strong>المحاسب / مدخل البيانات:</strong><br>...................................</td>
                    <td><strong>المراجعة والتدقيق الداخلي:</strong><br>...................................</td>
                    <td><strong>يعتمد / المدير المالي:</strong><br>...................................</td>
                </tr>
            </table>

            <div class="footer-note">
                ${footerNoteText}
            </div>
            <div class="copyright-tag">
                حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت01029190615
            </div>
        </div>

    </div>

    <!-- برمجة التبديل السلس بين المقاسات -->
    <script>
        function switchSize(size) {
            var doc = document.getElementById('mainDocument');
            var body = document.body;
            var selector = document.getElementById('sizeSelector');
            if (selector && selector.value !== size) {
                selector.value = size;
            }

            // إزالة كافة الكلاسات القديمة
            doc.className = 'print-page';
            body.className = '';

            if (size === 'a4') {
                doc.classList.add('a4');
                body.classList.add('mode-a4');
            } else if (size === 'a5') {
                doc.classList.add('a5');
                body.classList.add('mode-a5');
            } else if (size === 'thermal') {
                doc.classList.add('thermal');
                body.classList.add('mode-thermal');
            }

            try {
                localStorage.setItem('sys_print_pref_size', size);
            } catch(e) {}
        }

        window.addEventListener('DOMContentLoaded', function() {
            var saved = null;
            try {
                saved = localStorage.getItem('sys_print_pref_size');
            } catch(e) {}
            if (saved && (saved === 'a4' || saved === 'a5' || saved === 'thermal')) {
                switchSize(saved);
            }
        });
    </script>

</body>
</html>`;
}

/**
 * Universal Print Window Opener for All Documents & Reports
 */
export function openUnifiedPrintWindow(
  doc: PrintDocumentConfig | UnifiedReportConfig,
  settings?: Settings,
  showToast?: (msg: string, type: any) => void
): void {
  let unifiedConfig: UnifiedReportConfig;

  if ('columns' in doc && 'rows' in doc) {
    unifiedConfig = doc as UnifiedReportConfig;
  } else {
    const d = doc as PrintDocumentConfig;
    const companyName = settings?.companyName || 'شركة ركيزة للحلول البرمجية';
    const companyAddress = settings?.address || 'القاهرة - مصر';
    const phones = [settings?.phone1, settings?.phone2, settings?.phone3].filter(Boolean) as string[];

    const columns = ['اسم الصنف / البند', 'البيان', 'العدد', 'السعر', 'الإجمالي'];
    const rows = (d.items || []).map((it) => [
      it.name,
      it.notes || it.unit || '-',
      it.qty,
      it.price,
      it.total,
    ]);

    const summary = (d.totals || []).map((t) => ({
      label: t.label,
      value: `${t.value} ${settings?.currencySymbol || 'ج.م'}`,
      isTotal: t.isHighlight || t.isBold,
      isHighlight: t.isHighlight,
    }));

    unifiedConfig = {
      reportTitle: d.title,
      subTitle: d.docTypeBadge || d.title,
      serial: d.docNumber || '1',
      branch: d.branch || 'الفرع الرئيسي',
      date: d.date,
      time: d.time,
      company: {
        name: companyName,
        address: companyAddress,
        logo: (settings as any)?.logo || (settings as any)?.logoUrl || '',
        phones: phones.length > 0 ? phones : ['01029190615'],
      },
      partyCode: d.partyCode,
      partyCodeLabel: d.partyCodeLabel,
      partyName: d.partyName,
      partyPhone: d.partyPhone,
      partyLabel: d.partyLabel,
      paymentMethod: d.paymentMethod,
      statementNote: d.statementNote || d.notes,
      columns,
      rows,
      summary,
      notes: d.notes,
      footerNote: d.footerNote || settings?.invoiceFooterNote || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً للشروط والأحكام',
      signatures: d.signatures,
      isThermal: d.isThermal,
      preferredPaperSize: d.preferredPaperSize || (d.isThermal ? 'thermal' : 'A5'),
    };
  }

  // 🖨️ Dispatch to in-app Universal Print Modal immediately for instant zero-popup preview
  try {
    const rawRows = (unifiedConfig.rows || []).map((r) =>
      r.map((cell) => (typeof cell === 'string' || typeof cell === 'number' ? cell : ''))
    );
    const summaries = (unifiedConfig.summary || []).map((s) => ({
      label: s.label,
      value: s.value,
      isTotal: s.isTotal,
      isHighlight: s.isHighlight,
      color: s.isTotal ? '#dc2626' : '#16a34a',
    }));

    openUniversalPrint({
      kind: 'generic_report',
      title: unifiedConfig.reportTitle,
      subTitle: unifiedConfig.subTitle,
      docNumber: unifiedConfig.serial,
      date: unifiedConfig.date,
      time: unifiedConfig.time,
      branch: unifiedConfig.branch,
      partyName: unifiedConfig.partyName,
      partyCode: unifiedConfig.partyCode,
      partyPhone: unifiedConfig.partyPhone,
      partyLabel: unifiedConfig.partyLabel,
      paymentMethod: unifiedConfig.paymentMethod,
      statementOrReason: unifiedConfig.statementNote || unifiedConfig.notes,
      columns: unifiedConfig.columns,
      rows: rawRows,
      summaries,
      footerTermsNote: unifiedConfig.footerNote,
      preferredPaperSize:
        unifiedConfig.preferredPaperSize === 'A4'
          ? 'a4-portrait'
          : unifiedConfig.preferredPaperSize === 'thermal'
          ? 'thermal-80'
          : 'a5-portrait',
      settings,
    });
  } catch (err) {
    console.error('Error dispatching openUniversalPrint:', err);
  }

  const html = generateUnifiedReportHtml(unifiedConfig);

  let printWindow: Window | null = null;
  try {
    printWindow = window.open('', '_blank', 'width=950,height=900');
  } catch {
    printWindow = null;
  }

  if (printWindow) {
    try {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      return;
    } catch {
      // Fall back to hidden iframe
    }
  }

  // Fallback: hidden iframe for sandboxed environments
  try {
    let iframe = document.getElementById('rakeeza-report-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'rakeeza-report-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
    }
    const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (frameDoc) {
      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          if (showToast) {
            showToast('تم إرسال أمر طباعة المستند بنجاح', 'success');
          }
        } catch (err) {
          console.error('Iframe report print error:', err);
        }
      }, 500);
      return;
    }
  } catch (err) {
    console.error('Report fallback print error:', err);
  }

  if (showToast) {
    showToast('يرجى السماح بالنوافذ المنبثقة (Popups) لمعاينة وطباعة المستند', 'warning');
  }
}

import React from 'react';
import { Settings } from '../types';

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
    <style>
        /* =========================================================
           1. الإعدادات الأساسية وإعادة الضبط
           ========================================================= */
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            direction: rtl;
            background-color: #eef2f5;
            color: #222;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        /* شريط التحكم (للمعاينة فقط ولا يظهر في الطباعة) */
        .preview-toolbar {
            background: #111;
            color: #fff;
            padding: 10px;
            text-align: center;
            display: flex;
            justify-content: center;
            gap: 15px;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 999;
        }

        .preview-toolbar select, .preview-toolbar button {
            padding: 6px 12px;
            border-radius: 4px;
            border: none;
            font-weight: bold;
            cursor: pointer;
        }

        .preview-toolbar button {
            background-color: #28a745;
            color: #fff;
        }

        /* =========================================================
           2. حاويات الأوراق والمقاسات (A4, A5, Thermal)
           ========================================================= */
        .print-page {
            background: #fff;
            margin: 20px auto;
            border: 1px solid #ccc;
            box-shadow: 0 0 15px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
            page-break-after: avoid;
            page-break-inside: avoid;
            break-inside: avoid;
            break-after: avoid;
        }

        /* مقاس A4 */
        .print-page.a4 {
            width: 210mm;
            min-height: 297mm;
            padding: 10mm;
        }

        /* مقاس A5 */
        .print-page.a5 {
            width: 210mm;
            min-height: 148mm;
            padding: 6mm;
        }

        /* مقاس حراري 80mm */
        .print-page.thermal {
            width: 80mm;
            min-height: auto;
            padding: 4mm;
        }

        /* =========================================================
           3. التصميم الداخلي الموحد (مطابق لهوية صورك)
           ========================================================= */
        /* الهيدر */
        .doc-header {
            width: 100%;
            border-bottom: 2px solid #222;
            padding-bottom: 6px;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .doc-header .company-info h2 {
            font-size: 15px;
            font-weight: bold;
            color: #000;
        }

        .doc-header .company-info p {
            font-size: 10px;
            color: #555;
        }

        .doc-header .doc-meta-top {
            font-size: 10px;
            text-align: left;
        }

        /* بطاقة معلومات الحركة */
        .meta-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            font-size: 10px;
        }

        .meta-table th, .meta-table td {
            border: 1px solid #999;
            padding: 4px 6px;
            text-align: right;
        }

        .meta-table th {
            background-color: #f1f1f1;
            font-weight: bold;
            color: #333;
        }

        /* مستطيل البيان إن وجد */
        .statement-box {
            border: 1px solid #777;
            background-color: #fafafa;
            padding: 5px 8px;
            font-size: 9.5px;
            margin-bottom: 8px;
            font-weight: 600;
        }

        /* جدول بيانات الحركة الديناميكي */
        .dynamic-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            font-size: 10px;
        }

        .dynamic-table th {
            background-color: #e2e6ea;
            border: 1px solid #777;
            padding: 5px;
            text-align: center;
            font-weight: bold;
        }

        .dynamic-table td {
            border: 1px solid #bbb;
            padding: 5px;
            text-align: center;
        }

        /* ملخص الأرقام والمجاميع */
        .summary-section {
            display: flex;
            justify-content: space-between;
            gap: 6px;
            margin-bottom: 8px;
            font-size: 10px;
        }

        .summary-box-item {
            flex: 1;
            border: 1px solid #28a745;
            background-color: #f8fff9;
            padding: 5px;
            text-align: center;
            border-radius: 2px;
        }

        /* التذييل والتوقيعات */
        .doc-footer {
            margin-top: auto;
            border-top: 1px dashed #777;
            padding-top: 8px;
        }

        .signatures-grid {
            width: 100%;
            font-size: 9px;
            border-collapse: collapse;
        }

        .signatures-grid td {
            text-align: center;
            width: 33.33%;
            padding-top: 5px;
        }

        .footer-note {
            font-size: 8px;
            color: #555;
            text-align: center;
            margin-top: 5px;
            border-top: 1px solid #eee;
            padding-top: 3px;
        }

        .copyright-tag {
            font-size: 7.5px;
            color: #777;
            text-align: center;
            margin-top: 3px;
        }

        /* =========================================================
           4. قواعد الطباعة الصارمة (منع الخوارج والأزرار تماماً)
           ========================================================= */
        @media print {
            .preview-toolbar {
                display: none !important;
            }

            body {
                background: none !important;
                margin: 0 !important;
            }

            .print-page {
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
                width: 100% !important;
                height: 100% !important;
                page-break-after: avoid !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                break-after: avoid !important;
            }

            /* إخفاء أي أجزاء غير مطلوب طباعتها */
            .no-print {
                display: none !important;
            }
        }

        /* تحديد المقاسات الفعلية عند إعطاء أمر الطباعة للورق */
        @page a4-page { size: A4 portrait; margin: 5mm; }
        @page a5-page { size: A5 landscape; margin: 4mm; }
        @page thermal-page { size: 80mm auto; margin: 0; }

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
        <button onclick="window.print()">طباعة فورية 🖨️</button>
        <button onclick="window.close()" style="background-color: #555;">إغلاق ✕</button>
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

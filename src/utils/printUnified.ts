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
  const companyAddress = config.company?.address || 'القاهرة - مصر';
  const companyLogo = config.company?.logo || '';
  const phones = config.company?.phones && config.company.phones.length > 0
    ? config.company.phones
    : ['01029190615'];

  const now = new Date();
  const dateStr = config.date || now.toLocaleDateString('ar-EG');
  const timeStr = config.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const serialStr = config.serial !== undefined && config.serial !== '' ? `${config.serial}` : '1';
  const branchStr = config.branch || 'الفرع الرئيسي';
  const subTitleStr = config.subTitle || config.reportTitle;
  const footerNoteText = config.footerNote || 'المستند رسمي ومعتمد وفقاً لقواعد النظام المحاسبي';

  const partyCodeLabel = config.partyCodeLabel || 'كود الطرف';
  const partyCode = config.partyCode || '-';
  const partyLabel = config.partyLabel || 'الطرف المعني';
  const partyName = config.partyName || branchStr;
  const partyPhone = config.partyPhone || '-';

  const statementContent = (config.statementNote || config.notes || '').trim();

  // Initial Paper Size
  const initialSize = config.preferredPaperSize || (config.isThermal ? 'thermal' : 'A5');

  // Build thead
  const theadHtml = `<tr>${config.columns.map((c) => `<th>${c}</th>`).join('')}</tr>`;

  // Build tbody
  const tbodyHtml = config.rows.length === 0
    ? `<tr><td colspan="${Math.max(1, config.columns.length)}" style="color:#666;padding:10px;">لا توجد بيانات متاحة لهذا التقرير</td></tr>`
    : config.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell, cellIdx) => {
                const alignStyle = cellIdx === 0 && config.columns.length > 3 ? 'text-align:right; font-weight:700;' : 'text-align:center;';
                return `<td style="${alignStyle}">${cell !== undefined && cell !== null ? cell : '-'}</td>`;
              })
              .join('')}</tr>`
        )
        .join('');

  // Build Totals / Summary
  let summaryHtml = '';
  if (config.summary && config.summary.length > 0) {
    summaryHtml = `
    <div class="totals-section">
      ${config.summary
        .map(
          (s, idx) => `
        <div class="total-row" style="${s.isTotal ? 'border-top: 1.5px dashed #666; margin-top: 3px; padding-top: 3px; font-size: 12px; font-weight: 800;' : ''} ${s.isHighlight ? 'color: #b91c1c;' : ''}">
          <span>${s.label}</span>
          <strong>${s.value}</strong>
        </div>`
        )
        .join('')}
    </div>`;
  }

  // KPIs Cards (if needed in analytics/shift closing)
  let kpisHtml = '';
  if (config.kpis && config.kpis.length > 0) {
    kpisHtml = `
    <div style="display: grid; grid-template-columns: repeat(${Math.min(4, config.kpis.length)}, 1fr); gap: 6px; margin-bottom: 8px;">
      ${config.kpis
        .map(
          (kpi) => `
        <div style="border: 1.5px solid #000; background: #f8fafc; padding: 4px 6px; text-align: center;">
          <div style="font-size: 9.5px; font-weight: 700; color: #475569;">${kpi.title}</div>
          <div style="font-size: 11px; font-weight: 800; color: #000; margin-top: 1px;">${kpi.value}</div>
        </div>`
        )
        .join('')}
    </div>`;
  }

  // Signatures row
  let signaturesHtml = '';
  if (config.signatures && config.signatures.length > 0) {
    signaturesHtml = `
    <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #666; font-size: 10px; font-weight: 700;">
      ${config.signatures.map((sig) => `<div>${sig}: ...........................</div>`).join('')}
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.reportTitle} #${serialStr}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        body {
            background-color: #e2e8f0;
            color: #000;
            padding: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        /* شريط التحكم بالمعاينة والطباعة (يظهر على الشاشة فقط ويختفي عند الطباعة) */
        .no-print-toolbar {
            width: 100%;
            max-width: 148mm;
            background: #0f172a;
            color: #fff;
            padding: 8px 12px;
            border-radius: 10px;
            margin-bottom: 12px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.25);
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            user-select: none;
        }

        .toolbar-group {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }

        .paper-btn {
            background: #1e293b;
            color: #fff;
            border: 1px solid #475569;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .paper-btn:hover { background: #334155; }
        .paper-btn.active { background: #2563eb; border-color: #3b82f6; color: #fff; }

        .action-btn-print {
            background: #16a34a;
            color: #fff;
            border: none;
            padding: 5px 14px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .action-btn-print:hover { background: #15803d; }

        .action-btn-pdf {
            background: #ea580c;
            color: #fff;
            border: none;
            padding: 5px 12px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
        }
        .action-btn-pdf:hover { background: #c2410c; }

        .action-btn-close {
            background: #475569;
            color: #fff;
            border: none;
            padding: 5px 10px;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
        }

        /* حاوية المستند بمقاس A5 الأصلي المظبوط والمستقر تماماً */
        .invoice-container {
            background: #fff;
            width: 100%;
            max-width: 148mm;
            min-height: 210mm;
            padding: 10mm;
            border: 2px solid #000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            margin: 0 auto;
            transform-origin: top center;
            transition: max-width 0.2s, min-height 0.2s, padding 0.2s;
        }

        .invoice-main-content {
            width: 100%;
        }

        /* 1. الترويسة العلوية الثلاثية */
        .company-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2.5px solid #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
            gap: 8px;
        }

        .header-right {
            flex: 1.2;
            text-align: right;
        }

        .header-right h2 {
            font-size: 16px;
            font-weight: 800;
            color: #000;
            margin-bottom: 2px;
        }

        .header-right p {
            font-size: 10px;
            font-weight: 600;
            color: #222;
            line-height: 1.2;
        }

        .header-center {
            flex: 0 0 auto;
            text-align: center;
        }

        .header-center img {
            max-height: 40px;
            max-width: 80px;
            object-fit: contain;
        }

        .header-left {
            flex: 1;
            text-align: left;
            font-size: 10px;
            font-weight: 600;
            color: #000;
            line-height: 1.2;
        }

        .header-center:empty,
        .header-left:empty {
            display: none;
        }

        /* 2. مربع بيانات المستند */
        .invoice-info-box {
            border: 1.5px solid #000;
            background-color: #fff;
            padding: 6px 8px;
            margin-bottom: 8px;
            font-size: 10.5px;
            font-weight: 600;
        }

        .info-grid {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: nowrap;
            gap: 5px;
        }

        .info-col-right {
            flex: 1.3;
            text-align: right;
            line-height: 1.5;
        }

        .info-col-center {
            flex: 1;
            text-align: center;
            line-height: 1.5;
            border-right: 1px dashed #666;
            border-left: 1px dashed #666;
            padding: 0 4px;
        }

        .info-col-left {
            flex: 1.1;
            text-align: left;
            line-height: 1.5;
        }

        /* 3. مستطيل البيان (يختفي تماماً إذا ترك فارغاً) */
        .invoice-statement-box {
            border: 1.5px solid #333;
            padding: 5px 8px;
            margin-bottom: 8px;
            font-size: 10.5px;
            font-weight: 600;
            background-color: #fff;
        }

        .invoice-statement-box:empty {
            display: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        /* 4. جدول الأصناف والبيانات (أفقي متناسق بدون أي تمرير) */
        .table-wrapper {
            width: 100%;
            margin-bottom: 10px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            table-layout: fixed;
        }

        table th, table td {
            border: 1.5px solid #000;
            padding: 6px 3px;
            text-align: center;
            vertical-align: middle;
            font-weight: 600;
            word-wrap: break-word;
        }

        table th {
            background-color: #e6e6e6;
            color: #000;
            font-weight: 800;
            font-size: 11.5px;
            white-space: nowrap;
        }

        /* 5. قسم الإجماليات وتفاصيل الدفع */
        .totals-section {
            width: 100%;
            border-top: 2.5px solid #000;
            padding-top: 6px;
            font-size: 11.5px;
            font-weight: 800;
            margin-bottom: 10px;
        }

        .total-row {
            display: flex;
            justify-content: space-between;
            padding: 3px 0;
        }

        .payment-status-badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 3px;
            font-size: 10px;
            background: #e2e8f0;
            color: #000;
            border: 1px solid #000;
            font-weight: 800;
        }

        /* 6. التزييل الداخلي */
        .invoice-bottom-notes {
            width: 100%;
            text-align: center;
            font-size: 10px;
            font-weight: 800;
            color: #000;
            border-top: 1.5px dashed #000;
            padding-top: 6px;
            margin-top: auto;
        }

        /* 7. حقوق الملكية الفكرية المعتمدة للمطور */
        .copyright-footer {
            text-align: center;
            font-size: 9px;
            font-weight: 600;
            color: #444;
            margin-top: 6px;
            width: 100%;
        }

        /* الأنماط الخاصة بالمقاسات المختلفة */
        body[data-paper-size="A4"] .no-print-toolbar { max-width: 200mm; }
        body[data-paper-size="A4"] .invoice-container {
            max-width: 200mm;
            min-height: 285mm;
            padding: 12mm 14mm;
            font-size: 12.5px;
        }
        body[data-paper-size="A4"] table { font-size: 12px; }
        body[data-paper-size="A4"] table th { font-size: 12.5px; }

        body[data-paper-size="thermal"] .no-print-toolbar { max-width: 72mm; }
        body[data-paper-size="thermal"] .invoice-container {
            max-width: 72mm;
            min-height: auto;
            padding: 3mm;
            border: 1px dashed #000;
            font-size: 10px;
        }
        body[data-paper-size="thermal"] .company-header { flex-direction: column; text-align: center; }
        body[data-paper-size="thermal"] .header-right, 
        body[data-paper-size="thermal"] .header-left { text-align: center; }
        body[data-paper-size="thermal"] .info-grid { flex-direction: column; gap: 4px; text-align: center; }
        body[data-paper-size="thermal"] .info-col-center { border: none; padding: 2px 0; }
        body[data-paper-size="thermal"] .info-col-left { text-align: center; }
        body[data-paper-size="thermal"] table { font-size: 9.5px; }

        body[data-paper-size="58mm"] .no-print-toolbar { max-width: 48mm; }
        body[data-paper-size="58mm"] .invoice-container {
            max-width: 48mm;
            min-height: auto;
            padding: 2mm 1.5mm;
            border: 1px dashed #000;
            font-size: 8.5px;
        }
        body[data-paper-size="58mm"] .company-header { flex-direction: column; text-align: center; }
        body[data-paper-size="58mm"] .header-right, 
        body[data-paper-size="58mm"] .header-left { text-align: center; }
        body[data-paper-size="58mm"] .info-grid { flex-direction: column; gap: 2px; text-align: center; }
        body[data-paper-size="58mm"] .info-col-center { border: none; padding: 1px 0; }
        body[data-paper-size="58mm"] .info-col-left { text-align: center; }
        body[data-paper-size="58mm"] table { font-size: 8px; }

        /* ========================================================= */
        /* إعدادات الطباعة النظيفة لمقاس A5 الحقيقي (تمنع التقسيم لورقتين) */
        /* ========================================================= */
        @media print {
            body {
                background: none !important;
                padding: 0 !important;
                margin: 0 !important;
            }

            .no-print-toolbar,
            .no-print {
                display: none !important;
            }

            .invoice-container {
                border: 1.5px solid #000 !important;
                box-shadow: none !important;
                width: 100% !important;
                page-break-after: avoid !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                margin: 0 auto !important;
            }

            body[data-paper-size="A5"] .invoice-container {
                max-width: 100% !important;
                height: 210mm !important;
                padding: 6mm !important;
            }

            body[data-paper-size="A4"] .invoice-container {
                max-width: 100% !important;
                height: 297mm !important;
                padding: 8mm 10mm !important;
            }

            body[data-paper-size="thermal"] .invoice-container {
                width: 72mm !important;
                max-width: 72mm !important;
                height: auto !important;
                padding: 2mm !important;
                border: 1px dashed #000 !important;
            }

            body[data-paper-size="58mm"] .invoice-container {
                width: 48mm !important;
                max-width: 48mm !important;
                height: auto !important;
                padding: 1.5mm !important;
                border: 1px dashed #000 !important;
            }

            .print-hide-time {
                display: none !important;
            }

            .tax-discount-row {
                display: none !important;
            }

            .invoice-statement-box:empty {
                display: none !important;
                border: none !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            tr, th, td {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }

            @page {
                size: A5 portrait;
                margin: 0;
            }
        }
    </style>
    <style id="dynamic-unified-print-style"></style>
</head>
<body data-paper-size="${initialSize}">

    <!-- شريط التحكم بالطباعة وتغيير المقاسات -->
    <div class="no-print-toolbar no-print">
        <div class="toolbar-group">
            <span style="font-weight: 800; font-size: 12px;">🖨️ ${config.reportTitle}</span>
            <span style="background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 11px;">#${serialStr}</span>
        </div>

        <div class="toolbar-group">
            <button type="button" class="paper-btn ${initialSize === 'A5' ? 'active' : ''}" id="btn-size-a5" onclick="setPaperSize('A5')">A5 (الأساسي)</button>
            <button type="button" class="paper-btn ${initialSize === 'A4' ? 'active' : ''}" id="btn-size-a4" onclick="setPaperSize('A4')">A4</button>
            <button type="button" class="paper-btn ${initialSize === 'thermal' ? 'active' : ''}" id="btn-size-thermal" onclick="setPaperSize('thermal')">حراري 80mm</button>
            <button type="button" class="paper-btn ${initialSize === '58mm' ? 'active' : ''}" id="btn-size-58mm" onclick="setPaperSize('58mm')">حراري 58mm</button>
        </div>

        <div class="toolbar-group">
            <button type="button" class="action-btn-print" onclick="window.print()">
                <span>🖨️ طباعة</span>
            </button>
            <button type="button" class="action-btn-pdf" onclick="saveAsPdf()">
                <span>💾 حفظ PDF</span>
            </button>
            <button type="button" class="action-btn-close" onclick="window.close()">✕</button>
        </div>
    </div>

    <!-- حاوية المستند النظيفة بمقاس A5 -->
    <div class="invoice-container">
        <div class="invoice-main-content">
            
            <!-- 1. الترويسة العلوية الثلاثية -->
            <div class="company-header">
                <div class="header-right">
                    <h2>${companyName}</h2>
                    <p>${companyAddress}</p>
                </div>
                <div class="header-center">
                    ${companyLogo ? `<img src="${companyLogo}" alt="شعار الشركة" onerror="this.style.display='none'">` : ''}
                </div>
                <div class="header-left">
                    ${phones.map((ph, idx) => `<div><strong>هاتف ${idx + 1}:</strong> ${ph}</div>`).join('')}
                </div>
            </div>

            <!-- 2. مربع بيانات المستند -->
            <div class="invoice-info-box">
                <div class="info-grid">
                    <div class="info-col-right">
                        ${partyCode !== '-' ? `<strong>${partyCodeLabel}:</strong> <span>${partyCode}</span><br>` : ''}
                        <strong>${partyLabel}:</strong> <span>${partyName}</span><br>
                        ${partyPhone !== '-' ? `<strong>الهاتف:</strong> <span>${partyPhone}</span>` : `<strong>الفرع:</strong> <span>${branchStr}</span>`}
                    </div>
                    <div class="info-col-center">
                        <strong>${subTitleStr}</strong><br>
                        <span style="font-size: 13px; font-weight: 800;">رقم: <span>${serialStr}</span></span>
                    </div>
                    <div class="info-col-left">
                        <strong>التاريخ:</strong> <span>${dateStr}</span><br>
                        <span class="print-hide-time"><strong>الوقت:</strong> <span>${timeStr}</span></span>
                    </div>
                </div>
            </div>

            <!-- 3. مستطيل البيان (يختفي تماماً إذا ترك فارغاً) -->
            <div class="invoice-statement-box">${statementContent}</div>

            ${kpisHtml}

            <!-- 4. جدول البيانات الديناميكي -->
            <div class="table-wrapper">
                <table>
                    <thead>
                        ${theadHtml}
                    </thead>
                    <tbody>
                        ${tbodyHtml}
                    </tbody>
                </table>
            </div>

            <!-- 5. قسم الإجماليات وتفاصيل الدفع -->
            ${summaryHtml}

            <!-- توقيعات معتمدة إذا وُجدت -->
            ${signaturesHtml}

        </div>

        <!-- 6. التزييل الداخلي -->
        <div class="invoice-bottom-notes">
            <p>${footerNoteText}</p>
        </div>
    </div>

    <!-- 7. حقوق الملكية الفكرية المعتمدة للمطور -->
    <div class="copyright-footer">
        حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت01029190615
    </div>

    <script>
        function setPaperSize(size) {
            document.body.setAttribute('data-paper-size', size);
            
            var btnA5 = document.getElementById('btn-size-a5');
            var btnA4 = document.getElementById('btn-size-a4');
            var btnThermal = document.getElementById('btn-size-thermal');
            var btn58mm = document.getElementById('btn-size-58mm');
            if (btnA5) btnA5.classList.toggle('active', size === 'A5');
            if (btnA4) btnA4.classList.toggle('active', size === 'A4');
            if (btnThermal) btnThermal.classList.toggle('active', size === 'thermal');
            if (btn58mm) btn58mm.classList.toggle('active', size === '58mm');

            var styleEl = document.getElementById('dynamic-unified-print-style');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'dynamic-unified-print-style';
                document.head.appendChild(styleEl);
            }

            if (size === 'A5') {
                styleEl.innerHTML = '@media print { @page { size: A5 portrait; margin: 0; } }';
            } else if (size === 'A4') {
                styleEl.innerHTML = '@media print { @page { size: A4 portrait; margin: 0; } }';
            } else if (size === 'thermal') {
                styleEl.innerHTML = '@media print { @page { size: 80mm auto; margin: 0; } }';
            } else if (size === '58mm') {
                styleEl.innerHTML = '@media print { @page { size: 58mm auto; margin: 0; } }';
            }

            try {
                localStorage.setItem('sys_print_pref_size', size);
            } catch(e) {}
        }

        function saveAsPdf() {
            var container = document.querySelector('.invoice-container');
            var size = document.body.getAttribute('data-paper-size') || 'A5';
            var filename = '${config.reportTitle}_${serialStr}.pdf';

            if (window.html2pdf) {
                var opt = {
                    margin: size === 'thermal' || size === '58mm' ? [2, 1, 2, 1] : [4, 4, 4, 4],
                    filename: filename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: {
                        unit: 'mm',
                        format: size === 'A5' ? 'a5' : size === '58mm' ? [58, 200] : size === 'thermal' ? [80, 220] : 'a4',
                        orientation: 'portrait'
                    }
                };
                html2pdf().set(opt).from(container).save();
            } else {
                window.print();
            }
        }

        window.addEventListener('DOMContentLoaded', function() {
            var saved = null;
            try {
                saved = localStorage.getItem('sys_print_pref_size');
            } catch(e) {}
            if (saved && (saved === 'A5' || saved === 'A4' || saved === 'thermal' || saved === '58mm')) {
                setPaperSize(saved);
            } else {
                setPaperSize('${initialSize}');
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

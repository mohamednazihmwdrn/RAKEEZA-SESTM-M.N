import { SaleInvoice, PurchaseInvoice, Settings } from '../types';
import { openCentralizedInvoicePrint, PaperSize } from '../services/centralizedPrintService';

/**
 * 🖨️ Generate Invoice Print HTML conforming to the Standard A5 Unified Template
 * Includes dynamic adaptation for A5, A4, 80mm Thermal, and 58mm Mini Thermal.
 */
export function generateInvoicePrintHtml(
  inv: SaleInvoice | PurchaseInvoice,
  isSales: boolean,
  settings: Settings,
  preferredPaperSize: 'A4' | 'A5' | 'thermal' | '80mm' | '58mm' = 'A5'
): string {
  const isSaleInv = isSales;
  const partyLabel = isSaleInv ? 'اسم العميل' : 'اسم المورد';
  const partyCodeLabel = isSaleInv ? 'كود العميل' : 'كود المورد';
  const partyName = isSaleInv
    ? (inv as SaleInvoice).customerName || 'عميل نقدي'
    : (inv as PurchaseInvoice).supplierName || 'مورد عام';
  const partyCode = (inv as any).customerId || (inv as any).supplierId || (inv as any).customerCode || (inv as any).supplierCode || '-';
  const partyPhone = inv.phone || (inv as any).customerPhone || (inv as any).supplierPhone || '-';

  const companyName = settings.companyName || 'شركة ركيزة للحلول البرمجية';
  const companyAddress = settings.address || 'القاهرة - مصر';
  const logoUrl = (settings as any).logo || (settings as any).logoUrl || '';

  const companyPhones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];
  if (companyPhones.length === 0) {
    companyPhones.push('01029190615');
  }

  const invoiceNumber = `${inv.id}`;
  const invoiceDate = inv.date || new Date().toLocaleDateString('ar-EG');
  const invoiceTime =
    inv.time ||
    new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });

  // Invoice type title
  let invoiceTypeTitle = 'فاتورة مبيعات';
  if (inv.type === 'nagdi') {
    invoiceTypeTitle = isSaleInv ? 'فاتورة مبيعات نقدية' : 'فاتورة مشتريات نقدية';
  } else if (inv.type === 'ajel') {
    invoiceTypeTitle = isSaleInv ? 'فاتورة مبيعات آجلة' : 'فاتورة مشتريات آجلة';
  } else if (inv.type === 'return_nagdi') {
    invoiceTypeTitle = isSaleInv ? 'مرتجع مبيعات نقدي' : 'مرتجع مشتريات نقدي';
  } else if (inv.type === 'return_ajel') {
    invoiceTypeTitle = isSaleInv ? 'مرتجع مبيعات آجل' : 'مرتجع مشتريات آجل';
  }

  // Payment method badge
  let paymentMethodType = 'كاش';
  if (inv.type === 'ajel' || inv.type === 'return_ajel') {
    paymentMethodType = 'آجل';
  } else if (inv.paidAmount && inv.remainingAmount && inv.remainingAmount > 0) {
    paymentMethodType = 'جزئي';
  } else if (inv.paymentMethod === 'drawer') {
    paymentMethodType = 'كاش (الخزينة)';
  } else if (inv.paymentMethod === 'vodafone') {
    paymentMethodType = 'فودافون كاش';
  } else if (inv.paymentMethod === 'instapay') {
    paymentMethodType = 'إنستاباي';
  } else if (inv.paymentMethod === 'bank') {
    paymentMethodType = 'تحويل بنكي';
  } else if (inv.paymentMethod) {
    paymentMethodType = inv.paymentMethod;
  }

  const items = inv.items || [];
  const grandTotal = Number(inv.total || 0);
  const taxVal = Number(inv.tax || 0);
  const discountVal = Number(inv.discount || 0);

  let paidVal = Number(inv.paidAmount);
  let remainingVal = Number(inv.remainingAmount);
  if (isNaN(paidVal)) {
    if (inv.type === 'nagdi' || inv.type === 'return_nagdi') {
      paidVal = grandTotal;
      remainingVal = 0;
    } else {
      paidVal = 0;
      remainingVal = grandTotal;
    }
  }
  if (isNaN(remainingVal)) {
    remainingVal = Math.max(0, grandTotal - paidVal);
  }

  const statementNote = (inv as any).notes || (inv as any).description || (inv as any).note || '';

  const footerTermsNote =
    settings.invoiceFooterNote ||
    (inv as any).footerNote ||
    'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً للشروط والأحكام';

  // Build items rows
  const tableRowsHtml =
    items.length === 0
      ? `<tr><td colspan="5" style="padding: 10px; color: #777;">لا توجد أصناف في هذه الفاتورة</td></tr>`
      : items
          .map((item) => {
            const qty = parseFloat(String(item.qty)) || 0;
            const price = parseFloat(String(item.price)) || 0;
            const itemTotal = Number(item.total !== undefined ? item.total : qty * price);
            const desc = item.spec || item.notes || (item as any).desc || (item as any).description || '-';

            return `
            <tr>
              <td class="col-item-name">${item.name || ''}</td>
              <td class="col-item-note">${desc}</td>
              <td class="col-item-qty">${qty}</td>
              <td class="col-item-price">${price.toFixed(2)}</td>
              <td class="col-item-total">${itemTotal.toFixed(2)}</td>
            </tr>`;
          })
          .join('');

  // Paper size normalization
  const initialPaperSize: PaperSize =
    preferredPaperSize === '58mm'
      ? '58mm'
      : preferredPaperSize === '80mm' || preferredPaperSize === 'thermal'
      ? 'thermal'
      : preferredPaperSize === 'A4'
      ? 'A4'
      : 'A5';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${invoiceTypeTitle} #${invoiceNumber}</title>
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

        .paper-btn:hover {
            background: #334155;
        }

        .paper-btn.active {
            background: #2563eb;
            border-color: #3b82f6;
            color: #fff;
        }

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

        .col-item-name  { width: 34%; text-align: right; padding-right: 5px; font-weight: 700; }
        .col-item-note  { width: 22%; font-size: 10px; }
        .col-item-qty   { width: 10%; font-size: 11px; white-space: nowrap; }
        .col-item-price { width: 16%; font-size: 11px; white-space: nowrap; }
        .col-item-total { width: 18%; font-size: 11.5px; font-weight: 800; white-space: nowrap; }

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
        /* إعدادات الطباعة النظيفة الموحدة (تمنع التقسيم لورقتين نهائياً) */
        /* ========================================================= */
        @media print {
            html, body {
                background: #ffffff !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }

            body[data-paper-size="A5"],
            body[data-paper-size="A4"] {
                height: 100% !important;
                max-height: 100% !important;
                overflow: hidden !important;
            }

            body[data-paper-size="thermal"],
            body[data-paper-size="58mm"] {
                height: auto !important;
                overflow: visible !important;
            }

            .no-print-toolbar,
            .no-print,
            button,
            input,
            select {
                display: none !important;
            }

            .invoice-container {
                border: 2px solid #000 !important;
                border-radius: 4px !important;
                box-shadow: none !important;
                page-break-after: avoid !important;
                page-break-inside: avoid !important;
                page-break-before: avoid !important;
                break-inside: avoid !important;
                break-after: avoid !important;
                box-sizing: border-box !important;
                margin: 0 auto !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
            }

            body[data-paper-size="A5"] .invoice-container {
                width: 100% !important;
                max-width: 138mm !important;
                max-height: 198mm !important;
                padding: 3mm 4mm !important;
                border: 2px solid #000 !important;
                font-size: 10px !important;
            }

            body[data-paper-size="A4"] .invoice-container {
                width: 100% !important;
                max-width: 194mm !important;
                max-height: 280mm !important;
                padding: 5mm 6mm !important;
                border: 2px solid #000 !important;
                font-size: 11.5px !important;
            }

            body[data-paper-size="thermal"] .invoice-container {
                width: 76mm !important;
                max-width: 76mm !important;
                height: auto !important;
                padding: 2mm !important;
                border: 1px dashed #000 !important;
                border-radius: 0 !important;
                font-size: 9.5px !important;
            }

            body[data-paper-size="58mm"] .invoice-container {
                width: 52mm !important;
                max-width: 52mm !important;
                height: auto !important;
                padding: 1.5mm !important;
                border: 1px dashed #000 !important;
                border-radius: 0 !important;
                font-size: 8px !important;
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
                margin: 4mm 5mm;
            }
        }
    </style>
    <style id="dynamic-print-page-style"></style>
</head>
<body data-paper-size="${initialPaperSize}">

    <!-- شريط التحكم بالطباعة وتغيير المقاسات -->
    <div class="no-print-toolbar no-print">
        <div class="toolbar-group">
            <span style="font-weight: 800; font-size: 12px;">🖨️ ${invoiceTypeTitle}</span>
            <span style="background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 11px;">#${invoiceNumber}</span>
        </div>

        <div class="toolbar-group">
            <button type="button" class="paper-btn ${initialPaperSize === 'A5' ? 'active' : ''}" id="btn-size-a5" onclick="setPaperSize('A5')">A5 (الأساسي)</button>
            <button type="button" class="paper-btn ${initialPaperSize === 'A4' ? 'active' : ''}" id="btn-size-a4" onclick="setPaperSize('A4')">A4</button>
            <button type="button" class="paper-btn ${initialPaperSize === 'thermal' ? 'active' : ''}" id="btn-size-thermal" onclick="setPaperSize('thermal')">حراري 80mm</button>
            <button type="button" class="paper-btn ${initialPaperSize === '58mm' ? 'active' : ''}" id="btn-size-58mm" onclick="setPaperSize('58mm')">حراري 58mm</button>
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
                    ${logoUrl ? `<img src="${logoUrl}" alt="شعار الشركة" onerror="this.style.display='none'">` : ''}
                </div>
                <div class="header-left">
                    ${companyPhones.map((ph, idx) => `<div><strong>هاتف ${idx + 1}:</strong> ${ph}</div>`).join('')}
                </div>
            </div>

            <!-- 2. مربع بيانات المستند -->
            <div class="invoice-info-box">
                <div class="info-grid">
                    <div class="info-col-right">
                        <strong>${partyCodeLabel}:</strong> <span>${partyCode}</span><br>
                        <strong>${partyLabel}:</strong> <span>${partyName}</span><br>
                        <strong>الهاتف:</strong> <span>${partyPhone}</span>
                    </div>
                    <div class="info-col-center">
                        <strong>${invoiceTypeTitle}</strong><br>
                        <span style="font-size: 13px; font-weight: 800;">رقم: <span>${invoiceNumber}</span></span>
                    </div>
                    <div class="info-col-left">
                        <strong>التاريخ:</strong> <span>${invoiceDate}</span><br>
                        <span class="print-hide-time"><strong>الوقت:</strong> <span>${invoiceTime}</span></span>
                    </div>
                </div>
            </div>

            <!-- 3. مستطيل البيان (يختفي تماماً إذا ترك فارغاً) -->
            <div class="invoice-statement-box">${statementNote}</div>

            <!-- 4. جدول الأصناف -->
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th class="col-item-name">اسم الصنف</th>
                            <th class="col-item-note">البيان</th>
                            <th class="col-item-qty">العدد</th>
                            <th class="col-item-price">السعر</th>
                            <th class="col-item-total">الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- 5. قسم الإجماليات وتفاصيل الدفع -->
            <div class="totals-section">
                <div class="total-row">
                    <span>إجمالي الفاتورة:</span>
                    <span>${grandTotal.toFixed(2)} ج.م</span>
                </div>
                
                <div class="total-row" style="border-top: 1px dashed #666; padding-top: 4px; margin-top: 3px;">
                    <span>طريقة الدفع: <span class="payment-status-badge">${paymentMethodType}</span></span>
                    <span>المدفوع: <strong>${paidVal.toFixed(2)} ج.م</strong></span>
                </div>
                
                ${
                  remainingVal > 0
                    ? `
                <div class="total-row" style="color: #b91c1c;">
                    <span>المبلغ المتبقي (الآجل):</span>
                    <strong>${remainingVal.toFixed(2)} ج.م</strong>
                </div>`
                    : ''
                }

                <!-- الضريبة والخصم (تختفي تلقائياً عند الطباعة أو إذا كانت صفراً) -->
                ${
                  taxVal > 0
                    ? `
                <div class="total-row tax-discount-row" style="font-weight: 600; font-size: 11px; color: #444;">
                    <span>الضريبة:</span>
                    <span>${taxVal.toFixed(2)} ج.م</span>
                </div>`
                    : ''
                }
                ${
                  discountVal > 0
                    ? `
                <div class="total-row tax-discount-row" style="font-weight: 600; font-size: 11px; color: #444;">
                    <span>الخصم:</span>
                    <span>${discountVal.toFixed(2)} ج.م</span>
                </div>`
                    : ''
                }
            </div>

        </div>

        <!-- 6. التزييل الداخلي وحقوق الملكية للمطور داخل إطار الفاتورة -->
        <div style="margin-top: auto; padding-top: 4px; width: 100%;">
            <div class="invoice-bottom-notes">
                <p>${footerTermsNote}</p>
            </div>
            <div class="copyright-inside-frame" style="text-align: center; font-size: 8.5px; font-weight: 700; color: #1e293b; padding-top: 3px; direction: rtl;">
                حقوق الملكية الفكرية محفوظة لمطور النظام Mohamed Nazih ت01029190615
            </div>
        </div>
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

            var styleEl = document.getElementById('dynamic-print-page-style');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'dynamic-print-page-style';
                document.head.appendChild(styleEl);
            }

            if (size === 'A5') {
                styleEl.innerHTML = '@media print { @page { size: A5 portrait; margin: 4mm 5mm; } }';
            } else if (size === 'A4') {
                styleEl.innerHTML = '@media print { @page { size: A4 portrait; margin: 6mm 8mm; } }';
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
            var filename = '${invoiceTypeTitle}_${invoiceNumber}.pdf';

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
                setPaperSize('${initialPaperSize}');
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Open Print Window for Sales & Purchase Invoices
 */
export function printInvoiceWindow(
  inv: SaleInvoice | PurchaseInvoice,
  isSales: boolean,
  settings: Settings,
  showToast?: (msg: string, type: 'warning' | 'error' | 'success' | 'info') => void,
  preferredPaperSize?: 'A4' | 'A5' | 'thermal' | '80mm' | '58mm'
) {
  const normPaperSize: PaperSize =
    preferredPaperSize === '58mm'
      ? '58mm'
      : preferredPaperSize === '80mm' || preferredPaperSize === 'thermal'
      ? 'thermal'
      : preferredPaperSize === 'A4'
      ? 'A4'
      : 'A5';

  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem('sys_print_pref_size', normPaperSize);
  } catch {}

  // 1. Centralized in-app high-fidelity preview modal (Preferred & sandbox-friendly)
  openCentralizedInvoicePrint({
    invoice: inv,
    isSales,
    settings,
    preferredPaperSize: normPaperSize,
  });
}

import { CashTransaction, AppData, Settings } from '../types';
import { tafqeetArabic } from './tafqeet';

export interface UnifiedVoucherData {
  type: 'receive' | 'pay' | 'deposit' | 'withdraw' | 'قبض' | 'صرف' | string;
  serialNo?: string | number;
  partyName?: string;
  partyId?: string;
  partyPhone?: string;
  amount: number;
  paymentMethod?: string;
  amountText?: string;
  reason?: string;
  accountName?: string;
  date?: string;
  time?: string;
  invoiceId?: string | number;
  notes?: string;
}

/**
 * 🖨️ Generates the HTML string for the Standard Unified Financial Voucher (A5 Clean Template)
 */
export function generateCashVoucherPrintHtml(
  dataOrTrans: CashTransaction | UnifiedVoucherData,
  appDataOrSettings: AppData | Settings
): string {
  // Normalize settings
  const settings: Settings = (appDataOrSettings as AppData).settings || (appDataOrSettings as Settings) || {
    companyName: 'شركة ركيزة للحلول البرمجية',
    address: 'القاهرة - مصر',
    phone1: '01029190615',
    phone2: '',
    phone3: '',
    taxNumber: '',
    commercialReg: '',
    notes: '',
    defaultTaxRate: 14,
    currencySymbol: 'ج.م',
    paperSize: 'A5',
    pageMargin: 5,
    showLogoInPrint: true,
  };

  const companyName = settings.companyName || 'شركة ركيزة للحلول البرمجية';
  const companyAddress = settings.address || 'القاهرة - مصر';
  const logoUrl = settings.logo || settings.logoUrl || '';

  const phones: string[] = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];
  if (phones.length === 0) {
    phones.push('01029190615');
  }

  // Normalize voucher data
  const isTrans = 'method' in dataOrTrans;
  const rawType = dataOrTrans.type || 'receive';
  const isReceive =
    rawType === 'receive' ||
    rawType === 'deposit' ||
    rawType === 'قبض' ||
    String(rawType).includes('قبض') ||
    String(rawType).includes('receive');

  const serialNo =
    (dataOrTrans as any).serialNo ||
    (dataOrTrans as any).id ||
    (dataOrTrans as any).code ||
    '1';

  let partyName = (dataOrTrans as any).partyName || '';
  let partyId = (dataOrTrans as any).partyId || '';
  let partyPhone = (dataOrTrans as any).partyPhone || (dataOrTrans as any).phone || '-';

  if (isTrans) {
    const tx = dataOrTrans as CashTransaction;
    partyName = tx.customerName || tx.supplierName || (tx.type === 'receive' ? 'عميل نقدي' : 'مورد عام');
    partyId = (tx as any).customerId || (tx as any).supplierId || (tx.invoiceId ? `فاتورة #${tx.invoiceId}` : '-');
  }

  const amount = Number(dataOrTrans.amount) || 0;
  const currency = settings.currencySymbol || 'ج.م';

  let paymentMethod = (dataOrTrans as any).paymentMethod || '';
  if (isTrans) {
    const tx = dataOrTrans as CashTransaction;
    paymentMethod =
      tx.method === 'drawer'
        ? 'نقدي (الخزينة الرئيسية)'
        : tx.method === 'vodafone'
        ? 'فودافون كاش'
        : tx.method === 'instapay'
        ? 'إنستاباي (InstaPay)'
        : tx.method === 'bank'
        ? 'حساب بنكي'
        : tx.method || 'نقدي';
  } else if (!paymentMethod) {
    paymentMethod = 'نقدي';
  }

  const amountText =
    (dataOrTrans as any).amountText ||
    tafqeetArabic(amount, { currency: currency === 'ج.م' ? 'جنيه مصري' : currency });

  let reason = (dataOrTrans as any).reason || (dataOrTrans as any).note || (dataOrTrans as any).notes || '';
  if (isTrans && (dataOrTrans as CashTransaction).invoiceId) {
    const invNote = `سداد وتسوية مستحقات الفاتورة رقم #${(dataOrTrans as CashTransaction).invoiceId}`;
    reason = reason ? `${reason} (${invNote})` : invNote;
  }
  if (!reason) {
    reason = isReceive ? 'سداد دفعة نقدية / تصفية حساب جاري' : 'صرف مستحقات مالية / مصاريف تشغيلية';
  }

  const accountName =
    (dataOrTrans as any).accountName ||
    (isReceive ? 'الخزينة العامة الرئيسية' : 'خزينة المصروفات والمدفوعات');

  const now = new Date();
  const dateStr = (dataOrTrans as any).date || now.toISOString().split('T')[0];
  const timeStr =
    (dataOrTrans as any).time ||
    now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const voucherTitle = isReceive ? 'سند قبض نقدية معتمد' : 'سند صرف نقدية معتمد';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${voucherTitle} #${serialNo}</title>
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
            padding: 6px 8px;
            margin-bottom: 8px;
            font-size: 11px;
            font-weight: 600;
            background-color: #fff;
            line-height: 1.4;
        }

        .invoice-statement-box:empty {
            display: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        /* 4. جدول بنود السند المالي */
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
            padding: 6px 6px;
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
            text-align: center;
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
    <style id="dynamic-cash-print-style"></style>
</head>
<body data-paper-size="A5">

    <!-- شريط التحكم بالطباعة وتغيير المقاسات -->
    <div class="no-print-toolbar no-print">
        <div class="toolbar-group">
            <span style="font-weight: 800; font-size: 12px;">🖨️ ${voucherTitle}</span>
            <span style="background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 11px;">#${serialNo}</span>
        </div>

        <div class="toolbar-group">
            <button type="button" class="paper-btn active" id="btn-size-a5" onclick="setPaperSize('A5')">A5 (الأساسي)</button>
            <button type="button" class="paper-btn" id="btn-size-a4" onclick="setPaperSize('A4')">A4</button>
            <button type="button" class="paper-btn" id="btn-size-thermal" onclick="setPaperSize('thermal')">حراري 80mm</button>
            <button type="button" class="paper-btn" id="btn-size-58mm" onclick="setPaperSize('58mm')">حراري 58mm</button>
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
                    ${phones.map((ph, idx) => `<div><strong>هاتف ${idx + 1}:</strong> ${ph}</div>`).join('')}
                </div>
            </div>

            <!-- 2. مربع بيانات المستند -->
            <div class="invoice-info-box">
                <div class="info-grid">
                    <div class="info-col-right">
                        <strong>${isReceive ? 'استلمنا من السيد:' : 'صرفنا إلى السيد:'}</strong> <span>${partyName}</span><br>
                        <strong>كود الطرف/الحساب:</strong> <span>${partyId || '-'}</span><br>
                        ${partyPhone !== '-' ? `<strong>الهاتف:</strong> <span>${partyPhone}</span>` : ''}
                    </div>
                    <div class="info-col-center">
                        <strong style="color: ${isReceive ? '#166534' : '#991b1b'};">${voucherTitle}</strong><br>
                        <span style="font-size: 13px; font-weight: 800;">رقم: <span>${serialNo}</span></span>
                    </div>
                    <div class="info-col-left">
                        <strong>التاريخ:</strong> <span>${dateStr}</span><br>
                        <span class="print-hide-time"><strong>الوقت:</strong> <span>${timeStr}</span></span>
                    </div>
                </div>
            </div>

            <!-- 3. مستطيل البيان (يختفي تماماً إذا ترك فارغاً) -->
            <div class="invoice-statement-box">
                <strong>البيان والسبب:</strong> ${reason}
            </div>

            <!-- 4. جدول بنود السند المالي المنسق -->
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 30%;">البند المالي</th>
                            <th style="width: 70%; text-align: right; padding-right: 8px;">التفاصيل والبيان</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="font-weight: 800; background: #f8fafc; text-align: center;">المبلغ بالأرقام</td>
                            <td style="font-weight: 900; font-size: 13px; color: ${isReceive ? '#166534' : '#991b1b'}; font-family: monospace;">
                                ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}
                            </td>
                        </tr>
                        <tr>
                            <td style="font-weight: 800; background: #f8fafc; text-align: center;">المبلغ كتابةً وتفقيطاً</td>
                            <td style="font-weight: 700; color: #1e293b;">${amountText}</td>
                        </tr>
                        <tr>
                            <td style="font-weight: 800; background: #f8fafc; text-align: center;">طريقة وسيلة السداد</td>
                            <td><span class="payment-status-badge">${paymentMethod}</span></td>
                        </tr>
                        <tr>
                            <td style="font-weight: 800; background: #f8fafc; text-align: center;">${isReceive ? 'الخزينة المحول إليها' : 'خصماً من الخزينة/الحساب'}</td>
                            <td style="font-weight: 600;">${accountName}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 5. قسم الإجماليات وتفاصيل الدفع -->
            <div class="totals-section">
                <div class="total-row">
                    <span>إجمالي قيمة السند المالي:</span>
                    <span style="color: ${isReceive ? '#166534' : '#991b1b'};">${(amount || 0).toFixed(2)} ${currency}</span>
                </div>
                <div class="total-row" style="border-top: 1px dashed #666; padding-top: 4px; margin-top: 3px;">
                    <span>حالة المعاملة:</span>
                    <span class="payment-status-badge">معتمد ومقيد دفترياً</span>
                </div>
            </div>

            <!-- التوقيعات المعتمدة -->
            <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #000; font-size: 10px; font-weight: 800;">
                <div>${isReceive ? 'توقيع المستلم (العميل): ....................' : 'توقيع المستلم (المستفيد): ....................'}</div>
                <div>أمين الخزينة: ....................</div>
                <div>اعتماد الإدارة: ....................</div>
            </div>

        </div>

        <!-- 6. التزييل الداخلي وحقوق الملكية للمطور داخل إطار السند -->
        <div style="margin-top: auto; padding-top: 6px; width: 100%;">
            <div class="invoice-bottom-notes" style="text-align: center;">
                <p>${isReceive ? 'يعتبر هذا السند إشعاراً رسمياً بالتحصيل ولا يحتاج لختم إضافي إلا في الحالات الخاصة' : 'تم صرف المبلغ بناءً على الدورة المستندية والاعتمادات المالية المقررة'}</p>
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

            var styleEl = document.getElementById('dynamic-cash-print-style');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'dynamic-cash-print-style';
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
            var filename = '${voucherTitle}_${serialNo}.pdf';

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
                setPaperSize('A5');
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Open Print Window for Cash Vouchers
 */
export function printCashVoucherWindow(
  trans: CashTransaction | UnifiedVoucherData,
  appDataOrSettings: AppData | Settings,
  showToast?: (msg: string, type: 'warning' | 'error' | 'success' | 'info') => void
) {
  const printWin = window.open('', '_blank', 'width=850,height=900');
  if (!printWin) {
    if (showToast) {
      showToast('يرجى السماح بالنوافذ المنبثقة للطباعة', 'warning');
    }
    return;
  }

  const html = generateCashVoucherPrintHtml(trans, appDataOrSettings);
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}

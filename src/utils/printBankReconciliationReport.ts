import { AppData, Settings, BankAccount, BankStatementItem, ApprovalRequest } from '../types';
import { getPrintToolbarStyles, getPrintToolbarHtml, getPrintToolbarScript } from './printToolbarHelper';

export interface BankReconciliationData {
  company: Settings;
  issuerName: string;
  targetDate: string;
  selectedBank: BankAccount;
  statementItems: BankStatementItem[];
  bookBalance: number;
  statementBalance: number;
  difference: number;
  reconciledCount: number;
  pendingCount: number;
  approvals: ApprovalRequest[];
}

export function formatNumber(num: number): string {
  const n = Number(num) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function compileBankReconciliationData(
  appData: AppData,
  bankAccountId?: string,
  targetDate?: string
): BankReconciliationData {
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
  const selectedDate = targetDate || new Date().toISOString().split('T')[0];

  const bankAccounts = appData.bankAccounts || [];
  const selectedBank =
    bankAccounts.find((b) => b.id === bankAccountId) ||
    bankAccounts[0] || {
      id: 'b1',
      name: 'الحساب البنكي',
      accountNumber: '',
      balance: 0,
    };

  const statementItems = (appData.bankStatements || []).filter((s) => s.bankAccountId === selectedBank.id);
  const activeItems: BankStatementItem[] = statementItems;

  const bookBalance = selectedBank.balance || 0;
  const totalCredits = activeItems.reduce((sum, item) => sum + (item.credit || 0), 0);
  const totalDebits = activeItems.reduce((sum, item) => sum + (item.debit || 0), 0);
  const statementBalance = totalCredits - totalDebits;
  const difference = bookBalance - statementBalance;

  const reconciledCount = activeItems.filter((i) => i.isReconciled).length;
  const pendingCount = activeItems.filter((i) => !i.isReconciled).length;

  const approvals = appData.approvalRequests || [];

  return {
    company,
    issuerName,
    targetDate: selectedDate,
    selectedBank,
    statementItems: activeItems,
    bookBalance,
    statementBalance,
    difference,
    reconciledCount,
    pendingCount,
    approvals,
  };
}

export function generateBankReconciliationReportHtml(
  appData: AppData,
  bankAccountId?: string,
  targetDate?: string
): string {
  const data = compileBankReconciliationData(appData, bankAccountId, targetDate);

  const phone = data.company.phone1 || '01029190615';
  const companyTitle = data.company.companyName || 'RAKEEZA';
  const branchAddress = data.company.address || 'الفرع الرئيسي - ش المعهد الديني';

  const now = new Date();
  const printDate = now.toLocaleDateString('ar-EG');
  const printTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  // Rows HTML
  let rowsHtml = '';
  let totalDebit = 0;
  let totalCredit = 0;

  data.statementItems.forEach((item) => {
    totalDebit += item.debit || 0;
    totalCredit += item.credit || 0;
    const isCredit = (item.credit || 0) > 0;
    const debitStr = item.debit > 0 ? formatNumber(item.debit) : '-';
    const creditStr = item.credit > 0 ? formatNumber(item.credit) : '-';

    rowsHtml += `
      <tr>
        <td style="font-family: monospace;">${item.date}</td>
        <td style="font-family: monospace; font-weight: bold;">${item.reference || '-'}</td>
        <td style="text-align: right; font-weight: 600;">${item.description}</td>
        <td>
          <span style="display:inline-block; padding: 1px 6px; border-radius: 4px; font-weight: bold; font-size: 0.72rem; ${
            isCredit ? 'background-color: #dcfce7; color: #166534;' : 'background-color: #fee2e2; color: #991b1b;'
          }">
            ${isCredit ? 'إيداع وارد (+)' : 'سحب / عمولة (-)'}
          </span>
        </td>
        <td class="expense-val">${debitStr}</td>
        <td class="income-val">${creditStr}</td>
        <td>
          <span style="display:inline-block; padding: 1px 6px; border-radius: 4px; font-weight: bold; font-size: 0.72rem; ${
            item.isReconciled ? 'background-color: #dcfce7; color: #166534;' : 'background-color: #fef3c7; color: #92400e;'
          }">
            ${item.isReconciled ? '✅ تمت المطابقة' : '⏳ معلق للمراجعة'}
          </span>
        </td>
      </tr>
    `;
  });

  const isMatched = Math.abs(data.difference) < 0.01;
  const statusBadge = isMatched
    ? '<span style="color:#16a34a; font-weight:bold;">✅ متطابق ومكتمل الاعتماد</span>'
    : `<span style="color:#dc2626; font-weight:bold;">⚠️ فرق تسوية مطلوب: ${formatNumber(Math.abs(data.difference))} ج.م</span>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>نموذج الطباعة الموحد - مذكرة تسوية ${data.selectedBank.name}</title>
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
<body class="mode-a4">

    <!-- شريط التحكم للمعاينة -->
    <div class="preview-toolbar no-print">
        <span>اختر مقاس العرض والطباعة:</span>
        <select id="sizeSelector" onchange="switchSize(this.value)">
            <option value="a4" selected>ورق قياسي A4</option>
            <option value="a5">ورق صغير A5</option>
            <option value="thermal">طابعة حرارية (80mm)</option>
        </select>
        <button onclick="window.print()">طباعة فورية 🖨️</button>
        <button onclick="window.close()" style="background-color: #555;">إغلاق ✕</button>
    </div>

    <!-- المستند الرئيسي (يعمل لكل الحركات: تسويات، فواتير، سندات، تقارير) -->
    <div id="mainDocument" class="print-page a4">
        
        <!-- الجزء العلوي (الهيدر + بيانات الحركة) -->
        <div>
            <!-- الهيدر الموحد -->
            <div class="doc-header">
                <div class="company-info">
                    <h2>${companyTitle}</h2>
                    <p>${branchAddress}</p>
                </div>
                <div class="doc-meta-top">
                    <div><strong>كود المؤسسة:</strong> [${phone}]</div>
                    <div><strong>تاريخ الطباعة:</strong> ${printDate}</div>
                </div>
            </div>

            <!-- بطاقة معلومات الحركة (تتغير تلقائياً حسب نوع الحركة: فاتورة/سند/تسوية) -->
            <table class="meta-table">
                <tr>
                    <th>نوع الحركة / التقرير</th>
                    <td>مذكرة تسوية ومطابقة بنكية - ${data.selectedBank.name}</td>
                    <th>تاريخ الحركة</th>
                    <td>${data.targetDate}</td>
                </tr>
                <tr>
                    <th>الحساب / الطرف المعني</th>
                    <td>${data.selectedBank.name} (${data.selectedBank.accountNumber || 'رئيسي'})</td>
                    <th>مسؤول الاعتماد</th>
                    <td>${data.issuerName}</td>
                </tr>
            </table>

            <!-- جدول البيانات الديناميكي (يتغير عدد وأسماء الأعمدة حسب طبيعة كل حركة) -->
            <table class="dynamic-table">
                <thead>
                    <tr>
                        <th style="width: 12%;">تاريخ الحركة</th>
                        <th style="width: 14%;">المرجع / الشيك</th>
                        <th style="width: 32%; text-align: right;">البيان التفصيلي</th>
                        <th style="width: 12%;">طبيعة الحركة</th>
                        <th style="width: 11%;">مدين / سحب (-)</th>
                        <th style="width: 11%;">دائن / إيداع (+)</th>
                        <th style="width: 8%;">الحالة / المطابقة</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <!-- ملخص الحسابات والأرقام المالية -->
            <div class="summary-section">
                <div class="summary-box-item">
                    <strong>إجمالي المدين:</strong> ${formatNumber(totalDebit)} ج.م
                </div>
                <div class="summary-box-item">
                    <strong>إجمالي الدائن:</strong> ${formatNumber(totalCredit)} ج.م
                </div>
                <div class="summary-box-item" style="border-color: ${isMatched ? '#28a745' : '#dc3545'}; background-color: ${isMatched ? '#f8fff9' : '#fff8f8'};">
                    <strong>الصافي / الفارق:</strong> ${formatNumber(data.difference)} ج.م (${isMatched ? 'متطابق ومعتمد' : 'فرق تسوية مطلوب'})
                </div>
            </div>
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
                * تطابق هذه المستندات الأرصدة والبيانات مع السجلات الرسمية بالنظام. | صفحة 1 من 1
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

export function printBankReconciliationReportWindow(
  appData: AppData,
  bankAccountId?: string,
  targetDate?: string,
  showToast?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
): void {
  try {
    const htmlContent = generateBankReconciliationReportHtml(appData, bankAccountId, targetDate);
    const printWindow = window.open('', '_blank', 'width=1100,height=850,menubar=no,toolbar=no,location=no,status=no');

    if (!printWindow) {
      if (showToast) {
        showToast('يرجى السماح بالنوافذ المنبثقة لطباعة مذكرة التسوية والمطابقة البنكية', 'warning');
      }
      return;
    }

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    if (showToast) {
      showToast('تم فتح وتجهيز مذكرة التسوية البنكية ومحضر الاعتماد للطباعة والمعاينة بنجاح', 'success');
    }
  } catch (err) {
    console.error('Error printing bank reconciliation report:', err);
    if (showToast) {
      showToast('حدث خطأ أثناء إعداد مذكرة التسوية البنكية للطباعة', 'error');
    }
  }
}

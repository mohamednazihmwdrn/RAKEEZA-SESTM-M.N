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
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Tajawal', system-ui, -apple-system, sans-serif; }
        body {
            direction: rtl;
            background-color: #f1f5f9;
            color: #0f172a;
            padding: 10px;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .preview-toolbar {
            background: #0f172a;
            color: #fff;
            padding: 10px 14px;
            border-radius: 10px;
            margin: 0 auto 12px auto;
            max-width: 100%;
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 10px;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 999;
        }
        .preview-toolbar select, .preview-toolbar button {
            min-height: 36px;
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid #475569;
            font-weight: 500;
            font-size: 12.5px;
            cursor: pointer;
        }
        .preview-toolbar select { background: #1e293b; color: #fff; }
        .preview-toolbar button { background-color: #16a34a; color: #fff; border: none; font-weight: 600; }

        .print-page {
            background: #fff;
            margin: 0 auto 16px auto;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            box-shadow: 0 2px 12px rgba(15,23,42,0.06);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
        }
        .print-page.a4 { width: 100%; max-width: 210mm; min-height: auto; padding: 8mm 10mm; }
        .print-page.a5 { width: 100%; max-width: 148mm; min-height: auto; padding: 6mm; }
        .print-page.thermal { width: 80mm; max-width: 80mm; min-height: auto; padding: 4mm; border: 1px dashed #334155; box-shadow: none; }

        .doc-header {
            width: 100%;
            border-bottom: 1.5px solid #1e293b;
            padding-bottom: 8px;
            margin-bottom: 8px;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8px;
        }
        .doc-header .company-info h2 { font-size: 16px; font-weight: 700; color: #0f172a; }
        .doc-header .company-info p { font-size: 11px; color: #475569; }
        .doc-header .doc-meta-top { font-size: 11px; text-align: left; color: #334155; }

        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
        .meta-table th, .meta-table td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: right; font-variant-numeric: tabular-nums; }
        .meta-table th { background-color: #f1f5f9; font-weight: 600; color: #0f172a; }

        .dynamic-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
        .dynamic-table thead { display: table-header-group; }
        .dynamic-table tr { break-inside: avoid; page-break-inside: avoid; }
        .dynamic-table th { background-color: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-weight: 600; }
        .dynamic-table td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; font-variant-numeric: tabular-nums; }

        .summary-section { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-bottom: 10px; font-size: 11px; font-variant-numeric: tabular-nums; }
        .summary-box-item { flex: 1; min-width: 140px; border: 1px solid #cbd5e1; border-radius: 4px; background-color: #f8fafc; padding: 6px; text-align: center; }

        .doc-footer { margin-top: auto; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
        .signatures-grid { width: 100%; font-size: 10px; border-collapse: collapse; }
        .signatures-grid td { text-align: center; width: 33.33%; padding-top: 6px; }
        .footer-note { font-size: 9px; color: #475569; text-align: center; margin-top: 6px; border-top: 1px solid #e2e8f0; padding-top: 4px; }
        .copyright-tag { font-size: 8.5px; color: #64748b; text-align: center; margin-top: 3px; }

        @media print {
            .preview-toolbar, .no-print { display: none !important; }
            html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
            .print-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; height: auto !important; min-height: auto !important; }
        }

        @page a4-page { size: A4 portrait; margin: 6mm; }
        @page a5-page { size: A5 landscape; margin: 5mm; }
        @page thermal-page { size: 80mm auto; margin: 2mm; }
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
                جميع حقوق الملكية محفوظة لمطور النظام Mohamed Nazih ت 01029190615
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

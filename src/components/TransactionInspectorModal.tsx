import React, { useState } from 'react';
import { AppData, SaleInvoice, PurchaseInvoice, CashTransaction, JournalEntry, Cheque, Quotation, StockTransfer, PayrollSlip, FixedAsset, ProductionOrder } from '../types';
import { printInvoiceWindow } from '../utils/printInvoice';
import { openUnifiedPrintWindow } from '../utils/printUnified';
import { printCashVoucherWindow } from '../utils/printCash';
import { printChequesReport, printChequeVoucher } from '../utils/printChequesReport';
import { addAuditLog } from '../utils/storage';

export interface InspectableItem {
  type: 'sale' | 'purchase' | 'cash' | 'journal' | 'cheque' | 'quote' | 'transfer' | 'payroll' | 'asset' | 'production';
  data: any;
}

interface TransactionInspectorModalProps {
  isOpen: boolean;
  item: InspectableItem | null;
  onClose: () => void;
  appData: AppData;
  onUpdateData: (newData: AppData) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const TransactionInspectorModal: React.FC<TransactionInspectorModalProps> = ({
  isOpen,
  item,
  onClose,
  appData,
  onUpdateData,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'view' | 'edit' | 'audit'>('view');
  const [isDeleting, setIsDeleting] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStatus, setEditStatus] = useState<string>('');

  if (!isOpen || !item || !item.data) return null;

  const { type, data } = item;
  const currency = appData.settings?.currencySymbol || 'ج.م';

  const getTypeTitle = () => {
    switch (type) {
      case 'sale':
        return data.type?.includes('return') ? 'فاتورة مردود مبيعات' : 'فاتورة مبيعات';
      case 'purchase':
        return data.type?.includes('return') ? 'فاتورة مردود مشتريات' : 'فاتورة مشتريات وتوريد';
      case 'cash':
        return data.type === 'receive' ? 'سند قبض نقدية' : data.type === 'pay' ? 'سند صرف نقدية' : 'حركة خزينة';
      case 'journal':
        return 'قيد يومية مزدوج';
      case 'cheque':
        return data.type === 'receivable' ? 'ورقة قبض (شيك وارد)' : 'ورقة دفع (شيك صادر)';
      case 'quote':
        return data.type === 'sale_quote' ? 'عرض سعر عميل' : 'أمر شراء مورد';
      case 'transfer':
        return 'إذن تحويل بضاعة بين المخازن';
      case 'payroll':
        return 'مسير وقسيمة راتب موظف';
      case 'asset':
        return 'سجل أصل ثابت';
      case 'production':
        return 'أمر تصنيع وتشغيل';
      default:
        return 'معاينة العملية';
    }
  };

  // Trigger Unified High-Precision Print
  // Trigger Unified High-Precision Print (A4, A5, or Thermal)
  const handlePrint = (format: 'A4' | 'A5' | 'thermal' = 'A4') => {
    const isThermal = format === 'thermal';
    if (type === 'sale' || type === 'purchase') {
      const inv = data as SaleInvoice | PurchaseInvoice;
      const isSale = type === 'sale';
      printInvoiceWindow(inv, isSale, appData.settings, showToast, format);
    } else if (type === 'cash') {
      const c = data as CashTransaction;
      if (!isThermal && format === 'A4') {
        printCashVoucherWindow(c, appData, showToast);
      } else {
        openUnifiedPrintWindow(
          {
            title: c.type === 'receive' ? 'سند قبض نقدية رسمي' : c.type === 'pay' ? 'سند صرف نقدية رسمي' : 'إشعار حركة خزينة',
            docNumber: c.id,
            date: c.date,
            partyLabel: c.customerName ? 'استلمنا من السيد/العميل' : c.supplierName ? 'صرفنا إلى السيد/المورد' : 'الطرف المعني',
            partyName: c.customerName || c.supplierName || 'حساب عام',
            paymentMethod: c.method === 'drawer' ? 'الصندوق الرئيسي' : c.method === 'bank' ? 'البنك' : c.method,
            notes: c.note,
            isThermal,
            totals: [
              { label: 'المبلغ الإجمالي للسند:', value: c.amount, isBold: true, isHighlight: true },
            ],
          },
          appData.settings,
          showToast
        );
      }
    } else if (type === 'cheque') {
      const chq = data as Cheque;
      printChequeVoucher(chq, appData);
    } else if (type === 'payroll') {
      const p = data as PayrollSlip;
      openUnifiedPrintWindow(
        {
          title: 'قسيمة ومسير راتب موظف (Pay Slip)',
          docNumber: p.slipNumber || p.id,
          date: p.paymentDate || p.createdAt?.substring(0, 10),
          partyLabel: 'اسم الموظف',
          partyName: `${p.employeeName} (${p.department})`,
          notes: `مسير راتب شهر: ${p.month} | ${p.notes || ''}`,
          totals: [
            { label: 'الراتب الأساسي:', value: p.basicSalary },
            { label: 'البدلات والمكافآت:', value: p.allowances + p.bonuses + p.overtime },
            { label: 'إجمالي المستحق:', value: p.grossSalary },
            { label: 'الاستقطاعات والغيابات:', value: -p.deductions },
            { label: 'سداد السلف الشهرية:', value: -p.advancesDeducted },
            { label: 'صافي الراتب المستلم:', value: p.netSalary, isBold: true, isHighlight: true },
          ],
        },
        appData.settings,
        showToast
      );
    } else if (type === 'journal') {
      const j = data as any;
      openUnifiedPrintWindow(
        {
          title: 'سند وقيد يومية عامة مزدوج (Journal Voucher)',
          docNumber: j.id || j.entryNumber || '',
          date: j.date || j.createdAt?.substring(0, 10),
          partyLabel: 'البيان العام',
          partyName: j.description || j.notes || 'قيد تسوية يومية عامة',
          isThermal,
          items: j.lines?.map((l: any) => ({
            name: l.accountName || l.description || 'حساب',
            qty: l.debit > 0 ? `مدين: ${Number(l.debit).toLocaleString()}` : `دائن: ${Number(l.credit).toLocaleString()}`,
            price: l.debit > 0 ? l.debit : l.credit,
            total: l.debit > 0 ? l.debit : l.credit,
            notes: l.notes || '',
          })),
          totals: [
            { label: 'إجمالي الجانب المدين:', value: j.totalDebit || j.totalAmount || 0 },
            { label: 'إجمالي الجانب الدائن:', value: j.totalCredit || j.totalAmount || 0, isBold: true, isHighlight: true },
          ],
        },
        appData.settings,
        showToast
      );
    } else if (type === 'quote') {
      const q = data as any;
      openUnifiedPrintWindow(
        {
          title: q.type === 'purchase_order' ? 'أمر شراء وتوريد رسمي' : 'عرض أسعار تجاري معتمد (Quotation)',
          docNumber: q.quoteNumber || q.id || '',
          date: q.date || q.validUntil,
          partyLabel: q.customerName ? 'العميل المستلم' : 'المورد الموجه له',
          partyName: q.customerName || q.supplierName || '',
          partyPhone: q.phone || '',
          notes: q.notes || q.terms,
          isThermal,
          items: q.items?.map((it: any) => ({
            name: it.name,
            qty: it.qty,
            price: it.price,
            discount: it.discount,
            total: it.total,
          })),
          totals: [
            { label: 'المجموع قبل الضريبة:', value: q.subtotal || q.total },
            ...(q.tax > 0 ? [{ label: 'ضريبة القيمة المضافة:', value: q.tax }] : []),
            { label: 'الإجمالي النهائي المعتمد:', value: q.total, isBold: true, isHighlight: true },
          ],
        },
        appData.settings,
        showToast
      );
    } else if (type === 'transfer') {
      const tr = data as any;
      openUnifiedPrintWindow(
        {
          title: 'إذن تحويل ونقل مخزني بين الفروع',
          docNumber: tr.id || tr.transferNumber || '',
          date: tr.date || tr.createdAt?.substring(0, 10),
          partyLabel: 'مسار التحويل',
          partyName: `من: ${tr.fromWarehouse || 'المخزن الرئيسي'} ⬅ إلى: ${tr.toWarehouse || 'مخزن الفرع'}`,
          notes: tr.notes || `مسؤول النقل والترحيل: ${tr.createdBy || 'مدير المخازن'}`,
          isThermal,
          items: tr.items?.map((it: any) => ({
            name: it.name,
            qty: it.qty,
            price: it.cost || 0,
            total: (Number(it.qty) || 0) * (Number(it.cost) || 0),
          })),
          totals: [
            { label: 'إجمالي عدد الأصناف المحولة:', value: tr.items?.length || 0, isBold: true, isHighlight: true },
          ],
        },
        appData.settings,
        showToast
      );
    } else {
      showToast('جاري تجهيز وطباعة المستند المحاسبي...', 'info');
      openUnifiedPrintWindow(
        {
          title: getTypeTitle(),
          docNumber: data.id || data.code || data.orderNumber || data.number || '',
          date: data.date || data.createdAt?.substring(0, 10),
          partyName: data.customerName || data.supplierName || data.name || data.title || '',
          notes: data.notes || data.description || data.note || '',
          totals: data.amount || data.total ? [{ label: 'القيمة الإجمالية:', value: data.amount || data.total, isBold: true, isHighlight: true }] : undefined,
        },
        appData.settings,
        showToast
      );
    }
  };

  // Safe Deletion with Full Rollback
  const handleDelete = () => {
    let updated = { ...appData };

    if (type === 'sale') {
      const inv = data as SaleInvoice;
      // 1. Rollback stock
      if (inv.items && inv.items.length > 0) {
        updated.items = updated.items.map((it) => {
          const invItem = inv.items.find((x) => x.name === it.name || x.itemId === it.id);
          if (invItem) {
            const returnedQty = inv.type?.includes('return') ? -invItem.qty : invItem.qty;
            return { ...it, quantity: it.quantity + returnedQty };
          }
          return it;
        });
      }
      // 2. Rollback customer balance
      if (inv.customerName) {
        updated.customers = updated.customers.map((c) => {
          if (c.name === inv.customerName) {
            const netChange = (inv.remainingAmount || (inv.total - (inv.paidAmount || 0)));
            return { ...c, balance: Math.max(0, c.balance - (inv.type?.includes('return') ? -netChange : netChange)) };
          }
          return c;
        });
      }
      // 3. Rollback cash if paid
      if (inv.paidAmount && inv.paidAmount > 0) {
        const method = inv.paymentMethod === 'drawer' ? 'drawer' : 'bank';
        updated.cashBox = {
          ...updated.cashBox,
          [method]: Math.max(0, (updated.cashBox[method as keyof typeof updated.cashBox] || 0) - inv.paidAmount),
        };
      }
      // Remove invoice
      updated.salesInvoices = updated.salesInvoices.filter((x) => x.id !== inv.id);
      updated = addAuditLog(updated, 'delete', 'المبيعات', `تم حذف فاتورة مبيعات #${inv.id} للعميل ${inv.customerName} وإعادة المخزون والأرصدة.`);
    } else if (type === 'purchase') {
      const inv = data as PurchaseInvoice;
      // Rollback stock
      if (inv.items && inv.items.length > 0) {
        updated.items = updated.items.map((it) => {
          const invItem = inv.items.find((x) => x.name === it.name || x.itemId === it.id);
          if (invItem) {
            const deductedQty = inv.type?.includes('return') ? -invItem.qty : invItem.qty;
            return { ...it, quantity: Math.max(0, it.quantity - deductedQty) };
          }
          return it;
        });
      }
      // Rollback supplier balance
      if (inv.supplierName) {
        updated.suppliers = updated.suppliers.map((s) => {
          if (s.name === inv.supplierName) {
            const netChange = (inv.remainingAmount || (inv.total - (inv.paidAmount || 0)));
            return { ...s, balance: Math.max(0, s.balance - netChange) };
          }
          return s;
        });
      }
      updated.purchaseInvoices = updated.purchaseInvoices.filter((x) => x.id !== inv.id);
      updated = addAuditLog(updated, 'delete', 'المشتريات', `تم حذف فاتورة مشتريات #${inv.id} للمورد ${inv.supplierName} وتسوية الأرصدة.`);
    } else if (type === 'cash') {
      const c = data as CashTransaction;
      const methodKey = c.method === 'drawer' ? 'drawer' : c.method === 'vodafone' ? 'vodafone' : c.method === 'instapay' ? 'instapay' : 'bank';
      if (c.type === 'receive' || c.type === 'deposit') {
        updated.cashBox = { ...updated.cashBox, [methodKey]: Math.max(0, updated.cashBox[methodKey] - c.amount) };
      } else {
        updated.cashBox = { ...updated.cashBox, [methodKey]: updated.cashBox[methodKey] + c.amount };
      }
      // Rollback customer/supplier balance
      if (c.customerName) {
        updated.customers = updated.customers.map((cust) => cust.name === c.customerName ? { ...cust, balance: cust.balance + c.amount } : cust);
      }
      if (c.supplierName) {
        updated.suppliers = updated.suppliers.map((sup) => sup.name === c.supplierName ? { ...sup, balance: sup.balance + c.amount } : sup);
      }
      updated.cashTransactions = updated.cashTransactions.filter((x) => x.id !== c.id);
      updated = addAuditLog(updated, 'delete', 'الخزينة والمالية', `تم حذف سند مالي #${c.id} بقيمة ${c.amount} ${currency}.`);
    } else if (type === 'journal') {
      const j = data as JournalEntry;
      updated.journalEntries = updated.journalEntries.filter((x) => x.id !== j.id);
      updated = addAuditLog(updated, 'delete', 'القيود المزدوجة', `تم حذف قيد يومية رقم ${j.entryNumber}.`);
    } else if (type === 'cheque') {
      const chq = data as Cheque;
      updated.cheques = updated.cheques.filter((x) => x.id !== chq.id);
      updated = addAuditLog(updated, 'delete', 'الشيكات والأوراق المالية', `تم حذف الشيك رقم ${chq.chequeNumber}.`);
    } else if (type === 'quote') {
      const q = data as Quotation;
      updated.quotations = updated.quotations.filter((x) => x.id !== q.id);
      updated = addAuditLog(updated, 'delete', 'عروض الأسعار', `تم حذف عرض السعر #${q.id}.`);
    } else if (type === 'payroll') {
      const p = data as PayrollSlip;
      updated.payrollSlips = updated.payrollSlips.filter((x) => x.id !== p.id);
      updated = addAuditLog(updated, 'delete', 'الرواتب والأجور', `تم حذف مسير راتب #${p.id} للموظف ${p.employeeName}.`);
    } else if (type === 'production') {
      const prod = data as ProductionOrder;
      updated.productionOrders = updated.productionOrders.filter((x) => x.id !== prod.id);
      updated = addAuditLog(updated, 'delete', 'التصنيع', `تم حذف أمر الإنتاج رقم ${prod.orderNumber}.`);
    }

    onUpdateData(updated);
    showToast(`تم حذف العملية بنجاح وتحديث كافة الأرصدة المتأثرة`, 'success');
    setIsDeleting(false);
    onClose();
  };

  // Save quick edits (Notes, Date, Status)
  const handleSaveEdit = () => {
    let updated = { ...appData };
    if (type === 'sale') {
      updated.salesInvoices = updated.salesInvoices.map((s) =>
        s.id === data.id
          ? { ...s, notes: editNotes || s.notes, date: editDate || s.date, status: (editStatus as any) || s.status }
          : s
      );
    } else if (type === 'purchase') {
      updated.purchaseInvoices = updated.purchaseInvoices.map((p) =>
        p.id === data.id
          ? { ...p, notes: editNotes || p.notes, date: editDate || p.date, status: (editStatus as any) || p.status }
          : p
      );
    } else if (type === 'cash') {
      updated.cashTransactions = updated.cashTransactions.map((c) =>
        c.id === data.id ? { ...c, note: editNotes || c.note, date: editDate || c.date } : c
      );
    } else if (type === 'cheque') {
      updated.cheques = updated.cheques.map((c) =>
        c.id === data.id ? { ...c, notes: editNotes || c.notes, status: (editStatus as any) || c.status } : c
      );
    }

    updated = addAuditLog(updated, 'update', getTypeTitle(), `تم تعديل بيانات العملية #${data.id || data.code || ''}.`);
    onUpdateData(updated);
    showToast('تم حفظ التعديلات بنجاح', 'success');
    setActiveTab('view');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fade-in" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Modal Top Bar */}
        <div className="bg-white text-slate-900 border-b-2 border-slate-200 p-4 md:px-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔍</span>
            <div>
              <h3 className="font-black text-lg md:text-xl flex items-center gap-2 text-slate-900">
                <span>{getTypeTitle()}</span>
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs px-2.5 py-0.5 rounded-full font-bold">
                  #{data.id || data.code || data.orderNumber || data.chequeNumber || '0'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                📅 التاريخ: {data.date || data.createdAt?.substring(0, 10) || '-'} {data.time ? `| ⏰ ${data.time}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePrint('A4')}
              className="bg-[#2e7d32] hover:bg-[#1b5e20] active:bg-[#124116] text-white px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-xs"
              title="طباعة سريعة ومباشرة للمستند"
            >
              <span>⚡</span>
              <span className="hidden sm:inline">طباعة سريعة</span>
            </button>
            <button
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full w-8 h-8 flex items-center justify-center transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-2 text-xs font-bold">
          <button
            onClick={() => setActiveTab('view')}
            className={`pb-2.5 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'view' ? 'border-[#0d47a1] text-[#0d47a1]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📋 المعاينة الشاملة</span>
          </button>
          <button
            onClick={() => {
              setEditNotes(data.notes || data.note || '');
              setEditDate(data.date || '');
              setEditStatus(data.status || '');
              setActiveTab('edit');
            }}
            className={`pb-2.5 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'edit' ? 'border-[#0d47a1] text-[#0d47a1]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>✏️ تعديل العملية</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-2.5 px-4 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audit' ? 'border-[#0d47a1] text-[#0d47a1]' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>🛡️ سجل التتبع والتدقيق</span>
          </button>
        </div>

        {/* Modal Body */}
        {/* Modal Body */}
        <div className="p-3 sm:p-5 md:p-6 overflow-y-auto flex-1 bg-slate-200/80">
          {activeTab === 'view' && (
            <div className="w-full flex justify-center py-2">
              {/* حاوية المستند بمقاس A5 الأصلي المظبوط والمستقر تماماً بخلفية بيضاء */}
              <div
                className="bg-white text-black w-full max-w-[148mm] min-h-[210mm] p-4 sm:p-6 border-2 border-black shadow-xl flex flex-col justify-between text-xs mx-auto"
                style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}
              >
                <div className="w-full">
                  {/* 1. الترويسة العلوية الثلاثية */}
                  <div className="flex justify-between items-center border-b-[2.5px] border-black pb-2 mb-2 gap-2">
                    <div className="flex-[1.2] text-right">
                      <h2 className="text-base font-black text-black m-0 leading-tight">
                        {appData.settings?.companyName || 'شركة ركيزة للحلول البرمجية'}
                      </h2>
                      <p className="text-[10px] font-semibold text-slate-700 m-0 leading-tight mt-0.5">
                        {appData.settings?.address || 'القاهرة - مصر'}
                      </p>
                    </div>

                    <div className="shrink-0 text-center">
                      {(appData.settings as any)?.logo || (appData.settings as any)?.logoUrl ? (
                        <img
                          src={(appData.settings as any)?.logo || (appData.settings as any)?.logoUrl}
                          alt="الشعار"
                          className="max-h-10 max-w-[80px] object-contain"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      ) : null}
                    </div>

                    <div className="flex-1 text-left text-[10px] font-semibold text-black leading-tight" dir="ltr">
                      {[appData.settings?.phone1, appData.settings?.phone2, appData.settings?.phone3]
                        .filter(Boolean)
                        .concat(['01029190615'])
                        .slice(0, 2)
                        .map((ph, idx) => (
                          <div key={idx}><strong>Tel {idx + 1}:</strong> {ph}</div>
                        ))}
                    </div>
                  </div>

                  {/* 2. مربع بيانات المستند */}
                  <div className="border-[1.5px] border-black bg-white p-2 mb-2 text-[10.5px] font-semibold">
                    <div className="flex justify-between items-center flex-nowrap gap-1">
                      <div className="flex-[1.3] text-right leading-relaxed">
                        <div>
                          <strong>الطرف: </strong>
                          <span>
                            {data.customerName || data.supplierName || data.employeeName || data.name || data.title || 'عام'}
                          </span>
                        </div>
                        {(data.customerId || data.supplierId || data.code) && (
                          <div>
                            <strong>الكود: </strong>
                            <span>{data.customerId || data.supplierId || data.code}</span>
                          </div>
                        )}
                        {(data.phone || data.customerPhone || data.supplierPhone) && (
                          <div>
                            <strong>الهاتف: </strong>
                            <span>{data.phone || data.customerPhone || data.supplierPhone}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 text-center leading-relaxed border-r border-l border-dashed border-slate-500 px-1">
                        <strong className="text-black">{getTypeTitle()}</strong>
                        <div className="text-xs font-black">
                          رقم: #{data.id || data.code || data.orderNumber || data.chequeNumber || '1'}
                        </div>
                      </div>

                      <div className="flex-[1.1] text-left leading-relaxed">
                        <div>
                          <strong>التاريخ: </strong>
                          <span>{data.date || data.createdAt?.substring(0, 10) || '-'}</span>
                        </div>
                        {data.time && (
                          <div>
                            <strong>الوقت: </strong>
                            <span>{data.time}</span>
                          </div>
                        )}
                        {data.paymentMethod && (
                          <div>
                            <strong>السداد: </strong>
                            <span>{data.paymentMethod === 'drawer' ? 'كاش (الخزينة)' : data.paymentMethod === 'bank' ? 'بنكي' : data.paymentMethod}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3. مستطيل البيان (يختفي تماماً إذا ترك فارغاً) */}
                  {(data.notes || data.note || data.description) && (
                    <div className="border-[1.5px] border-slate-700 p-1.5 px-2 mb-2 text-[10.5px] font-semibold bg-white text-slate-900">
                      <strong>📝 البيان: </strong> {data.notes || data.note || data.description}
                    </div>
                  )}

                  {/* 4. جدول المحتوى المتناسق بدقة */}
                  {data.items && data.items.length > 0 ? (
                    <div className="w-full mb-2">
                      <table className="w-full border-collapse border-[1.5px] border-black text-[11px] table-fixed">
                        <thead>
                          <tr className="bg-[#e6e6e6] text-black font-extrabold text-[11.5px]">
                            <th className="border-[1.5px] border-black p-1.5 text-right pr-2 w-[34%]">اسم الصنف</th>
                            <th className="border-[1.5px] border-black p-1.5 text-center w-[22%]">البيان</th>
                            <th className="border-[1.5px] border-black p-1.5 text-center w-[10%]">العدد</th>
                            <th className="border-[1.5px] border-black p-1.5 text-center w-[16%]">السعر</th>
                            <th className="border-[1.5px] border-black p-1.5 text-center w-[18%]">الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.items.map((it: any, idx: number) => {
                            const qty = parseFloat(String(it.qty)) || 0;
                            const price = parseFloat(String(it.price)) || 0;
                            const itemTotal = Number(it.total !== undefined ? it.total : qty * price);
                            const desc = it.spec || it.notes || it.desc || it.description || '-';

                            return (
                              <tr key={idx} className="border-b border-black">
                                <td className="border-[1.5px] border-black p-1 text-right pr-2 font-bold break-words">
                                  {it.name}
                                </td>
                                <td className="border-[1.5px] border-black p-1 text-center text-[10px] text-slate-700 break-words">
                                  {desc}
                                </td>
                                <td className="border-[1.5px] border-black p-1 text-center font-bold">
                                  {qty}
                                </td>
                                <td className="border-[1.5px] border-black p-1 text-center">
                                  {price.toFixed(2)}
                                </td>
                                <td className="border-[1.5px] border-black p-1 text-center font-extrabold">
                                  {itemTotal.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : type === 'cash' ? (
                    <div className="w-full mb-2">
                      <table className="w-full border-collapse border-[1.5px] border-black text-[11px] table-fixed">
                        <thead>
                          <tr className="bg-[#e6e6e6] text-black font-extrabold text-[11.5px]">
                            <th className="border-[1.5px] border-black p-1.5 text-center w-[30%]">البند المالي</th>
                            <th className="border-[1.5px] border-black p-1.5 text-right pr-2 w-[70%]">التفاصيل والبيان</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-black">
                            <td className="border-[1.5px] border-black p-1.5 text-center font-bold bg-slate-50">المبلغ بالأرقام</td>
                            <td className="border-[1.5px] border-black p-1.5 text-right pr-2 font-black text-sm text-[#0d47a1]">
                              {Number(data.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                            </td>
                          </tr>
                          <tr className="border-b border-black">
                            <td className="border-[1.5px] border-black p-1.5 text-center font-bold bg-slate-50">طريقة السداد</td>
                            <td className="border-[1.5px] border-black p-1.5 text-right pr-2 font-bold">
                              {data.method === 'drawer' ? 'نقدي (الخزينة الرئيسية)' : data.method === 'bank' ? 'تحويل بنكي' : data.method}
                            </td>
                          </tr>
                          <tr className="border-b border-black">
                            <td className="border-[1.5px] border-black p-1.5 text-center font-bold bg-slate-50">البيان والسبب</td>
                            <td className="border-[1.5px] border-black p-1.5 text-right pr-2 font-semibold text-slate-800">
                              {data.note || data.reason || 'تسوية وحركة مالية رسمية'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : type === 'journal' && data.lines && data.lines.length > 0 ? (
                    <div className="w-full mb-2">
                      <table className="w-full border-collapse border-[1.5px] border-black text-[11px] table-fixed">
                        <thead>
                          <tr className="bg-[#e6e6e6] text-black font-extrabold text-[11.5px]">
                            <th className="border-[1.5px] border-black p-1.5 text-right pr-2 w-[35%]">اسم الحساب</th>
                            <th className="border-[1.5px] border-black p-1.5 text-center w-[25%]">البيان</th>
                            <th className="border-[1.5px] border-black p-1.5 text-center w-[20%]">مدين</th>
                            <th className="border-[1.5px] border-black p-1.5 text-center w-[20%]">دائن</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.lines.map((l: any, idx: number) => (
                            <tr key={idx} className="border-b border-black">
                              <td className="border-[1.5px] border-black p-1 text-right pr-2 font-bold">{l.accountName || 'حساب'}</td>
                              <td className="border-[1.5px] border-black p-1 text-center text-[10px] text-slate-700">{l.notes || l.description || '-'}</td>
                              <td className="border-[1.5px] border-black p-1 text-center font-bold">{l.debit > 0 ? Number(l.debit).toLocaleString() : '-'}</td>
                              <td className="border-[1.5px] border-black p-1 text-center font-bold">{l.credit > 0 ? Number(l.credit).toLocaleString() : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {/* 5. قسم الإجماليات وتفاصيل الدفع */}
                  {(data.total !== undefined || data.amount !== undefined || data.netSalary !== undefined) && (
                    <div className="border-t-[2.5px] border-black pt-1.5 text-[11.5px] font-extrabold mb-2">
                      <div className="flex justify-between py-0.5">
                        <span>إجمالي القيمة:</span>
                        <span>{Number(data.total ?? data.amount ?? data.netSalary ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</span>
                      </div>

                      {data.paidAmount !== undefined && (
                        <div className="flex justify-between py-0.5 border-t border-dashed border-slate-500 pt-1 mt-1">
                          <span>طريقة الدفع: <span className="inline-block px-1.5 py-0.5 rounded border border-black bg-slate-100 text-[10px]">{data.paymentMethod === 'drawer' ? 'كاش' : data.paymentMethod || 'نقداً'}</span></span>
                          <span>المدفوع: <strong>{Number(data.paidAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</strong></span>
                        </div>
                      )}

                      {data.remainingAmount > 0 && (
                        <div className="flex justify-between py-0.5 text-rose-700 font-black">
                          <span>المبلغ المتبقي (الآجل):</span>
                          <strong>{Number(data.remainingAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</strong>
                        </div>
                      )}

                      {data.tax > 0 && (
                        <div className="flex justify-between py-0.5 text-slate-600 text-[10.5px]">
                          <span>الضريبة:</span>
                          <span>{Number(data.tax).toFixed(2)} {currency}</span>
                        </div>
                      )}

                      {data.discount > 0 && (
                        <div className="flex justify-between py-0.5 text-slate-600 text-[10.5px]">
                          <span>الخصم:</span>
                          <span>-{Number(data.discount).toFixed(2)} {currency}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 6. التزييل الداخلي */}
                <div className="text-center text-[10px] font-extrabold text-black border-t-[1.5px] border-dashed border-black pt-1.5 mt-auto">
                  <p>{appData.settings?.invoiceFooterNote || 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً للشروط والأحكام'}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'edit' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ العملية</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">حالة العملية</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs bg-white"
                >
                  <option value="approved">معتمد (Approved)</option>
                  <option value="draft">مسودة (Draft)</option>
                  <option value="cancelled">ملغي (Cancelled)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البيان والملاحظات</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
                  placeholder="أدخل أي تعديلات أو إيضاحات..."
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveEdit}
                  className="bg-[#0d47a1] hover:bg-[#1a237e] text-white px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                >
                  💾 حفظ التعديلات
                </button>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs text-slate-700">
                🛡️ سجل الأمان وتتبع التعديلات لهذه العملية:
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                <div className="p-3 bg-white flex justify-between items-center">
                  <div>
                    <strong className="text-slate-800">إنشاء العملية الأصلية</strong>
                    <div className="text-[11px] text-slate-500">بواسطة: {data.createdBy || 'مدير النظام'}</div>
                  </div>
                  <span className="text-slate-400 font-mono">{data.createdAt || data.date || '-'}</span>
                </div>
                {appData.auditLogs
                  ?.filter((l) => l.details.includes(String(data.id || data.code || '')) || l.details.includes(data.customerName || data.supplierName || ''))
                  .map((log) => (
                    <div key={log.id} className="p-3 bg-white flex justify-between items-center">
                      <div>
                        <strong className="text-blue-900">{log.action === 'create' ? 'إضافة' : log.action === 'update' ? 'تعديل' : log.action}</strong>
                        <div className="text-[11px] text-slate-600">{log.details}</div>
                      </div>
                      <span className="text-slate-400 font-mono text-[10px]">{log.timestamp}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="bg-slate-100 p-4 px-6 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handlePrint('A4')}
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="معاينة وطباعة مقاس A4 قياسي"
            >
              <span>📄</span>
              <span>طباعة A4</span>
            </button>
            <button
              onClick={() => handlePrint('A5')}
              className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="معاينة وطباعة مقاس A5 مدمج"
            >
              <span>📑</span>
              <span>طباعة A5</span>
            </button>
            <button
              onClick={() => handlePrint('thermal')}
              className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="معاينة وطباعة إيصال بون حراري 80mm"
            >
              <span>🧾</span>
              <span>إيصال حراري 80mm</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!isDeleting ? (
              <button
                onClick={() => setIsDeleting(true)}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
              >
                <span>🗑️ حذف العملية</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-rose-100 p-1.5 rounded-xl border border-rose-300">
                <span className="text-[11px] font-bold text-rose-900 px-1">تأكيد الحذف واسترجاع الأرصدة؟</span>
                <button
                  onClick={handleDelete}
                  className="bg-rose-700 hover:bg-rose-800 text-white px-3 py-1 rounded-lg text-xs font-bold cursor-pointer"
                >
                  نعم، احذف
                </button>
                <button
                  onClick={() => setIsDeleting(false)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded-lg text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="bg-slate-300 hover:bg-slate-400 text-slate-800 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

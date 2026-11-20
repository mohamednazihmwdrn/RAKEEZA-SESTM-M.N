import { SaleInvoice, Customer, Settings, Quotation } from '../types';
import { UniversalPrintPayload } from '../types/universalPrint';

/**
 * 📲 RAKEEZA WhatsApp Business Messaging Helper
 * Supports direct web/app redirection via wa.me and formatted professional Arabic notices
 */

export function cleanPhoneNumber(phone?: string): string {
  if (!phone) return '';
  // Remove spaces, hyphens, plus signs, brackets
  let cleaned = phone.replace(/[\s\-\+\(\)]/g, '');
  
  // If starts with 01 (Egyptian mobile format: 010, 011, 012, 015)
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    cleaned = '2' + cleaned; // Add Egypt country code 201...
  } else if (cleaned.startsWith('1') && cleaned.length === 10) {
    cleaned = '20' + cleaned;
  }
  
  return cleaned;
}

export function generateInvoiceWhatsAppMessage(invoice: SaleInvoice, settings?: Settings): string {
  const companyName = settings?.companyName || 'منظومة ركيزة';
  const currency = 'ج.م';

  const itemsList = (invoice.items || [])
    .slice(0, 10)
    .map((item) => `▫️ ${item.name} (${item.qty} × ${(item.price || 0).toLocaleString()} = ${(item.total || 0).toLocaleString()} ${currency})`)
    .join('\n');

  const extraItemsCount = (invoice.items || []).length > 10 ? `\n... وباقي الأصناف (${invoice.items.length - 10} صنف إضافي)` : '';

  const paymentStatus =
    invoice.paidAmount >= invoice.total
      ? '✅ خالص بالكامل'
      : invoice.paidAmount > 0
      ? `⚠️ مدفوع جزئياً (متبقي: ${(invoice.remainingAmount || 0).toLocaleString()} ${currency})`
      : `⏳ آجل بالكامل (مستحق: ${(invoice.total || 0).toLocaleString()} ${currency})`;

  return `السلام عليكم ورحمة الله وبركاته،
أهلاً بحضرتك أستاذ/ة: *${invoice.customerName}* 🌸

يسعدنا في *${companyName}* إرسال تفاصيل فاتورة المبيعات الخاصة بكم:
📋 *رقم الفاتورة:* #${invoice.id}
📅 *التاريخ:* ${invoice.date}
${invoice.salesRep ? `👔 *المندوب المسؤول:* ${invoice.salesRep}\n` : ''}
📦 *ملخص بنود الفاتورة:*
${itemsList}${extraItemsCount}

💰 *الإجمالي النهائي:* ${(invoice.total || 0).toLocaleString()} ${currency}
💵 *المدفوع:* ${(invoice.paidAmount || 0).toLocaleString()} ${currency}
📊 *حالة السداد:* ${paymentStatus}

${invoice.notes ? `📝 *ملاحظات:* ${invoice.notes}\n` : ''}
سعداء دائماً بخدمتكم وتلبية طلباتكم.
لأي استفسار أو متابعة نتشرف بتواصلكم معنا.
*${companyName}*`;
}

export function generateStatementWhatsAppMessage(
  customerOrName: Customer | string,
  balanceOrSettings?: number | Settings,
  dateStr?: string,
  settingsObj?: Settings
): string {
  let custName = typeof customerOrName === 'string' ? customerOrName : customerOrName.name;
  let balance = typeof balanceOrSettings === 'number' ? balanceOrSettings : (typeof customerOrName === 'object' ? customerOrName.balance || 0 : 0);
  let effectiveSettings = typeof balanceOrSettings === 'object' ? balanceOrSettings : (settingsObj || undefined);

  const companyName = effectiveSettings?.companyName || 'منظومة ركيزة';
  const currency = 'ج.م';

  const statusText =
    balance > 0
      ? `📌 *الرصيد المستحق طرف سيادتكم:* ${balance.toLocaleString()} ${currency}`
      : balance < 0
      ? `🟢 *رصيد دائن لصالحكم:* ${Math.abs(balance).toLocaleString()} ${currency}`
      : `✅ *الحساب خالص تماماً ومطابق بدون أي مديونية.*`;

  return `السلام عليكم ورحمة الله وبركاته،
عناية العميل الكريم: *${custName}* المحترم 🌸

تحية طيبة من *${companyName}*،
نرفق لسيادتكم ملخص كشف الحساب المالي حتى تاريخ اليوم ${dateStr ? `(${dateStr})` : ''}:

${statusText}

${balance > 0 ? `نرجو التكرم بالاطلاع والمراجعة لجدولة السداد في أقرب فرصة شاكرين لسيادتكم حسن تعاونكم الدائم وثقتكم بنا.` : ''}

نسعد دائماً بشراكتنا المستمرة معكم.
*إدارة الحسابات - ${companyName}*`;
}

export function generateQuotationWhatsAppMessage(quote: Quotation, settings?: Settings): string {
  const companyName = settings?.companyName || 'منظومة ركيزة';
  const currency = 'ج.م';
  const clientName = (quote as any).customerName || (quote as any).clientName || 'العميل';

  return `السلام عليكم ورحمة الله وبركاته،
السادة الكرام / *${clientName}* المحترمون 🌸

تحية طيبة وبعد،
يسعدنا في *${companyName}* تقديم عرض السعر رقم: *#${quote.id}*
📅 *تاريخ العرض:* ${quote.date}
${quote.validUntil ? `⏳ *صلاحية العرض حتى:* ${quote.validUntil}\n` : ''}
💰 *القيمة الإجمالية للعرض:* ${(quote.total || 0).toLocaleString()} ${currency}

نأمل أن ينال عرضنا قبولكم، ويسعدنا تقديم أي استفسارات أو توضيحات.
شاكرين لكم اهتمامكم ونسعد بالتعاون معكم.

*${companyName}*`;
}

export function generateUniversalDocumentWhatsAppMessage(payload: UniversalPrintPayload): string {
  const companyName = payload.settings?.companyName || 'منظومة ركيزة';
  const cur = payload.settings?.currencySymbol || 'ج.م';
  const lines: string[] = [];

  lines.push(`*${companyName}*`);
  lines.push(`📄 *${payload.title}*${payload.docNumber ? ` (#${payload.docNumber})` : ''}`);
  if (payload.date) {
    lines.push(`📅 *التاريخ:* ${payload.date}${payload.time ? ` - ${payload.time}` : ''}`);
  }
  if (payload.partyName) {
    lines.push(`👤 *${payload.partyLabel || 'الطرف'}:* ${payload.partyName}`);
  }

  if (payload.items && payload.items.length > 0) {
    lines.push('');
    lines.push('📦 *التفاصيل والأصناف:*');
    payload.items.slice(0, 12).forEach((itm) => {
      const unitLabel = itm.unit ? ` ${itm.unit}` : '';
      lines.push(`▫️ ${itm.name} (${itm.qty}${unitLabel} × ${itm.price} = ${itm.total} ${cur})`);
    });
    if (payload.items.length > 12) {
      lines.push(`... وعدد ${payload.items.length - 12} بنود إضافية`);
    }
  }

  if (payload.kind === 'account_statement') {
    lines.push('');
    if (payload.openingBalance !== undefined) {
      lines.push(`🔹 *رصيد سابق:* ${Number(payload.openingBalance).toLocaleString()} ${cur}`);
    }
    if (payload.totalDebit !== undefined) {
      lines.push(`➕ *إجمالي مدين:* ${Number(payload.totalDebit).toLocaleString()} ${cur}`);
    }
    if (payload.totalCredit !== undefined) {
      lines.push(`➖ *إجمالي دائن:* ${Number(payload.totalCredit).toLocaleString()} ${cur}`);
    }
    if (payload.closingBalance !== undefined) {
      lines.push(`📌 *الرصيد الختامي:* ${Number(payload.closingBalance).toLocaleString()} ${cur}${payload.balanceStatus ? ` (${payload.balanceStatus})` : ''}`);
    }
  } else {
    const netAmount = payload.amount !== undefined ? Number(payload.amount) : undefined;
    if (payload.subtotal !== undefined && Number(payload.discountAmount || 0) > 0) {
      lines.push(`▫️ الإجمالي قبل الخصم: ${Number(payload.subtotal).toLocaleString()} ${cur}`);
      lines.push(`🏷️ الخصم: ${Number(payload.discountAmount).toLocaleString()} ${cur}`);
    }
    if (Number(payload.taxAmount || 0) > 0) {
      lines.push(`🧾 الضريبة: ${Number(payload.taxAmount).toLocaleString()} ${cur}`);
    }
    if (netAmount !== undefined) {
      lines.push('');
      lines.push(`💰 *الصافي النهائي:* ${netAmount.toLocaleString()} ${cur}`);
    }
    if (payload.paidAmount !== undefined) {
      lines.push(`💵 *المدفوع:* ${Number(payload.paidAmount).toLocaleString()} ${cur}`);
    }
    if (payload.remainingAmount !== undefined && Number(payload.remainingAmount) > 0) {
      lines.push(`⏳ *المتبقي:* ${Number(payload.remainingAmount).toLocaleString()} ${cur}`);
    }
  }

  if (payload.statementOrReason) {
    lines.push(`📝 *البيان:* ${payload.statementOrReason}`);
  }
  if (payload.notes) {
    lines.push(`🗒️ *ملاحظات:* ${payload.notes}`);
  }

  lines.push('');
  lines.push(`نسعد دائماً بخدمتكم — *${companyName}*`);
  return lines.join('\n');
}

export function openWhatsAppChat(phone: string, text: string): boolean {
  const clean = cleanPhoneNumber(phone);
  const encodedText = encodeURIComponent(text);
  
  if (clean) {
    const url = `https://wa.me/${clean}?text=${encodedText}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } else {
    // If no phone is provided, open web sharing prompt
    const url = `https://wa.me/?text=${encodedText}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    return false;
  }
}

/**
 * 🔤 RAKEEZA Arabic Currency Tafqeet Engine
 * Converts numerical financial amounts to formal legal Arabic words.
 * Example: 1540.50 => فقط ألف وخمسمائة وأربعون جنيهاً مصرياً وخمسون قرشاً لا غير
 */

const ONES = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];

const TENS = [
  '',
  '',
  'عشرون',
  'ثلاثون',
  'أربعون',
  'خمسون',
  'ستون',
  'سبعون',
  'ثمانون',
  'تسعون',
];

const HUNDREDS = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];

const THOUSANDS = [
  '',
  'ألف',
  'ألفان',
  'آلاف',
  'ألفاً',
];

const MILLIONS = [
  '',
  'مليون',
  'مليونان',
  'ملايين',
  'مليوناً',
];

const BILLIONS = [
  '',
  'مليار',
  'ملياران',
  'مليارات',
  'ملياراً',
];

function convertGroup(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];

  const h = Math.floor(n / 100);
  const remainder = n % 100;

  if (h > 0) {
    parts.push(HUNDREDS[h]);
  }

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const o = remainder % 10;
      const t = Math.floor(remainder / 10);
      if (o > 0) {
        parts.push(`${ONES[o]} و${TENS[t]}`);
      } else {
        parts.push(TENS[t]);
      }
    }
  }

  return parts.join(' و');
}

function formatScale(count: number, forms: string[]): string {
  if (count === 0) return '';
  if (count === 1) return forms[1];
  if (count === 2) return forms[2];
  if (count >= 3 && count <= 10) return `${convertGroup(count)} ${forms[3]}`;
  return `${convertGroup(count)} ${forms[4]}`;
}

export interface TafqeetOptions {
  currency?: string;
  fractionName?: string;
  prefix?: string;
  suffix?: string;
}

export function tafqeetNumber(
  amount: number | string,
  optionsOrCurrencyName?: string | TafqeetOptions,
  fractionNameArg = 'قرش'
): string {
  let currencyName = 'جنيه مصري';
  let fractionName = fractionNameArg;
  let prefix = 'فقط';
  let suffix = 'لا غير';

  if (typeof optionsOrCurrencyName === 'object' && optionsOrCurrencyName !== null) {
    if (optionsOrCurrencyName.currency) currencyName = optionsOrCurrencyName.currency;
    if (optionsOrCurrencyName.fractionName) fractionName = optionsOrCurrencyName.fractionName;
    if (optionsOrCurrencyName.prefix !== undefined) prefix = optionsOrCurrencyName.prefix;
    if (optionsOrCurrencyName.suffix !== undefined) suffix = optionsOrCurrencyName.suffix;
  } else if (typeof optionsOrCurrencyName === 'string') {
    currencyName = optionsOrCurrencyName;
  }

  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numericAmount) || numericAmount === 0) {
    return `${prefix ? `${prefix} ` : ''}صفر ${currencyName}${suffix ? ` ${suffix}` : ''}`.trim();
  }

  const isNegative = numericAmount < 0;
  const absAmount = Math.abs(numericAmount);

  const integerPart = Math.floor(absAmount);
  const fractionPart = Math.round((absAmount - integerPart) * 100);

  const billions = Math.floor(integerPart / 1_000_000_000);
  const millions = Math.floor((integerPart % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((integerPart % 1_000_000) / 1_000);
  const units = integerPart % 1_000;

  const resultParts: string[] = [];

  if (billions > 0) {
    resultParts.push(formatScale(billions, BILLIONS));
  }
  if (millions > 0) {
    resultParts.push(formatScale(millions, MILLIONS));
  }
  if (thousands > 0) {
    resultParts.push(formatScale(thousands, THOUSANDS));
  }
  if (units > 0) {
    resultParts.push(convertGroup(units));
  }

  let text = resultParts.filter(Boolean).join(' و');

  if (!text) {
    text = 'صفر';
  }

  let finalArabic = `${prefix ? `${prefix} ` : ''}${text} ${currencyName}`.trim();

  if (fractionPart > 0) {
    finalArabic += ` و${convertGroup(fractionPart)} ${fractionName}`;
  }

  if (suffix) {
    finalArabic += ` ${suffix}`;
  }

  if (isNegative) {
    finalArabic = `سالب ${finalArabic}`;
  }

  return finalArabic;
}

export const tafqeetArabic = tafqeetNumber;
export default tafqeetNumber;

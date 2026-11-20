import * as XLSX from 'xlsx';
import { BulkImportRow } from '../types';

export interface Sq101197RawItem {
  m: number;
  pageNumber: number;
  code: string;
  name: string;
  category: string;
  qty: number;
  unit: 'عدد' | 'متر' | 'لفة';
  unitPrice: number;
  lineGross: number;
  lineDiscount: number;
  lineNet: number;
}

export const SQ101197_METADATA = {
  docCode: 'SQ101197',
  docType: 'عرض اسعار (SQ)',
  supplierName: 'شركة الأندلس',
  clientRef: 'CST00289 سعيد محل التجمع طرف ا/عامر',
  date: '2026-11-18',
  itemCount: 154,
  expectedGrossTotal: 614916.601,
  expectedDiscountTotal: 102878.919,
  expectedNetTotal: 512037.682,
};

function round2(n: number): number {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((Number(n || 0) + Number.EPSILON) * 10000) / 10000;
}

export function isElectricalCompanyName(companyName?: string): boolean {
  const normalized = String(companyName || '')
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .toLowerCase();
  return normalized.includes('كهرب');
}

export const SQ101197_ITEMS: Sq101197RawItem[] = [
  // ===================== صفحة 1 (1 - 23) =====================
  { m: 1, pageNumber: 1, code: '01100008', name: 'خراطيم 23 مم 45 متر داخلي - م محمود', category: 'خراطيم ومواسير كهرباء', qty: 10, unit: 'عدد', unitPrice: 1320, lineGross: 13200, lineDiscount: 1320, lineNet: 11880 },
  { m: 2, pageNumber: 1, code: '01100004', name: 'خراطيم 16 مم 45 متر داخلي - م محمود', category: 'خراطيم ومواسير كهرباء', qty: 70, unit: 'عدد', unitPrice: 792, lineGross: 55440, lineDiscount: 5544, lineNet: 49896 },
  { m: 3, pageNumber: 1, code: '01100059', name: 'فليكسبل 23 مم 20 متر - م محمود', category: 'خراطيم ومواسير كهرباء', qty: 10, unit: 'عدد', unitPrice: 204, lineGross: 2040, lineDiscount: 204, lineNet: 1836 },
  { m: 4, pageNumber: 1, code: '01100057', name: 'فليكسبل 16 مم 20 متر - م محمود', category: 'خراطيم ومواسير كهرباء', qty: 70, unit: 'عدد', unitPrice: 127, lineGross: 8890, lineDiscount: 889, lineNet: 8001 },
  { m: 5, pageNumber: 1, code: '01100056', name: 'فليكسبل 13 مم 20 متر - م محمود', category: 'خراطيم ومواسير كهرباء', qty: 70, unit: 'عدد', unitPrice: 106, lineGross: 7420, lineDiscount: 742, lineNet: 6678 },
  { m: 6, pageNumber: 1, code: '01100055', name: 'فليكسبل 11 مم 20 متر - م محمود', category: 'خراطيم ومواسير كهرباء', qty: 50, unit: 'عدد', unitPrice: 82, lineGross: 4100, lineDiscount: 410, lineNet: 3690 },
  { m: 7, pageNumber: 1, code: '01100077', name: 'بواط 10 × 10 - م.محمود', category: 'بواطات وعلب', qty: 50, unit: 'عدد', unitPrice: 8.5, lineGross: 425, lineDiscount: 42.5, lineNet: 382.5 },
  { m: 8, pageNumber: 1, code: '01100078', name: 'بواط 10 × 15 - م.محمود', category: 'بواطات وعلب', qty: 50, unit: 'عدد', unitPrice: 11.75, lineGross: 587.5, lineDiscount: 58.75, lineNet: 528.75 },
  { m: 9, pageNumber: 1, code: '01100080', name: 'بواط 20 × 20 - م.محمود', category: 'بواطات وعلب', qty: 20, unit: 'عدد', unitPrice: 31.25, lineGross: 625, lineDiscount: 62.5, lineNet: 562.5 },
  { m: 10, pageNumber: 1, code: '01100120', name: 'علبة ماجيك اصفر 10×7 مصطفى محمود', category: 'بواطات وعلب', qty: 400, unit: 'عدد', unitPrice: 7.5, lineGross: 3000, lineDiscount: 300, lineNet: 2700 },
  { m: 11, pageNumber: 1, code: '01100122', name: 'علبة ماجيك مجوز افقى بكلبس م محمود', category: 'بواطات وعلب', qty: 100, unit: 'عدد', unitPrice: 13.8, lineGross: 1380, lineDiscount: 138, lineNet: 1242 },
  { m: 12, pageNumber: 1, code: '01100121', name: 'علبة ماجيك مجوز رأسى بكلبس م محمود', category: 'بواطات وعلب', qty: 100, unit: 'عدد', unitPrice: 13.8, lineGross: 1380, lineDiscount: 138, lineNet: 1242 },
  { m: 13, pageNumber: 1, code: '01280019', name: 'بواط بروف 10*10 مصرى', category: 'بواطات وعلب', qty: 20, unit: 'عدد', unitPrice: 20, lineGross: 400, lineDiscount: 0, lineNet: 400 },
  { m: 14, pageNumber: 1, code: '01280020', name: 'بواط بروف 11*15 مصرى', category: 'بواطات وعلب', qty: 10, unit: 'عدد', unitPrice: 38, lineGross: 380, lineDiscount: 0, lineNet: 380 },
  { m: 15, pageNumber: 1, code: '01280021', name: 'بواط بروف 14*19 مصرى', category: 'بواطات وعلب', qty: 10, unit: 'عدد', unitPrice: 59, lineGross: 590, lineDiscount: 0, lineNet: 590 },
  { m: 16, pageNumber: 1, code: '01280022', name: 'بواط بروف 19*24 مصرى', category: 'بواطات وعلب', qty: 10, unit: 'عدد', unitPrice: 82, lineGross: 820, lineDiscount: 0, lineNet: 820 },
  { m: 17, pageNumber: 1, code: '01280023', name: 'بواط بروف 22*30 مصرى', category: 'بواطات وعلب', qty: 8, unit: 'عدد', unitPrice: 132, lineGross: 1056, lineDiscount: 0, lineNet: 1056 },
  { m: 18, pageNumber: 1, code: '01280024', name: 'بواط بروف 30*38 مصرى', category: 'بواطات وعلب', qty: 3, unit: 'عدد', unitPrice: 230, lineGross: 690, lineDiscount: 0, lineNet: 690 },
  { m: 19, pageNumber: 1, code: '01280025', name: 'بواط بروف 38*45 مصرى', category: 'بواطات وعلب', qty: 2, unit: 'عدد', unitPrice: 390, lineGross: 780, lineDiscount: 0, lineNet: 780 },
  { m: 20, pageNumber: 1, code: '01110022', name: 'خراطيم ضد الحريق 20 مم خارجي(رمادي) - بيت الهندسة', category: 'خراطيم ومواسير كهرباء', qty: 5, unit: 'متر', unitPrice: 1524.4, lineGross: 7622, lineDiscount: 609.76, lineNet: 7012.24 },
  { m: 21, pageNumber: 1, code: '01110023', name: 'خراطيم ضد الحريق 25 مم خارجي(رمادي) - بيت الهندسة', category: 'خراطيم ومواسير كهرباء', qty: 5, unit: 'متر', unitPrice: 2225.69, lineGross: 11128.45, lineDiscount: 890.276, lineNet: 10238.174 },
  { m: 22, pageNumber: 1, code: '01110024', name: 'خراطيم ضد الحريق 32 مم خارجي(رمادي) - بيت الهندسة', category: 'خراطيم ومواسير كهرباء', qty: 2, unit: 'متر', unitPrice: 2894.79, lineGross: 5789.58, lineDiscount: 463.166, lineNet: 5326.414 },
  { m: 23, pageNumber: 1, code: '01110052', name: 'فليكسبل 16 مم 30 متر - بيت الهندسة', category: 'خراطيم ومواسير كهرباء', qty: 5, unit: 'متر', unitPrice: 801.08, lineGross: 4005.4, lineDiscount: 1121.512, lineNet: 2883.888 },

  // ===================== صفحة 2 (24 - 51) =====================
  { m: 24, pageNumber: 2, code: '01110053', name: 'فليكسبل 20 مم 30 متر - بيت الهندسة', category: 'خراطيم ومواسير كهرباء', qty: 5, unit: 'متر', unitPrice: 1027.79, lineGross: 5138.95, lineDiscount: 1438.906, lineNet: 3700.044 },
  { m: 25, pageNumber: 2, code: '01110055', name: 'فليكسبل 25 مم 30 متر - بيت الهندسة', category: 'خراطيم ومواسير كهرباء', qty: 5, unit: 'متر', unitPrice: 1197.08, lineGross: 5985.4, lineDiscount: 1675.912, lineNet: 4309.488 },
  { m: 26, pageNumber: 2, code: '01110129', name: 'مواسير 20 مم سمك متوسط - بيت الهندسة (اللفه 34 ماسوره)', category: 'خراطيم ومواسير كهرباء', qty: 68, unit: 'متر', unitPrice: 61.85, lineGross: 4205.8, lineDiscount: 1177.624, lineNet: 3028.176 },
  { m: 27, pageNumber: 2, code: '01110130', name: 'مواسير 25 مم سمك متوسط - بيت الهندسة ( 20 ماسورة )', category: 'خراطيم ومواسير كهرباء', qty: 40, unit: 'متر', unitPrice: 92.093, lineGross: 3683.72, lineDiscount: 1031.442, lineNet: 2652.278 },
  { m: 28, pageNumber: 2, code: '01110131', name: 'مواسير 32 مم سمك متوسط - بيت الهندسة (اللفه 15 ماسوره)', category: 'خراطيم ومواسير كهرباء', qty: 30, unit: 'متر', unitPrice: 126.229, lineGross: 3786.861, lineDiscount: 1060.321, lineNet: 2726.54 },
  { m: 29, pageNumber: 2, code: '01110112', name: 'جلبة ماسورة 20 مم - بيت الهندسة', category: 'إكسسوارات مواسير وتركيبات', qty: 100, unit: 'متر', unitPrice: 3.73, lineGross: 373, lineDiscount: 82.06, lineNet: 290.94 },
  { m: 30, pageNumber: 2, code: '01110113', name: 'جلبة ماسورة 25 مم - بيت الهندسة', category: 'إكسسوارات مواسير وتركيبات', qty: 100, unit: 'متر', unitPrice: 4.2, lineGross: 420, lineDiscount: 92.4, lineNet: 327.6 },
  { m: 31, pageNumber: 2, code: '01110114', name: 'جلبة ماسورة 32 مم - بيت الهندسة', category: 'إكسسوارات مواسير وتركيبات', qty: 30, unit: 'متر', unitPrice: 6.05, lineGross: 181.5, lineDiscount: 39.93, lineNet: 141.57 },
  { m: 32, pageNumber: 2, code: '01110106', name: 'كوع ماسورة 20 مم - بيت الهندسة', category: 'إكسسوارات مواسير وتركيبات', qty: 100, unit: 'متر', unitPrice: 5.88, lineGross: 588, lineDiscount: 129.36, lineNet: 458.64 },
  { m: 33, pageNumber: 2, code: '01110107', name: 'كوع ماسورة 25 مم - بيت الهندسة', category: 'إكسسوارات مواسير وتركيبات', qty: 20, unit: 'متر', unitPrice: 9.45, lineGross: 189, lineDiscount: 41.58, lineNet: 147.42 },
  { m: 34, pageNumber: 2, code: '01110108', name: 'كوع ماسورة 32 مم - بيت الهندسة', category: 'إكسسوارات مواسير وتركيبات', qty: 20, unit: 'متر', unitPrice: 18.95, lineGross: 379, lineDiscount: 83.38, lineNet: 295.62 },
  { m: 35, pageNumber: 2, code: '01110062', name: 'بواط امتداد 20 مم - بيت الهندسة', category: 'بواطات وعلب', qty: 50, unit: 'متر', unitPrice: 14.54, lineGross: 727, lineDiscount: 159.94, lineNet: 567.06 },
  { m: 36, pageNumber: 2, code: '01110063', name: 'بواط امتداد 25 مم - بيت الهندسة', category: 'بواطات وعلب', qty: 50, unit: 'متر', unitPrice: 15.74, lineGross: 787, lineDiscount: 173.14, lineNet: 613.86 },
  { m: 37, pageNumber: 2, code: '01110066', name: 'بواط ثلاثي 20 مم - بيت الهندسة', category: 'بواطات وعلب', qty: 10, unit: 'متر', unitPrice: 15.74, lineGross: 157.4, lineDiscount: 34.628, lineNet: 122.772 },
  { m: 38, pageNumber: 2, code: '01110067', name: 'بواط ثلاثي 25 مم - بيت الهندسة', category: 'بواطات وعلب', qty: 50, unit: 'متر', unitPrice: 17.44, lineGross: 872, lineDiscount: 191.84, lineNet: 680.16 },
  { m: 39, pageNumber: 2, code: '01110068', name: 'بواط رباعي 20 مم - بيت الهندسة', category: 'بواطات وعلب', qty: 50, unit: 'متر', unitPrice: 17.93, lineGross: 896.5, lineDiscount: 197.23, lineNet: 699.27 },
  { m: 40, pageNumber: 2, code: '01110069', name: 'بواط رباعي 25 مم - بيت الهندسة', category: 'بواطات وعلب', qty: 50, unit: 'متر', unitPrice: 19.14, lineGross: 957, lineDiscount: 210.54, lineNet: 746.46 },
  { m: 41, pageNumber: 2, code: '01110076', name: 'غطاء بواط دائري - بيت الهندسة', category: 'بواطات وعلب', qty: 100, unit: 'متر', unitPrice: 4, lineGross: 400, lineDiscount: 88, lineNet: 312 },
  { m: 42, pageNumber: 2, code: '01280030', name: 'دكت 1.5*1.5', category: 'دكت ومجاري كابلات', qty: 50, unit: 'عدد', unitPrice: 18, lineGross: 900, lineDiscount: 0, lineNet: 900 },
  { m: 43, pageNumber: 2, code: '01280031', name: 'دكت 2*2', category: 'دكت ومجاري كابلات', qty: 50, unit: 'عدد', unitPrice: 23, lineGross: 1150, lineDiscount: 0, lineNet: 1150 },
  { m: 44, pageNumber: 2, code: '01280032', name: 'دكت 2.5*2.5', category: 'دكت ومجاري كابلات', qty: 50, unit: 'عدد', unitPrice: 25, lineGross: 1250, lineDiscount: 0, lineNet: 1250 },
  { m: 45, pageNumber: 2, code: '01280033', name: 'دكت 2.5*4', category: 'دكت ومجاري كابلات', qty: 20, unit: 'عدد', unitPrice: 27, lineGross: 540, lineDiscount: 0, lineNet: 540 },
  { m: 46, pageNumber: 2, code: '01280034', name: 'دكت 4*4', category: 'دكت ومجاري كابلات', qty: 5, unit: 'عدد', unitPrice: 35, lineGross: 175, lineDiscount: 0, lineNet: 175 },
  { m: 47, pageNumber: 2, code: '01280035', name: 'دكت 4*6', category: 'دكت ومجاري كابلات', qty: 10, unit: 'عدد', unitPrice: 65, lineGross: 650, lineDiscount: 0, lineNet: 650 },
  { m: 48, pageNumber: 2, code: '01280036', name: 'دكت 6*6', category: 'دكت ومجاري كابلات', qty: 10, unit: 'عدد', unitPrice: 90, lineGross: 900, lineDiscount: 0, lineNet: 900 },
  { m: 49, pageNumber: 2, code: '01010002', name: 'سلك نحاس 1.5 مم مجدول - السويدي', category: 'أسلاك وكابلات', qty: 1000, unit: 'متر', unitPrice: 15.413, lineGross: 15412.8, lineDiscount: 308.256, lineNet: 15104.544 },
  { m: 50, pageNumber: 2, code: '01010003', name: 'سلك نحاس 2 مم مجدول - السويدي', category: 'أسلاك وكابلات', qty: 1000, unit: 'متر', unitPrice: 20.497, lineGross: 20497.2, lineDiscount: 409.944, lineNet: 20087.256 },
  { m: 51, pageNumber: 2, code: '01010005', name: 'سلك نحاس 3 مم مجدول - السويدي', category: 'أسلاك وكابلات', qty: 500, unit: 'متر', unitPrice: 29.857, lineGross: 14928.3, lineDiscount: 298.566, lineNet: 14629.734 },

  // ===================== صفحة 3 (52 - 79) =====================
  { m: 52, pageNumber: 3, code: '01010006', name: 'سلك نحاس 4 مم مجدول - السويدي', category: 'أسلاك وكابلات', qty: 500, unit: 'متر', unitPrice: 38.783, lineGross: 19391.4, lineDiscount: 387.828, lineNet: 19003.572 },
  { m: 53, pageNumber: 3, code: '01010007', name: 'سلك نحاس 6 مم مجدول - السويدي', category: 'أسلاك وكابلات', qty: 200, unit: 'متر', unitPrice: 58.391, lineGross: 11678.16, lineDiscount: 233.563, lineNet: 11444.597 },
  { m: 54, pageNumber: 3, code: '01010008', name: 'سلك نحاس 10 مم مجدول - السويدي', category: 'أسلاك وكابلات', qty: 100, unit: 'متر', unitPrice: 95.931, lineGross: 9593.1, lineDiscount: 191.862, lineNet: 9401.238 },
  { m: 55, pageNumber: 3, code: '01010009', name: 'سلك نحاس 16 مم مجدول - السويدي', category: 'أسلاك وكابلات', qty: 100, unit: 'متر', unitPrice: 153.547, lineGross: 15354.66, lineDiscount: 307.093, lineNet: 15047.567 },
  { m: 56, pageNumber: 3, code: '01030017', name: 'سلك نحاس 2×1 مم ترمو - النور', category: 'أسلاك وكابلات', qty: 200, unit: 'متر', unitPrice: 18.5, lineGross: 3700, lineDiscount: 0, lineNet: 3700 },
  { m: 57, pageNumber: 3, code: '01030019', name: 'سلك نحاس 2×2 مم ترمو - النور', category: 'أسلاك وكابلات', qty: 200, unit: 'متر', unitPrice: 30, lineGross: 6000, lineDiscount: 0, lineNet: 6000 },
  { m: 58, pageNumber: 3, code: '01030020', name: 'سلك نحاس 2×3 مم ترمو - النور', category: 'أسلاك وكابلات', qty: 100, unit: 'متر', unitPrice: 46, lineGross: 4600, lineDiscount: 0, lineNet: 4600 },
  { m: 59, pageNumber: 3, code: '01030021', name: 'سلك نحاس 2×4 مم ترمو - النور', category: 'أسلاك وكابلات', qty: 100, unit: 'متر', unitPrice: 58, lineGross: 5800, lineDiscount: 0, lineNet: 5800 },
  { m: 60, pageNumber: 3, code: '01030022', name: 'سلك نحاس 2×6 مم ترمو - النور', category: 'أسلاك وكابلات', qty: 100, unit: 'متر', unitPrice: 82, lineGross: 8200, lineDiscount: 0, lineNet: 8200 },
  { m: 61, pageNumber: 3, code: '01060004', name: 'لوحه 12 خط بالعمومى سيجا أم', category: 'لوحات كهرباء وقواطع', qty: 5, unit: 'عدد', unitPrice: 2499, lineGross: 12495, lineDiscount: 6247.5, lineNet: 6247.5 },
  { m: 62, pageNumber: 3, code: '01060005', name: 'لوحه 18 خط بالعمومى سيجا أم', category: 'لوحات كهرباء وقواطع', qty: 5, unit: 'عدد', unitPrice: 2520, lineGross: 12600, lineDiscount: 6300, lineNet: 6300 },
  { m: 63, pageNumber: 3, code: '01060006', name: 'لوحه 24 خط بالعمومى سيجا أم', category: 'لوحات كهرباء وقواطع', qty: 5, unit: 'عدد', unitPrice: 3052, lineGross: 15260, lineDiscount: 6867, lineNet: 8393 },
  { m: 64, pageNumber: 3, code: '01060007', name: 'لوحه 36 خط بالعمومى سيجا أم', category: 'لوحات كهرباء وقواطع', qty: 1, unit: 'عدد', unitPrice: 3589, lineGross: 3589, lineDiscount: 1794.5, lineNet: 1794.5 },
  { m: 65, pageNumber: 3, code: '01060008', name: 'لوحه عداد 2 فاز الكترونى كارت شحن سيجا أم', category: 'لوحات كهرباء وقواطع', qty: 10, unit: 'عدد', unitPrice: 1241, lineGross: 12410, lineDiscount: 6205, lineNet: 6205 },
  { m: 66, pageNumber: 3, code: '01060009', name: 'لوحه عداد 3 فاز الكترونى كارت شحن سيجا أم', category: 'لوحات كهرباء وقواطع', qty: 10, unit: 'عدد', unitPrice: 1738, lineGross: 17380, lineDiscount: 8690, lineNet: 8690 },
  { m: 67, pageNumber: 3, code: '01270003', name: 'لوحة 18 خط نور بالعمومى', category: 'لوحات كهرباء وقواطع', qty: 2, unit: 'عدد', unitPrice: 591, lineGross: 1182, lineDiscount: 177.3, lineNet: 1004.7 },
  { m: 68, pageNumber: 3, code: '01270004', name: 'لوحة 24 خط نور بالعمومى', category: 'لوحات كهرباء وقواطع', qty: 2, unit: 'عدد', unitPrice: 641, lineGross: 1282, lineDiscount: 192.3, lineNet: 1089.7 },
  { m: 69, pageNumber: 3, code: '01270005', name: 'لوحة 36 خط نور بالعمومى', category: 'لوحات كهرباء وقواطع', qty: 2, unit: 'عدد', unitPrice: 982, lineGross: 1964, lineDiscount: 294.6, lineNet: 1669.4 },
  { m: 70, pageNumber: 3, code: '01270006', name: 'لوحه عداد 3 فاز نور مكان العمومى', category: 'لوحات كهرباء وقواطع', qty: 5, unit: 'عدد', unitPrice: 506, lineGross: 2530, lineDiscount: 379.5, lineNet: 2150.5 },
  { m: 71, pageNumber: 3, code: '01270007', name: 'لوحه عداد 2 فاز نور مكان العمومى', category: 'لوحات كهرباء وقواطع', qty: 5, unit: 'عدد', unitPrice: 405, lineGross: 2025, lineDiscount: 303.75, lineNet: 1721.25 },
  { m: 72, pageNumber: 3, code: '01340008', name: 'بواط صاعد 30*30 بكالون نور', category: 'لوحات وبواطات صاج', qty: 5, unit: 'عدد', unitPrice: 346, lineGross: 1730, lineDiscount: 259.5, lineNet: 1470.5 },
  { m: 73, pageNumber: 3, code: '01340009', name: 'بواط صاعد 30*60 بكالون نور', category: 'لوحات وبواطات صاج', qty: 5, unit: 'عدد', unitPrice: 634, lineGross: 3170, lineDiscount: 15, lineNet: 3155 },
  { m: 74, pageNumber: 3, code: '01410027', name: 'بواط صاعد 30*40 بكالون نور', category: 'لوحات وبواطات صاج', qty: 5, unit: 'عدد', unitPrice: 424, lineGross: 2120, lineDiscount: 318, lineNet: 1802 },
  { m: 75, pageNumber: 3, code: '01270002', name: 'لوحة 3 فاز نور الكترونى', category: 'لوحات كهرباء وقواطع', qty: 5, unit: 'عدد', unitPrice: 457, lineGross: 2285, lineDiscount: 342.75, lineNet: 1942.25 },
  { m: 76, pageNumber: 3, code: '01270001', name: 'لوحة 2 فاز نور الكترونى', category: 'لوحات كهرباء وقواطع', qty: 5, unit: 'عدد', unitPrice: 357, lineGross: 1785, lineDiscount: 267.75, lineNet: 1517.25 },
  { m: 77, pageNumber: 3, code: '01160032', name: 'بواط صاج 20*20 بالمسمار جولد', category: 'لوحات وبواطات صاج', qty: 5, unit: 'عدد', unitPrice: 50, lineGross: 250, lineDiscount: 0, lineNet: 250 },
  { m: 78, pageNumber: 3, code: '01160031', name: 'بواط صاج 15*20 بالمسمار جولد', category: 'لوحات وبواطات صاج', qty: 5, unit: 'عدد', unitPrice: 45, lineGross: 225, lineDiscount: 0, lineNet: 225 },
  { m: 79, pageNumber: 3, code: '01160033', name: 'بواط صاج 25*25 بالمسمار جولد', category: 'لوحات وبواطات صاج', qty: 5, unit: 'عدد', unitPrice: 65, lineGross: 325, lineDiscount: 0, lineNet: 325 },

  // ===================== صفحة 4 (80 - 107) =====================
  { m: 80, pageNumber: 4, code: '01160034', name: 'بواط صاج 30*30 بالمسمار جولد', category: 'لوحات وبواطات صاج', qty: 5, unit: 'عدد', unitPrice: 80, lineGross: 400, lineDiscount: 0, lineNet: 400 },
  { m: 81, pageNumber: 4, code: '01160035', name: 'بواط صاج 30*40 بالمسمار جولد', category: 'لوحات وبواطات صاج', qty: 5, unit: 'عدد', unitPrice: 100, lineGross: 500, lineDiscount: 0, lineNet: 500 },
  { m: 82, pageNumber: 4, code: '01160002', name: 'لوحه كنترول فارغ 30*40 صاج', category: 'لوحات وبواطات صاج', qty: 2, unit: 'عدد', unitPrice: 270, lineGross: 540, lineDiscount: 0, lineNet: 540 },
  { m: 83, pageNumber: 4, code: '01160003', name: 'لوحه كنترول فارغ 30*50 صاج', category: 'لوحات وبواطات صاج', qty: 1, unit: 'عدد', unitPrice: 390, lineGross: 390, lineDiscount: 0, lineNet: 390 },
  { m: 84, pageNumber: 4, code: '01160004', name: 'لوحه كنترول فارغ 40*60 صاج', category: 'لوحات وبواطات صاج', qty: 1, unit: 'عدد', unitPrice: 600, lineGross: 600, lineDiscount: 0, lineNet: 600 },
  { m: 85, pageNumber: 4, code: '01160005', name: 'لوحه كنترول فارغ 60*80 صاج', category: 'لوحات وبواطات صاج', qty: 1, unit: 'عدد', unitPrice: 450, lineGross: 450, lineDiscount: 0, lineNet: 450 },
  { m: 86, pageNumber: 4, code: '01080168', name: 'علبة ماجك خارج ثلاثي - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 30, unit: 'عدد', unitPrice: 20, lineGross: 600, lineDiscount: 162, lineNet: 438 },
  { m: 87, pageNumber: 4, code: '01280141', name: 'علبه ماجيك خارج', category: 'بواطات وعلب', qty: 100, unit: 'عدد', unitPrice: 10, lineGross: 1000, lineDiscount: 0, lineNet: 1000 },
  { m: 88, pageNumber: 4, code: '01080173', name: 'مفتاح مفرد - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 180, unit: 'عدد', unitPrice: 23.5, lineGross: 4230, lineDiscount: 1142.1, lineNet: 3087.9 },
  { m: 89, pageNumber: 4, code: '01080019', name: 'بريزة امريكي - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 180, unit: 'عدد', unitPrice: 24.5, lineGross: 4410, lineDiscount: 1190.7, lineNet: 3219.3 },
  { m: 90, pageNumber: 4, code: '01080017', name: 'سدادة - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 300, unit: 'عدد', unitPrice: 4.5, lineGross: 1350, lineDiscount: 364.5, lineNet: 985.5 },
  { m: 91, pageNumber: 4, code: '01080045', name: 'شاسيه ثلاثية - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 300, unit: 'عدد', unitPrice: 14.5, lineGross: 4350, lineDiscount: 1174.5, lineNet: 3175.5 },
  { m: 92, pageNumber: 4, code: '01080140', name: 'وش برايت نيو 5361 ابيض - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 150, unit: 'عدد', unitPrice: 24, lineGross: 3600, lineDiscount: 972, lineNet: 2628 },
  { m: 93, pageNumber: 4, code: '01080021', name: 'بريزة شوكو - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 36, unit: 'عدد', unitPrice: 70, lineGross: 2520, lineDiscount: 680.4, lineNet: 1839.6 },
  { m: 94, pageNumber: 4, code: '01080023', name: 'بريزة MK انجليزي - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 36, unit: 'عدد', unitPrice: 70, lineGross: 2520, lineDiscount: 680.4, lineNet: 1839.6 },
  { m: 95, pageNumber: 4, code: '01080024', name: 'بريزة تليفون - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 24, unit: 'عدد', unitPrice: 50, lineGross: 1200, lineDiscount: 324, lineNet: 876 },
  { m: 96, pageNumber: 4, code: '01080027', name: 'بريزة دش - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 24, unit: 'عدد', unitPrice: 50, lineGross: 1200, lineDiscount: 324, lineNet: 876 },
  { m: 97, pageNumber: 4, code: '01080026', name: 'بريزة انترنت CAT 6 - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 24, unit: 'عدد', unitPrice: 130, lineGross: 3120, lineDiscount: 842.4, lineNet: 2277.6 },
  { m: 98, pageNumber: 4, code: '01080003', name: 'مفتاح ديفياتير - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 60, unit: 'عدد', unitPrice: 46, lineGross: 2760, lineDiscount: 745.2, lineNet: 2014.8 },
  { m: 99, pageNumber: 4, code: '01080012', name: 'زر جرس مفرد - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 30, unit: 'عدد', unitPrice: 46, lineGross: 1380, lineDiscount: 372.6, lineNet: 1007.4 },
  { m: 100, pageNumber: 4, code: '01080014', name: 'زر جرس عريض - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 15, unit: 'عدد', unitPrice: 50, lineGross: 750, lineDiscount: 202.5, lineNet: 547.5 },
  { m: 101, pageNumber: 4, code: '01080010', name: 'مفتاح تكييف مجوز - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 24, unit: 'عدد', unitPrice: 200, lineGross: 4800, lineDiscount: 1296, lineNet: 3504 },
  { m: 102, pageNumber: 4, code: '01080011', name: 'مفتاح تكييف عريض - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 10, unit: 'عدد', unitPrice: 280, lineGross: 2800, lineDiscount: 756, lineNet: 2044 },
  { m: 103, pageNumber: 4, code: '01080007', name: 'مفتاح ستارة - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 24, unit: 'عدد', unitPrice: 120, lineGross: 2880, lineDiscount: 777.6, lineNet: 2102.4 },
  { m: 104, pageNumber: 4, code: '01080033', name: 'جرس بلبل - سانشي', category: 'مفاتيح وبرايز - سانشي', qty: 10, unit: 'عدد', unitPrice: 180, lineGross: 1800, lineDiscount: 486, lineNet: 1314 },
  { m: 105, pageNumber: 4, code: '01080038', name: 'كشاف طوارئ مفرد - سانشي ( بدون ضمان )', category: 'مفاتيح وبرايز - سانشي', qty: 10, unit: 'عدد', unitPrice: 375, lineGross: 3750, lineDiscount: 1012.5, lineNet: 2737.5 },
  { m: 106, pageNumber: 4, code: '01080039', name: 'كشاف طوارئ مجوز - سانشي ( بدون ضمان )', category: 'مفاتيح وبرايز - سانشي', qty: 10, unit: 'عدد', unitPrice: 490, lineGross: 4900, lineDiscount: 1323, lineNet: 3577 },
  { m: 107, pageNumber: 4, code: '01080016', name: 'قاطع حمايه مجوز 63 امبير سانشى 3 شاشه', category: 'لوحات كهرباء وقواطع', qty: 5, unit: 'عدد', unitPrice: 900, lineGross: 4500, lineDiscount: 0, lineNet: 4500 },

  // ===================== صفحة 5 (108 - 135) =====================
  { m: 108, pageNumber: 5, code: '01281184', name: 'وش + شاسية كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 200, unit: 'عدد', unitPrice: 71.01, lineGross: 14202, lineDiscount: 2698.38, lineNet: 11503.62 },
  { m: 109, pageNumber: 5, code: '01281185', name: 'مفتاح كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 108, unit: 'عدد', unitPrice: 46.86, lineGross: 5060.88, lineDiscount: 961.567, lineNet: 4099.313 },
  { m: 110, pageNumber: 5, code: '01281186', name: 'بريزة كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 108, unit: 'عدد', unitPrice: 46.86, lineGross: 5060.88, lineDiscount: 961.567, lineNet: 4099.313 },
  { m: 111, pageNumber: 5, code: '01281192', name: 'سدادة كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 200, unit: 'عدد', unitPrice: 14.21, lineGross: 2842, lineDiscount: 539.98, lineNet: 2302.02 },
  { m: 112, pageNumber: 5, code: '01281187', name: 'بريزة مجوفه كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 20, unit: 'عدد', unitPrice: 142.02, lineGross: 2840.4, lineDiscount: 539.676, lineNet: 2300.724 },
  { m: 113, pageNumber: 5, code: '01281188', name: 'بريزة MK كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 20, unit: 'عدد', unitPrice: 142.02, lineGross: 2840.4, lineDiscount: 539.676, lineNet: 2300.724 },
  { m: 114, pageNumber: 5, code: '01281196', name: 'مفتاح ديفتير كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 36, unit: 'عدد', unitPrice: 85.21, lineGross: 3067.56, lineDiscount: 582.836, lineNet: 2484.724 },
  { m: 115, pageNumber: 5, code: '01281190', name: 'بريزة تليفون كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 15, unit: 'عدد', unitPrice: 113.61, lineGross: 1704.15, lineDiscount: 323.788, lineNet: 1380.362 },
  { m: 116, pageNumber: 5, code: '01281191', name: 'بريزة دش كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 15, unit: 'عدد', unitPrice: 63.91, lineGross: 958.65, lineDiscount: 182.144, lineNet: 776.506 },
  { m: 117, pageNumber: 5, code: '01281200', name: 'بريزه نت كيون اسود', category: 'مفاتيح وبرايز - كيون', qty: 15, unit: 'عدد', unitPrice: 184.62, lineGross: 2769.3, lineDiscount: 526.167, lineNet: 2243.133 },
  { m: 118, pageNumber: 5, code: '01281233', name: 'مفتاح ستاره كيون- اسود', category: 'مفاتيح وبرايز - كيون', qty: 5, unit: 'عدد', unitPrice: 213.02, lineGross: 1065.1, lineDiscount: 202.369, lineNet: 862.731 },
  { m: 119, pageNumber: 5, code: '01281193', name: 'مفتاح تكييف 45 امبير كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 20, unit: 'عدد', unitPrice: 319.55, lineGross: 6391, lineDiscount: 1214.29, lineNet: 5176.71 },
  { m: 120, pageNumber: 5, code: '01281195', name: 'زر جرس عريض كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 10, unit: 'عدد', unitPrice: 134.91, lineGross: 1349.1, lineDiscount: 256.329, lineNet: 1092.771 },
  { m: 121, pageNumber: 5, code: '01281194', name: 'لقمه جرس صوتي كيون - اسود', category: 'مفاتيح وبرايز - كيون', qty: 10, unit: 'عدد', unitPrice: 411.85, lineGross: 4118.5, lineDiscount: 782.515, lineNet: 3335.985 },
  { m: 122, pageNumber: 5, code: '01080100', name: 'كشاف طوارى كيون اسود', category: 'مفاتيح وبرايز - كيون', qty: 10, unit: 'عدد', unitPrice: 411.85, lineGross: 4118.5, lineDiscount: 782.515, lineNet: 3335.985 },
  { m: 123, pageNumber: 5, code: '01010134', name: 'متر سلك تليفون 1 جوز سويدى', category: 'أسلاك وكابلات', qty: 200, unit: 'متر', unitPrice: 9, lineGross: 1800, lineDiscount: 0, lineNet: 1800 },
  { m: 124, pageNumber: 5, code: '01010135', name: 'متر سلك 2 جوز سويدى', category: 'أسلاك وكابلات', qty: 100, unit: 'متر', unitPrice: 17, lineGross: 1700, lineDiscount: 0, lineNet: 1700 },
  { m: 125, pageNumber: 5, code: '01010141', name: 'متر سلك نت سويدى Cat6', category: 'أسلاك وكابلات', qty: 305, unit: 'متر', unitPrice: 33.5, lineGross: 10217.5, lineDiscount: 0, lineNet: 10217.5 },
  { m: 126, pageNumber: 5, code: '01010140', name: 'متر سلك اريال سويدى C-80', category: 'أسلاك وكابلات', qty: 200, unit: 'متر', unitPrice: 31, lineGross: 6200, lineDiscount: 0, lineNet: 6200 },
  { m: 127, pageNumber: 5, code: '01010144', name: 'متر اريال سويدى CF-160', category: 'أسلاك وكابلات', qty: 200, unit: 'لفة', unitPrice: 33, lineGross: 6600, lineDiscount: 0, lineNet: 6600 },
  { m: 128, pageNumber: 5, code: '01140001', name: 'لفة اريال فورا 100 متر', category: 'أسلاك وكابلات', qty: 2, unit: 'لفة', unitPrice: 800, lineGross: 1600, lineDiscount: 0, lineNet: 1600 },
  { m: 129, pageNumber: 5, code: '01280161', name: 'شريط لحام عريض 20 يارده اى لوك', category: 'مستلزمات وإكسسوارات كهرباء', qty: 100, unit: 'عدد', unitPrice: 20, lineGross: 2000, lineDiscount: 0, lineNet: 2000 },
  { m: 130, pageNumber: 5, code: '01070164', name: 'مفتاح تكييف ثنائي 30 امبير علبه ماجيك داخل بتشينو', category: 'مفاتيح وبرايز - بتشينو', qty: 4, unit: 'عدد', unitPrice: 215, lineGross: 860, lineDiscount: 0, lineNet: 860 },
  { m: 131, pageNumber: 5, code: '01070152', name: 'مفتاح تكييف ثنائى 30 امبير خارج بتشينو', category: 'مفاتيح وبرايز - بتشينو', qty: 4, unit: 'عدد', unitPrice: 180, lineGross: 720, lineDiscount: 0, lineNet: 720 },
  { m: 132, pageNumber: 5, code: '01070165', name: 'مفتاح تكييف ثنائي 32 امبير خارج بتشينو', category: 'مفاتيح وبرايز - بتشينو', qty: 4, unit: 'عدد', unitPrice: 200, lineGross: 800, lineDiscount: 0, lineNet: 800 },
  { m: 133, pageNumber: 5, code: '01070159', name: 'مفتاح تكييف ثنائي 32 امبير بتشينو داخل', category: 'مفاتيح وبرايز - بتشينو', qty: 4, unit: 'عدد', unitPrice: 285, lineGross: 1140, lineDiscount: 0, lineNet: 1140 },
  { m: 134, pageNumber: 5, code: '01070158', name: 'مفتاح تكييف ثنائي 26 امبير داخل بتشينو', category: 'مفاتيح وبرايز - بتشينو', qty: 4, unit: 'عدد', unitPrice: 210, lineGross: 840, lineDiscount: 0, lineNet: 840 },
  { m: 135, pageNumber: 5, code: '01050049', name: 'قاطع احادي 16 امبير 6 ك- بيتا', category: 'لوحات كهرباء وقواطع', qty: 12, unit: 'عدد', unitPrice: 158, lineGross: 1896, lineDiscount: 966.96, lineNet: 929.04 },

  // ===================== صفحة 6 (136 - 154) =====================
  { m: 136, pageNumber: 6, code: '01050050', name: 'قاطع احادي 20 امبير 6 ك- بيتا', category: 'لوحات كهرباء وقواطع', qty: 12, unit: 'عدد', unitPrice: 158, lineGross: 1896, lineDiscount: 966.96, lineNet: 929.04 },
  { m: 137, pageNumber: 6, code: '01050052', name: 'قاطع احادي 32 امبير 6 ك- بيتا', category: 'لوحات كهرباء وقواطع', qty: 12, unit: 'عدد', unitPrice: 158, lineGross: 1896, lineDiscount: 966.96, lineNet: 929.04 },
  { m: 138, pageNumber: 6, code: '01050053', name: 'قاطع احادي 40 امبير 6 ك- بيتا', category: 'لوحات كهرباء وقواطع', qty: 12, unit: 'عدد', unitPrice: 158, lineGross: 1896, lineDiscount: 966.96, lineNet: 929.04 },
  { m: 139, pageNumber: 6, code: '01050055', name: 'قاطع احادي 63 امبير 6 ك- بيتا', category: 'لوحات كهرباء وقواطع', qty: 24, unit: 'عدد', unitPrice: 187, lineGross: 4488, lineDiscount: 2288.88, lineNet: 2199.12 },
  { m: 140, pageNumber: 6, code: '01050083', name: 'قاطع ثلاثي 63 امبير 6 ك- بيتا', category: 'لوحات كهرباء وقواطع', qty: 4, unit: 'عدد', unitPrice: 666, lineGross: 2664, lineDiscount: 1358.64, lineNet: 1305.36 },
  { m: 141, pageNumber: 6, code: '01040003', name: 'قاطع احادي 16امبير 4.5ك- هاجر', category: 'لوحات كهرباء وقواطع', qty: 12, unit: 'عدد', unitPrice: 210, lineGross: 2520, lineDiscount: 428.4, lineNet: 2091.6 },
  { m: 142, pageNumber: 6, code: '01040004', name: 'قاطع احادي 20 امبير 4.5 ك- هاجر', category: 'لوحات كهرباء وقواطع', qty: 12, unit: 'عدد', unitPrice: 210, lineGross: 2520, lineDiscount: 428.4, lineNet: 2091.6 },
  { m: 143, pageNumber: 6, code: '01040005', name: 'قاطع احادي 25 امبير 4.5 ك- هاجر', category: 'لوحات كهرباء وقواطع', qty: 12, unit: 'عدد', unitPrice: 210, lineGross: 2520, lineDiscount: 428.4, lineNet: 2091.6 },
  { m: 144, pageNumber: 6, code: '01040018', name: 'قاطع احادي 32 امبير 6 ك- هاجر', category: 'لوحات كهرباء وقواطع', qty: 12, unit: 'عدد', unitPrice: 240, lineGross: 2880, lineDiscount: 489.6, lineNet: 2390.4 },
  { m: 145, pageNumber: 6, code: '01040007', name: 'قاطع احادي 40 امبير 4.5 ك- هاجر', category: 'لوحات كهرباء وقواطع', qty: 12, unit: 'عدد', unitPrice: 225, lineGross: 2700, lineDiscount: 459, lineNet: 2241 },
  { m: 146, pageNumber: 6, code: '01040021', name: 'قاطع احادي 63 امبير 6 ك- هاجر', category: 'لوحات كهرباء وقواطع', qty: 24, unit: 'عدد', unitPrice: 582.5, lineGross: 13980, lineDiscount: 2376.6, lineNet: 11603.4 },
  { m: 147, pageNumber: 6, code: '01040035', name: 'قاطع ثنائي 63 امبير 6ك- هاجر', category: 'لوحات كهرباء وقواطع', qty: 6, unit: 'عدد', unitPrice: 1355, lineGross: 8130, lineDiscount: 1382.1, lineNet: 6747.9 },
  { m: 148, pageNumber: 6, code: '01040049', name: 'قاطع ثلاثي 63 امبير 6 ك - هاجر', category: 'لوحات كهرباء وقواطع', qty: 4, unit: 'عدد', unitPrice: 2670, lineGross: 10680, lineDiscount: 1815.6, lineNet: 8864.4 },
  { m: 149, pageNumber: 6, code: '01280185', name: 'فيشة ذكر 16 امبير', category: 'مستلزمات وإكسسوارات كهرباء', qty: 15, unit: 'عدد', unitPrice: 12, lineGross: 180, lineDiscount: 0, lineNet: 180 },
  { m: 150, pageNumber: 6, code: '01280186', name: 'فيشة نتايه 16 امبير', category: 'مستلزمات وإكسسوارات كهرباء', qty: 15, unit: 'عدد', unitPrice: 14, lineGross: 210, lineDiscount: 0, lineNet: 210 },
  { m: 151, pageNumber: 6, code: '01280193', name: 'فيشه كاوتش ذكر', category: 'مستلزمات وإكسسوارات كهرباء', qty: 10, unit: 'عدد', unitPrice: 6.5, lineGross: 65, lineDiscount: 0, lineNet: 65 },
  { m: 152, pageNumber: 6, code: '01280192', name: 'فيشه كاوتش نتايه', category: 'مستلزمات وإكسسوارات كهرباء', qty: 10, unit: 'عدد', unitPrice: 7.5, lineGross: 75, lineDiscount: 0, lineNet: 75 },
  { m: 153, pageNumber: 6, code: '01140005', name: 'بريزة خارج لطش بالغطاء 16 امبير - تقسيم تركي', category: 'مستلزمات وإكسسوارات كهرباء', qty: 10, unit: 'عدد', unitPrice: 45, lineGross: 450, lineDiscount: 0, lineNet: 450 },
  { m: 154, pageNumber: 6, code: '01281111', name: 'بريزة خارج فورا لطش خزف 16 امبير', category: 'مستلزمات وإكسسوارات كهرباء', qty: 10, unit: 'عدد', unitPrice: 30, lineGross: 300, lineDiscount: 0, lineNet: 300 },
];

export function buildSq101197BulkRows(warehouseId: string): BulkImportRow[] {
  return SQ101197_ITEMS.map((item) => {
    const qty = item.qty;
    const perUnitDiscount = qty > 0 ? round4(item.lineDiscount / qty) : 0;
    const netUnitCost = qty > 0 ? round4(item.lineNet / qty) : round4(item.unitPrice);
    return {
      id: `sq101197_row_${item.m}`,
      rowNumber: item.m,
      pageNumber: item.pageNumber,
      code: item.code,
      name: item.name,
      category: item.category,
      unit: item.unit,
      openingQty: qty,
      unitCost: netUnitCost,
      priceBeforeDiscount: round4(item.unitPrice),
      discountValue: perUnitDiscount,
      totalValue: round2(item.lineNet),
      netPriceAfterDiscount: netUnitCost,
      supplierName: SQ101197_METADATA.supplierName,
      warehouseId,
      status: 'new',
      action: 'create_new',
      warnings: [],
    };
  });
}

export function getSq101197IdempotencyKey(companyId: string, warehouseId: string): string {
  return `preset_sq101197_${companyId || 'COMP-000001'}_${warehouseId || 'br-main'}`;
}

export function downloadSq101197Excel(): void {
  const headers = [
    'م',
    'كود الصنف',
    'اسم الصنف',
    'المجموعة / التصنيف',
    'وحدة القياس',
    'الكمية الافتتاحية',
    'سعر التكلفة للوحدة',
    'السعر قبل الخصم',
    'قيمة الخصم',
    'السعر الصافي بعد الخصم',
    'إجمالي قيمة الصنف',
    'اسم المورد',
  ];

  const rows = SQ101197_ITEMS.map((item) => {
    const perUnitDisc = item.qty > 0 ? round4(item.lineDiscount / item.qty) : 0;
    const netUnit = item.qty > 0 ? round4(item.lineNet / item.qty) : item.unitPrice;
    return [
      item.m,
      item.code,
      item.name,
      item.category,
      item.unit,
      item.qty,
      netUnit,
      item.unitPrice,
      perUnitDisc,
      netUnit,
      item.lineNet,
      SQ101197_METADATA.supplierName,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 44 },
    { wch: 24 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'عرض سعر SQ101197');
  XLSX.writeFile(wb, 'SQ101197_AlAndalus_154_Items.xlsx');
}

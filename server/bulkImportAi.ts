import { GoogleGenAI, Type } from '@google/genai';
import { PDFDocument } from 'pdf-lib';

export interface ExtractedPdfItem {
  pageNumber: number;
  code: string;
  name: string;
  category: string;
  unit: string;
  openingQty: number;
  unitCost: number;
  priceBeforeDiscount: number;
  discountValue: number;
  totalValue: number;
  netPriceAfterDiscount: number;
  supplierName: string;
  uncertainFields: string[];
}

export interface PdfExtractionResult {
  totalPages: number;
  startPage: number;
  endPage: number;
  items: ExtractedPdfItem[];
  warnings: string[];
}

const PDF_CHUNK_PAGES = 3;

function normalizeArabicDigits(str: string): string {
  return String(str || '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function toFiniteNumber(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'string') {
    const cleaned = normalizeArabicDigits(val).replace(/,/g, '').replace(/[^\d.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function stripBase64Prefix(input: string): string {
  const trimmed = (input || '').trim();
  const idx = trimmed.indexOf('base64,');
  return idx !== -1 ? trimmed.substring(idx + 7) : trimmed;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح Gemini API غير مهيأ على الخادم (GEMINI_API_KEY).');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

export async function getPdfMetadata(pdfBase64: string): Promise<{ totalPages: number }> {
  const cleanB64 = stripBase64Prefix(pdfBase64);
  if (!cleanB64) {
    throw new Error('ملف PDF فارغ أو غير صالح.');
  }
  const bytes = Buffer.from(cleanB64, 'base64');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return { totalPages: doc.getPageCount() };
}

async function runGeminiOnPdfChunk(
  ai: GoogleGenAI,
  chunkBase64: string,
  startPage: number,
  endPage: number,
  totalPages: number,
  supplierHint?: string
): Promise<{ items: ExtractedPdfItem[]; warnings: string[] }> {
  const pageListText =
    startPage === endPage
      ? `صفحة ${startPage} من أصل ${totalPages}`
      : `الصفحات من ${startPage} إلى ${endPage} من أصل ${totalPages}`;

  const prompt = [
    `أنت خبير محاسبة واستخراج بيانات جداول وأصناف (OCR & Structured Extraction) لنظام محاسبي احترافي.`,
    `المطلوب: استخراج **جميع** الأصناف والبنود الواردة في ملف الـ PDF المرفق (${pageListText}) بدقة كاملة بدون اختصار أو حذف أي سطر أو صنف.`,
    supplierHint ? `اسم المورد المرجعي (إن لم يذكر بوضوح في الصفحة): ${supplierHint}` : '',
    `تعليمات إلزامية:`,
    `1. اقرأ كل صفحة في هذا الجزء قراءة بصرية ونصية كاملة (بما في ذلك الملفات المصورة/الممسوحة ضوئياً Scan).`,
    `2. حافظ على اسم الصنف الأصلي (name) بالضبط كما هو مكتوب بالعربية أو الإنجليزية دون تحريف.`,
    `3. استخرج كود الصنف (code)، التصنيف/المجموعة (category)، ووحدة القياس (unit مثل: قطعة، متر، لفة، كرتونة، كيلو، لتر، علبة، طن...). إن لم توجد وحدة صريحة اكتب "قطعة".`,
    `4. استخرج الكمية الافتتاحية (openingQty)، سعر التكلفة للوحدة (unitCost)، السعر قبل الخصم (priceBeforeDiscount)، قيمة الخصم (discountValue)، السعر الصافي بعد الخصم للوحدة (netPriceAfterDiscount)، وإجمالي قيمة الصنف (totalValue).`,
    `5. حوّل الأرقام العربية (٠١٢٣...) إلى أرقام إنجليزية قياسية، وتجنب ضم صفوف الإجماليات النهائية أو الضرائب أو التذييلات البنكية ضمن قائمة الأصناف.`,
    `6. سجّل رقم الصفحة (pageNumber بين ${startPage} و ${endPage}) واسم المورد (supplierName) إن ظهر بالصفحة أو الترويسة.`,
    `7. إذا كان هناك رقم أو نص غير واضح بالصورة ضع اسم الحقل في uncertainFields (مثل ["openingQty"] أو ["name"]).`,
  ]
    .filter(Boolean)
    .join('\n');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      items: {
        type: Type.ARRAY,
        description: 'All extracted product/item rows from the provided PDF pages',
        items: {
          type: Type.OBJECT,
          properties: {
            pageNumber: { type: Type.INTEGER },
            code: { type: Type.STRING },
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            unit: { type: Type.STRING },
            openingQty: { type: Type.NUMBER },
            unitCost: { type: Type.NUMBER },
            priceBeforeDiscount: { type: Type.NUMBER },
            discountValue: { type: Type.NUMBER },
            netPriceAfterDiscount: { type: Type.NUMBER },
            totalValue: { type: Type.NUMBER },
            supplierName: { type: Type.STRING },
            uncertainFields: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['name'],
        },
      },
      warnings: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
    required: ['items'],
  };

  let lastError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: chunkBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });

      const rawText = (response.text || '').trim();
      const parsed = rawText ? JSON.parse(rawText) : { items: [], warnings: [] };
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      const warnings: string[] = Array.isArray(parsed.warnings)
        ? parsed.warnings.map((w: any) => String(w || '').trim()).filter(Boolean)
        : [];

      const normalizedItems: ExtractedPdfItem[] = rawItems
        .map((it: any) => {
          const name = String(it?.name || '').trim();
          if (!name) return null;

          const openingQty = Math.max(0, toFiniteNumber(it?.openingQty));
          let priceBeforeDiscount = Math.max(0, toFiniteNumber(it?.priceBeforeDiscount));
          let discountValue = Math.max(0, toFiniteNumber(it?.discountValue));
          let netPriceAfterDiscount = Math.max(0, toFiniteNumber(it?.netPriceAfterDiscount));
          let unitCost = Math.max(0, toFiniteNumber(it?.unitCost));
          let totalValue = Math.max(0, toFiniteNumber(it?.totalValue));

          if (netPriceAfterDiscount === 0 && priceBeforeDiscount > 0) {
            netPriceAfterDiscount = Math.max(0, round2(priceBeforeDiscount - discountValue));
          }
          if (unitCost === 0 && netPriceAfterDiscount > 0) {
            unitCost = netPriceAfterDiscount;
          }
          if (unitCost === 0 && totalValue > 0 && openingQty > 0) {
            unitCost = round2(totalValue / openingQty);
          }
          if (priceBeforeDiscount === 0 && unitCost > 0) {
            priceBeforeDiscount = round2(unitCost + discountValue);
          }
          if (netPriceAfterDiscount === 0 && unitCost > 0) {
            netPriceAfterDiscount = unitCost;
          }
          if (totalValue === 0 && openingQty > 0) {
            totalValue = round2(openingQty * (netPriceAfterDiscount || unitCost));
          }

          const rawPage = toFiniteNumber(it?.pageNumber);
          const pageNumber =
            rawPage >= 1 && rawPage <= endPage - startPage + 1
              ? startPage + rawPage - 1
              : rawPage >= startPage && rawPage <= endPage
              ? rawPage
              : startPage;

          return {
            pageNumber,
            code: normalizeArabicDigits(String(it?.code || '')).trim(),
            name,
            category: String(it?.category || 'عام').trim() || 'عام',
            unit: String(it?.unit || 'قطعة').trim() || 'قطعة',
            openingQty,
            unitCost: round2(unitCost),
            priceBeforeDiscount: round2(priceBeforeDiscount),
            discountValue: round2(discountValue),
            totalValue: round2(totalValue),
            netPriceAfterDiscount: round2(netPriceAfterDiscount),
            supplierName: String(it?.supplierName || supplierHint || '').trim(),
            uncertainFields: Array.isArray(it?.uncertainFields)
              ? it.uncertainFields.map((f: any) => String(f || '').trim()).filter(Boolean)
              : [],
          };
        })
        .filter((x: ExtractedPdfItem | null): x is ExtractedPdfItem => Boolean(x));

      return { items: normalizedItems, warnings };
    } catch (err: any) {
      lastError = err;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 800));
      }
    }
  }

  throw lastError || new Error('فشل استخراج البيانات من جزء ملف PDF.');
}

export async function extractPdfPagesWithGemini(params: {
  pdfBase64: string;
  startPage?: number;
  endPage?: number;
  supplierHint?: string;
}): Promise<PdfExtractionResult> {
  const cleanB64 = stripBase64Prefix(params.pdfBase64);
  if (!cleanB64) {
    throw new Error('ملف PDF فارغ أو غير صالح.');
  }

  const ai = getGeminiClient();
  const srcBytes = Buffer.from(cleanB64, 'base64');
  const srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();
  if (totalPages === 0) {
    return { totalPages: 0, startPage: 0, endPage: 0, items: [], warnings: ['الملف لا يحتوي على أي صفحات.'] };
  }

  const reqStart = Math.max(1, Math.min(totalPages, params.startPage || 1));
  const reqEnd = Math.max(reqStart, Math.min(totalPages, params.endPage || totalPages));

  const allItems: ExtractedPdfItem[] = [];
  const allWarnings: string[] = [];

  for (let p = reqStart; p <= reqEnd; p += PDF_CHUNK_PAGES) {
    const chunkEnd = Math.min(reqEnd, p + PDF_CHUNK_PAGES - 1);
    let chunkBase64 = cleanB64;

    if (p > 1 || chunkEnd < totalPages) {
      const subDoc = await PDFDocument.create();
      const pageIndices: number[] = [];
      for (let i = p - 1; i <= chunkEnd - 1; i++) {
        pageIndices.push(i);
      }
      const copied = await subDoc.copyPages(srcDoc, pageIndices);
      copied.forEach((pg) => subDoc.addPage(pg));
      const subBytes = await subDoc.save();
      chunkBase64 = Buffer.from(subBytes).toString('base64');
    }

    const chunkRes = await runGeminiOnPdfChunk(
      ai,
      chunkBase64,
      p,
      chunkEnd,
      totalPages,
      params.supplierHint
    );
    allItems.push(...chunkRes.items);
    if (chunkRes.warnings.length > 0) {
      allWarnings.push(...chunkRes.warnings);
    }
  }

  return {
    totalPages,
    startPage: reqStart,
    endPage: reqEnd,
    items: allItems,
    warnings: Array.from(new Set(allWarnings)),
  };
}

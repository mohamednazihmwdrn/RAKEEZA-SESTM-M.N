import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PdfExportOptions {
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'a5' | 'letter' | 'thermal' | '58mm' | string | number[];
  margin?: number; // in mm
  scale?: number;
}

async function appendCanvasToPdf(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  margin: number,
  isFirstPageInPdf: boolean
): Promise<boolean> {
  const imgData = canvas.toDataURL('image/png');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  const imgWidth = usableWidth;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;

  if (!isFirstPageInPdf) {
    pdf.addPage();
  }

  // Zero-cut tolerance: fit single document onto 1 PDF page when within +6mm tolerance
  if (imgHeight <= usableHeight + 6) {
    const finalRenderHeight = Math.min(imgHeight, usableHeight);
    pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, finalRenderHeight, undefined, 'FAST');
  } else {
    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= usableHeight;

    while (heightLeft > 5) {
      position = heightLeft - imgHeight + margin;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= usableHeight;
    }
  }
  return false;
}

/**
 * High-definition PDF exporter using html2canvas & jsPDF.
 * Supports single documents AND Mode B multi-invoice batches (.rakeeza-print-doc-page children),
 * ensuring each invoice starts on a fresh PDF page with crisp margins and zero mid-document cuts.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  filename: string = 'document.pdf',
  options: PdfExportOptions = {}
): Promise<void> {
  const {
    orientation = 'portrait',
    format = 'a5',
    margin = 4,
    scale = 2,
  } = options;

  const originalTransform = element.style.transform;
  const originalTransition = element.style.transition;
  element.style.transform = 'none';
  element.style.transition = 'none';

  try {
    const docPages = Array.from(element.querySelectorAll<HTMLElement>('.rakeeza-print-doc-page'));
    const isThermalRoll =
      format === 'thermal' || format === '58mm' || (Array.isArray(format) && format[0] <= 80);

    let pdf: jsPDF;

    if (docPages.length > 0 && !isThermalRoll) {
      // Multi-document batch mode (Mode B): capture each .rakeeza-print-doc-page separately onto crisp PDF pages
      const pdfFormat = format === 'a5' ? 'a5' : format === 'a4' ? 'a4' : (format as any);
      pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: pdfFormat,
        compress: true,
      });

      let isFirst = true;
      for (const pageEl of docPages) {
        const canvas = await html2canvas(pageEl, {
          scale,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
        });
        isFirst = await appendCanvasToPdf(pdf, canvas, margin, isFirst);
      }
    } else {
      const canvas = await html2canvas(element, {
        scale,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      if (isThermalRoll) {
        const rollWidthMm = typeof format === 'string' ? (format === '58mm' ? 58 : 80) : format[0];
        const usableWidthMm = rollWidthMm - margin * 2;
        const contentHeightMm = (canvas.height * usableWidthMm) / canvas.width;
        const totalPageHeightMm = Math.max(40, contentHeightMm + margin * 2);

        pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [rollWidthMm, totalPageHeightMm],
          compress: true,
        });

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', margin, margin, usableWidthMm, contentHeightMm, undefined, 'FAST');
      } else {
        const pdfFormat = format === 'a5' ? 'a5' : format === 'a4' ? 'a4' : (format as any);
        pdf = new jsPDF({
          orientation,
          unit: 'mm',
          format: pdfFormat,
          compress: true,
        });
        await appendCanvasToPdf(pdf, canvas, margin, true);
      }
    }

    const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(safeFilename);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    throw error;
  } finally {
    element.style.transform = originalTransform;
    element.style.transition = originalTransition;
  }
}

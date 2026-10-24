import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PdfExportOptions {
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'a5' | 'letter' | 'thermal' | '58mm' | string | number[];
  margin?: number; // in mm
  scale?: number;
}

/**
 * High-definition PDF exporter using html2canvas & jsPDF
 * Precision rendering for A5, A4, and continuous thermal receipt rolls without cuts or blank 2nd pages.
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

  // Temporarily reset CSS transform and transition during screenshot capture
  const originalTransform = element.style.transform;
  const originalTransition = element.style.transition;
  element.style.transform = 'none';
  element.style.transition = 'none';

  try {
    const canvas = await html2canvas(element, {
      scale: scale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');

    let pdf: jsPDF;

    // 🧾 1. Continuous thermal roll (80mm / 58mm)
    if (format === 'thermal' || format === '58mm' || (Array.isArray(format) && format[0] <= 80)) {
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

      pdf.addImage(imgData, 'PNG', margin, margin, usableWidthMm, contentHeightMm, undefined, 'FAST');
    } else {
      // 📄 2. Standard paper (A5 / A4 / Letter)
      const pdfFormat = format === 'a5' ? 'a5' : format === 'a4' ? 'a4' : (format as any);
      pdf = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: pdfFormat,
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const imgWidth = usableWidth;
      const imgHeight = (canvas.height * usableWidth) / canvas.width;

      // 🛡️ Zero-cut tolerance: If invoice fits within page height + 6mm margin tolerance,
      // fit neatly on a single page instead of spilling onto an unwanted blank 2nd page!
      if (imgHeight <= usableHeight + 6) {
        const finalRenderHeight = Math.min(imgHeight, usableHeight);
        pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, finalRenderHeight, undefined, 'FAST');
      } else {
        // Multi-page document
        let heightLeft = imgHeight;
        let position = margin;

        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= usableHeight;

        while (heightLeft > 5) { // 5mm threshold prevents accidental blank trailing page
          position = heightLeft - imgHeight + margin;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
          heightLeft -= usableHeight;
        }
      }
    }

    const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(safeFilename);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    throw error;
  } finally {
    // Restore original transform and transition
    element.style.transform = originalTransform;
    element.style.transition = originalTransition;
  }
}

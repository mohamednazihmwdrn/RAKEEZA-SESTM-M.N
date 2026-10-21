/**
 * Universal Print Toolbar & Customization Helper
 * Provides a standardized top toolbar for all printable vouchers, invoices, movements, and reports:
 * - حجم الورق (Paper Size): A4 (قياسي), A5 (مدمج), 80mm حراري, 58mm حراري, Letter
 * - الاتجاه (Orientation): 📄 رأسي / عمودي (Portrait), 📑 أفقي (Landscape)
 * - الهوامش (Margins): مضغوطة (3mm), قياسية (5mm), عريضة (8mm)
 * - Buttons: 🖨️ طباعة الآن (Print), ✕ إغلاق (Close)
 */

export function getPrintToolbarStyles(): string {
  return `
  .no-print-toolbar, .no-print-bar {
    background: #0f172a;
    color: #fff;
    padding: 10px 16px;
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    position: sticky;
    top: 0;
    z-index: 99999;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    direction: rtl;
    border-bottom: 2px solid #1e293b;
  }

  .toolbar-title-box {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toolbar-title-box .title-text {
    font-weight: 800;
    font-size: 14px;
    color: #f8fafc;
    letter-spacing: -0.2px;
  }

  .toolbar-title-box .doc-badge {
    background: #1e293b;
    color: #93c5fd;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    border: 1px solid #334155;
  }

  .toolbar-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .toolbar-field {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
  }

  .toolbar-field label {
    color: #cbd5e1;
    font-weight: 700;
    white-space: nowrap;
  }

  .toolbar-select {
    background: #1e293b;
    color: #f8fafc;
    border: 1.5px solid #475569;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    outline: none;
    transition: all 0.2s ease;
  }

  .toolbar-select:hover {
    border-color: #60a5fa;
    background: #243248;
  }

  .toolbar-select:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59,130,246,0.25);
  }

  .btn-print {
    background: linear-gradient(135deg, #16a34a, #15803d);
    color: white;
    border: 1px solid #22c55e;
    padding: 6px 18px;
    font-size: 13px;
    font-weight: 800;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 6px rgba(22, 163, 74, 0.35);
    transition: all 0.15s ease;
  }

  .btn-print:hover {
    background: linear-gradient(135deg, #15803d, #166534);
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(22, 163, 74, 0.45);
  }

  .btn-print:active {
    transform: translateY(0);
  }

  .btn-close {
    background: #334155;
    color: #e2e8f0;
    border: 1px solid #475569;
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 700;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-close:hover {
    background: #475569;
    color: white;
  }

  /* Responsive layout modes for A4, A5, Thermal 80mm & 58mm */
  body.size-a4 .report-container,
  body.size-a4 .invoice-container,
  body.size-a4 .voucher-container {
    width: 200mm !important;
    max-width: calc(100vw - 24px) !important;
    min-height: 280mm !important;
    padding: 6mm 8mm !important;
    margin: 10px auto !important;
    box-sizing: border-box !important;
    transform-origin: top center;
  }

  body.size-a5 {
    font-size: 0.76rem;
  }
  body.size-a5 .report-container,
  body.size-a5 .invoice-container,
  body.size-a5 .voucher-container {
    width: 140mm !important;
    max-width: calc(100vw - 20px) !important;
    min-height: 196mm !important;
    padding: 4mm 5mm !important;
    margin: 10px auto !important;
    box-sizing: border-box !important;
    transform-origin: top center;
  }

  body.size-80mm {
    font-size: 0.72rem;
    background: #fff;
    padding: 0;
  }
  body.size-80mm .report-container,
  body.size-80mm .invoice-container,
  body.size-80mm .voucher-container {
    width: 72mm !important;
    max-width: calc(100vw - 16px) !important;
    min-height: auto !important;
    height: auto !important;
    border: 1px dashed #000 !important;
    padding: 2.5mm 2mm !important;
    margin: 8px auto !important;
    box-sizing: border-box !important;
    transform-origin: top center;
    box-shadow: none !important;
  }

  body.size-58mm {
    font-size: 0.65rem;
    background: #fff;
    padding: 0;
  }
  body.size-58mm .report-container,
  body.size-58mm .invoice-container,
  body.size-58mm .voucher-container {
    width: 48mm !important;
    max-width: calc(100vw - 12px) !important;
    min-height: auto !important;
    height: auto !important;
    border: 1px dashed #000 !important;
    padding: 1.5mm 1mm !important;
    margin: 6px auto !important;
    box-sizing: border-box !important;
    transform-origin: top center;
    box-shadow: none !important;
  }

  body.orient-landscape .report-container,
  body.orient-landscape .invoice-container,
  body.orient-landscape .voucher-container {
    width: 100vw !important;
    height: auto !important;
    min-height: calc(100vh - 20px) !important;
  }

  body.margin-compact .report-container,
  body.margin-compact .invoice-container,
  body.margin-compact .voucher-container {
    padding: 3mm !important;
  }
  body.margin-normal .report-container,
  body.margin-normal .invoice-container,
  body.margin-normal .voucher-container {
    padding: 5mm !important;
  }
  body.margin-wide .report-container,
  body.margin-wide .invoice-container,
  body.margin-wide .voucher-container {
    padding: 8mm !important;
  }

  @media print {
    .no-print-toolbar, .no-print-bar, .no-print {
      display: none !important;
    }
    body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
    .report-container, .invoice-container, .voucher-container {
      box-shadow: none !important;
      transform: none !important;
      page-break-after: avoid !important;
      page-break-inside: avoid !important;
      box-sizing: border-box !important;
    }
    body.size-a4 .report-container,
    body.size-a4 .invoice-container,
    body.size-a4 .voucher-container {
      width: 100% !important;
      max-width: 200mm !important;
      min-height: 280mm !important;
      margin: 0 auto !important;
      padding: 6mm 8mm !important;
      border: 2px solid #000 !important;
    }
    body.size-a5 .report-container,
    body.size-a5 .invoice-container,
    body.size-a5 .voucher-container {
      width: 100% !important;
      max-width: 140mm !important;
      min-height: 196mm !important;
      margin: 0 auto !important;
      padding: 4mm 5mm !important;
      border: 1.5px solid #000 !important;
      font-size: 0.76rem !important;
    }
    body.size-80mm .report-container,
    body.size-80mm .invoice-container,
    body.size-80mm .voucher-container {
      width: 72mm !important;
      max-width: 72mm !important;
      min-height: auto !important;
      height: auto !important;
      margin: 0 auto !important;
      padding: 2mm !important;
      border: 1px dashed #000 !important;
      font-size: 0.72rem !important;
    }
    body.size-58mm .report-container,
    body.size-58mm .invoice-container,
    body.size-58mm .voucher-container {
      width: 48mm !important;
      max-width: 48mm !important;
      min-height: auto !important;
      height: auto !important;
      margin: 0 auto !important;
      padding: 1.5mm !important;
      border: 1px dashed #000 !important;
      font-size: 0.65rem !important;
    }
  }
  `;
}

export function getPrintToolbarHtml(docBadgeTitle: string, initialPaperSize = 'A4'): string {
  return `
<div class="no-print-toolbar no-print-bar no-print">
  <div class="toolbar-title-box">
    <span class="title-text">🖨️ معاينة وتخصيص الطباعة</span>
    ${docBadgeTitle ? `<span class="doc-badge">${docBadgeTitle}</span>` : ''}
  </div>
  <div class="toolbar-controls">
    <div class="toolbar-field">
      <label for="selPaperSize">حجم الورق:</label>
      <select id="selPaperSize" class="toolbar-select" onchange="updatePrintLayout()">
        <option value="A4" ${initialPaperSize === 'A4' ? 'selected' : ''}>A4 (قياسي)</option>
        <option value="A5" ${initialPaperSize === 'A5' ? 'selected' : ''}>A5 (مدمج)</option>
        <option value="80mm" ${initialPaperSize === '80mm' ? 'selected' : ''}>حراري (80mm / Receipt)</option>
        <option value="58mm" ${initialPaperSize === '58mm' ? 'selected' : ''}>حراري (58mm / Mini)</option>
        <option value="Letter" ${initialPaperSize === 'Letter' ? 'selected' : ''}>Letter</option>
      </select>
    </div>
    <div class="toolbar-field">
      <label for="selZoomScale">مقياس العرض:</label>
      <select id="selZoomScale" class="toolbar-select" onchange="applyZoomScale(this.value)">
        <option value="auto">ملاءمة العرض (Fit)</option>
        <option value="1" selected>100% (أصلي)</option>
        <option value="0.9">90%</option>
        <option value="0.8">80%</option>
        <option value="0.7">70%</option>
        <option value="0.6">60%</option>
        <option value="0.5">50%</option>
      </select>
    </div>
    <div class="toolbar-field">
      <label for="selOrientation">الاتجاه:</label>
      <select id="selOrientation" class="toolbar-select" onchange="updatePrintLayout()">
        <option value="portrait" selected>📄 رأسي / عمودي (Portrait)</option>
        <option value="landscape">📑 أفقي (Landscape)</option>
      </select>
    </div>
    <div class="toolbar-field">
      <label for="selMargins">الهوامش:</label>
      <select id="selMargins" class="toolbar-select" onchange="updatePrintLayout()">
        <option value="compact">مضغوطة (3mm)</option>
        <option value="normal" selected>قياسية (5mm)</option>
        <option value="wide">عريضة (8mm)</option>
      </select>
    </div>
    <button class="btn-print" onclick="triggerPrint()">
      <span>🖨️</span>
      <span>طباعة الآن (Print)</span>
    </button>
    <button class="btn-close" onclick="window.close()">✕ إغلاق</button>
  </div>
</div>
`;
}

export function getPrintToolbarScript(): string {
  return `
<script>
  let currentZoomMode = 'auto';

  function applyZoomScale(mode) {
    currentZoomMode = mode;
    const containers = document.querySelectorAll('.report-container, .invoice-container, .voucher-container');
    if (!containers || containers.length === 0) return;
    const sizeEl = document.getElementById('selPaperSize');
    const size = sizeEl ? sizeEl.value : 'A4';
    const targetMm = size === 'A5' ? 140 : size === '58mm' ? 48 : size === '80mm' ? 72 : 200;
    const targetPx = targetMm * 3.78;
    const screenW = window.innerWidth - 30;

    let factor = 1;
    if (mode === 'auto') {
      if (screenW < targetPx) {
        factor = Math.max(0.42, Math.min(1, Math.round((screenW / targetPx) * 100) / 100));
      } else {
        factor = 1;
      }
    } else {
      factor = parseFloat(mode) || 1;
    }

    containers.forEach(function(c) {
      c.style.transform = 'scale(' + factor + ')';
    });
    const sel = document.getElementById('selZoomScale');
    if (sel && mode !== 'auto') sel.value = factor.toString();
    else if (sel && mode === 'auto') sel.value = 'auto';
  }

  window.addEventListener('resize', function() {
    if (currentZoomMode === 'auto') applyZoomScale('auto');
  });

  function updatePrintLayout() {
    const sizeEl = document.getElementById('selPaperSize');
    const orientEl = document.getElementById('selOrientation');
    const marginEl = document.getElementById('selMargins');

    const size = sizeEl ? sizeEl.value : 'A4';
    const orient = orientEl ? orientEl.value : 'portrait';
    const margin = marginEl ? marginEl.value : 'normal';

    // Update body classes
    document.body.classList.remove('size-a4', 'size-a5', 'size-80mm', 'size-58mm', 'size-letter');
    document.body.classList.add('size-' + size.toLowerCase());

    document.body.classList.remove('orient-portrait', 'orient-landscape');
    document.body.classList.add('orient-' + orient.toLowerCase());

    document.body.classList.remove('margin-compact', 'margin-normal', 'margin-wide');
    document.body.classList.add('margin-' + margin.toLowerCase());

    // Update dynamic @page CSS rule
    let dynamicPageStyle = document.getElementById('dynamicPageRule');
    if (!dynamicPageStyle) {
      dynamicPageStyle = document.createElement('style');
      dynamicPageStyle.id = 'dynamicPageRule';
      document.head.appendChild(dynamicPageStyle);
    }

    let pageSizeCSS = 'A4 portrait';
    let marginCSS = '5mm';

    if (size === 'A5') pageSizeCSS = 'A5 ' + orient;
    else if (size === '80mm') pageSizeCSS = '80mm auto';
    else if (size === '58mm') pageSizeCSS = '58mm auto';
    else if (size === 'Letter') pageSizeCSS = 'letter ' + orient;
    else pageSizeCSS = 'A4 ' + orient;

    if (margin === 'compact') marginCSS = size.includes('mm') ? '1mm' : '3mm';
    else if (margin === 'wide') marginCSS = size.includes('mm') ? '4mm' : '8mm';
    else marginCSS = size.includes('mm') ? '2mm' : '5mm';

    dynamicPageStyle.innerHTML = '@page { size: ' + pageSizeCSS + '; margin: ' + marginCSS + '; }';

    applyZoomScale(currentZoomMode);
  }

  function triggerPrint() {
    window.print();
  }

  // Keyboard navigation: Ctrl+P prints, Esc closes
  window.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      triggerPrint();
    } else if (e.key === 'Escape') {
      window.close();
    }
  });

  // Initial layout application
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updatePrintLayout);
  } else {
    updatePrintLayout();
  }
</script>
`;
}

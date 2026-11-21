import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from '../types';
import {
  UniversalPrintPayload,
  UniversalPaperSize,
  UniversalPrintItem,
  UniversalPrintSummaryItem,
  UniversalBatchSummary,
} from '../types/universalPrint';
import {
  subscribeToUniversalPrint,
  subscribeToInvoicePrint,
  resolveInvoiceFinancials,
} from '../services/centralizedPrintService';
import { exportElementToPdf } from '../utils/pdfExport';
import { tafqeetNumber } from '../utils/tafqeet';
import { Printer, Download, X, Check, Eye, ShieldCheck, FileCheck, MessageCircle } from 'lucide-react';
import {
  cleanPhoneNumber,
  generateUniversalDocumentWhatsAppMessage,
  openWhatsAppChat,
} from '../services/whatsappService';

interface CentralizedInvoicePrintModalProps {
  defaultSettings?: Settings;
}

const PAPER_SIZE_OPTIONS: Array<{
  id: UniversalPaperSize;
  label: string;
  shortLabel: string;
}> = [
  { id: 'a5-portrait', label: 'مقاس A5 (نصف ورقة - افتراضي)', shortLabel: 'مقاس A5' },
  { id: 'a4-portrait', label: 'مقاس A4 (ورقة كاملة)', shortLabel: 'مقاس A4' },
  { id: 'thermal-80', label: 'حراري (80mm)', shortLabel: 'حراري 80mm' },
];

function normalizePaperSizeOption(pref?: string): UniversalPaperSize {
  const p = (pref || '').toLowerCase();
  if (p.includes('a4')) return 'a4-portrait';
  if (p.includes('thermal') || p.includes('80') || p.includes('58')) return 'thermal-80';
  return 'a5-portrait';
}

function fmtMoney(n: number | string | undefined | null, curSymbol = 'ج.م'): string {
  const val = Number(n || 0);
  if (!Number.isFinite(val)) return `0.00 ${curSymbol}`;
  return `${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curSymbol}`;
}

function fmtSmart(n: number | string | undefined | null): string {
  const val = Number(n || 0);
  if (!Number.isFinite(val)) return '0';
  if (Math.abs(val - Math.round(val)) < 0.005) {
    return Math.round(val).toLocaleString('en-US');
  }
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseNumericValue(val: string | number | undefined): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function isRawInternalId(val: string | number | undefined | null): boolean {
  if (val === undefined || val === null) return false;
  const s = String(val).trim();
  return /^[cs]\d{10,}_[a-z0-9]+$/i.test(s);
}

function sanitizeDisplaySerial(val: string | number | undefined | null, fallback = ''): string {
  if (val === undefined || val === null) return fallback;
  const s = String(val).trim();
  if (!s || isRawInternalId(s)) return fallback;
  return s;
}

function chunkRows<T>(items: T[], perPage: number): T[][] {
  if (!items || items.length === 0) return [[]];
  if (perPage <= 0 || items.length <= perPage) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) {
    chunks.push(items.slice(i, i + perPage));
  }
  return chunks;
}

function getTableWidthClass(colCount: number): string {
  if (colCount >= 8) return 'rp-table rp-ultra-wide';
  if (colCount >= 6) return 'rp-table rp-wide-table';
  return 'rp-table';
}

function getReportCellMeta(
  colHeader: string,
  cellValue: unknown,
  colIndex: number,
  totalCols: number
): { className: string; dir?: 'ltr' | 'rtl' } {
  const h = (colHeader || '').trim().toLowerCase();
  const str = cellValue !== null && cellValue !== undefined ? String(cellValue).trim() : '';

  if (h === '#' || h === 'م' || h === 'الرقم' || h === 'مسلسل') {
    return { className: 'rp-idx-cell', dir: 'ltr' };
  }

  const isTextColumn =
    h.includes('اسم') ||
    h.includes('بيان') ||
    h.includes('تفاصيل') ||
    h.includes('ملاحظ') ||
    h.includes('قسم') ||
    h.includes('وحدة') ||
    h.includes('بند') ||
    h.includes('عميل') ||
    h.includes('مورد') ||
    h.includes('موظف') ||
    h.includes('مسؤول') ||
    h.includes('غرض') ||
    h.includes('حساب') ||
    h.includes('موقع') ||
    h.includes('مستخدم') ||
    h.includes('جهة') ||
    h.includes('بنك') ||
    h.includes('طرف');

  const isNumericHeader =
    h.includes('مدين') ||
    h.includes('دائن') ||
    h.includes('رصيد') ||
    h.includes('مبلغ') ||
    h.includes('قيمة') ||
    h.includes('سعر') ||
    h.includes('إجمالي') ||
    h.includes('صافي') ||
    h.includes('مدفوع') ||
    h.includes('متبقي') ||
    h.includes('كمية') ||
    h.includes('عدد') ||
    h.includes('ضريب') ||
    h.includes('خصم') ||
    h.includes('تكلفة') ||
    h.includes('إهلاك') ||
    h.includes('أساسي') ||
    h.includes('استقطاع') ||
    h.includes('فارق') ||
    h.includes('وارد') ||
    h.includes('منصرف') ||
    h.includes('تدفق') ||
    h.includes('دفترية') ||
    h.includes('فعلي') ||
    h.includes('ربح');

  const isDateOrPhoneOrCode =
    h.includes('تاريخ') ||
    h.includes('وقت') ||
    h.includes('توقيت') ||
    h.includes('استحقاق') ||
    h.includes('هاتف') ||
    h.includes('جوال') ||
    h.includes('كود') ||
    h === 'الأب' ||
    h.includes('مرجع') ||
    h.includes('رقم ');

  if (isTextColumn && !isNumericHeader) {
    return { className: 'rp-text-cell' };
  }

  if (isNumericHeader || isDateOrPhoneOrCode) {
    const isShortAtomic = str.length <= 18 && !/\s{2,}|\|/.test(str);
    return {
      className: isShortAtomic ? 'rp-num-cell' : 'rp-badge-cell',
      dir: isShortAtomic && /^[0-9.,+\-/:%\sEGPج.مSAR$]+$/i.test(str) ? 'ltr' : undefined,
    };
  }

  if (colIndex === 0 || (totalCols >= 4 && colIndex === 1)) {
    return { className: 'rp-text-cell' };
  }

  return { className: 'rp-badge-cell' };
}

const SCOPED_PRINT_CSS = `
.rakeeza-print-modal-root .rp-scale-inner,
.rakeeza-print-modal-root .rp-root,
.rakeeza-print-modal-root .rp-page {
  max-width: none !important;
}
.rp-root {
  --rp-navy: #172536;
  --rp-gold: #c7a15a;
  --rp-line: #aeb8c2;
  --rp-muted: #66717d;
  --rp-paper: #ffffff;
  --rp-font: 'Tajawal', Tahoma, Arial, sans-serif;
  font-family: var(--rp-font);
  color: #17212b;
  direction: rtl;
  width: 100%;
}
.rp-root * {
  box-sizing: border-box;
}
.rp-page {
  background: var(--rp-paper);
  margin: 0 auto 14px;
  position: relative;
  box-shadow: 0 4px 18px rgba(21, 37, 54, 0.12);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  break-inside: avoid;
  page-break-inside: avoid;
}
.rp-root.rp-a5 .rp-page {
  width: 148mm;
  min-height: 204mm;
  padding: 7.5mm 8mm;
}
.rp-root.rp-a4 .rp-page {
  width: 210mm;
  min-height: 291mm;
  padding: 8mm;
}
.rp-root.rp-thermal .rp-page {
  width: 80mm;
  min-height: auto;
  padding: 2.5mm;
  box-shadow: 0 2px 10px rgba(21, 37, 54, 0.1);
}
.rp-frame {
  border: 1.1px solid #273747;
  flex: 1 1 auto;
  padding: 3.5mm;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}
.rp-root.rp-a5 .rp-frame {
  padding: 3mm;
}
.rp-head {
  direction: ltr;
  display: grid;
  grid-template-columns: 1fr 30mm 1fr;
  grid-template-areas: 'phones logo company';
  align-items: center;
  gap: 3mm;
  padding: 0 0 3.5mm;
  border-bottom: 2px solid var(--rp-gold);
  margin-bottom: 3.5mm;
}
.rp-phones {
  grid-area: phones;
  text-align: left;
  direction: ltr;
  font-size: 9pt;
  line-height: 1.65;
  color: #263544;
}
.rp-phones div {
  white-space: nowrap;
}
.rp-logo {
  grid-area: logo;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 20mm;
}
.rp-logo img {
  max-width: 28mm;
  max-height: 22mm;
  object-fit: contain;
}
.rp-logo-placeholder {
  width: 24mm;
  height: 20mm;
  border: 1px dashed #aab5c0;
  color: #7a8794;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 8.5pt;
  line-height: 1.35;
  padding: 1mm;
}
.rp-company {
  grid-area: company;
  direction: rtl;
  text-align: right;
  font-size: 13pt;
  font-weight: 700;
  line-height: 1.4;
  color: var(--rp-navy);
  word-break: keep-all;
  overflow-wrap: break-word;
}
.rp-branch {
  font-size: 8.5pt;
  color: var(--rp-muted);
  font-weight: normal;
  margin-top: 1mm;
}
.rp-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4mm;
  margin: 0 0 3mm;
}
.rp-title-row h1 {
  font-size: 14pt;
  font-weight: 700;
  margin: 0;
  color: var(--rp-navy);
}
.rp-title-row .rp-date {
  font-size: 8.8pt;
  color: #344354;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rp-meta {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  border: 1px solid var(--rp-line);
  border-radius: 2mm;
  overflow: hidden;
  margin-bottom: 3.5mm;
}
.rp-meta-col {
  padding: 2.2mm 2.8mm;
  font-size: 8.5pt;
  line-height: 1.7;
  border-left: 1px solid var(--rp-line);
  min-width: 0;
}
.rp-meta-col:last-child {
  border-left: 0;
}
.rp-meta-center {
  text-align: center;
  font-weight: 700;
  font-size: 10.5pt;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
.rp-pair {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
  flex-wrap: wrap;
}
.rp-pair b {
  font-weight: 700;
  color: #0f172a;
}
.rp-head,
.rp-title-row,
.rp-meta,
.rp-data-cards,
.rp-card,
.rp-table tr,
.rp-totals-area,
.rp-notes,
.rp-signatures,
.rp-foot,
.rp-copyright {
  break-inside: avoid;
  page-break-inside: avoid;
}
.rp-meta-col b {
  overflow-wrap: anywhere;
}
.rp-table {
  width: 100%;
  max-width: 100%;
  border-collapse: collapse;
  font-size: 8.3pt;
  margin-bottom: 2.5mm;
}
.rp-table th,
.rp-table td {
  border: 1px solid #aeb9c3;
  padding: 1.45mm 1.2mm;
  text-align: center;
  vertical-align: middle;
  word-break: normal;
  overflow-wrap: break-word;
}
.rp-table th {
  background: #e9eef3;
  color: #152536;
  font-weight: 700;
  border-bottom: 2px solid #647384;
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: break-word;
  line-height: 1.28;
}
.rp-table td.rp-item-cell,
.rp-table td.rp-text-cell {
  text-align: right;
  font-weight: 600;
  white-space: normal;
  word-break: normal;
  overflow-wrap: anywhere;
}
.rp-table td.rp-badge-cell {
  text-align: center;
  white-space: normal;
  word-break: normal;
  overflow-wrap: anywhere;
}
.rp-table td.rp-idx-cell {
  text-align: center;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  width: 1%;
}
.rp-table td.rp-num-cell {
  white-space: nowrap;
  word-break: keep-all;
  font-variant-numeric: tabular-nums;
}
.rp-table tbody tr:nth-child(even) {
  background: #fafbfc;
}
.rp-root.rp-a4 .rp-table.rp-wide-table {
  font-size: 7.7pt;
}
.rp-root.rp-a4 .rp-table.rp-ultra-wide {
  font-size: 7.1pt;
}
.rp-root.rp-a4 .rp-table.rp-wide-table th,
.rp-root.rp-a4 .rp-table.rp-wide-table td,
.rp-root.rp-a4 .rp-table.rp-ultra-wide th,
.rp-root.rp-a4 .rp-table.rp-ultra-wide td {
  padding: 1.15mm 0.85mm;
}
.rp-root.rp-a5 .rp-head {
  padding-bottom: 2.2mm;
  margin-bottom: 2.2mm;
}
.rp-root.rp-a5 .rp-company {
  font-size: 11.2pt;
}
.rp-root.rp-a5 .rp-title-row {
  margin-bottom: 2mm;
}
.rp-root.rp-a5 .rp-title-row h1 {
  font-size: 11.8pt;
}
.rp-root.rp-a5 .rp-meta {
  margin-bottom: 2.2mm;
}
.rp-root.rp-a5 .rp-meta-col {
  padding: 1.5mm 2mm;
  font-size: 7.7pt;
  line-height: 1.5;
}
.rp-root.rp-a5 .rp-meta-center {
  font-size: 9.2pt;
}
.rp-root.rp-a5 .rp-table {
  font-size: 7.6pt;
  margin-bottom: 2mm;
}
.rp-root.rp-a5 .rp-table th,
.rp-root.rp-a5 .rp-table td {
  padding: 1.1mm 0.85mm;
}
.rp-root.rp-a5 .rp-table.rp-wide-table {
  font-size: 6.8pt;
}
.rp-root.rp-a5 .rp-table.rp-wide-table th,
.rp-root.rp-a5 .rp-table.rp-wide-table td {
  padding: 0.9mm 0.65mm;
}
.rp-root.rp-a5 .rp-table.rp-ultra-wide {
  font-size: 6.1pt;
}
.rp-root.rp-a5 .rp-table.rp-ultra-wide th,
.rp-root.rp-a5 .rp-table.rp-ultra-wide td {
  padding: 0.8mm 0.48mm;
}
.rp-root.rp-a5 .rp-table.rp-ultra-wide td.rp-num-cell {
  font-size: 5.9pt;
}
.rp-root.rp-a5 .rp-data-cards {
  gap: 1.6mm;
  margin: 1.6mm 0;
}
.rp-root.rp-a5 .rp-card {
  padding: 1.6mm 1.2mm;
}
.rp-root.rp-a5 .rp-card .rp-k {
  font-size: 7.1pt;
  margin-bottom: 0.7mm;
}
.rp-root.rp-a5 .rp-card .rp-v {
  font-size: 9.2pt;
  overflow-wrap: break-word;
}
.rp-data-cards.rp-cards-4 .rp-card .rp-v {
  font-size: 8.6pt;
  line-height: 1.32;
  overflow-wrap: break-word;
}
.rp-root.rp-a5 .rp-data-cards.rp-cards-4 .rp-card .rp-v {
  font-size: 7.4pt;
  line-height: 1.28;
}
.rp-root.rp-a5 .rp-totals {
  font-size: 8.4pt;
}
.rp-root.rp-a5 .rp-total-line {
  padding: 1.35mm 0.8mm;
}
.rp-root.rp-a5 .rp-total-line.rp-main {
  font-size: 10pt;
}
.rp-page.rp-compact .rp-head {
  padding-bottom: 1.8mm;
  margin-bottom: 1.8mm;
}
.rp-page.rp-compact .rp-logo {
  min-height: 15mm;
}
.rp-page.rp-compact .rp-logo-placeholder {
  width: 19mm;
  height: 15mm;
  font-size: 7.5pt;
}
.rp-page.rp-compact .rp-title-row {
  margin-bottom: 1.6mm;
}
.rp-page.rp-compact .rp-meta {
  margin-bottom: 1.8mm;
}
.rp-page.rp-compact .rp-meta-col {
  padding: 1.2mm 1.8mm;
  line-height: 1.45;
}
.rp-page.rp-compact .rp-section {
  padding: 1.3mm 2mm;
  margin: 1.5mm 0 1.3mm;
  font-size: 8.5pt;
}
.rp-page.rp-compact .rp-table {
  font-size: 7.4pt;
  margin-bottom: 1.5mm;
}
.rp-page.rp-compact .rp-table th,
.rp-page.rp-compact .rp-table td {
  padding: 0.95mm 0.85mm;
}
.rp-page.rp-compact .rp-totals-area {
  margin: 1.2mm 0 1.5mm;
}
.rp-page.rp-compact .rp-total-line {
  padding: 1.1mm 0.8mm;
}
.rp-page.rp-compact .rp-signatures {
  margin: 4.5mm 0 1.5mm;
}
.rp-totals-area {
  direction: ltr;
  display: flex;
  justify-content: flex-start;
  margin: 2mm 0 3mm;
}
.rp-totals {
  width: 65%;
  border-top: 1px solid var(--rp-line);
  font-size: 9.5pt;
}
.rp-total-line {
  direction: rtl;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2.1mm 1mm;
  border-bottom: 1px dashed #aab4be;
  gap: 4mm;
}
.rp-total-line .rp-label {
  text-align: right;
  color: #334155;
}
.rp-total-line .rp-value {
  direction: ltr;
  text-align: left;
  white-space: nowrap;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}
.rp-total-line.rp-main {
  font-size: 12pt;
  font-weight: 700;
  color: var(--rp-navy);
}
.rp-total-line.rp-due .rp-label,
.rp-total-line.rp-due .rp-value {
  color: #9b4b00;
}
.rp-total-line.rp-deficit .rp-label,
.rp-total-line.rp-deficit .rp-value {
  color: #b91c1c;
}
.rp-total-line.rp-surplus .rp-label,
.rp-total-line.rp-surplus .rp-value {
  color: #15803d;
}
.rp-data-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2.2mm;
  margin: 2.5mm 0;
}
.rp-card {
  border: 1px solid var(--rp-line);
  border-radius: 2mm;
  padding: 2.4mm;
  text-align: center;
  background: #ffffff;
}
.rp-card .rp-k {
  font-size: 8pt;
  color: #65717e;
  margin-bottom: 1.2mm;
}
.rp-card .rp-v {
  font-size: 11.5pt;
  font-weight: 700;
  color: var(--rp-navy);
  font-variant-numeric: tabular-nums;
}
.rp-section {
  font-weight: 700;
  font-size: 9.5pt;
  color: var(--rp-navy);
  padding: 2mm 2.5mm;
  background: #eef2f6;
  border: 1px solid var(--rp-line);
  margin: 2.5mm 0 2mm;
}
.rp-notes {
  border: 1px solid var(--rp-line);
  padding: 2.5mm 3mm;
  margin: 2mm 0;
  font-size: 8.8pt;
  line-height: 1.75;
}
.rp-signatures {
  display: flex;
  justify-content: space-around;
  margin: 8mm 0 3mm;
  gap: 4mm;
}
.rp-signatures span {
  flex: 1;
  max-width: 30%;
  text-align: center;
  border-top: 1px solid #65717e;
  padding-top: 1.8mm;
  font-size: 8.5pt;
  color: #334155;
}
.rp-foot {
  margin-top: auto;
  border-top: 1px solid var(--rp-line);
  padding-top: 2.5mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 3mm;
  font-size: 7.8pt;
  font-weight: 500;
  color: #334155;
}
.rp-root.rp-a5 .rp-foot {
  font-size: 7.3pt;
}
.rp-terms {
  text-align: center;
  font-size: 8.2pt;
  color: #334155;
  margin-top: 1.5mm;
}
.rp-copyright {
  text-align: center;
  color: #65717e;
  font-size: 7.8pt;
  margin-top: 2mm;
}

/* Structured Thermal Ledger Blocks (Prevents >4-col table cramming on 80mm rolls) */
.rp-th-list {
  display: flex;
  flex-direction: column;
  gap: 1.8mm;
  margin-bottom: 2.5mm;
}
.rp-th-entry {
  border: 1px solid #aeb9c3;
  border-radius: 1.5mm;
  padding: 1.6mm 2mm;
  background: #ffffff;
  font-size: 7.8pt;
  line-height: 1.55;
}
.rp-th-entry:nth-child(even) {
  background: #f8fafc;
}
.rp-th-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 2mm;
  border-bottom: 1px dashed #e2e8f0;
  padding: 0.6mm 0;
}
.rp-th-row:last-child {
  border-bottom: 0;
}
.rp-th-k {
  color: #475569;
  font-weight: 600;
  white-space: nowrap;
}
.rp-th-v {
  color: #0f172a;
  font-weight: 700;
  text-align: left;
  font-variant-numeric: tabular-nums;
  word-break: normal;
  overflow-wrap: break-word;
}

/* Thermal 80mm overrides */
.rp-root.rp-thermal .rp-frame {
  padding: 2mm;
  border-color: #222;
}
.rp-root.rp-thermal .rp-head {
  grid-template-columns: 1fr;
  grid-template-areas: 'company' 'logo' 'phones';
  gap: 1mm;
  text-align: center;
  padding-bottom: 2mm;
  margin-bottom: 2mm;
}
.rp-root.rp-thermal .rp-company {
  text-align: center;
  font-size: 11pt;
}
.rp-root.rp-thermal .rp-phones {
  text-align: center;
  font-size: 8pt;
}
.rp-root.rp-thermal .rp-logo {
  min-height: 12mm;
}
.rp-root.rp-thermal .rp-logo-placeholder {
  width: 18mm;
  height: 11mm;
  font-size: 7pt;
}
.rp-root.rp-thermal .rp-logo img {
  max-width: 18mm;
  max-height: 12mm;
}
.rp-root.rp-thermal .rp-title-row {
  display: block;
  text-align: center;
  margin-bottom: 2mm;
}
.rp-root.rp-thermal .rp-title-row h1 {
  font-size: 11pt;
}
.rp-root.rp-thermal .rp-title-row .rp-date {
  font-size: 8pt;
}
.rp-root.rp-thermal .rp-meta {
  grid-template-columns: 1fr;
  margin-bottom: 2mm;
}
.rp-root.rp-thermal .rp-meta-col {
  border-left: 0;
  border-bottom: 1px solid #bbb;
  padding: 1.5mm;
  font-size: 8pt;
}
.rp-root.rp-thermal .rp-meta-col:last-child {
  border-bottom: 0;
}
.rp-root.rp-thermal .rp-meta-center {
  font-size: 9.5pt;
}
.rp-root.rp-thermal .rp-table {
  font-size: 7.4pt;
}
.rp-root.rp-thermal .rp-table th,
.rp-root.rp-thermal .rp-table td {
  padding: 1.2mm 0.7mm;
}
.rp-root.rp-thermal .rp-totals {
  width: 100%;
  font-size: 8.5pt;
}
.rp-root.rp-thermal .rp-total-line {
  padding: 1.5mm 0.5mm;
}
.rp-root.rp-thermal .rp-total-line.rp-main {
  font-size: 10pt;
}
.rp-root.rp-thermal .rp-data-cards {
  grid-template-columns: 1fr;
  gap: 1.5mm;
}
.rp-root.rp-thermal .rp-card {
  padding: 1.8mm;
}
.rp-root.rp-thermal .rp-card .rp-v {
  font-size: 10pt;
}
.rp-root.rp-thermal .rp-foot {
  font-size: 7pt;
  flex-wrap: wrap;
}
.rp-root.rp-thermal .rp-copyright {
  font-size: 7pt;
}
.rp-root.rp-thermal .rp-section {
  padding: 1.5mm;
  font-size: 8pt;
}
.rp-root.rp-thermal .rp-signatures {
  margin: 5mm 0 2mm;
}
.rp-root.rp-thermal .rp-signatures span {
  font-size: 7pt;
}
`;

export const CentralizedInvoicePrintModal: React.FC<CentralizedInvoicePrintModalProps> = ({
  defaultSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'audit'>('preview');
  const [activePayload, setActivePayload] = useState<UniversalPrintPayload | null>(null);
  const [selectedSize, setSelectedSize] = useState<UniversalPaperSize>('a5-portrait');
  const [includeBatchSummary, setIncludeBatchSummary] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showWhatsappPrompt, setShowWhatsappPrompt] = useState(false);
  const [whatsappPhoneInput, setWhatsappPhoneInput] = useState('');
  const printSheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubUniversal = subscribeToUniversalPrint((payload) => {
      setActivePayload(payload);
      setSelectedSize(normalizePaperSizeOption(payload.preferredPaperSize));
      setIncludeBatchSummary(!!payload.includeSummarySheet);
      setActiveTab('preview');
      setShowWhatsappPrompt(false);
      setWhatsappPhoneInput('');
      setIsOpen(true);
    });

    const unsubLegacy = subscribeToInvoicePrint((legacyPayload) => {
      if (!legacyPayload || !legacyPayload.invoice) return;
      const inv = legacyPayload.invoice;
      const isSale = legacyPayload.isSales !== false;
      const fin = resolveInvoiceFinancials(inv);
      const curSymbol = legacyPayload.settings?.currencySymbol || defaultSettings?.currencySymbol || 'ج.م';
      const curName = curSymbol === 'ج.م' ? 'جنيه مصري' : curSymbol;

      const items: UniversalPrintItem[] = (inv.items || []).map((it, idx) => {
        const qtyVal = (it as any).quantity ?? (it as any).qty ?? 1;
        const priceVal = it.price ?? 0;
        const descVal = (it as any).spec || (it as any).notes || (it as any).description || (it as any).desc || '';
        return {
          index: idx + 1,
          code: (it as any).code || (it as any).itemCode || `ITEM-${idx + 1}`,
          name: it.name || (it as any).itemName || 'صنف',
          unit: (it as any).unit || 'قطعة',
          qty: qtyVal,
          price: priceVal,
          discount: (it as any).discount || 0,
          tax: (it as any).tax || 0,
          total: it.total ?? Number(qtyVal) * Number(priceVal),
          notes: descVal,
        };
      });

      const summaries: UniversalPrintSummaryItem[] = [
        { label: 'عدد الأصناف', value: `${items.length} صنف` },
        { label: 'المجموع الفرعي', value: fmtMoney(fin.subtotalVal, curSymbol) },
      ];
      if (fin.discountVal > 0) summaries.push({ label: 'الخصم', value: fmtMoney(fin.discountVal, curSymbol) });
      if (fin.taxVal > 0) summaries.push({ label: 'الضريبة', value: fmtMoney(fin.taxVal, curSymbol) });
      if (fin.extraChargesVal > 0) summaries.push({ label: 'مصاريف إضافية', value: fmtMoney(fin.extraChargesVal, curSymbol) });
      summaries.push({
        label: 'الصافي المستحق',
        value: fmtMoney(fin.grandTotal, curSymbol),
        isHighlight: true,
        isTotal: true,
      });
      summaries.push({ label: 'المدفوع', value: fmtMoney(fin.paidVal, curSymbol) });
      if (fin.remainingVal > 0.01) {
        summaries.push({ label: 'المتبقي', value: fmtMoney(fin.remainingVal, curSymbol), isHighlight: true });
      }

      const prefSize = normalizePaperSizeOption(legacyPayload.preferredPaperSize);
      const docTitle = isSale
        ? fin.isReturn
          ? inv.type === 'return_nagdi'
            ? 'سند مرتجع مبيعات نقدي'
            : 'سند مرتجع مبيعات آجل'
          : inv.type === 'nagdi'
          ? 'فاتورة مبيعات نقدية'
          : 'فاتورة مبيعات آجلة'
        : fin.isReturn
        ? inv.type === 'return_nagdi'
          ? 'سند مرتجع مشتريات نقدي'
          : 'سند مرتجع مشتريات آجل'
        : inv.type === 'nagdi'
        ? 'فاتورة مشتريات نقدية'
        : 'فاتورة مشتريات آجلة';

      const partyName = isSale
        ? (inv as any).customerName || 'عميل نقدي'
        : (inv as any).supplierName || 'مورد عام';

      const p: UniversalPrintPayload = {
        kind: isSale
          ? fin.isReturn
            ? 'sales_return'
            : 'sales_invoice'
          : fin.isReturn
          ? 'purchase_return'
          : 'purchase_invoice',
        title: docTitle,
        docNumber: inv.id,
        date: inv.date || new Date().toISOString().split('T')[0],
        time: inv.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        branch: (inv as any).branchName || '',
        user: (inv as any).createdBy || (inv as any).cashierName || '',
        partyName,
        partyCode: (inv as any).customerCode || (inv as any).supplierCode || (inv as any).customerId || (inv as any).supplierId || '-',
        partyPhone: inv.phone || (inv as any).customerPhone || (inv as any).supplierPhone || '-',
        partyAddress: (inv as any).address || (inv as any).customerAddress || (inv as any).supplierAddress || '',
        partyLabel: isSale ? 'اسم العميل' : 'اسم المورد',
        partyCodeLabel: isSale ? 'كود العميل' : 'كود المورد',
        paymentMethod: fin.paymentMethodLabel,
        paymentStatus: fin.paymentStatus,
        treasuryOrBank: fin.treasuryOrBank,
        subtotal: fin.subtotalVal,
        discountAmount: fin.discountVal,
        taxAmount: fin.taxVal,
        extraCharges: fin.extraChargesVal,
        paidAmount: fin.paidVal,
        remainingAmount: fin.remainingVal,
        amount: fin.grandTotal,
        amountInWords: tafqeetNumber(fin.grandTotal, curName, 'قرش'),
        notes: inv.notes || '',
        authorizedBy: (inv as any).createdBy || (inv as any).cashierName || 'إدارة الحسابات',
        receivedBy: partyName,
        originalInvoiceNumber: (inv as any).originalInvoiceId,
        isFullReturn: (inv as any).returnKind === 'full',
        returnKindLabel:
          fin.isReturn && (inv as any).returnKind
            ? (inv as any).returnKind === 'full'
              ? 'مرتجع كلي'
              : 'مرتجع جزئي'
            : undefined,
        items,
        summaries,
        preferredPaperSize: prefSize,
        settings: legacyPayload.settings || defaultSettings,
        onClose: legacyPayload.onClose,
      };

      setActivePayload(p);
      setSelectedSize(prefSize);
      setIncludeBatchSummary(false);
      setActiveTab('preview');
      setIsOpen(true);
    });

    return () => {
      unsubUniversal();
      unsubLegacy();
    };
  }, [defaultSettings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    const handleAfterPrint = () => {
      const existingStyle = document.getElementById('rakeeza-print-page-style');
      if (existingStyle) existingStyle.remove();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('afterprint', handleAfterPrint);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [isOpen]);

  const handleClose = () => {
    if (activePayload?.onClose) {
      try {
        activePayload.onClose();
      } catch {}
    }
    setShowWhatsappPrompt(false);
    setWhatsappPhoneInput('');
    setIsOpen(false);
    setActivePayload(null);
  };

  const handleShareWhatsApp = () => {
    if (!activePayload) return;
    const rawPhone = activePayload.partyPhone && activePayload.partyPhone !== '-' ? activePayload.partyPhone : '';
    const cleaned = cleanPhoneNumber(rawPhone);
    if (cleaned) {
      const msg = generateUniversalDocumentWhatsAppMessage(activePayload);
      openWhatsAppChat(cleaned, msg);
      setShowWhatsappPrompt(false);
    } else {
      setWhatsappPhoneInput('');
      setShowWhatsappPrompt((prev) => !prev);
    }
  };

  const handleConfirmWhatsappSend = (skipPhone = false) => {
    if (!activePayload) return;
    const msg = generateUniversalDocumentWhatsAppMessage(activePayload);
    openWhatsAppChat(skipPhone ? '' : whatsappPhoneInput.trim(), msg);
    setShowWhatsappPrompt(false);
    setWhatsappPhoneInput('');
  };

  const handleSelectPaperSize = (size: UniversalPaperSize) => {
    setSelectedSize(size);
    try {
      const pref = size === 'a4-portrait' ? 'A4' : size === 'thermal-80' ? 'thermal' : 'A5';
      localStorage.setItem('sys_print_pref_size', pref);
    } catch {}
  };

  const handlePrint = () => {
    if (typeof window === 'undefined') return;

    const existingStyle = document.getElementById('rakeeza-print-page-style');
    if (existingStyle) existingStyle.remove();

    let pageCss = '@page { size: A5 portrait; margin: 8mm; }';
    let docSizeCss = `
      .rp-root.rp-a5 .rp-page {
        width: 100% !important;
        max-width: 132mm !important;
        min-height: 188mm !important;
        height: auto !important;
        padding: 0 !important;
      }
    `;

    if (selectedSize === 'a4-portrait') {
      pageCss = '@page { size: A4 portrait; margin: 8mm; }';
      docSizeCss = `
        .rp-root.rp-a4 .rp-page {
          width: 100% !important;
          max-width: 194mm !important;
          min-height: 274mm !important;
          height: auto !important;
          padding: 0 !important;
        }
      `;
    } else if (selectedSize === 'thermal-80') {
      pageCss = '@page { size: 80mm auto; margin: 2mm; }';
      docSizeCss = `
        .rp-root.rp-thermal .rp-page {
          width: 100% !important;
          max-width: 76mm !important;
          min-height: 0 !important;
          height: auto !important;
          padding: 0 !important;
        }
        .rp-root.rp-thermal .rp-frame {
          min-height: 0 !important;
        }
      `;
    }

    const styleEl = document.createElement('style');
    styleEl.id = 'rakeeza-print-page-style';
    styleEl.innerHTML = `${pageCss}
      @media print {
        html, body {
          background: #ffffff !important;
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: auto !important;
          overflow: visible !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body > *:not(.rakeeza-print-modal-root) {
          display: none !important;
        }
        .rakeeza-print-modal-root {
          position: static !important;
          inset: auto !important;
          display: block !important;
          width: 100% !important;
          height: auto !important;
          background: #ffffff !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: visible !important;
        }
        .rakeeza-print-scroll-wrap {
          display: block !important;
          overflow: visible !important;
          padding: 0 !important;
          margin: 0 !important;
          background: #ffffff !important;
        }
        .rp-scale-outer,
        .rp-scale-inner {
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
          height: auto !important;
          transform: none !important;
          overflow: visible !important;
          margin: 0 auto !important;
          display: block !important;
        }
        #rakeeza-universal-print-sheet,
        #rakeeza-batch-print-container {
          position: static !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 auto !important;
          padding: 0 !important;
          background: #ffffff !important;
        }
        .rp-page {
          box-shadow: none !important;
          border-radius: 0 !important;
          margin: 0 auto !important;
          overflow: visible !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .rp-page:not(:last-child) {
          page-break-after: always !important;
          break-after: page !important;
        }
        .rp-page:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }
        .rp-frame {
          flex: 1 1 auto !important;
        }
        ${docSizeCss}
        .rp-table thead {
          display: table-header-group !important;
        }
        .rp-table tfoot {
          display: table-footer-group !important;
        }
        .rp-head,
        .rp-title-row,
        .rp-meta,
        .rp-table tr,
        .rp-totals-area,
        .rp-data-cards,
        .rp-card,
        .rp-signatures,
        .rp-notes,
        .rp-foot,
        .rp-copyright {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .no-print, .preview-toolbar, .preview-header-area {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(styleEl);

    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handleSavePdf = async () => {
    if (!printSheetRef.current || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 140));

      let format: 'a4' | 'a5' | 'thermal' = 'a5';
      if (selectedSize === 'a4-portrait' || selectedSize === 'a4-landscape') {
        format = 'a4';
      } else if (selectedSize === 'thermal-80' || selectedSize === 'thermal-58') {
        format = 'thermal';
      }

      const docTitle = activePayload?.title?.replace(/\s+/g, '_') || 'مستند';
      const cleanNum = sanitizeDisplaySerial(activePayload?.docNumber);
      const docNum = cleanNum ? `_${cleanNum}` : '';
      const filename = `${docTitle}${docNum}_${new Date().toISOString().split('T')[0]}.pdf`;

      await exportElementToPdf(printSheetRef.current, filename, {
        format,
        orientation: 'portrait',
        margin: format === 'thermal' ? 2 : 0,
        scale: 2,
      });
    } catch (e) {
      console.error('Error generating PDF:', e);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!isOpen || !activePayload || typeof document === 'undefined') {
    return null;
  }

  const settings: Settings = activePayload.settings || defaultSettings || ({} as Settings);
  const currencySymbol = settings.currencySymbol || 'ج.م';
  const currencyName = currencySymbol === 'ج.م' ? 'جنيه مصري' : currencySymbol;

  const isBatchMode = activePayload.kind === 'batch_invoices' && Array.isArray(activePayload.documents);
  const batchDocs = activePayload.documents || [];
  const docSerial = sanitizeDisplaySerial(activePayload.docNumber);
  const isThermal = selectedSize === 'thermal-80' || selectedSize === 'thermal-58';
  const isA4 = selectedSize === 'a4-portrait' || selectedSize === 'a4-landscape';
  const rootSizeClass = isThermal ? 'rp-thermal' : isA4 ? 'rp-a4' : 'rp-a5';
  const totalAmount = activePayload.amount !== undefined ? Number(activePayload.amount) : 0;

  const selectedSizeMeta =
    PAPER_SIZE_OPTIONS.find((o) => o.id === selectedSize) || PAPER_SIZE_OPTIONS[0];

  const isInvoiceKind =
    activePayload.kind === 'sales_invoice' ||
    activePayload.kind === 'purchase_invoice' ||
    activePayload.kind === 'sales_return' ||
    activePayload.kind === 'purchase_return';

  const modalHeaderTitle = isBatchMode
    ? `معاينة وطباعة (${activePayload.title})`
    : isInvoiceKind
    ? `معاينة الفاتورة${docSerial ? ` (${docSerial})` : ''}`
    : `${activePayload.title}${docSerial ? ` (${docSerial})` : ''}`;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-slate-900/75 rakeeza-modal-backdrop rakeeza-print-modal-root overflow-x-hidden"
      dir="rtl"
    >
      <style dangerouslySetInnerHTML={{ __html: SCOPED_PRINT_CSS }} />

      {/* Top Toolbar (No Manual Document-Type Selector — Paper Size Only) */}
      <div className="preview-header-area no-print bg-white text-slate-900 border-b border-slate-200 px-3 sm:px-5 py-2.5 shadow-xs shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate flex-1 min-w-0">
            {modalHeaderTitle}
          </h2>
          {isBatchMode && (
            <div className="flex items-center gap-1.5 shrink-0">
              {activePayload.batchSummary && (
                <button
                  type="button"
                  onClick={() => setIncludeBatchSummary((prev) => !prev)}
                  className={`w-10 h-10 rounded-xl text-xs font-semibold flex items-center justify-center transition cursor-pointer border ${
                    includeBatchSummary
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  }`}
                  title={includeBatchSummary ? 'إخفاء ورقة ملخص السجل' : 'تضمين ورقة ملخص السجل'}
                >
                  <FileCheck className="w-4 h-4 shrink-0" />
                </button>
              )}

              <button
                type="button"
                onClick={handleSavePdf}
                disabled={isExportingPdf}
                className="w-10 h-10 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition flex items-center justify-center cursor-pointer disabled:opacity-50 shrink-0"
                title="حفظ بتنسيق PDF"
                aria-label="حفظ PDF"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="min-h-[40px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                title="طباعة فورية لكافة الفواتير"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>طباعة فورية</span>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center transition cursor-pointer shrink-0"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isBatchMode && (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>{isInvoiceKind ? 'معاينة الفاتورة' : 'معاينة المستند'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>التدقيق (1)</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="min-h-[40px] px-2.5 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer shrink-0"
                title="مشاركة وإرسال عبر واتساب"
                aria-label="إرسال عبر واتساب"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">واتساب</span>
              </button>

              <button
                type="button"
                onClick={handleSavePdf}
                disabled={isExportingPdf}
                className="w-10 h-10 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition flex items-center justify-center cursor-pointer disabled:opacity-50 shrink-0"
                title="حفظ بتنسيق PDF"
                aria-label="حفظ PDF"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="min-h-[40px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3.5 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                title="طباعة المستند"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>{isInvoiceKind ? 'طباعة الفاتورة' : 'طباعة'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Inline WhatsApp Phone Input Popover when partyPhone is missing */}
        {!isBatchMode && showWhatsappPrompt && (
          <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs">
            <span className="font-bold text-emerald-900 shrink-0">📲 أدخل رقم الواتساب:</span>
            <input
              type="tel"
              dir="ltr"
              value={whatsappPhoneInput}
              onChange={(e) => setWhatsappPhoneInput(e.target.value)}
              placeholder="010..."
              className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-emerald-300 rounded-lg font-mono text-slate-900 focus:outline-none focus:border-emerald-600"
              autoFocus
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleConfirmWhatsappSend(false)}
                disabled={!cleanPhoneNumber(whatsappPhoneInput)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold cursor-pointer"
              >
                إرسال
              </button>
              <button
                type="button"
                onClick={() => handleConfirmWhatsappSend(true)}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold cursor-pointer"
              >
                فتح واتساب مباشرة
              </button>
              <button
                type="button"
                onClick={() => setShowWhatsappPrompt(false)}
                className="px-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* 3-Option Paper Size Segmented Selector */}
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
          <span className="text-[11px] sm:text-xs font-semibold text-slate-600 shrink-0 leading-tight">
            مقاس الطباعة:
          </span>
          <div className="flex-1 bg-slate-100 p-1 rounded-xl grid grid-cols-3 gap-1">
            {PAPER_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectPaperSize(opt.id)}
                className={`min-h-[38px] px-1.5 sm:px-2.5 py-1 rounded-lg text-[10.5px] sm:text-xs font-semibold leading-tight text-center transition cursor-pointer flex items-center justify-center ${
                  selectedSize === opt.id
                    ? 'bg-[#172536] text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white/70'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preview Body */}
      <div className="rakeeza-print-scroll-wrap flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-5 flex justify-center items-start bg-[#edf1f5]">
        {activeTab === 'preview' ? (
          <ScaledPrintViewport
            paperKind={isThermal ? 'thermal' : isA4 ? 'a4' : 'a5'}
            forceFullScale={isExportingPdf}
            resetKey={`${selectedSize}-${activePayload.kind}-${docSerial}-${batchDocs.length}-${includeBatchSummary}`}
          >
            {isBatchMode ? (
              <div
                id="rakeeza-batch-print-container"
                ref={printSheetRef}
                className={`rp-root ${rootSizeClass}`}
              >
                {batchDocs.map((docPayload, idx) => {
                  const docSettings: Settings = docPayload.settings || settings;
                  const docCur = docSettings.currencySymbol || currencySymbol;
                  return (
                    <React.Fragment key={`${docPayload.docNumber || idx}-${idx}`}>
                      <UnifiedPaginatedDocument
                        payload={docPayload}
                        settings={docSettings}
                        currencySymbol={docCur}
                        currencyName={docCur === 'ج.م' ? 'جنيه مصري' : docCur}
                        isThermal={isThermal}
                        isA4={isA4}
                        batchPositionLabel={`مستند ${idx + 1} من ${batchDocs.length}`}
                      />
                    </React.Fragment>
                  );
                })}

                {includeBatchSummary && activePayload.batchSummary && (
                  <BatchSummaryPages
                    summary={activePayload.batchSummary}
                    settings={settings}
                    isThermal={isThermal}
                    isA4={isA4}
                  />
                )}
              </div>
            ) : (
              <div
                id="rakeeza-universal-print-sheet"
                ref={printSheetRef}
                className={`rp-root ${rootSizeClass}`}
              >
                <UnifiedPaginatedDocument
                  payload={activePayload}
                  settings={settings}
                  currencySymbol={currencySymbol}
                  currencyName={currencyName}
                  isThermal={isThermal}
                  isA4={isA4}
                />
              </div>
            )}
          </ScaledPrintViewport>
        ) : (
          <div className="bg-white text-slate-900 p-4 sm:p-6 rounded-xl shadow-sm max-w-2xl w-full border border-slate-200">
            <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3 mb-4">
              <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  {isBatchMode
                    ? `التدقيق والتوثيق المحاسبي للسجل (${batchDocs.length} مستند)`
                    : `التدقيق والتوثيق المحاسبي للمستند${docSerial ? ` (${docSerial})` : ''}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  مراجعة القراءة المحاسبية دون أي تعديل على الأرصدة أو القيود المسجلة
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-lg flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-700 shrink-0" />
                <div>
                  <strong className="font-semibold">وضع القراءة الآمن: </strong>
                  <span>عملية المعاينة والطباعة لا تنشئ قيوداً مكررة ولا تؤثر على الخزينة أو المخزون.</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 text-xs block">نوع المستند (تلقائي):</span>
                  <span className="font-semibold text-slate-900">{activePayload.title}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">
                    {isBatchMode ? 'عدد المستندات:' : 'الرقم المرجعي:'}
                  </span>
                  <span className="font-semibold text-slate-900 financial-num">
                    {isBatchMode ? `${batchDocs.length} مستند` : `#${docSerial}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">التاريخ والوقت:</span>
                  <span className="font-medium text-slate-900 financial-num">
                    {activePayload.date || '-'} — {activePayload.time || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">طريقة السداد:</span>
                  <span className="font-medium text-slate-900">
                    {isBatchMode ? 'مستندات متتالية بفواصل صفحات' : activePayload.paymentMethod || 'نقدي'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">الصافي المعتمد:</span>
                  <span className="font-bold text-slate-900 financial-num">
                    {fmtMoney(totalAmount, currencySymbol)}
                  </span>
                </div>
                {!isBatchMode && (
                  <div>
                    <span className="text-slate-500 text-xs block">حالة المستند:</span>
                    <span className="font-medium text-slate-900">{activePayload.paymentStatus || 'معتمد'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="no-print bg-white border-t border-slate-200 px-3 sm:px-5 py-2.5 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handlePrint}
          className="flex-1 min-h-[44px] bg-[#172536] hover:bg-[#1e3148] text-white rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
        >
          <Printer className="w-4 h-4 shrink-0" />
          <span>
            {isInvoiceKind
              ? `طباعة الفاتورة الآن (${selectedSizeMeta.shortLabel})`
              : `طباعة المستند الآن (${selectedSizeMeta.shortLabel})`}
          </span>
        </button>

        {!isBatchMode && (
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="w-11 h-11 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center transition cursor-pointer shrink-0"
            title="إرسال عبر واتساب"
            aria-label="إرسال عبر واتساب"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={handleSavePdf}
          disabled={isExportingPdf}
          className="w-11 h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center transition cursor-pointer disabled:opacity-50 shrink-0"
          title="حفظ PDF"
          aria-label="حفظ PDF"
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="min-h-[44px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs sm:text-sm transition cursor-pointer shrink-0"
        >
          إغلاق
        </button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

/* ============================================================================
 * Proportional Mobile & Desktop Paper Viewport (True WYSIWYG, Zero Text Break)
 * ============================================================================ */

const NATURAL_PAPER_PX: Record<'a5' | 'a4' | 'thermal', number> = {
  a5: 560,
  a4: 794,
  thermal: 303,
};

const ScaledPrintViewport: React.FC<{
  paperKind: 'a5' | 'a4' | 'thermal';
  forceFullScale?: boolean;
  resetKey?: string;
  children: React.ReactNode;
}> = ({ paperKind, forceFullScale, resetKey, children }) => {
  const outerWrapRef = useRef<HTMLDivElement>(null);
  const innerSheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1);
  const [contentHeight, setContentHeight] = useState<number>(0);

  const naturalWidth = NATURAL_PAPER_PX[paperKind];

  useEffect(() => {
    const outer = outerWrapRef.current;
    const inner = innerSheetRef.current;
    if (!outer || !inner) return;

    const recalc = () => {
      const parentEl = outer.parentElement;
      const availWidth = parentEl
        ? Math.max(200, parentEl.clientWidth - (window.innerWidth < 640 ? 16 : 40))
        : Math.max(200, window.innerWidth - 24);
      const nextScale = forceFullScale
        ? 1
        : Math.min(1, Math.max(0.28, availWidth / naturalWidth));
      setScale(nextScale);
      setContentHeight(inner.scrollHeight || inner.offsetHeight || 0);
    };

    recalc();
    const rafId = window.requestAnimationFrame(recalc);
    const timerId = window.setTimeout(recalc, 80);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(recalc);
      if (outer.parentElement) ro.observe(outer.parentElement);
      ro.observe(inner);
    }
    window.addEventListener('resize', recalc);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', recalc);
    };
  }, [naturalWidth, forceFullScale, resetKey]);

  const effectiveScale = forceFullScale ? 1 : scale;
  const scaledW = Math.floor(naturalWidth * effectiveScale);
  const scaledH = contentHeight > 0 ? Math.ceil(contentHeight * effectiveScale) : undefined;

  return (
    <div
      ref={outerWrapRef}
      dir="ltr"
      className="rp-scale-outer shrink-0 mx-auto"
      style={{
        width: `${scaledW}px`,
        maxWidth: '100%',
        height: scaledH ? `${scaledH}px` : 'auto',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        ref={innerSheetRef}
        className="rp-scale-inner"
        style={{
          width: `${naturalWidth}px`,
          minWidth: `${naturalWidth}px`,
          maxWidth: 'none',
          transform: effectiveScale < 0.998 ? `scale(${effectiveScale})` : 'none',
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
};

const ThermalLedgerRows: React.FC<{
  cols: string[];
  rows: Array<Array<string | number | null | undefined>>;
  emptyText: string;
}> = ({ cols, rows, emptyText }) => {
  if (!rows || rows.length === 0) {
    return (
      <div className="rp-th-entry" style={{ textAlign: 'center', color: '#66717d', padding: '4mm 2mm' }}>
        {emptyText}
      </div>
    );
  }
  return (
    <div className="rp-th-list">
      {rows.map((row, rIdx) => (
        <div key={rIdx} className="rp-th-entry">
          {cols.map((colName, cIdx) => {
            const val = row[cIdx];
            if (val === null || val === undefined || val === '' || val === '-') return null;
            return (
              <div key={cIdx} className="rp-th-row">
                <span className="rp-th-k">{colName}:</span>
                <span className="rp-th-v">{val}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/* ============================================================================
 * Shared Header, Shell & Footer matching Attached Unified Print Design
 * ============================================================================ */

const DocumentHeader: React.FC<{
  settings: Settings;
  branchName?: string;
  isA4: boolean;
  batchPositionLabel?: string;
}> = ({ settings, branchName, isA4, batchPositionLabel }) => {
  const companyName = settings.companyName || 'المنظومة المحاسبية';
  const companyAddress = settings.address || '';
  const companyTax = settings.taxNumber || '';
  const companyReg = settings.commercialReg || '';
  const showLogo = settings.showLogoInPrint !== false;
  const companyLogo = showLogo ? (settings as any).logo || (settings as any).logoUrl || '' : '';
  const phones = [settings.phone1, settings.phone2, settings.phone3].filter(Boolean) as string[];

  return (
    <header className="rp-head">
      <div className="rp-phones">
        {phones.length > 0 ? (
          phones.map((ph, i) => (
            <div key={i}>
              {phones.length > 1 ? `هاتف ${i + 1}: ` : 'هاتف: '}
              {ph}
            </div>
          ))
        ) : (
          <div>هاتف: —</div>
        )}
        {batchPositionLabel && <div style={{ color: '#66717d', fontSize: '7.5pt' }}>{batchPositionLabel}</div>}
      </div>

      <div className="rp-logo">
        {companyLogo ? (
          <img src={companyLogo} alt={companyName} />
        ) : showLogo ? (
          <div className="rp-logo-placeholder">
            شعار
            <br />
            المؤسسة
          </div>
        ) : null}
      </div>

      <div className="rp-company">
        {companyName}
        {(branchName || companyAddress) && (
          <div className="rp-branch">
            {branchName || ''}
            {branchName && isA4 && companyAddress ? ' — ' : ''}
            {isA4 && companyAddress ? companyAddress : ''}
          </div>
        )}
        {isA4 && (companyTax || companyReg) && (
          <div className="rp-branch" style={{ fontSize: '8pt' }}>
            {companyTax ? `الرقم الضريبي: ${companyTax}` : ''}
            {companyTax && companyReg ? ' | ' : ''}
            {companyReg ? `السجل التجاري: ${companyReg}` : ''}
          </div>
        )}
      </div>
    </header>
  );
};

const DocumentPageShell: React.FC<{
  settings: Settings;
  title: string;
  dateStr: string;
  timeStr: string;
  docSerial: string;
  branchName?: string;
  notes?: string;
  footerTermsNote?: string;
  pageIndex: number;
  totalPages: number;
  isA4: boolean;
  isLastPage: boolean;
  isCompact?: boolean;
  batchPositionLabel?: string;
  children: React.ReactNode;
}> = ({
  settings,
  title,
  dateStr,
  timeStr,
  docSerial,
  branchName,
  notes,
  footerTermsNote,
  pageIndex,
  totalPages,
  isA4,
  isLastPage,
  isCompact,
  batchPositionLabel,
  children,
}) => {
  const companyName = settings.companyName || 'المنظومة المحاسبية';

  return (
    <article className={`rp-page rakeeza-print-doc-page${isCompact ? ' rp-compact' : ''}`}>
      <div className="rp-frame">
        <DocumentHeader
          settings={settings}
          branchName={branchName}
          isA4={isA4}
          batchPositionLabel={batchPositionLabel}
        />

        <div className="rp-title-row">
          <h1>{title}</h1>
          <div className="rp-date" dir="ltr">
            {dateStr} {timeStr ? `· ${timeStr}` : ''}
          </div>
        </div>

        {children}

        {isLastPage && notes && notes.trim() !== '' && (
          <div className="rp-notes">
            <b>ملاحظات:</b> {notes}
          </div>
        )}

        <footer className="rp-foot">
          <span style={{ flex: '1 1 auto', textAlign: 'right' }}>
            {isLastPage && footerTermsNote ? footerTermsNote : companyName}
          </span>
          <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            {docSerial && docSerial !== '-' && !isRawInternalId(docSerial) ? `رقم ${docSerial}` : ''}
          </span>
          <span className="page-num" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            {pageIndex + 1} / {totalPages}
          </span>
        </footer>
      </div>
      <div className="rp-copyright">
        جميع حقوق الملكية محفوظة لمطور النظام — Mohamed Nazih — 01029190615
      </div>
    </article>
  );
};

/* ============================================================================
 * Paginated Document Renderer (Dispatches Automatically by payload.kind)
 * ============================================================================ */

const UnifiedPaginatedDocument: React.FC<{
  payload: UniversalPrintPayload;
  settings: Settings;
  currencySymbol: string;
  currencyName: string;
  isThermal: boolean;
  isA4: boolean;
  batchPositionLabel?: string;
}> = ({
  payload,
  settings,
  currencySymbol,
  currencyName,
  isThermal,
  isA4,
  batchPositionLabel,
}) => {
  const now = new Date();
  const printDate = payload.date || now.toISOString().split('T')[0];
  const printTime = payload.time || now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const docSerial = sanitizeDisplaySerial(payload.docNumber, '1');
  const branchName = payload.branch || 'الفرع الرئيسي';
  const kind = payload.kind;

  // 1. VOUCHER LAYOUT (Receipt / Payment / Treasury Transfer)
  if (kind === 'receipt_voucher' || kind === 'payment_voucher' || kind === 'treasury_transfer') {
    const isReceipt = kind === 'receipt_voucher';
    const partyLabel =
      payload.partyLabel ||
      (isReceipt ? 'استلمنا من السيد / السادة' : kind === 'payment_voucher' ? 'اصرفوا إلى السيد / السادة' : 'الطرف / الحساب');
    const amountVal = payload.amount !== undefined ? Number(payload.amount) : 0;
    const tafqeetText =
      payload.amountInWords || (amountVal > 0 ? tafqeetNumber(amountVal, currencyName, 'قرش') : '');
    const sigs = payload.signatures && payload.signatures.length > 0 ? payload.signatures : ['المستلم', 'المحاسب', 'الاعتماد'];

    return (
      <DocumentPageShell
        settings={settings}
        title={payload.title}
        dateStr={printDate}
        timeStr={printTime}
        docSerial={docSerial}
        branchName={branchName}
        footerTermsNote={payload.footerTermsNote || 'سند مالي معتمد ومسجل بالدفاتر الرسمية بالنظام'}
        pageIndex={0}
        totalPages={1}
        isA4={isA4}
        isLastPage={true}
        batchPositionLabel={batchPositionLabel}
      >
        <div className="rp-data-cards">
          <div className="rp-card">
            <div className="rp-k">رقم السند</div>
            <div className="rp-v">#{docSerial}</div>
          </div>
          <div className="rp-card">
            <div className="rp-k">المبلغ</div>
            <div className="rp-v">{fmtMoney(amountVal, currencySymbol)}</div>
          </div>
          <div className="rp-card">
            <div className="rp-k">الخزينة / الحساب</div>
            <div className="rp-v" style={{ fontSize: '10pt' }}>
              {payload.treasuryOrBank || 'الخزينة الرئيسية'}
            </div>
          </div>
        </div>

        <div className="rp-section">تفاصيل السند</div>

        <div className="rp-notes">
          <div className="rp-pair" style={{ marginBottom: '2mm', paddingBottom: '1.5mm', borderBottom: '1px dashed #cbd5e1' }}>
            <span>{partyLabel}:</span>
            <b>{payload.partyName || (isReceipt ? 'عميل نقدي' : 'مورد / جهة صرف')}</b>
          </div>
          {payload.partyCode && payload.partyCode !== '-' && (
            <div className="rp-pair" style={{ marginBottom: '1.5mm' }}>
              <span>كود الحساب:</span>
              <b>{payload.partyCode}</b>
            </div>
          )}
          {payload.partyPhone && payload.partyPhone !== '-' && (
            <div className="rp-pair" style={{ marginBottom: '1.5mm' }}>
              <span>الهاتف:</span>
              <b dir="ltr">{payload.partyPhone}</b>
            </div>
          )}
          <div className="rp-pair" style={{ marginBottom: '1.5mm' }}>
            <span>طريقة الدفع:</span>
            <b>{payload.paymentMethod || 'نقدي'}</b>
          </div>
          {payload.referenceNumber && (
            <div className="rp-pair" style={{ marginBottom: '1.5mm' }}>
              <span>رقم المرجع / الفاتورة:</span>
              <b>#{payload.referenceNumber}</b>
            </div>
          )}
          <p style={{ margin: '2mm 0 1mm' }}>
            <b>البيان:</b> {payload.statementOrReason || payload.notes || 'معاملة مالية معتمدة بالنظام'}
          </p>
          {tafqeetText && (
            <p style={{ margin: '1mm 0 0' }}>
              <b>المبلغ كتابةً:</b> {tafqeetText}
            </p>
          )}
        </div>

        <div className="rp-signatures">
          {sigs.slice(0, 3).map((s, idx) => (
            <span key={idx}>{s}</span>
          ))}
        </div>
      </DocumentPageShell>
    );
  }

  // 2. INVOICE & RETURN LAYOUT (Auto-Paginated for A5 & A4; Continuous 80mm on Thermal)
  const isInvoiceKind =
    kind === 'sales_invoice' ||
    kind === 'purchase_invoice' ||
    kind === 'sales_return' ||
    kind === 'purchase_return';

  if (isInvoiceKind) {
    const items = payload.items || [];
    const perPage = isThermal ? items.length || 1 : isA4 ? 22 : 12;
    const chunks = chunkRows(items, perPage);
    const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const netTotal = payload.amount !== undefined ? Number(payload.amount) : 0;
    const subtotal = payload.subtotal !== undefined ? Number(payload.subtotal) : netTotal;
    const discountAmount = Number(payload.discountAmount || 0);
    const taxAmount = Number(payload.taxAmount || 0);
    const extraCharges = Number(payload.extraCharges || 0);
    const paidAmount = payload.paidAmount !== undefined ? Number(payload.paidAmount) : netTotal;
    const remainingAmount =
      payload.remainingAmount !== undefined ? Number(payload.remainingAmount) : Math.max(0, netTotal - paidAmount);
    const isReturnDoc = kind === 'sales_return' || kind === 'purchase_return';
    const isPurchaseDoc = kind === 'purchase_invoice' || kind === 'purchase_return';
    const partyLabel = payload.partyLabel || (isPurchaseDoc ? 'المورد' : 'العميل');
    const partyName = payload.partyName || (isPurchaseDoc ? 'مورد عام' : 'عميل نقدي');
    const tafqeetText =
      payload.amountInWords || (netTotal > 0 ? tafqeetNumber(netTotal, currencyName, 'قرش') : '');
    const footerTerms =
      payload.footerTermsNote ||
      settings.invoiceFooterNote ||
      'البضاعة المباعة ترد وتستبدل خلال 14 يوماً وفقاً لحالتها الأصلية';

    return (
      <>
        {chunks.map((chunk, pageIdx) => {
          const isLastPage = pageIdx === chunks.length - 1;
          const startNum = pageIdx * perPage;
          const densePage = !isThermal && chunk.length >= (isA4 ? 15 : 8);
          return (
            <DocumentPageShell
              key={pageIdx}
              settings={settings}
              title={payload.title}
              dateStr={printDate}
              timeStr={printTime}
              docSerial={docSerial}
              branchName={branchName}
              notes={payload.notes}
              footerTermsNote={footerTerms}
              pageIndex={pageIdx}
              totalPages={chunks.length}
              isA4={isA4}
              isLastPage={isLastPage}
              isCompact={densePage}
              batchPositionLabel={batchPositionLabel}
            >
              {/* 3-Column Metadata Box */}
              <div className="rp-meta">
                <div className="rp-meta-col">
                  <div className="rp-pair">
                    <span>{partyLabel}:</span>
                    <b>{partyName}</b>
                  </div>
                  {payload.partyCode && payload.partyCode !== '-' && (
                    <div className="rp-pair">
                      <span>{payload.partyCodeLabel || 'الكود'}:</span>
                      <b>{payload.partyCode}</b>
                    </div>
                  )}
                  <div className="rp-pair">
                    <span>الهاتف:</span>
                    <b dir="ltr">{payload.partyPhone && payload.partyPhone !== '-' ? payload.partyPhone : '—'}</b>
                  </div>
                  <div className="rp-pair">
                    <span>طريقة الدفع:</span>
                    <b>{payload.paymentMethod || 'نقدي'}</b>
                  </div>
                </div>

                <div className="rp-meta-col rp-meta-center">
                  <div>{payload.title}</div>
                  <div style={{ fontWeight: 600, fontSize: '9.5pt', marginTop: '0.8mm' }}>
                    رقم: {docSerial}
                  </div>
                  {payload.paymentStatus && (
                    <small style={{ fontWeight: 'normal', color: '#334155', marginTop: '0.8mm' }}>
                      {payload.paymentStatus}
                    </small>
                  )}
                  {payload.originalInvoiceNumber !== undefined && payload.originalInvoiceNumber !== '' && (
                    <small style={{ color: '#9b1c1c', fontWeight: 600 }}>
                      أصل #{payload.originalInvoiceNumber}
                      {payload.returnKindLabel ? ` · ${payload.returnKindLabel}` : ''}
                    </small>
                  )}
                </div>

                <div className="rp-meta-col">
                  <div className="rp-pair">
                    <span>التاريخ:</span>
                    <b dir="ltr">{printDate}</b>
                  </div>
                  <div className="rp-pair">
                    <span>الوقت:</span>
                    <b dir="ltr">{printTime}</b>
                  </div>
                  <div className="rp-pair">
                    <span>المستخدم:</span>
                    <b>{payload.user || '—'}</b>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              {isThermal ? (
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'right', width: '44%' }}>الصنف</th>
                      <th style={{ width: '14%' }}>العدد</th>
                      <th style={{ width: '20%' }}>السعر</th>
                      <th style={{ width: '22%' }}>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ color: '#66717d', padding: '4mm' }}>
                          لا توجد أصناف
                        </td>
                      </tr>
                    ) : (
                      chunk.map((it, idx) => (
                        <tr key={idx}>
                          <td className="rp-item-cell">
                            <div>{it.name}</div>
                            {it.notes && it.notes !== '-' && (
                              <div style={{ fontSize: '6.8pt', color: '#66717d', fontWeight: 'normal' }}>
                                {it.notes}
                              </div>
                            )}
                          </td>
                          <td className="rp-num-cell">{it.qty}</td>
                          <td className="rp-num-cell" dir="ltr">{fmtSmart(it.price)}</td>
                          <td className="rp-num-cell" dir="ltr" style={{ fontWeight: 700 }}>
                            {fmtSmart(it.total)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th style={{ width: '6%' }}>م</th>
                      <th style={{ width: '34%' }}>اسم الصنف</th>
                      <th style={{ width: '20%' }}>البيان</th>
                      <th style={{ width: '10%' }}>الكمية</th>
                      <th style={{ width: '14%' }}>السعر</th>
                      <th style={{ width: '16%' }}>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ color: '#66717d', padding: '5mm' }}>
                          لا توجد أصناف في هذه الفاتورة
                        </td>
                      </tr>
                    ) : (
                      chunk.map((it, idx) => {
                        const descText =
                          it.notes && it.notes.trim() !== '' && it.notes.trim() !== '-'
                            ? it.notes.trim()
                            : '';
                        return (
                          <tr key={idx}>
                            <td className="rp-num-cell">{startNum + idx + 1}</td>
                            <td className="rp-item-cell">{it.name}</td>
                            <td>
                              {descText}
                              {Number(it.discount || 0) > 0 && (
                                <div style={{ fontSize: '7.5pt', color: '#9b1c1c' }}>
                                  خصم: {fmtSmart(it.discount)}
                                </div>
                              )}
                            </td>
                            <td className="rp-num-cell">{it.qty}</td>
                            <td className="rp-num-cell" dir="ltr">{fmtMoney(it.price, currencySymbol)}</td>
                            <td className="rp-num-cell" dir="ltr" style={{ fontWeight: 700 }}>
                              {fmtMoney(it.total ?? Number(it.qty) * Number(it.price), currencySymbol)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {/* Left-Aligned Totals Box on Final Page Only (Zero-Remaining Hidden) */}
              {isLastPage && (
                <>
                  <div className="rp-totals-area">
                    <div className="rp-totals">
                      <div className="rp-total-line">
                        <span className="rp-label">إجمالي الأصناف ({fmtSmart(totalQty)} قطعة):</span>
                        <span className="rp-value">{fmtMoney(subtotal, currencySymbol)}</span>
                      </div>
                      {discountAmount > 0.01 && (
                        <div className="rp-total-line">
                          <span className="rp-label">الخصم:</span>
                          <span className="rp-value">-{fmtMoney(discountAmount, currencySymbol)}</span>
                        </div>
                      )}
                      {taxAmount > 0.01 && (
                        <div className="rp-total-line">
                          <span className="rp-label">الضريبة:</span>
                          <span className="rp-value">+{fmtMoney(taxAmount, currencySymbol)}</span>
                        </div>
                      )}
                      {extraCharges > 0.01 && (
                        <div className="rp-total-line">
                          <span className="rp-label">{payload.extraChargesLabel || 'مصاريف إضافية'}:</span>
                          <span className="rp-value">+{fmtMoney(extraCharges, currencySymbol)}</span>
                        </div>
                      )}
                      <div className="rp-total-line rp-main">
                        <span className="rp-label">
                          {isReturnDoc ? 'صافي المرتجع:' : 'الإجمالي المستحق:'}
                        </span>
                        <span className="rp-value">{fmtMoney(netTotal, currencySymbol)}</span>
                      </div>
                      <div className="rp-total-line">
                        <span className="rp-label">{isReturnDoc ? 'المردود نقداً:' : 'المدفوع:'}</span>
                        <span className="rp-value">{fmtMoney(paidAmount, currencySymbol)}</span>
                      </div>
                      {remainingAmount > 0.01 && (
                        <div className="rp-total-line rp-due">
                          <span className="rp-label">
                            {isReturnDoc ? 'المخصوم على الحساب:' : 'المتبقي (دين):'}
                          </span>
                          <span className="rp-value">{fmtMoney(remainingAmount, currencySymbol)}</span>
                        </div>
                      )}
                      {!isThermal &&
                        payload.partyBalanceAfter !== undefined &&
                        Math.abs(payload.partyBalanceAfter) > 0.01 && (
                          <div className="rp-total-line">
                            <span className="rp-label">
                              {isPurchaseDoc ? 'رصيد المورد الحالي:' : 'رصيد العميل الحالي:'}
                            </span>
                            <span className="rp-value">
                              {fmtMoney(Math.abs(payload.partyBalanceAfter), currencySymbol)}{' '}
                              {isPurchaseDoc
                                ? payload.partyBalanceAfter > 0
                                  ? '(له)'
                                  : '(عليه)'
                                : payload.partyBalanceAfter > 0
                                ? '(عليه)'
                                : '(له)'}
                            </span>
                          </div>
                        )}
                    </div>
                  </div>

                  {isA4 && tafqeetText && (
                    <div className="rp-notes" style={{ marginTop: '1mm' }}>
                      <b>المبلغ كتابةً:</b> {tafqeetText}
                    </div>
                  )}
                </>
              )}
            </DocumentPageShell>
          );
        })}
      </>
    );
  }

  // 3. ACCOUNT STATEMENT LAYOUT
  if (kind === 'account_statement') {
    const rows = payload.rows || [];
    const cols = payload.columns || ['التاريخ', 'البيان', 'رقم المستند', 'مدين', 'دائن', 'الرصيد'];
    const perPage = isThermal ? rows.length || 1 : isA4 ? 24 : 13;
    const chunks = chunkRows(rows, perPage);
    const opening = payload.openingBalance !== undefined ? Number(payload.openingBalance) : 0;
    const totalDeb = payload.totalDebit !== undefined ? Number(payload.totalDebit) : 0;
    const totalCred = payload.totalCredit !== undefined ? Number(payload.totalCredit) : 0;
    const closing =
      payload.closingBalance !== undefined
        ? Number(payload.closingBalance)
        : payload.amount !== undefined
        ? Number(payload.amount)
        : 0;
    const movementVal = totalDeb + totalCred;
    const sigs = payload.signatures && payload.signatures.length > 0 ? payload.signatures : ['المحاسب', 'المراجعة', 'الاعتماد'];

    return (
      <>
        {chunks.map((chunk, pageIdx) => {
          const isLastPage = pageIdx === chunks.length - 1;
          const densePage = !isThermal && chunk.length >= (isA4 ? 15 : 8);
          return (
            <DocumentPageShell
              key={pageIdx}
              settings={settings}
              title={payload.title}
              dateStr={printDate}
              timeStr={printTime}
              docSerial={docSerial}
              branchName={branchName}
              notes={payload.notes}
              footerTermsNote={payload.footerTermsNote || 'كشف حساب مستخرج ومطابق للقيود المسجلة بالنظام'}
              pageIndex={pageIdx}
              totalPages={chunks.length}
              isA4={isA4}
              isLastPage={isLastPage}
              isCompact={densePage}
              batchPositionLabel={batchPositionLabel}
            >
              {/* Statement Party & Period Strip */}
              <div className="rp-meta">
                <div className="rp-meta-col">
                  <div className="rp-pair">
                    <span>{payload.partyLabel || 'الحساب'}:</span>
                    <b>{payload.partyName || '—'}</b>
                  </div>
                  {payload.partyCode && payload.partyCode !== '-' && (
                    <div className="rp-pair">
                      <span>الكود:</span>
                      <b>{payload.partyCode}</b>
                    </div>
                  )}
                  {payload.partyPhone && payload.partyPhone !== '-' && (
                    <div className="rp-pair">
                      <span>الهاتف:</span>
                      <b dir="ltr">{payload.partyPhone}</b>
                    </div>
                  )}
                </div>

                <div className="rp-meta-col rp-meta-center">
                  <div>{payload.title}</div>
                  {payload.period && (payload.period.from || payload.period.to) && (
                    <small style={{ fontWeight: 'normal', color: '#334155', marginTop: '1mm' }}>
                      من {payload.period.from || 'البداية'} إلى {payload.period.to || printDate}
                    </small>
                  )}
                </div>

                <div className="rp-meta-col">
                  <div className="rp-pair">
                    <span>تاريخ الطباعة:</span>
                    <b dir="ltr">{printDate}</b>
                  </div>
                  <div className="rp-pair">
                    <span>الوقت:</span>
                    <b dir="ltr">{printTime}</b>
                  </div>
                  <div className="rp-pair">
                    <span>عدد الحركات:</span>
                    <b>{rows.length}</b>
                  </div>
                </div>
              </div>

              {pageIdx === 0 && (
                <div className="rp-data-cards">
                  <div className="rp-card">
                    <div className="rp-k">رصيد سابق</div>
                    <div className="rp-v">{fmtMoney(opening, currencySymbol)}</div>
                  </div>
                  <div className="rp-card">
                    <div className="rp-k">إجمالي الحركة</div>
                    <div className="rp-v">{fmtMoney(movementVal, currencySymbol)}</div>
                  </div>
                  <div className="rp-card">
                    <div className="rp-k">الرصيد النهائي</div>
                    <div className="rp-v">{fmtMoney(closing, currencySymbol)}</div>
                  </div>
                </div>
              )}

              <div className="rp-section">كشف حركة الحساب</div>

              {isThermal && cols.length > 4 ? (
                <ThermalLedgerRows
                  cols={cols}
                  rows={chunk}
                  emptyText="لا توجد حركات مسجلة خلال هذه الفترة"
                />
              ) : (
                <table className={getTableWidthClass(cols.length)}>
                  <thead>
                    <tr>
                      {cols.map((c, idx) => (
                        <th key={idx}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.length === 0 ? (
                      <tr>
                        <td colSpan={cols.length} style={{ color: '#66717d', padding: '5mm' }}>
                          لا توجد حركات مسجلة خلال هذه الفترة
                        </td>
                      </tr>
                    ) : (
                      chunk.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {cols.map((colHeader, cIdx) => {
                            const cellVal = row[cIdx];
                            const meta = getReportCellMeta(colHeader, cellVal, cIdx, cols.length);
                            return (
                              <td
                                key={cIdx}
                                className={meta.className}
                                dir={meta.dir}
                              >
                                {cellVal !== null && cellVal !== undefined ? cellVal : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {isLastPage && (
                <>
                  <div className="rp-totals-area">
                    <div className="rp-totals">
                      <div className="rp-total-line">
                        <span className="rp-label">رصيد سابق:</span>
                        <span className="rp-value">{fmtMoney(opening, currencySymbol)}</span>
                      </div>
                      <div className="rp-total-line">
                        <span className="rp-label">إجمالي المدين (+):</span>
                        <span className="rp-value">{fmtMoney(totalDeb, currencySymbol)}</span>
                      </div>
                      <div className="rp-total-line">
                        <span className="rp-label">إجمالي الدائن (-):</span>
                        <span className="rp-value">{fmtMoney(totalCred, currencySymbol)}</span>
                      </div>
                      <div className={`rp-total-line rp-main ${Math.abs(closing) > 0.01 ? 'rp-due' : ''}`}>
                        <span className="rp-label">الرصيد النهائي:</span>
                        <span className="rp-value">
                          {fmtMoney(closing, currencySymbol)}
                          {Math.abs(closing) > 0.01 ? (closing > 0 ? ' (مدين)' : ' (دائن)') : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isA4 && (
                    <div className="rp-signatures">
                      {sigs.slice(0, 3).map((s, idx) => (
                        <span key={idx}>{s}</span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </DocumentPageShell>
          );
        })}
      </>
    );
  }

  // 4. SHIFT CLOSING & DAILY CLOSING LAYOUT
  if (kind === 'shift_closing') {
    const m = payload.shiftMetrics || {
      opening: 0,
      cashSales: 0,
      receipts: 0,
      payments: 0,
      profit: 0,
      expected: payload.amount || 0,
      actual: payload.amount || 0,
      variance: 0,
    };
    const variance = Number((m.actual ?? m.expected) - m.expected);
    const rows = payload.rows || [];
    const cols = payload.columns || ['الحركة', 'القيمة', 'ملاحظات'];
    const perPage = isThermal ? rows.length || 1 : isA4 ? 22 : 11;
    const chunks = chunkRows(rows, perPage);
    const sigs = payload.signatures && payload.signatures.length > 0 ? payload.signatures : ['أمين الخزينة / الكاشير', 'المراجع المالي', 'الاعتماد'];

    const shiftCards = [
      { k: 'رصيد بداية الخزينة', v: fmtMoney(m.opening, currencySymbol) },
      { k: 'مبيعات نقدية', v: fmtMoney(m.cashSales, currencySymbol) },
      { k: 'تحصيلات', v: fmtMoney(m.receipts, currencySymbol) },
      { k: 'مدفوعات / مصروفات', v: fmtMoney(m.payments, currencySymbol) },
      { k: 'صافي الربح', v: fmtMoney(m.profit, currencySymbol) },
      { k: 'الرصيد المتوقع', v: fmtMoney(m.expected, currencySymbol) },
    ];

    return (
      <>
        {chunks.map((chunk, pageIdx) => {
          const isLastPage = pageIdx === chunks.length - 1;
          const densePage = !isThermal && chunk.length >= (isA4 ? 14 : 7);
          return (
            <DocumentPageShell
              key={pageIdx}
              settings={settings}
              title={payload.title}
              dateStr={printDate}
              timeStr={printTime}
              docSerial={docSerial}
              branchName={branchName}
              notes={payload.notes}
              footerTermsNote={payload.footerTermsNote || 'تقرير إغلاق وردية ويومية معتمد ومطابق لحركة الخزينة'}
              pageIndex={pageIdx}
              totalPages={chunks.length}
              isA4={isA4}
              isLastPage={isLastPage}
              isCompact={densePage}
              batchPositionLabel={batchPositionLabel}
            >
              <div className="rp-meta">
                <div className="rp-meta-col">
                  <div className="rp-pair">
                    <span>{payload.partyLabel || 'المسؤول'}:</span>
                    <b>{payload.partyName || payload.user || 'كاشير الوردية'}</b>
                  </div>
                  <div className="rp-pair">
                    <span>الفرع:</span>
                    <b>{branchName}</b>
                  </div>
                </div>
                <div className="rp-meta-col rp-meta-center">
                  <div>{payload.title}</div>
                  <small style={{ fontWeight: 'normal', color: '#334155' }}>مرجع: #{docSerial}</small>
                </div>
                <div className="rp-meta-col">
                  <div className="rp-pair">
                    <span>التاريخ:</span>
                    <b dir="ltr">{printDate}</b>
                  </div>
                  <div className="rp-pair">
                    <span>الوقت:</span>
                    <b dir="ltr">{printTime}</b>
                  </div>
                </div>
              </div>

              {pageIdx === 0 && (
                <div className="rp-data-cards">
                  {shiftCards.map((c, idx) => (
                    <div key={idx} className="rp-card">
                      <div className="rp-k">{c.k}</div>
                      <div className="rp-v">{c.v}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rp-section">حركات الوردية واليومية</div>

              {isThermal && cols.length > 4 ? (
                <ThermalLedgerRows
                  cols={cols}
                  rows={chunk}
                  emptyText="لا توجد حركات مسجلة خلال هذا اليوم"
                />
              ) : (
                <table className={getTableWidthClass(cols.length)}>
                  <thead>
                    <tr>
                      {cols.map((c, idx) => (
                        <th key={idx}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.length === 0 ? (
                      <tr>
                        <td colSpan={cols.length} style={{ color: '#66717d', padding: '4mm' }}>
                          لا توجد حركات مسجلة خلال هذا اليوم
                        </td>
                      </tr>
                    ) : (
                      chunk.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {cols.map((colHeader, cIdx) => {
                            const cellVal = row[cIdx];
                            const meta = getReportCellMeta(colHeader, cellVal, cIdx, cols.length);
                            return (
                              <td key={cIdx} className={meta.className} dir={meta.dir}>
                                {cellVal !== null && cellVal !== undefined ? cellVal : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {isLastPage && (
                <>
                  <div className="rp-totals-area">
                    <div className="rp-totals">
                      <div className="rp-total-line">
                        <span className="rp-label">الرصيد المتوقع:</span>
                        <span className="rp-value">{fmtMoney(m.expected, currencySymbol)}</span>
                      </div>
                      <div className="rp-total-line">
                        <span className="rp-label">الرصيد الفعلي:</span>
                        <span className="rp-value">{fmtMoney(m.actual ?? m.expected, currencySymbol)}</span>
                      </div>
                      <div
                        className={`rp-total-line rp-main ${
                          variance < -0.01 ? 'rp-deficit' : variance > 0.01 ? 'rp-surplus' : ''
                        }`}
                      >
                        <span className="rp-label">العجز / الزيادة:</span>
                        <span className="rp-value">{fmtMoney(variance, currencySymbol)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rp-signatures">
                    {sigs.slice(0, 3).map((s, idx) => (
                      <span key={idx}>{s}</span>
                    ))}
                  </div>
                </>
              )}
            </DocumentPageShell>
          );
        })}
      </>
    );
  }

  // 5. ALL SYSTEM REPORTS, DIRECTORIES, INVENTORY, STOCKTAKE, SETTLEMENTS, CLOSING, JOURNALS, FINANCIAL STATEMENTS
  const rows = payload.rows || [];
  const cols = payload.columns || ['البند', 'التفاصيل', 'القيمة'];
  const perPage = isThermal ? rows.length || 1 : isA4 ? 24 : 12;
  const chunks = chunkRows(rows, perPage);
  const visibleSummaries = (payload.summaries || []).filter((s) => {
    const lbl = s.label || '';
    if ((lbl.includes('متبقي') || lbl.includes('المتبقي') || lbl.includes('مديونية')) && Math.abs(parseNumericValue(s.value)) <= 0.01) {
      return false;
    }
    return true;
  });

  return (
    <>
      {chunks.map((chunk, pageIdx) => {
        const isLastPage = pageIdx === chunks.length - 1;
        const densePage = !isThermal && (chunk.length >= (isA4 ? 15 : 7) || cols.length >= 6);
        return (
          <DocumentPageShell
            key={pageIdx}
            settings={settings}
            title={payload.title}
            dateStr={printDate}
            timeStr={printTime}
            docSerial={docSerial}
            branchName={branchName}
            notes={payload.notes}
            footerTermsNote={payload.footerTermsNote || 'تم استخراج هذا المستند آلياً من السجلات المحاسبية المعتمدة بالنظام'}
            pageIndex={pageIdx}
            totalPages={chunks.length}
            isA4={isA4}
            isLastPage={isLastPage}
            isCompact={densePage}
            batchPositionLabel={batchPositionLabel}
          >
            {/* Scope / Report Metadata Box */}
            <div className="rp-meta">
              <div className="rp-meta-col">
                <div className="rp-pair">
                  <span>الفرع / النطاق:</span>
                  <b>{branchName}</b>
                </div>
                {payload.partyName && (
                  <div className="rp-pair">
                    <span>{payload.partyLabel || 'الجهة'}:</span>
                    <b>{payload.partyName}</b>
                  </div>
                )}
                {payload.user && (
                  <div className="rp-pair">
                    <span>المسؤول:</span>
                    <b>{payload.user}</b>
                  </div>
                )}
              </div>

              <div className="rp-meta-col rp-meta-center">
                <div>{payload.title}</div>
                {payload.subTitle && payload.subTitle !== payload.title && (
                  <small style={{ fontWeight: 'normal', color: '#334155', marginTop: '0.5mm' }}>
                    {payload.subTitle}
                  </small>
                )}
                <small style={{ fontWeight: 'normal', color: '#66717d' }}>مرجع: #{docSerial}</small>
              </div>

              <div className="rp-meta-col">
                <div className="rp-pair">
                  <span>التاريخ:</span>
                  <b dir="ltr">{printDate}</b>
                </div>
                <div className="rp-pair">
                  <span>الوقت:</span>
                  <b dir="ltr">{printTime}</b>
                </div>
                {payload.period && (payload.period.from || payload.period.to) && (
                  <div className="rp-pair">
                    <span>الفترة:</span>
                    <b dir="ltr">
                      {payload.period.from || '-'} : {payload.period.to || '-'}
                    </b>
                  </div>
                )}
                <div className="rp-pair">
                  <span>السجلات:</span>
                  <b>{rows.length}</b>
                </div>
              </div>
            </div>

            {pageIdx === 0 && payload.kpis && payload.kpis.length > 0 && (
              <div
                className={`rp-data-cards${payload.kpis.length >= 4 ? ' rp-cards-4' : ''}`}
                style={
                  !isThermal
                    ? {
                        gridTemplateColumns:
                          payload.kpis.length === 4
                            ? 'repeat(4, 1fr)'
                            : payload.kpis.length === 2
                            ? 'repeat(2, 1fr)'
                            : 'repeat(3, 1fr)',
                      }
                    : undefined
                }
              >
                {payload.kpis.map((k, i) => (
                  <div key={i} className="rp-card">
                    <div className="rp-k">{k.title}</div>
                    <div className="rp-v">{k.value}</div>
                  </div>
                ))}
              </div>
            )}

            {pageIdx === 0 && payload.statementOrReason && (
              <div className="rp-notes">{payload.statementOrReason}</div>
            )}

            <div className="rp-section">{payload.subTitle || payload.title}</div>

            {isThermal && cols.length > 4 ? (
              <ThermalLedgerRows
                cols={cols}
                rows={chunk}
                emptyText="لا توجد بيانات متاحة لهذا التقرير"
              />
            ) : (
              <table className={getTableWidthClass(cols.length)}>
                <thead>
                  <tr>
                    {cols.map((c, idx) => (
                      <th key={idx}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chunk.length === 0 ? (
                    <tr>
                      <td colSpan={cols.length} style={{ color: '#66717d', padding: '5mm' }}>
                        لا توجد بيانات متاحة لهذا التقرير
                      </td>
                    </tr>
                  ) : (
                    chunk.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {cols.map((colHeader, cIdx) => {
                          const cell = row[cIdx];
                          const meta = getReportCellMeta(colHeader, cell, cIdx, cols.length);
                          return (
                            <td
                              key={cIdx}
                              className={meta.className}
                              dir={meta.dir}
                            >
                              {cell !== null && cell !== undefined ? cell : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {isLastPage && (
              <>
                {visibleSummaries.length > 0 && (
                  <div className="rp-totals-area">
                    <div className="rp-totals">
                      {visibleSummaries.map((s, idx) => (
                        <div
                          key={idx}
                          className={`rp-total-line ${s.isTotal ? 'rp-main' : ''} ${
                            s.isHighlight && !s.isTotal ? 'rp-due' : ''
                          }`}
                        >
                          <span className="rp-label">{s.label}:</span>
                          <span className="rp-value">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {payload.signatures && payload.signatures.length > 0 && (
                  <div className="rp-signatures">
                    {payload.signatures.slice(0, 3).map((sig, idx) => (
                      <span key={idx}>{sig}</span>
                    ))}
                  </div>
                )}
              </>
            )}
          </DocumentPageShell>
        );
      })}
    </>
  );
};

/* ============================================================================
 * Batch Summary Cover/Closing Sheet
 * ============================================================================ */

const BatchSummaryPages: React.FC<{
  summary: UniversalBatchSummary;
  settings: Settings;
  isThermal: boolean;
  isA4: boolean;
}> = ({ summary, settings, isThermal, isA4 }) => {
  const rows = summary.rows || [];
  const cols = summary.columns || ['#', 'التاريخ', 'التصنيف', 'الطرف', 'الحالة', 'الإجمالي', 'المدفوع'];
  const perPage = isThermal ? rows.length || 1 : isA4 ? 24 : 12;
  const chunks = chunkRows(rows, perPage);
  const nowStr = new Date().toISOString().split('T')[0];

  return (
    <>
      {chunks.map((chunk, pageIdx) => {
        const isLastPage = pageIdx === chunks.length - 1;
        const densePage = !isThermal && (chunk.length >= (isA4 ? 15 : 8) || cols.length >= 6);
        return (
          <DocumentPageShell
            key={pageIdx}
            settings={settings}
            title={summary.title}
            dateStr={nowStr}
            timeStr=""
            docSerial={`${rows.length}`}
            footerTermsNote={summary.footerNotes?.join(' · ') || 'ملخص السجل المجمع للمستندات'}
            pageIndex={pageIdx}
            totalPages={chunks.length}
            isA4={isA4}
            isLastPage={isLastPage}
            isCompact={densePage}
          >
            {pageIdx === 0 && summary.kpis.length > 0 && (
              <div
                className={`rp-data-cards${summary.kpis.length >= 4 ? ' rp-cards-4' : ''}`}
                style={
                  !isThermal
                    ? {
                        gridTemplateColumns:
                          summary.kpis.length === 4
                            ? 'repeat(4, 1fr)'
                            : summary.kpis.length === 2
                            ? 'repeat(2, 1fr)'
                            : 'repeat(3, 1fr)',
                      }
                    : undefined
                }
              >
                {summary.kpis.map((k, idx) => (
                  <div key={idx} className="rp-card">
                    <div className="rp-k">{k.title}</div>
                    <div className="rp-v">{k.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="rp-section">{summary.subtitle || summary.title}</div>

            {isThermal && cols.length > 4 ? (
              <ThermalLedgerRows
                cols={cols}
                rows={chunk}
                emptyText="لا توجد مستندات"
              />
            ) : (
              <table className={getTableWidthClass(cols.length)}>
                <thead>
                  <tr>
                    {cols.map((c, idx) => (
                      <th key={idx}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {cols.map((colHeader, cIdx) => {
                        const cellVal = row[cIdx];
                        const meta = getReportCellMeta(colHeader, cellVal, cIdx, cols.length);
                        return (
                          <td key={cIdx} className={meta.className} dir={meta.dir}>
                            {cellVal !== null && cellVal !== undefined ? cellVal : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DocumentPageShell>
        );
      })}
    </>
  );
};

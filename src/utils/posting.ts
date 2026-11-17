import { AppData, SaleInvoice, PurchaseInvoice } from '../types';
import {
  mapPaymentMethodToKey,
  getPaymentMethodLabel,
  processSaleInvoice,
  processPurchaseInvoice,
  deleteSaleInvoice as engineDeleteSaleInvoice,
  deletePurchaseInvoice as engineDeletePurchaseInvoice,
} from './accountingEngine';

/**
 * 🏛️ محرك الترحيل المحاسبي الموحد لمنظومة ركيزة (RAKEEZA Posting Bridge)
 * يفوض جميع عمليات الترحيل والحذف إلى accountingEngine لضمان التوازن المزدوج وعدم التكرار.
 */

export { mapPaymentMethodToKey, getPaymentMethodLabel };

export function postSaleInvoice(
  appData: AppData,
  invoice: SaleInvoice,
  isEditing: boolean = false,
  oldInvoiceId?: number
): AppData {
  return processSaleInvoice(appData, invoice, isEditing, oldInvoiceId);
}

export function postPurchaseInvoice(
  appData: AppData,
  invoice: PurchaseInvoice,
  isEditing: boolean = false,
  oldInvoiceId?: number
): AppData {
  return processPurchaseInvoice(appData, invoice, isEditing, oldInvoiceId);
}

export function deleteSaleInvoice(appData: AppData, invoiceId: number | string): AppData {
  return engineDeleteSaleInvoice(appData, invoiceId);
}

export function deletePurchaseInvoice(appData: AppData, invoiceId: number | string): AppData {
  return engineDeletePurchaseInvoice(appData, invoiceId);
}

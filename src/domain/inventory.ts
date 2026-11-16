/**
 * src/domain/inventory.ts
 * Pure inventory business logic for "سوق المستلزمات الطبية" (Iraq).
 * No React, no storage, no external dependencies.
 */
import { AppError, Batch, Product, StockMovement } from './types';

/**
 * Calculate quantity on hand for a product across all movements
 */
export function calculateQuantityOnHand(productId: string, movements: StockMovement[]): number {
  return movements
    .filter((m) => m.productId === productId)
    .reduce((sum, m) => sum + m.quantity, 0);
}

/**
 * Calculate quantity on hand for a specific batch across all movements
 */
export function calculateBatchQuantityOnHand(batchId: string, movements: StockMovement[]): number {
  return movements
    .filter((m) => m.batchId === batchId)
    .reduce((sum, m) => sum + m.quantity, 0);
}

/**
 * Helper: compute days remaining until expiry
 */
export function calculateDaysToExpiry(expiryDateStr: string, fromDate: Date = new Date()): number {
  if (!expiryDateStr) return 9999;
  const expiry = new Date(expiryDateStr);
  if (isNaN(expiry.getTime())) return 9999;

  const current = new Date(fromDate);
  expiry.setHours(0, 0, 0, 0);
  current.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - current.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export interface BatchAllocation {
  batchId: string;
  lotNumber: string;
  warehouseId: string;
  expiryDate: string;
  quantity: number;
}

export interface PickResult {
  allocations: BatchAllocation[];
  fulfilledQty: number;
  unfulfilledQty: number;
}

/**
 * Earliest-Expiry-First (FEFO) batch picker with manual override support.
 * Allocates from the earliest-expiring batch first with available positive stock.
 */
export function pickBatchesFEFO(
  batches: Array<Batch & { quantityOnHand: number }>,
  requestedQty: number,
  manualBatchId?: string
): PickResult {
  if (requestedQty <= 0) {
    return { allocations: [], fulfilledQty: 0, unfulfilledQty: 0 };
  }

  // 1. Manual override: allocate strictly from the specified batch first
  if (manualBatchId) {
    const chosen = batches.find((b) => b.id === manualBatchId);
    if (!chosen) {
      throw new AppError('BATCH_NOT_FOUND', 'الوجبة المحددة يدوياً غير موجودة في المستودع');
    }
    const allocQty = Math.min(requestedQty, Math.max(0, chosen.quantityOnHand));
    const allocations: BatchAllocation[] = [];
    if (allocQty > 0) {
      allocations.push({
        batchId: chosen.id,
        lotNumber: chosen.lotNumber,
        warehouseId: chosen.warehouseId,
        expiryDate: chosen.expiryDate,
        quantity: allocQty,
      });
    }
    return {
      allocations,
      fulfilledQty: allocQty,
      unfulfilledQty: requestedQty - allocQty,
    };
  }

  // 2. Default FEFO: sort by expiry date ascending (earliest first)
  const sortedBatches = [...batches]
    .filter((b) => b.quantityOnHand > 0)
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

  let remaining = requestedQty;
  const allocations: BatchAllocation[] = [];

  for (const b of sortedBatches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, b.quantityOnHand);
    if (take > 0) {
      allocations.push({
        batchId: b.id,
        lotNumber: b.lotNumber,
        warehouseId: b.warehouseId,
        expiryDate: b.expiryDate,
        quantity: take,
      });
      remaining -= take;
    }
  }

  return {
    allocations,
    fulfilledQty: requestedQty - remaining,
    unfulfilledQty: Math.max(0, remaining),
  };
}

/**
 * Guard against negative stock unless allowNegativeStock is explicitly enabled
 */
export function guardNegativeStock(
  currentOnHand: number,
  requestedQty: number,
  allowNegativeStock: boolean,
  productName: string = 'المادة'
): void {
  if (requestedQty > currentOnHand && !allowNegativeStock) {
    throw new AppError(
      'INSUFFICIENT_STOCK',
      `الكمية المطلوبة (${requestedQty}) تتجاوز الرصيد المتوفر في المستودع لـ "${productName}" (الرصيد المتاح: ${currentOnHand}). غير مسموح بالبيع برصيد سالب.`
    );
  }
}

/**
 * Weighted-Average Cost (WAC) calculation upon receiving new inventory
 */
export function updateWeightedAverageCost(
  currentOnHand: number,
  currentAvgCost: number,
  incomingQty: number,
  incomingPurchasePrice: number
): number {
  if (incomingQty <= 0) return currentAvgCost;

  // If current on hand is 0 or negative, new cost is the incoming purchase price
  if (currentOnHand <= 0) {
    return Math.round(incomingPurchasePrice);
  }

  const currentTotalValue = currentOnHand * currentAvgCost;
  const incomingTotalValue = incomingQty * incomingPurchasePrice;
  const newTotalQty = currentOnHand + incomingQty;

  if (newTotalQty <= 0) return incomingPurchasePrice;

  return Math.round((currentTotalValue + incomingTotalValue) / newTotalQty);
}

/**
 * Low stock detection against reorder level
 */
export function isLowStock(quantityOnHand: number, reorderLevel: number): boolean {
  return quantityOnHand <= reorderLevel;
}

/**
 * Near expiry detection against configured warning days (default 90)
 */
export function checkExpiryStatus(
  expiryDateStr: string,
  warningDays: number = 90,
  referenceDate: Date = new Date()
): { isNearExpiry: boolean; isExpired: boolean; daysLeft: number } {
  const daysLeft = calculateDaysToExpiry(expiryDateStr, referenceDate);
  return {
    isNearExpiry: daysLeft <= warningDays && daysLeft > 0,
    isExpired: daysLeft <= 0,
    daysLeft,
  };
}

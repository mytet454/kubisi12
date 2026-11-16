/**
 * src/domain/market.test.ts
 * Pure unit tests for Step 6 Market matching, sorting, and stock warning logic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateOfferStock,
  getNextOrderStatus,
  matchApprovedMerchantsForRequest,
  normalizeArabicText,
  sortOffersByPrice,
  validateComplaintStatusTransition,
  validateOrderStatusTransition,
} from './market';
import { AppError, Offer, Office, Product, StockMovement } from './types';

test('normalizeArabicText handles Arabic variants cleanly', () => {
  assert.equal(normalizeArabicText('كمّامات طبية معقّمة'), 'كمامات طبيه معقمه');
  assert.equal(normalizeArabicText('أربيل - إدارة'), 'اربيل اداره');
});

test('matchApprovedMerchantsForRequest excludes pending/rejected offices and ranks by product, price, and city', () => {
  const offices: Office[] = [
    {
      id: 'off_bg',
      name: 'مكتب الرافدين',
      city: 'بغداد - السعدون',
      phone: '07701',
      status: 'approved',
      nearExpiryDays: 90,
      defaultReorderLevel: 20,
      allowNegativeStock: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'off_bs',
      name: 'شركة شط العرب',
      city: 'البصرة - العشار',
      phone: '07801',
      status: 'approved',
      nearExpiryDays: 90,
      defaultReorderLevel: 20,
      allowNegativeStock: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'off_pending',
      name: 'مكتب غير معتمد',
      city: 'بغداد - الكرخ',
      phone: '07709',
      status: 'pending',
      nearExpiryDays: 90,
      defaultReorderLevel: 20,
      allowNegativeStock: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  const products: Product[] = [
    {
      id: 'p_bg',
      officeId: 'off_bg',
      name: 'قفازات فحص طبية لاتكس',
      unit: 'علبة',
      purchasePrice: 4000,
      salePrice: 6000,
      reorderLevel: 10,
      avgCost: 4000,
      active: true,
    },
    {
      id: 'p_bs',
      officeId: 'off_bs',
      name: 'قفازات جراحية معقمة',
      unit: 'علبة',
      purchasePrice: 8000,
      salePrice: 12000,
      reorderLevel: 10,
      avgCost: 8000,
      active: true,
    },
    {
      id: 'p_pending',
      officeId: 'off_pending',
      name: 'قفازات فحص طبية لاتكس',
      unit: 'علبة',
      purchasePrice: 3000,
      salePrice: 4000,
      reorderLevel: 10,
      avgCost: 3000,
      active: true,
    },
  ];

  const movements: StockMovement[] = [
    {
      id: 'm1',
      officeId: 'off_bg',
      type: 'purchase',
      productId: 'p_bg',
      batchId: 'b1',
      warehouseId: 'w1',
      quantity: 50,
      refType: 'init',
      refId: 's1',
      date: '2026-01-01T00:00:00Z',
      userId: 'u1',
    },
    {
      id: 'm2',
      officeId: 'off_bs',
      type: 'purchase',
      productId: 'p_bs',
      batchId: 'b2',
      warehouseId: 'w2',
      quantity: 50,
      refType: 'init',
      refId: 's2',
      date: '2026-01-01T00:00:00Z',
      userId: 'u2',
    },
    {
      id: 'm3',
      officeId: 'off_pending',
      type: 'purchase',
      productId: 'p_pending',
      batchId: 'b3',
      warehouseId: 'w3',
      quantity: 100,
      refType: 'init',
      refId: 's3',
      date: '2026-01-01T00:00:00Z',
      userId: 'u3',
    },
  ];

  const matches = matchApprovedMerchantsForRequest(
    {
      productName: 'قفازات فحص طبية',
      quantity: 20,
      targetPrice: 7000,
      deliveryCity: 'بغداد',
    },
    offices,
    products,
    movements
  );

  assert.equal(matches.some((m) => m.officeId === 'off_pending'), false);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].officeId, 'off_bg');
  assert.ok(matches[0].reasonAr.includes('بغداد'));
  assert.ok(matches[0].reasonAr.includes('ضمن السعر المستهدف'));
});

test('sortOffersByPrice sorts offers ascending and evaluateOfferStock flags shortages', () => {
  const offers: Offer[] = [
    {
      id: 'o1',
      requestId: 'r1',
      officeId: 'off_1',
      officeName: 'مكتب ١',
      officeCity: 'بغداد',
      price: 9500,
      availableQuantity: 30,
      deliveryTime: '24 ساعة',
      validity: '2026-12-31',
      status: 'pending',
      createdByUserId: 'u1',
      createdAt: '2026-02-01T10:00:00Z',
    },
    {
      id: 'o2',
      requestId: 'r1',
      officeId: 'off_2',
      officeName: 'مكتب ٢',
      officeCity: 'البصرة',
      price: 7500,
      availableQuantity: 30,
      deliveryTime: '48 ساعة',
      validity: '2026-12-31',
      status: 'pending',
      createdByUserId: 'u2',
      createdAt: '2026-02-01T11:00:00Z',
    },
  ];

  const sorted = sortOffersByPrice(offers);
  assert.equal(sorted[0].id, 'o2');
  assert.equal(sorted[1].id, 'o1');

  const prod: Product = {
    id: 'p1',
    officeId: 'off_1',
    name: 'كمامات N95',
    unit: 'قطعة',
    purchasePrice: 1000,
    salePrice: 1500,
    reorderLevel: 10,
    avgCost: 1000,
    active: true,
  };
  const movs: StockMovement[] = [
    {
      id: 'm1',
      officeId: 'off_1',
      type: 'purchase',
      productId: 'p1',
      batchId: 'b1',
      warehouseId: 'w1',
      quantity: 12,
      refType: 'init',
      refId: 's1',
      date: '2026-01-01T00:00:00Z',
      userId: 'u1',
    },
  ];

  const shortCheck = evaluateOfferStock(prod, 25, movs);
  assert.equal(shortCheck.sufficient, false);
  assert.equal(shortCheck.availableQuantity, 12);
  assert.equal(shortCheck.shortage, 13);
  assert.ok(shortCheck.warningMessageAr?.includes('13'));

  const okCheck = evaluateOfferStock(prod, 10, movs);
  assert.equal(okCheck.sufficient, true);
  assert.equal(okCheck.shortage, 0);
});

test('order status machine enforces strict sequence and rejects invalid jumps', () => {
  assert.equal(getNextOrderStatus('confirmed'), 'preparing');
  assert.equal(getNextOrderStatus('preparing'), 'shipped');
  assert.equal(getNextOrderStatus('shipped'), 'delivered');
  assert.equal(getNextOrderStatus('delivered'), null);

  validateOrderStatusTransition('confirmed', 'preparing');
  validateOrderStatusTransition('preparing', 'shipped');
  validateOrderStatusTransition('shipped', 'delivered');

  assert.throws(
    () => validateOrderStatusTransition('confirmed', 'shipped'),
    (err: unknown) => err instanceof AppError && err.code === 'INVALID_STATUS_TRANSITION'
  );
  assert.throws(
    () => validateOrderStatusTransition('shipped', 'preparing'),
    (err: unknown) => err instanceof AppError && err.code === 'INVALID_STATUS_TRANSITION'
  );
  assert.throws(
    () => validateOrderStatusTransition('delivered', 'shipped'),
    (err: unknown) => err instanceof AppError && err.code === 'INVALID_STATUS_TRANSITION'
  );
});

test('complaint status machine enforces open -> in_review -> resolved -> customer_confirmed', () => {
  validateComplaintStatusTransition('open', 'in_review');
  validateComplaintStatusTransition('in_review', 'resolved');
  validateComplaintStatusTransition('resolved', 'customer_confirmed');

  assert.throws(
    () => validateComplaintStatusTransition('open', 'resolved'),
    (err: unknown) => err instanceof AppError && err.code === 'INVALID_STATUS_TRANSITION'
  );
  assert.throws(
    () => validateComplaintStatusTransition('open', 'customer_confirmed'),
    (err: unknown) => err instanceof AppError && err.code === 'INVALID_STATUS_TRANSITION'
  );
  assert.throws(
    () => validateComplaintStatusTransition('customer_confirmed', 'open'),
    (err: unknown) => err instanceof AppError && err.code === 'INVALID_STATUS_TRANSITION'
  );
});

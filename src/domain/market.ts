/**
 * src/domain/market.ts
 * Pure domain logic for Step 6 — The Market (Smart Matching, Offer Sorting, Stock Check).
 * Zero React or storage dependencies.
 */
import { calculateQuantityOnHand } from './inventory';
import {
  AppError,
  ComplaintStatus,
  MarketOrderStatus,
  Offer,
  Office,
  Product,
  RequestMatch,
  StockMovement,
} from './types';

const ARABIC_STOPWORDS = new Set([
  'في',
  'من',
  'على',
  'او',
  'و',
  'مع',
  'عن',
  'الي',
  'الى',
  'علبه',
  'علبة',
  'باكيت',
  'كيس',
  'قطعه',
  'قطعة',
  'طبي',
  'طبيه',
  'طبية',
  'معقم',
  'معقمه',
  'معقمة',
]);

/**
 * Normalize Arabic & ASCII text for tolerant search and smart matching.
 */
export function normalizeArabicText(input: string): string {
  return (input || '')
    .replace(/[\u064B-\u065F\u0670]/g, '') // strip harakat
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeMedicalTerms(input: string): string[] {
  const normalized = normalizeArabicText(input);
  if (!normalized) return [];
  const rawTokens = normalized.split(' ').filter((t) => t.length >= 2);
  const meaningful = rawTokens.filter((t) => !ARABIC_STOPWORDS.has(t));
  return meaningful.length > 0 ? meaningful : rawTokens;
}

function tokenMatchScore(reqTokens: string[], prodTokens: string[], reqNorm: string, prodNorm: string): {
  score: number;
  matchedTerms: string[];
} {
  if (!reqNorm || !prodNorm) return { score: 0, matchedTerms: [] };

  if (prodNorm.includes(reqNorm) || reqNorm.includes(prodNorm)) {
    return { score: 50, matchedTerms: reqTokens.slice(0, 3) };
  }

  const matchedTerms: string[] = [];
  for (const rt of reqTokens) {
    const found = prodTokens.some(
      (pt) =>
        pt === rt ||
        (rt.length >= 3 && pt.includes(rt)) ||
        (pt.length >= 3 && rt.includes(pt)) ||
        (rt.length >= 4 && pt.length >= 4 && rt.slice(0, 4) === pt.slice(0, 4))
    );
    if (found) matchedTerms.push(rt);
  }

  if (reqTokens.length === 0 || matchedTerms.length === 0) {
    return { score: 0, matchedTerms: [] };
  }

  const ratio = matchedTerms.length / reqTokens.length;
  return {
    score: Math.round(18 + ratio * 30),
    matchedTerms,
  };
}

function checkCityMatch(deliveryCity: string, officeCity: string): boolean {
  const reqCityTokens = tokenizeMedicalTerms(deliveryCity);
  const offCityTokens = tokenizeMedicalTerms(officeCity);
  if (reqCityTokens.length === 0 || offCityTokens.length === 0) return false;
  return reqCityTokens.some((rc) =>
    offCityTokens.some((oc) => oc === rc || oc.includes(rc) || rc.includes(oc))
  );
}

export interface MatchRequestInput {
  productName: string;
  quantity: number;
  targetPrice: number;
  deliveryCity: string;
}

/**
 * Pure smart matching:
 * Filters ONLY approved merchant offices, ranks them by:
 * 1) Product catalog match + available stock
 * 2) Sale price vs target price
 * 3) City match
 * Generates an explicit Arabic reason (`reasonAr`) per matched office.
 */
export function matchApprovedMerchantsForRequest(
  request: MatchRequestInput,
  offices: Office[],
  products: Product[],
  stockMovements: StockMovement[],
  limit = 5
): RequestMatch[] {
  const approvedOffices = offices.filter((o) => o.status === 'approved');
  const reqNorm = normalizeArabicText(request.productName);
  const reqTokens = tokenizeMedicalTerms(request.productName);

  const matches: RequestMatch[] = [];

  for (const office of approvedOffices) {
    const officeProducts = products.filter((p) => p.officeId === office.id && p.active);
    if (officeProducts.length === 0) continue;

    const officeMovements = stockMovements.filter((m) => m.officeId === office.id);
    const cityMatches = checkCityMatch(request.deliveryCity, office.city);

    let bestProduct: Product | null = null;
    let bestProductScore = 0;
    let bestMatchedTerms: string[] = [];
    let bestStock = 0;

    for (const prod of officeProducts) {
      const prodNorm = normalizeArabicText(prod.name);
      const prodTokens = tokenizeMedicalTerms(prod.name);
      const { score: tScore, matchedTerms } = tokenMatchScore(reqTokens, prodTokens, reqNorm, prodNorm);
      if (tScore === 0) continue;

      const qty = calculateQuantityOnHand(prod.id, officeMovements);
      let candidateScore = tScore;

      // Stock contribution
      if (qty >= request.quantity) candidateScore += 12;
      else if (qty > 0) candidateScore += 5;

      // Price contribution vs target
      if (request.targetPrice > 0 && prod.salePrice > 0) {
        if (prod.salePrice <= request.targetPrice) candidateScore += 25;
        else if (prod.salePrice <= request.targetPrice * 1.25) candidateScore += 12;
      }

      if (candidateScore > bestProductScore) {
        bestProductScore = candidateScore;
        bestProduct = prod;
        bestMatchedTerms = matchedTerms;
        bestStock = qty;
      }
    }

    // Only include office if it matched product terms OR (when no office product matched closely) is in same delivery city and carries active catalog
    if (!bestProduct && !cityMatches) {
      continue;
    }

    let totalScore = bestProductScore + (cityMatches ? 20 : 0);
    if (!bestProduct && cityMatches) {
      totalScore = 20;
    }

    const reasons: string[] = [];
    if (bestProduct) {
      reasons.push(`تطابق الصنف (${bestProduct.name})`);
      if (bestStock >= request.quantity) {
        reasons.push(`متوفر بالمستودع (${bestStock.toLocaleString('en-US')})`);
      } else if (bestStock > 0) {
        reasons.push(`رصيد جزئي (${bestStock.toLocaleString('en-US')})`);
      } else {
        reasons.push('الصنف ضمن الدليل برصيد صفري حالياً');
      }

      if (request.targetPrice > 0) {
        if (bestProduct.salePrice <= request.targetPrice) {
          reasons.push(
            `سعر البيع (${bestProduct.salePrice.toLocaleString('en-US')} د.ع) ضمن السعر المستهدف`
          );
        } else if (bestProduct.salePrice <= request.targetPrice * 1.25) {
          reasons.push(
            `سعر البيع (${bestProduct.salePrice.toLocaleString('en-US')} د.ع) قريب من السعر المستهدف`
          );
        }
      }
    } else if (bestMatchedTerms.length === 0) {
      reasons.push('مكتب طبي معتمد ومجهز في المدينة المطلوبة');
    }

    if (cityMatches) {
      reasons.push(`نفس مدينة التوصيل (${office.city})`);
    }

    matches.push({
      officeId: office.id,
      officeName: office.name,
      officeCity: office.city,
      productId: bestProduct?.id,
      productName: bestProduct?.name,
      unitPrice: bestProduct?.salePrice,
      availableStock: bestProduct ? bestStock : undefined,
      score: totalScore,
      reasonAr: reasons.join(' · '),
    });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

/**
 * Find the best matching active product inside a merchant's catalog for an offer/request.
 */
export function findBestProductForOfficeRequest(
  productName: string,
  officeProducts: Product[]
): Product | undefined {
  const active = officeProducts.filter((p) => p.active);
  if (active.length === 0) return undefined;

  const reqNorm = normalizeArabicText(productName);
  const reqTokens = tokenizeMedicalTerms(productName);

  let best: Product | undefined;
  let bestScore = 0;

  for (const prod of active) {
    const prodNorm = normalizeArabicText(prod.name);
    const prodTokens = tokenizeMedicalTerms(prod.name);
    const { score } = tokenMatchScore(reqTokens, prodTokens, reqNorm, prodNorm);
    if (score > bestScore) {
      bestScore = score;
      best = prod;
    }
  }

  return best;
}

/**
 * Pure sorting of offers by unit price ascending (cheapest first).
 */
export function sortOffersByPrice(offers: Offer[]): Offer[] {
  return [...offers].sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export interface OfferStockCheckResult {
  sufficient: boolean;
  productId?: string;
  productName?: string;
  availableQuantity: number;
  requiredQuantity: number;
  shortage: number;
  warningMessageAr?: string;
}

/**
 * Pure stock check for a proposed or submitted offer against merchant's live movements.
 */
export function evaluateOfferStock(
  product: Product | undefined,
  requiredQuantity: number,
  stockMovements: StockMovement[]
): OfferStockCheckResult {
  const reqQty = Math.max(0, Math.round(requiredQuantity));
  if (!product) {
    return {
      sufficient: false,
      availableQuantity: 0,
      requiredQuantity: reqQty,
      shortage: reqQty,
      warningMessageAr:
        'تنبيه مخزون: لم يتم ربط العرض بصنف نشط في مستودعك. تأكد من توفر المادة قبل تأكيد البيع.',
    };
  }

  const available = calculateQuantityOnHand(product.id, stockMovements);
  const shortage = Math.max(0, reqQty - available);
  const sufficient = shortage === 0;

  return {
    sufficient,
    productId: product.id,
    productName: product.name,
    availableQuantity: available,
    requiredQuantity: reqQty,
    shortage,
    warningMessageAr: sufficient
      ? undefined
      : `تحذير نقص مخزون: الكمية المطلوبة (${reqQty.toLocaleString('en-US')}) للصنف "${product.name}" تتجاوز الرصيد المتاح حالياً (${available.toLocaleString('en-US')}) بعجز قدره ${shortage.toLocaleString('en-US')} ${product.unit}.`,
  };
}

// ==========================================
// Step 7: Order & Complaint Status Machines
// ==========================================
export const ORDER_STATUS_FLOW: readonly MarketOrderStatus[] = [
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
];

export const ORDER_STATUS_LABELS: Record<MarketOrderStatus, string> = {
  confirmed: 'مؤكد',
  preparing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
};

export function getNextOrderStatus(current: MarketOrderStatus): MarketOrderStatus | null {
  const idx = ORDER_STATUS_FLOW.indexOf(current);
  if (idx === -1 || idx >= ORDER_STATUS_FLOW.length - 1) return null;
  return ORDER_STATUS_FLOW[idx + 1];
}

export function validateOrderStatusTransition(
  from: MarketOrderStatus,
  to: MarketOrderStatus
): void {
  const fromIdx = ORDER_STATUS_FLOW.indexOf(from);
  const toIdx = ORDER_STATUS_FLOW.indexOf(to);

  if (fromIdx === -1 || toIdx === -1) {
    throw new AppError('INVALID_STATUS_TRANSITION', 'حالة الطلب المحددة غير صالحة');
  }
  if (fromIdx === ORDER_STATUS_FLOW.length - 1) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      'الطلب مكتمل ومُسلّم بالفعل ولا يمكن تغيير حالته لاحقاً'
    );
  }
  if (toIdx !== fromIdx + 1) {
    const expectedNext = ORDER_STATUS_FLOW[fromIdx + 1];
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      `انتقال حالة الطلب غير مسموح: لا يمكن القفز من "${ORDER_STATUS_LABELS[from]}" إلى "${ORDER_STATUS_LABELS[to]}". الخطوة التالية المسموحة هي "${ORDER_STATUS_LABELS[expectedNext]}".`
    );
  }
}

export const COMPLAINT_STATUS_FLOW: readonly ComplaintStatus[] = [
  'open',
  'in_review',
  'resolved',
  'customer_confirmed',
];

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'مفتوحة',
  in_review: 'قيد المراجعة',
  resolved: 'تم الحل',
  customer_confirmed: 'أكّد المشتري الحل',
};

export function validateComplaintStatusTransition(
  from: ComplaintStatus,
  to: ComplaintStatus
): void {
  const fromIdx = COMPLAINT_STATUS_FLOW.indexOf(from);
  const toIdx = COMPLAINT_STATUS_FLOW.indexOf(to);

  if (fromIdx === -1 || toIdx === -1) {
    throw new AppError('INVALID_STATUS_TRANSITION', 'حالة الشكوى المحددة غير صالحة');
  }
  if (fromIdx === COMPLAINT_STATUS_FLOW.length - 1) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      'تم إغلاق الشكوى وتأكيدها من المشتري مسبقاً ولا يمكن تعديلها'
    );
  }
  if (toIdx !== fromIdx + 1) {
    const expectedNext = COMPLAINT_STATUS_FLOW[fromIdx + 1];
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      `انتقال حالة الشكوى غير مسموح: لا يمكن الانتقال من "${COMPLAINT_STATUS_LABELS[from]}" إلى "${COMPLAINT_STATUS_LABELS[to]}". الحالة التالية المطلوبة هي "${COMPLAINT_STATUS_LABELS[expectedNext]}".`
    );
  }
}


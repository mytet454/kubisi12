/**
 * src/ai/geminiAssistant.ts
 * AI Assistant powered by server-side Gemini endpoints for Iraq Medical Supplies ("سوق المستلزمات الطبية").
 * Analyzes inventory health, expiry risks, reorder levels, and crafts medical supply insights.
 * All Gemini API interactions run securely on the server via /api/gemini/*
 */
import { ProductStockInfo } from '../domain/types';

export interface InventoryInsight {
  summary: string;
  urgentActions: string[];
  reorderRecommendations: Array<{ productName: string; recommendedQty: number; rationale: string }>;
  expiryWarnings: Array<{ productName: string; lotNumber: string; daysLeft: number; action: string }>;
}

export async function analyzeInventoryWithGemini(
  products: ProductStockInfo[],
  officeName: string
): Promise<InventoryInsight> {
  const lowStock = products.filter((p) => p.isLowStock);
  const nearExpiry = products.filter((p) => p.isNearExpiry);

  const contextData = {
    officeName,
    totalProducts: products.length,
    lowStockCount: lowStock.length,
    nearExpiryCount: nearExpiry.length,
    sampleLowStock: lowStock.slice(0, 10).map((p) => ({
      name: p.name,
      unit: p.unit,
      currentOnHand: p.quantityOnHand,
      reorderLevel: p.reorderLevel,
    })),
    sampleNearExpiryBatches: nearExpiry.slice(0, 8).flatMap((p) =>
      p.batches
        .filter((b) => b.daysToExpiry <= 90 && b.quantityOnHand > 0)
        .map((b) => ({
          name: p.name,
          lot: b.lotNumber,
          daysLeft: b.daysToExpiry,
          qty: b.quantityOnHand,
        }))
    ),
  };

  try {
    const res = await fetch('/api/gemini/inventory-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ officeName, contextData }),
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.success && result.data && result.data.summary) {
        return result.data as InventoryInsight;
      }
    }
  } catch (error) {
    console.warn('Server-side Gemini request failed or offline, using domain heuristic fallback:', error);
  }

  // Domain-specific heuristic fallback
  return {
    summary: `تحليل المستودع لـ "${officeName}": تم رصد ${lowStock.length} أصناف وصلت أو قاربت حد إعادة الطلب، و ${nearExpiry.length} أصناف تحتوي وجبات تنتهي صلاحيتها خلال أقل من 90 يوماً. وضع المستودع التشغيلي مستقر مع ضرورة التدخل لتجنب الهدر المالي.`,
    urgentActions: [
      `إصدار أوامر شراء فورية للأصناف الناقصة لتفادي نفاد مخزون المستلزمات الطبية الحرجة.`,
      `طرح الوجبات القريبة الانتهاء في قسم "السوق" بأسعار ترويجية للمستشفيات والمراكز الجراحية ذات الاستهلاك اليومي المرتفع.`,
      `التأكيد على أمين المستودع باعتماد قاعدة FEFO (صرف الأقرب انتهاءً أولاً) عند تحضير فواتير المبيعات.`,
    ],
    reorderRecommendations: lowStock.slice(0, 5).map((p) => ({
      productName: p.name,
      recommendedQty: Math.max(30, p.reorderLevel * 2 - p.quantityOnHand),
      rationale: `الرصيد المتاح حالياً (${p.quantityOnHand} ${p.unit}) أقل من الحد الآمن (${p.reorderLevel}).`,
    })),
    expiryWarnings: nearExpiry.slice(0, 5).flatMap((p) =>
      p.batches
        .filter((b) => b.daysToExpiry <= 90 && b.quantityOnHand > 0)
        .map((b) => ({
          productName: p.name,
          lotNumber: b.lotNumber,
          daysLeft: b.daysToExpiry,
          action: 'عرض في السوق التنافسي بخصم 15% للمستشفيات للاستهلاك الفوري',
        }))
    ),
  };
}

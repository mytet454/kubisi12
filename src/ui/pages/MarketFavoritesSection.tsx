/**
 * src/ui/pages/MarketFavoritesSection.tsx
 * Clinical Ledger Favorites Screen (Customer only):
 * - Favorite medical products & approved merchant offices
 * - One-tap "إعادة طلب" button pre-filling a new PurchaseRequest
 */
import React from 'react';
import { Building2, Heart, MapPin, Package, RefreshCw, Trash2 } from 'lucide-react';
import { MarketFavorite } from '../../domain/types';
import { MoneyText } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';

export interface MarketFavoritesSectionProps {
  favorites: MarketFavorite[];
  onRemoveFavorite: (fav: MarketFavorite) => Promise<void>;
  onReorderFromFavorite: (fav: MarketFavorite) => void;
}

export const MarketFavoritesSection: React.FC<MarketFavoritesSectionProps> = ({
  favorites,
  onRemoveFavorite,
  onReorderFromFavorite,
}) => {
  if (favorites.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="w-8 h-8" strokeWidth={1.75} />}
        title="لا توجد عناصر في المفضلة"
        description="احفظ المواد الطبية أو المكاتب المعتمدة المفضلة لديك من العروض العامة أو الطلبات لتتمكن من إعادة الطلب بلمسة واحدة."
      />
    );
  }

  const productFavs = favorites.filter((f) => f.kind === 'product');
  const merchantFavs = favorites.filter((f) => f.kind === 'merchant');

  return (
    <div className="space-y-6" dir="rtl">
      {/* Favorite Products */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="clinical-heading-3 flex items-center gap-2">
            <Package className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
            <span>الأصناف الطبية المفضلة ({productFavs.length})</span>
          </h2>
        </div>

        {productFavs.length === 0 ? (
          <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface)] border border-[var(--color-line)] text-[14px] text-[var(--color-muted)]">
            لم تقم بحفظ أصناف طبية في المفضلة بعد. اضغط على زر المفضلة في العروض العامة لإضافة صنف.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {productFavs.map((fav) => (
              <div key={fav.id} className="clinical-card p-5 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <StatusBadge variant="info" size="sm">
                      صنف طبي مفضل
                    </StatusBadge>
                    <button
                      type="button"
                      onClick={() => onRemoveFavorite(fav)}
                      aria-label={`إزالة ${fav.productName} من المفضلة`}
                      className="min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-danger-ink)] hover:bg-[var(--color-danger-bg)] cursor-pointer clinical-focus"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>

                  <h3 className="clinical-heading-3">{fav.productName}</h3>

                  <div className="text-[14px] text-[var(--color-muted)] space-y-1">
                    <p className="flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                      <span>{fav.officeName}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                      <span>{fav.officeCity}</span>
                    </p>
                  </div>

                  {fav.unitPrice !== undefined && fav.unitPrice > 0 && (
                    <div className="pt-2 border-t border-[var(--color-line)] flex items-center justify-between text-[14px]">
                      <span className="text-[var(--color-muted)]">السعر المرجعي:</span>
                      <MoneyText amount={fav.unitPrice} size="md" />
                    </div>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => onReorderFromFavorite(fav)}
                  leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
                >
                  إعادة طلب فوري
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Favorite Approved Merchants */}
      <section className="space-y-3">
        <h2 className="clinical-heading-3 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
          <span>المكاتب المعتمدة المفضلة ({merchantFavs.length})</span>
        </h2>

        {merchantFavs.length === 0 ? (
          <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface)] border border-[var(--color-line)] text-[14px] text-[var(--color-muted)]">
            لم تقم بحفظ أي مكتب طبي في المفضلة بعد.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {merchantFavs.map((fav) => (
              <div key={fav.id} className="clinical-card p-5 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <StatusBadge variant="teal" size="sm">
                      مكتب معتمد مفضل
                    </StatusBadge>
                    <button
                      type="button"
                      onClick={() => onRemoveFavorite(fav)}
                      aria-label={`إزالة ${fav.officeName} من المفضلة`}
                      className="min-w-[44px] min-h-[44px] rounded-[var(--radius-control)] flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-danger-ink)] hover:bg-[var(--color-danger-bg)] cursor-pointer clinical-focus"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>

                  <h3 className="clinical-heading-3">{fav.officeName}</h3>
                  <p className="text-[14px] text-[var(--color-muted)] flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                    <span>{fav.officeCity}</span>
                  </p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => onReorderFromFavorite(fav)}
                  leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
                >
                  طلب توريد جديد
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

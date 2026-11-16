/**
 * src/ui/pages/MarketOrdersSection.tsx
 * Clinical Ledger Market Orders view:
 * - Customer: visual 4-step order timeline (مؤكد -> قيد التجهيز -> تم الشحن -> تم التسليم),
 *   chronological status history, open chat, favorite merchant toggle, and raise complaint modal.
 * - Merchant: order summary with one-tap advance status CTA + open chat.
 */
import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Heart,
  MapPin,
  MessageSquare,
  Package,
  Truck,
} from 'lucide-react';
import { MarketOrder, MarketOrderStatus, User } from '../../domain/types';
import {
  getNextOrderStatus,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
} from '../../domain/market';
import { services } from '../../services';
import { useToast } from '../context/ToastContext';
import { formatWesternInt, MoneyText } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Input, Textarea } from '../components/Input';
import { Modal } from '../components/Modal';
import { OrderChatTarget } from '../components/OrderChatDrawer';
import { StatusBadge } from '../components/StatusBadge';

export interface MarketOrdersSectionProps {
  orders: MarketOrder[];
  user: User;
  isCustomer: boolean;
  favoriteMerchantIds: Set<string>;
  onRefresh: () => Promise<void>;
  onOpenChat: (target: OrderChatTarget) => void;
  onToggleFavoriteMerchant: (order: MarketOrder) => Promise<void>;
  onComplaintCreated: () => Promise<void>;
}

const ORDER_BADGE_VARIANT: Record<MarketOrderStatus, 'info' | 'warning' | 'teal' | 'success'> = {
  confirmed: 'info',
  preparing: 'warning',
  shipped: 'teal',
  delivered: 'success',
};

const NEXT_STEP_CTA: Record<MarketOrderStatus, string> = {
  confirmed: 'تحويل إلى قيد التجهيز',
  preparing: 'تحويل إلى تم الشحن',
  shipped: 'تأكيد تم التسليم',
  delivered: 'مكتمل',
};

function formatOrderTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

export const MarketOrdersSection: React.FC<MarketOrdersSectionProps> = ({
  orders,
  user,
  isCustomer,
  favoriteMerchantIds,
  onRefresh,
  onOpenChat,
  onToggleFavoriteMerchant,
  onComplaintCreated,
}) => {
  const { showToast } = useToast();
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  // Complaint modal state
  const [complaintOrder, setComplaintOrder] = useState<MarketOrder | null>(null);
  const [cmpReason, setCmpReason] = useState('');
  const [cmpDesc, setCmpDesc] = useState('');
  const [cmpTouched, setCmpTouched] = useState<Record<string, boolean>>({});
  const [submittingCmp, setSubmittingCmp] = useState(false);

  const handleAdvanceStatus = async (order: MarketOrder) => {
    const next = getNextOrderStatus(order.status);
    if (!next) return;
    setAdvancingId(order.id);
    try {
      await services.advanceOrderStatus(user, order.id, next);
      showToast(
        `تم تحديث حالة الطلب ${order.orderNumber} إلى "${ORDER_STATUS_LABELS[next]}".`,
        'success'
      );
      await onRefresh();
    } catch (err: any) {
      showToast(err.message || 'تعذر تحديث حالة الطلب.', 'error');
    } finally {
      setAdvancingId(null);
    }
  };

  const handleCreateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaintOrder) return;
    setCmpTouched({ reason: true, description: true });
    if (!cmpReason.trim() || !cmpDesc.trim()) {
      showToast('أكمل سبب الشكوى وتفاصيلها أولاً.', 'error');
      return;
    }

    setSubmittingCmp(true);
    try {
      await services.createComplaint(user, {
        orderId: complaintOrder.id,
        reason: cmpReason.trim(),
        description: cmpDesc.trim(),
      });
      showToast(`تم رفع الشكوى على الطلب ${complaintOrder.orderNumber} وإشعار المكتب المورد.`, 'success');
      setComplaintOrder(null);
      setCmpReason('');
      setCmpDesc('');
      setCmpTouched({});
      await onComplaintCreated();
    } catch (err: any) {
      showToast(err.message || 'تعذر رفع الشكوى.', 'error');
    } finally {
      setSubmittingCmp(false);
    }
  };

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Package className="w-8 h-8" strokeWidth={1.75} />}
        title={isCustomer ? 'لا توجد طلبات مؤكدة بعد' : 'لا توجد طلبات واردة من السوق بعد'}
        description={
          isCustomer
            ? 'عند قبولك أي عرض سعر من أحد المكاتب المعتمدة، يتحول العرض تلقائياً إلى طلب رسمي مع تتبع مباشر للمراحل.'
            : 'تظهر هنا الطلبات المؤكدة فور قبول العملاء لعروض مكتبك، ويمكنك تحديث مراحلها بزر واحد.'
        }
      />
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {orders.map((order) => {
        const currentIdx = ORDER_STATUS_FLOW.indexOf(order.status);
        const nextStatus = getNextOrderStatus(order.status);
        const isFavMerchant = favoriteMerchantIds.has(order.officeId);

        return (
          <article key={order.id} className="clinical-card p-5 space-y-5">
            {/* Header row */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="num-tabular font-bold text-[17px] text-[var(--color-ink)]">
                    {order.orderNumber}
                  </span>
                  <StatusBadge variant={ORDER_BADGE_VARIANT[order.status]} size="sm">
                    {ORDER_STATUS_LABELS[order.status]}
                  </StatusBadge>
                  <span className="text-[14px] text-[var(--color-muted)] num-tabular">
                    فاتورة: {order.invoiceNumber}
                  </span>
                </div>

                <h3 className="clinical-heading-3">{order.productName}</h3>

                <div className="flex flex-wrap items-center gap-4 text-[14px] text-[var(--color-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                    <span>{isCustomer ? order.officeName : order.customerName}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                    <span>{order.deliveryCity}</span>
                  </span>
                  <span className="num-tabular">
                    الكمية: <strong className="text-[var(--color-ink)]">{formatWesternInt(order.quantity)}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span>الإجمالي:</span>
                    <MoneyText amount={order.total} size="sm" />
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!isCustomer && nextStatus && (
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={advancingId === order.id}
                    onClick={() => handleAdvanceStatus(order)}
                    leftIcon={<Truck className="w-4 h-4" strokeWidth={1.75} />}
                  >
                    {NEXT_STEP_CTA[order.status]}
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    onOpenChat({
                      threadType: 'order',
                      threadId: order.id,
                      officeId: order.officeId,
                      title: `محادثة الطلب ${order.orderNumber}`,
                      subtitle: `${order.productName} — ${isCustomer ? order.officeName : order.customerName}`,
                    })
                  }
                  leftIcon={<MessageSquare className="w-4 h-4" strokeWidth={1.75} />}
                >
                  محادثة الطلب
                </Button>

                {isCustomer && (
                  <>
                    <Button
                      variant={isFavMerchant ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => onToggleFavoriteMerchant(order)}
                      leftIcon={<Heart className="w-4 h-4" strokeWidth={1.75} />}
                    >
                      {isFavMerchant ? 'مكتب مفضل' : 'تفضيل المكتب'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setComplaintOrder(order);
                        setCmpReason('');
                        setCmpDesc('');
                        setCmpTouched({});
                      }}
                      leftIcon={<AlertTriangle className="w-4 h-4 text-[var(--color-warning-ink)]" strokeWidth={1.75} />}
                    >
                      رفع شكوى
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* 4-Step Clinical Timeline */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="خط مراحل تنفيذ الطلب">
              {ORDER_STATUS_FLOW.map((step, idx) => {
                const isDone = idx <= currentIdx;
                const isCurrent = idx === currentIdx;
                const historyEntry = order.statusHistory.find((h) => h.status === step);
                return (
                  <div
                    key={step}
                    className={`p-3 rounded-[var(--radius-control)] border ${
                      isCurrent
                        ? 'bg-[var(--color-primary-soft)]/70 border-[var(--color-primary)]'
                        : isDone
                        ? 'bg-[var(--color-success-bg)]/50 border-[var(--color-success-border)]'
                        : 'bg-[var(--color-canvas)] border-[var(--color-line)] opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-bold text-[var(--color-ink)] inline-flex items-center gap-1.5">
                        {isDone ? (
                          <CheckCircle2
                            className={`w-4 h-4 ${
                              isCurrent
                                ? 'text-[var(--color-primary-strong)]'
                                : 'text-[var(--color-success-ink)]'
                            }`}
                            strokeWidth={1.75}
                          />
                        ) : (
                          <Clock className="w-4 h-4 text-[var(--color-muted)]" strokeWidth={1.75} />
                        )}
                        <span>{ORDER_STATUS_LABELS[step]}</span>
                      </span>
                      <span className="num-tabular text-[13px] font-semibold text-[var(--color-muted)]">
                        {idx + 1}/4
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--color-muted)] num-tabular mt-1.5">
                      {historyEntry ? formatOrderTimestamp(historyEntry.changedAt) : 'بانتظار التنفيذ'}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Compact Status History Trail */}
            <div className="pt-2 border-t border-[var(--color-line)] text-[14px] text-[var(--color-muted)] flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-semibold text-[var(--color-ink)]">سجل التغييرات:</span>
              {order.statusHistory.map((h, i) => (
                <span key={`${h.status}-${i}`} className="inline-flex items-center gap-1.5">
                  {i > 0 && <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />}
                  <span className="font-semibold text-[var(--color-ink)]">
                    {ORDER_STATUS_LABELS[h.status]}
                  </span>
                  <span className="num-tabular">({formatOrderTimestamp(h.changedAt)})</span>
                </span>
              ))}
            </div>
          </article>
        );
      })}

      {/* Raise Complaint Modal */}
      <Modal
        isOpen={Boolean(complaintOrder)}
        onClose={() => setComplaintOrder(null)}
        title={`رفع شكوى على الطلب ${complaintOrder?.orderNumber || ''}`}
        description={
          complaintOrder
            ? `${complaintOrder.productName} — ${complaintOrder.officeName}`
            : undefined
        }
        maxWidth="md"
      >
        <form onSubmit={handleCreateComplaint} noValidate className="space-y-4">
          <Input
            label="سبب الشكوى"
            placeholder="مثال: نقص في الكمية المستلمة أو تلف في التغليف"
            value={cmpReason}
            onChange={(e) => setCmpReason(e.target.value)}
            onBlur={() => setCmpTouched((p) => ({ ...p, reason: true }))}
            error={
              cmpTouched.reason && !cmpReason.trim()
                ? 'سبب الشكوى مطلوب؛ لأن المكتب المورد يراجع الشكوى حسب تصنيفها. اكتب السبب باختصار.'
                : undefined
            }
            required
          />

          <Textarea
            label="وصف وتفاصيل الشكوى"
            placeholder="اشرح تفاصيل المشكلة ورقم الوجبة أو الملاحظات الميدانية..."
            value={cmpDesc}
            onChange={(e) => setCmpDesc(e.target.value)}
            onBlur={() => setCmpTouched((p) => ({ ...p, description: true }))}
            error={
              cmpTouched.description && !cmpDesc.trim()
                ? 'وصف الشكوى مطلوب؛ أضف تفاصيل واضحة لتسريع المعالجة من المكتب المورد.'
                : undefined
            }
            required
          />

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-3 border-t border-[var(--color-line)]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setComplaintOrder(null)}
              disabled={submittingCmp}
            >
              رجوع
            </Button>
            <Button type="submit" variant="primary" isLoading={submittingCmp}>
              إرسال الشكوى للمكتب
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

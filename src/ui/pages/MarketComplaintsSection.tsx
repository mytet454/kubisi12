/**
 * src/ui/pages/MarketComplaintsSection.tsx
 * Clinical Ledger Order Complaints Screen (Customer & Merchant):
 * - Status lifecycle: open -> in_review -> resolved -> customer_confirmed
 * - Merchant moves open -> in_review -> resolved (with mandatory reply)
 * - Customer confirms resolution (resolved -> customer_confirmed)
 */
import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react';
import { ComplaintStatus, OrderComplaint, User } from '../../domain/types';
import { COMPLAINT_STATUS_LABELS } from '../../domain/market';
import { services } from '../../services';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Textarea } from '../components/Input';
import { StatusBadge } from '../components/StatusBadge';

export interface MarketComplaintsSectionProps {
  complaints: OrderComplaint[];
  user: User;
  isCustomer: boolean;
  onRefresh: () => Promise<void>;
}

const COMPLAINT_BADGE_VARIANT: Record<ComplaintStatus, 'danger' | 'warning' | 'info' | 'success'> = {
  open: 'danger',
  in_review: 'warning',
  resolved: 'info',
  customer_confirmed: 'success',
};

function formatDateTime(iso: string): string {
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

export const MarketComplaintsSection: React.FC<MarketComplaintsSectionProps> = ({
  complaints,
  user,
  isCustomer,
  onRefresh,
}) => {
  const { showToast } = useToast();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleUpdateStatus = async (
    complaint: OrderComplaint,
    nextStatus: ComplaintStatus
  ) => {
    if (nextStatus === 'resolved') {
      const reply = (replyDrafts[complaint.id] ?? complaint.merchantReply ?? '').trim();
      if (!reply) {
        setReplyErrors((prev) => ({
          ...prev,
          [complaint.id]:
            'رد المكتب المورد مطلوب قبل تحديد الشكوى كمحلولة؛ اكتب تفاصيل المعالجة ليراها المشتري.',
        }));
        return;
      }
    }

    setProcessingId(complaint.id);
    try {
      await services.updateComplaintStatus(user, {
        complaintId: complaint.id,
        nextStatus,
        merchantReply: replyDrafts[complaint.id] ?? complaint.merchantReply,
      });
      showToast(
        `تم تحديث حالة الشكوى إلى "${COMPLAINT_STATUS_LABELS[nextStatus]}".`,
        'success'
      );
      await onRefresh();
    } catch (err: any) {
      showToast(err.message || 'تعذر تحديث حالة الشكوى.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  if (complaints.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="w-8 h-8" strokeWidth={1.75} />}
        title="لا توجد شكاوى مسجلة"
        description={
          isCustomer
            ? 'يمكنك رفع شكوى على أي طلب مؤكد من تبويب الطلبات إذا واجهت نقصاً أو ملاحظة في التوريد.'
            : 'تظهر هنا شكاوى الطلبات الواردة لمكتبك لمتابعتها والرد عليها وتوثيق حلها.'
        }
      />
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {complaints.map((cmp) => {
        const draftVal = replyDrafts[cmp.id] ?? cmp.merchantReply ?? '';
        const errVal = replyErrors[cmp.id];

        return (
          <article key={cmp.id} className="clinical-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-[var(--color-line)]">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num-tabular font-bold text-[16px] text-[var(--color-ink)]">
                    طلب: {cmp.orderNumber}
                  </span>
                  <StatusBadge variant={COMPLAINT_BADGE_VARIANT[cmp.status]} size="sm">
                    {COMPLAINT_STATUS_LABELS[cmp.status]}
                  </StatusBadge>
                </div>
                <h3 className="clinical-heading-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-[var(--color-warning-ink)]" strokeWidth={1.75} />
                  <span>{cmp.reason}</span>
                </h3>
                <p className="text-[14px] text-[var(--color-muted)] flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                  <span>{isCustomer ? cmp.officeName : cmp.customerName}</span>
                  <span>·</span>
                  <span className="num-tabular">{formatDateTime(cmp.createdAt)}</span>
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-[var(--radius-control)] bg-[var(--color-canvas)] border border-[var(--color-line)] text-[15px] text-[var(--color-ink)]">
              {cmp.description}
            </div>

            {cmp.merchantReply && (
              <div className="p-3.5 rounded-[var(--radius-control)] bg-[var(--color-primary-soft)]/50 border border-[var(--color-primary)]/40 space-y-1">
                <p className="text-[14px] font-semibold text-[var(--color-primary-strong)] flex items-center gap-1.5">
                  <MessageSquareText className="w-4 h-4" strokeWidth={1.75} />
                  <span>رد المكتب المورد:</span>
                </p>
                <p className="text-[15px] text-[var(--color-ink)]">{cmp.merchantReply}</p>
              </div>
            )}

            {/* Merchant Workflow Controls */}
            {!isCustomer && (cmp.status === 'open' || cmp.status === 'in_review') && (
              <div className="pt-2 border-t border-[var(--color-line)] space-y-3">
                {cmp.status === 'in_review' && (
                  <Textarea
                    label="رد المكتب وتفاصيل المعالجة"
                    placeholder="مثال: تم إرسال الكمية التعويضية ضمن شحنة اليوم..."
                    value={draftVal}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReplyDrafts((p) => ({ ...p, [cmp.id]: val }));
                      if (errVal && val.trim()) {
                        setReplyErrors((p) => {
                          const next = { ...p };
                          delete next[cmp.id];
                          return next;
                        });
                      }
                    }}
                    error={errVal}
                    required
                  />
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  {cmp.status === 'open' && (
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={processingId === cmp.id}
                      onClick={() => handleUpdateStatus(cmp, 'in_review')}
                      leftIcon={<Clock className="w-4 h-4" strokeWidth={1.75} />}
                    >
                      بدء مراجعة الشكوى
                    </Button>
                  )}

                  {cmp.status === 'in_review' && (
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={processingId === cmp.id}
                      onClick={() => handleUpdateStatus(cmp, 'resolved')}
                      leftIcon={<CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />}
                    >
                      اعتماد الحل وإرسال الرد
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Customer Confirm Resolution CTA */}
            {isCustomer && cmp.status === 'resolved' && (
              <div className="pt-2 border-t border-[var(--color-line)] flex flex-wrap items-center justify-between gap-3">
                <span className="text-[14px] text-[var(--color-muted)]">
                  تم تقديم الحل من المكتب. هل تم إنهاء المشكلة بنجاح؟
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={processingId === cmp.id}
                  onClick={() => handleUpdateStatus(cmp, 'customer_confirmed')}
                  leftIcon={<CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />}
                >
                  تأكيد حل الشكوى وإغلاقها
                </Button>
              </div>
            )}

            {/* History Log */}
            <div className="pt-2 border-t border-[var(--color-line)] flex flex-wrap items-center gap-3 text-[13px] text-[var(--color-muted)]">
              <span className="font-semibold text-[var(--color-ink)]">مراحل الشكوى:</span>
              {cmp.history.map((h, i) => (
                <span key={`${h.status}-${i}`} className="num-tabular">
                  {i > 0 ? '· ' : ''}
                  {COMPLAINT_STATUS_LABELS[h.status]} ({formatDateTime(h.changedAt)})
                </span>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
};

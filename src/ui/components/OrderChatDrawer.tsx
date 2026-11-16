/**
 * src/ui/components/OrderChatDrawer.tsx
 * Clinical Ledger Two-Party Chat Drawer for Purchase Requests & Market Orders:
 * - Strictly isolated to the two participating parties (enforced by services.getChatMessages / sendChatMessage)
 * - Auto-refreshes every 4 seconds while open
 * - Displays sender name, role badge, and Western-digit timestamps
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, Send } from 'lucide-react';
import { ChatThreadType, MarketChatMessage, User } from '../../domain/types';
import { services } from '../../services';
import { useToast } from '../context/ToastContext';
import { Button } from './Button';
import { Drawer } from './Drawer';
import { StatusBadge } from './StatusBadge';

export interface OrderChatTarget {
  threadType: ChatThreadType;
  threadId: string;
  officeId?: string;
  title: string;
  subtitle?: string;
}

export interface OrderChatDrawerProps {
  isOpen: boolean;
  target: OrderChatTarget | null;
  user: User | null;
  onClose: () => void;
}

function formatChatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
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

export const OrderChatDrawer: React.FC<OrderChatDrawerProps> = ({
  isOpen,
  target,
  user,
  onClose,
}) => {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<MarketChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(
    async (silent = false) => {
      if (!user || !target || !isOpen) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const list = await services.getChatMessages(user, {
          threadType: target.threadType,
          threadId: target.threadId,
          officeId: target.officeId,
        });
        setMessages(list);
      } catch (err: any) {
        if (!silent) {
          setError(err.message || 'تعذر تحميل رسائل المحادثة.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [user, target, isOpen]
  );

  useEffect(() => {
    if (!isOpen || !target) {
      setMessages([]);
      setDraft('');
      setDraftError(undefined);
      setError(null);
      return;
    }
    fetchMessages(false);

    // Auto-refresh polling every 4 seconds while drawer is open
    const intervalId = window.setInterval(() => {
      fetchMessages(true);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [isOpen, target, fetchMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !target) return;
    if (!draft.trim()) {
      setDraftError('لا يمكن إرسال رسالة فارغة؛ اكتب نص الرسالة أولاً ثم اضغط إرسال.');
      return;
    }

    setDraftError(undefined);
    setSending(true);
    try {
      const sent = await services.sendChatMessage(user, {
        threadType: target.threadType,
        threadId: target.threadId,
        officeId: target.officeId,
        body: draft.trim(),
      });
      setMessages((prev) => [...prev, sent]);
      setDraft('');
    } catch (err: any) {
      const msg = err.message || 'تعذر إرسال الرسالة.';
      setDraftError(msg);
      showToast(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={target?.title || 'محادثة مباشرة'}
      subtitle={target?.subtitle || 'محادثة محصورة بين طرفي المعاملة فقط (تحديث تلقائي كل 4 ثوانٍ)'}
    >
      <div className="flex flex-col h-full min-h-[380px] gap-4" dir="rtl">
        {/* Info & Manual Refresh Strip */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] text-[14px]">
          <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
            <MessageSquare className="w-4 h-4 text-[var(--color-primary)]" strokeWidth={1.75} />
            <span>سجل المحادثة الموثق (تحديث تلقائي)</span>
          </span>
          <button
            type="button"
            onClick={() => fetchMessages(false)}
            className="inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--color-primary-strong)] hover:underline cursor-pointer min-h-[32px] px-2"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
            <span>تحديث</span>
          </button>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 space-y-3 overflow-y-auto max-h-[55vh] pl-1">
          {loading && messages.length === 0 ? (
            <div className="py-10 text-center text-[14px] text-[var(--color-muted)]">
              جارٍ تحميل سجل المحادثة...
            </div>
          ) : error ? (
            <div
              role="alert"
              className="p-4 rounded-[var(--radius-control)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] text-[14px] font-semibold text-[var(--color-danger-ink)]"
            >
              {error}
            </div>
          ) : messages.length === 0 ? (
            <div className="p-6 text-center rounded-[var(--radius-control)] bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-1.5">
              <p className="text-[15px] font-semibold text-[var(--color-ink)]">
                لا توجد رسائل بعد في هذه المحادثة
              </p>
              <p className="text-[14px] text-[var(--color-muted)]">
                ابدأ المراسلة للتنسيق حول المواصفات أو موعد التوصيل. الرسائل مرئية للطرفين فقط.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMine = user?.id === m.senderUserId;
              return (
                <div
                  key={m.id}
                  className={`p-3.5 rounded-[var(--radius-control)] border space-y-1.5 ${
                    isMine
                      ? 'bg-[var(--color-primary-soft)]/60 border-[var(--color-primary)]/40 mr-6'
                      : 'bg-[var(--color-surface)] border-[var(--color-line)] ml-6'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-[var(--color-ink)]">
                        {m.senderName}
                      </span>
                      <StatusBadge variant={m.senderRole === 'merchant' ? 'teal' : 'info'} size="sm">
                        {m.senderRole === 'merchant' ? 'المكتب المورد' : 'المشتري'}
                      </StatusBadge>
                    </div>
                    <span className="text-[13px] text-[var(--color-muted)] num-tabular">
                      {formatChatTime(m.createdAt)}
                    </span>
                  </div>
                  <p className="text-[15px] text-[var(--color-ink)] leading-relaxed whitespace-pre-wrap">
                    {m.body}
                  </p>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Compose Form */}
        <form onSubmit={handleSend} noValidate className="pt-3 border-t border-[var(--color-line)] space-y-2.5">
          <div>
            <label
              htmlFor="market-chat-input"
              className="block text-[14px] font-semibold text-[var(--color-ink)] mb-1.5"
            >
              اكتب رسالتك
            </label>
            <textarea
              id="market-chat-input"
              rows={2}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (draftError && e.target.value.trim()) setDraftError(undefined);
              }}
              aria-invalid={Boolean(draftError)}
              aria-describedby={draftError ? 'market-chat-error' : undefined}
              placeholder="مثال: هل يتوفر التوصيل إلى قسم الطوارئ قبل الساعة الرابعة عصراً؟"
              className={`w-full px-3.5 py-2.5 bg-[var(--color-surface)] border rounded-[var(--radius-control)] text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-placeholder)] clinical-focus resize-none ${
                draftError ? 'border-[var(--color-danger-ink)]' : 'border-[var(--color-control-border)]'
              }`}
            />
            {draftError && (
              <p id="market-chat-error" className="text-[14px] text-[var(--color-danger-ink)] mt-1">
                {draftError}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              isLoading={sending}
              leftIcon={<Send className="w-4 h-4" strokeWidth={1.75} />}
            >
              إرسال الرسالة
            </Button>
          </div>
        </form>
      </div>
    </Drawer>
  );
};

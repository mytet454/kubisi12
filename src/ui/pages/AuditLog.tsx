/**
 * src/ui/pages/AuditLog.tsx
 * Clinical Ledger Audit Trail Screen (Owner only):
 * - Unified List Pattern with Drawer diff preview + "فتح الصفحة كاملة" Before/After modal
 * - Built-in status chips (action type), date filter, entity filter, CSV export
 */
import React, { useEffect, useState } from 'react';
import { Eye, RefreshCw, User } from 'lucide-react';
import { AuditLog } from '../../domain/types';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { Button } from '../components/Button';
import { Column, DataTable, RowAction } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { TableSkeleton } from '../components/Skeletons';
import { StatusBadge } from '../components/StatusBadge';

export const AuditLogPage: React.FC = () => {
  const { user, office } = useAuth();
  const { showToast } = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const loadLogs = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setLoadError(null);
      const res = await services.getAuditLogs(user, { action: 'all' });
      setLogs(res);
    } catch (err: any) {
      setLoadError(
        err.message ||
          'تعذر تحميل سجل الرقابة والتدقيق بسبب خطأ في البيانات. اضغط على إعادة المحاولة.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [user]);

  const categorizeAction = (action: string): 'create' | 'update' | 'void' | 'delete' | 'export' | 'other' => {
    const norm = action.toUpperCase();
    if (norm === 'CREATE' || norm.startsWith('CREATE_')) return 'create';
    if (
      norm === 'UPDATE' ||
      norm.startsWith('UPDATE_') ||
      norm.startsWith('ENABLE_') ||
      norm.startsWith('DISABLE_') ||
      norm.startsWith('ACTIVATE_') ||
      norm.startsWith('DEACTIVATE_') ||
      norm.startsWith('APPROVE_') ||
      norm.startsWith('REJECT_')
    ) {
      return 'update';
    }
    if (norm === 'VOID' || norm.startsWith('VOID_')) return 'void';
    if (norm === 'DELETE' || norm.startsWith('DELETE_')) return 'delete';
    if (norm === 'EXPORT' || norm === 'IMPORT' || norm.startsWith('EXPORT_') || norm.startsWith('IMPORT_')) {
      return 'export';
    }
    return 'other';
  };

  const filteredLogs =
    actionFilter === 'all'
      ? logs
      : logs.filter((item) => categorizeAction(item.action) === actionFilter);

  const getActionBadge = (action: string) => {
    const norm = action.toUpperCase();
    if (norm === 'VOID_INVOICE' || norm === 'VOID') {
      return <StatusBadge variant="danger" size="sm">إلغاء فاتورة</StatusBadge>;
    }
    if (norm === 'EXPORT') {
      return <StatusBadge variant="warning" size="sm">تصدير</StatusBadge>;
    }
    if (norm === 'IMPORT') {
      return <StatusBadge variant="warning" size="sm">استعادة</StatusBadge>;
    }
    const category = categorizeAction(action);
    switch (category) {
      case 'create':
        return <StatusBadge variant="success" size="sm">إنشاء</StatusBadge>;
      case 'update':
        return <StatusBadge variant="teal" size="sm">تعديل</StatusBadge>;
      case 'void':
        return <StatusBadge variant="danger" size="sm">إلغاء فاتورة</StatusBadge>;
      case 'delete':
        return <StatusBadge variant="danger" size="sm">حذف</StatusBadge>;
      case 'export':
        return <StatusBadge variant="warning" size="sm">نسخ احتياطي</StatusBadge>;
      default:
        return <StatusBadge variant="neutral" size="sm">{action}</StatusBadge>;
    }
  };

  const getEntityLabel = (entity: string) => {
    const map: Record<string, string> = {
      invoice: 'فاتورة',
      product: 'مادة طبية',
      batch: 'وجبة',
      warehouse: 'مستودع',
      party: 'عميل / مورد',
      employee: 'موظف',
      user: 'موظف',
      office: 'إعدادات المكتب',
      expense: 'مصروف',
      payment: 'سند',
      backup: 'نسخة احتياطية',
    };
    return map[entity] || entity;
  };

  const columns: Column<AuditLog>[] = [
    {
      key: 'userName',
      header: 'المستخدم المسؤول',
      mobilePriority: 1,
      searchValue: (item) => `${item.userName || item.userId} ${getEntityLabel(item.entity)} ${item.entityId} ${item.action}`,
      render: (item) => (
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-[8px] bg-[var(--color-surface-subtle)] text-[var(--color-ink)] flex items-center justify-center shrink-0">
            <User className="w-4 h-4" strokeWidth={1.75} />
          </span>
          <div>
            <span className="font-semibold text-[var(--color-ink)] block">
              {item.userName || item.userId}
            </span>
            <span className="text-[14px] text-[var(--color-muted)]">
              {getEntityLabel(item.entity)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'at',
      header: 'التاريخ والوقت',
      sortable: true,
      mobilePriority: 2,
      render: (item) => (
        <div className="num-tabular text-[14px]">
          <span className="font-semibold text-[var(--color-ink)] block">
            {new Date(item.at).toLocaleDateString('ar-IQ')}
          </span>
          <span className="text-[var(--color-muted)]">
            {new Date(item.at).toLocaleTimeString('ar-IQ')}
          </span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'الإجراء',
      mobilePriority: 'status',
      render: (item) => getActionBadge(item.action),
    },
    {
      key: 'entityId',
      header: 'معرف السجل',
      mobilePriority: 'hide',
      render: (item) => (
        <span className="num-tabular text-[14px] text-[var(--color-primary-strong)] bg-[var(--color-primary-soft)] px-2.5 py-1 rounded-[8px]">
          {item.entityId}
        </span>
      ),
    },
  ];

  const getRowActions = (item: AuditLog): RowAction<AuditLog>[] => [
    {
      key: 'diff',
      label: 'مقارنة قبل وبعد',
      icon: <Eye className="w-4 h-4" strokeWidth={1.75} />,
      onClick: () => setSelectedLog(item),
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
        <div>
          <h1 className="clinical-heading-1">سجل الرقابة والتدقيق</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
            توثيق من نفذ الإجراء وماذا تغير (قبل وبعد) في {office?.name || 'المكتب'}
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={loadLogs}
          leftIcon={<RefreshCw className="w-5 h-5" strokeWidth={1.75} />}
        >
          تحديث السجل
        </Button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-[var(--radius-control)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-center justify-between gap-3"
        >
          <span className="text-[14px] font-semibold text-[var(--color-danger-ink)]">
            {loadError}
          </span>
          <Button variant="secondary" size="sm" onClick={loadLogs}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <DataTable<AuditLog>
          title="سجلات التدقيق"
          columns={columns}
          data={filteredLogs}
          keyExtractor={(item) => item.id}
          exportFileName="audit_log"
          dateAccessor={(item) => item.at}
          filterOptions={[
            { label: 'إنشاء', value: 'create' },
            { label: 'تعديل', value: 'update' },
            { label: 'إلغاء', value: 'void' },
            { label: 'حذف', value: 'delete' },
            { label: 'نسخ احتياطي', value: 'export' },
          ]}
          filterValue={actionFilter}
          onFilterChange={setActionFilter}
          rowActions={getRowActions}
          previewTitle={(item) => `${getEntityLabel(item.entity)} — ${item.entityId}`}
          previewSubtitle={(item) =>
            `${item.userName || item.userId} • ${new Date(item.at).toLocaleString('ar-IQ')}`
          }
          previewFullPageLabel="فتح الصفحة كاملة"
          onOpenFullPage={(item) => setSelectedLog(item)}
          emptyTitle="لا توجد سجلات مطابقة"
          emptyDescription="تعرض هذه الشاشة سجل الرقابة التلقائي؛ تُسجل الحركات تلقائياً عند كل عملية إنشاء أو تعديل أو إلغاء."
        />
      )}

      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={`أثر التغيير — ${selectedLog ? getEntityLabel(selectedLog.entity) : ''}`}
        maxWidth="xl"
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3.5 bg-[var(--color-surface-subtle)] border border-[var(--color-line)] rounded-[var(--radius-control)] text-[14px]">
              <div>
                <span className="text-[var(--color-muted)] block">المسؤول</span>
                <span className="font-semibold text-[var(--color-ink)]">
                  {selectedLog.userName || selectedLog.userId}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-muted)] block">الإجراء</span>
                <div className="mt-0.5">{getActionBadge(selectedLog.action)}</div>
              </div>
              <div>
                <span className="text-[var(--color-muted)] block">المعرف</span>
                <span className="num-tabular font-semibold text-[var(--color-primary-strong)]">
                  {selectedLog.entityId}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-muted)] block">التوقيت</span>
                <span className="num-tabular font-semibold">
                  {new Date(selectedLog.at).toLocaleString('ar-IQ')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-[var(--color-line)] rounded-[var(--radius-control)] overflow-hidden">
                <div className="px-4 py-2 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] text-[14px] font-semibold flex items-center justify-between">
                  <span>الحالة السابقة (Before)</span>
                  {selectedLog.before ? (
                    <StatusBadge variant="neutral" size="sm">موجودة</StatusBadge>
                  ) : (
                    <StatusBadge variant="warning" size="sm">إنشاء جديد</StatusBadge>
                  )}
                </div>
                <pre className="p-3 bg-[var(--color-ink)] text-[var(--color-surface)] font-mono text-xs overflow-x-auto max-h-72 dir-ltr">
                  {selectedLog.before
                    ? JSON.stringify(selectedLog.before, null, 2)
                    : '// لا توجد بيانات سابقة'}
                </pre>
              </div>

              <div className="border border-[var(--color-success-border)] rounded-[var(--radius-control)] overflow-hidden">
                <div className="px-4 py-2 bg-[var(--color-success-bg)] border-b border-[var(--color-success-border)] text-[14px] font-semibold text-[var(--color-success-ink)] flex items-center justify-between">
                  <span>الحالة اللاحقة (After)</span>
                  {selectedLog.after ? (
                    <StatusBadge variant="success" size="sm">معتمدة</StatusBadge>
                  ) : (
                    <StatusBadge variant="danger" size="sm">محذوفة</StatusBadge>
                  )}
                </div>
                <pre className="p-3 bg-[var(--color-ink)] text-[var(--color-success-bg)] font-mono text-xs overflow-x-auto max-h-72 dir-ltr">
                  {selectedLog.after
                    ? JSON.stringify(selectedLog.after, null, 2)
                    : '// لا توجد بيانات لاحقة'}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--color-line)]">
              <Button variant="secondary" onClick={() => setSelectedLog(null)}>
                {AR_STRINGS.common.back}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

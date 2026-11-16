/**
 * src/ui/pages/AdminMerchants.tsx
 * Clinical Ledger Platform Admin Screen:
 * - View medical office licenses with unified DataTable List Pattern
 * - Drawer preview + "فتح الصفحة كاملة" for full license approval/rejection
 */
import React, { useEffect, useState } from 'react';
import { Check, Eye, FileCheck, FileX } from 'lucide-react';
import { Office } from '../../domain/types';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { Button } from '../components/Button';
import { Column, DataTable, RowAction } from '../components/DataTable';
import { Textarea } from '../components/Input';
import { Modal } from '../components/Modal';
import { TableSkeleton } from '../components/Skeletons';
import { StatusBadge } from '../components/StatusBadge';

export const AdminMerchants: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [selectedOffice, setSelectedOffice] = useState<Office | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadOffices = async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await services.getMerchantOffices(user);
      setOffices(data);
    } catch (err: any) {
      setLoadError(
        err.message ||
          'تعذر تحميل قائمة المكاتب الطبية بسبب خطأ في البيانات. اضغط على إعادة المحاولة.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOffices();
  }, [user]);

  const validateRejection = (val: string) =>
    !val.trim()
      ? 'تعذر رفض الطلب لعدم كتابة سبب الرفض. اكتب سبباً واضحاً لصاحب المكتب ثم أعد المحاولة.'
      : undefined;

  const handleReview = async (decision: 'approved' | 'rejected') => {
    if (!user || !selectedOffice) return;
    if (decision === 'rejected') {
      const err = validateRejection(rejectionReason);
      setRejectionError(err);
      if (err) {
        return;
      }
    } else {
      setRejectionError(undefined);
    }

    setIsProcessing(true);
    try {
      await services.reviewMerchantLicense(user, selectedOffice.id, decision, rejectionReason);
      showToast(
        decision === 'approved'
          ? AR_STRINGS.admin.approvedSuccess
          : AR_STRINGS.admin.rejectedSuccess,
        'success'
      );
      setSelectedOffice(null);
      setRejectionReason('');
      setRejectionError(undefined);
      loadOffices();
    } catch (err: any) {
      showToast(err.message || 'تعذر تنفيذ القرار.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredOffices = offices.filter((o) => {
    if (filterStatus === 'all') return true;
    return o.status === filterStatus;
  });

  const columns: Column<Office>[] = [
    {
      key: 'name',
      header: AR_STRINGS.admin.merchantName,
      sortable: true,
      mobilePriority: 1,
      searchValue: (item) => `${item.name} ${item.city} ${item.phone}`,
      render: (item) => (
        <div>
          <p className="font-semibold text-[var(--color-ink)]">{item.name}</p>
          <p className="text-[14px] text-[var(--color-muted)]">{item.city}</p>
        </div>
      ),
    },
    {
      key: 'phone',
      header: AR_STRINGS.admin.phone,
      sortable: true,
      mobilePriority: 2,
      render: (item) => <span className="num-tabular font-semibold">{item.phone}</span>,
    },
    {
      key: 'licenseFile',
      header: AR_STRINGS.admin.licenseDocument,
      mobilePriority: 'hide',
      render: (item) => (
        <span className="num-tabular text-[14px] bg-[var(--color-surface-subtle)] text-[var(--color-ink)] px-2.5 py-1 rounded-[8px]">
          {item.licenseFile || 'license.pdf'}
        </span>
      ),
    },
    {
      key: 'status',
      header: AR_STRINGS.admin.status,
      mobilePriority: 'status',
      render: (item) => {
        switch (item.status) {
          case 'approved':
            return <StatusBadge variant="success" size="sm">معتمد</StatusBadge>;
          case 'pending':
            return <StatusBadge variant="warning" size="sm">قيد المراجعة</StatusBadge>;
          case 'rejected':
            return <StatusBadge variant="danger" size="sm">مرفوض</StatusBadge>;
        }
      },
    },
  ];

  const getRowActions = (item: Office): RowAction<Office>[] => [
    {
      key: 'inspect',
      label: 'فحص الوثائق والاعتماد',
      icon: <Eye className="w-4 h-4" strokeWidth={1.75} />,
      onClick: () => {
        setSelectedOffice(item);
        setRejectionReason(item.rejectionReason || '');
        setRejectionError(undefined);
      },
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="pb-4 border-b border-[var(--color-line)]">
        <h1 className="clinical-heading-1">{AR_STRINGS.admin.title}</h1>
        <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
          {AR_STRINGS.admin.subtitle}
        </p>
      </div>

      {loadError && (
        <div
          role="alert"
          className="p-4 rounded-[var(--radius-control)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-center justify-between gap-3"
        >
          <span className="text-[14px] font-semibold text-[var(--color-danger-ink)]">
            {loadError}
          </span>
          <Button variant="secondary" size="sm" onClick={loadOffices}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={4} />
      ) : (
        <DataTable<Office>
          data={filteredOffices}
          columns={columns}
          keyExtractor={(item) => item.id}
          title={AR_STRINGS.admin.merchantsList}
          exportFileName="merchants_licenses"
          filterOptions={[
            { label: 'قيد المراجعة', value: 'pending' },
            { label: 'معتمد', value: 'approved' },
            { label: 'مرفوض', value: 'rejected' },
          ]}
          filterValue={filterStatus}
          onFilterChange={setFilterStatus}
          rowActions={getRowActions}
          previewTitle={(item) => item.name}
          previewSubtitle={(item) => `${item.city} • ${item.phone}`}
          previewFullPageLabel="فتح صفحة المراجعة والاعتماد"
          onOpenFullPage={(item) => {
            setSelectedOffice(item);
            setRejectionReason(item.rejectionReason || '');
            setRejectionError(undefined);
          }}
          emptyTitle={AR_STRINGS.admin.emptyTitle}
          emptyDescription={AR_STRINGS.admin.emptyDesc}
        />
      )}

      <Modal
        isOpen={Boolean(selectedOffice)}
        onClose={() => setSelectedOffice(null)}
        title={AR_STRINGS.admin.viewDocument}
        description={selectedOffice?.name}
        maxWidth="md"
      >
        {selectedOffice && (
          <div className="space-y-5">
            <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] space-y-2 text-[14px]">
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">اسم المكتب:</span>
                <span className="font-semibold text-[var(--color-ink)]">
                  {selectedOffice.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">المدينة:</span>
                <span className="font-semibold">{selectedOffice.city}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">الهاتف:</span>
                <span className="num-tabular font-semibold">{selectedOffice.phone}</span>
              </div>
            </div>

            <div className="p-5 rounded-[var(--radius-control)] border border-[var(--color-primary)] bg-[var(--color-primary-soft)]/50 text-center space-y-2">
              <FileCheck
                className="w-8 h-8 text-[var(--color-primary-strong)] mx-auto"
                strokeWidth={1.75}
              />
              <p className="text-[15px] font-semibold text-[var(--color-ink)]">
                وثيقة الترخيص الطبي المرفقة
              </p>
              <p className="text-[14px] num-tabular text-[var(--color-muted)]">
                {selectedOffice.licenseFile || 'license_iraq_doc.pdf'}
              </p>
              {selectedOffice.licenseUploadedAt && (
                <p className="text-[13px] num-tabular text-[var(--color-muted)]">
                  تاريخ الرفع: {selectedOffice.licenseUploadedAt.slice(0, 10)}
                </p>
              )}
              {selectedOffice.licenseDataUrl && selectedOffice.licenseDataUrl.startsWith('data:image/') && (
                <img
                  src={selectedOffice.licenseDataUrl}
                  alt={`وثيقة ترخيص ${selectedOffice.name}`}
                  className="max-h-48 mx-auto rounded-[var(--radius-control)] border border-[var(--color-line)] mt-2"
                />
              )}
            </div>

            <Textarea
              label={AR_STRINGS.admin.rejectionReasonPrompt}
              value={rejectionReason}
              onChange={(e) => {
                setRejectionReason(e.target.value);
                if (rejectionError && e.target.value.trim()) {
                  setRejectionError(undefined);
                }
              }}
              error={rejectionError}
              placeholder={AR_STRINGS.admin.rejectionReasonPlaceholder}
            />

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-[var(--color-line)]">
              <Button
                variant="secondary"
                onClick={() => setSelectedOffice(null)}
                disabled={isProcessing}
                className="w-full sm:w-auto"
              >
                {AR_STRINGS.common.back}
              </Button>

              <Button
                variant="danger"
                onClick={() => handleReview('rejected')}
                isLoading={isProcessing}
                leftIcon={<FileX className="w-5 h-5" strokeWidth={1.75} />}
                className="w-full sm:w-auto"
              >
                {AR_STRINGS.admin.rejectButton}
              </Button>

              <Button
                variant="primary"
                onClick={() => handleReview('approved')}
                isLoading={isProcessing}
                leftIcon={<Check className="w-5 h-5" strokeWidth={1.75} />}
                className="w-full sm:w-auto"
              >
                {AR_STRINGS.admin.approveButton}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

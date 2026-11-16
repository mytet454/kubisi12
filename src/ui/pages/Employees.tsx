/**
 * src/ui/pages/Employees.tsx
 * Clinical Ledger Employees & Permissions Screen:
 * - Unified List Pattern with Drawer preview & ⋮ row actions
 * - StatusBadge with icon + word, action-verb buttons
 */
import React, { useEffect, useState } from 'react';
import { Plus, Power } from 'lucide-react';
import { User, UserRole } from '../../domain/types';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Column, DataTable, RowAction } from '../components/DataTable';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { TableSkeleton } from '../components/Skeletons';
import { StatusBadge } from '../components/StatusBadge';

export const Employees: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('accountant');
  const [password, setPassword] = useState('123456');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    phone?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [targetEmployee, setTargetEmployee] = useState<User | null>(null);
  const [showConfirmToggle, setShowConfirmToggle] = useState(false);

  const validateName = (v: string) =>
    !v.trim()
      ? 'اسم الموظف مطلوب لأنه يظهر في سجل الرقابة والفواتير. اكتب الاسم الكامل للموظف.'
      : undefined;

  const validatePhone = (v: string) =>
    v.trim().length < 8
      ? 'رقم الهاتف غير مكتمل لأنه يُستخدم لتسجيل الدخول. أدخل رقماً لا يقل عن 8 أرقام.'
      : undefined;

  const validatePassword = (v: string) =>
    v.length < 4
      ? 'كلمة المرور قصيرة جداً لمتطلبات الأمان. أدخل 4 أحرف أو أرقام على الأقل.'
      : undefined;

  const loadEmployees = async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await services.getEmployees(user);
      setEmployees(data);
    } catch (err: any) {
      setLoadError(
        err.message ||
          'تعذر تحميل قائمة الموظفين بسبب خطأ في البيانات. اضغط على إعادة المحاولة.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [user]);

  const openCreateModal = () => {
    setFormError(null);
    setFieldErrors({});
    setShowCreateModal(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const nextErrors = {
      name: validateName(name),
      phone: validatePhone(phone),
      password: validatePassword(password),
    };
    setFieldErrors(nextErrors);
    if (nextErrors.name || nextErrors.phone || nextErrors.password) {
      setFormError('يرجى تصحيح الحقول المحددة باللون الأحمر قبل الحفظ.');
      return;
    }

    setIsSubmitting(true);
    try {
      await services.createEmployee(user, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role,
        passwordPlain: password,
      });
      showToast(AR_STRINGS.employees.createdSuccess, 'success');
      setShowCreateModal(false);
      setName('');
      setPhone('');
      setEmail('');
      setPassword('123456');
      setFieldErrors({});
      loadEmployees();
    } catch (err: any) {
      setFormError(err.message || 'تعذر حفظ بيانات الموظف. تحقق من رقم الهاتف وأعد المحاولة.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!user || !targetEmployee) return;
    try {
      const newStatus = !targetEmployee.active;
      await services.toggleEmployeeStatus(user, targetEmployee.id, newStatus);
      showToast(AR_STRINGS.employees.statusChangedSuccess, 'success');
      setShowConfirmToggle(false);
      setTargetEmployee(null);
      loadEmployees();
    } catch (err: any) {
      showToast(err.message || 'تعذر تغيير حالة الموظف.', 'error');
    }
  };

  const roleBadge = (r: UserRole) => {
    switch (r) {
      case 'owner':
        return <StatusBadge variant="teal" size="sm">{AR_STRINGS.roles.owner}</StatusBadge>;
      case 'accountant':
        return <StatusBadge variant="info" size="sm">{AR_STRINGS.roles.accountant}</StatusBadge>;
      case 'warehouse_keeper':
        return <StatusBadge variant="warning" size="sm">{AR_STRINGS.roles.warehouse_keeper}</StatusBadge>;
      default:
        return <StatusBadge variant="neutral" size="sm">{AR_STRINGS.roles[r]}</StatusBadge>;
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: AR_STRINGS.employees.name,
      sortable: true,
      mobilePriority: 1,
      searchValue: (item) => `${item.name} ${item.email} ${item.phone}`,
      render: (item) => (
        <div>
          <p className="font-semibold text-[var(--color-ink)]">{item.name}</p>
          <p className="text-[14px] text-[var(--color-muted)]">{item.email || 'بلا بريد'}</p>
        </div>
      ),
    },
    {
      key: 'phone',
      header: AR_STRINGS.employees.phone,
      sortable: true,
      mobilePriority: 2,
      render: (item) => <span className="num-tabular font-semibold">{item.phone}</span>,
    },
    {
      key: 'role',
      header: AR_STRINGS.employees.role,
      sortable: true,
      mobilePriority: 'hide',
      render: (item) => roleBadge(item.role),
    },
    {
      key: 'status',
      header: AR_STRINGS.employees.status,
      mobilePriority: 'status',
      render: (item) =>
        item.active ? (
          <StatusBadge variant="success" size="sm">
            {AR_STRINGS.employees.active}
          </StatusBadge>
        ) : (
          <StatusBadge variant="danger" size="sm">
            {AR_STRINGS.employees.disabled}
          </StatusBadge>
        ),
    },
  ];

  const getRowActions = (item: User): RowAction<User>[] => [
    {
      key: 'toggle',
      label: item.active ? AR_STRINGS.employees.disable : AR_STRINGS.employees.enable,
      icon: <Power className="w-4 h-4" strokeWidth={1.75} />,
      variant: item.active ? 'danger' : 'default',
      hidden: (row) => row.id === user?.id,
      onClick: () => {
        setTargetEmployee(item);
        setShowConfirmToggle(true);
      },
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
        <div>
          <h1 className="clinical-heading-1">{AR_STRINGS.employees.title}</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
            {AR_STRINGS.employees.subtitle}
          </p>
        </div>

        <Button
          onClick={openCreateModal}
          variant="primary"
          leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
        >
          {AR_STRINGS.employees.addEmployee}
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
          <Button variant="secondary" size="sm" onClick={loadEmployees}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={5} />
      ) : (
        <DataTable<User>
          data={employees}
          columns={columns}
          keyExtractor={(item) => item.id}
          title="كادر المكتب الطبي"
          exportFileName="employees_list"
          rowActions={getRowActions}
          previewTitle={(item) => item.name}
          previewSubtitle={(item) => `${AR_STRINGS.roles[item.role]} • ${item.phone}`}
          emptyTitle={AR_STRINGS.employees.emptyTitle}
          emptyDescription={AR_STRINGS.employees.emptyDesc}
          emptyActionLabel={AR_STRINGS.employees.addEmployee}
          onEmptyAction={openCreateModal}
        />
      )}

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={AR_STRINGS.employees.addEmployee}
        maxWidth="md"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="p-3 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-[var(--radius-control)] text-[14px] text-[var(--color-danger-ink)]"
            >
              {formError}
            </div>
          )}

          <Input
            label={AR_STRINGS.employees.name}
            placeholder="مثال: أحمد كريم"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: validateName(e.target.value) }));
            }}
            onBlur={() => setFieldErrors((p) => ({ ...p, name: validateName(name) }))}
            error={fieldErrors.name}
            required
          />

          <Input
            label={AR_STRINGS.employees.phone}
            placeholder="مثال: 07701234567"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: validatePhone(e.target.value) }));
            }}
            onBlur={() => setFieldErrors((p) => ({ ...p, phone: validatePhone(phone) }))}
            error={fieldErrors.phone}
            required
          />

          <Input
            label={AR_STRINGS.employees.email}
            placeholder="مثال: ahmed@office.iq (اختياري)"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Select
            label={AR_STRINGS.employees.role}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            options={[
              { value: 'accountant', label: 'المحاسب المالي (حسابات، فواتير، تقارير)' },
              { value: 'warehouse_keeper', label: 'أمين المستودع (بضاعة ووجبات فقط بلا أسعار)' },
              { value: 'cashier', label: 'مندوب مبيعات / كاشير (فواتير بيع فقط)' },
            ]}
            required
          />

          <Input
            label={AR_STRINGS.employees.password}
            type="text"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: validatePassword(e.target.value) }));
            }}
            onBlur={() => setFieldErrors((p) => ({ ...p, password: validatePassword(password) }))}
            error={fieldErrors.password}
            helperText="كلمة المرور الافتراضية المقترحة: 123456"
            required
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-line)]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={isSubmitting}
            >
              {AR_STRINGS.common.back}
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {AR_STRINGS.employees.saveEmployee}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={showConfirmToggle}
        onClose={() => setShowConfirmToggle(false)}
        onConfirm={handleToggleStatus}
        title={targetEmployee?.active ? AR_STRINGS.employees.disable : AR_STRINGS.employees.enable}
        message={`هل تريد ${targetEmployee?.active ? 'تعطيل' : 'تفعيل'} حساب الموظف (${targetEmployee?.name})؟`}
        isDestructive={targetEmployee?.active}
        confirmLabel={targetEmployee?.active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
        cancelLabel={AR_STRINGS.common.back}
      />
    </div>
  );
};

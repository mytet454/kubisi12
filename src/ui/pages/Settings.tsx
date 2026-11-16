/**
 * src/ui/pages/Settings.tsx
 * Clinical Ledger Owner Settings Screen:
 * - Office profile (Name, City, Phone, License preview & StatusBadge)
 * - Invoice header & footer settings
 * - Inventory alert thresholds & accessible switch (no transition-all)
 * - JSON Backup export & import with clear Arabic validation
 * - Blur validation with 3-part error messages + right inputMode
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  Download,
  FileText,
  Save,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { CardSkeleton } from '../components/Skeletons';
import { StatusBadge } from '../components/StatusBadge';

export const Settings: React.FC = () => {
  const { user, office, refreshAuth } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const licenseInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [invoiceHeader, setInvoiceHeader] = useState('');
  const [invoiceFooter, setInvoiceFooter] = useState('');
  const [nearExpiryDays, setNearExpiryDays] = useState(90);
  const [defaultReorderLevel, setDefaultReorderLevel] = useState(20);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);

  const [errors, setErrors] = useState<{
    name?: string;
    city?: string;
    phone?: string;
    nearExpiryDays?: string;
    defaultReorderLevel?: string;
  }>({});

  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isUploadingLicense, setIsUploadingLicense] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (office) {
      setName(office.name || '');
      setCity(office.city || '');
      setPhone(office.phone || '');
      setInvoiceHeader(office.invoiceHeader || '');
      setInvoiceFooter(office.invoiceFooter || '');
      setNearExpiryDays(office.nearExpiryDays || 90);
      setDefaultReorderLevel(office.defaultReorderLevel || 20);
      setAllowNegativeStock(Boolean(office.allowNegativeStock));
    }
  }, [office]);

  const validateAll = () => {
    const next = {
      name: !name.trim()
        ? 'اسم المكتب التجاري مطلوب؛ لأنه يظهر في ترويسة الفواتير المطبوعة. أدخل الاسم.'
        : undefined,
      city: !city.trim() ? 'المدينة مطلوبة؛ أدخل المدينة والعنوان الرسمي للمكتب.' : undefined,
      phone:
        !phone.trim() || phone.trim().length < 7
          ? 'هاتف التواصل الرسمي مطلوب؛ أدخل رقم هاتف عراقي صحيح.'
          : undefined,
      nearExpiryDays:
        nearExpiryDays < 15 || nearExpiryDays > 365
          ? 'عدد أيام التنبيه يجب أن يكون بين 15 و 365 يوماً؛ اختر قيمة مناسبة.'
          : undefined,
      defaultReorderLevel:
        defaultReorderLevel < 1 || defaultReorderLevel > 10000
          ? 'حد إعادة الطلب يجب أن يكون 1 وحدة على الأقل؛ أدخل رقماً صحيحاً.'
          : undefined,
    };
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    if (!validateAll()) {
      setFormError('تعذر حفظ الإعدادات لوجود أخطاء في أحد الحقول. راجع التنبيهات أسفل الحقول.');
      return;
    }

    setIsSaving(true);
    try {
      await services.updateOfficeSettings(user, {
        name: name.trim(),
        city: city.trim(),
        phone: phone.trim(),
        invoiceHeader: invoiceHeader.trim(),
        invoiceFooter: invoiceFooter.trim(),
        nearExpiryDays,
        defaultReorderLevel,
        allowNegativeStock,
      });
      await refreshAuth();
      showToast(AR_STRINGS.settings.savedSuccess, 'success');
    } catch (err: any) {
      const msg = err.message || 'تعذر حفظ التعديلات.';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportBackup = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const json = await services.exportBackup(user);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${office?.id || 'office'}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('تم تصدير النسخة الاحتياطية بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message || 'تعذر تصدير النسخة الاحتياطية.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      await services.importBackup(user, text);
      await refreshAuth();
      showToast('تمت استعادة البيانات بنجاح وتطابق السجلات 100%', 'success');
    } catch (err: any) {
      showToast(err.message || 'تعذر استعادة النسخة الاحتياطية؛ تأكد من صحة ملف JSON.', 'error');
    } finally {
      e.target.value = '';
      setIsImporting(false);
    }
  };

  const handleLicenseFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploadingLicense(true);
    try {
      let fileDataUrl: string | undefined;
      if (file.size <= 350 * 1024 && file.type.startsWith('image/')) {
        fileDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
      }
      await services.uploadMerchantLicense(user, {
        fileName: file.name,
        fileDataUrl: fileDataUrl || undefined,
      });
      await refreshAuth();
      showToast('تم رفع ملف الترخيص وإشعار مشرف المنصة للمراجعة والاعتماد بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message || 'تعذر رفع ملف الترخيص.', 'error');
    } finally {
      e.target.value = '';
      setIsUploadingLicense(false);
    }
  };

  const getStatusBadge = () => {
    if (!office) return null;
    switch (office.status) {
      case 'approved':
        return <StatusBadge variant="success">{AR_STRINGS.settings.statusApproved}</StatusBadge>;
      case 'pending':
        return <StatusBadge variant="warning">{AR_STRINGS.settings.statusPending}</StatusBadge>;
      case 'rejected':
        return <StatusBadge variant="danger">{AR_STRINGS.settings.statusRejected}</StatusBadge>;
    }
  };

  if (!office) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      <div className="pb-4 border-b border-[var(--color-line)]">
        <h1 className="clinical-heading-1">{AR_STRINGS.settings.title}</h1>
        <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
          {AR_STRINGS.settings.subtitle}
        </p>
      </div>

      <form onSubmit={handleSave} noValidate className="space-y-6">
        {formError && (
          <div
            role="alert"
            className="p-4 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-[var(--radius-control)] text-[14px] font-semibold text-[var(--color-danger-ink)] flex items-start gap-2.5"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={1.75} />
            <span>{formError}</span>
          </div>
        )}

        {/* Section 1: Office Profile */}
        <section className="clinical-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--color-line)]">
            <h2 className="clinical-heading-3 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
              <span>{AR_STRINGS.settings.officeProfile}</span>
            </h2>
            {getStatusBadge()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={AR_STRINGS.settings.officeName}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
              }}
              onBlur={() => {
                if (!name.trim()) {
                  setErrors((p) => ({
                    ...p,
                    name: 'اسم المكتب التجاري مطلوب؛ لأنه يظهر في ترويسة الفواتير المطبوعة.',
                  }));
                }
              }}
              error={errors.name}
              required
            />
            <Input
              label={AR_STRINGS.settings.city}
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                if (errors.city) setErrors((p) => ({ ...p, city: undefined }));
              }}
              onBlur={() => {
                if (!city.trim()) {
                  setErrors((p) => ({ ...p, city: 'المدينة مطلوبة؛ أدخل المدينة والعنوان.' }));
                }
              }}
              error={errors.city}
              required
            />
            <Input
              label={AR_STRINGS.settings.phone}
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
              }}
              onBlur={() => {
                if (!phone.trim() || phone.trim().length < 7) {
                  setErrors((p) => ({
                    ...p,
                    phone: 'هاتف التواصل الرسمي مطلوب؛ أدخل رقماً صحيحاً.',
                  }));
                }
              }}
              error={errors.phone}
              required
            />
            <div className="space-y-1.5">
              <span className="block text-[14px] font-semibold text-[var(--color-ink)]">
                {AR_STRINGS.settings.licenseFile}
              </span>
              <div className="px-3.5 py-2 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] text-[14px] text-[var(--color-ink)] flex flex-wrap items-center justify-between gap-2 min-h-[44px]">
                <span className="num-tabular truncate max-w-[200px]">
                  {office.licenseFile || 'لم يُرفع ملف بعد'}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    ref={licenseInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="sr-only"
                    aria-label="اختيار ملف الترخيص الطبي"
                    onChange={handleLicenseFileChange}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    isLoading={isUploadingLicense}
                    onClick={() => licenseInputRef.current?.click()}
                    leftIcon={<Upload className="w-4 h-4" strokeWidth={1.75} />}
                  >
                    {AR_STRINGS.market.uploadLicense}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {office.status === 'rejected' && office.rejectionReason && (
            <div
              role="alert"
              className="p-4 rounded-[var(--radius-control)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] text-[14px] text-[var(--color-danger-ink)] flex items-start gap-2.5"
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <p className="font-bold">سبب رفض الترخيص السابق:</p>
                <p className="mt-0.5">{office.rejectionReason}</p>
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Invoice Header & Footer */}
        <section className="clinical-card p-6 space-y-4">
          <h2 className="clinical-heading-3 flex items-center gap-2 pb-3 border-b border-[var(--color-line)]">
            <FileText className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
            <span>{AR_STRINGS.settings.invoiceSettings}</span>
          </h2>

          <div className="space-y-4">
            <Input
              label={AR_STRINGS.settings.invoiceHeader}
              placeholder="مثال: مكتب الرافدين لتجهيز المستشفيات والمراكز الطبية التخصصية"
              value={invoiceHeader}
              onChange={(e) => setInvoiceHeader(e.target.value)}
            />
            <Input
              label={AR_STRINGS.settings.invoiceFooter}
              placeholder="مثال: المواد المباعة أصلية وتخضع للمواصفات القياسية العراقية"
              value={invoiceFooter}
              onChange={(e) => setInvoiceFooter(e.target.value)}
            />
          </div>
        </section>

        {/* Section 3: Inventory Policies */}
        <section className="clinical-card p-6 space-y-4">
          <h2 className="clinical-heading-3 flex items-center gap-2 pb-3 border-b border-[var(--color-line)]">
            <Bell className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
            <span>{AR_STRINGS.settings.inventorySettings}</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={AR_STRINGS.settings.nearExpiryDays}
              type="number"
              inputMode="numeric"
              min={15}
              max={365}
              value={nearExpiryDays}
              onChange={(e) => setNearExpiryDays(parseInt(e.target.value, 10) || 90)}
              onBlur={() => {
                if (nearExpiryDays < 15 || nearExpiryDays > 365) {
                  setErrors((p) => ({
                    ...p,
                    nearExpiryDays: 'عدد الأيام يجب أن يكون بين 15 و 365 يوماً.',
                  }));
                } else {
                  setErrors((p) => ({ ...p, nearExpiryDays: undefined }));
                }
              }}
              error={errors.nearExpiryDays}
              helperText="الافتراضي: 90 يوماً قبل تاريخ الانتهاء"
              required
            />

            <Input
              label={AR_STRINGS.settings.defaultReorderLevel}
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              value={defaultReorderLevel}
              onChange={(e) => setDefaultReorderLevel(parseInt(e.target.value, 10) || 20)}
              onBlur={() => {
                if (defaultReorderLevel < 1) {
                  setErrors((p) => ({
                    ...p,
                    defaultReorderLevel: 'حد إعادة الطلب يجب أن يكون 1 على الأقل.',
                  }));
                } else {
                  setErrors((p) => ({ ...p, defaultReorderLevel: undefined }));
                }
              }}
              error={errors.defaultReorderLevel}
              helperText="الافتراضي: 20 وحدة لكل صنف طبي"
              required
            />
          </div>

          <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] flex items-center justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-[var(--color-ink)]">
                {AR_STRINGS.settings.allowNegativeStock}
              </p>
              <p className="text-[14px] text-[var(--color-muted)] mt-0.5">
                {AR_STRINGS.settings.allowNegativeStockHint}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={allowNegativeStock}
              aria-label={AR_STRINGS.settings.allowNegativeStock}
              onClick={() => setAllowNegativeStock((prev) => !prev)}
              className={`min-w-[56px] min-h-[44px] px-2 rounded-[var(--radius-control)] border flex items-center cursor-pointer clinical-focus transition-colors duration-150 ${
                allowNegativeStock
                  ? 'bg-[var(--color-primary)] border-[var(--color-primary)] justify-start'
                  : 'bg-[var(--color-surface)] border-[var(--color-control-border)] justify-end'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-[6px] ${
                  allowNegativeStock ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-muted)]'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Section 4: Backup & Restore */}
        <section className="clinical-card p-6 space-y-4">
          <h2 className="clinical-heading-3 flex items-center gap-2 pb-3 border-b border-[var(--color-line)]">
            <ShieldCheck className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
            <span>النسخ الاحتياطي واستعادة البيانات</span>
          </h2>

          <p className="text-[14px] text-[var(--color-muted)] clinical-prose">
            يتيح لك النظام تصدير جميع بيانات المكتب (المواد، الدفعات، الفواتير، الحسابات، والقيود) بصيغة JSON، أو استعادتها بعد فحص سلامة البنية.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-primary-soft)]/50 border border-[var(--color-primary)]/35 flex flex-col justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--color-primary-strong)]">
                  تصدير نسخة احتياطية
                </h3>
                <p className="text-[14px] text-[var(--color-ink)] mt-1">
                  تنزيل ملف JSON يحتوي على كافة سجلات مكتبك الحالية.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleExportBackup}
                isLoading={isExporting}
                leftIcon={<Download className="w-4 h-4" strokeWidth={1.75} />}
              >
                تصدير النسخة الاحتياطية (JSON)
              </Button>
            </div>

            <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-warning-bg)]/50 border border-[var(--color-warning-border)] flex flex-col justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--color-warning-ink)]">
                  استعادة من نسخة سابقة
                </h3>
                <p className="text-[14px] text-[var(--color-ink)] mt-1">
                  استيراد ملف JSON احتياطي واستعادة البيانات بعد التحقق من صحته.
                </p>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={handleImportFileChange}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  isLoading={isImporting}
                  leftIcon={<Upload className="w-4 h-4" strokeWidth={1.75} />}
                >
                  استيراد ملف JSON
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Primary Action Bar */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSaving}
            leftIcon={<Save className="w-5 h-5" strokeWidth={1.75} />}
          >
            {AR_STRINGS.settings.saveChanges}
          </Button>
        </div>
      </form>
    </div>
  );
};

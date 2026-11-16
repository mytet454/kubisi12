/**
 * src/ui/pages/Login.tsx
 * Clinical Ledger Authentication Screen:
 * - Calm #F3F6F7 canvas (no gradient wash)
 * - Large accessible fields (48px+), right inputMode, blur validation with aria-describedby
 * - Demo accounts presented as tappable chips that fill identifier + password and focus Login
 * - Preserves Reset Demo Data and 2FA Modal
 */
import '../styles/tokens.css';
import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  KeyRound,
  Lock,
  Phone,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { services } from '../../services';

interface DemoAccountChip {
  id: string;
  name: string;
  roleLabel: string;
  identifier: string;
  group: 'baghdad' | 'basra' | 'other';
  tone?: 'default' | 'warning';
}

const DEMO_ACCOUNTS: DemoAccountChip[] = [
  {
    id: 'user_bg_owner',
    name: 'د. علي الجبوري',
    roleLabel: 'مالك المكتب',
    identifier: '07701111111',
    group: 'baghdad',
  },
  {
    id: 'user_bg_accountant',
    name: 'سامر المحاسب',
    roleLabel: 'المحاسب المالي',
    identifier: '07702222222',
    group: 'baghdad',
  },
  {
    id: 'user_bg_warehouse',
    name: 'كرار أمين المستودع',
    roleLabel: 'أمين المستودع',
    identifier: '07703333333',
    group: 'baghdad',
    tone: 'warning',
  },
  {
    id: 'user_bg_cashier',
    name: 'حسين الكاشير',
    roleLabel: 'كاشير / مبيعات',
    identifier: '07704444444',
    group: 'baghdad',
  },
  {
    id: 'user_bs_owner',
    name: 'حاج مصطفى السعدون',
    roleLabel: 'مالك فرع البصرة',
    identifier: '07801111111',
    group: 'basra',
  },
  {
    id: 'user_cust_hospital',
    name: 'مستشفى الأمل الجراحي',
    roleLabel: 'مشتري / مستشفى',
    identifier: '07901112233',
    group: 'other',
  },
  {
    id: 'user_babil_owner',
    name: 'مكتب بابل الطبي الحديث',
    roleLabel: 'تاجر قيد الاعتماد',
    identifier: '07712399999',
    group: 'other',
    tone: 'warning',
  },
  {
    id: 'user_platform_admin',
    name: 'مشرف المنصة العام',
    roleLabel: 'إدارة التراخيص',
    identifier: '07700000000',
    group: 'other',
  },
];

export const Login: React.FC = () => {
  const { login } = useAuth();
  const { showToast } = useToast();

  const loginButtonRef = useRef<HTMLButtonElement>(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [identifierError, setIdentifierError] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [selectedChipId, setSelectedChipId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('123456');
  const [twoFactorError, setTwoFactorError] = useState<string | undefined>(undefined);
  const [isResetting, setIsResetting] = useState(false);

  const validateIdentifier = (val: string): string | undefined => {
    if (!val.trim()) {
      return 'رقم الهاتف أو البريد الإلكتروني مطلوب؛ لأن النظام يحدد حسابك عبره. أدخل رقم الهاتف (مثال: 07701111111).';
    }
    return undefined;
  };

  const validatePassword = (val: string): string | undefined => {
    if (!val) {
      return 'كلمة المرور مطلوبة؛ لأن التحقق من الهوية يمنع الدخول غير المصرح. أدخل كلمة المرور للمتابعة.';
    }
    return undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const idErr = validateIdentifier(identifier);
    const pwErr = validatePassword(password);
    setIdentifierError(idErr);
    setPasswordError(pwErr);

    if (idErr || pwErr) {
      setErrorMessage('تعذر تسجيل الدخول لعدم إكمال الحقول المطلوبة. راجع التنبيهات أسفل الحقول.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);
    try {
      const res = await login(
        identifier.trim(),
        password,
        showTwoFactorModal ? twoFactorCode.trim() : undefined
      );
      if (res.requiresTwoFactor) {
        setShowTwoFactorModal(true);
        showToast('تم إرسال رمز التحقق (الرمز التجريبي: 123456)', 'info');
      } else {
        showToast('تم تسجيل الدخول بنجاح', 'success');
      }
    } catch (err: any) {
      setErrorMessage(err.message || AR_STRINGS.auth.invalidCredentials);
      showToast(err.message || AR_STRINGS.auth.invalidCredentials, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoChipSelect = (chip: DemoAccountChip) => {
    setSelectedChipId(chip.id);
    setIdentifier(chip.identifier);
    setPassword('123456');
    setIdentifierError(undefined);
    setPasswordError(undefined);
    setErrorMessage(null);
    showToast(`تمت تعبئة بيانات ${chip.name}؛ اضغط "تسجيل الدخول" للمتابعة.`, 'info');
    requestAnimationFrame(() => {
      loginButtonRef.current?.focus();
    });
  };

  const handleResetData = async () => {
    setIsResetting(true);
    try {
      await services.resetAllData();
      showToast(AR_STRINGS.auth.resetDemoSuccess, 'success');
      setErrorMessage(null);
      setIdentifier('');
      setPassword('');
      setIdentifierError(undefined);
      setPasswordError(undefined);
      setSelectedChipId(null);
    } catch (err: any) {
      showToast(err.message || 'تعذر إعادة ضبط البيانات التجريبية', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const renderChipGroup = (group: DemoAccountChip['group']) => {
    const items = DEMO_ACCOUNTS.filter((c) => c.group === group);
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {items.map((chip) => {
          const isSelected =
            selectedChipId === chip.id &&
            identifier.trim() === chip.identifier &&
            password === '123456';
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => handleDemoChipSelect(chip)}
              className={`w-full min-h-[48px] px-3.5 py-2 rounded-[var(--radius-control)] border text-right clinical-press clinical-focus cursor-pointer transition-colors duration-150 flex flex-col justify-center ${
                isSelected
                  ? 'bg-[var(--color-primary-soft)] border-[var(--color-primary)] text-[var(--color-primary-strong)]'
                  : 'bg-[var(--color-canvas)] hover:bg-[var(--color-surface-subtle)] border-[var(--color-control-border)] text-[var(--color-ink)]'
              }`}
            >
              <span className="text-[14px] font-semibold leading-tight block">
                {chip.name}
              </span>
              <span
                className={`text-[14px] leading-tight mt-0.5 block ${
                  chip.tone === 'warning' && !isSelected
                    ? 'text-[var(--color-warning-ink)]'
                    : isSelected
                    ? 'text-[var(--color-primary-strong)]'
                    : 'text-[var(--color-muted)]'
                }`}
              >
                {chip.roleLabel} · <span className="num-tabular">{chip.identifier}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8"
      lang="ar"
      dir="rtl"
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="mx-auto w-14 h-14 rounded-[var(--radius-card)] bg-[var(--color-primary)] text-[var(--color-surface)] flex items-center justify-center font-bold text-[26px] shadow-[var(--shadow-card)] mb-3">
          س
        </div>
        <h1 className="clinical-heading-1">{AR_STRINGS.app.title}</h1>
        <p className="text-[15px] text-[var(--color-muted)] clinical-prose">
          {AR_STRINGS.app.tagline}
        </p>
      </div>

      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="clinical-card p-6 sm:p-8 space-y-6">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {errorMessage && (
              <div
                role="alert"
                className="p-3.5 rounded-[var(--radius-control)] bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-start gap-2.5 text-[var(--color-danger-ink)] text-[14px] font-semibold"
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={1.75} />
                <div className="leading-snug">{errorMessage}</div>
              </div>
            )}

            <Input
              label={AR_STRINGS.auth.identifierLabel}
              placeholder="مثال: 07701111111 أو البريد الإلكتروني"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (identifierError) setIdentifierError(validateIdentifier(e.target.value));
              }}
              onBlur={() => setIdentifierError(validateIdentifier(identifier))}
              error={identifierError}
              rightIcon={<Phone className="w-5 h-5" strokeWidth={1.75} />}
              inputMode="tel"
              autoComplete="username"
              className="text-[16px]"
              required
            />

            <Input
              label={AR_STRINGS.auth.passwordLabel}
              placeholder={AR_STRINGS.auth.passwordPlaceholder}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(validatePassword(e.target.value));
              }}
              onBlur={() => setPasswordError(validatePassword(password))}
              error={passwordError}
              rightIcon={<Lock className="w-5 h-5" strokeWidth={1.75} />}
              autoComplete="current-password"
              className="text-[16px]"
              required
            />

            <Button
              ref={loginButtonRef}
              type="submit"
              variant="primary"
              size="lg"
              className="w-full min-h-[50px] text-[16px]"
              isLoading={isLoading}
            >
              {AR_STRINGS.auth.loginButton}
            </Button>
          </form>

          {/* Quick Demo Access (Tappable Chips filling the form) */}
          <div className="pt-5 border-t border-[var(--color-line)] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-[var(--color-ink)] flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
                <span>{AR_STRINGS.auth.demoLoginsTitle}</span>
              </h2>
              <span className="text-[14px] font-semibold text-[var(--color-primary-strong)] bg-[var(--color-primary-soft)] px-2.5 py-0.5 rounded-[8px]">
                {AR_STRINGS.auth.demoPasswordHint}
              </span>
            </div>

            <p className="text-[14px] text-[var(--color-muted)]">
              اضغط على أي حساب لتعبئة رقم الهاتف وكلمة المرور تلقائياً، ثم اضغط &quot;تسجيل الدخول&quot;.
            </p>

            <div className="space-y-2">
              <p className="text-[14px] font-semibold text-[var(--color-ink)] flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                <span>{AR_STRINGS.auth.baghdadOffice}</span>
              </p>
              {renderChipGroup('baghdad')}
            </div>

            <div className="space-y-2">
              <p className="text-[14px] font-semibold text-[var(--color-ink)] flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                <span>{AR_STRINGS.auth.basraOffice}</span>
              </p>
              {renderChipGroup('basra')}
            </div>

            <div className="space-y-2">
              <p className="text-[14px] font-semibold text-[var(--color-ink)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                <span>{AR_STRINGS.auth.customersAndAdmin}</span>
              </p>
              {renderChipGroup('other')}
            </div>

            <div className="pt-3 border-t border-[var(--color-line)] flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetData}
                isLoading={isResetting}
                leftIcon={<RotateCcw className="w-4 h-4" strokeWidth={1.75} />}
              >
                {AR_STRINGS.auth.resetDemoData}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showTwoFactorModal}
        onClose={() => setShowTwoFactorModal(false)}
        title={AR_STRINGS.auth.twoFactorTitle}
        description={AR_STRINGS.auth.twoFactorSubtitle}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <Input
            label={AR_STRINGS.auth.twoFactorCodeLabel}
            value={twoFactorCode}
            onChange={(e) => {
              setTwoFactorCode(e.target.value);
              if (twoFactorError) {
                setTwoFactorError(
                  e.target.value.trim().length === 6
                    ? undefined
                    : 'رمز التحقق غير مكتمل؛ يتكون الرمز من 6 أرقام. أدخل 123456 للمتابعة.'
                );
              }
            }}
            onBlur={() => {
              if (twoFactorCode.trim().length !== 6) {
                setTwoFactorError(
                  'رمز التحقق غير مكتمل؛ يتكون الرمز من 6 أرقام. أدخل 123456 للمتابعة.'
                );
              } else {
                setTwoFactorError(undefined);
              }
            }}
            error={twoFactorError}
            inputMode="numeric"
            placeholder="123456"
            autoFocus
          />
          <div className="p-3 rounded-[var(--radius-control)] bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] text-[14px] font-semibold text-[var(--color-warning-ink)]">
            رمز التحقق التجريبي هو: <span className="num-tabular">123456</span>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-[var(--color-line)]">
            <Button
              variant="secondary"
              onClick={() => setShowTwoFactorModal(false)}
              disabled={isLoading}
            >
              {AR_STRINGS.common.back}
            </Button>
            <Button onClick={handleSubmit} variant="primary" isLoading={isLoading}>
              {AR_STRINGS.auth.twoFactorVerifyButton}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

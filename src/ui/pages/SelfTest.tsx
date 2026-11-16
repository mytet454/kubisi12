/**
 * src/ui/pages/SelfTest.tsx
 * Clinical Ledger Automated Acceptance Testing UI (/self-test).
 * Runs all acceptance tests of Steps 1-5 on an isolated in-memory snapshot.
 */
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import { runStep1SelfTests, TestResult } from '../../selftest/runner';
import { AR_STRINGS } from '../strings/ar';
import { Button } from '../components/Button';
import { CardSkeleton } from '../components/Skeletons';
import { StatusBadge } from '../components/StatusBadge';

export const SelfTest: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [runError, setRunError] = useState<string | null>(null);

  const executeTests = async () => {
    setIsRunning(true);
    setRunError(null);
    try {
      const res = await runStep1SelfTests();
      setResults(res);
    } catch (err: any) {
      setRunError(err.message || 'تعذر تشغيل فحوصات النظام.');
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    executeTests();
  }, []);

  const allPassed = results.length > 0 && results.every((r) => r.passed);
  const totalDuration = results.reduce((acc, r) => acc + r.durationMs, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
        <div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-[var(--color-primary)]" strokeWidth={1.75} />
            <h1 className="clinical-heading-1">{AR_STRINGS.selfTest.title}</h1>
          </div>
          <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
            {AR_STRINGS.selfTest.subtitle}
          </p>
        </div>

        <Button
          onClick={executeTests}
          variant="primary"
          isLoading={isRunning}
          leftIcon={<RotateCcw className="w-4 h-4" strokeWidth={1.75} />}
        >
          {AR_STRINGS.selfTest.runAllTests}
        </Button>
      </div>

      {runError ? (
        <div
          role="alert"
          className="clinical-card p-6 border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="w-6 h-6 text-[var(--color-danger-ink)] shrink-0"
              strokeWidth={1.75}
            />
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--color-danger-ink)]">
                تعذر تشغيل الفحص الذاتي
              </h2>
              <p className="text-[14px] text-[var(--color-ink)] mt-0.5">{runError}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={executeTests}
            leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : isRunning && results.length === 0 ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <>
          {/* Summary Scorecard */}
          <div
            className={`p-5 rounded-[var(--radius-card)] border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              allPassed
                ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success-ink)]'
                : 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger-ink)]'
            }`}
          >
            <div className="flex items-center gap-3 text-right">
              <div className="w-12 h-12 rounded-[var(--radius-control)] bg-[var(--color-surface)] flex items-center justify-center shrink-0 border border-[var(--color-line)]">
                {allPassed ? (
                  <CheckCircle2
                    className="w-7 h-7 text-[var(--color-success-ink)]"
                    strokeWidth={1.75}
                  />
                ) : (
                  <XCircle className="w-7 h-7 text-[var(--color-danger-ink)]" strokeWidth={1.75} />
                )}
              </div>
              <div>
                <h2 className="clinical-heading-2">
                  {allPassed ? AR_STRINGS.selfTest.summaryPass : AR_STRINGS.selfTest.summaryFail}
                </h2>
                <p className="text-[14px] mt-0.5 num-tabular">
                  تم تشغيل {results.length} فحصاً · إجمالي الزمن: {totalDuration.toFixed(1)} مللي
                  ثانية
                </p>
              </div>
            </div>

            <StatusBadge variant={allPassed ? 'success' : 'danger'}>
              {allPassed ? `اجتياز ${results.length}/${results.length}` : 'يوجد فشل'}
            </StatusBadge>
          </div>

          {/* Tests List */}
          <div className="space-y-4">
            {results.map((test, index) => (
              <div key={test.id} className="clinical-card p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--color-line)]">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-[8px] bg-[var(--color-surface-subtle)] text-[var(--color-ink)] text-[14px] font-bold num-tabular flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <h3 className="text-[16px] font-semibold text-[var(--color-ink)]">
                      {test.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[14px] num-tabular text-[var(--color-muted)] flex items-center gap-1">
                      <Clock className="w-4 h-4" strokeWidth={1.75} />
                      {test.durationMs} ms
                    </span>
                    <StatusBadge variant={test.passed ? 'success' : 'danger'} size="sm">
                      {test.passed
                        ? AR_STRINGS.selfTest.statusPassed
                        : AR_STRINGS.selfTest.statusFailed}
                    </StatusBadge>
                  </div>
                </div>

                {/* Execution logs */}
                <div
                  className="bg-[var(--color-ink)] text-[var(--color-surface)] p-4 rounded-[var(--radius-control)] text-[14px] space-y-1.5 leading-relaxed overflow-x-auto text-right"
                  dir="rtl"
                >
                  <div className="text-[var(--color-primary-soft)] font-semibold mb-1.5 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                    <span>{AR_STRINGS.selfTest.executionDetails}</span>
                  </div>
                  {test.details.map((d, i) => (
                    <div key={i} className="text-[var(--color-success-bg)] num-tabular" dir="auto">
                      {d}
                    </div>
                  ))}
                  {test.error && (
                    <div className="text-[var(--color-danger-bg)] font-bold" dir="auto">
                      ERROR: {test.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

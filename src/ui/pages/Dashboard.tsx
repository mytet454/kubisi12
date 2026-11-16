/**
 * src/ui/pages/Dashboard.tsx
 * Clinical Ledger Merchant Dashboard:
 * 1. "يحتاج تصرفاً اليوم" row: Low stock, Near expiry, Overdue customer debts, Unpaid supplier invoices
 *    (each card routes to the matching pre-filtered list; calm message when all are 0).
 * 2. 6 KPI tiles: مبيعات اليوم، ربح الشهر، رصيد الصندوق، ذمم العملاء، ذمم الموردين، قيمة المخزون.
 *    Every KPI comes directly from services.getDashboardData(); nothing recalculated in UI.
 * 3. 3 RTL-aware charts: Donut (Sales/COGS/Expenses/Profit with direct labels), Monthly Sales Bar,
 *    Top-5 Products chart — each with an Arabic text summary underneath for accessibility & quick scanning.
 */
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  CheckCircle2,
  Clock,
  CreditCard,
  Package,
  PieChart as PieIcon,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useNavigationIntent } from '../context/NavigationIntentContext';
import { MoneyText, formatWesternInt } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { KpiTile } from '../components/StatCard';
import { CardSkeleton } from '../components/Skeletons';
import { StatusBadge } from '../components/StatusBadge';

interface ActionCounts {
  lowStock: number;
  nearExpiry: number;
  overdueCustomers: number;
  unpaidSuppliers: number;
}

const CLINICAL_PIE_COLORS = [
  'var(--color-primary)',
  'var(--color-success-ink)',
  'var(--color-warning-ink)',
  'var(--color-danger-ink)',
];

export const Dashboard: React.FC = () => {
  const { user, office } = useAuth();
  const { navigateWithIntent } = useNavigationIntent();

  const [data, setData] = useState<any | null>(null);
  const [actionCounts, setActionCounts] = useState<ActionCounts>({
    lowStock: 0,
    nearExpiry: 0,
    overdueCustomers: 0,
    unpaidSuppliers: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const [dashRes, productsRes, salesRes, purchasesRes] = await Promise.all([
        services.getDashboardData(user),
        services.getProducts(user),
        services.getInvoices(user, { kind: 'sale' }),
        services.getInvoices(user, { kind: 'purchase' }),
      ]);

      setData(dashRes);
      setActionCounts({
        lowStock: productsRes.filter((p) => p.active && p.isLowStock).length,
        nearExpiry: productsRes.filter((p) => p.active && p.isNearExpiry).length,
        overdueCustomers: salesRes.filter((i) => i.status !== 'void' && i.total - i.paid > 0).length,
        unpaidSuppliers: purchasesRes.filter((i) => i.status !== 'void' && i.total - i.paid > 0).length,
      });
    } catch (err: any) {
      setError(
        err.message ||
          'تعذر تحميل بيانات لوحة التحكم لأن الخدمة لم تستجب. اضغط على إعادة المحاولة للتحديث.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [user]);

  if (loading) {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="pb-3 border-b border-[var(--color-line)] flex items-center justify-between">
          <div className="space-y-1.5">
            <h1 className="clinical-heading-1">لوحة التحكم اليومية</h1>
            <p className="text-[14px] text-[var(--color-muted)]">
              جارٍ تجهيز ملخص العمل ومؤشرات {office?.name || 'المكتب'}...
            </p>
          </div>
        </div>
        <CardSkeleton count={6} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="p-6 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-[var(--radius-card)] text-[var(--color-danger-ink)] space-y-3"
        dir="rtl"
        role="alert"
      >
        <h2 className="clinical-heading-3 text-[var(--color-danger-ink)]">
          تعذر تحميل لوحة التحكم
        </h2>
        <p className="text-[16px] clinical-prose">{error}</p>
        <Button variant="secondary" size="sm" onClick={loadDashboard}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  const totalActionsNeeded =
    actionCounts.lowStock +
    actionCounts.nearExpiry +
    actionCounts.overdueCustomers +
    actionCounts.unpaidSuppliers;

  const pieTotal = (data.pieChartData || []).reduce(
    (sum: number, item: any) => sum + (Number(item.value) || 0),
    0
  );
  const pieAbsTotal = (data.pieChartData || []).reduce(
    (sum: number, item: any) => sum + Math.abs(Number(item.value) || 0),
    0
  );

  const actionItems = [
    {
      key: 'low_stock',
      label: 'نقص المخزون',
      count: actionCounts.lowStock,
      hint: 'أصناف وصلت إلى حد الطلب',
      icon: <Package className="w-5 h-5" strokeWidth={1.75} />,
      tone: actionCounts.lowStock > 0 ? 'warning' : 'success',
      onClick: () =>
        navigateWithIntent('inventory', { subTab: 'products', filter: 'low_stock' }),
    },
    {
      key: 'near_expiry',
      label: 'قريب الانتهاء',
      count: actionCounts.nearExpiry,
      hint: 'وجبات تقترب من تاريخ الصلاحية',
      icon: <Clock className="w-5 h-5" strokeWidth={1.75} />,
      tone: actionCounts.nearExpiry > 0 ? 'warning' : 'success',
      onClick: () =>
        navigateWithIntent('inventory', { subTab: 'products', filter: 'near_expiry' }),
    },
    {
      key: 'overdue_customers',
      label: 'ديون عملاء مستحقة',
      count: actionCounts.overdueCustomers,
      hint: 'فواتير بيع آجلة بانتظار التحصيل',
      icon: <Users className="w-5 h-5" strokeWidth={1.75} />,
      tone: actionCounts.overdueCustomers > 0 ? 'danger' : 'success',
      onClick: () =>
        navigateWithIntent('invoices', { subTab: 'sales', filter: 'unpaid' }),
    },
    {
      key: 'unpaid_suppliers',
      label: 'فواتير موردين غير مسددة',
      count: actionCounts.unpaidSuppliers,
      hint: 'فواتير شراء مستحقة للدفع',
      icon: <CreditCard className="w-5 h-5" strokeWidth={1.75} />,
      tone: actionCounts.unpaidSuppliers > 0 ? 'danger' : 'success',
      onClick: () =>
        navigateWithIntent('invoices', { subTab: 'purchases', filter: 'unpaid' }),
    },
  ] as const;

  return (
    <div className="space-y-8" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
        <div>
          <h1 className="clinical-heading-1">لوحة التحكم اليومية</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
            متابعة العمل اليومي والأرصدة والمؤشرات المالية لـ {office?.name || 'المكتب الطبي'}
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={loadDashboard}
          leftIcon={<RefreshCw className="w-5 h-5" strokeWidth={1.75} />}
        >
          تحديث المؤشرات
        </Button>
      </div>

      {/* Section 1: Needs Action Today */}
      <section aria-labelledby="action-today-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="action-today-heading" className="clinical-heading-2">
            يحتاج تصرفاً اليوم
          </h2>
          {totalActionsNeeded > 0 && (
            <StatusBadge variant="warning" size="sm">
              {totalActionsNeeded} مهام للمراجعة
            </StatusBadge>
          )}
        </div>

        {totalActionsNeeded === 0 ? (
          <div className="clinical-card p-5 flex items-center gap-3 border border-[var(--color-success-border)] bg-[var(--color-success-bg)]/50">
            <CheckCircle2
              className="w-6 h-6 text-[var(--color-success-ink)] shrink-0"
              strokeWidth={1.75}
            />
            <div>
              <p className="text-[16px] font-semibold text-[var(--color-success-ink)]">
                لا يوجد شيء يحتاج تصرفاً اليوم
              </p>
              <p className="text-[14px] text-[var(--color-muted)]">
                المخزون والصلاحية وذمم الفواتير كلها ضمن الوضع الآمن.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {actionItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className="clinical-card p-4 text-right flex flex-col justify-between gap-3 hover:bg-[var(--color-surface-subtle)]/50 clinical-press clinical-focus cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-[var(--color-ink)]">
                    {item.label}
                  </span>
                  <span
                    className={`w-10 h-10 rounded-[var(--radius-control)] flex items-center justify-center shrink-0 ${
                      item.count === 0
                        ? 'bg-[var(--color-success-bg)] text-[var(--color-success-ink)]'
                        : item.tone === 'danger'
                        ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger-ink)]'
                        : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-ink)]'
                    }`}
                  >
                    {item.icon}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[28px] font-bold num-tabular text-[var(--color-ink)] leading-none">
                    {item.count}
                  </span>
                  <span className="text-[14px] font-semibold text-[var(--color-primary-strong)]">
                    مراجعة القائمة ←
                  </span>
                </div>

                <p className="text-[14px] text-[var(--color-muted)]">{item.hint}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: 6 KPI Tiles */}
      <section aria-labelledby="kpi-heading" className="space-y-3">
        <h2 id="kpi-heading" className="clinical-heading-2">
          المؤشرات المالية والمخزنية
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiTile
            title="مبيعات اليوم"
            value={<MoneyText amount={data.todaySales} size="xl" tone="ink" />}
            subtitle="إجمالي فواتير البيع المعتمدة اليوم"
            icon={<ShoppingBag className="w-5 h-5" strokeWidth={1.75} />}
            variant="teal"
            onClick={() => navigateWithIntent('invoices', { subTab: 'sales' })}
          />

          <KpiTile
            title="ربح الشهر"
            value={
              <MoneyText
                amount={data.monthProfit}
                size="xl"
                tone={data.monthProfit >= 0 ? 'success' : 'danger'}
              />
            }
            subtitle="صافي الربح: المبيعات مطروحاً منها التكلفة والمصاريف"
            icon={<TrendingUp className="w-5 h-5" strokeWidth={1.75} />}
            variant="success"
            onClick={() => navigateWithIntent('accounting')}
          />

          <KpiTile
            title="رصيد الصندوق"
            value={<MoneyText amount={data.cashBalance} size="xl" tone="ink" />}
            subtitle="الرصيد النقدي الفعلي في الخزينة (101)"
            icon={<Wallet className="w-5 h-5" strokeWidth={1.75} />}
            variant="slate"
            onClick={() => navigateWithIntent('accounting')}
          />

          <KpiTile
            title="ذمم العملاء"
            value={<MoneyText amount={data.receivables} size="xl" tone="primary" />}
            subtitle="مبالغ مستحقة لنا لدى المستشفيات والعملاء"
            icon={<Users className="w-5 h-5" strokeWidth={1.75} />}
            variant="teal"
            onClick={() => navigateWithIntent('parties', { subTab: 'customers' })}
          />

          <KpiTile
            title="ذمم الموردين"
            value={<MoneyText amount={data.payables} size="xl" tone="warning" />}
            subtitle="مبالغ مستحقة علينا للشركات الموردة"
            icon={<Banknote className="w-5 h-5" strokeWidth={1.75} />}
            variant="amber"
            onClick={() => navigateWithIntent('parties', { subTab: 'suppliers' })}
          />

          <KpiTile
            title="قيمة المخزون"
            value={<MoneyText amount={data.stockValue} size="xl" tone="ink" />}
            subtitle="التقييم الحالي بالمتوسط المرجح للتكلفة"
            icon={<Package className="w-5 h-5" strokeWidth={1.75} />}
            variant="slate"
            onClick={() => navigateWithIntent('inventory')}
          />
        </div>
      </section>

      {/* Section 3: 3 RTL-Aware Charts with Text Summaries */}
      <section aria-labelledby="charts-heading" className="space-y-4">
        <h2 id="charts-heading" className="clinical-heading-2">
          التحليل المالي وحركة الأصناف
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Revenue / Cost / Expenses / Profit Donut */}
          <div className="clinical-card p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-line)]">
              <div className="flex items-center gap-2">
                <PieIcon className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
                <h3 className="clinical-heading-3">توزيع الإيرادات والتكاليف والربح</h3>
              </div>
              <MoneyText amount={pieTotal} size="sm" tone="muted" />
            </div>

            {(() => {
              const positiveSlices = (data.pieChartData || []).filter(
                (s: any) => Number(s.value) > 0
              );
              if (positiveSlices.length === 0) {
                return (
                  <div className="h-60 w-full rounded-[var(--radius-control)] border border-dashed border-[var(--color-line)] bg-[var(--color-canvas)] flex flex-col items-center justify-center text-center px-4 gap-2">
                    <PieIcon
                      className="w-8 h-8 text-[var(--color-muted)]"
                      strokeWidth={1.75}
                    />
                    <p className="text-[14px] font-semibold text-[var(--color-ink)]">
                      لا توجد مبالغ موجبة كافية لرسم التوزيع الدائري
                    </p>
                    <p className="text-[13px] text-[var(--color-muted)]">
                      التفاصيل الرقمية الدقيقة معروضة أدناه من محرك المحاسبة
                    </p>
                  </div>
                );
              }
              return (
                <div className="h-60 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={positiveSlices}
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={82}
                        paddingAngle={3}
                        dataKey="value"
                        isAnimationActive={false}
                      >
                        {positiveSlices.map((_: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CLINICAL_PIE_COLORS[index % CLINICAL_PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any) => [
                          `${formatWesternInt(Number(value))} د.ع`,
                          'المبلغ',
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* Direct Labels & Arabic Text Summary */}
            <div className="space-y-2 pt-3 border-t border-[var(--color-line)]">
              {data.pieChartData.map((slice: any, index: number) => {
                const pct =
                  pieAbsTotal > 0 ? Math.round((Math.abs(slice.value) / pieAbsTotal) * 100) : 0;
                return (
                  <div
                    key={slice.name}
                    className="flex items-center justify-between gap-3 text-[14px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-[4px] shrink-0"
                        style={{
                          backgroundColor:
                            CLINICAL_PIE_COLORS[index % CLINICAL_PIE_COLORS.length],
                        }}
                        aria-hidden="true"
                      />
                      <span className="font-semibold text-[var(--color-ink)] truncate">
                        {slice.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="num-tabular text-[var(--color-muted)]">{pct}%</span>
                      <MoneyText amount={slice.value} size="sm" />
                    </div>
                  </div>
                );
              })}
              <p className="text-[14px] text-[var(--color-muted)] pt-1 clinical-prose">
                الملخص: بلغ إجمالي مكونات المبيعات الشهرية{' '}
                <span className="num-tabular font-semibold text-[var(--color-ink)]">
                  {formatWesternInt(pieTotal)}
                </span>{' '}
                د.ع، منها صافي ربح{' '}
                <span className="num-tabular font-semibold text-[var(--color-success-ink)]">
                  {formatWesternInt(data.monthProfit)}
                </span>{' '}
                د.ع.
              </p>
            </div>
          </div>

          {/* Chart 2: Monthly Sales Bar Chart */}
          <div className="clinical-card p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-line)]">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
                <h3 className="clinical-heading-3">المبيعات الشهرية (آخر 6 أشهر)</h3>
              </div>
              <span className="text-[14px] text-[var(--color-muted)]">د.ع</span>
            </div>

            <div className="h-60 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.monthlySalesBarData}
                  margin={{ top: 8, right: 12, left: 12, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--color-line)"
                  />
                  <XAxis
                    dataKey="month"
                    stroke="var(--color-muted)"
                    fontSize={13}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--color-muted)"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
                  />
                  <Tooltip
                    formatter={(val: any) => [
                      `${formatWesternInt(Number(val))} د.ع`,
                      'المبيعات',
                    ]}
                  />
                  <Bar
                    dataKey="sales"
                    fill="var(--color-primary)"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="pt-3 border-t border-[var(--color-line)] text-[14px] text-[var(--color-muted)] clinical-prose">
              {(() => {
                const bars = data.monthlySalesBarData || [];
                const latest = bars[bars.length - 1];
                const peak = bars.reduce(
                  (best: any, cur: any) => (!best || cur.sales > best.sales ? cur : best),
                  null
                );
                return (
                  <p>
                    الملخص: سجّل الشهر الحالي ({latest?.month || '—'}) مبيعات بقيمة{' '}
                    <span className="num-tabular font-semibold text-[var(--color-ink)]">
                      {formatWesternInt(latest?.sales || 0)}
                    </span>{' '}
                    د.ع، وأعلى ذروة كانت في {peak?.month || '—'} بقيمة{' '}
                    <span className="num-tabular font-semibold text-[var(--color-ink)]">
                      {formatWesternInt(peak?.sales || 0)}
                    </span>{' '}
                    د.ع.
                  </p>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Chart 3: Top 5 Products Chart + Tabular Summary */}
        <div className="clinical-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--color-line)]">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-[var(--color-primary)]" strokeWidth={1.75} />
              <h3 className="clinical-heading-3">أعلى 5 أصناف طبية مبيعاً</h3>
            </div>
            <span className="text-[14px] text-[var(--color-muted)]">حسب الكمية والإيراد</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="h-60 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.topProductsData}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 16, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="var(--color-line)"
                  />
                  <XAxis
                    type="number"
                    stroke="var(--color-muted)"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={145}
                    stroke="var(--color-ink)"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 18) + '…' : v)}
                  />
                  <Tooltip
                    formatter={(val: any) => [`${formatWesternInt(Number(val))} وحدة`, 'الكمية']}
                  />
                  <Bar
                    dataKey="quantity"
                    fill="var(--color-primary-strong)"
                    radius={[0, 6, 6, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="divide-y divide-[var(--color-line)] border border-[var(--color-line)] rounded-[var(--radius-control)] overflow-hidden">
              {data.topProductsData.map((item: any, idx: number) => (
                <div
                  key={item.name}
                  className="px-4 py-3 bg-[var(--color-surface)] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-[8px] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] flex items-center justify-center font-bold text-[14px] num-tabular shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-[15px] font-semibold text-[var(--color-ink)] truncate">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-[14px] text-[var(--color-muted)] num-tabular">
                      {item.quantity} وحدة
                    </span>
                    <MoneyText amount={item.revenue} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[14px] text-[var(--color-muted)] pt-2 border-t border-[var(--color-line)] clinical-prose">
            الملخص: يتصدر الصنف &quot;{data.topProductsData[0]?.name || '—'}&quot; المبيعات بكمية{' '}
            <span className="num-tabular font-semibold text-[var(--color-ink)]">
              {formatWesternInt(data.topProductsData[0]?.quantity || 0)}
            </span>{' '}
            وحدة وبإيراد قدره{' '}
            <span className="num-tabular font-semibold text-[var(--color-ink)]">
              {formatWesternInt(data.topProductsData[0]?.revenue || 0)}
            </span>{' '}
            د.ع.
          </p>
        </div>
      </section>
    </div>
  );
};

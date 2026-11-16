/**
 * src/ui/pages/Inventory.tsx
 * Clinical Ledger Inventory Screen:
 * - Consumes NavigationIntent (subTab: 'products' | 'warehouses' | 'movements' | 'alerts', filter: 'low_stock' | 'near_expiry')
 * - Unified List Pattern + full Product Detail Page (Header + StatusBadge + Tabs: الوجبات / حركات المخزون)
 * - Blur validation with 3-part errors (what + why + fix) & proper inputMode
 * - Strict role rules preserved: Warehouse Keeper & Cashier NEVER see purchasePrice / avgCost.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Eye,
  History,
  Layers,
  Package,
  Plus,
  Power,
  RefreshCw,
} from 'lucide-react';
import { Notification, ProductStockInfo, Warehouse } from '../../domain/types';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useNavigationIntent } from '../context/NavigationIntentContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { MoneyText } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { Column, DataTable, RowAction } from '../components/DataTable';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { MoneyInput } from '../components/MoneyInput';
import { Select } from '../components/Select';
import { TableSkeleton } from '../components/Skeletons';
import { KpiTile } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs, TabItem } from '../components/Tabs';

export const Inventory: React.FC = () => {
  const { user } = useAuth();
  const { intent, consumeIntent } = useNavigationIntent();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('products');
  const [productFilter, setProductFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductStockInfo[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Detail Page State
  const [detailProduct, setDetailProduct] = useState<ProductStockInfo | null>(null);
  const [detailTab, setDetailTab] = useState<'batches' | 'movements'>('batches');

  // Modals
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showAddWarehouseModal, setShowAddWarehouseModal] = useState(false);
  const [showAddBatchModal, setShowAddBatchModal] = useState(false);

  // New Product Form + blur errors
  const [prodName, setProdName] = useState('');
  const [prodUnit, setProdUnit] = useState('علبة');
  const [prodPurchasePrice, setProdPurchasePrice] = useState<number>(0);
  const [prodSalePrice, setProdSalePrice] = useState<number>(0);
  const [prodReorderLevel, setProdReorderLevel] = useState<number>(20);
  const [prodErrors, setProdErrors] = useState<{
    name?: string;
    unit?: string;
    salePrice?: string;
  }>({});
  const [isSubmittingProd, setIsSubmittingProd] = useState(false);

  // New Warehouse Form + blur errors
  const [whName, setWhName] = useState('');
  const [whCity, setWhCity] = useState('');
  const [whIsDefault, setWhIsDefault] = useState(false);
  const [whErrors, setWhErrors] = useState<{ name?: string; city?: string }>({});
  const [isSubmittingWh, setIsSubmittingWh] = useState(false);

  // New Batch Form + blur errors
  const [batchProdId, setBatchProdId] = useState('');
  const [batchWhId, setBatchWhId] = useState('');
  const [batchLot, setBatchLot] = useState('');
  const [batchExpiry, setBatchExpiry] = useState('');
  const [batchErrors, setBatchErrors] = useState<{ lot?: string; expiry?: string }>({});
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  const isWarehouseKeeper = user?.role === 'warehouse_keeper';
  const isCashier = user?.role === 'cashier';
  const canManageProducts = user?.role === 'owner' || user?.role === 'accountant';

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [prods, whs, notifs] = await Promise.all([
        services.getProducts(user),
        services.getWarehouses(user),
        services.getNotifications(user),
      ]);
      setProducts(prods);
      setWarehouses(whs);
      setNotifications(notifs);

      if (detailProduct) {
        const refreshed = prods.find((p) => p.id === detailProduct.id) || null;
        setDetailProduct(refreshed);
      }

      if (!isCashier) {
        const movs = await services.getStockMovements(user);
        setMovements(movs);
      }
    } catch (err: any) {
      const msg = err.message || 'تعذر تحميل بيانات المستودع. أعد المحاولة.';
      setLoadError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, isCashier, detailProduct?.id]);

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    if (!intent || intent.target !== 'inventory') return;
    const consumed = consumeIntent('inventory');
    if (!consumed) return;

    setDetailProduct(null);
    if (consumed.subTab) {
      setActiveTab(consumed.subTab);
    }
    if (consumed.filter) {
      setProductFilter(consumed.filter);
    }
  }, [intent, consumeIntent]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const nextErrs = {
      name: !prodName.trim()
        ? 'اسم المادة الطبية مطلوب؛ لأنه يظهر في الفواتير والجرد. أدخل الاسم العلمي أو التجاري.'
        : undefined,
      unit: !prodUnit.trim()
        ? 'وحدة القياس مطلوبة (مثال: علبة أو قنينة). أدخل الوحدة للمتابعة.'
        : undefined,
      salePrice:
        prodSalePrice <= 0
          ? 'سعر البيع يجب أن يكون أكبر من صفر؛ لتسعير فواتير البيع بشكل صحيح.'
          : undefined,
    };
    setProdErrors(nextErrs);
    if (nextErrs.name || nextErrs.unit || nextErrs.salePrice) return;

    setIsSubmittingProd(true);
    try {
      await services.createProduct(user, {
        name: prodName.trim(),
        unit: prodUnit.trim(),
        purchasePrice: prodPurchasePrice,
        salePrice: prodSalePrice,
        reorderLevel: prodReorderLevel,
      });
      showToast(AR_STRINGS.inventory.productCreated, 'success');
      setShowAddProductModal(false);
      setProdName('');
      setProdPurchasePrice(0);
      setProdSalePrice(0);
      setProdErrors({});
      loadData();
    } catch (err: any) {
      showToast(err.message || 'تعذر حفظ المادة الطبية.', 'error');
    } finally {
      setIsSubmittingProd(false);
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const nextErrs = {
      name: !whName.trim() ? 'اسم المستودع مطلوب؛ لتحديد موقع تخزين الوجبات.' : undefined,
      city: !whCity.trim() ? 'المدينة أو المنطقة مطلوبة؛ أدخل عنوان المستودع.' : undefined,
    };
    setWhErrors(nextErrs);
    if (nextErrs.name || nextErrs.city) return;

    setIsSubmittingWh(true);
    try {
      await services.createWarehouse(user, {
        name: whName.trim(),
        city: whCity.trim(),
        isDefault: whIsDefault,
      });
      showToast(AR_STRINGS.inventory.warehouseCreated, 'success');
      setShowAddWarehouseModal(false);
      setWhName('');
      setWhCity('');
      setWhErrors({});
      loadData();
    } catch (err: any) {
      showToast(err.message || 'تعذر حفظ المستودع.', 'error');
    } finally {
      setIsSubmittingWh(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const nextErrs = {
      lot: !batchLot.trim() ? 'رقم الوجبة مطلوب؛ لتتبع الصلاحية أثناء الصرف.' : undefined,
      expiry: !batchExpiry ? 'تاريخ الانتهاء مطلوب؛ لتفعيل تنبيهات قرب الانتهاء.' : undefined,
    };
    setBatchErrors(nextErrs);
    if (!batchProdId || !batchWhId || nextErrs.lot || nextErrs.expiry) return;

    setIsSubmittingBatch(true);
    try {
      await services.createBatch(user, {
        productId: batchProdId,
        warehouseId: batchWhId,
        lotNumber: batchLot.trim(),
        expiryDate: batchExpiry,
      });
      showToast(AR_STRINGS.inventory.batchCreated, 'success');
      setShowAddBatchModal(false);
      setBatchLot('');
      setBatchExpiry('');
      setBatchErrors({});
      loadData();
    } catch (err: any) {
      showToast(err.message || 'تعذر حفظ الوجبة.', 'error');
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  const handleToggleDeactivate = async (productId: string) => {
    if (!user) return;
    try {
      const updated = await services.deactivateProduct(user, productId);
      showToast(
        updated.active ? 'تم إعادة تفعيل المادة الطبية' : AR_STRINGS.inventory.cannotDeleteUsedProduct,
        'info'
      );
      loadData();
    } catch (err: any) {
      showToast(err.message || 'تعذر تغيير حالة المادة.', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    try {
      await services.markAllNotificationsRead(user);
      showToast('تم تحديد جميع التنبيهات كمقروءة', 'success');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const filteredProducts = useMemo(() => {
    if (productFilter === 'low_stock') return products.filter((p) => p.active && p.isLowStock);
    if (productFilter === 'near_expiry') return products.filter((p) => p.active && p.isNearExpiry);
    if (productFilter === 'inactive') return products.filter((p) => !p.active);
    return products;
  }, [products, productFilter]);

  const renderProductStatus = (item: ProductStockInfo) => {
    if (!item.active) {
      return (
        <StatusBadge variant="danger" size="sm">
          {AR_STRINGS.inventory.inactive}
        </StatusBadge>
      );
    }
    if (item.isLowStock) {
      return (
        <StatusBadge variant="warning" size="sm">
          {AR_STRINGS.inventory.lowStockBadge}
        </StatusBadge>
      );
    }
    if (item.isNearExpiry) {
      return (
        <StatusBadge variant="warning" size="sm">
          {AR_STRINGS.inventory.nearExpiryBadge}
        </StatusBadge>
      );
    }
    return (
      <StatusBadge variant="success" size="sm">
        {AR_STRINGS.inventory.healthyBadge}
      </StatusBadge>
    );
  };

  const tabs: TabItem[] = [
    {
      key: 'products',
      label: AR_STRINGS.inventory.productsTab,
      icon: <Package className="w-5 h-5" strokeWidth={1.75} />,
    },
    {
      key: 'warehouses',
      label: AR_STRINGS.inventory.warehousesTab,
      icon: <Building2 className="w-5 h-5" strokeWidth={1.75} />,
    },
    ...(!isCashier
      ? [
          {
            key: 'movements',
            label: AR_STRINGS.inventory.movementsTab,
            icon: <History className="w-5 h-5" strokeWidth={1.75} />,
          },
        ]
      : []),
    {
      key: 'alerts',
      label: AR_STRINGS.inventory.alertsTab,
      icon: <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />,
      count: notifications.filter((n) => !n.read).length,
    },
  ];

  const productColumns: Column<ProductStockInfo>[] = [
    {
      key: 'name',
      header: AR_STRINGS.inventory.productName,
      sortable: true,
      mobilePriority: 1,
      searchValue: (item) => `${item.name} ${item.unit}`,
      render: (item) => (
        <div>
          <p className="font-semibold text-[var(--color-ink)]">{item.name}</p>
          <p className="text-[14px] text-[var(--color-muted)]">
            {item.unit} • {item.batches.length} وجبات
          </p>
        </div>
      ),
    },
    {
      key: 'quantityOnHand',
      header: AR_STRINGS.inventory.quantityOnHand,
      sortable: true,
      mobilePriority: 2,
      render: (item) => (
        <div>
          <span
            className={`num-tabular font-bold ${
              item.isLowStock ? 'text-[var(--color-danger-ink)]' : 'text-[var(--color-ink)]'
            }`}
          >
            {item.quantityOnHand}
          </span>{' '}
          <span className="text-[14px] text-[var(--color-muted)]">{item.unit}</span>
        </div>
      ),
    },
    {
      key: 'salePrice',
      header: AR_STRINGS.inventory.salePrice,
      sortable: true,
      align: 'left',
      mobilePriority: 'hide',
      render: (item) => <MoneyText amount={item.salePrice} size="sm" />,
    },
    ...(!isWarehouseKeeper && !isCashier
      ? [
          {
            key: 'purchasePrice',
            header: AR_STRINGS.inventory.purchasePrice,
            sortable: true,
            align: 'left' as const,
            mobilePriority: 'hide' as const,
            render: (item: ProductStockInfo) => (
              <MoneyText amount={item.purchasePrice} size="sm" tone="muted" />
            ),
          },
          {
            key: 'avgCost',
            header: AR_STRINGS.inventory.avgCost,
            sortable: true,
            align: 'left' as const,
            mobilePriority: 'hide' as const,
            render: (item: ProductStockInfo) => (
              <MoneyText amount={item.avgCost} size="sm" tone="primary" />
            ),
          },
        ]
      : []),
    {
      key: 'status',
      header: AR_STRINGS.inventory.status,
      mobilePriority: 'status',
      render: (item) => renderProductStatus(item),
    },
  ];

  const getProductActions = (item: ProductStockInfo): RowAction<ProductStockInfo>[] => [
    {
      key: 'batches',
      label: 'فتح ملف المادة والوجبات',
      icon: <Eye className="w-4 h-4" strokeWidth={1.75} />,
      onClick: () => {
        setDetailTab('batches');
        setDetailProduct(item);
      },
    },
    {
      key: 'toggle',
      label: item.active ? AR_STRINGS.inventory.deactivate : AR_STRINGS.inventory.activate,
      icon: <Power className="w-4 h-4" strokeWidth={1.75} />,
      hidden: () => !canManageProducts,
      onClick: () => handleToggleDeactivate(item.id),
    },
  ];

  const movementColumns: Column<any>[] = [
    {
      key: 'date',
      header: AR_STRINGS.inventory.date,
      sortable: true,
      mobilePriority: 'hide',
      render: (item) => (
        <span className="num-tabular text-[14px] text-[var(--color-muted)]">
          {new Date(item.date).toLocaleDateString('ar-IQ')}
        </span>
      ),
    },
    {
      key: 'type',
      header: AR_STRINGS.inventory.movementType,
      mobilePriority: 'status',
      render: (item) => {
        const isPositive = item.quantity > 0;
        return (
          <StatusBadge
            variant={isPositive ? 'success' : 'danger'}
            size="sm"
            icon={
              isPositive ? (
                <ArrowDownLeft className="w-4 h-4" strokeWidth={1.75} />
              ) : (
                <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              )
            }
          >
            {item.type === 'purchase'
              ? 'فاتورة شراء'
              : item.type === 'sale'
              ? 'فاتورة بيع'
              : item.type === 'adjustment'
              ? 'تسوية مخزون'
              : item.type}
          </StatusBadge>
        );
      },
    },
    {
      key: 'productId',
      header: AR_STRINGS.inventory.productName,
      mobilePriority: 1,
      searchValue: (item) => products.find((p) => p.id === item.productId)?.name || '',
      render: (item) => (
        <span className="font-semibold text-[var(--color-ink)]">
          {products.find((p) => p.id === item.productId)?.name || item.productId}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: AR_STRINGS.inventory.movementQty,
      align: 'left',
      mobilePriority: 2,
      render: (item) => (
        <span
          className={`num-tabular font-bold ${
            item.quantity > 0 ? 'text-[var(--color-success-ink)]' : 'text-[var(--color-danger-ink)]'
          }`}
        >
          {item.quantity > 0 ? `+${item.quantity}` : item.quantity}
        </span>
      ),
    },
    {
      key: 'refId',
      header: AR_STRINGS.inventory.reference,
      mobilePriority: 'hide',
      render: (item) => (
        <span className="num-tabular text-[14px] text-[var(--color-muted)]">
          {item.refType}: {item.refId}
        </span>
      ),
    },
  ];

  // ==========================================
  // PRODUCT DETAIL PAGE
  // ==========================================
  if (detailProduct) {
    const productMovements = movements.filter((m) => m.productId === detailProduct.id);
    const detailTabs: TabItem[] = [
      {
        key: 'batches',
        label: 'الوجبات والدفعات',
        icon: <Layers className="w-5 h-5" strokeWidth={1.75} />,
        count: detailProduct.batches.length,
      },
      ...(!isCashier
        ? [
            {
              key: 'movements',
              label: 'حركات المخزون',
              icon: <History className="w-5 h-5" strokeWidth={1.75} />,
              count: productMovements.length,
            },
          ]
        : []),
    ];

    return (
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetailProduct(null)}
              leftIcon={<ArrowRight className="w-5 h-5" strokeWidth={1.75} />}
            >
              رجوع
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="clinical-heading-1">{detailProduct.name}</h1>
                {renderProductStatus(detailProduct)}
              </div>
              <p className="text-[14px] text-[var(--color-muted)] mt-1">
                الوحدة: {detailProduct.unit} · حد إعادة الطلب:{' '}
                <span className="num-tabular font-semibold">{detailProduct.reorderLevel}</span>
              </p>
            </div>
          </div>

          {!isCashier && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setBatchProdId(detailProduct.id);
                if (warehouses.length > 0) setBatchWhId(warehouses[0].id);
                setBatchErrors({});
                setShowAddBatchModal(true);
              }}
              leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
            >
              {AR_STRINGS.inventory.addBatch}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiTile
            title="إجمالي الرصيد المتاح"
            value={`${detailProduct.quantityOnHand} ${detailProduct.unit}`}
            variant={detailProduct.isLowStock ? 'amber' : 'teal'}
          />
          <KpiTile
            title="سعر البيع المعتمد"
            value={<MoneyText amount={detailProduct.salePrice} size="xl" />}
            variant="slate"
          />
          {!isWarehouseKeeper && !isCashier && (
            <KpiTile
              title="متوسط التكلفة المرجح (WAC)"
              value={<MoneyText amount={detailProduct.avgCost} size="xl" tone="primary" />}
              variant="success"
            />
          )}
        </div>

        <Tabs
          tabs={detailTabs}
          activeKey={detailTab}
          onChange={(k) => setDetailTab(k as 'batches' | 'movements')}
        />

        {detailTab === 'batches' ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[14px]">
                <thead className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] text-[var(--color-muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      رقم الوجبة
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      المستودع
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      تاريخ الانتهاء
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold text-left">
                      الكمية المتوفرة
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      الحالة
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]">
                  {detailProduct.batches.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)]">
                        لا توجد وجبات مسجلة لهذه المادة بعد.
                      </td>
                    </tr>
                  ) : (
                    detailProduct.batches.map((b) => (
                      <tr key={b.id}>
                        <td className="px-4 py-3 font-semibold num-tabular text-[var(--color-ink)]">
                          {b.lotNumber}
                        </td>
                        <td className="px-4 py-3 text-[var(--color-muted)]">
                          {warehouses.find((w) => w.id === b.warehouseId)?.name || b.warehouseId}
                        </td>
                        <td className="px-4 py-3 num-tabular">
                          {b.expiryDate} ({b.daysToExpiry} يوم)
                        </td>
                        <td className="px-4 py-3 text-left font-bold num-tabular">
                          {b.quantityOnHand} {detailProduct.unit}
                        </td>
                        <td className="px-4 py-3">
                          {b.daysToExpiry <= 0 ? (
                            <StatusBadge variant="danger" size="sm">
                              منتهي
                            </StatusBadge>
                          ) : b.daysToExpiry <= 90 ? (
                            <StatusBadge variant="warning" size="sm">
                              قريب الانتهاء
                            </StatusBadge>
                          ) : (
                            <StatusBadge variant="success" size="sm">
                              ساري
                            </StatusBadge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <DataTable
            data={productMovements}
            columns={movementColumns}
            keyExtractor={(item) => item.id}
            title={`حركات المخزون — ${detailProduct.name}`}
            exportFileName={`movements_${detailProduct.id}`}
            dateAccessor={(item) => item.date}
            emptyTitle="لا توجد حركات مسجلة لهذه المادة"
            emptyDescription="تُضاف الحركات تلقائياً عند حفظ فاتورة شراء أو بيع."
          />
        )}
      </div>
    );
  }

  // ==========================================
  // LIST VIEW
  // ==========================================
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
        <div>
          <h1 className="clinical-heading-1">{AR_STRINGS.inventory.title}</h1>
          <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
            {AR_STRINGS.inventory.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isCashier && (
            <Button
              variant="secondary"
              onClick={() => {
                if (products.length > 0 && warehouses.length > 0) {
                  setBatchProdId(products[0].id);
                  setBatchWhId(warehouses[0].id);
                }
                setBatchErrors({});
                setShowAddBatchModal(true);
              }}
              leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
            >
              {AR_STRINGS.inventory.addBatch}
            </Button>
          )}

          {canManageProducts && (
            <Button
              variant="primary"
              onClick={() => {
                setProdErrors({});
                setShowAddProductModal(true);
              }}
              leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
            >
              {AR_STRINGS.inventory.addProduct}
            </Button>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      {loadError ? (
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
                تعذر تحميل بيانات المستودع
              </h2>
              <p className="text-[14px] text-[var(--color-ink)] mt-0.5">{loadError}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={loadData}
            leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          {activeTab === 'products' && (
            <DataTable<ProductStockInfo>
              data={filteredProducts}
              columns={productColumns}
              keyExtractor={(item) => item.id}
              title="المواد والأرصدة الطبية"
              exportFileName="medical_products_stock"
              filterOptions={[
                { label: 'نقص مخزون', value: 'low_stock' },
                { label: 'قريب الانتهاء', value: 'near_expiry' },
                { label: 'معطل', value: 'inactive' },
              ]}
              filterValue={productFilter}
              onFilterChange={setProductFilter}
              rowActions={getProductActions}
              previewTitle={(item) => item.name}
              previewSubtitle={(item) => `الرصيد المتاح: ${item.quantityOnHand} ${item.unit}`}
              previewFullPageLabel="فتح الصفحة كاملة"
              onOpenFullPage={(item) => {
                setDetailTab('batches');
                setDetailProduct(item);
              }}
              renderPreview={(item) => (
                <div className="space-y-4">
                  <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] space-y-2 text-[14px]">
                    <div className="flex justify-between">
                      <span className="text-[var(--color-muted)]">الرصيد المتاح:</span>
                      <span className="font-bold num-tabular text-[var(--color-ink)]">
                        {item.quantityOnHand} {item.unit}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--color-muted)]">حد إعادة الطلب:</span>
                      <span className="num-tabular">{item.reorderLevel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--color-muted)]">سعر البيع:</span>
                      <MoneyText amount={item.salePrice} size="sm" />
                    </div>
                    {!isWarehouseKeeper && !isCashier && (
                      <div className="flex justify-between">
                        <span className="text-[var(--color-muted)]">متوسط التكلفة:</span>
                        <MoneyText amount={item.avgCost} size="sm" tone="primary" />
                      </div>
                    )}
                  </div>

                  <div className="border border-[var(--color-line)] rounded-[var(--radius-control)] overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-[var(--color-surface-subtle)] border-b border-[var(--color-line)] text-[14px] font-semibold">
                      الوجبات المتوفرة ({item.batches.length})
                    </div>
                    {item.batches.length === 0 ? (
                      <p className="p-4 text-[14px] text-[var(--color-muted)] text-center">
                        لا توجد وجبات مسجلة لهذه المادة.
                      </p>
                    ) : (
                      <div className="divide-y divide-[var(--color-line)]">
                        {item.batches.map((b) => (
                          <div
                            key={b.id}
                            className="p-3 flex items-center justify-between gap-2 text-[14px]"
                          >
                            <div>
                              <span className="font-semibold num-tabular block text-[var(--color-ink)]">
                                {b.lotNumber}
                              </span>
                              <span className="text-[var(--color-muted)] num-tabular">
                                انتهاء: {b.expiryDate} ({b.daysToExpiry} يوم)
                              </span>
                            </div>
                            <span className="num-tabular font-bold text-[var(--color-ink)]">
                              {b.quantityOnHand} {item.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              emptyTitle="لا توجد مواد مطابقة"
              emptyDescription="تعرض هذه الشاشة المواد الطبية وأرصدة وجباتها في المستودع؛ أضف أول مادة طبية للبدء."
              emptyActionLabel={canManageProducts ? AR_STRINGS.inventory.addProduct : undefined}
              onEmptyAction={canManageProducts ? () => setShowAddProductModal(true) : undefined}
            />
          )}

          {activeTab === 'warehouses' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--color-line)]">
                <div>
                  <h2 className="clinical-heading-3">مستودعات وفروع المكتب</h2>
                  <p className="text-[14px] text-[var(--color-muted)]">
                    مواقع التخزين المعتمدة لاستلام وجبات المشتريات
                  </p>
                </div>
                {canManageProducts && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setWhErrors({});
                      setShowAddWarehouseModal(true);
                    }}
                    leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
                  >
                    {AR_STRINGS.inventory.addWarehouse}
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {warehouses.map((wh) => (
                  <div key={wh.id} className="clinical-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-[var(--radius-control)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] flex items-center justify-center">
                        <Building2 className="w-5 h-5" strokeWidth={1.75} />
                      </div>
                      {wh.isDefault && (
                        <StatusBadge variant="teal" size="sm">
                          المستودع الرئيسي
                        </StatusBadge>
                      )}
                    </div>
                    <div>
                      <h3 className="clinical-heading-3">{wh.name}</h3>
                      <p className="text-[14px] text-[var(--color-muted)] mt-0.5">{wh.city}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'movements' && !isCashier && (
            <DataTable
              data={movements}
              columns={movementColumns}
              keyExtractor={(item) => item.id}
              title="سجل حركات الإدخال والإخراج"
              exportFileName="stock_movements"
              dateAccessor={(item) => item.date}
              emptyTitle="لا توجد حركات مستودع"
              emptyDescription="تعرض هذه الشاشة حركات التوريد والصرف؛ تبدأ عند تسجيل أول فاتورة شراء أو بيع."
            />
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--color-line)]">
                <h2 className="clinical-heading-3">تنبيهات نقص المخزون وقرب الانتهاء</h2>
                <Button variant="secondary" size="sm" onClick={handleMarkAllRead}>
                  تحديد الكل كمقروء
                </Button>
              </div>

              {notifications.length === 0 ? (
                <div className="clinical-card p-8 text-center text-[var(--color-muted)]">
                  لا توجد تنبيهات نشطة حالياً؛ جميع الأصناف بأرصدة آمنة وصلاحية سارية.
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-line)] bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-card)] overflow-hidden">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-4 flex items-start justify-between gap-3 ${
                        n.read ? 'opacity-75' : 'bg-[var(--color-warning-bg)]/35'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-9 h-9 rounded-[var(--radius-control)] bg-[var(--color-warning-bg)] text-[var(--color-warning-ink)] flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
                        </span>
                        <div>
                          <p className="text-[16px] font-medium text-[var(--color-ink)]">
                            {n.text}
                          </p>
                          <span className="text-[14px] num-tabular text-[var(--color-muted)]">
                            {new Date(n.createdAt).toLocaleTimeString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                      {!n.read && (
                        <StatusBadge variant="warning" size="sm">
                          جديد
                        </StatusBadge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add Product Modal */}
      <Modal
        isOpen={showAddProductModal}
        onClose={() => setShowAddProductModal(false)}
        title={AR_STRINGS.inventory.addProduct}
        maxWidth="md"
      >
        <form onSubmit={handleCreateProduct} noValidate className="space-y-4">
          <Input
            label={AR_STRINGS.inventory.productName}
            placeholder="مثال: سرنجات طبية 5 مل مع إبرة معقمة"
            value={prodName}
            onChange={(e) => {
              setProdName(e.target.value);
              if (prodErrors.name) setProdErrors((p) => ({ ...p, name: undefined }));
            }}
            onBlur={() => {
              if (!prodName.trim()) {
                setProdErrors((p) => ({
                  ...p,
                  name: 'اسم المادة الطبية مطلوب؛ لأنه يظهر في الفواتير والجرد. أدخل الاسم.',
                }));
              }
            }}
            error={prodErrors.name}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={AR_STRINGS.inventory.unit}
              placeholder="علبة / قنينة / باكيت"
              value={prodUnit}
              onChange={(e) => {
                setProdUnit(e.target.value);
                if (prodErrors.unit) setProdErrors((p) => ({ ...p, unit: undefined }));
              }}
              onBlur={() => {
                if (!prodUnit.trim()) {
                  setProdErrors((p) => ({
                    ...p,
                    unit: 'وحدة القياس مطلوبة (مثال: علبة).',
                  }));
                }
              }}
              error={prodErrors.unit}
              required
            />
            <Input
              label={AR_STRINGS.inventory.reorderLevel}
              type="number"
              min={1}
              inputMode="numeric"
              value={prodReorderLevel}
              onChange={(e) => setProdReorderLevel(parseInt(e.target.value, 10) || 20)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MoneyInput
              label={AR_STRINGS.inventory.purchasePrice}
              value={prodPurchasePrice}
              onChangeValue={setProdPurchasePrice}
            />
            <MoneyInput
              label={AR_STRINGS.inventory.salePrice}
              value={prodSalePrice}
              onChangeValue={(v) => {
                setProdSalePrice(v);
                if (prodErrors.salePrice && v > 0) {
                  setProdErrors((p) => ({ ...p, salePrice: undefined }));
                }
              }}
              onBlur={() => {
                if (prodSalePrice <= 0) {
                  setProdErrors((p) => ({
                    ...p,
                    salePrice: 'سعر البيع يجب أن يكون أكبر من صفر؛ أدخل سعر البيع بالدينار العراقي.',
                  }));
                }
              }}
              error={prodErrors.salePrice}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-line)]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddProductModal(false)}
              disabled={isSubmittingProd}
            >
              {AR_STRINGS.common.back}
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmittingProd}>
              {AR_STRINGS.inventory.saveProduct}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Warehouse Modal */}
      <Modal
        isOpen={showAddWarehouseModal}
        onClose={() => setShowAddWarehouseModal(false)}
        title={AR_STRINGS.inventory.addWarehouse}
        maxWidth="sm"
      >
        <form onSubmit={handleCreateWarehouse} noValidate className="space-y-4">
          <Input
            label="اسم المستودع أو الفرع"
            placeholder="مثال: مستودع الرصافة الطبي"
            value={whName}
            onChange={(e) => {
              setWhName(e.target.value);
              if (whErrors.name) setWhErrors((p) => ({ ...p, name: undefined }));
            }}
            onBlur={() => {
              if (!whName.trim()) {
                setWhErrors((p) => ({
                  ...p,
                  name: 'اسم المستودع مطلوب؛ لتحديد موقع التخزين. أدخل اسم المستودع.',
                }));
              }
            }}
            error={whErrors.name}
            required
          />
          <Input
            label="المدينة / المنطقة"
            placeholder="مثال: بغداد - الكرادة"
            value={whCity}
            onChange={(e) => {
              setWhCity(e.target.value);
              if (whErrors.city) setWhErrors((p) => ({ ...p, city: undefined }));
            }}
            onBlur={() => {
              if (!whCity.trim()) {
                setWhErrors((p) => ({
                  ...p,
                  city: 'المدينة مطلوبة؛ أدخل المدينة أو المنطقة.',
                }));
              }
            }}
            error={whErrors.city}
            required
          />
          <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={whIsDefault}
              onChange={(e) => setWhIsDefault(e.target.checked)}
              className="w-5 h-5 rounded border-[var(--color-control-border)] accent-[var(--color-primary)]"
            />
            <span className="text-[15px] font-semibold text-[var(--color-ink)]">
              تعيين كمستودع افتراضي للمكتب
            </span>
          </label>
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-line)]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddWarehouseModal(false)}
              disabled={isSubmittingWh}
            >
              {AR_STRINGS.common.back}
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmittingWh}>
              {AR_STRINGS.inventory.saveWarehouse}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Batch Modal */}
      <Modal
        isOpen={showAddBatchModal}
        onClose={() => setShowAddBatchModal(false)}
        title={AR_STRINGS.inventory.addBatch}
        maxWidth="md"
      >
        <form onSubmit={handleCreateBatch} noValidate className="space-y-4">
          <Select
            label="المادة الطبية"
            value={batchProdId}
            onChange={(e) => setBatchProdId(e.target.value)}
            options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.unit})` }))}
            required
          />
          <Select
            label="المستودع"
            value={batchWhId}
            onChange={(e) => setBatchWhId(e.target.value)}
            options={warehouses.map((w) => ({ value: w.id, label: `${w.name} - ${w.city}` }))}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={AR_STRINGS.inventory.lotNumber}
              placeholder="مثال: LOT-2026-X1"
              value={batchLot}
              onChange={(e) => {
                setBatchLot(e.target.value);
                if (batchErrors.lot) setBatchErrors((p) => ({ ...p, lot: undefined }));
              }}
              onBlur={() => {
                if (!batchLot.trim()) {
                  setBatchErrors((p) => ({
                    ...p,
                    lot: 'رقم الوجبة مطلوب؛ لتتبع تاريخ الصلاحية عند البيع.',
                  }));
                }
              }}
              error={batchErrors.lot}
              required
            />
            <Input
              label={AR_STRINGS.inventory.expiryDate}
              type="date"
              value={batchExpiry}
              onChange={(e) => {
                setBatchExpiry(e.target.value);
                if (batchErrors.expiry) setBatchErrors((p) => ({ ...p, expiry: undefined }));
              }}
              onBlur={() => {
                if (!batchExpiry) {
                  setBatchErrors((p) => ({
                    ...p,
                    expiry: 'تاريخ الانتهاء مطلوب؛ أدخل التاريخ من التقويم.',
                  }));
                }
              }}
              error={batchErrors.expiry}
              required
            />
          </div>
          <div className="p-3 bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)] rounded-[var(--radius-control)] text-[14px]">
            تُنشأ الوجبة برصيد صفري، وتُضاف الكميات للمستودع عبر حفظ فاتورة شراء.
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--color-line)]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddBatchModal(false)}
              disabled={isSubmittingBatch}
            >
              {AR_STRINGS.common.back}
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmittingBatch}>
              {AR_STRINGS.inventory.saveBatch}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

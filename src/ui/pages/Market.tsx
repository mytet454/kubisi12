/**
 * src/ui/pages/Market.tsx
 * Clinical Ledger Market Screen (Step 6 — The Market, Part 1: Requests & Offers):
 * - Customer:
 *   1) Post new purchase request (blur validation, MoneyInput, 3-part errors)
 *   2) My requests list with status badges and offer count
 *   3) Request detail comparison page showing ALL approved merchants' offers side-by-side sorted ascending by price with "قبول العرض"
 *   4) Browse General Offers (approved offices only)
 * - Merchant (owner, accountant, cashier on approved office):
 *   1) Matching requests showing the Arabic smart-match reason
 *   2) Submit Offer modal with pre-confirm stock check (checkOfferStock) & stock-warning ConfirmDialog if short
 *   3) My submitted offers (strictly own office only)
 *   4) Publish & browse General Offers
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck,
  Heart,
  Info,
  MapPin,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Tag,
  Truck,
} from 'lucide-react';
import {
  GeneralOffer,
  MarketFavorite,
  MarketOrder,
  Offer,
  OrderComplaint,
  ProductStockInfo,
  PurchaseRequest,
  RequestMatch,
} from '../../domain/types';
import { OfferStockCheckResult } from '../../domain/market';
import { OrderChatDrawer, OrderChatTarget } from '../components/OrderChatDrawer';
import { MarketComplaintsSection } from './MarketComplaintsSection';
import { MarketFavoritesSection } from './MarketFavoritesSection';
import { MarketOrdersSection } from './MarketOrdersSection';
import { services } from '../../services';
import { useAuth } from '../context/AuthContext';
import { useNavigationIntent } from '../context/NavigationIntentContext';
import { useToast } from '../context/ToastContext';
import { AR_STRINGS } from '../strings/ar';
import { formatWesternInt, MoneyText } from '../utils/formatMoney';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Column, DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { Input, Textarea } from '../components/Input';
import { Modal } from '../components/Modal';
import { MoneyInput } from '../components/MoneyInput';
import { SearchableSelect } from '../components/SearchableSelect';
import { TableSkeleton } from '../components/Skeletons';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs } from '../components/Tabs';

type RequestRow = PurchaseRequest & {
  offersCount: number;
  lowestOfferPrice?: number;
  myMatch?: RequestMatch;
  myOffer?: Offer;
};

const REQUEST_STATUS_MAP: Record<
  PurchaseRequest['status'],
  { label: string; variant: 'info' | 'warning' | 'success' | 'danger' }
> = {
  open: { label: 'مفتوح للعروض', variant: 'info' },
  offered: { label: 'توجد عروض مقدمة', variant: 'warning' },
  accepted: { label: 'مقبول ومفوتر', variant: 'success' },
  cancelled: { label: 'ملغى', variant: 'danger' },
};

const OFFER_STATUS_MAP: Record<
  Offer['status'],
  { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral' }
> = {
  pending: { label: 'قيد المراجعة', variant: 'warning' },
  accepted: { label: 'مقبول', variant: 'success' },
  rejected: { label: 'مرفوض', variant: 'danger' },
  expired: { label: 'منتهي الصلاحية', variant: 'neutral' },
};

export const Market: React.FC = () => {
  const { user, office } = useAuth();
  const { showToast } = useToast();
  const { navigateWithIntent, consumeIntent } = useNavigationIntent();

  const isCustomer = user?.role === 'customer';
  const isUnapprovedMerchant = Boolean(!isCustomer && office && office.status !== 'approved');

  const [activeTab, setActiveTab] = useState<string>(
    isCustomer ? 'my_requests' : 'matching_requests'
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Shared Market state
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [myOffers, setMyOffers] = useState<Offer[]>([]);
  const [generalOffers, setGeneralOffers] = useState<GeneralOffer[]>([]);
  const [officeProducts, setOfficeProducts] = useState<ProductStockInfo[]>([]);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [favorites, setFavorites] = useState<MarketFavorite[]>([]);
  const [complaints, setComplaints] = useState<OrderComplaint[]>([]);
  const [chatTarget, setChatTarget] = useState<OrderChatTarget | null>(null);

  // Request comparison view (Customer)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<PurchaseRequest | null>(null);
  const [detailOffers, setDetailOffers] = useState<Offer[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Accept Offer confirmation + result
  const [offerToAccept, setOfferToAccept] = useState<Offer | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptedInvoiceBanner, setAcceptedInvoiceBanner] = useState<{
    invoiceNumber: string;
    orderNumber: string;
    officeName: string;
    total: number;
  } | null>(null);

  // Customer: New Purchase Request Modal
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [reqProductName, setReqProductName] = useState('');
  const [reqQuantity, setReqQuantity] = useState('10');
  const [reqTargetPrice, setReqTargetPrice] = useState(0);
  const [reqDeliveryCity, setReqDeliveryCity] = useState('بغداد');
  const [reqDeadline, setReqDeadline] = useState(() => {
    const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [reqNotes, setReqNotes] = useState('');
  const [reqTouched, setReqTouched] = useState<Record<string, boolean>>({});
  const [isCreatingReq, setIsCreatingReq] = useState(false);

  // Merchant: Submit Offer Modal + Stock Warning
  const [offerModalReq, setOfferModalReq] = useState<RequestRow | null>(null);
  const [offerProductId, setOfferProductId] = useState('');
  const [offerPrice, setOfferPrice] = useState(0);
  const [offerQty, setOfferQty] = useState('1');
  const [offerDeliveryTime, setOfferDeliveryTime] = useState('خلال 24 ساعة');
  const [offerValidity, setOfferValidity] = useState(() => {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [offerNotes, setOfferNotes] = useState('');
  const [offerTouched, setOfferTouched] = useState<Record<string, boolean>>({});
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const [stockWarningDialog, setStockWarningDialog] = useState<{
    check: OfferStockCheckResult;
  } | null>(null);

  // Merchant: Publish General Offer Modal
  const [showGenOfferModal, setShowGenOfferModal] = useState(false);
  const [genProductId, setGenProductId] = useState('');
  const [genCustomName, setGenCustomName] = useState('');
  const [genPrice, setGenPrice] = useState(0);
  const [genQty, setGenQty] = useState('25');
  const [genValidity, setGenValidity] = useState(() => {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [genNotes, setGenNotes] = useState('');
  const [genTouched, setGenTouched] = useState<Record<string, boolean>>({});
  const [isPublishingGen, setIsPublishingGen] = useState(false);

  // General Offers Search
  const [genSearch, setGenSearch] = useState('');

  // Consume optional navigation intent
  useEffect(() => {
    const intent = consumeIntent('market');
    if (intent?.subTab) {
      setActiveTab(intent.subTab);
    }
    if (intent?.action === 'new_request' && isCustomer) {
      setShowNewRequestModal(true);
    }
  }, [consumeIntent, isCustomer]);

  const loadMarketData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [reqs, genList, ordList, cmpList] = await Promise.all([
        services.getPurchaseRequests(user),
        services.getGeneralOffers(user),
        services.getMarketOrders(user),
        services.getComplaints(user),
      ]);
      setRequests(reqs);
      setGeneralOffers(genList);
      setOrders(ordList);
      setComplaints(cmpList);

      if (isCustomer) {
        const favs = await services.getFavorites(user);
        setFavorites(favs);
      } else {
        setFavorites([]);
        if (!isUnapprovedMerchant) {
          const [offersList, productsList] = await Promise.all([
            services.getMerchantOffers(user),
            services.getProducts(user),
          ]);
          setMyOffers(offersList);
          setOfficeProducts(productsList.filter((p) => p.active));
        } else {
          setMyOffers([]);
          setOfficeProducts([]);
        }
      }
    } catch (err: any) {
      const msg = err.message || 'تعذر تحميل بيانات سوق العرض والطلب. أعد المحاولة.';
      setLoadError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [user, isCustomer, isUnapprovedMerchant, showToast]);

  useEffect(() => {
    loadMarketData();
  }, [loadMarketData]);

  const favoriteMerchantIds = useMemo(
    () => new Set(favorites.filter((f) => f.kind === 'merchant').map((f) => f.officeId)),
    [favorites]
  );

  const isFavoriteProduct = useCallback(
    (officeId: string, productId?: string, productName?: string) =>
      favorites.some(
        (f) =>
          f.kind === 'product' &&
          f.officeId === officeId &&
          ((productId && f.productId === productId) || f.productName === productName)
      ),
    [favorites]
  );

  const handleToggleFavoriteProduct = async (gen: GeneralOffer) => {
    if (!user) return;
    try {
      const res = await services.toggleFavorite(user, {
        kind: 'product',
        officeId: gen.officeId,
        productId: gen.productId,
        productName: gen.productName,
        unitPrice: gen.price,
        unit: gen.unit,
      });
      setFavorites(res.favorites);
      showToast(
        res.added ? 'تمت إضافة الصنف إلى المفضلة' : 'تمت إزالة الصنف من المفضلة',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'تعذر تحديث المفضلة', 'error');
    }
  };

  const handleToggleFavoriteMerchantById = async (officeId: string) => {
    if (!user) return;
    try {
      const res = await services.toggleFavorite(user, {
        kind: 'merchant',
        officeId,
      });
      setFavorites(res.favorites);
      showToast(
        res.added ? 'تمت إضافة المكتب إلى المفضلة' : 'تمت إزالة المكتب من المفضلة',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'تعذر تحديث المفضلة', 'error');
    }
  };

  const handleRemoveFavorite = async (fav: MarketFavorite) => {
    if (!user) return;
    try {
      const res = await services.toggleFavorite(user, {
        kind: fav.kind,
        officeId: fav.officeId,
        productId: fav.productId,
        productName: fav.productName,
      });
      setFavorites(res.favorites);
      showToast('تمت الإزالة من المفضلة', 'info');
    } catch (err: any) {
      showToast(err.message || 'تعذر إزالة العنصر من المفضلة', 'error');
    }
  };

  const handleReorderFromFavorite = (fav: MarketFavorite) => {
    setReqProductName(fav.productName || '');
    setReqQuantity('10');
    setReqTargetPrice(fav.unitPrice && fav.unitPrice > 0 ? fav.unitPrice : 5000);
    setReqDeliveryCity(fav.officeCity.split('-')[0].trim() || 'بغداد');
    setReqNotes(`إعادة طلب من المفضلة (${fav.officeName})`);
    setReqTouched({});
    setSelectedRequestId(null);
    setShowNewRequestModal(true);
    showToast('تمت تعبئة نموذج الطلب من المفضلة، راجع الكمية ثم اضغط حفظ ونشر الطلب.', 'info');
  };

  const openRequestDetail = useCallback(
    async (requestId: string) => {
      if (!user) return;
      setSelectedRequestId(requestId);
      setIsLoadingDetail(true);
      try {
        const res = await services.getRequestWithOffers(user, requestId);
        setDetailRequest(res.request);
        setDetailOffers(res.offers);
      } catch (err: any) {
        showToast(err.message || 'تعذر فتح تفاصيل الطلب', 'error');
        setSelectedRequestId(null);
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [user, showToast]
  );

  // New Request validation errors (3-part: what + why + how to fix)
  const reqErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!reqProductName.trim()) {
      errs.productName =
        'اسم المادة الطبية مطلوب؛ لأن المكاتب الطبية تطابق مخزونها مع هذا الاسم. اكتب اسم الصنف المطلوب بوضوح.';
    }
    const q = Number(reqQuantity);
    if (!q || q <= 0) {
      errs.quantity =
        'الكمية غير صالحة؛ لأن الطلب يجب أن يحدد عدداً موجباً. أدخل رقماً أكبر من صفر.';
    }
    if (!reqTargetPrice || reqTargetPrice <= 0) {
      errs.targetPrice =
        'السعر المستهدف مطلوب؛ لأنه يساعد في ترتيب العروض الأقرب لميزانيتك. أدخل السعر التقديري بالدينار العراقي.';
    }
    if (!reqDeliveryCity.trim()) {
      errs.deliveryCity =
        'مدينة التسليم مطلوبة؛ لأن المطابقة الذكية تفضّل المكاتب الأقرب جغرافياً. اختر أو اكتب المدينة.';
    }
    if (!reqDeadline) {
      errs.deadline =
        'تاريخ الموعد النهائي مطلوب لتحديد فترة صلاحية استقبال العروض. اختر تاريخاً مناسباً.';
    }
    return errs;
  }, [reqProductName, reqQuantity, reqTargetPrice, reqDeliveryCity, reqDeadline]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setReqTouched({
      productName: true,
      quantity: true,
      targetPrice: true,
      deliveryCity: true,
      deadline: true,
    });
    if (Object.keys(reqErrors).length > 0) return;

    setIsCreatingReq(true);
    try {
      const created = await services.createPurchaseRequest(user, {
        productName: reqProductName.trim(),
        quantity: Number(reqQuantity),
        targetPrice: reqTargetPrice,
        deliveryCity: reqDeliveryCity.trim(),
        deadline: reqDeadline,
        notes: reqNotes.trim() || undefined,
      });
      showToast(
        `تم نشر طلب الشراء بنجاح ومطابقته مع ${created.matches.length} مكاتب معتمدة`,
        'success'
      );
      setShowNewRequestModal(false);
      setReqProductName('');
      setReqQuantity('10');
      setReqTargetPrice(0);
      setReqNotes('');
      setReqTouched({});
      await loadMarketData();
      await openRequestDetail(created.id);
    } catch (err: any) {
      showToast(err.message || 'تعذر حفظ طلب الشراء. تحقق من الحقول وأعد المحاولة.', 'error');
    } finally {
      setIsCreatingReq(false);
    }
  };

  // Merchant: Open Offer Modal for a matching request
  const openOfferModal = (reqRow: RequestRow) => {
    const matchedProdId = reqRow.myMatch?.productId || officeProducts[0]?.id || '';
    const matchedProd = officeProducts.find((p) => p.id === matchedProdId);

    setOfferModalReq(reqRow);
    setOfferProductId(matchedProdId);
    setOfferPrice(matchedProd?.salePrice || reqRow.targetPrice || 0);
    setOfferQty(String(reqRow.quantity));
    setOfferDeliveryTime('خلال 24 ساعة');
    setOfferNotes('');
    setOfferTouched({});
  };

  const offerErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!offerProductId) {
      errs.productId =
        'يجب ربط العرض بمادة من مستودعك؛ لأن قبول العرض ينشئ فاتورة بيع ويخصم من وجبات المخزون. اختر المادة المناسبة.';
    }
    if (!offerPrice || offerPrice <= 0) {
      errs.price =
        'سعر الوحدة مطلوب؛ لأنه القيمة التي ستُقارن بها عروض المكاتب. أدخل السعر بالدينار العراقي.';
    }
    const q = Number(offerQty);
    if (!q || q <= 0) {
      errs.qty = 'الكمية المتوفرة غير صالحة. أدخل عدداً أكبر من صفر.';
    }
    if (!offerDeliveryTime.trim()) {
      errs.deliveryTime = 'مدة التوصيل مطلوبة لإعلام المشتري بموعد التجهيز.';
    }
    if (!offerValidity) {
      errs.validity = 'تاريخ انتهاء صلاحية العرض مطلوب.';
    }
    return errs;
  }, [offerProductId, offerPrice, offerQty, offerDeliveryTime, offerValidity]);

  const commitSubmitOffer = async () => {
    if (!user || !offerModalReq) return;
    setIsSubmittingOffer(true);
    try {
      await services.submitOffer(user, {
        requestId: offerModalReq.id,
        productId: offerProductId || undefined,
        price: offerPrice,
        availableQuantity: Number(offerQty),
        deliveryTime: offerDeliveryTime.trim(),
        validity: offerValidity,
        notes: offerNotes.trim() || undefined,
      });
      showToast('تم إرسال عرض السعر إلى المشتري وإشعاره بنجاح', 'success');
      setStockWarningDialog(null);
      setOfferModalReq(null);
      await loadMarketData();
    } catch (err: any) {
      showToast(err.message || 'تعذر إرسال العرض. راجع البيانات وأعد المحاولة.', 'error');
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  const handleOfferFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !offerModalReq) return;
    setOfferTouched({
      productId: true,
      price: true,
      qty: true,
      deliveryTime: true,
      validity: true,
    });
    if (Object.keys(offerErrors).length > 0) return;

    try {
      const check = await services.checkOfferStock(user, {
        productId: offerProductId,
        quantity: Math.max(offerModalReq.quantity, Number(offerQty) || 0),
        requestId: offerModalReq.id,
      });
      if (!check.sufficient) {
        setStockWarningDialog({ check });
        return;
      }
      await commitSubmitOffer();
    } catch (err: any) {
      showToast(err.message || 'تعذر التحقق من رصيد المخزون', 'error');
    }
  };

  const handleConfirmAcceptOffer = async () => {
    if (!user || !offerToAccept) return;
    setIsAccepting(true);
    try {
      const res = await services.acceptOffer(user, offerToAccept.id);
      setAcceptedInvoiceBanner({
        invoiceNumber: res.invoice.number,
        orderNumber: res.order.orderNumber,
        officeName: res.offer.officeName,
        total: res.invoice.total,
      });
      showToast(
        `تم قبول العرض وإنشاء الطلب ${res.order.orderNumber} والفاتورة ${res.invoice.number} بنجاح`,
        'success'
      );
      setOfferToAccept(null);
      await loadMarketData();
      await openRequestDetail(res.request.id);
    } catch (err: any) {
      showToast(err.message || 'تعذر إتمام قبول العرض وإصدار الفاتورة', 'error');
    } finally {
      setIsAccepting(false);
    }
  };

  // Merchant: Publish General Offer validation & submit
  const genErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    const selectedProd = officeProducts.find((p) => p.id === genProductId);
    const effectiveName = genCustomName.trim() || selectedProd?.name || '';
    if (!effectiveName) {
      errs.productName = 'اختر مادة من دليلك أو اكتب اسم العرض العام لنشره في السوق.';
    }
    if (!genPrice || genPrice <= 0) {
      errs.price = 'سعر الوحدة للعرض العام مطلوب ويجب أن يكون أكبر من صفر.';
    }
    const q = Number(genQty);
    if (!q || q <= 0) {
      errs.qty = 'الكمية المتاحة في العرض يجب أن تكون أكبر من صفر.';
    }
    if (!genValidity) {
      errs.validity = 'تاريخ صلاحية العرض العام مطلوب.';
    }
    return errs;
  }, [officeProducts, genProductId, genCustomName, genPrice, genQty, genValidity]);

  const handlePublishGenOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setGenTouched({ productName: true, price: true, qty: true, validity: true });
    if (Object.keys(genErrors).length > 0) return;

    setIsPublishingGen(true);
    try {
      await services.publishGeneralOffer(user, {
        productId: genProductId || undefined,
        productName: genCustomName.trim() || undefined,
        price: genPrice,
        quantity: Number(genQty),
        validity: genValidity,
        notes: genNotes.trim() || undefined,
      });
      showToast('تم نشر العرض العام في سوق المستلزمات الطبية بنجاح', 'success');
      setShowGenOfferModal(false);
      setGenProductId('');
      setGenCustomName('');
      setGenPrice(0);
      setGenQty('25');
      setGenNotes('');
      setGenTouched({});
      await loadMarketData();
    } catch (err: any) {
      showToast(err.message || 'تعذر نشر العرض العام', 'error');
    } finally {
      setIsPublishingGen(false);
    }
  };

  // Filtered general offers
  const filteredGeneralOffers = useMemo(() => {
    const q = genSearch.trim().toLowerCase();
    if (!q) return generalOffers;
    return generalOffers.filter(
      (g) =>
        g.productName.toLowerCase().includes(q) ||
        g.officeName.toLowerCase().includes(q) ||
        g.officeCity.toLowerCase().includes(q)
    );
  }, [generalOffers, genSearch]);

  // Customer My Requests DataTable columns
  const customerRequestColumns: Column<RequestRow>[] = useMemo(
    () => [
      {
        key: 'productName',
        header: 'المادة الطبية المطلوبة',
        sortable: true,
        mobilePriority: 1,
        searchValue: (r) => `${r.productName} ${r.deliveryCity}`,
        render: (r) => (
          <div>
            <div className="font-semibold text-[var(--color-ink)]">{r.productName}</div>
            <div className="text-[14px] text-[var(--color-muted)]">
              التسليم: {r.deliveryCity} · الموعد: <span className="num-tabular">{r.deadline}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'quantity',
        header: 'الكمية',
        sortable: true,
        align: 'center',
        render: (r) => <span className="num-tabular font-semibold">{formatWesternInt(r.quantity)}</span>,
      },
      {
        key: 'targetPrice',
        header: 'السعر المستهدف',
        sortable: true,
        align: 'left',
        render: (r) => <MoneyText amount={r.targetPrice} size="sm" />,
      },
      {
        key: 'offersCount',
        header: 'العروض المستلمة',
        align: 'center',
        mobilePriority: 2,
        render: (r) => (
          <div className="space-y-0.5">
            <div className="num-tabular font-bold text-[var(--color-primary-strong)]">
              {r.offersCount} عرض
            </div>
            {r.lowestOfferPrice !== undefined && (
              <div className="text-[14px] text-[var(--color-muted)]">
                أقل سعر: <MoneyText amount={r.lowestOfferPrice} size="sm" tone="success" />
              </div>
            )}
          </div>
        ),
      },
      {
        key: 'status',
        header: 'الحالة',
        mobilePriority: 'status',
        render: (r) => {
          const st = REQUEST_STATUS_MAP[r.status];
          return (
            <StatusBadge variant={st.variant} size="sm">
              {st.label}
            </StatusBadge>
          );
        },
      },
      {
        key: 'actions',
        header: 'الإجراءات',
        align: 'center',
        render: (r) => (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openRequestDetail(r.id);
            }}
            leftIcon={<FileCheck className="w-4 h-4" strokeWidth={1.75} />}
          >
            مقارنة العروض ({r.offersCount})
          </Button>
        ),
      },
    ],
    [openRequestDetail]
  );

  // Merchant My Submitted Offers DataTable columns
  const merchantOfferColumns: Column<Offer>[] = useMemo(
    () => [
      {
        key: 'productName',
        header: 'الصنف المقدم',
        sortable: true,
        mobilePriority: 1,
        searchValue: (o) => `${o.productName || ''} ${o.deliveryTime}`,
        render: (o) => (
          <div>
            <div className="font-semibold text-[var(--color-ink)]">
              {o.productName || 'صنف طبي'}
            </div>
            <div className="text-[14px] text-[var(--color-muted)]">
              التوصيل: {o.deliveryTime} · صلاحية: <span className="num-tabular">{o.validity}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'price',
        header: 'سعر الوحدة',
        sortable: true,
        align: 'left',
        mobilePriority: 2,
        render: (o) => <MoneyText amount={o.price} size="sm" tone="primary" />,
      },
      {
        key: 'availableQuantity',
        header: 'الكمية المعروضة',
        align: 'center',
        render: (o) => (
          <span className="num-tabular font-semibold">
            {formatWesternInt(o.availableQuantity)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'الحالة',
        mobilePriority: 'status',
        render: (o) => {
          const st = OFFER_STATUS_MAP[o.status];
          return (
            <StatusBadge variant={st.variant} size="sm">
              {st.label}
            </StatusBadge>
          );
        },
      },
    ],
    []
  );

  // Loading & Error states
  if (isLoading) {
    return (
      <div className="space-y-6" dir="rtl">
        <TableSkeleton rows={5} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="clinical-card p-6 border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        dir="rtl"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="w-6 h-6 text-[var(--color-danger-ink)] shrink-0"
            strokeWidth={1.75}
          />
          <div>
            <h1 className="text-[18px] font-semibold text-[var(--color-danger-ink)]">
              تعذر تحميل سوق العرض والطلب
            </h1>
            <p className="text-[14px] text-[var(--color-ink)] mt-0.5">{loadError}</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={loadMarketData}
          leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
        >
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  // Request Detail View (Customer Side-by-Side Offer Comparison)
  if (isCustomer && selectedRequestId) {
    const lowestPrice = detailOffers.length > 0 ? detailOffers[0].price : null;
    const reqStatus = detailRequest ? REQUEST_STATUS_MAP[detailRequest.status] : null;

    return (
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--color-line)]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="self-start">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedRequestId(null);
                  setAcceptedInvoiceBanner(null);
                }}
                leftIcon={<ArrowRight className="w-4 h-4" strokeWidth={1.75} />}
              >
                رجوع لقائمة طلباتي
              </Button>
            </div>
            <div>
              <h1 className="clinical-heading-2">{AR_STRINGS.market.compareOffersTitle}</h1>
              <p className="text-[14px] text-[var(--color-muted)]">
                العروض مرتبة تلقائياً من السعر الأقل إلى الأعلى للمقارنة المباشرة
              </p>
            </div>
          </div>
          {reqStatus && (
            <div className="self-start sm:self-auto">
              <StatusBadge variant={reqStatus.variant}>{reqStatus.label}</StatusBadge>
            </div>
          )}
        </div>

        {acceptedInvoiceBanner && (
          <div
            role="status"
            className="clinical-card p-5 border border-[var(--color-success-border)] bg-[var(--color-success-bg)]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="w-6 h-6 text-[var(--color-success-ink)] shrink-0 mt-0.5"
                strokeWidth={1.75}
              />
              <div>
                <h2 className="text-[16px] font-bold text-[var(--color-success-ink)]">
                  تم تأكيد الطلب{' '}
                  <span className="num-tabular">{acceptedInvoiceBanner.orderNumber}</span> وإصدار
                  فاتورة البيع <span className="num-tabular">{acceptedInvoiceBanner.invoiceNumber}</span>
                </h2>
                <p className="text-[14px] text-[var(--color-ink)] mt-0.5">
                  المورد: {acceptedInvoiceBanner.officeName} · الإجمالي:{' '}
                  <span className="num-tabular font-bold">
                    {formatWesternInt(acceptedInvoiceBanner.total)} د.ع
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setSelectedRequestId(null);
                  setActiveTab('orders');
                }}
                leftIcon={<Truck className="w-4 h-4" strokeWidth={1.75} />}
              >
                متابعة مراحل الطلب
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigateWithIntent('customer_portal')}
                leftIcon={<FileCheck className="w-4 h-4" strokeWidth={1.75} />}
              >
                فتح فواتيري
              </Button>
            </div>
          </div>
        )}

        {isLoadingDetail || !detailRequest ? (
          <TableSkeleton rows={3} />
        ) : (
          <>
            {/* Request Summary Card */}
            <section className="clinical-card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="sm:col-span-2">
                <span className="text-[14px] text-[var(--color-muted)] block">
                  المادة الطبية المطلوبة
                </span>
                <h2 className="text-[18px] font-bold text-[var(--color-ink)] mt-0.5">
                  {detailRequest.productName}
                </h2>
                {detailRequest.notes && (
                  <p className="text-[14px] text-[var(--color-muted)] mt-1">
                    {detailRequest.notes}
                  </p>
                )}
              </div>
              <div>
                <span className="text-[14px] text-[var(--color-muted)] block">الكمية المطلوبة</span>
                <span className="text-[18px] font-bold num-tabular text-[var(--color-ink)] mt-0.5 block">
                  {formatWesternInt(detailRequest.quantity)} وحدة
                </span>
              </div>
              <div>
                <span className="text-[14px] text-[var(--color-muted)] block">السعر المستهدف</span>
                <div className="mt-0.5">
                  <MoneyText amount={detailRequest.targetPrice} size="lg" />
                </div>
              </div>
              <div>
                <span className="text-[14px] text-[var(--color-muted)] block">
                  المدينة والموعد النهائي
                </span>
                <span className="text-[15px] font-semibold text-[var(--color-ink)] block mt-0.5">
                  {detailRequest.deliveryCity}
                </span>
                <span className="text-[14px] num-tabular text-[var(--color-muted)]">
                  حتى {detailRequest.deadline}
                </span>
              </div>
            </section>

            {/* Side-by-Side Offer Comparison Grid */}
            {detailOffers.length === 0 ? (
              <EmptyState
                icon={<Clock className="w-8 h-8" strokeWidth={1.75} />}
                title="لم تصل عروض أسعار على هذا الطلب بعد"
                description={`تمت مطابقة طلبك مع ${detailRequest.matches.length} مكاتب طبية معتمدة وإشعارها. ستظهر العروض هنا مرتبة حسب السعر فور استلامها.`}
              />
            ) : (
              <div
                className={`grid grid-cols-1 gap-4 ${
                  detailOffers.length === 2
                    ? 'md:grid-cols-2'
                    : 'md:grid-cols-2 xl:grid-cols-3'
                }`}
              >
                {detailOffers.map((offer, idx) => {
                  const isCheapest = lowestPrice !== null && offer.price === lowestPrice;
                  const orderTotal = offer.price * detailRequest.quantity;
                  const offerSt = OFFER_STATUS_MAP[offer.status];
                  const canAccept =
                    detailRequest.status !== 'accepted' &&
                    detailRequest.status !== 'cancelled' &&
                    offer.status === 'pending';

                  return (
                    <article
                      key={offer.id}
                      data-testid={`offer-card-${offer.id}`}
                      className={`clinical-card p-5 flex flex-col justify-between gap-4 border ${
                        offer.status === 'accepted'
                          ? 'border-[var(--color-success-ink)]'
                          : isCheapest
                          ? 'border-[var(--color-primary)]'
                          : 'border-[var(--color-line)]'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-start gap-1.5 text-[15px] text-[var(--color-primary-strong)] font-semibold">
                              <Building2 className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                              <span>{offer.officeName}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[14px] text-[var(--color-muted)] mt-0.5">
                              <MapPin className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                              <span>{offer.officeCity}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {isCheapest && offer.status === 'pending' && (
                              <StatusBadge variant="success" size="sm">
                                {AR_STRINGS.market.cheapestBadge} (#{idx + 1})
                              </StatusBadge>
                            )}
                            {offer.status !== 'pending' && (
                              <StatusBadge variant={offerSt.variant} size="sm">
                                {offerSt.label}
                              </StatusBadge>
                            )}
                          </div>
                        </div>

                        <div className="p-3.5 rounded-[var(--radius-control)] bg-[var(--color-surface-subtle)] border border-[var(--color-line)] flex items-baseline justify-between gap-2">
                          <div>
                            <span className="text-[14px] text-[var(--color-muted)] block">
                              سعر الوحدة المقدم
                            </span>
                            <MoneyText amount={offer.price} size="xl" tone="primary" />
                          </div>
                          <div className="text-left">
                            <span className="text-[14px] text-[var(--color-muted)] block">
                              إجمالي الطلبية
                            </span>
                            <MoneyText amount={orderTotal} size="md" />
                          </div>
                        </div>

                        <dl className="grid grid-cols-2 gap-2.5 text-[14px]">
                          <div>
                            <dt className="text-[var(--color-muted)]">الكمية المتوفرة</dt>
                            <dd className="font-semibold num-tabular text-[var(--color-ink)]">
                              {formatWesternInt(offer.availableQuantity)} وحدة
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[var(--color-muted)]">مدة التوصيل</dt>
                            <dd className="font-semibold text-[var(--color-ink)]">
                              {offer.deliveryTime}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[var(--color-muted)]">صلاحية العرض</dt>
                            <dd className="font-semibold num-tabular text-[var(--color-ink)]">
                              {offer.validity}
                            </dd>
                          </div>
                          <div className="col-span-2">
                            <dt className="text-[var(--color-muted)]">الصنف المورد</dt>
                            <dd className="font-semibold text-[var(--color-ink)]">
                              {offer.productName || detailRequest.productName}
                            </dd>
                          </div>
                        </dl>

                        {offer.notes && (
                          <p className="text-[14px] text-[var(--color-muted)] pt-2 border-t border-[var(--color-line)]">
                            {offer.notes}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-[var(--color-line)] space-y-2">
                        {canAccept ? (
                          <Button
                            variant={isCheapest ? 'primary' : 'secondary'}
                            className="w-full"
                            onClick={() => setOfferToAccept(offer)}
                            leftIcon={<CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />}
                          >
                            {AR_STRINGS.market.acceptOffer}
                          </Button>
                        ) : offer.status === 'accepted' ? (
                          <div className="text-[14px] font-semibold text-[var(--color-success-ink)] flex items-center justify-center gap-1.5 py-2">
                            <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
                            <span>
                              تم الاعتماد — فاتورة{' '}
                              <span className="num-tabular">{detailRequest.invoiceNumber}</span>
                            </span>
                          </div>
                        ) : (
                          <div className="text-[14px] text-[var(--color-muted)] text-center py-2">
                            تم حسم هذا الطلب
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1"
                            onClick={() =>
                              setChatTarget({
                                threadType: 'request',
                                threadId: detailRequest.id,
                                officeId: offer.officeId,
                                title: `محادثة مع ${offer.officeName}`,
                                subtitle: `حول طلب: ${detailRequest.productName}`,
                              })
                            }
                            leftIcon={<MessageSquare className="w-4 h-4" strokeWidth={1.75} />}
                          >
                            {AR_STRINGS.market.chatButton}
                          </Button>
                          <Button
                            variant={favoriteMerchantIds.has(offer.officeId) ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => handleToggleFavoriteMerchantById(offer.officeId)}
                            aria-label={`تفضيل ${offer.officeName}`}
                            leftIcon={<Heart className="w-4 h-4" strokeWidth={1.75} />}
                          >
                            {favoriteMerchantIds.has(offer.officeId) ? 'مفضل' : 'تفضيل'}
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Confirm Accept Offer Dialog */}
        <ConfirmDialog
          isOpen={Boolean(offerToAccept)}
          onClose={() => setOfferToAccept(null)}
          onConfirm={handleConfirmAcceptOffer}
          isDestructive={false}
          isLoading={isAccepting}
          title="تأكيد قبول عرض السعر وإصدار الفاتورة"
          confirmLabel="تأكيد قبول العرض"
          cancelLabel="رجوع"
          message={
            offerToAccept && detailRequest
              ? `هل تريد قبول عرض "${offerToAccept.officeName}" بسعر ${formatWesternInt(
                  offerToAccept.price
                )} د.ع للوحدة (الإجمالي ${formatWesternInt(
                  offerToAccept.price * detailRequest.quantity
                )} د.ع)؟ سيتم إنشاء الطلب والفاتورة وخصم المخزون وربط حسابك تلقائياً.`
              : ''
          }
        />

        <OrderChatDrawer
          isOpen={Boolean(chatTarget)}
          target={chatTarget}
          user={user}
          onClose={() => setChatTarget(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
        <div>
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-7 h-7 text-[var(--color-primary)]" strokeWidth={1.75} />
            <h1 className="clinical-heading-1">{AR_STRINGS.market.title}</h1>
          </div>
          <p className="text-[14px] text-[var(--color-muted)] mt-1 clinical-prose">
            {isCustomer ? AR_STRINGS.market.customerSubtitle : AR_STRINGS.market.merchantSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCustomer ? (
            <Button
              variant="primary"
              onClick={() => setShowNewRequestModal(true)}
              leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
            >
              {AR_STRINGS.market.newRequest}
            </Button>
          ) : (
            !isUnapprovedMerchant && (
              <Button
                variant="primary"
                onClick={() => setShowGenOfferModal(true)}
                leftIcon={<Plus className="w-5 h-5" strokeWidth={1.75} />}
              >
                {AR_STRINGS.market.publishGeneralOffer}
              </Button>
            )
          )}
        </div>
      </div>

      {isUnapprovedMerchant && (
        <div
          role="alert"
          className="clinical-card p-5 border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="w-6 h-6 text-[var(--color-warning-ink)] shrink-0 mt-0.5"
              strokeWidth={1.75}
            />
            <div>
              <h2 className="text-[16px] font-bold text-[var(--color-warning-ink)]">
                {office?.status === 'rejected'
                  ? 'تم رفض اعتماد ترخيص مكتبك مؤقتاً'
                  : 'مكتبك بانتظار اعتماد الترخيص للمشاركة في السوق'}
              </h2>
              <p className="text-[14px] text-[var(--color-ink)] mt-0.5">
                {office?.status === 'rejected' && office.rejectionReason
                  ? `السبب: ${office.rejectionReason}. يرجى رفع وثيقة الترخيص المحدثة من إعدادات المكتب لإعادة المراجعة.`
                  : 'تقتصر المشاركة في طلبات الشراء ونشر العروض العامة على المكاتب الطبية المعتمدة من مشرف المنصة فقط.'}
              </p>
            </div>
          </div>
          {user?.role === 'owner' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigateWithIntent('settings')}
              className="shrink-0"
            >
              رفع الترخيص في الإعدادات
            </Button>
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      <Tabs
        tabs={
          isCustomer
            ? [
                {
                  key: 'my_requests',
                  label: AR_STRINGS.market.myRequestsTab,
                  icon: <Package className="w-5 h-5" strokeWidth={1.75} />,
                  count: requests.length,
                },
                {
                  key: 'orders',
                  label: AR_STRINGS.market.ordersTab,
                  icon: <ClipboardList className="w-5 h-5" strokeWidth={1.75} />,
                  count: orders.length,
                },
                {
                  key: 'favorites',
                  label: AR_STRINGS.market.favoritesTab,
                  icon: <Heart className="w-5 h-5" strokeWidth={1.75} />,
                  count: favorites.length,
                },
                {
                  key: 'complaints',
                  label: AR_STRINGS.market.complaintsTab,
                  icon: <ShieldAlert className="w-5 h-5" strokeWidth={1.75} />,
                  count: complaints.length,
                },
                {
                  key: 'general_offers',
                  label: AR_STRINGS.market.generalOffersTab,
                  icon: <Tag className="w-5 h-5" strokeWidth={1.75} />,
                  count: generalOffers.length,
                },
              ]
            : [
                {
                  key: 'matching_requests',
                  label: AR_STRINGS.market.matchingRequestsTab,
                  icon: <Sparkles className="w-5 h-5" strokeWidth={1.75} />,
                  count: requests.length,
                },
                {
                  key: 'my_offers',
                  label: AR_STRINGS.market.myOffersTab,
                  icon: <Send className="w-5 h-5" strokeWidth={1.75} />,
                  count: myOffers.length,
                },
                {
                  key: 'orders',
                  label: AR_STRINGS.market.ordersTab,
                  icon: <ClipboardList className="w-5 h-5" strokeWidth={1.75} />,
                  count: orders.length,
                },
                {
                  key: 'complaints',
                  label: AR_STRINGS.market.complaintsTab,
                  icon: <ShieldAlert className="w-5 h-5" strokeWidth={1.75} />,
                  count: complaints.length,
                },
                {
                  key: 'general_offers',
                  label: AR_STRINGS.market.generalOffersTab,
                  icon: <Tag className="w-5 h-5" strokeWidth={1.75} />,
                  count: generalOffers.length,
                },
              ]
        }
        activeKey={activeTab}
        onChange={setActiveTab}
      />

      {/* Customer: My Requests List */}
      {isCustomer && activeTab === 'my_requests' && (
        <DataTable<RequestRow>
          data={requests}
          columns={customerRequestColumns}
          keyExtractor={(r) => r.id}
          title="طلبات الشراء الخاصة بحسابك"
          exportFileName="market_my_requests"
          onRowClick={(r) => openRequestDetail(r.id)}
          emptyTitle="لم ترسل أي طلب شراء في السوق بعد"
          emptyDescription="تعرض هذه القائمة طلبات الشراء المرسلة للمكاتب المعتمدة والعروض الواردة عليها. أنشئ أول طلب لمقارنة الأسعار."
          emptyActionLabel={AR_STRINGS.market.newRequest}
          onEmptyAction={() => setShowNewRequestModal(true)}
        />
      )}

      {/* Merchant: Matching Requests with Arabic Reason */}
      {!isCustomer && activeTab === 'matching_requests' && (
        <div className="space-y-4">
          {requests.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="w-8 h-8" strokeWidth={1.75} />}
              title="لا توجد طلبات شراء مطابقة لمخزون مكتبك حالياً"
              description="تظهر هنا طلبات المستشفيات والعملاء التي تطابق أصناف مكتبك أو مدينتك فور نشرها."
            />
          ) : (
            <div className="space-y-3">
              {requests.map((req) => {
                const st = REQUEST_STATUS_MAP[req.status];
                const myOffer = req.myOffer;
                const myMatch = req.myMatch;
                return (
                  <article
                    key={req.id}
                    className="clinical-card p-5 space-y-3 border border-[var(--color-line)]"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-[18px] font-bold text-[var(--color-ink)]">
                            {req.productName}
                          </h2>
                          <StatusBadge variant={st.variant} size="sm">
                            {st.label}
                          </StatusBadge>
                        </div>
                        <p className="text-[14px] text-[var(--color-muted)]">
                          الجهة الطالبة: <strong className="text-[var(--color-ink)]">{req.customerName}</strong> ·
                          المدينة: <strong className="text-[var(--color-ink)]">{req.deliveryCity}</strong> ·
                          الموعد النهائي: <span className="num-tabular">{req.deadline}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-left">
                          <span className="text-[14px] text-[var(--color-muted)] block">
                            الكمية / السعر المستهدف
                          </span>
                          <span className="text-[16px] font-bold num-tabular text-[var(--color-ink)]">
                            {formatWesternInt(req.quantity)} ×{' '}
                            {formatWesternInt(req.targetPrice)} د.ع
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Smart Match Arabic Reason */}
                    {myMatch && (
                      <div className="p-3 rounded-[var(--radius-control)] bg-[var(--color-primary-soft)]/60 border border-[var(--color-primary)]/30 flex items-start gap-2.5 text-[14px]">
                        <Info
                          className="w-5 h-5 text-[var(--color-primary-strong)] shrink-0 mt-0.5"
                          strokeWidth={1.75}
                        />
                        <div>
                          <span className="font-bold text-[var(--color-primary-strong)]">
                            سبب المطابقة لمكتبك:{' '}
                          </span>
                          <span className="text-[var(--color-ink)]">{myMatch.reasonAr}</span>
                        </div>
                      </div>
                    )}

                    {req.notes && (
                      <p className="text-[14px] text-[var(--color-muted)]">
                        ملاحظات المشتري: {req.notes}
                      </p>
                    )}

                    <div className="pt-3 border-t border-[var(--color-line)] flex flex-wrap items-center justify-between gap-3">
                      {myOffer ? (
                        <div className="flex flex-wrap items-center gap-2 text-[14px]">
                          <StatusBadge variant={OFFER_STATUS_MAP[myOffer.status].variant} size="sm">
                            عرضك: {OFFER_STATUS_MAP[myOffer.status].label}
                          </StatusBadge>
                          <span className="text-[var(--color-ink)] font-semibold">
                            السعر المقدم: <MoneyText amount={myOffer.price} size="sm" />
                          </span>
                        </div>
                      ) : (
                        <span className="text-[14px] text-[var(--color-muted)]">
                          لم يقدّم مكتبك عرضاً على هذا الطلب بعد
                        </span>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {!isUnapprovedMerchant && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setChatTarget({
                                threadType: 'request',
                                threadId: req.id,
                                officeId: office?.id,
                                title: `محادثة مع ${req.customerName}`,
                                subtitle: `حول طلب: ${req.productName}`,
                              })
                            }
                            leftIcon={<MessageSquare className="w-4 h-4" strokeWidth={1.75} />}
                          >
                            {AR_STRINGS.market.chatButton}
                          </Button>
                        )}
                        {!myOffer &&
                          req.status !== 'accepted' &&
                          req.status !== 'cancelled' &&
                          !isUnapprovedMerchant && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => openOfferModal(req)}
                              leftIcon={<Send className="w-4 h-4" strokeWidth={1.75} />}
                            >
                              {AR_STRINGS.market.submitOffer}
                            </Button>
                          )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Merchant: My Offers Tab (own office only) */}
      {!isCustomer && activeTab === 'my_offers' && (
        <DataTable<Offer>
          data={myOffers}
          columns={merchantOfferColumns}
          keyExtractor={(o) => o.id}
          title="سجل عروض الأسعار المقدمة من مكتبك"
          exportFileName="market_merchant_offers"
          emptyTitle="لم يقدّم مكتبك عروض أسعار بعد"
          emptyDescription="تعرض هذه الشاشة عروض مكتبك فقط (ولا تظهر عروض أي مكتب منافس). انتقل إلى الطلبات المطابقة لتقديم أول عرض."
          emptyActionLabel="عرض الطلبات المطابقة"
          onEmptyAction={() => setActiveTab('matching_requests')}
        />
      )}

      {/* Orders Tab (Customer & Approved Merchants) */}
      {activeTab === 'orders' && user && (
        <MarketOrdersSection
          orders={orders}
          user={user}
          isCustomer={isCustomer}
          favoriteMerchantIds={favoriteMerchantIds}
          onRefresh={loadMarketData}
          onOpenChat={(target) => setChatTarget(target)}
          onToggleFavoriteMerchant={(order) => handleToggleFavoriteMerchantById(order.officeId)}
          onComplaintCreated={async () => {
            await loadMarketData();
            setActiveTab('complaints');
          }}
        />
      )}

      {/* Favorites Tab (Customer only) */}
      {isCustomer && activeTab === 'favorites' && (
        <MarketFavoritesSection
          favorites={favorites}
          onRemoveFavorite={handleRemoveFavorite}
          onReorderFromFavorite={handleReorderFromFavorite}
        />
      )}

      {/* Complaints Tab (Customer & Merchant) */}
      {activeTab === 'complaints' && user && (
        <MarketComplaintsSection
          complaints={complaints}
          user={user}
          isCustomer={isCustomer}
          onRefresh={loadMarketData}
        />
      )}

      {/* General Offers Tab (Customer & Approved Merchants) */}
      {activeTab === 'general_offers' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="w-full sm:max-w-md">
              <Input
                placeholder="ابحث في العروض العامة بالصنف أو اسم المكتب أو المدينة..."
                value={genSearch}
                onChange={(e) => setGenSearch(e.target.value)}
                aria-label="بحث في العروض العامة"
              />
            </div>
            <span className="text-[14px] text-[var(--color-muted)] num-tabular">
              عدد العروض المعتمدة: {filteredGeneralOffers.length}
            </span>
          </div>

          {filteredGeneralOffers.length === 0 ? (
            <EmptyState
              icon={<Tag className="w-8 h-8" strokeWidth={1.75} />}
              title="لا توجد عروض عامة مطابقة حالياً"
              description="تظهر هنا العروض الدورية المنشورة من المكاتب الطبية المعتمدة فقط."
              actionLabel={
                !isCustomer && !isUnapprovedMerchant
                  ? AR_STRINGS.market.publishGeneralOffer
                  : undefined
              }
              onAction={
                !isCustomer && !isUnapprovedMerchant
                  ? () => setShowGenOfferModal(true)
                  : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGeneralOffers.map((g) => {
                const favSaved = isFavoriteProduct(g.officeId, g.productId, g.productName);
                return (
                  <article
                    key={g.id}
                    className="clinical-card p-5 flex flex-col justify-between gap-3 border border-[var(--color-line)]"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[14px] font-semibold text-[var(--color-primary-strong)] flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                          <span>{g.officeName}</span>
                        </span>
                        <StatusBadge variant="teal" size="sm">
                          معتمد
                        </StatusBadge>
                      </div>

                      <h3 className="text-[17px] font-bold text-[var(--color-ink)] leading-snug">
                        {g.productName}
                      </h3>

                      <div className="flex items-center gap-1.5 text-[14px] text-[var(--color-muted)]">
                        <MapPin className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                        <span>{g.officeCity}</span>
                      </div>

                      {g.notes && (
                        <p className="text-[14px] text-[var(--color-muted)]">{g.notes}</p>
                      )}
                    </div>

                    <div className="space-y-3 pt-3 border-t border-[var(--color-line)]">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[14px] text-[var(--color-muted)] block">
                            السعر ({g.unit || 'وحدة'})
                          </span>
                          <MoneyText amount={g.price} size="lg" tone="primary" />
                        </div>
                        <div className="text-left text-[14px] text-[var(--color-muted)]">
                          <div className="num-tabular font-semibold text-[var(--color-ink)]">
                            الكمية: {formatWesternInt(g.quantity)}
                          </div>
                          <div className="num-tabular flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>حتى {g.validity}</span>
                          </div>
                        </div>
                      </div>

                      {isCustomer && (
                        <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-line)]">
                          <Button
                            variant={favSaved ? 'primary' : 'secondary'}
                            size="sm"
                            className="flex-1"
                            onClick={() => handleToggleFavoriteProduct(g)}
                            leftIcon={<Heart className="w-4 h-4" strokeWidth={1.75} />}
                          >
                            {favSaved ? 'في المفضلة' : 'حفظ بالمفضلة'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleReorderFromFavorite({
                                id: g.id,
                                customerUserId: user?.id || '',
                                kind: 'product',
                                officeId: g.officeId,
                                officeName: g.officeName,
                                officeCity: g.officeCity,
                                productId: g.productId,
                                productName: g.productName,
                                unitPrice: g.price,
                                unit: g.unit,
                                createdAt: g.createdAt,
                              })
                            }
                            leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
                          >
                            طلب سريع
                          </Button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal: Customer New Purchase Request */}
      <Modal
        isOpen={showNewRequestModal}
        onClose={() => setShowNewRequestModal(false)}
        title="نشر طلب شراء جديد في السوق"
        description="تصل إشعارات الطلب تلقائياً إلى المكاتب المعتمدة الأنسب حسب الصنف والسعر والمدينة."
        maxWidth="md"
      >
        <form onSubmit={handleCreateRequest} className="space-y-4">
          <Input
            label="اسم المادة الطبية المطلوبة"
            required
            placeholder="مثال: قفازات فحص لاتكس أو كمامات N95"
            value={reqProductName}
            onChange={(e) => setReqProductName(e.target.value)}
            onBlur={() => setReqTouched((p) => ({ ...p, productName: true }))}
            error={reqTouched.productName ? reqErrors.productName : undefined}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="الكمية المطلوبة"
              required
              type="number"
              inputMode="numeric"
              min={1}
              value={reqQuantity}
              onChange={(e) => setReqQuantity(e.target.value)}
              onBlur={() => setReqTouched((p) => ({ ...p, quantity: true }))}
              error={reqTouched.quantity ? reqErrors.quantity : undefined}
            />

            <MoneyInput
              label="السعر المستهدف للوحدة"
              required
              value={reqTargetPrice}
              onChangeValue={(v) => setReqTargetPrice(v)}
              onBlur={() => setReqTouched((p) => ({ ...p, targetPrice: true }))}
              error={reqTouched.targetPrice ? reqErrors.targetPrice : undefined}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="مدينة التسليم"
              required
              placeholder="مثال: بغداد، البصرة، النجف"
              value={reqDeliveryCity}
              onChange={(e) => setReqDeliveryCity(e.target.value)}
              onBlur={() => setReqTouched((p) => ({ ...p, deliveryCity: true }))}
              error={reqTouched.deliveryCity ? reqErrors.deliveryCity : undefined}
            />

            <Input
              label="الموعد النهائي للتجهيز"
              required
              type="date"
              value={reqDeadline}
              onChange={(e) => setReqDeadline(e.target.value)}
              onBlur={() => setReqTouched((p) => ({ ...p, deadline: true }))}
              error={reqTouched.deadline ? reqErrors.deadline : undefined}
            />
          </div>

          <Textarea
            label="ملاحظات ومواصفات فنية إضافية"
            placeholder="مثال: يشترط تاريخ صلاحية لا يقل عن سنة..."
            value={reqNotes}
            onChange={(e) => setReqNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-line)]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowNewRequestModal(false)}
            >
              رجوع
            </Button>
            <Button type="submit" variant="primary" isLoading={isCreatingReq}>
              حفظ ونشر الطلب
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Merchant Submit Offer */}
      <Modal
        isOpen={Boolean(offerModalReq)}
        onClose={() => setOfferModalReq(null)}
        title="تقديم عرض سعر للطلب"
        description={
          offerModalReq
            ? `الطلب: ${offerModalReq.productName} · المطلوب: ${formatWesternInt(
                offerModalReq.quantity
              )} وحدة (${offerModalReq.deliveryCity})`
            : undefined
        }
        maxWidth="md"
      >
        <form onSubmit={handleOfferFormSubmit} className="space-y-4">
          <SearchableSelect
            label="المادة المطابقة من مستودع مكتبك"
            required
            value={offerProductId}
            onChange={(val) => {
              setOfferProductId(val);
              const prod = officeProducts.find((p) => p.id === val);
              if (prod && prod.salePrice > 0) {
                setOfferPrice(prod.salePrice);
              }
            }}
            onBlur={() => setOfferTouched((p) => ({ ...p, productId: true }))}
            options={officeProducts.map((p) => ({
              value: p.id,
              label: p.name,
              meta: `الرصيد المتاح: ${formatWesternInt(p.quantityOnHand)} ${p.unit} · البيع: ${formatWesternInt(
                p.salePrice
              )} د.ع`,
            }))}
            error={offerTouched.productId ? offerErrors.productId : undefined}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MoneyInput
              label="سعر الوحدة المقدم"
              required
              value={offerPrice}
              onChangeValue={(v) => setOfferPrice(v)}
              onBlur={() => setOfferTouched((p) => ({ ...p, price: true }))}
              error={offerTouched.price ? offerErrors.price : undefined}
            />

            <Input
              label="الكمية المتوفرة للعرض"
              required
              type="number"
              inputMode="numeric"
              min={1}
              value={offerQty}
              onChange={(e) => setOfferQty(e.target.value)}
              onBlur={() => setOfferTouched((p) => ({ ...p, qty: true }))}
              error={offerTouched.qty ? offerErrors.qty : undefined}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="مدة التوصيل"
              required
              placeholder="مثال: خلال 24 ساعة"
              value={offerDeliveryTime}
              onChange={(e) => setOfferDeliveryTime(e.target.value)}
              onBlur={() => setOfferTouched((p) => ({ ...p, deliveryTime: true }))}
              error={offerTouched.deliveryTime ? offerErrors.deliveryTime : undefined}
            />

            <Input
              label="صلاحية عرض السعر حتى"
              required
              type="date"
              value={offerValidity}
              onChange={(e) => setOfferValidity(e.target.value)}
              onBlur={() => setOfferTouched((p) => ({ ...p, validity: true }))}
              error={offerTouched.validity ? offerErrors.validity : undefined}
            />
          </div>

          <Textarea
            label="شروط الدفع أو التجهيز (اختياري)"
            placeholder="مثال: شامل التوصيل لبغداد..."
            value={offerNotes}
            onChange={(e) => setOfferNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-line)]">
            <Button type="button" variant="secondary" onClick={() => setOfferModalReq(null)}>
              رجوع
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmittingOffer}>
              حفظ وإرسال العرض
            </Button>
          </div>
        </form>
      </Modal>

      {/* Stock Warning Dialog before confirming offer when inventory is short */}
      <ConfirmDialog
        isOpen={Boolean(stockWarningDialog)}
        onClose={() => setStockWarningDialog(null)}
        onConfirm={commitSubmitOffer}
        isDestructive={false}
        isLoading={isSubmittingOffer}
        title="تنبيه نقص مخزون قبل تأكيد العرض"
        confirmLabel="إرسال العرض رغم النقص"
        cancelLabel="رجوع"
        message={
          stockWarningDialog?.check.warningMessageAr ||
          'الرصيد المتاح في المستودع أقل من الكمية المطلوبة. هل تريد متابعة إرسال العرض؟'
        }
      />

      {/* Modal: Merchant Publish General Offer */}
      <Modal
        isOpen={showGenOfferModal}
        onClose={() => setShowGenOfferModal(false)}
        title="نشر عرض عام في سوق المستلزمات"
        description="يظهر العرض العام لجميع المستشفيات والعملاء في منصة السوق."
        maxWidth="md"
      >
        <form onSubmit={handlePublishGenOffer} className="space-y-4">
          <SearchableSelect
            label="اختيار صنف من مستودع مكتبك (اختياري)"
            value={genProductId}
            onChange={(val) => {
              setGenProductId(val);
              const p = officeProducts.find((x) => x.id === val);
              if (p) {
                setGenCustomName(p.name);
                if (p.salePrice > 0) setGenPrice(p.salePrice);
              }
            }}
            options={officeProducts.map((p) => ({
              value: p.id,
              label: p.name,
              meta: `الرصيد: ${formatWesternInt(p.quantityOnHand)} ${p.unit}`,
            }))}
            placeholder="اختر صنفاً أو اكتب اسماً مخصصاً أدناه..."
          />

          <Input
            label="اسم المادة الطبية في العرض"
            required
            value={genCustomName}
            onChange={(e) => setGenCustomName(e.target.value)}
            onBlur={() => setGenTouched((p) => ({ ...p, productName: true }))}
            error={genTouched.productName ? genErrors.productName : undefined}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MoneyInput
              label="السعر المعروض للوحدة"
              required
              value={genPrice}
              onChangeValue={(v) => setGenPrice(v)}
              onBlur={() => setGenTouched((p) => ({ ...p, price: true }))}
              error={genTouched.price ? genErrors.price : undefined}
            />

            <Input
              label="الكمية المتاحة بالعرض"
              required
              type="number"
              inputMode="numeric"
              min={1}
              value={genQty}
              onChange={(e) => setGenQty(e.target.value)}
              onBlur={() => setGenTouched((p) => ({ ...p, qty: true }))}
              error={genTouched.qty ? genErrors.qty : undefined}
            />
          </div>

          <Input
            label="صالح حتى تاريخ"
            required
            type="date"
            value={genValidity}
            onChange={(e) => setGenValidity(e.target.value)}
            onBlur={() => setGenTouched((p) => ({ ...p, validity: true }))}
            error={genTouched.validity ? genErrors.validity : undefined}
          />

          <Textarea
            label="ملاحظات العرض (اختياري)"
            placeholder="مثال: توصيل مجاني للطلبات فوق 50 علبة..."
            value={genNotes}
            onChange={(e) => setGenNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-line)]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowGenOfferModal(false)}
            >
              رجوع
            </Button>
            <Button type="submit" variant="primary" isLoading={isPublishingGen}>
              حفظ ونشر العرض العام
            </Button>
          </div>
        </form>
      </Modal>

      <OrderChatDrawer
        isOpen={Boolean(chatTarget)}
        target={chatTarget}
        user={user}
        onClose={() => setChatTarget(null)}
      />
    </div>
  );
};

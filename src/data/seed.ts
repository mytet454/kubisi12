/**
 * src/data/seed.ts
 * Master seed data for "سوق المستلزمات الطبية" (Iraq).
 * Includes 2 offices (Baghdad, Basra), staff, 30+ medical products, batches,
 * and initial stock movements ensuring real quantities on hand.
 */
import {
  Account,
  AuditLog,
  Batch,
  DatabaseSchema,
  Expense,
  GeneralOffer,
  hashPassword,
  Invoice,
  MarketChatMessage,
  MarketFavorite,
  MarketOrder,
  Notification,
  Offer,
  Office,
  OrderComplaint,
  Party,
  Payment,
  Period,
  Product,
  PurchaseRequest,
  StockMovement,
  User,
  Warehouse,
} from './repository';
import { matchApprovedMerchantsForRequest } from '../domain/market';

export function createInitialSeedData(): DatabaseSchema {
  const commonPasswordHash = hashPassword('123456');

  // 1. Offices
  const offices: Office[] = [
    {
      id: 'office_baghdad',
      name: 'مكتب الرافدين للمستلزمات الطبية',
      city: 'بغداد - شارع السعدون',
      phone: '07701234567',
      status: 'approved',
      licenseFile: 'license_baghdad_2026.pdf',
      invoiceHeader: 'مكتب الرافدين لتجهيز المستشفيات والمراكز التخصصية - بغداد',
      invoiceFooter: 'المواد المباعة تخضع للفحص الطبي المعتمد - شكراً لتعاملكم معنا',
      nearExpiryDays: 90,
      defaultReorderLevel: 25,
      allowNegativeStock: false,
      createdAt: '2026-01-01T08:00:00.000Z',
    },
    {
      id: 'office_basra',
      name: 'شركة شط العرب للتجهيزات الجراحية',
      city: 'البصرة - العشار',
      phone: '07809876543',
      status: 'approved',
      licenseFile: 'license_basra_surgical.pdf',
      invoiceHeader: 'شركة شط العرب للمستلزمات والمستهلكات الجراحية - البصرة',
      invoiceFooter: 'البصرة - شارع الاستقلال - هاتف: 07809876543',
      nearExpiryDays: 90,
      defaultReorderLevel: 20,
      allowNegativeStock: false,
      createdAt: '2026-01-05T09:00:00.000Z',
    },
    {
      id: 'office_pending_erbil',
      name: 'مكتب بابل الطبي الحديث',
      city: 'بابل - الحلة',
      phone: '07712399999',
      status: 'pending',
      licenseFile: 'license_babil_draft.pdf',
      nearExpiryDays: 90,
      defaultReorderLevel: 20,
      allowNegativeStock: false,
      createdAt: '2026-02-01T10:00:00.000Z',
    },
  ];

  // 2. Users
  const users: User[] = [
    // Baghdad Office Team
    {
      id: 'user_bg_owner',
      name: 'د. علي الجبوري',
      phone: '07701111111',
      email: 'ali@rafidain-med.iq',
      passwordHash: commonPasswordHash,
      role: 'owner',
      officeId: 'office_baghdad',
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },
    {
      id: 'user_bg_accountant',
      name: 'سامر المحاسب',
      phone: '07702222222',
      email: 'samer@rafidain-med.iq',
      passwordHash: commonPasswordHash,
      role: 'accountant',
      officeId: 'office_baghdad',
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },
    {
      id: 'user_bg_warehouse',
      name: 'كرار أمين المستودع',
      phone: '07703333333',
      email: 'karrar@rafidain-med.iq',
      passwordHash: commonPasswordHash,
      role: 'warehouse_keeper',
      officeId: 'office_baghdad',
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },
    {
      id: 'user_bg_cashier',
      name: 'حسين الكاشير والمبيعات',
      phone: '07704444444',
      email: 'hussein@rafidain-med.iq',
      passwordHash: commonPasswordHash,
      role: 'cashier',
      officeId: 'office_baghdad',
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },

    // Basra Office Team
    {
      id: 'user_bs_owner',
      name: 'حاج مصطفى السعدون',
      phone: '07801111111',
      email: 'mustafa@shatt-arab.iq',
      passwordHash: commonPasswordHash,
      role: 'owner',
      officeId: 'office_basra',
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },
    {
      id: 'user_bs_accountant',
      name: 'عمار عبد الحسين (محاسب البصرة)',
      phone: '07802222222',
      email: 'ammar@shatt-arab.iq',
      passwordHash: commonPasswordHash,
      role: 'accountant',
      officeId: 'office_basra',
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },
    {
      id: 'user_bs_warehouse',
      name: 'ضياء خلف (مستودع البصرة)',
      phone: '07803333333',
      email: 'diaa@shatt-arab.iq',
      passwordHash: commonPasswordHash,
      role: 'warehouse_keeper',
      officeId: 'office_basra',
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },
    {
      id: 'user_bs_cashier',
      name: 'مرتضى البصري (كاشير البصرة)',
      phone: '07804444444',
      email: 'murtadha@shatt-arab.iq',
      passwordHash: commonPasswordHash,
      role: 'cashier',
      officeId: 'office_basra',
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },

    // Customers (Hospital & Individual)
    {
      id: 'user_cust_hospital',
      name: 'مستشفى الأمل الجراحي التخصصي',
      phone: '07901112233',
      email: 'purchasing@amal-hospital.iq',
      passwordHash: commonPasswordHash,
      role: 'customer',
      officeId: null,
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },
    {
      id: 'user_cust_individual',
      name: 'د. فراس التميمي (عيادة العظام)',
      phone: '07904445566',
      email: 'dr.firas@gmail.com',
      passwordHash: commonPasswordHash,
      role: 'customer',
      officeId: null,
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },

    // Platform Admin
    {
      id: 'user_platform_admin',
      name: 'مشرف المنصة العام (وزارة الصحة / النقابة)',
      phone: '07700000000',
      email: 'admin@medmarket.iq',
      passwordHash: commonPasswordHash,
      role: 'platform_admin',
      officeId: null,
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },

    // Pending / Unapproved Office Owner (invisible & blocked in Market)
    {
      id: 'user_babil_owner',
      name: 'مالك مكتب بابل الطبي الحديث (قيد الاعتماد)',
      phone: '07712399999',
      email: 'owner@babil-med.iq',
      passwordHash: commonPasswordHash,
      role: 'owner',
      officeId: 'office_pending_erbil',
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    },
  ];

  // 3. Warehouses
  const warehouses: Warehouse[] = [
    {
      id: 'wh_bg_main',
      officeId: 'office_baghdad',
      name: 'مستودع الكرخ المركزي',
      city: 'بغداد - المنصور',
      isDefault: true,
    },
    {
      id: 'wh_bg_secondary',
      officeId: 'office_baghdad',
      name: 'مستودع الرصافة الطبي',
      city: 'بغداد - الباب الشرقي',
      isDefault: false,
    },
    {
      id: 'wh_bs_main',
      officeId: 'office_basra',
      name: 'مستودع العشار للجراحة',
      city: 'البصرة - العشار',
      isDefault: true,
    },
  ];

  // 4. Products Raw Definition (about 25 Baghdad products, some low stock, some near expiry)
  const productTemplates = [
    // 1. Examination Gloves
    { id: 'prd_bg_01', name: 'قفازات فحص طبية لاتكس معقمة (علبة 100)', unit: 'علبة', purchasePrice: 4500, salePrice: 6500, reorderLevel: 50, avgCost: 4500, batchQty: 18, daysExpiry: 45, lot: 'LOT-GLV-26A' }, // Low stock & near expiry
    { id: 'prd_bg_02', name: 'قفازات فحص نايتريل زرقاء خالية من البودرة (علبة 100)', unit: 'علبة', purchasePrice: 5500, salePrice: 8000, reorderLevel: 40, avgCost: 5500, batchQty: 85, daysExpiry: 420, lot: 'LOT-NIT-27B' },
    // 2. Masks & PPE
    { id: 'prd_bg_03', name: 'كمامات جراحية ثلاثية الطبقات مع سلك أنف (علبة 50)', unit: 'علبة', purchasePrice: 2000, salePrice: 3500, reorderLevel: 60, avgCost: 2000, batchQty: 25, daysExpiry: 55, lot: 'LOT-MSK-26A' }, // Low stock & near expiry
    { id: 'prd_bg_04', name: 'كمامات طبية عالية الحماية N95 معقمة', unit: 'قطعة', purchasePrice: 1200, salePrice: 2000, reorderLevel: 50, avgCost: 1200, batchQty: 140, daysExpiry: 360, lot: 'LOT-N95-27A' },
    // 3. Syringes
    { id: 'prd_bg_05', name: 'سرنجات طبية 5 مل مع إبرة معقمة (باكيت 100)', unit: 'باكيت', purchasePrice: 6000, salePrice: 9000, reorderLevel: 30, avgCost: 6000, batchQty: 60, daysExpiry: 500, lot: 'LOT-SYR-05' },
    { id: 'prd_bg_06', name: 'سرنجات طبية 3 مل معقمة استخدام لمرة واحدة (باكيت 100)', unit: 'باكيت', purchasePrice: 5500, salePrice: 8500, reorderLevel: 35, avgCost: 5500, batchQty: 22, daysExpiry: 700, lot: 'LOT-SYR-03' }, // Low stock
    { id: 'prd_bg_07', name: 'سرنجات أنسولين دقيقة 1 مل مع إبرة 30G (علبة 100)', unit: 'علبة', purchasePrice: 7000, salePrice: 11000, reorderLevel: 40, avgCost: 7000, batchQty: 75, daysExpiry: 48, lot: 'LOT-INS-26C' }, // Near expiry
    // 4. Cannulas & IV
    { id: 'prd_bg_08', name: 'كانيولا وريدية مقاس 20G وردي مع صمام (علبة 50)', unit: 'علبة', purchasePrice: 15000, salePrice: 22500, reorderLevel: 25, avgCost: 15000, batchQty: 40, daysExpiry: 600, lot: 'LOT-CAN-20' },
    { id: 'prd_bg_09', name: 'كانيولا وريدية مقاس 22G أزرق مع صمام (علبة 50)', unit: 'علبة', purchasePrice: 15000, salePrice: 22500, reorderLevel: 25, avgCost: 15000, batchQty: 15, daysExpiry: 52, lot: 'LOT-CAN-22' }, // Low stock & near expiry
    { id: 'prd_bg_10', name: 'جهاز إعطاء محاليل وريدية IV Set معقم فلتر', unit: 'قطعة', purchasePrice: 400, salePrice: 750, reorderLevel: 200, avgCost: 400, batchQty: 500, daysExpiry: 450, lot: 'LOT-IVS-27' },
    // 5. Saline & Solutions
    { id: 'prd_bg_11', name: 'محلول ملحي نورمال سلاين 0.9% وريدي 500 مل', unit: 'قنينة', purchasePrice: 850, salePrice: 1500, reorderLevel: 100, avgCost: 850, batchQty: 280, daysExpiry: 320, lot: 'LOT-NS-500' },
    { id: 'prd_bg_12', name: 'محلول كلوكوز وريدي 5% سائل معقم 500 مل', unit: 'قنينة', purchasePrice: 900, salePrice: 1600, reorderLevel: 80, avgCost: 900, batchQty: 50, daysExpiry: 40, lot: 'LOT-GLU-50' }, // Low stock & near expiry
    { id: 'prd_bg_13', name: 'محلول رينجر لاكتات وريدي 500 مل للإنعاش', unit: 'قنينة', purchasePrice: 1100, salePrice: 1900, reorderLevel: 60, avgCost: 1100, batchQty: 120, daysExpiry: 400, lot: 'LOT-RL-500' },
    // 6. Wound Care & Underpads
    { id: 'prd_bg_14', name: 'مفارش طبية واقية للكبار تحت المريض Underpads (كيس 10)', unit: 'كيس', purchasePrice: 4500, salePrice: 7000, reorderLevel: 50, avgCost: 4500, batchQty: 90, daysExpiry: 800, lot: 'LOT-PAD-10' },
    { id: 'prd_bg_15', name: 'شاش شاش طبي معقم 10×10 سم غير لاصق (باكيت 100)', unit: 'باكيت', purchasePrice: 6500, salePrice: 10000, reorderLevel: 30, avgCost: 6500, batchQty: 14, daysExpiry: 365, lot: 'LOT-GAZ-10' }, // Low stock
    { id: 'prd_bg_16', name: 'باندج ضاغط مطاطي قطني 10 سم للكسور والإصابات', unit: 'لفة', purchasePrice: 1000, salePrice: 1800, reorderLevel: 40, avgCost: 1000, batchQty: 110, daysExpiry: 900, lot: 'LOT-BND-10' },
    { id: 'prd_bg_17', name: 'بلاستر طبي لاصق جراحي حريري 5 سم × 5 متر', unit: 'بكرة', purchasePrice: 1500, salePrice: 2500, reorderLevel: 35, avgCost: 1500, batchQty: 70, daysExpiry: 500, lot: 'LOT-TAP-05' },
    // 7. Diagnostics & Devices
    { id: 'prd_bg_18', name: 'جهاز قياس الأكسجين بالنبض Pulse Oximeter إصبعي', unit: 'جهاز', purchasePrice: 12000, salePrice: 18500, reorderLevel: 15, avgCost: 12000, batchQty: 32, daysExpiry: 1200, lot: 'LOT-OXI-01' },
    { id: 'prd_bg_19', name: 'محرار طبي رقمي سريع للجبهة بالأشعة تحت الحمراء', unit: 'جهاز', purchasePrice: 16000, salePrice: 25000, reorderLevel: 10, avgCost: 16000, batchQty: 18, daysExpiry: 1200, lot: 'LOT-THM-02' },
    { id: 'prd_bg_20', name: 'شرائط فحص السكر بالدم Accu-Chek (علبة 50 شريط)', unit: 'علبة', purchasePrice: 14000, salePrice: 21000, reorderLevel: 30, avgCost: 14000, batchQty: 24, daysExpiry: 58, lot: 'LOT-ACC-50' }, // Low stock & near expiry
    { id: 'prd_bg_21', name: 'خيوط جراحية سلك حرير معقم مع إبرة قوسية 2/0 (علبة 12)', unit: 'علبة', purchasePrice: 9000, salePrice: 14000, reorderLevel: 20, avgCost: 9000, batchQty: 45, daysExpiry: 600, lot: 'LOT-SUT-20' },
    { id: 'prd_bg_22', name: 'مشارط جراحية شفرات كربونية معقمة مقاس 15 (علبة 100)', unit: 'علبة', purchasePrice: 8500, salePrice: 13500, reorderLevel: 15, avgCost: 8500, batchQty: 28, daysExpiry: 750, lot: 'LOT-BLD-15' },
  ];

  const products: Product[] = [];
  const batches: Batch[] = [];
  const stockMovements: StockMovement[] = [];
  const notifications: Notification[] = [];

  const now = new Date();

  // Populate Baghdad Products, Batches and Initial Purchase Movements
  productTemplates.forEach((t) => {
    products.push({
      id: t.id,
      officeId: 'office_baghdad',
      name: t.name,
      unit: t.unit,
      purchasePrice: t.purchasePrice,
      salePrice: t.salePrice,
      reorderLevel: t.reorderLevel,
      avgCost: t.avgCost,
      active: true,
    });

    const expiryDate = new Date(now.getTime() + t.daysExpiry * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const batchId = `bth_${t.id}`;

    batches.push({
      id: batchId,
      productId: t.id,
      warehouseId: 'wh_bg_main',
      lotNumber: t.lot,
      expiryDate,
    });

    // Initial stock movement (positive quantity arrives through initial stocking/purchase)
    stockMovements.push({
      id: `mov_init_${t.id}`,
      officeId: 'office_baghdad',
      type: 'purchase',
      productId: t.id,
      batchId,
      warehouseId: 'wh_bg_main',
      quantity: t.batchQty,
      refType: 'initial_stock',
      refId: 'SEED-INIT-2026',
      date: '2026-01-10T10:00:00.000Z',
      userId: 'user_bg_owner',
    });

    // Add alert notification if low stock or near expiry
    if (t.batchQty <= t.reorderLevel) {
      notifications.push({
        id: `notif_low_${t.id}`,
        userId: 'user_bg_owner',
        kind: 'alert',
        text: `تنبيه نقص مخزون: المادة "${t.name}" رصيدها (${t.batchQty} ${t.unit}) وصل لحد إعادة الطلب (${t.reorderLevel}).`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    if (t.daysExpiry <= 90) {
      notifications.push({
        id: `notif_exp_${t.id}`,
        userId: 'user_bg_owner',
        kind: 'alert',
        text: `تنبيه اقتراب انتهاء صلاحية: المادة "${t.name}" الوجبة (${t.lot}) تنتهي خلال ${t.daysExpiry} يوماً (${expiryDate}).`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  });

  // Basra Office Products & Stock (Separate Tenant)
  const basraProducts = [
    { id: 'prd_bs_01', name: 'قفازات جراحية معقمة مقاس 7.5 خالية من البودرة (علبة 50)', unit: 'علبة', purchasePrice: 18000, salePrice: 26000, reorderLevel: 20, avgCost: 18000, batchQty: 45, daysExpiry: 450, lot: 'LOT-BS-GLV' },
    { id: 'prd_bs_02', name: 'شاش جراحي معقم شريط قطني 10 سم × 5 متر (باكيت 50)', unit: 'باكيت', purchasePrice: 12000, salePrice: 18000, reorderLevel: 15, avgCost: 12000, batchQty: 10, daysExpiry: 40, lot: 'LOT-BS-GAZ' }, // Low stock & near expiry
    { id: 'prd_bs_03', name: 'كانيولا وريدية جراحية 18G أخضر لغرف العمليات (علبة 50)', unit: 'علبة', purchasePrice: 16000, salePrice: 24000, reorderLevel: 25, avgCost: 16000, batchQty: 30, daysExpiry: 550, lot: 'LOT-BS-CAN' },
  ];

  basraProducts.forEach((t) => {
    products.push({
      id: t.id,
      officeId: 'office_basra',
      name: t.name,
      unit: t.unit,
      purchasePrice: t.purchasePrice,
      salePrice: t.salePrice,
      reorderLevel: t.reorderLevel,
      avgCost: t.avgCost,
      active: true,
    });

    const expiryDate = new Date(now.getTime() + t.daysExpiry * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const batchId = `bth_${t.id}`;

    batches.push({
      id: batchId,
      productId: t.id,
      warehouseId: 'wh_bs_main',
      lotNumber: t.lot,
      expiryDate,
    });

    stockMovements.push({
      id: `mov_init_${t.id}`,
      officeId: 'office_basra',
      type: 'purchase',
      productId: t.id,
      batchId,
      warehouseId: 'wh_bs_main',
      quantity: t.batchQty,
      refType: 'initial_stock',
      refId: 'SEED-INIT-BASRA',
      date: '2026-01-12T10:00:00.000Z',
      userId: 'user_bs_owner',
    });
  });

  // 5. Chart of Accounts
  const accounts: Account[] = [
    // Baghdad Office Accounts
    { id: 'acc_bg_101', officeId: 'office_baghdad', code: '101', name: 'صندوق النقد الرئيسي', type: 'asset' },
    { id: 'acc_bg_102', officeId: 'office_baghdad', code: '102', name: 'الحساب المصرفي (مصرف بغداد)', type: 'asset' },
    { id: 'acc_bg_103', officeId: 'office_baghdad', code: '103', name: 'المدينون - ذمم العملاء', type: 'asset' },
    { id: 'acc_bg_104', officeId: 'office_baghdad', code: '104', name: 'مخزون بضاعة المستلزمات الطبية', type: 'asset' },
    { id: 'acc_bg_201', officeId: 'office_baghdad', code: '201', name: 'الدائنون - ذمم الموردين', type: 'liability' },
    { id: 'acc_bg_301', officeId: 'office_baghdad', code: '301', name: 'رأس مال المالك', type: 'equity' },
    { id: 'acc_bg_401', officeId: 'office_baghdad', code: '401', name: 'إيرادات مبيعات المستلزمات الطبية', type: 'revenue' },
    { id: 'acc_bg_501', officeId: 'office_baghdad', code: '501', name: 'تكلفة البضاعة المباعة (COGS)', type: 'expense' },
    { id: 'acc_bg_502', officeId: 'office_baghdad', code: '502', name: 'مصاريف إيجار المستودعات', type: 'expense' },
    { id: 'acc_bg_503', officeId: 'office_baghdad', code: '503', name: 'رواتب وأجور الكادر', type: 'expense' },
    { id: 'acc_bg_504', officeId: 'office_baghdad', code: '504', name: 'مصاريف نقل وتوزيع وتفريغ', type: 'expense' },
    { id: 'acc_bg_505', officeId: 'office_baghdad', code: '505', name: 'مصاريف كهرباء ومولدات', type: 'expense' },

    // Basra Office Accounts
    { id: 'acc_bs_101', officeId: 'office_basra', code: '101', name: 'صندوق النقد الرئيسي', type: 'asset' },
    { id: 'acc_bs_102', officeId: 'office_basra', code: '102', name: 'الحساب المصرفي (البصرة)', type: 'asset' },
    { id: 'acc_bs_103', officeId: 'office_basra', code: '103', name: 'المدينون - ذمم العملاء', type: 'asset' },
    { id: 'acc_bs_104', officeId: 'office_basra', code: '104', name: 'مخزون بضاعة المستلزمات الطبية', type: 'asset' },
    { id: 'acc_bs_201', officeId: 'office_basra', code: '201', name: 'الدائنون - ذمم الموردين', type: 'liability' },
    { id: 'acc_bs_301', officeId: 'office_basra', code: '301', name: 'رأس مال المالك', type: 'equity' },
    { id: 'acc_bs_401', officeId: 'office_basra', code: '401', name: 'إيرادات مبيعات المستلزمات الطبية', type: 'revenue' },
    { id: 'acc_bs_501', officeId: 'office_basra', code: '501', name: 'تكلفة البضاعة المباعة (COGS)', type: 'expense' },
    { id: 'acc_bs_502', officeId: 'office_basra', code: '502', name: 'مصاريف تشغيلية عامة', type: 'expense' },
  ];

  // 6. Audit Logs
  const auditLogs: AuditLog[] = [
    {
      id: 'log_01',
      officeId: 'office_baghdad',
      userId: 'user_bg_owner',
      userName: 'د. علي الجبوري',
      action: 'INIT_SYSTEM',
      entity: 'Office',
      entityId: 'office_baghdad',
      before: null,
      after: { name: 'مكتب الرافدين للمستلزمات الطبية' },
      at: '2026-01-01T08:00:00.000Z',
    },
    {
      id: 'log_02',
      officeId: 'office_basra',
      userId: 'user_bs_owner',
      userName: 'حاج مصطفى السعدون',
      action: 'INIT_SYSTEM',
      entity: 'Office',
      entityId: 'office_basra',
      before: null,
      after: { name: 'شركة شط العرب للتجهيزات الجراحية' },
      at: '2026-01-05T09:00:00.000Z',
    },
  ];

  // 7. Seed Parties (Customers & Suppliers)
  const parties: Party[] = [
    // Baghdad Customers
    {
      id: 'party_bg_cust_1',
      officeId: 'office_baghdad',
      kind: 'customer',
      name: 'مستشفى الأمل الجراحي التخصصي',
      phone: '07901112233', // Matches user_cust_hospital
      city: 'بغداد - الكرادة',
      openingBalance: 1500000, // Owed 1,500,000 IQD opening balance
      linkedUserId: 'user_cust_hospital',
    },
    {
      id: 'party_bg_cust_2',
      officeId: 'office_baghdad',
      kind: 'customer',
      name: 'مجمع دجلة الطبي التخصصي',
      phone: '07705556677',
      city: 'بغداد - المنصور',
      openingBalance: 0,
      linkedUserId: null,
    },
    {
      id: 'party_bg_cust_3',
      officeId: 'office_baghdad',
      kind: 'customer',
      name: 'د. سرمد الجراح (عيادة خاصة)',
      phone: '07707778899',
      city: 'بغداد - الحارثية',
      openingBalance: 350000,
      linkedUserId: null,
    },

    // Baghdad Suppliers
    {
      id: 'party_bg_supp_1',
      officeId: 'office_baghdad',
      kind: 'supplier',
      name: 'شركة دبي للتجهيزات الطبية والدوائية (وكيل معتمد)',
      phone: '07709990011',
      city: 'بغداد - باب المعظم',
      openingBalance: 5000000, // 5,000,000 IQD owed to supplier
      linkedUserId: null,
    },
    {
      id: 'party_bg_supp_2',
      officeId: 'office_baghdad',
      kind: 'supplier',
      name: 'مكتب الهلال للاستيراد والتوزيع المحدود',
      phone: '07703332211',
      city: 'بغداد - شارع الرشيد',
      openingBalance: 0,
      linkedUserId: null,
    },

    // Basra Customers & Suppliers
    {
      id: 'party_bs_cust_1',
      officeId: 'office_basra',
      kind: 'customer',
      name: 'مستشفى الفيحاء الأهلي',
      phone: '07806665544',
      city: 'البصرة - الطويسة',
      openingBalance: 800000,
      linkedUserId: null,
    },
    {
      id: 'party_bs_supp_1',
      officeId: 'office_basra',
      kind: 'supplier',
      name: 'مجموعة موانئ الجنوب للوازم الجراحية',
      phone: '07802223344',
      city: 'البصرة - المعقل',
      openingBalance: 2500000,
      linkedUserId: null,
    },
  ];

  const deadlineTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const validityOneMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // 8. Seed Market Requests & Offers
  const req1Matches = matchApprovedMerchantsForRequest(
    {
      productName: 'قفازات فحص أو جراحية طبية معقمة',
      quantity: 15,
      targetPrice: 12000,
      deliveryCity: 'بغداد',
    },
    offices,
    products,
    stockMovements
  );

  const req2Matches = matchApprovedMerchantsForRequest(
    {
      productName: 'كانيولا وريدية معقمة',
      quantity: 10,
      targetPrice: 24000,
      deliveryCity: 'البصرة',
    },
    offices,
    products,
    stockMovements
  );

  const purchaseRequests: PurchaseRequest[] = [
    {
      id: 'req_seed_01',
      customerUserId: 'user_cust_hospital',
      customerName: 'مستشفى الأمل الجراحي التخصصي',
      customerPhone: '07901112233',
      productName: 'قفازات فحص أو جراحية طبية معقمة',
      quantity: 15,
      targetPrice: 12000,
      deliveryCity: 'بغداد',
      deadline: deadlineTwoWeeks,
      notes: 'تجهيز عاجل لأقسام الطوارئ والعمليات مع شهادة فحص صالحة.',
      status: 'offered',
      matches: req1Matches,
      createdAt: '2026-02-10T09:00:00.000Z',
    },
    {
      id: 'req_seed_02',
      customerUserId: 'user_cust_individual',
      customerName: 'د. فراس التميمي (عيادة العظام)',
      customerPhone: '07904445566',
      productName: 'كانيولا وريدية معقمة',
      quantity: 10,
      targetPrice: 24000,
      deliveryCity: 'البصرة',
      deadline: deadlineTwoWeeks,
      notes: 'مقاس 18G أو 20G مع صمام.',
      status: 'open',
      matches: req2Matches,
      createdAt: '2026-02-12T11:30:00.000Z',
    },
  ];

  const offers: Offer[] = [
    {
      id: 'offer_seed_01',
      requestId: 'req_seed_01',
      officeId: 'office_baghdad',
      officeName: 'مكتب الرافدين للمستلزمات الطبية',
      officeCity: 'بغداد - شارع السعدون',
      productId: 'prd_bg_02',
      productName: 'قفازات فحص نايتريل زرقاء خالية من البودرة (علبة 100)',
      price: 7800,
      availableQuantity: 85,
      deliveryTime: 'خلال 24 ساعة داخل بغداد',
      validity: validityOneMonth,
      notes: 'توصيل مجاني لقسم المشتريات في المستشفى.',
      status: 'pending',
      createdByUserId: 'user_bg_owner',
      createdAt: '2026-02-10T12:00:00.000Z',
    },
  ];

  const generalOffers: GeneralOffer[] = [
    {
      id: 'gen_offer_bg_01',
      officeId: 'office_baghdad',
      officeName: 'مكتب الرافدين للمستلزمات الطبية',
      officeCity: 'بغداد - شارع السعدون',
      productId: 'prd_bg_04',
      productName: 'كمامات طبية عالية الحماية N95 معقمة',
      unit: 'قطعة',
      price: 1850,
      quantity: 120,
      validity: validityOneMonth,
      notes: 'خصم خاص للكميات فوق 50 قطعة.',
      active: true,
      createdByUserId: 'user_bg_owner',
      createdAt: '2026-02-08T10:00:00.000Z',
    },
    {
      id: 'gen_offer_bs_01',
      officeId: 'office_basra',
      officeName: 'شركة شط العرب للتجهيزات الجراحية',
      officeCity: 'البصرة - العشار',
      productId: 'prd_bs_03',
      productName: 'كانيولا وريدية جراحية 18G أخضر لغرف العمليات (علبة 50)',
      unit: 'علبة',
      price: 22500,
      quantity: 30,
      validity: validityOneMonth,
      notes: 'تجهيز فوري لمحافظات الجنوب وبغداد.',
      active: true,
      createdByUserId: 'user_bs_owner',
      createdAt: '2026-02-09T14:00:00.000Z',
    },
  ];

  const marketFavorites: MarketFavorite[] = [
    {
      id: 'fav_seed_01',
      customerUserId: 'user_cust_hospital',
      kind: 'product',
      officeId: 'office_baghdad',
      officeName: 'مكتب الرافدين للمستلزمات الطبية',
      officeCity: 'بغداد - شارع السعدون',
      productId: 'prd_bg_04',
      productName: 'كمامات طبية عالية الحماية N95 معقمة',
      unitPrice: 1850,
      unit: 'قطعة',
      createdAt: '2026-02-09T10:00:00.000Z',
    },
    {
      id: 'fav_seed_02',
      customerUserId: 'user_cust_hospital',
      kind: 'merchant',
      officeId: 'office_baghdad',
      officeName: 'مكتب الرافدين للمستلزمات الطبية',
      officeCity: 'بغداد - شارع السعدون',
      createdAt: '2026-02-09T10:05:00.000Z',
    },
  ];

  const marketChats: MarketChatMessage[] = [
    {
      id: 'chat_seed_01',
      threadType: 'request',
      threadId: 'req_seed_01',
      requestId: 'req_seed_01',
      customerUserId: 'user_cust_hospital',
      officeId: 'office_baghdad',
      senderUserId: 'user_bg_owner',
      senderName: 'د. علي الجبوري',
      senderRole: 'merchant',
      body: 'مرحباً قسم المشتريات، تتوفر لدينا القفازات النايتريل بشهادة فحص سارية والتوصيل خلال 24 ساعة.',
      createdAt: '2026-02-10T12:15:00.000Z',
    },
  ];

  const marketOrders: MarketOrder[] = [];
  const orderComplaints: OrderComplaint[] = [];

  return {
    offices,
    users,
    warehouses,
    products,
    batches,
    stockMovements,
    parties,
    invoices: [],
    payments: [],
    accounts,
    journalEntries: [],
    expenses: [],
    notifications,
    auditLogs,
    periods: [],
    purchaseRequests,
    offers,
    generalOffers,
    marketOrders,
    marketChats,
    marketFavorites,
    orderComplaints,
  };
}

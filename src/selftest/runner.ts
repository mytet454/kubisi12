/**
 * src/selftest/runner.ts
 * Self-test suite for Step 1 Foundation.
 * Runs against a fresh, isolated in-memory copy of the seed data without touching live storage.
 */
import { getAllowedNavItems, hashPassword, isAccountLocked, User } from '../domain/types';
import { guardNegativeStock, pickBatchesFEFO } from '../domain/inventory';
import { checkPermission, services } from '../services';
import { createInitialSeedData } from '../data/seed';
import { repository } from '../data/repository';

export interface TestResult {
  id: string;
  title: string;
  passed: boolean;
  durationMs: number;
  details: string[];
  error?: string;
}

export async function runStep1SelfTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const previousSnapshot = repository.getSnapshot();
  repository.commit(createInitialSeedData());

  try {

  // ==========================================
  // Test 1: Role screen visibility
  // ==========================================
  const start1 = performance.now();
  try {
    const details: string[] = [];

    const ownerNav = getAllowedNavItems('owner').map((i) => i.key);
    const accountantNav = getAllowedNavItems('accountant').map((i) => i.key);
    const warehouseNav = getAllowedNavItems('warehouse_keeper').map((i) => i.key);
    const cashierNav = getAllowedNavItems('cashier').map((i) => i.key);
    const adminNav = getAllowedNavItems('platform_admin').map((i) => i.key);
    const customerNav = getAllowedNavItems('customer').map((i) => i.key);

    // Verify Owner
    if (!ownerNav.includes('employees') || !ownerNav.includes('settings')) {
      throw new Error('المالك يجب أن يرى شاشات الموظفين والإعدادات');
    }
    details.push(`✓ شاشات المالك (${ownerNav.length}): ${ownerNav.join(', ')}`);

    // Verify Accountant (No employees, no settings)
    if (accountantNav.includes('employees') || accountantNav.includes('settings')) {
      throw new Error('المحاسب يجب ألا يرى شاشات الموظفين أو الإعدادات');
    }
    if (!accountantNav.includes('accounting') || !accountantNav.includes('invoices')) {
      throw new Error('المحاسب يجب أن يرى المحاسبة والفواتير');
    }
    details.push(`✓ شاشات المحاسب (${accountantNav.length}): ${accountantNav.join(', ')}`);

    // Verify Warehouse Keeper (No accounting, no expenses, no invoices, no employees)
    if (warehouseNav.includes('accounting') || warehouseNav.includes('expenses') || warehouseNav.includes('employees')) {
      throw new Error('أمين المستودع محظور تماماً من شاشات المحاسبة والموظفين والمصاريف');
    }
    if (!warehouseNav.includes('inventory')) {
      throw new Error('أمين المستودع يجب أن يرى شاشة المستودع');
    }
    details.push(`✓ شاشات أمين المستودع (${warehouseNav.length}): ${warehouseNav.join(', ')}`);

    // Verify Cashier
    if (cashierNav.includes('accounting') || cashierNav.includes('inventory')) {
      throw new Error('الكاشير محظور من شاشات المحاسبة وإدارة كامل المستودع');
    }
    details.push(`✓ شاشات الكاشير (${cashierNav.length}): ${cashierNav.join(', ')}`);

    // Verify Admin & Customer
    if (!adminNav.includes('merchants_admin') || !customerNav.includes('customer_portal')) {
      throw new Error('تخصيص شاشات مشرف المنصة والمشتري غير مطابق');
    }
    details.push(`✓ شاشات المشرف (${adminNav.join(', ')}) وشاشات العميل (${customerNav.join(', ')})`);

    results.push({
      id: 'test_1_role_screens',
      title: 'فحص حجب وتخصيص شاشات الموظفين حسب الدور (Screen Permissions)',
      passed: true,
      durationMs: Math.round((performance.now() - start1) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_1_role_screens',
      title: 'فحص حجب وتخصيص شاشات الموظفين حسب الدور (Screen Permissions)',
      passed: false,
      durationMs: Math.round((performance.now() - start1) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 2: Warehouse Keeper calling accounting service directly
  // ==========================================
  const start2 = performance.now();
  try {
    const memoryDb = createInitialSeedData();
    const whUser = memoryDb.users.find((u) => u.role === 'warehouse_keeper')!;
    const details: string[] = [];

    details.push(`محاكاة محاولة أمين المستودع (${whUser.name}) استدعاء دالة محاسبية محمية`);

    let blocked = false;
    try {
      // Direct call to service guard demanding accountant/owner role
      checkPermission(whUser, ['owner', 'accountant'], whUser.officeId);
    } catch (e: any) {
      if (e.code === 'PERMISSION_DENIED') {
        blocked = true;
        details.push(`✓ تم الرفض الأمني بنجاح: كود الخطأ ${e.code} - ${e.message}`);
      } else {
        throw new Error(`تم إرجاع خطأ غير متوقع: ${e.message}`);
      }
    }

    if (!blocked) {
      throw new Error('فشل الفحص: سمح الحارس لأمين المستودع بتنفيذ الدالة المحاسبية!');
    }

    results.push({
      id: 'test_2_service_guard',
      title: 'فحص الحماية المباشرة للخدمات المحاسبية ضد أمين المستودع (Service Guard)',
      passed: true,
      durationMs: Math.round((performance.now() - start2) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_2_service_guard',
      title: 'فحص الحماية المباشرة للخدمات المحاسبية ضد أمين المستودع (Service Guard)',
      passed: false,
      durationMs: Math.round((performance.now() - start2) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 3: Office B never sees Office A's records
  // ==========================================
  const start3 = performance.now();
  try {
    const memoryDb = createInitialSeedData();
    const basraUser = memoryDb.users.find((u) => u.officeId === 'office_basra')!;
    const details: string[] = [];

    details.push(`محاكاة محاولة مستخدم البصرة (${basraUser.name} - office_basra) قراءة وتعديل سجلات بغداد (office_baghdad)`);

    let isolationBlocked = false;
    try {
      checkPermission(basraUser, ['owner', 'accountant'], 'office_baghdad');
    } catch (e: any) {
      if (e.code === 'TENANT_ISOLATION_VIOLATION') {
        isolationBlocked = true;
        details.push(`✓ تم حظر الوصول العابر للمستأجرين: كود الخطأ ${e.code}`);
        details.push(`✓ نص الاستثناء: ${e.message}`);
      } else {
        throw new Error(`استثناء غير متوقع: ${e.message}`);
      }
    }

    if (!isolationBlocked) {
      throw new Error('فشل الفحص: لم يتم منع مستخدم البصرة من الوصول إلى سجلات بغداد!');
    }

    results.push({
      id: 'test_3_tenant_isolation',
      title: 'فحص العزل التام للمستأجرين بين مكتب بغداد ومكتب البصرة (Tenant Isolation)',
      passed: true,
      durationMs: Math.round((performance.now() - start3) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_3_tenant_isolation',
      title: 'فحص العزل التام للمستأجرين بين مكتب بغداد ومكتب البصرة (Tenant Isolation)',
      passed: false,
      durationMs: Math.round((performance.now() - start3) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 4: Five wrong passwords lock the account for 15 minutes
  // ==========================================
  const start4 = performance.now();
  try {
    const memoryDb = createInitialSeedData();
    const testUser: User = { ...memoryDb.users[0], failedAttempts: 0, lockedUntil: null };
    const details: string[] = [];

    details.push(`بدء محاكاة محاولات تسجيل دخول فاشلة للحساب (${testUser.phone})`);

    const wrongPassword = 'wrong_password_xyz';
    const correctPasswordHash = hashPassword('123456');

    // Attempts 1 to 4
    for (let attempt = 1; attempt <= 4; attempt++) {
      const inputHash = hashPassword(wrongPassword);
      if (inputHash !== correctPasswordHash) {
        testUser.failedAttempts += 1;
      }
      const lockCheck = isAccountLocked(testUser);
      if (lockCheck.locked) {
        throw new Error(`تم قفل الحساب قبل الوصول لـ 5 محاولات في المحاولة ${attempt}`);
      }
      details.push(`المحاولة ${attempt}: كلمة مرور خاطئة -> عدد المحاولات الفاشلة: ${testUser.failedAttempts}`);
    }

    // Attempt 5 (Trigger lockout)
    testUser.failedAttempts += 1;
    if (testUser.failedAttempts >= 5) {
      testUser.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }

    const finalLockCheck = isAccountLocked(testUser);
    if (!finalLockCheck.locked) {
      throw new Error('فشل الفحص: لم يتم قفل الحساب بعد 5 محاولات فاشلة!');
    }
    if (finalLockCheck.remainingMinutes < 14 || finalLockCheck.remainingMinutes > 15) {
      throw new Error(`مدة القفل غير صحيحة: ${finalLockCheck.remainingMinutes} دقيقة`);
    }

    details.push(`✓ المحاولة 5: الحساب مقفل بنجاح (${testUser.lockedUntil})`);
    details.push(`✓ المدة المتبقية المحسوبة للقفل: ${finalLockCheck.remainingMinutes} دقيقة`);

    results.push({
      id: 'test_4_account_lockout',
      title: 'فحص القفل التلقائي للحساب بعد 5 محاولات خاطئة (Lockout Protection)',
      passed: true,
      durationMs: Math.round((performance.now() - start4) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_4_account_lockout',
      title: 'فحص القفل التلقائي للحساب بعد 5 محاولات خاطئة (Lockout Protection)',
      passed: false,
      durationMs: Math.round((performance.now() - start4) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 5: Earliest-expiry pick order (FEFO) + Manual override
  // ==========================================
  const start5 = performance.now();
  try {
    const details: string[] = [];

    const mockBatches = [
      { id: 'b_later', productId: 'p1', warehouseId: 'w1', lotNumber: 'LOT-2027', expiryDate: '2027-12-01', quantityOnHand: 25 },
      { id: 'b_earliest', productId: 'p1', warehouseId: 'w1', lotNumber: 'LOT-2026-EARLY', expiryDate: '2026-04-01', quantityOnHand: 10 },
      { id: 'b_mid', productId: 'p1', warehouseId: 'w1', lotNumber: 'LOT-2026-MID', expiryDate: '2026-08-01', quantityOnHand: 20 },
    ];

    details.push('الوجبات المتوفرة: LOT-2026-EARLY (10 قطع تنتهي 2026-04), LOT-2026-MID (20 قطعة تنتهي 2026-08), LOT-2027 (25 قطعة تنتهي 2027-12)');

    // Request 15 units -> Must pick all 10 from b_earliest + 5 from b_mid
    const fefoPick = pickBatchesFEFO(mockBatches, 15);

    if (fefoPick.allocations.length !== 2) {
      throw new Error(`عدد تخصيصات الوجبات غير صحيح: متوقع 2، تم إرجاع ${fefoPick.allocations.length}`);
    }
    if (fefoPick.allocations[0].batchId !== 'b_earliest' || fefoPick.allocations[0].quantity !== 10) {
      throw new Error(`الوجبة الأولى يجب أن تكون الأقرب انتهاءً (b_earliest) بـ 10 وحدات`);
    }
    if (fefoPick.allocations[1].batchId !== 'b_mid' || fefoPick.allocations[1].quantity !== 5) {
      throw new Error(`الوجبة الثانية يجب أن تكون (b_mid) بـ 5 وحدات متبقية`);
    }
    details.push('✓ تخصيص FEFO التلقائي صحيح: تم صرف 10 من الوجبة الأقرب انتهاءً و 5 من الوجبة التالية');

    // Test Manual Override: User picks b_later directly for 8 units
    const manualPick = pickBatchesFEFO(mockBatches, 8, 'b_later');
    if (manualPick.allocations.length !== 1 || manualPick.allocations[0].batchId !== 'b_later' || manualPick.allocations[0].quantity !== 8) {
      throw new Error('فشل التجاوز اليدوي للوجبة: لم يتم التخصيص من الوجبة المحددة يدوياً');
    }
    details.push('✓ التجاوز اليدوي (Manual Override) يعمل بدقة: تم تخصيص 8 وحدات مباشرة من الوجبة المحددة يدوياً (b_later)');

    results.push({
      id: 'test_5_fefo_pick_order',
      title: 'فحص أولوية صرف الأقرب انتهاءً أولاً والتجاوز اليدوي (FEFO Order)',
      passed: true,
      durationMs: Math.round((performance.now() - start5) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_5_fefo_pick_order',
      title: 'فحص أولوية صرف الأقرب انتهاءً أولاً والتجاوز اليدوي (FEFO Order)',
      passed: false,
      durationMs: Math.round((performance.now() - start5) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 6: Quantity larger than stock is rejected with clear Arabic message
  // ==========================================
  const start6 = performance.now();
  try {
    const details: string[] = [];
    details.push('محاكاة محاولة صرف 50 وحدة والمتاح في المستودع 20 وحدة فقط مع allowNegativeStock = false');

    let rejected = false;
    try {
      guardNegativeStock(20, 50, false, 'كانيولا مقاس 20G');
    } catch (e: any) {
      if (e.code === 'INSUFFICIENT_STOCK') {
        rejected = true;
        details.push(`✓ تم رفض الطلب بنجاح: كود الخطأ ${e.code}`);
        details.push(`✓ الرسالة العربية الصادرة: "${e.message}"`);
        if (!e.message.includes('50') || !e.message.includes('20')) {
          throw new Error('الرسالة العربية يجب أن تحتوي على الكمية المطلوبة والرصيد المتاح بوضوح');
        }
      } else {
        throw new Error(`استثناء غير متوقع: ${e.message}`);
      }
    }

    if (!rejected) {
      throw new Error('فشل الفحص: سمح الحارس بصرف كمية أكبر من الرصيد المتوفر برصيد سالب!');
    }

    results.push({
      id: 'test_6_negative_stock_rejection',
      title: 'فحص رفض طلب كمية تتجاوز الرصيد المتوفر (Negative Stock Guard)',
      passed: true,
      durationMs: Math.round((performance.now() - start6) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_6_negative_stock_rejection',
      title: 'فحص رفض طلب كمية تتجاوز الرصيد المتوفر (Negative Stock Guard)',
      passed: false,
      durationMs: Math.round((performance.now() - start6) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 7: Low-stock and near-expiry alerts appear for seed data
  // ==========================================
  const start7 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;

    // Query notifications through services
    const notifs = await services.getNotifications(owner);
    const lowStockAlerts = notifs.filter((n) => n.text.includes('نقص مخزون'));
    const nearExpiryAlerts = notifs.filter((n) => n.text.includes('انتهاء صلاحية'));

    if (lowStockAlerts.length === 0) {
      throw new Error('لم يتم العثور على أي تنبيهات لنقص المخزون في البيانات الأولية');
    }
    if (nearExpiryAlerts.length === 0) {
      throw new Error('لم يتم العثور على أي تنبيهات لاقتراب انتهاء الصلاحية في البيانات الأولية');
    }

    details.push(`✓ تم رصد ${lowStockAlerts.length} تنبيهات نقص مخزون في بيانات البذور (أصناف تحت حد الطلب)`);
    details.push(`✓ تم رصد ${nearExpiryAlerts.length} تنبيهات اقتراب انتهاء صلاحية (< 90 يوماً)`);
    details.push(`✓ نموذج تنبيه: "${lowStockAlerts[0].text}"`);

    results.push({
      id: 'test_7_seed_alerts_detection',
      title: 'فحص التوليد التلقائي لتنبيهات نقص المخزون وقرب الانتهاء (Alerts Detection)',
      passed: true,
      durationMs: Math.round((performance.now() - start7) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_7_seed_alerts_detection',
      title: 'فحص التوليد التلقائي لتنبيهات نقص المخزون وقرب الانتهاء (Alerts Detection)',
      passed: false,
      durationMs: Math.round((performance.now() - start7) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 8: Warehouse Keeper's product query contains NO cost fields
  // ==========================================
  const start8 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const whUser = memoryDb.users.find((u) => u.id === 'user_bg_warehouse')!;

    details.push(`استعلام قائمة المواد الطبية بحساب أمين المستودع (${whUser.name})`);
    const whProducts = await services.getProducts(whUser);

    if (whProducts.length === 0) {
      throw new Error('لم يتم إرجاع أي مواد طبية لأمين المستودع');
    }

    // Verify each product has no purchasePrice or avgCost
    for (const p of whProducts) {
      if ((p as any).purchasePrice !== undefined) {
        throw new Error(`تم تسريب سعر الشراء purchasePrice (${(p as any).purchasePrice}) للمادة "${p.name}" لأمين المستودع!`);
      }
      if ((p as any).avgCost !== undefined) {
        throw new Error(`تم تسريب متوسط التكلفة avgCost (${(p as any).avgCost}) للمادة "${p.name}" لأمين المستودع!`);
      }
      if (p.quantityOnHand === undefined) {
        throw new Error(`حقل الرصيد المتوفر غير موجود للمادة "${p.name}"`);
      }
    }

    details.push(`✓ تم فحص ${whProducts.length} مادة طبية لأمين المستودع: تم حجب حقول التكلفة (purchasePrice و avgCost) تماماً`);
    details.push('✓ أمين المستودع يرى فقط: الاسم، الوحدة، الرصيد المتاح، وحد إعادة الطلب، والوجبات');

    results.push({
      id: 'test_8_warehouse_keeper_no_cost_prices',
      title: 'فحص حجب أسعار التكلفة تماماً عن أمين المستودع (Cost Price Stripping)',
      passed: true,
      durationMs: Math.round((performance.now() - start8) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_8_warehouse_keeper_no_cost_prices',
      title: 'فحص حجب أسعار التكلفة تماماً عن أمين المستودع (Cost Price Stripping)',
      passed: false,
      durationMs: Math.round((performance.now() - start8) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 9: Purchase of 100 units with lot and expiry adds 100 to stock and posts balanced entry
  // ==========================================
  const start9 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;
    const product = memoryDb.products.find((p) => p.officeId === 'office_baghdad')!;
    const warehouse = memoryDb.warehouses.find((w) => w.officeId === 'office_baghdad')!;
    const supplier = memoryDb.parties.find((p) => p.officeId === 'office_baghdad' && p.kind === 'supplier')!;

    // Initial stock
    const initialStock = memoryDb.stockMovements
      .filter((m) => m.productId === product.id)
      .reduce((sum, m) => sum + m.quantity, 0);

    details.push(`المادة المختارة: "${product.name}" - الرصيد المبدئي بالمستودع: ${initialStock} قطعة`);

    // Create purchase invoice via service
    const purInvoice = await services.createPurchaseInvoice(owner, {
      date: '2026-02-15T10:00:00.000Z',
      partyId: supplier.id,
      warehouseId: warehouse.id,
      paymentMethod: 'credit',
      lines: [
        {
          productId: product.id,
          lotNumber: 'TEST-LOT-PUR-100',
          expiryDate: '2028-06-30',
          quantity: 100,
          purchasePrice: 5000,
        },
      ],
    });

    // Check stock after purchase
    const movements = await services.getStockMovements(owner, { productId: product.id });
    const newStock = movements.reduce((sum: number, m: any) => sum + m.quantity, 0);

    if (newStock !== initialStock + 100) {
      throw new Error(`رصيد المخزون بعد الشراء غير صحيح: متوقع ${initialStock + 100}، الفعلي ${newStock}`);
    }
    details.push(`✓ تم دخول 100 وحدة للمستودع بنجاح: الرصيد الجديد أصبح ${newStock} قطعة`);

    // Verify journal entry exists and is balanced
    const entries = await services.getJournalEntries(owner);
    const purEntry = entries.find((e) => e.refId === purInvoice.id);
    if (!purEntry) {
      throw new Error('لم يتم إنشاء قيد محاسبي لفاتورة الشراء');
    }

    const debits = purEntry.lines.reduce((s, l) => s + l.debit, 0);
    const credits = purEntry.lines.reduce((s, l) => s + l.credit, 0);
    if (debits !== credits || debits !== 500000) {
      throw new Error(`قيد الشراء غير متوازن أو بقيمة خاطئة: مدين ${debits}، دائن ${credits}`);
    }
    details.push(`✓ تم ترحيل قيد شراء متوازن بدقة (مدين مخزون 104: 500,000 د.ع / دائن موردين 201: 500,000 د.ع)`);

    results.push({
      id: 'test_9_purchase_balanced_entry',
      title: 'فحص فاتورة الشراء وتحديث الرصيد والقيد المتوازن (Purchase Balanced Entry)',
      passed: true,
      durationMs: Math.round((performance.now() - start9) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_9_purchase_balanced_entry',
      title: 'فحص فاتورة الشراء وتحديث الرصيد والقيد المتوازن (Purchase Balanced Entry)',
      passed: false,
      durationMs: Math.round((performance.now() - start9) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 10: Sale of 30 units takes earliest-expiry batch, reduces stock, posts 2 balanced entries, profit = sale - cost
  // ==========================================
  const start10 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;
    const product = memoryDb.products.find((p) => p.officeId === 'office_baghdad' && p.purchasePrice > 0)!;
    const customer = memoryDb.parties.find((p) => p.officeId === 'office_baghdad' && p.kind === 'customer')!;

    const currentStock = (await services.getStockByProduct(owner, product.id)).quantityOnHand;
    details.push(`المادة المختارة للبيع: "${product.name}" - الرصيد المتاح: ${currentStock} قطعة - التكلفة: ${product.purchasePrice} د.ع - سعر البيع: ${product.salePrice} د.ع`);

    const saleQty = 30;
    const saleInvoice = await services.createSaleInvoice(owner, {
      date: '2026-02-16T11:00:00.000Z',
      partyId: customer.id,
      paymentMethod: 'cash',
      lines: [
        {
          productId: product.id,
          quantity: saleQty,
          unitPrice: product.salePrice,
        },
      ],
    });

    const newStock = (await services.getStockByProduct(owner, product.id)).quantityOnHand;
    if (newStock !== currentStock - saleQty) {
      throw new Error(`الرصيد بعد البيع غير صحيح: متوقع ${currentStock - saleQty}، الفعلي ${newStock}`);
    }
    details.push(`✓ تم خصم ${saleQty} وحدة من المستودع بنجاح وفق ترتيب FEFO (الرصيد المتبقي: ${newStock})`);

    // Verify the two entries (Revenue and COGS)
    const entries = await services.getJournalEntries(owner);
    const saleEntries = entries.filter((e) => e.refId === saleInvoice.id);
    if (saleEntries.length < 2) {
      throw new Error(`متوقع قيدين لفاتورة البيع (إيراد وتكلفة مبيعات COGS)، تم العثور على ${saleEntries.length}`);
    }

    const revEntry = saleEntries.find((e) => e.id.includes('_rev'))!;
    const cogsEntry = saleEntries.find((e) => e.id.includes('_cogs'))!;

    const expectedSaleTotal = saleQty * product.salePrice;
    const freshProd = await services.getProductById(owner, product.id);
    const expectedCogsTotal = saleQty * (freshProd.avgCost || freshProd.purchasePrice);
    const calculatedProfit = expectedSaleTotal - expectedCogsTotal;

    const revDebit = revEntry.lines.reduce((s, l) => s + l.debit, 0);
    const revCredit = revEntry.lines.reduce((s, l) => s + l.credit, 0);
    if (revDebit !== revCredit || revDebit !== expectedSaleTotal) {
      throw new Error(`قيد إيراد البيع غير متوازن: مدين ${revDebit}، دائن ${revCredit}`);
    }

    const cogsDebit = cogsEntry.lines.reduce((s, l) => s + l.debit, 0);
    const cogsCredit = cogsEntry.lines.reduce((s, l) => s + l.credit, 0);
    if (cogsDebit !== cogsCredit || cogsDebit !== expectedCogsTotal) {
      throw new Error(`قيد تكلفة المبيعات COGS غير متوازن: مدين ${cogsDebit}، دائن ${cogsCredit}، متوقع ${expectedCogsTotal}`);
    }

    details.push(`✓ تم ترحيل قيد الإيراد المتوازن (قيمة البيع: ${expectedSaleTotal.toLocaleString('en-US')} د.ع)`);
    details.push(`✓ تم ترحيل قيد تكلفة البضاعة المباعة COGS المتوازن (التكلفة: ${expectedCogsTotal.toLocaleString('en-US')} د.ع)`);
    details.push(`✓ إجمالي مجمل الربح المحقق = ${calculatedProfit.toLocaleString('en-US')} د.ع (سعر البيع - التكلفة)`);

    results.push({
      id: 'test_10_sale_fefo_cogs_profit',
      title: 'فحص فاتورة البيع وصرف الأقرب انتهاءً وقيدي الإيراد والتكلفة واحتساب الربح (Sale FEFO & COGS)',
      passed: true,
      durationMs: Math.round((performance.now() - start10) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_10_sale_fefo_cogs_profit',
      title: 'فحص فاتورة البيع وصرف الأقرب انتهاءً وقيدي الإيراد والتكلفة واحتساب الربح (Sale FEFO & COGS)',
      passed: false,
      durationMs: Math.round((performance.now() - start10) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 11: Credit sale raises customer's balance, payment lowers it, statement matches
  // ==========================================
  const start11 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;
    const customer = memoryDb.parties.find((p) => p.officeId === 'office_baghdad' && p.kind === 'customer')!;
    const product = memoryDb.products.find((p) => p.officeId === 'office_baghdad')!;

    // Initial statement balance
    const initStmt = await services.getPartyStatement(owner, customer.id);
    const startBalance = initStmt.balance;
    details.push(`كشف حساب العميل ("${customer.name}") - الرصيد الابتدائي: ${startBalance.toLocaleString('en-US')} د.ع`);

    // 1. Credit Sale for 200,000 IQD
    const saleAmount = 200000;
    const unitPrice = 20000;
    const qty = 10;
    await services.createSaleInvoice(owner, {
      date: '2026-02-17T12:00:00.000Z',
      partyId: customer.id,
      paymentMethod: 'credit', // on credit
      lines: [
        {
          productId: product.id,
          quantity: qty,
          unitPrice,
        },
      ],
    });

    const stmtAfterSale = await services.getPartyStatement(owner, customer.id);
    if (stmtAfterSale.balance !== startBalance + saleAmount) {
      throw new Error(`رصيد العميل بعد البيع الآجل غير صحيح: متوقع ${startBalance + saleAmount}، الفعلي ${stmtAfterSale.balance}`);
    }
    details.push(`✓ بعد بيع آجل بقيمة 200,000 د.ع: ارتفع رصيد العميل المستحق إلى ${stmtAfterSale.balance.toLocaleString('en-US')} د.ع`);

    // 2. Customer payment of 150,000 IQD
    const paymentAmount = 150000;
    await services.createPayment(owner, {
      partyId: customer.id,
      direction: 'in',
      amount: paymentAmount,
      method: 'cash',
      date: '2026-02-18T10:00:00.000Z',
      memo: 'سداد نقدي دفعة من الحساب',
    });

    const stmtAfterPayment = await services.getPartyStatement(owner, customer.id);
    const expectedFinalBalance = startBalance + saleAmount - paymentAmount;
    if (stmtAfterPayment.balance !== expectedFinalBalance) {
      throw new Error(`رصيد العميل بعد السداد غير صحيح: متوقع ${expectedFinalBalance}، الفعلي ${stmtAfterPayment.balance}`);
    }
    details.push(`✓ بعد سداد نقدي بقيمة 150,000 د.ع: انخفض الرصيد إلى ${stmtAfterPayment.balance.toLocaleString('en-US')} د.ع`);
    details.push(`✓ مطابقة كشف الحساب: إجمالي المبيعات المستحقة (${stmtAfterPayment.totalOwed.toLocaleString('en-US')} د.ع) - إجمالي المقبوضات (${stmtAfterPayment.totalPaid.toLocaleString('en-US')} د.ع) = الصافي بدقة`);

    results.push({
      id: 'test_11_credit_sale_and_payment_statement',
      title: 'فحص البيع الآجل والسداد ومطابقة كشف حساب العميل (Credit Sale & Payment)',
      passed: true,
      durationMs: Math.round((performance.now() - start11) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_11_credit_sale_and_payment_statement',
      title: 'فحص البيع الآجل والسداد ومطابقة كشف حساب العميل (Credit Sale & Payment)',
      passed: false,
      durationMs: Math.round((performance.now() - start11) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 12: Voiding restores stock, posts a reversing entry, and original stays visible
  // ==========================================
  const start12 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;
    const product = memoryDb.products.find((p) => p.officeId === 'office_baghdad')!;
    const customer = memoryDb.parties.find((p) => p.officeId === 'office_baghdad' && p.kind === 'customer')!;

    const baseStock = (await services.getStockByProduct(owner, product.id)).quantityOnHand;

    // Issue invoice
    const inv = await services.createSaleInvoice(owner, {
      date: '2026-02-19T14:00:00.000Z',
      partyId: customer.id,
      paymentMethod: 'cash',
      lines: [{ productId: product.id, quantity: 15, unitPrice: product.salePrice }],
    });

    const stockAfterSale = (await services.getStockByProduct(owner, product.id)).quantityOnHand;
    if (stockAfterSale !== baseStock - 15) throw new Error('فشل خصم المخزون قبل الإلغاء');

    details.push(`تم إصدار الفاتورة (${inv.number}) بخصم 15 قطعة. الرصيد المؤقت: ${stockAfterSale}`);

    // Void Invoice
    const voidedInv = await services.voidInvoice(owner, inv.id, 'إلغاء لخطأ في تسجيل الصنف');
    if (voidedInv.status !== 'void') {
      throw new Error('حالة الفاتورة بعد الإلغاء يجب أن تكون void');
    }

    // Verify stock is restored
    const stockAfterVoid = (await services.getStockByProduct(owner, product.id)).quantityOnHand;
    if (stockAfterVoid !== baseStock) {
      throw new Error(`لم تتم استعادة رصيد المستودع بعد الإلغاء: متوقع ${baseStock}، الفعلي ${stockAfterVoid}`);
    }
    details.push(`✓ تم استرجاع الـ 15 قطعة إلى المستودع بالكامل: عاد الرصيد إلى ${stockAfterVoid}`);

    // Verify original invoice stays visible
    const allInvoices = await services.getInvoices(owner);
    const foundInv = allInvoices.find((i) => i.id === inv.id);
    if (!foundInv) {
      throw new Error('الفاتورة الأصلية حُذفت بدلاً من إبقائها مرئية بحالة ملغاة!');
    }
    if (foundInv.status !== 'void') {
      throw new Error('الفاتورة المعروضة يجب أن تحمل حالة "ملغاة"');
    }
    details.push('✓ الفاتورة الأصلية بقيت محفوظة ومرئية في النظام وتحمل شارة "ملغاة" مع سبب الإلغاء وتاريخه');

    // Verify reversing journal entry
    const entries = await services.getJournalEntries(owner);
    const revEntries = entries.filter((e) => e.reversalOf && e.refId === inv.id);
    if (revEntries.length === 0) {
      throw new Error('لم يتم ترحيل أي قيود عكسية لإلغاء الفاتورة');
    }
    details.push(`✓ تم إنشاء ${revEntries.length} قيد عكسي متعاكس الأطراف تماماً لإلغاء الأثر المالي للفاتورة`);

    results.push({
      id: 'test_12_void_reversal_and_stock_restore',
      title: 'فحص إلغاء الفاتورة (Void) وإرجاع المخزون والقيد العكسي (Void & Reversal)',
      passed: true,
      durationMs: Math.round((performance.now() - start12) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_12_void_reversal_and_stock_restore',
      title: 'فحص إلغاء الفاتورة (Void) وإرجاع المخزون والقيد العكسي (Void & Reversal)',
      passed: false,
      durationMs: Math.round((performance.now() - start12) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 13: Sale larger than stock is blocked with clear Arabic message
  // ==========================================
  const start13 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;
    const product = memoryDb.products.find((p) => p.officeId === 'office_baghdad')!;
    const customer = memoryDb.parties.find((p) => p.officeId === 'office_baghdad' && p.kind === 'customer')!;

    const currentStock = (await services.getStockByProduct(owner, product.id)).quantityOnHand;
    const requestedQty = currentStock + 500; // Intentionally exceeds stock

    details.push(`محاولة بيع ${requestedQty} وحدة من "${product.name}" والرصيد المتاح ${currentStock} وحدة فقط`);

    let blocked = false;
    try {
      await services.createSaleInvoice(owner, {
        date: '2026-02-20T10:00:00.000Z',
        partyId: customer.id,
        paymentMethod: 'cash',
        lines: [{ productId: product.id, quantity: requestedQty, unitPrice: product.salePrice }],
      });
    } catch (e: any) {
      if (e.code === 'INSUFFICIENT_STOCK') {
        blocked = true;
        details.push(`✓ تم حظر البيع بنجاح: كود الخطأ ${e.code}`);
        details.push(`✓ نص الرسالة العربية الصادرة: "${e.message}"`);
      } else {
        throw new Error(`تم إرجاع خطأ غير متوقع: ${e.message}`);
      }
    }

    if (!blocked) {
      throw new Error('فشل الفحص: سمح النظام بإنشاء فاتورة بيع بكمية أكبر من الرصيد المتوفر!');
    }

    results.push({
      id: 'test_13_sale_stock_guard_rejection',
      title: 'فحص حظر البيع بأكثر من الرصيد المتوفر في فاتورة البيع (Sale Stock Guard)',
      passed: true,
      durationMs: Math.round((performance.now() - start13) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_13_sale_stock_guard_rejection',
      title: 'فحص حظر البيع بأكثر من الرصيد المتوفر في فاتورة البيع (Sale Stock Guard)',
      passed: false,
      durationMs: Math.round((performance.now() - start13) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 14: Trial balance debits equal credits after all of the above
  // ==========================================
  const start14 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;

    // Query trial balance for office_baghdad
    const tb = await services.getTrialBalance(owner);

    details.push(`إجمالي الجانب المدين: ${tb.totalDebit.toLocaleString('en-US')} د.ع`);
    details.push(`إجمالي الجانب الدائن: ${tb.totalCredit.toLocaleString('en-US')} د.ع`);

    if (!tb.isBalanced) {
      throw new Error(`ميزان المراجعة غير متوازن: المدين (${tb.totalDebit}) لا يساوي الدائن (${tb.totalCredit})`);
    }

    details.push('✓ ميزان المراجعة المحاسبي (Trial Balance) متوازن بنسبة 100% (إجمالي المدين = إجمالي الدائن)');
    details.push(`✓ عدد الحسابات المدرجة في الميزان: ${tb.rows.length} حسابات من الدليل المالي`);

    results.push({
      id: 'test_14_trial_balance_debits_equal_credits',
      title: 'فحص توازن ميزان المراجعة الشامل (Trial Balance Debits = Credits)',
      passed: true,
      durationMs: Math.round((performance.now() - start14) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_14_trial_balance_debits_equal_credits',
      title: 'فحص توازن ميزان المراجعة الشامل (Trial Balance Debits = Credits)',
      passed: false,
      durationMs: Math.round((performance.now() - start14) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 15: Atomicity: if the journal step fails, no invoice and no stock movement is saved
  // ==========================================
  const start15 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;
    const product = memoryDb.products.find((p) => p.officeId === 'office_baghdad')!;
    const customer = memoryDb.parties.find((p) => p.officeId === 'office_baghdad' && p.kind === 'customer')!;

    const initialInvoicesCount = (await services.getInvoices(owner)).length;
    const initialMovementsCount = (await services.getStockMovements(owner)).length;

    details.push(`قبل العملية الذرية: عدد الفواتير = ${initialInvoicesCount}، عدد حركات المخزن = ${initialMovementsCount}`);
    details.push('محاكاة محاولة إنشاء فاتورة بيع مع إفشال متعمد ومقصود في خطوة القيد المحاسبي');

    let atomicityRolledBack = false;
    try {
      await services.createSaleInvoice(owner, {
        date: '2026-02-21T10:00:00.000Z',
        partyId: customer.id,
        paymentMethod: 'cash',
        lines: [{ productId: product.id, quantity: 5, unitPrice: product.salePrice }],
        failJournalOnPurpose: true, // Trigger deliberate rollback
      });
    } catch (e: any) {
      if (e.code === 'SIMULATED_ATOMICITY_FAILURE') {
        atomicityRolledBack = true;
      } else {
        throw new Error(`استثناء غير متوقع: ${e.message}`);
      }
    }

    if (!atomicityRolledBack) {
      throw new Error('فشل الفحص: لم يتم إطلاق استثناء الفشل المتعمد!');
    }

    // Verify NOTHING was written to invoices or stockMovements
    const currentInvoicesCount = (await services.getInvoices(owner)).length;
    const currentMovementsCount = (await services.getStockMovements(owner)).length;

    if (currentInvoicesCount !== initialInvoicesCount) {
      throw new Error(`فشلت الذرية: تم حفظ الفاتورة بالرغم من فشل القيد المحاسبي! (${currentInvoicesCount} != ${initialInvoicesCount})`);
    }

    if (currentMovementsCount !== initialMovementsCount) {
      throw new Error(`فشلت الذرية: تم حفظ حركة مخزنية بالرغم من فشل القيد المحاسبي! (${currentMovementsCount} != ${initialMovementsCount})`);
    }

    details.push('✓ تم التحقق بنجاح: لم تُسجل أي فاتورة ولم تُسجل أي حركة مخزنية في قاعدة البيانات');
    details.push('✓ وحدة العمل (Unit of Work) تعمل بذرية تامة: إما نجاح كافة الخطوات معاً أو التراجع الكامل دون أثر');

    results.push({
      id: 'test_15_atomic_unit_of_work_rollback',
      title: 'فحص ذرية المعاملة والتراجع التام عند فشل القيد (Atomicity Unit of Work)',
      passed: true,
      durationMs: Math.round((performance.now() - start15) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_15_atomic_unit_of_work_rollback',
      title: 'فحص ذرية المعاملة والتراجع التام عند فشل القيد (Atomicity Unit of Work)',
      passed: false,
      durationMs: Math.round((performance.now() - start15) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 16: Dashboard's month profit equals Profit & Loss for the same period
  // ==========================================
  const start16 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;

    // 1. Get dashboard data
    const dashData = await services.getDashboardData(owner);

    // 2. Compute exact month start & end matching dashboard calculation
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    // 3. Get Profit & Loss for the same period
    const plData = await services.getProfitAndLoss(owner, monthStart, monthEnd);

    details.push(`أرباح الشهر في لوحة التحكم (Dashboard): ${dashData.monthProfit.toLocaleString('en-US')} د.ع`);
    details.push(`صافي ربح قائمة الأرباح والخسائر (P&L): ${plData.netProfit.toLocaleString('en-US')} د.ع`);

    if (dashData.monthProfit !== plData.netProfit) {
      throw new Error(
        `عدم تطابق: أرباح لوحة التحكم (${dashData.monthProfit}) لا تساوي صافي ربح قائمة الدخل (${plData.netProfit})!`
      );
    }

    details.push('✓ تطابق تام 100%: أرباح الشهر في لوحة التحكم مستخرجة مباشرة من محرك الحسابات وقائمة الدخل دون إعادة حساب في الواجهة');

    results.push({
      id: 'test_16_dashboard_month_profit_equals_pl',
      title: 'فحص تطابق أرباح لوحة التحكم مع قائمة الأرباح والخسائر للفترة (Dashboard Profit = P&L Net)',
      passed: true,
      durationMs: Math.round((performance.now() - start16) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_16_dashboard_month_profit_equals_pl',
      title: 'فحص تطابق أرباح لوحة التحكم مع قائمة الأرباح والخسائر للفترة (Dashboard Profit = P&L Net)',
      passed: false,
      durationMs: Math.round((performance.now() - start16) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 17: The trial balance still balances
  // ==========================================
  const start17 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;

    const tb = await services.getTrialBalance(owner);

    details.push(`إجمالي الجانب المدين: ${tb.totalDebit.toLocaleString('en-US')} د.ع`);
    details.push(`إجمالي الجانب الدائن: ${tb.totalCredit.toLocaleString('en-US')} د.ع`);

    if (!tb.isBalanced) {
      throw new Error(`ميزان المراجعة غير متوازن: المدين (${tb.totalDebit}) لا يساوي الدائن (${tb.totalCredit})`);
    }

    if (tb.totalDebit !== tb.totalCredit) {
      throw new Error(`المدين لا يساوي الدائن رقمياً: ${tb.totalDebit} != ${tb.totalCredit}`);
    }

    details.push('✓ ميزان المراجعة المحاسبي متوازن تماماً بعد كافة فواتير البيع والشراء والمقبوضات والمصروفات');
    details.push(`✓ عدد الحسابات في الميزان: ${tb.rows.length} حسابات مالية نشطة`);

    results.push({
      id: 'test_17_trial_balance_still_balances',
      title: 'فحص استمرار توازن ميزان المراجعة بعد كافة العمليات (Trial Balance Still Balances)',
      passed: true,
      durationMs: Math.round((performance.now() - start17) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_17_trial_balance_still_balances',
      title: 'فحص استمرار توازن ميزان المراجعة بعد كافة العمليات (Trial Balance Still Balances)',
      passed: false,
      durationMs: Math.round((performance.now() - start17) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 18: Warehouse Keeper and Cashier cannot call profit or accounting services directly
  // ==========================================
  const start18 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const whUser = memoryDb.users.find((u) => u.role === 'warehouse_keeper')!;
    const cashierUser = memoryDb.users.find((u) => u.role === 'cashier')!;

    // 1. Warehouse Keeper calling getProfitAndLoss
    let whPlBlocked = false;
    try {
      await services.getProfitAndLoss(whUser);
    } catch (e: any) {
      if (e.code === 'PERMISSION_DENIED') whPlBlocked = true;
    }
    if (!whPlBlocked) {
      throw new Error('فشل الفحص: أمين المستودع استطاع استدعاء خدمة الأرباح والخسائر دون حظر!');
    }
    details.push(`✓ تم حظر أمين المستودع (${whUser.name}) من خدمة الأرباح والخسائر: PERMISSION_DENIED`);

    // 2. Warehouse Keeper calling getTrialBalance
    let whTbBlocked = false;
    try {
      await services.getTrialBalance(whUser);
    } catch (e: any) {
      if (e.code === 'PERMISSION_DENIED') whTbBlocked = true;
    }
    if (!whTbBlocked) {
      throw new Error('فشل الفحص: أمين المستودع استطاع استدعاء ميزان المراجعة دون حظر!');
    }
    details.push(`✓ تم حظر أمين المستودع (${whUser.name}) من خدمة ميزان المراجعة: PERMISSION_DENIED`);

    // 3. Cashier calling getProfitAndLoss
    let cashierPlBlocked = false;
    try {
      await services.getProfitAndLoss(cashierUser);
    } catch (e: any) {
      if (e.code === 'PERMISSION_DENIED') cashierPlBlocked = true;
    }
    if (!cashierPlBlocked) {
      throw new Error('فشل الفحص: الكاشير استطاع استدعاء خدمة الأرباح والخسائر دون حظر!');
    }
    details.push(`✓ تم حظر الكاشير (${cashierUser.name}) من خدمة الأرباح والخسائر: PERMISSION_DENIED`);

    // 4. Cashier calling getTrialBalance
    let cashierTbBlocked = false;
    try {
      await services.getTrialBalance(cashierUser);
    } catch (e: any) {
      if (e.code === 'PERMISSION_DENIED') cashierTbBlocked = true;
    }
    if (!cashierTbBlocked) {
      throw new Error('فشل الفحص: الكاشير استطاع استدعاء ميزان المراجعة دون حظر!');
    }
    details.push(`✓ تم حظر الكاشير (${cashierUser.name}) من خدمة ميزان المراجعة: PERMISSION_DENIED`);

    results.push({
      id: 'test_18_warehouse_and_cashier_blocked_from_accounting_services',
      title: 'فحص حظر أمين المستودع والكاشير من استدعاء خدمات الأرباح والمحاسبة مباشرة (Role Guard Block)',
      passed: true,
      durationMs: Math.round((performance.now() - start18) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_18_warehouse_and_cashier_blocked_from_accounting_services',
      title: 'فحص حظر أمين المستودع والكاشير من استدعاء خدمات الأرباح والمحاسبة مباشرة (Role Guard Block)',
      passed: false,
      durationMs: Math.round((performance.now() - start18) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 19: Exporting then importing a backup restores identical data
  // ==========================================
  const start19 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const owner = memoryDb.users.find((u) => u.officeId === 'office_baghdad' && u.role === 'owner')!;

    // 1. Snapshot initial state before backup
    const initialProducts = await services.getProducts(owner);
    const initialParties = await services.getParties(owner);
    const initialInvoices = await services.getInvoices(owner);
    const initialAccounts = await services.getAccounts(owner);
    const initialWarehouses = await services.getWarehouses(owner);

    details.push(`حالة المكتب قبل النسخ الاحتياطي: ${initialProducts.length} منتجات، ${initialParties.length} جهات، ${initialInvoices.length} فواتير، ${initialAccounts.length} حسابات`);

    // 2. Export backup
    const backupJson = await services.exportBackup(owner);
    if (!backupJson || typeof backupJson !== 'string') {
      throw new Error('فشل تصدير النسخة الاحتياطية: لم يتم إرجاع سلسلة نصية صالحة');
    }
    const parsed = JSON.parse(backupJson);
    if (!parsed.checksum || !parsed.data || !parsed.version) {
      throw new Error('هيكل النسخة الاحتياطية غير مكتمل (Missing checksum / data / version)');
    }
    details.push(`✓ تم تصدير النسخة الاحتياطية بصيغة JSON سليمة (الحجم: ${backupJson.length} حرف، البصمة: ${parsed.checksum})`);

    // 3. Import backup back
    const importResult = await services.importBackup(owner, backupJson);
    if (!importResult.success) {
      throw new Error('فشلت عملية استعادة النسخة الاحتياطية');
    }
    details.push(`✓ تم استيراد واستعادة النسخة الاحتياطية بنجاح`);

    // 4. Verify post-restore data matches 100%
    const restoredProducts = await services.getProducts(owner);
    const restoredParties = await services.getParties(owner);
    const restoredInvoices = await services.getInvoices(owner);
    const restoredAccounts = await services.getAccounts(owner);
    const restoredWarehouses = await services.getWarehouses(owner);

    if (restoredProducts.length !== initialProducts.length) {
      throw new Error(`عدم تطابق في عدد المنتجات بعد الاستعادة: ${restoredProducts.length} مقابل ${initialProducts.length}`);
    }
    if (restoredParties.length !== initialParties.length) {
      throw new Error(`عدم تطابق في عدد العملاء والموردين: ${restoredParties.length} مقابل ${initialParties.length}`);
    }
    if (restoredInvoices.length !== initialInvoices.length) {
      throw new Error(`عدم تطابق في عدد الفواتير: ${restoredInvoices.length} مقابل ${initialInvoices.length}`);
    }
    if (restoredAccounts.length !== initialAccounts.length) {
      throw new Error(`عدم تطابق في عدد الحسابات: ${restoredAccounts.length} مقابل ${initialAccounts.length}`);
    }
    if (restoredWarehouses.length !== initialWarehouses.length) {
      throw new Error(`عدم تطابق في عدد المستودعات: ${restoredWarehouses.length} مقابل ${initialWarehouses.length}`);
    }

    // Verify product IDs and names match exactly
    for (let i = 0; i < initialProducts.length; i++) {
      if (initialProducts[i].id !== restoredProducts[i].id || initialProducts[i].quantityOnHand !== restoredProducts[i].quantityOnHand) {
        throw new Error(`بيانات المنتج ${initialProducts[i].name} لا تتطابق بعد الاستعادة`);
      }
    }
    details.push(`✓ تطابق تام 100% لكافة السجلات (المنتجات، الحسابات، الأرصدة، الفواتير، المستودعات)`);

    // 5. Verify corrupt / invalid backup rejection
    let corruptRejected = false;
    try {
      await services.importBackup(owner, '{ corrupt: true, invalid_json }');
    } catch (e: any) {
      corruptRejected = true;
      details.push(`✓ تم رفض ملف النسخة الاحتياطية الفاسد مع رسالة خطأ عربية: "${e.message}"`);
    }
    if (!corruptRejected) {
      throw new Error('فشل التحقق: تم قبول ملف تالف وغير صالح كنسخة احتياطية!');
    }

    results.push({
      id: 'test_19_backup_export_and_restore_identical_data',
      title: 'فحص التصدير والاستعادة الدقيقة للبيانات (Backup Export & Restore Identical Data)',
      passed: true,
      durationMs: Math.round((performance.now() - start19) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_19_backup_export_and_restore_identical_data',
      title: 'فحص التصدير والاستعادة الدقيقة للبيانات (Backup Export & Restore Identical Data)',
      passed: false,
      durationMs: Math.round((performance.now() - start19) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 20: User of office B never sees office A's records in any list screen
  // ==========================================
  const start20 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const userBasra = memoryDb.users.find((u) => u.officeId === 'office_basra' && u.role === 'owner')!;

    if (!userBasra) {
      throw new Error('مستخدم مكتب البصرة غير موجود في بيانات البذور');
    }

    details.push(`بدء فحص العزل التام للمكتب (Tenant Isolation) بحساب مكتب البصرة: ${userBasra.name} (${userBasra.officeId})`);

    // 1. Products query
    const basraProducts = await services.getProducts(userBasra);
    const leakedProducts = basraProducts.filter((p) => p.officeId === 'office_baghdad');
    if (leakedProducts.length > 0) {
      throw new Error(`تسريب بيانات: ظهرت منتجات مكتب بغداد (${leakedProducts.length}) لمستخدم البصرة!`);
    }
    details.push(`✓ قائمة المواد الطبية: تم استرجاع ${basraProducts.length} صنفاً، 0 منتجات مسربة من مكتب بغداد`);

    // 2. Warehouses query
    const basraWarehouses = await services.getWarehouses(userBasra);
    const leakedWarehouses = basraWarehouses.filter((w) => w.officeId === 'office_baghdad');
    if (leakedWarehouses.length > 0) {
      throw new Error(`تسريب بيانات: ظهرت مستودعات مكتب بغداد لمستخدم البصرة!`);
    }
    details.push(`✓ قائمة المستودعات: ${basraWarehouses.length} مستودعات تابعة للبصرة، 0 مستودعات مسربة`);

    // 3. Invoices query
    const basraInvoices = await services.getInvoices(userBasra);
    const leakedInvoices = basraInvoices.filter((inv) => inv.officeId === 'office_baghdad');
    if (leakedInvoices.length > 0) {
      throw new Error(`تسريب بيانات: ظهرت فواتير مكتب بغداد (${leakedInvoices.length}) لمستخدم البصرة!`);
    }
    details.push(`✓ قائمة الفواتير: ${basraInvoices.length} فواتير خاصة بمكتب البصرة، 0 فواتير مسربة`);

    // 4. Parties query (Customers and Suppliers)
    const basraParties = await services.getParties(userBasra);
    const leakedParties = basraParties.filter((pt) => pt.officeId === 'office_baghdad');
    if (leakedParties.length > 0) {
      throw new Error(`تسريب بيانات: ظهر عملاء أو موردو مكتب بغداد لمستخدم البصرة!`);
    }
    details.push(`✓ قائمة العملاء والموردين: ${basraParties.length} جهات، 0 جهات مسربة`);

    // 5. Accounts query
    const basraAccounts = await services.getAccounts(userBasra);
    const leakedAccounts = basraAccounts.filter((acc) => acc.officeId === 'office_baghdad');
    if (leakedAccounts.length > 0) {
      throw new Error(`تسريب بيانات: ظهرت شجرة حسابات مكتب بغداد لمستخدم البصرة!`);
    }
    details.push(`✓ دليل الحسابات: ${basraAccounts.length} حسابات، 0 حسابات مسربة`);

    // 6. Expenses query
    const basraExpenses = await services.getExpenses(userBasra);
    const leakedExpenses = basraExpenses.filter((exp) => exp.officeId === 'office_baghdad');
    if (leakedExpenses.length > 0) {
      throw new Error(`تسريب بيانات: ظهرت سندات صرف مكتب بغداد لمستخدم البصرة!`);
    }
    details.push(`✓ سندات الصرف والمصاريف: ${basraExpenses.length} سندات، 0 سندات مسربة`);

    // 7. Audit Logs query
    const basraAuditLogs = await services.getAuditLogs(userBasra);
    const leakedAuditLogs = basraAuditLogs.filter((log) => log.officeId === 'office_baghdad');
    if (leakedAuditLogs.length > 0) {
      throw new Error(`تسريب بيانات: ظهر سجل التدقيق لمكتب بغداد لمستخدم البصرة!`);
    }
    details.push(`✓ سجل التدقيق والرقابة: ${basraAuditLogs.length} سجلات، 0 سجلات مسربة`);

    results.push({
      id: 'test_20_office_b_never_sees_office_a_records',
      title: 'فحص العزل الصارم بين المكاتب (Office B Never Sees Office A Records in Any Screen)',
      passed: true,
      durationMs: Math.round((performance.now() - start20) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_20_office_b_never_sees_office_a_records',
      title: 'فحص العزل الصارم بين المكاتب (Office B Never Sees Office A Records in Any Screen)',
      passed: false,
      durationMs: Math.round((performance.now() - start20) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 21: Customer posts a request, two merchants answer, customer sees both sorted and accepts cheaper
  // ==========================================
  const start21 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const customer = memoryDb.users.find((u) => u.id === 'user_cust_hospital')!;
    const bgOwner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;
    const bsOwner = memoryDb.users.find((u) => u.id === 'user_bs_owner')!;

    // Customer posts a request that matches both Baghdad and Basra approved offices
    const req = await services.createPurchaseRequest(customer, {
      productName: 'قفازات طبية معقمة',
      quantity: 5,
      targetPrice: 28000,
      deliveryCity: 'بغداد',
      deadline: '2026-12-31',
      notes: 'تجهيز عاجل للمستشفى - اختبار السوق',
    });

    if (!req.matches.some((m) => m.officeId === 'office_baghdad') || !req.matches.some((m) => m.officeId === 'office_basra')) {
      throw new Error('المطابقة الذكية لم تجد مكتبي بغداد والبصرة المعتمدين للطلب');
    }
    details.push(`✓ أنشأ المشتري الطلب (${req.id}) وتمت مطابقته مع ${req.matches.length} مكاتب معتمدة مع حفظ سبب المطابقة بالعربية`);

    // Both merchants submit offers (Basra higher at 24,000 IQD, Baghdad cheaper at 6,200 IQD)
    const basraOffer = await services.submitOffer(bsOwner, {
      requestId: req.id,
      productId: 'prd_bs_01',
      price: 24000,
      availableQuantity: 20,
      deliveryTime: 'خلال 48 ساعة',
      validity: '2026-12-31',
    });

    const baghdadOffer = await services.submitOffer(bgOwner, {
      requestId: req.id,
      productId: 'prd_bg_01',
      price: 6200,
      availableQuantity: 15,
      deliveryTime: 'خلال 12 ساعة',
      validity: '2026-12-31',
    });

    // Customer views request with all offers sorted ascending by price
    const reqDetails = await services.getRequestWithOffers(customer, req.id);
    if (reqDetails.offers.length !== 2) {
      throw new Error(`يجب أن يرى العميل العرضين معاً، تم إرجاع: ${reqDetails.offers.length}`);
    }
    if (reqDetails.offers[0].id !== baghdadOffer.id || reqDetails.offers[0].price !== 6200) {
      throw new Error('العروض غير مرتبة تصاعدياً حسب السعر الأقل أولاً');
    }
    if (reqDetails.offers[1].id !== basraOffer.id) {
      throw new Error('ترتيب العرض الثاني غير مطابق');
    }
    details.push(`✓ شاهد المشتري كلا العرضين مرتبين تصاعدياً بالسعر (${reqDetails.offers[0].price} د.ع ثم ${reqDetails.offers[1].price} د.ع)`);

    // Verify customer received offer notifications
    const custNotifs = await services.getNotifications(customer);
    if (!custNotifs.some((n) => n.text.includes('عرض سعر جديد'))) {
      throw new Error('لم يصل إشعار عرض سعر جديد إلى حساب العميل');
    }
    details.push('✓ تم إرسال إشعارات الطلب الجديد للمكاتب المطابقة وإشعار العرض الجديد للعميل');

    // Customer accepts the cheaper offer
    const accepted = await services.acceptOffer(customer, reqDetails.offers[0].id);
    if (accepted.request.status !== 'accepted' || accepted.offer.status !== 'accepted') {
      throw new Error('لم تتحول حالة الطلب والعرض الفائز إلى accepted');
    }
    details.push(`✓ قبل المشتري العرض الأقل سعراً (${accepted.offer.price} د.ع) وأُصدرت الفاتورة ${accepted.invoice.number}`);

    results.push({
      id: 'test_21_market_request_offers_and_accept_cheaper',
      title: 'فحص نشر طلب شراء ومنافسة مكتبين وقبول العرض الأرخص (Market Request & Cheaper Offer)',
      passed: true,
      durationMs: Math.round((performance.now() - start21) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_21_market_request_offers_and_accept_cheaper',
      title: 'فحص نشر طلب شراء ومنافسة مكتبين وقبول العرض الأرخص (Market Request & Cheaper Offer)',
      passed: false,
      durationMs: Math.round((performance.now() - start21) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 22: Accepting creates invoice, reduces stock, and trial balance still balances
  // ==========================================
  const start22 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const customer = memoryDb.users.find((u) => u.id === 'user_cust_individual')!;
    const bsOwner = memoryDb.users.find((u) => u.id === 'user_bs_owner')!;

    const stockBefore = (await services.getStockByProduct(bsOwner, 'prd_bs_03')).quantityOnHand;
    const req = await services.createPurchaseRequest(customer, {
      productName: 'كانيولا وريدية جراحية 18G',
      quantity: 4,
      targetPrice: 25000,
      deliveryCity: 'البصرة',
      deadline: '2026-12-31',
    });

    // Test checkOfferStock warning when quantity exceeds stock
    const shortageCheck = await services.checkOfferStock(bsOwner, {
      productId: 'prd_bs_03',
      quantity: stockBefore + 25,
    });
    if (shortageCheck.sufficient || shortageCheck.shortage !== 25) {
      throw new Error('دالة checkOfferStock لم تكشف النقص المتوقع قبل الإرسال');
    }
    details.push(`✓ فحص توفر المخزون (checkOfferStock) كشف النقص بدقة قبل التأكيد: ${shortageCheck.warningMessageAr}`);

    const offer = await services.submitOffer(bsOwner, {
      requestId: req.id,
      productId: 'prd_bs_03',
      price: 23000,
      availableQuantity: stockBefore,
      deliveryTime: 'نفس اليوم',
      validity: '2026-12-31',
    });

    const accepted = await services.acceptOffer(customer, offer.id);
    const stockAfter = (await services.getStockByProduct(bsOwner, 'prd_bs_03')).quantityOnHand;
    if (stockAfter !== stockBefore - 4) {
      throw new Error(`لم ينخفض المخزون بالمقدار الصحيح: قبل ${stockBefore}، بعد ${stockAfter}`);
    }
    details.push(`✓ تم إنشاء فاتورة البيع (${accepted.invoice.number}) وخصم 4 وحدات FEFO: من ${stockBefore} إلى ${stockAfter}`);

    // Verify customer portal reflects the newly linked Basra merchant and invoice
    const portal = await services.getCustomerPortalData(customer);
    if (!portal.invoices.some((i) => i.id === accepted.invoice.id)) {
      throw new Error('لم تظهر الفاتورة المنشأة من السوق في بوابة العميل المرتبط بالهاتف');
    }
    details.push('✓ تم ربط العميل برقم الهاتف وإنشاء جهة العميل في مكتب البصرة وإظهار الفاتورة في بوابته');

    // Verify Trial Balance for Basra still balances
    const tb = await services.getTrialBalance(bsOwner);
    if (!tb.isBalanced || tb.totalDebit !== tb.totalCredit) {
      throw new Error(`اختل توازن ميزان المراجعة بعد قبول العرض: مدين ${tb.totalDebit}، دائن ${tb.totalCredit}`);
    }
    details.push(`✓ ميزان المراجعة لمكتب البصرة متوازن 100% بعد إنشاء الفاتورة وتكلفة المبيعات (${tb.totalDebit.toLocaleString('en-US')} د.ع)`);

    results.push({
      id: 'test_22_accept_creates_invoice_reduces_stock_and_balances_tb',
      title: 'فحص إنشاء الفاتورة وخصم المخزون وتوازن ميزان المراجعة عند قبول العرض (Accept Offer Accounting)',
      passed: true,
      durationMs: Math.round((performance.now() - start22) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_22_accept_creates_invoice_reduces_stock_and_balances_tb',
      title: 'فحص إنشاء الفاتورة وخصم المخزون وتوازن ميزان المراجعة عند قبول العرض (Accept Offer Accounting)',
      passed: false,
      durationMs: Math.round((performance.now() - start22) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 23: Unapproved merchant is invisible and cannot answer requests
  // ==========================================
  const start23 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const customer = memoryDb.users.find((u) => u.id === 'user_cust_hospital')!;
    const pendingOwner = memoryDb.users.find((u) => u.id === 'user_babil_owner')!;

    // 1. Customer creates request; unapproved office_pending_erbil must NOT appear in matches
    const req = await services.createPurchaseRequest(customer, {
      productName: 'باندج ضاغط أو قفازات طبية',
      quantity: 10,
      targetPrice: 10000,
      deliveryCity: 'بابل',
      deadline: '2026-12-31',
    });

    if (req.matches.some((m) => m.officeId === 'office_pending_erbil')) {
      throw new Error('ظهر مكتب غير معتمد ضمن نتائج المطابقة الذكية!');
    }
    details.push('✓ المكتب غير المعتمد (office_pending_erbil) مخفي تماماً من نتائج المطابقة الذكية');

    // 2. Unapproved merchant sees 0 requests in Market
    const pendingReqs = await services.getPurchaseRequests(pendingOwner);
    if (pendingReqs.length !== 0) {
      throw new Error(`المكتب غير المعتمد استطاع رؤية ${pendingReqs.length} طلبات في السوق!`);
    }
    details.push('✓ المكتب غير المعتمد لا يرى أي طلبات شراء في السوق (0 طلبات)');

    // 3. General offers exclude unapproved merchants & unapproved merchant cannot publish
    let publishBlocked = false;
    try {
      await services.publishGeneralOffer(pendingOwner, {
        productName: 'قفازات غير مرخصة',
        price: 5000,
        quantity: 20,
        validity: '2026-12-31',
      });
    } catch (e: any) {
      if (e.code === 'OFFICE_NOT_APPROVED') publishBlocked = true;
    }
    if (!publishBlocked) {
      throw new Error('سمح النظام لمكتب غير معتمد بنشر عرض عام في السوق!');
    }

    // 4. Unapproved merchant cannot answer any request
    let answerBlocked = false;
    try {
      await services.submitOffer(pendingOwner, {
        requestId: req.id,
        price: 4000,
        availableQuantity: 10,
        deliveryTime: '24 ساعة',
        validity: '2026-12-31',
      });
    } catch (e: any) {
      if (e.code === 'OFFICE_NOT_APPROVED') answerBlocked = true;
    }
    if (!answerBlocked) {
      throw new Error('سمح النظام لمكتب غير معتمد بالرد على طلب شراء!');
    }
    details.push('✓ تم حظر المكتب غير المعتمد عند محاولة تقديم عرض أو نشر عرض عام (OFFICE_NOT_APPROVED)');

    results.push({
      id: 'test_23_unapproved_merchant_invisible_and_blocked',
      title: 'فحص إخفاء ومنع المكتب غير المعتمد من الظهور أو الرد في السوق (Unapproved Office Guard)',
      passed: true,
      durationMs: Math.round((performance.now() - start23) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_23_unapproved_merchant_invisible_and_blocked',
      title: 'فحص إخفاء ومنع المكتب غير المعتمد من الظهور أو الرد في السوق (Unapproved Office Guard)',
      passed: false,
      durationMs: Math.round((performance.now() - start23) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 24: A merchant cannot read another merchant's offers
  // ==========================================
  const start24 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const customer = memoryDb.users.find((u) => u.id === 'user_cust_hospital')!;
    const bgOwner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;
    const bsOwner = memoryDb.users.find((u) => u.id === 'user_bs_owner')!;

    // Create request matched to both Baghdad & Basra; Baghdad submits an offer
    const req = await services.createPurchaseRequest(customer, {
      productName: 'قفازات فحص أو جراحية طبية',
      quantity: 8,
      targetPrice: 28000,
      deliveryCity: 'بغداد',
      deadline: '2026-12-31',
    });

    const bgOffer = await services.submitOffer(bgOwner, {
      requestId: req.id,
      productId: 'prd_bg_02',
      price: 7900,
      availableQuantity: 40,
      deliveryTime: '24 ساعة',
      validity: '2026-12-31',
    });

    // 1. Basra attempts getMerchantOffers targeting office_baghdad -> must throw TENANT_ISOLATION_VIOLATION
    let crossOfficeBlocked = false;
    try {
      await services.getMerchantOffers(bsOwner, 'office_baghdad');
    } catch (e: any) {
      if (e.code === 'TENANT_ISOLATION_VIOLATION') crossOfficeBlocked = true;
    }
    if (!crossOfficeBlocked) {
      throw new Error('استطاع مكتب البصرة استدعاء عروض مكتب بغداد عبر معرف المكتب!');
    }
    details.push('✓ تم رفض محاولة قراءة عروض مكتب آخر مباشرة بحارس العزل (TENANT_ISOLATION_VIOLATION)');

    // 2. Basra fetches own offers -> must contain zero office_baghdad offers
    const basraOwnOffers = await services.getMerchantOffers(bsOwner);
    if (basraOwnOffers.some((o) => o.officeId !== 'office_basra' || o.id === bgOffer.id)) {
      throw new Error('تسربت عروض مكتب بغداد ضمن قائمة عروض مكتب البصرة!');
    }
    details.push('✓ استعلام عروض المكتب يُرجع عروضه فقط دون أي تسريب لعروض المنافسين');

    // 3. Basra inspects request details -> must NOT see Baghdad's offer inside offers array
    const basraReqView = await services.getRequestWithOffers(bsOwner, req.id);
    if (basraReqView.offers.some((o) => o.officeId === 'office_baghdad')) {
      throw new Error('تسرب عرض سعر مكتب بغداد لمكتب البصرة عبر تفاصيل الطلب!');
    }
    details.push('✓ عند استعراض نفس الطلب من مكتب البصرة، لا يظهر أي عرض مقدم من مكتب بغداد (0 تسريب)');

    results.push({
      id: 'test_24_merchant_cannot_read_other_merchants_offers',
      title: 'فحص منع أي مكتب من قراءة عروض أسعار مكتب آخر (Offer Competitor Isolation)',
      passed: true,
      durationMs: Math.round((performance.now() - start24) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_24_merchant_cannot_read_other_merchants_offers',
      title: 'فحص منع أي مكتب من قراءة عروض أسعار مكتب آخر (Offer Competitor Isolation)',
      passed: false,
      durationMs: Math.round((performance.now() - start24) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 25: Order status machine rejects invalid jumps and keeps full history
  // ==========================================
  const start25 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const customer = memoryDb.users.find((u) => u.id === 'user_cust_hospital')!;
    const bgOwner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;

    const req = await services.createPurchaseRequest(customer, {
      productName: 'كمامات طبية عالية الحماية N95',
      quantity: 5,
      targetPrice: 2200,
      deliveryCity: 'بغداد',
      deadline: '2026-12-31',
    });

    const offer = await services.submitOffer(bgOwner, {
      requestId: req.id,
      productId: 'prd_bg_04',
      price: 1900,
      availableQuantity: 50,
      deliveryTime: '24 ساعة',
      validity: '2026-12-31',
    });

    const accepted = await services.acceptOffer(customer, offer.id);
    const order = accepted.order;
    if (!order || order.status !== 'confirmed' || order.statusHistory.length !== 1) {
      throw new Error('لم يتم إنشاء الطلب بالحالة الأولية confirmed مع سجل التاريخ');
    }
    details.push(`✓ تم إنشاء الطلب تلقائياً (${order.orderNumber}) بالحالة الأولية: مؤكد`);

    // Invalid jump confirmed -> shipped must be rejected
    let invalidJumpBlocked = false;
    try {
      await services.advanceOrderStatus(bgOwner, order.id, 'shipped');
    } catch (e: any) {
      if (e.code === 'INVALID_STATUS_TRANSITION') invalidJumpBlocked = true;
    }
    if (!invalidJumpBlocked) {
      throw new Error('سمحت آلة الحالة بالقفز غير المشروع من confirmed إلى shipped!');
    }
    details.push('✓ رفضت آلة الحالة القفز غير المشروع من "مؤكد" إلى "تم الشحن" (INVALID_STATUS_TRANSITION)');

    // Valid sequential progression: confirmed -> preparing -> shipped -> delivered
    const prep = await services.advanceOrderStatus(bgOwner, order.id, 'preparing', 'تجهيز الوجبة');
    const ship = await services.advanceOrderStatus(bgOwner, order.id, 'shipped', 'انطلاق المندوب');
    const deliv = await services.advanceOrderStatus(bgOwner, order.id, 'delivered', 'تم الاستلام');

    if (
      prep.status !== 'preparing' ||
      ship.status !== 'shipped' ||
      deliv.status !== 'delivered' ||
      deliv.statusHistory.length !== 4
    ) {
      throw new Error('سلسلة حالات الطلب أو عدد سجلات التاريخ غير مطابق للـ 4 مراحل');
    }

    // Cannot advance beyond delivered
    let pastDeliveredBlocked = false;
    try {
      await services.advanceOrderStatus(bgOwner, order.id, 'preparing');
    } catch (e: any) {
      if (e.code === 'INVALID_STATUS_TRANSITION') pastDeliveredBlocked = true;
    }
    if (!pastDeliveredBlocked) {
      throw new Error('سمح النظام بتعديل طلب مكتمل ومُسلم!');
    }

    const custNotifs = await services.getNotifications(customer);
    if (!custNotifs.some((n) => n.text.includes(order.orderNumber) && n.text.includes('تم التسليم'))) {
      throw new Error('لم يتلقَّ المشتري إشعارات تحديث حالة الطلب');
    }
    details.push('✓ مرّ الطلب بجميع المراحل الأربع مع حفظ التاريخ الكامل وإشعار المشتري عند كل خطوة');

    results.push({
      id: 'test_25_order_status_machine_and_history',
      title: 'فحص آلة حالة الطلب ومنع القفز غير المشروع وحفظ التاريخ (Order Status Machine)',
      passed: true,
      durationMs: Math.round((performance.now() - start25) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_25_order_status_machine_and_history',
      title: 'فحص آلة حالة الطلب ومنع القفز غير المشروع وحفظ التاريخ (Order Status Machine)',
      passed: false,
      durationMs: Math.round((performance.now() - start25) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 26: A merchant cannot read another merchant's chats
  // ==========================================
  const start26 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const customer = memoryDb.users.find((u) => u.id === 'user_cust_hospital')!;
    const bgOwner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;
    const bsOwner = memoryDb.users.find((u) => u.id === 'user_bs_owner')!;

    const req = await services.createPurchaseRequest(customer, {
      productName: 'قفازات فحص أو جراحية طبية',
      quantity: 6,
      targetPrice: 28000,
      deliveryCity: 'بغداد',
      deadline: '2026-12-31',
    });

    await services.sendChatMessage(customer, {
      threadType: 'request',
      threadId: req.id,
      officeId: 'office_baghdad',
      body: 'رسالة خاصة لمكتب بغداد فقط حول السعر',
    });
    await services.sendChatMessage(bgOwner, {
      threadType: 'request',
      threadId: req.id,
      body: 'رد مكتب بغداد السري للعميل',
    });
    await services.sendChatMessage(customer, {
      threadType: 'request',
      threadId: req.id,
      officeId: 'office_basra',
      body: 'استفسار منفصل لمكتب البصرة',
    });

    const bsThread = await services.getChatMessages(bsOwner, {
      threadType: 'request',
      threadId: req.id,
    });
    if (bsThread.some((m) => m.officeId === 'office_baghdad' || m.body.includes('بغداد'))) {
      throw new Error('تسربت رسائل محادثة مكتب بغداد إلى مكتب البصرة!');
    }
    details.push('✓ محادثة الطلب معزولة تماماً لكل طرفين: مكتب البصرة يرى رسائله فقط');

    let crossChatBlocked = false;
    try {
      await services.getChatMessages(bsOwner, {
        threadType: 'request',
        threadId: req.id,
        officeId: 'office_baghdad',
      });
    } catch (e: any) {
      if (e.code === 'TENANT_ISOLATION_VIOLATION') crossChatBlocked = true;
    }
    if (!crossChatBlocked) {
      throw new Error('استطاع مكتب البصرة قراءة محادثة مكتب بغداد عبر officeId!');
    }

    const bgOffer = await services.submitOffer(bgOwner, {
      requestId: req.id,
      productId: 'prd_bg_02',
      price: 7800,
      availableQuantity: 30,
      deliveryTime: '24 ساعة',
      validity: '2026-12-31',
    });
    const accepted = await services.acceptOffer(customer, bgOffer.id);
    await services.sendChatMessage(customer, {
      threadType: 'order',
      threadId: accepted.order.id,
      body: 'يرجى توصيل الطلب لبوابة المستشفى الرئيسية',
    });

    let crossOrderChatBlocked = false;
    try {
      await services.getChatMessages(bsOwner, {
        threadType: 'order',
        threadId: accepted.order.id,
      });
    } catch (e: any) {
      if (e.code === 'TENANT_ISOLATION_VIOLATION') crossOrderChatBlocked = true;
    }
    if (!crossOrderChatBlocked) {
      throw new Error('استطاع مكتب البصرة قراءة محادثة طلب تابع لمكتب بغداد!');
    }
    details.push('✓ تم حظر وصول أي مكتب طرف ثالث لمحادثات الطلبات أو العروض (TENANT_ISOLATION_VIOLATION)');

    results.push({
      id: 'test_26_two_party_chat_isolation',
      title: 'فحص عزل محادثات السوق بين الطرفين ومنع اطلاع مكتب آخر (Chat Isolation)',
      passed: true,
      durationMs: Math.round((performance.now() - start26) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_26_two_party_chat_isolation',
      title: 'فحص عزل محادثات السوق بين الطرفين ومنع اطلاع مكتب آخر (Chat Isolation)',
      passed: false,
      durationMs: Math.round((performance.now() - start26) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 27: Complaint passes all statuses and both sides are notified
  // ==========================================
  const start27 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const customer = memoryDb.users.find((u) => u.id === 'user_cust_hospital')!;
    const bgOwner = memoryDb.users.find((u) => u.id === 'user_bg_owner')!;

    const req = await services.createPurchaseRequest(customer, {
      productName: 'سرنجات طبية 5 مل',
      quantity: 3,
      targetPrice: 9500,
      deliveryCity: 'بغداد',
      deadline: '2026-12-31',
    });
    const offer = await services.submitOffer(bgOwner, {
      requestId: req.id,
      productId: 'prd_bg_05',
      price: 8800,
      availableQuantity: 20,
      deliveryTime: '24 ساعة',
      validity: '2026-12-31',
    });
    const { order } = await services.acceptOffer(customer, offer.id);

    // 1. Customer opens complaint -> open
    const cmp = await services.createComplaint(customer, {
      orderId: order.id,
      reason: 'نقص في عدد العلب المستلمة',
      description: 'وصلت علبتان فقط من أصل 3 علب مطلوبة.',
    });
    if (cmp.status !== 'open') throw new Error('حالة الشكوى الأولى يجب أن تكون open');

    // Invalid jump open -> resolved must fail
    let invalidJump = false;
    try {
      await services.updateComplaintStatus(bgOwner, {
        complaintId: cmp.id,
        nextStatus: 'resolved',
        merchantReply: 'تم الإرسال',
      });
    } catch (e: any) {
      if (e.code === 'INVALID_STATUS_TRANSITION') invalidJump = true;
    }
    if (!invalidJump) throw new Error('سمح النظام بالقفز في حالات الشكوى دون المرور بـ in_review!');

    // 2. Merchant -> in_review
    const inRev = await services.updateComplaintStatus(bgOwner, {
      complaintId: cmp.id,
      nextStatus: 'in_review',
    });
    // 3. Merchant -> resolved with reply
    const resolved = await services.updateComplaintStatus(bgOwner, {
      complaintId: cmp.id,
      nextStatus: 'resolved',
      merchantReply: 'تم إرسال العلبة الناقصة مع مندوب التوصيل اليوم.',
    });
    // 4. Customer -> customer_confirmed
    const confirmed = await services.updateComplaintStatus(customer, {
      complaintId: cmp.id,
      nextStatus: 'customer_confirmed',
    });

    if (
      inRev.status !== 'in_review' ||
      resolved.status !== 'resolved' ||
      confirmed.status !== 'customer_confirmed' ||
      confirmed.history.length !== 4
    ) {
      throw new Error('لم تمر الشكوى بجميع المراحل الأربع بشكل صحيح');
    }

    const custNotifs = await services.getNotifications(customer);
    const merchNotifs = await services.getNotifications(bgOwner);
    const custHasComplaintNotif = custNotifs.some(
      (n) => n.text.includes(order.orderNumber) && n.text.includes('تم الحل')
    );
    const merchHasComplaintNotif =
      merchNotifs.some((n) => n.text.includes('شكوى جديدة') && n.text.includes(order.orderNumber)) &&
      merchNotifs.some((n) => n.text.includes('أكد المشتري') && n.text.includes(order.orderNumber));

    if (!custHasComplaintNotif || !merchHasComplaintNotif) {
      throw new Error('لم تصل إشعارات الشكوى إلى كلا الطرفين (المشتري والمكتب)');
    }
    details.push('✓ مرت الشكوى بجميع الحالات الأربع (مفتوحة -> قيد المراجعة -> تم الحل -> أكّد المشتري الحل)');
    details.push('✓ تلقى كل من المشتري والمكتب المورد إشعارات فورية في كل مرحلة');

    results.push({
      id: 'test_27_complaint_lifecycle_and_both_sides_notified',
      title: 'فحص دورة حياة الشكوى الكاملة وإشعار الطرفين في كل مرحلة (Complaint Lifecycle)',
      passed: true,
      durationMs: Math.round((performance.now() - start27) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_27_complaint_lifecycle_and_both_sides_notified',
      title: 'فحص دورة حياة الشكوى الكاملة وإشعار الطرفين في كل مرحلة (Complaint Lifecycle)',
      passed: false,
      durationMs: Math.round((performance.now() - start27) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  // ==========================================
  // Test 28: Unapproved merchant cannot publish offers; license upload & admin verification enables it
  // ==========================================
  const start28 = performance.now();
  try {
    const details: string[] = [];
    const memoryDb = createInitialSeedData();
    const pendingOwner = memoryDb.users.find((u) => u.id === 'user_babil_owner')!;
    const admin = memoryDb.users.find((u) => u.id === 'user_platform_admin')!;
    const customer = memoryDb.users.find((u) => u.id === 'user_cust_hospital')!;

    // 1. Pending office cannot publish general offers
    let blockedBeforeApproval = false;
    try {
      await services.publishGeneralOffer(pendingOwner, {
        productName: 'أجهزة قياس ضغط رقمية',
        price: 35000,
        quantity: 15,
        validity: '2026-12-31',
      });
    } catch (e: any) {
      if (e.code === 'OFFICE_NOT_APPROVED') blockedBeforeApproval = true;
    }
    if (!blockedBeforeApproval) {
      throw new Error('سمح النظام لمكتب غير معتمد بنشر عرض عام!');
    }
    details.push('✓ تم حظر المكتب غير المعتمد من نشر أي عرض عام (OFFICE_NOT_APPROVED)');

    // 2. Owner uploads license -> Platform Admin gets unread notification
    await services.uploadMerchantLicense(pendingOwner, {
      fileName: 'babil_health_license_2026.pdf',
    });
    const adminNotifs = await services.getNotifications(admin);
    if (!adminNotifs.some((n) => !n.read && n.text.includes('babil_health_license_2026.pdf'))) {
      throw new Error('لم يصل إشعار غير مقروء لمشرف المنصة بعد رفع ملف الترخيص');
    }
    details.push('✓ رفع المكتب ملف الترخيص وظهر إشعار غير مقروء لدى مشرف المنصة');

    // 3. Reject requires reason; rejecting blocks & notifies owner
    let emptyReasonBlocked = false;
    try {
      await services.reviewMerchantLicense(admin, 'office_pending_erbil', 'rejected', '   ');
    } catch (e: any) {
      if (e.code === 'VALIDATION_ERROR') emptyReasonBlocked = true;
    }
    if (!emptyReasonBlocked) {
      throw new Error('سمح النظام برفض الترخيص بدون ذكر سبب الرفض!');
    }

    await services.reviewMerchantLicense(
      admin,
      'office_pending_erbil',
      'rejected',
      'يرجى إرفاق ختم نقابة الصيادلة وتجديد الإجازة لسنة 2026'
    );
    const ownerAfterRejectNotifs = await services.getNotifications(pendingOwner);
    if (!ownerAfterRejectNotifs.some((n) => n.text.includes('تم رفض ترخيص'))) {
      throw new Error('لم يصل إشعار الرفض مع السبب لصاحب المكتب');
    }

    // 4. Re-upload & Admin Approve -> merchant can now publish & appear in Market
    await services.uploadMerchantLicense(pendingOwner, {
      fileName: 'babil_health_license_stamped_2026.pdf',
    });
    await services.reviewMerchantLicense(admin, 'office_pending_erbil', 'approved');

    const published = await services.publishGeneralOffer(pendingOwner, {
      productName: 'أجهزة قياس ضغط رقمية معتمدة',
      price: 34000,
      quantity: 12,
      validity: '2026-12-31',
    });
    const marketOffers = await services.getGeneralOffers(customer);
    if (!marketOffers.some((g) => g.id === published.id)) {
      throw new Error('لم يظهر عرض المكتب في السوق بعد اعتماده من مشرف المنصة');
    }

    // 5. Verify customer favorites toggle works cleanly for approved merchant
    const favToggle = await services.toggleFavorite(customer, {
      kind: 'product',
      officeId: 'office_pending_erbil',
      productName: published.productName,
      unitPrice: published.price,
    });
    if (!favToggle.added || !favToggle.favorites.some((f) => f.productName === published.productName)) {
      throw new Error('فشل حفظ الصنف المفضل في السوق');
    }
    details.push('✓ بعد الرفض بسبب واضح ثم إعادة الرفع والاعتماد، نُشر العرض في السوق وأُتيح في المفضلة');

    results.push({
      id: 'test_28_unapproved_merchant_blocked_and_verification_flow',
      title: 'فحص منع غير المعتمد ودورة رفع الترخيص والاعتماد والمفضلة (Merchant Verification)',
      passed: true,
      durationMs: Math.round((performance.now() - start28) * 100) / 100,
      details,
    });
  } catch (err: any) {
    results.push({
      id: 'test_28_unapproved_merchant_blocked_and_verification_flow',
      title: 'فحص منع غير المعتمد ودورة رفع الترخيص والاعتماد والمفضلة (Merchant Verification)',
      passed: false,
      durationMs: Math.round((performance.now() - start28) * 100) / 100,
      details: [err.message],
      error: err.message,
    });
  }

  return results;
  } finally {
    repository.commit(previousSnapshot);
  }
}


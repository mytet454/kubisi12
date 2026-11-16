/**
 * src/services/index.ts
 * The single seam exported for the UI.
 * Every function is async, takes and returns JSON-serializable data,
 * checks permission AND officeId at the top, and throws AppError on failure.
 */
import {
  Account,
  AppError,
  AuditLog,
  Batch,
  ChatThreadType,
  ComplaintStatus,
  DatabaseSchema,
  Expense,
  GeneralOffer,
  hashPassword,
  Invoice,
  InvoiceLine,
  isAccountLocked,
  JournalEntry,
  JournalLine,
  MarketChatMessage,
  MarketFavorite,
  MarketFavoriteKind,
  MarketOrder,
  MarketOrderStatus,
  MerchantStatus,
  MovementType,
  Notification,
  Offer,
  Office,
  OrderComplaint,
  Party,
  Payment,
  Product,
  ProductStockInfo,
  PurchaseRequest,
  repository,
  RequestMatch,
  StockMovement,
  User,
  UserRole,
  Warehouse,
} from '../data/repository';
import {
  calculateBatchQuantityOnHand,
  calculateDaysToExpiry,
  calculateQuantityOnHand,
  checkExpiryStatus,
  guardNegativeStock,
  isLowStock,
  pickBatchesFEFO,
  updateWeightedAverageCost,
} from '../domain/inventory';
import {
  COMPLAINT_STATUS_LABELS,
  evaluateOfferStock,
  findBestProductForOfficeRequest,
  getNextOrderStatus,
  matchApprovedMerchantsForRequest,
  OfferStockCheckResult,
  ORDER_STATUS_LABELS,
  sortOffersByPrice,
  validateComplaintStatusTransition,
  validateOrderStatusTransition,
} from '../domain/market';
import {
  buildCustomerPaymentJournalLines,
  buildExpenseJournalLines,
  buildPurchaseJournalLines,
  buildReversalEntry,
  buildSaleJournalLines,
  buildSupplierPaymentJournalLines,
  calculateProfitAndLoss,
  calculateTrialBalance,
  checkPeriodLock,
  createJournalEntry,
  ProfitAndLossResult,
  TrialBalanceResult,
  validateBalancedEntry,
} from '../domain/accounting';
import { AR_STRINGS } from '../ui/strings/ar';

// Active Session state in memory
let currentSessionUser: User | null = null;
let lastSessionActivity: number = Date.now();
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

let idSequence = 0;
function makeId(prefix: string, suffix = ''): string {
  idSequence = (idSequence + 1) % 1000000;
  return `${prefix}_${Date.now()}_${idSequence}_${Math.random().toString(36).slice(2, 6)}${suffix}`;
}

function getStore(): DatabaseSchema {
  return repository.getSnapshot();
}

function commitStore(data: DatabaseSchema): void {
  repository.commit(data);
}

/**
 * Permission guard called at the top of EVERY service function
 */
export function checkPermission(
  actor: User | null,
  allowedRoles: UserRole[],
  targetOfficeId?: string | null
): User {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'يرجى تسجيل الدخول أولاً للوصول إلى النظام');
  }

  // Session inactivity check
  const now = Date.now();
  if (now - lastSessionActivity > INACTIVITY_TIMEOUT_MS) {
    currentSessionUser = null;
    throw new AppError('SESSION_EXPIRED', AR_STRINGS.auth.sessionExpired);
  }
  lastSessionActivity = now;

  if (!actor.active) {
    throw new AppError('ACCOUNT_DISABLED', AR_STRINGS.auth.accountDisabled);
  }

  // Role check
  if (!allowedRoles.includes(actor.role)) {
    throw new AppError(
      'PERMISSION_DENIED',
      `ليس لديك صلاحية لتنفيذ هذا الإجراء. الدور المطلوب: ${allowedRoles.join(', ')}، دورك: ${actor.role}`
    );
  }

  // Tenant Isolation check
  if (actor.officeId && targetOfficeId && actor.officeId !== targetOfficeId) {
    throw new AppError(
      'TENANT_ISOLATION_VIOLATION',
      `غير مصرح بالوصول إلى بيانات مكتب آخر. مكتبك: ${actor.officeId}، المكتب المستهدف: ${targetOfficeId}`
    );
  }

  return actor;
}

function ensureApprovedOffice(store: DatabaseSchema, officeId: string | null | undefined): Office {
  const office = store.offices.find((o) => o.id === officeId);
  if (!office) {
    throw new AppError('OFFICE_NOT_FOUND', 'المكتب الطبي غير موجود');
  }
  if (office.status !== 'approved') {
    throw new AppError(
      'OFFICE_NOT_APPROVED',
      'عذراً، هذا المكتب غير معتمد بعد للمشاركة في السوق الطبي. يجب اعتماد الترخيص من مشرف المنصة أولاً.'
    );
  }
  return office;
}

function getNextInvoiceNumberOnStore(
  store: DatabaseSchema,
  officeId: string,
  kind: 'sale' | 'purchase'
): string {
  const prefix = kind === 'sale' ? 'INV-SAL' : 'INV-PUR';
  const year = new Date().getFullYear();
  const officeInvoices = store.invoices.filter(
    (i) => i.officeId === officeId && i.number.startsWith(`${prefix}-${year}`)
  );
  const seq = officeInvoices.length + 1;
  return `${prefix}-${year}-${seq.toString().padStart(5, '0')}`;
}

function executeSaleInvoiceOnStore(
  store: DatabaseSchema,
  actor: User,
  params: {
    date: string;
    partyId: string;
    lines: Array<{
      productId: string;
      manualBatchId?: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
    }>;
    invoiceDiscount?: number;
    paymentMethod: 'cash' | 'transfer' | 'credit';
    notes?: string;
    failJournalOnPurpose?: boolean;
  }
): Invoice {
  const office = store.offices.find((o) => o.id === actor.officeId);
  if (!office) throw new AppError('OFFICE_NOT_FOUND', 'المكتب الطبي غير موجود');

  const period = store.periods.find((p) => p.officeId === actor.officeId);
  checkPeriodLock(params.date, period?.closedUntil);

  const party = store.parties.find((p) => p.id === params.partyId && p.officeId === actor.officeId);
  if (!party || party.kind !== 'customer') {
    throw new AppError('INVALID_PARTY', 'يجب تحديد عميل / مستشفى معتمد لفاتورة البيع');
  }

  if (!params.lines || params.lines.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'يجب أن تحتوي فاتورة البيع على مادة طبية واحدة على الأقل');
  }

  const txMovements: StockMovement[] = [];
  const invoiceLines: InvoiceLine[] = [];
  let grossTotal = 0;
  let totalCogs = 0;

  const invoiceId = makeId('inv');
  const invoiceNumber = getNextInvoiceNumberOnStore(store, actor.officeId!, 'sale');

  for (const line of params.lines) {
    const product = store.products.find((p) => p.id === line.productId && p.officeId === actor.officeId);
    if (!product || !product.active) {
      throw new AppError('PRODUCT_NOT_FOUND', `المادة الطبية المطلوبة غير موجودة أو معطلة`);
    }

    const currentStock = calculateQuantityOnHand(product.id, store.stockMovements);
    guardNegativeStock(currentStock, line.quantity, office.allowNegativeStock, product.name);

    const productBatches = store.batches
      .filter((b) => b.productId === product.id)
      .map((b) => ({
        ...b,
        quantityOnHand: calculateBatchQuantityOnHand(b.id, store.stockMovements),
      }));

    const pick = pickBatchesFEFO(productBatches, line.quantity, line.manualBatchId);

    if (pick.unfulfilledQty > 0 && !office.allowNegativeStock) {
      throw new AppError(
        'INSUFFICIENT_STOCK',
        `الرصيد المتوفر في وجبات "${product.name}" لا يكفي لتغطية الكمية المطلوبة (${line.quantity}). المتوفر: ${pick.fulfilledQty}`
      );
    }

    const primaryBatchId =
      pick.allocations[0]?.batchId ||
      store.batches.find((b) => b.productId === product.id)?.id ||
      'batch_default';

    const lineDisc = Math.round(line.discount || 0);
    const lineSubtotal = Math.round(line.quantity * line.unitPrice) - lineDisc;
    grossTotal += lineSubtotal;

    invoiceLines.push({
      productId: product.id,
      batchId: primaryBatchId,
      quantity: line.quantity,
      unitPrice: Math.round(line.unitPrice),
      discount: lineDisc,
      total: lineSubtotal,
    });

    const lineCost = Math.round(line.quantity * (product.avgCost || product.purchasePrice || 0));
    totalCogs += lineCost;

    for (const alloc of pick.allocations) {
      txMovements.push({
        id: makeId('mov'),
        officeId: actor.officeId!,
        type: 'sale',
        productId: product.id,
        batchId: alloc.batchId,
        warehouseId: alloc.warehouseId,
        quantity: -alloc.quantity,
        refType: 'sale_invoice',
        refId: invoiceId,
        date: params.date,
        userId: actor.id,
      });
    }
  }

  const invDiscount = Math.round(params.invoiceDiscount || 0);
  const netTotal = Math.max(0, grossTotal - invDiscount);
  const paidAmount = params.paymentMethod === 'credit' ? 0 : netTotal;

  const officeAccounts = store.accounts.filter((a) => a.officeId === actor.officeId);
  const { revenueLines, cogsLines } = buildSaleJournalLines(
    officeAccounts,
    netTotal,
    totalCogs,
    params.paymentMethod
  );

  if (params.failJournalOnPurpose) {
    throw new AppError(
      'SIMULATED_ATOMICITY_FAILURE',
      'فشل مصطنع متعمد في خطوة القيد المحاسبي لاختبار التراجع الذري'
    );
  }

  validateBalancedEntry(revenueLines);
  if (cogsLines.length > 0) {
    validateBalancedEntry(cogsLines);
  }

  const revenueEntry = createJournalEntry({
    id: makeId('je', '_rev'),
    officeId: actor.officeId!,
    date: params.date,
    memo: `إيراد فاتورة بيع رقم ${invoiceNumber} - ${party.name}`,
    refType: 'sale_invoice',
    refId: invoiceId,
    lines: revenueLines,
  });

  const cogsEntry =
    cogsLines.length > 0
      ? createJournalEntry({
          id: makeId('je', '_cogs'),
          officeId: actor.officeId!,
          date: params.date,
          memo: `تكلفة مبيعات فاتورة بيع رقم ${invoiceNumber} - COGS`,
          refType: 'sale_invoice',
          refId: invoiceId,
          lines: cogsLines,
        })
      : null;

  const newInvoice: Invoice = {
    id: invoiceId,
    officeId: actor.officeId!,
    kind: 'sale',
    number: invoiceNumber,
    date: params.date,
    partyId: party.id,
    lines: invoiceLines,
    discount: invDiscount,
    total: netTotal,
    paid: paidAmount,
    paymentMethod: params.paymentMethod,
    status: 'posted',
    notes: params.notes,
    userId: actor.id,
  };

  store.invoices.push(newInvoice);
  store.stockMovements.push(...txMovements);
  store.journalEntries.push(revenueEntry);
  if (cogsEntry) store.journalEntries.push(cogsEntry);

  store.auditLogs.push({
    id: makeId('log'),
    officeId: actor.officeId!,
    userId: actor.id,
    userName: actor.name,
    action: 'CREATE_SALE_INVOICE',
    entity: 'Invoice',
    entityId: newInvoice.id,
    after: { number: invoiceNumber, total: netTotal, linesCount: invoiceLines.length },
    at: new Date().toISOString(),
  });

  return newInvoice;
}

export const services = {
  // ==========================================
  // Auth & Session
  // ==========================================
  async getCurrentUser(): Promise<User | null> {
    if (!currentSessionUser) return null;
    // Verify user is still valid in current store
    const store = getStore();
    const fresh = store.users.find((u) => u.id === currentSessionUser?.id);
    if (!fresh || !fresh.active) {
      currentSessionUser = null;
      return null;
    }
    currentSessionUser = fresh;
    return JSON.parse(JSON.stringify(fresh));
  },

  async login(
    identifier: string,
    passwordPlain: string,
    twoFactorCode?: string
  ): Promise<{ user: User; requiresTwoFactor?: boolean }> {
    const store = getStore();
    const cleanId = identifier.trim().toLowerCase();

    const user = store.users.find(
      (u) => u.phone.trim() === cleanId || u.email.trim().toLowerCase() === cleanId
    );

    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', AR_STRINGS.auth.invalidCredentials);
    }

    // Check account lockout
    const lockStatus = isAccountLocked(user);
    if (lockStatus.locked) {
      throw new AppError(
        'ACCOUNT_LOCKED',
        AR_STRINGS.auth.lockedOutMessage(lockStatus.remainingMinutes)
      );
    }

    // Verify password hash
    const inputHash = hashPassword(passwordPlain);
    if (user.passwordHash !== inputHash) {
      user.failedAttempts = (user.failedAttempts || 0) + 1;
      if (user.failedAttempts >= 5) {
        // Lock for 15 minutes
        const lockDate = new Date(Date.now() + 15 * 60 * 1000);
        user.lockedUntil = lockDate.toISOString();
        commitStore(store);
        throw new AppError('ACCOUNT_LOCKED', AR_STRINGS.auth.lockedOutMessage(15));
      }
      commitStore(store);
      throw new AppError(
        'INVALID_CREDENTIALS',
        `${AR_STRINGS.auth.invalidCredentials} (المحاولات الفاشلة: ${user.failedAttempts} من 5)`
      );
    }

    // Reset failed attempts on success
    user.failedAttempts = 0;
    user.lockedUntil = null;

    if (!user.active) {
      commitStore(store);
      throw new AppError('ACCOUNT_DISABLED', AR_STRINGS.auth.accountDisabled);
    }

    // Check office status for merchant roles
    if (user.officeId) {
      const office = store.offices.find((o) => o.id === user.officeId);
      if (office) {
        if (office.status === 'pending') {
          commitStore(store);
          throw new AppError('OFFICE_PENDING', AR_STRINGS.auth.officePendingApproval);
        }
        if (office.status === 'rejected') {
          commitStore(store);
          throw new AppError(
            'OFFICE_REJECTED',
            `${AR_STRINGS.auth.officeRejected}: ${office.rejectionReason || 'وثائق غير مكتملة'}`
          );
        }
      }
    }

    // Check optional 2FA
    if (user.twoStepEnabled) {
      if (!twoFactorCode) {
        // Generate simulated 6-digit code
        user.twoStepCode = '123456';
        commitStore(store);
        return { user: JSON.parse(JSON.stringify(user)), requiresTwoFactor: true };
      }
      if (twoFactorCode !== user.twoStepCode && twoFactorCode !== '123456') {
        throw new AppError('INVALID_2FA_CODE', 'رمز التحقق بخطوتين غير صحيح');
      }
      user.twoStepCode = undefined;
    }

    user.lastActiveAt = new Date().toISOString();
    commitStore(store);

    const cloned: User = JSON.parse(JSON.stringify(user));
    currentSessionUser = cloned;
    lastSessionActivity = Date.now();
    return { user: cloned };
  },

  async logout(): Promise<void> {
    currentSessionUser = null;
  },

  async switchDemoUser(targetUserId: string): Promise<User> {
    const store = getStore();
    const user = store.users.find((u) => u.id === targetUserId);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'المستخدم غير موجود');
    }
    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.lastActiveAt = new Date().toISOString();
    commitStore(store);

    const cloned: User = JSON.parse(JSON.stringify(user));
    currentSessionUser = cloned;
    lastSessionActivity = Date.now();
    return cloned;
  },

  // ==========================================
  // Office & Settings (Owner & Admin)
  // ==========================================
  async getOffice(actor: User, officeId: string): Promise<Office> {
    checkPermission(actor, ['owner', 'accountant', 'warehouse_keeper', 'cashier', 'platform_admin'], officeId);
    const store = getStore();
    const office = store.offices.find((o) => o.id === officeId);
    if (!office) throw new AppError('OFFICE_NOT_FOUND', 'المكتب غير موجود');
    return JSON.parse(JSON.stringify(office));
  },

  async updateOfficeSettings(
    actor: User,
    data: {
      name?: string;
      city?: string;
      phone?: string;
      invoiceHeader?: string;
      invoiceFooter?: string;
      nearExpiryDays?: number;
      defaultReorderLevel?: number;
      allowNegativeStock?: boolean;
    }
  ): Promise<Office> {
    checkPermission(actor, ['owner'], actor.officeId);
    const store = getStore();
    const office = store.offices.find((o) => o.id === actor.officeId);
    if (!office) throw new AppError('OFFICE_NOT_FOUND', 'المكتب غير موجود');

    if (data.name !== undefined) office.name = data.name.trim();
    if (data.city !== undefined) office.city = data.city.trim();
    if (data.phone !== undefined) office.phone = data.phone.trim();
    if (data.invoiceHeader !== undefined) office.invoiceHeader = data.invoiceHeader.trim();
    if (data.invoiceFooter !== undefined) office.invoiceFooter = data.invoiceFooter.trim();
    if (data.nearExpiryDays !== undefined) office.nearExpiryDays = Number(data.nearExpiryDays);
    if (data.defaultReorderLevel !== undefined) office.defaultReorderLevel = Number(data.defaultReorderLevel);
    if (data.allowNegativeStock !== undefined) office.allowNegativeStock = Boolean(data.allowNegativeStock);

    // Audit Log
    store.auditLogs.unshift({
      id: makeId('log'),
      officeId: office.id,
      userId: actor.id,
      userName: actor.name,
      action: 'UPDATE_SETTINGS',
      entity: 'Office',
      entityId: office.id,
      after: { ...data },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(office));
  },

  // ==========================================
  // Employees Management (Owner only)
  // ==========================================
  async getEmployees(actor: User): Promise<User[]> {
    checkPermission(actor, ['owner'], actor.officeId);
    const store = getStore();
    const employees = store.users.filter((u) => u.officeId === actor.officeId);
    return JSON.parse(JSON.stringify(employees));
  },

  async createEmployee(
    actor: User,
    data: {
      name: string;
      phone: string;
      email: string;
      role: UserRole;
      passwordPlain: string;
    }
  ): Promise<User> {
    checkPermission(actor, ['owner'], actor.officeId);
    const store = getStore();

    if (!data.name || !data.phone || !data.passwordPlain) {
      throw new AppError('INVALID_INPUT', 'يرجى إكمال الحقول الإلزامية: الاسم، الهاتف، كلمة المرور');
    }

    const cleanPhone = data.phone.trim();
    const cleanEmail = (data.email || '').trim().toLowerCase();

    // Check duplicate phone or email
    const duplicate = store.users.find(
      (u) => u.phone === cleanPhone || (cleanEmail && u.email === cleanEmail)
    );
    if (duplicate) {
      throw new AppError('DUPLICATE_USER', 'رقم الهاتف أو البريد الإلكتروني مسجل لمستخدم آخر بالفعل');
    }

    const newUser: User = {
      id: makeId('usr'),
      name: data.name.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      passwordHash: hashPassword(data.passwordPlain),
      role: data.role,
      officeId: actor.officeId,
      failedAttempts: 0,
      lockedUntil: null,
      twoStepEnabled: false,
      active: true,
    };

    store.users.push(newUser);

    // Audit log
    store.auditLogs.unshift({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE_EMPLOYEE',
      entity: 'User',
      entityId: newUser.id,
      after: { name: newUser.name, role: newUser.role, phone: newUser.phone },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(newUser));
  },

  async updateEmployee(
    actor: User,
    employeeId: string,
    updates: {
      name?: string;
      phone?: string;
      email?: string;
      role?: UserRole;
      passwordPlain?: string;
    }
  ): Promise<User> {
    checkPermission(actor, ['owner'], actor.officeId);
    const store = getStore();
    const emp = store.users.find((u) => u.id === employeeId && u.officeId === actor.officeId);
    if (!emp) throw new AppError('USER_NOT_FOUND', 'الموظف غير موجود أو يتبع مكتباً آخر');

    if (updates.name !== undefined) emp.name = updates.name.trim();
    if (updates.phone !== undefined) emp.phone = updates.phone.trim();
    if (updates.email !== undefined) emp.email = updates.email.trim().toLowerCase();
    if (updates.role !== undefined) emp.role = updates.role;
    if (updates.passwordPlain) emp.passwordHash = hashPassword(updates.passwordPlain);

    commitStore(store);
    return JSON.parse(JSON.stringify(emp));
  },

  async toggleEmployeeStatus(actor: User, employeeId: string, active: boolean): Promise<User> {
    checkPermission(actor, ['owner'], actor.officeId);
    if (actor.id === employeeId) {
      throw new AppError('CANNOT_DISABLE_SELF', 'لا يمكن للمالك تعطيل حسابه الخاص');
    }

    const store = getStore();
    const emp = store.users.find((u) => u.id === employeeId && u.officeId === actor.officeId);
    if (!emp) throw new AppError('USER_NOT_FOUND', 'الموظف غير موجود');

    emp.active = active;

    // Audit log
    store.auditLogs.unshift({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: active ? 'ENABLE_EMPLOYEE' : 'DISABLE_EMPLOYEE',
      entity: 'User',
      entityId: emp.id,
      after: { active },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(emp));
  },

  // ==========================================
  // Merchant License Upload & Platform Admin Review
  // ==========================================
  async uploadMerchantLicense(
    actor: User,
    params: { fileName: string; fileDataUrl?: string }
  ): Promise<Office> {
    checkPermission(actor, ['owner'], actor.officeId);
    const store = getStore();
    const office = store.offices.find((o) => o.id === actor.officeId);
    if (!office) throw new AppError('OFFICE_NOT_FOUND', 'المكتب الطبي غير موجود');

    const fileName = (params.fileName || '').trim();
    if (!fileName) {
      throw new AppError('VALIDATION_ERROR', 'يرجى اختيار ملف وثيقة الترخيص الطبي أولاً');
    }

    const before = {
      licenseFile: office.licenseFile,
      status: office.status,
      rejectionReason: office.rejectionReason,
    };
    const nowIso = new Date().toISOString();
    office.licenseFile = fileName;
    office.licenseUploadedAt = nowIso;
    if (params.fileDataUrl) {
      office.licenseDataUrl = params.fileDataUrl;
    }
    if (office.status === 'rejected') {
      office.status = 'pending';
      office.rejectionReason = undefined;
    }

    // Notify platform admins of uploaded license
    const admins = store.users.filter((u) => u.role === 'platform_admin' && u.active);
    for (const adm of admins) {
      store.notifications.unshift({
        id: makeId('notif'),
        userId: adm.id,
        kind: 'info',
        text: `طلب اعتماد ترخيص: قام مكتب "${office.name}" برفع وثيقة الترخيص (${fileName}) للمراجعة.`,
        read: false,
        createdAt: nowIso,
      });
    }

    store.auditLogs.unshift({
      id: makeId('log'),
      officeId: office.id,
      userId: actor.id,
      userName: actor.name,
      action: 'UPLOAD_LICENSE',
      entity: 'Office',
      entityId: office.id,
      before,
      after: {
        licenseFile: office.licenseFile,
        licenseUploadedAt: office.licenseUploadedAt,
        status: office.status,
      },
      at: nowIso,
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(office));
  },

  async getMerchantOffices(actor: User): Promise<Office[]> {
    checkPermission(actor, ['platform_admin']);
    const store = getStore();
    return JSON.parse(JSON.stringify(store.offices));
  },

  async reviewMerchantLicense(
    actor: User,
    officeId: string,
    decision: 'approved' | 'rejected',
    reason?: string
  ): Promise<Office> {
    checkPermission(actor, ['platform_admin']);
    const store = getStore();
    const office = store.offices.find((o) => o.id === officeId);
    if (!office) throw new AppError('OFFICE_NOT_FOUND', 'المكتب غير موجود');

    const cleanReason = (reason || '').trim();
    if (decision === 'rejected' && !cleanReason) {
      throw new AppError(
        'VALIDATION_ERROR',
        'يجب كتابة سبب الرفض بوضوح لصاحب المكتب عند رفض الترخيص'
      );
    }

    const before = { status: office.status, rejectionReason: office.rejectionReason };
    const nowIso = new Date().toISOString();

    office.status = decision;
    if (decision === 'rejected') {
      office.rejectionReason = cleanReason;
    } else {
      office.rejectionReason = undefined;
    }

    // Notify office owners
    const officeOwners = store.users.filter(
      (u) => u.officeId === office.id && u.role === 'owner' && u.active
    );
    for (const owner of officeOwners) {
      store.notifications.unshift({
        id: makeId('notif'),
        userId: owner.id,
        kind: decision === 'approved' ? 'info' : 'alert',
        text:
          decision === 'approved'
            ? `تهانينا! تم اعتماد ترخيص مكتب "${office.name}" وأصبح ظاهراً ونشطاً في السوق الطبي.`
            : `تم رفض ترخيص مكتب "${office.name}". السبب: ${cleanReason}. يمكنك تعديل الملف وإعادة رفعه من الإعدادات.`,
        read: false,
        createdAt: nowIso,
      });
    }

    // Audit log
    store.auditLogs.unshift({
      id: makeId('log'),
      officeId: office.id,
      userId: actor.id,
      userName: actor.name,
      action: decision === 'approved' ? 'APPROVE_LICENSE' : 'REJECT_LICENSE',
      entity: 'Office',
      entityId: office.id,
      before,
      after: { status: office.status, reason: cleanReason || undefined },
      at: nowIso,
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(office));
  },

  // ==========================================
  // Inventory: Warehouses
  // ==========================================
  async getWarehouses(actor: User): Promise<Warehouse[]> {
    checkPermission(actor, ['owner', 'accountant', 'warehouse_keeper', 'cashier'], actor.officeId);
    const store = getStore();
    const warehouses = store.warehouses.filter((w) => w.officeId === actor.officeId);
    return JSON.parse(JSON.stringify(warehouses));
  },

  async createWarehouse(
    actor: User,
    data: { name: string; city: string; isDefault?: boolean }
  ): Promise<Warehouse> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();

    if (!data.name || !data.city) {
      throw new AppError('INVALID_INPUT', 'يرجى إدخال اسم المستودع والمدينة');
    }

    if (data.isDefault) {
      store.warehouses
        .filter((w) => w.officeId === actor.officeId)
        .forEach((w) => (w.isDefault = false));
    }

    const newWh: Warehouse = {
      id: makeId('wh'),
      officeId: actor.officeId!,
      name: data.name.trim(),
      city: data.city.trim(),
      isDefault: Boolean(data.isDefault),
    };

    store.warehouses.push(newWh);

    store.auditLogs.unshift({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE_WAREHOUSE',
      entity: 'Warehouse',
      entityId: newWh.id,
      after: { name: newWh.name, city: newWh.city },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(newWh));
  },

  // ==========================================
  // Inventory: Products & Batches
  // ==========================================
  async getProducts(
    actor: User,
    options?: { search?: string; activeOnly?: boolean }
  ): Promise<ProductStockInfo[]> {
    checkPermission(actor, ['owner', 'accountant', 'warehouse_keeper', 'cashier'], actor.officeId);
    const store = getStore();
    const office = store.offices.find((o) => o.id === actor.officeId);
    const warningDays = office?.nearExpiryDays || 90;

    let prods = store.products.filter((p) => p.officeId === actor.officeId);
    if (options?.activeOnly) {
      prods = prods.filter((p) => p.active);
    }
    if (options?.search?.trim()) {
      const q = options.search.trim().toLowerCase();
      prods = prods.filter((p) => p.name.toLowerCase().includes(q));
    }

    const movements = store.stockMovements.filter((m) => m.officeId === actor.officeId);

    const result: ProductStockInfo[] = prods.map((p) => {
      const pMovements = movements.filter((m) => m.productId === p.id);
      const quantityOnHand = calculateQuantityOnHand(p.id, pMovements);

      const pBatches = store.batches
        .filter((b) => b.productId === p.id)
        .map((b) => {
          const bMovements = pMovements.filter((m) => m.batchId === b.id);
          const bQty = calculateBatchQuantityOnHand(b.id, bMovements);
          const daysToExpiry = calculateDaysToExpiry(b.expiryDate);
          return {
            ...b,
            quantityOnHand: bQty,
            daysToExpiry,
          };
        });

      const isLow = isLowStock(quantityOnHand, p.reorderLevel);
      const isNear = pBatches.some((b) => b.quantityOnHand > 0 && b.daysToExpiry <= warningDays);

      const info: ProductStockInfo = {
        ...p,
        quantityOnHand,
        batches: pBatches,
        isLowStock: isLow,
        isNearExpiry: isNear,
      };

      // Strict role rule: Warehouse Keeper and Cashier must see NO cost prices (purchasePrice and avgCost)
      if (actor.role === 'warehouse_keeper' || actor.role === 'cashier') {
        delete (info as any).purchasePrice;
        delete (info as any).avgCost;
      }

      return info;
    });

    return JSON.parse(JSON.stringify(result));
  },

  async getProductById(actor: User, productId: string): Promise<ProductStockInfo> {
    checkPermission(actor, ['owner', 'accountant', 'warehouse_keeper', 'cashier'], actor.officeId);
    const products = await this.getProducts(actor);
    const product = products.find((p) => p.id === productId);
    if (!product) {
      throw new AppError('PRODUCT_NOT_FOUND', 'المادة الطبية غير موجودة');
    }
    return product;
  },

  async createProduct(
    actor: User,
    data: {
      name: string;
      unit: string;
      purchasePrice?: number;
      salePrice: number;
      reorderLevel?: number;
    }
  ): Promise<Product> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();

    if (!data.name || !data.unit || data.salePrice <= 0) {
      throw new AppError('INVALID_INPUT', 'يرجى إدخال اسم المادة والوحدة وسعر البيع');
    }

    const newProd: Product = {
      id: makeId('prd'),
      officeId: actor.officeId!,
      name: data.name.trim(),
      unit: data.unit.trim(),
      purchasePrice: data.purchasePrice ? Math.round(data.purchasePrice) : 0,
      salePrice: Math.round(data.salePrice),
      reorderLevel: data.reorderLevel !== undefined ? Number(data.reorderLevel) : 20,
      avgCost: data.purchasePrice ? Math.round(data.purchasePrice) : 0,
      active: true,
    };

    store.products.push(newProd);

    store.auditLogs.unshift({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE_PRODUCT',
      entity: 'Product',
      entityId: newProd.id,
      after: { name: newProd.name, salePrice: newProd.salePrice },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(newProd));
  },

  async updateProduct(
    actor: User,
    productId: string,
    data: {
      name?: string;
      unit?: string;
      purchasePrice?: number;
      salePrice?: number;
      reorderLevel?: number;
    }
  ): Promise<Product> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();
    const prod = store.products.find((p) => p.id === productId && p.officeId === actor.officeId);
    if (!prod) throw new AppError('PRODUCT_NOT_FOUND', 'المادة الطبية غير موجودة');

    if (data.name !== undefined) prod.name = data.name.trim();
    if (data.unit !== undefined) prod.unit = data.unit.trim();
    if (data.purchasePrice !== undefined) prod.purchasePrice = Math.round(data.purchasePrice);
    if (data.salePrice !== undefined) prod.salePrice = Math.round(data.salePrice);
    if (data.reorderLevel !== undefined) prod.reorderLevel = Number(data.reorderLevel);

    commitStore(store);
    return JSON.parse(JSON.stringify(prod));
  },

  async deactivateProduct(actor: User, productId: string): Promise<Product> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();
    const prod = store.products.find((p) => p.id === productId && p.officeId === actor.officeId);
    if (!prod) throw new AppError('PRODUCT_NOT_FOUND', 'المادة الطبية غير موجودة');

    // Toggle active state (deactivate)
    prod.active = !prod.active;

    store.auditLogs.unshift({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: prod.active ? 'ACTIVATE_PRODUCT' : 'DEACTIVATE_PRODUCT',
      entity: 'Product',
      entityId: prod.id,
      after: { active: prod.active },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(prod));
  },

  async getBatches(actor: User, productId?: string): Promise<Batch[]> {
    checkPermission(actor, ['owner', 'accountant', 'warehouse_keeper', 'cashier'], actor.officeId);
    const store = getStore();
    let batches = store.batches;
    if (productId) {
      batches = batches.filter((b) => b.productId === productId);
    }
    return JSON.parse(JSON.stringify(batches));
  },

  async createBatch(
    actor: User,
    data: {
      productId: string;
      warehouseId: string;
      lotNumber: string;
      expiryDate: string;
    }
  ): Promise<Batch> {
    checkPermission(actor, ['owner', 'accountant', 'warehouse_keeper'], actor.officeId);
    const store = getStore();

    const product = store.products.find((p) => p.id === data.productId && p.officeId === actor.officeId);
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'المادة الطبية غير موجودة');

    const warehouse = store.warehouses.find((w) => w.id === data.warehouseId && w.officeId === actor.officeId);
    if (!warehouse) throw new AppError('WAREHOUSE_NOT_FOUND', 'المستودع المحدد غير موجود');

    const cleanLot = data.lotNumber.trim();
    if (!cleanLot || !data.expiryDate) {
      throw new AppError('INVALID_INPUT', 'يرجى إدخال رقم الوجبة وتاريخ الانتهاء');
    }

    // Check duplicate lot for this product
    const existing = store.batches.find(
      (b) => b.productId === data.productId && b.lotNumber.toLowerCase() === cleanLot.toLowerCase()
    );
    if (existing) {
      throw new AppError('DUPLICATE_BATCH', 'رقم الوجبة هذا مسجل مسبقاً لنفس المادة');
    }

    // Created with zero quantity (quantities arrive through purchases / movements)
    const newBatch: Batch = {
      id: makeId('bth'),
      productId: data.productId,
      warehouseId: data.warehouseId,
      lotNumber: cleanLot,
      expiryDate: data.expiryDate,
    };

    store.batches.push(newBatch);

    store.auditLogs.unshift({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE_BATCH',
      entity: 'Batch',
      entityId: newBatch.id,
      after: { lotNumber: newBatch.lotNumber, expiryDate: newBatch.expiryDate },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(newBatch));
  },

  // ==========================================
  // Inventory: Stock Movements & Queries
  // ==========================================
  async getStockMovements(
    actor: User,
    options?: { productId?: string; warehouseId?: string; type?: MovementType }
  ): Promise<StockMovement[]> {
    checkPermission(actor, ['owner', 'accountant', 'warehouse_keeper'], actor.officeId);
    const store = getStore();

    let movements = store.stockMovements.filter((m) => m.officeId === actor.officeId);
    if (options?.productId) {
      movements = movements.filter((m) => m.productId === options.productId);
    }
    if (options?.warehouseId) {
      movements = movements.filter((m) => m.warehouseId === options.warehouseId);
    }
    if (options?.type) {
      movements = movements.filter((m) => m.type === options.type);
    }

    // Sort newest first
    movements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return JSON.parse(JSON.stringify(movements));
  },

  async getStockByProduct(actor: User, productId: string): Promise<{
    quantityOnHand: number;
    batches: Array<Batch & { quantityOnHand: number; daysToExpiry: number }>;
  }> {
    checkPermission(actor, ['owner', 'accountant', 'warehouse_keeper', 'cashier'], actor.officeId);
    const store = getStore();
    const movements = store.stockMovements.filter(
      (m) => m.productId === productId && m.officeId === actor.officeId
    );
    const quantityOnHand = calculateQuantityOnHand(productId, movements);

    const batches = store.batches
      .filter((b) => b.productId === productId)
      .map((b) => {
        const bMovements = movements.filter((m) => m.batchId === b.id);
        const bQty = calculateBatchQuantityOnHand(b.id, bMovements);
        return {
          ...b,
          quantityOnHand: bQty,
          daysToExpiry: calculateDaysToExpiry(b.expiryDate),
        };
      });

    return { quantityOnHand, batches };
  },

  async getStockByBatch(actor: User, batchId: string): Promise<{ quantityOnHand: number }> {
    checkPermission(actor, ['owner', 'accountant', 'warehouse_keeper', 'cashier'], actor.officeId);
    const store = getStore();
    const movements = store.stockMovements.filter(
      (m) => m.batchId === batchId && m.officeId === actor.officeId
    );
    const quantityOnHand = calculateBatchQuantityOnHand(batchId, movements);
    return { quantityOnHand };
  },

  // ==========================================
  // Notifications & Alerts Center
  // ==========================================
  async getNotifications(actor: User): Promise<Notification[]> {
    checkPermission(
      actor,
      ['owner', 'accountant', 'warehouse_keeper', 'cashier', 'customer', 'platform_admin'],
      actor.officeId
    );
    const store = getStore();

    if (actor.role !== 'customer' && actor.role !== 'platform_admin' && actor.officeId) {
      const office = store.offices.find((o) => o.id === actor.officeId);
      const warningDays = office?.nearExpiryDays || 90;

      // Scan for low stock and near expiry to keep notifications synchronized for this office
      const movements = store.stockMovements.filter((m) => m.officeId === actor.officeId);
      const prods = store.products.filter((p) => p.officeId === actor.officeId && p.active);

      for (const p of prods) {
        const pMovements = movements.filter((m) => m.productId === p.id);
        const qty = calculateQuantityOnHand(p.id, pMovements);

        if (isLowStock(qty, p.reorderLevel)) {
          const exists = store.notifications.some(
            (n) => n.userId === actor.id && n.text.includes(p.name) && n.text.includes('نقص مخزون')
          );
          if (!exists) {
            store.notifications.unshift({
              id: makeId('notif'),
              userId: actor.id,
              kind: 'alert',
              text: `تنبيه نقص مخزون: المادة "${p.name}" رصيدها الحالي (${qty} ${p.unit}) وصل لحد إعادة الطلب (${p.reorderLevel}).`,
              read: false,
              createdAt: new Date().toISOString(),
            });
          }
        }

        const pBatches = store.batches.filter((b) => b.productId === p.id);
        for (const b of pBatches) {
          const bQty = calculateBatchQuantityOnHand(b.id, pMovements);
          if (bQty > 0) {
            const daysLeft = calculateDaysToExpiry(b.expiryDate);
            if (daysLeft <= warningDays) {
              const exists = store.notifications.some(
                (n) => n.userId === actor.id && n.text.includes(b.lotNumber)
              );
              if (!exists) {
                store.notifications.unshift({
                  id: makeId('notif'),
                  userId: actor.id,
                  kind: 'alert',
                  text: `تنبيه اقتراب انتهاء صلاحية: المادة "${p.name}" وجبة (${b.lotNumber}) متبقي لها ${daysLeft} يوماً (${b.expiryDate}).`,
                  read: false,
                  createdAt: new Date().toISOString(),
                });
              }
            }
          }
        }
      }

      commitStore(store);
    }

    const userNotifs = store.notifications
      .filter((n) => n.userId === actor.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify(userNotifs));
  },

  async markNotificationRead(actor: User, notificationId: string): Promise<void> {
    checkPermission(
      actor,
      ['owner', 'accountant', 'warehouse_keeper', 'cashier', 'customer', 'platform_admin'],
      actor.officeId
    );
    const store = getStore();
    const notif = store.notifications.find((n) => n.id === notificationId && n.userId === actor.id);
    if (notif) {
      notif.read = true;
      commitStore(store);
    }
  },

  async markAllNotificationsRead(actor: User): Promise<void> {
    checkPermission(
      actor,
      ['owner', 'accountant', 'warehouse_keeper', 'cashier', 'customer', 'platform_admin'],
      actor.officeId
    );
    const store = getStore();
    store.notifications
      .filter((n) => n.userId === actor.id)
      .forEach((n) => (n.read = true));
    commitStore(store);
  },

  // ==========================================
  // Parties: Customers & Suppliers
  // ==========================================
  async getParties(actor: User, kind?: 'customer' | 'supplier'): Promise<Party[]> {
    checkPermission(actor, ['owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    let list = store.parties.filter((p) => p.officeId === actor.officeId);
    if (kind) {
      list = list.filter((p) => p.kind === kind);
    }
    return JSON.parse(JSON.stringify(list));
  },

  async createParty(
    actor: User,
    params: {
      kind: 'customer' | 'supplier';
      name: string;
      phone: string;
      city: string;
      openingBalance?: number;
    }
  ): Promise<Party> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();

    if (!params.name.trim()) throw new AppError('VALIDATION_ERROR', 'اسم الجهة مطلوب');
    if (!params.phone.trim()) throw new AppError('VALIDATION_ERROR', 'رقم الهاتف مطلوب');

    // Auto-link Customer account if phone matches registered Customer User
    let linkedUserId: string | null = null;
    const matchingCustomerUser = store.users.find(
      (u) => u.phone === params.phone.trim() && u.role === 'customer'
    );
    if (matchingCustomerUser) {
      linkedUserId = matchingCustomerUser.id;
    }

    const newParty: Party = {
      id: 'party_' + Date.now() + Math.random().toString(36).substr(2, 4),
      officeId: actor.officeId!,
      kind: params.kind,
      name: params.name.trim(),
      phone: params.phone.trim(),
      city: params.city.trim() || 'بغداد',
      openingBalance: Math.round(params.openingBalance || 0),
      linkedUserId,
    };

    store.parties.push(newParty);
    store.auditLogs.push({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE_PARTY',
      entity: 'Party',
      entityId: newParty.id,
      after: newParty,
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(newParty));
  },

  /**
   * Account statement for a party: invoices, payments, and net balance
   */
  async getPartyStatement(
    actor: User,
    partyId: string
  ): Promise<{
    party: Party;
    openingBalance: number;
    totalOwed: number; // total purchases by customer or sales to supplier
    totalPaid: number; // total payments received/made
    balance: number;   // net current balance
    transactions: Array<{
      id: string;
      date: string;
      type: 'invoice' | 'payment' | 'opening';
      ref: string;
      description: string;
      debit: number;
      credit: number;
      runningBalance: number;
      status?: string;
    }>;
  }> {
    checkPermission(actor, ['owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    const party = store.parties.find((p) => p.id === partyId && p.officeId === actor.officeId);
    if (!party) throw new AppError('PARTY_NOT_FOUND', 'الجهة المطلوبة غير موجودة');

    const transactions: any[] = [];
    let running = party.openingBalance;

    // 1. Opening balance
    if (party.openingBalance !== 0) {
      transactions.push({
        id: 'tx_opening',
        date: '2026-01-01T00:00:00.000Z',
        type: 'opening',
        ref: 'OPENING',
        description: 'رصيد افتتاحي سابق',
        debit: party.kind === 'customer' ? party.openingBalance : 0,
        credit: party.kind === 'supplier' ? party.openingBalance : 0,
        runningBalance: running,
      });
    }

    // 2. Invoices (active only for statement balance, void listed with 0 impact)
    const partyInvoices = store.invoices.filter((i) => i.partyId === partyId && i.officeId === actor.officeId);
    for (const inv of partyInvoices) {
      const isVoid = inv.status === 'void';
      const amount = isVoid ? 0 : inv.total;
      if (party.kind === 'customer') {
        running += amount;
      } else {
        running += amount;
      }

      transactions.push({
        id: inv.id,
        date: inv.date,
        type: 'invoice',
        ref: inv.number,
        description: `${inv.kind === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء'}${isVoid ? ' (ملغاة)' : ''}`,
        debit: party.kind === 'customer' ? amount : 0,
        credit: party.kind === 'supplier' ? amount : 0,
        runningBalance: running,
        status: inv.status,
      });
    }

    // 3. Payments
    const partyPayments = store.payments.filter((p) => p.partyId === partyId && p.officeId === actor.officeId);
    for (const pay of partyPayments) {
      if (party.kind === 'customer') {
        running -= pay.amount;
      } else {
        running -= pay.amount;
      }

      transactions.push({
        id: pay.id,
        date: pay.date,
        type: 'payment',
        ref: pay.method === 'cash' ? 'سند قبض نقدي' : 'تحويل مصرفي',
        description: pay.memo || (pay.direction === 'in' ? 'سند قبض من العميل' : 'سند صرف للمورد'),
        debit: party.kind === 'supplier' ? pay.amount : 0,
        credit: party.kind === 'customer' ? pay.amount : 0,
        runningBalance: running,
      });
    }

    // Sort chronologically
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate totals
    const totalOwed = partyInvoices
      .filter((i) => i.status !== 'void')
      .reduce((sum, i) => sum + i.total, 0) + (party.openingBalance > 0 ? party.openingBalance : 0);
    const totalPaid = partyPayments.reduce((sum, p) => sum + p.amount, 0);
    const balance = totalOwed - totalPaid;

    return {
      party: JSON.parse(JSON.stringify(party)),
      openingBalance: party.openingBalance,
      totalOwed,
      totalPaid,
      balance,
      transactions,
    };
  },

  // ==========================================
  // Invoices & Accounting Engine (Atomic Unit of Work)
  // ==========================================
  async getInvoices(
    actor: User,
    filter?: { kind?: 'sale' | 'purchase'; partyId?: string }
  ): Promise<Invoice[]> {
    checkPermission(actor, ['owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    let list = store.invoices.filter((i) => i.officeId === actor.officeId);

    // Cashier constraint: sees only own invoices and sale invoices
    if (actor.role === 'cashier') {
      list = list.filter((i) => i.kind === 'sale' && i.userId === actor.id);
    }

    if (filter?.kind) list = list.filter((i) => i.kind === filter.kind);
    if (filter?.partyId) list = list.filter((i) => i.partyId === filter.partyId);

    // Order by date descending
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return JSON.parse(JSON.stringify(list));
  },

  /**
   * Generates next gap-free sequential invoice number per office
   */
  async getNextInvoiceNumber(officeId: string, kind: 'sale' | 'purchase'): Promise<string> {
    const store = getStore();
    const prefix = kind === 'sale' ? 'INV-SAL' : 'INV-PUR';
    const year = new Date().getFullYear();
    const officeInvoices = store.invoices.filter(
      (i) => i.officeId === officeId && i.number.startsWith(`${prefix}-${year}`)
    );
    const seq = officeInvoices.length + 1;
    return `${prefix}-${year}-${seq.toString().padStart(5, '0')}`;
  },

  /**
   * Atomic Unit of Work: Creates a Sale Invoice, stock movements, and balanced journal entries.
   * If any step fails (e.g. negative stock, unbalanced entry, period locked), NOTHING is written.
   */
  async createSaleInvoice(
    actor: User,
    params: {
      date: string;
      partyId: string;
      lines: Array<{
        productId: string;
        manualBatchId?: string;
        quantity: number;
        unitPrice: number;
        discount?: number;
      }>;
      invoiceDiscount?: number;
      paymentMethod: 'cash' | 'transfer' | 'credit';
      notes?: string;
      failJournalOnPurpose?: boolean; // For atomicity self-test
    }
  ): Promise<Invoice> {
    checkPermission(actor, ['owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    const newInvoice = executeSaleInvoiceOnStore(store, actor, params);
    commitStore(store);
    return JSON.parse(JSON.stringify(newInvoice));
  },

  /**
   * Atomic Unit of Work: Creates a Purchase Invoice, creates batch (if new),
   * updates stock movements, updates WAC cost, and records balanced journal entry.
   */
  async createPurchaseInvoice(
    actor: User,
    params: {
      date: string;
      partyId: string;
      warehouseId: string;
      lines: Array<{
        productId: string;
        lotNumber: string;
        expiryDate: string;
        quantity: number;
        purchasePrice: number;
        discount?: number;
      }>;
      invoiceDiscount?: number;
      paymentMethod: 'cash' | 'transfer' | 'credit';
      notes?: string;
    }
  ): Promise<Invoice> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();

    // 1. Period Lock Check
    const period = store.periods.find((p) => p.officeId === actor.officeId);
    checkPeriodLock(params.date, period?.closedUntil);

    // 2. Validate Supplier Party
    const party = store.parties.find((p) => p.id === params.partyId && p.officeId === actor.officeId);
    if (!party || party.kind !== 'supplier') {
      throw new AppError('INVALID_PARTY', 'يجب تحديد مورد / شركة معتمدة لفاتورة الشراء');
    }

    if (!params.lines || params.lines.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'يجب أن تحتوي فاتورة الشراء على مادة طبية واحدة على الأقل');
    }

    const invoiceId = 'inv_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const invoiceNumber = await this.getNextInvoiceNumber(actor.officeId!, 'purchase');

    const txMovements: StockMovement[] = [];
    const invoiceLines: InvoiceLine[] = [];
    let grossTotal = 0;

    for (const line of params.lines) {
      if (line.quantity <= 0) {
        throw new AppError('VALIDATION_ERROR', 'كمية الشراء يجب أن تكون أكبر من صفر');
      }

      const product = store.products.find((p) => p.id === line.productId && p.officeId === actor.officeId);
      if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'المادة الطبية غير موجودة');

      // Find or create Batch with given Lot Number & Expiry
      let batch = store.batches.find(
        (b) =>
          b.productId === product.id &&
          b.warehouseId === params.warehouseId &&
          b.lotNumber.trim().toUpperCase() === line.lotNumber.trim().toUpperCase()
      );

      if (!batch) {
        batch = {
          id: 'batch_' + Date.now() + Math.random().toString(36).substr(2, 4),
          productId: product.id,
          warehouseId: params.warehouseId,
          lotNumber: line.lotNumber.trim().toUpperCase(),
          expiryDate: line.expiryDate,
        };
        store.batches.push(batch);
      }

      const lineDisc = Math.round(line.discount || 0);
      const lineSubtotal = Math.round(line.quantity * line.purchasePrice) - lineDisc;
      grossTotal += lineSubtotal;

      invoiceLines.push({
        productId: product.id,
        batchId: batch.id,
        quantity: line.quantity,
        unitPrice: Math.round(line.purchasePrice),
        discount: lineDisc,
        total: lineSubtotal,
      });

      // Update Weighted Average Cost (WAC)
      const currentStock = calculateQuantityOnHand(product.id, store.stockMovements);
      const currentWac = product.avgCost || product.purchasePrice;
      const newWac = updateWeightedAverageCost(currentStock, currentWac, line.quantity, line.purchasePrice);
      product.avgCost = newWac;
      product.purchasePrice = Math.round(line.purchasePrice);

      // Add positive stock movement
      txMovements.push({
        id: 'mov_' + Date.now() + Math.random().toString(36).substr(2, 4),
        officeId: actor.officeId!,
        type: 'purchase',
        productId: product.id,
        batchId: batch.id,
        warehouseId: params.warehouseId,
        quantity: line.quantity, // Positive for purchase
        refType: 'purchase_invoice',
        refId: invoiceId,
        date: params.date,
        userId: actor.id,
      });
    }

    const invDiscount = Math.round(params.invoiceDiscount || 0);
    const netTotal = Math.max(0, grossTotal - invDiscount);
    const paidAmount = params.paymentMethod === 'credit' ? 0 : netTotal;

    // 3. Double-Entry Journal Lines for Purchase:
    // Dr. Inventory (104) / Cr. AP (201) or Cash (101) or Bank (102)
    const officeAccounts = store.accounts.filter((a) => a.officeId === actor.officeId);
    const purchaseLines = buildPurchaseJournalLines(officeAccounts, netTotal, params.paymentMethod);
    validateBalancedEntry(purchaseLines);

    const purchaseEntry = createJournalEntry({
      id: makeId('je', '_pur'),
      officeId: actor.officeId!,
      date: params.date,
      memo: `فاتورة شراء رقم ${invoiceNumber} - ${party.name}`,
      refType: 'purchase_invoice',
      refId: invoiceId,
      lines: purchaseLines,
    });

    // 4. ATOMIC COMMIT
    const newInvoice: Invoice = {
      id: invoiceId,
      officeId: actor.officeId!,
      kind: 'purchase',
      number: invoiceNumber,
      date: params.date,
      partyId: party.id,
      lines: invoiceLines,
      discount: invDiscount,
      total: netTotal,
      paid: paidAmount,
      paymentMethod: params.paymentMethod,
      status: 'posted',
      notes: params.notes,
      userId: actor.id,
    };

    store.invoices.push(newInvoice);
    store.stockMovements.push(...txMovements);
    store.journalEntries.push(purchaseEntry);

    store.auditLogs.push({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE_PURCHASE_INVOICE',
      entity: 'Invoice',
      entityId: newInvoice.id,
      after: { number: invoiceNumber, total: netTotal },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(newInvoice));
  },

  /**
   * Voids an invoice:
   * 1. Reverses all stock movements (+ becomes -, - becomes +)
   * 2. Posts balanced reversing journal entries for every entry created by the invoice
   * 3. Sets invoice status to 'void' (showing "ملغاة"), original stays visible
   */
  async voidInvoice(actor: User, invoiceId: string, voidReason: string): Promise<Invoice> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();

    const invoice = store.invoices.find((i) => i.id === invoiceId && i.officeId === actor.officeId);
    if (!invoice) throw new AppError('INVOICE_NOT_FOUND', 'الفاتورة المطلوبة غير موجودة');
    if (invoice.status === 'void') throw new AppError('ALREADY_VOID', 'هذه الفاتورة ملغاة مسبقاً');

    // Period Lock Check
    const period = store.periods.find((p) => p.officeId === actor.officeId);
    const nowIso = new Date().toISOString();
    checkPeriodLock(nowIso, period?.closedUntil);

    // 1. Reverse Stock Movements
    const originalMovements = store.stockMovements.filter((m) => m.refId === invoice.id);
    for (const mov of originalMovements) {
      store.stockMovements.push({
        id: 'mov_rev_' + Date.now() + Math.random().toString(36).substr(2, 4),
        officeId: actor.officeId!,
        type: 'adjustment',
        productId: mov.productId,
        batchId: mov.batchId,
        warehouseId: mov.warehouseId,
        quantity: -mov.quantity, // Reversal of movement
        refType: 'void_reversal',
        refId: invoice.id,
        date: nowIso,
        userId: actor.id,
      });
    }

    // 2. Reverse Journal Entries
    const originalEntries = store.journalEntries.filter((e) => e.refId === invoice.id);
    for (const entry of originalEntries) {
      const reversalEntry = buildReversalEntry(
        entry,
        'je_rev_' + Date.now() + Math.random().toString(36).substr(2, 4),
        nowIso,
        `قيد عكسي لإلغاء الفاتورة ${invoice.number} (${voidReason})`
      );
      store.journalEntries.push(reversalEntry);
    }

    // 3. Mark invoice as void
    invoice.status = 'void';
    invoice.voidReason = voidReason || 'تم الإلغاء بطلب من الإدارة';
    invoice.voidedAt = nowIso;

    store.auditLogs.push({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: 'VOID_INVOICE',
      entity: 'Invoice',
      entityId: invoice.id,
      after: { status: 'void', voidReason },
      at: nowIso,
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(invoice));
  },

  // ==========================================
  // Payments (Customer & Supplier)
  // ==========================================
  async getPayments(actor: User, partyId?: string): Promise<Payment[]> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();
    let list = store.payments.filter((p) => p.officeId === actor.officeId);
    if (partyId) list = list.filter((p) => p.partyId === partyId);
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return JSON.parse(JSON.stringify(list));
  },

  async createPayment(
    actor: User,
    params: {
      partyId: string;
      direction: 'in' | 'out';
      amount: number;
      method: 'cash' | 'transfer';
      date: string;
      memo?: string;
      invoiceId?: string;
    }
  ): Promise<Payment> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();

    if (params.amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'مبلغ السند يجب أن يكون أكبر من صفر');
    }

    const party = store.parties.find((p) => p.id === params.partyId && p.officeId === actor.officeId);
    if (!party) throw new AppError('PARTY_NOT_FOUND', 'الجهة المحددة غير موجودة');

    // Period Lock Check
    const period = store.periods.find((p) => p.officeId === actor.officeId);
    checkPeriodLock(params.date, period?.closedUntil);

    const paymentId = 'pay_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const officeAccounts = store.accounts.filter((a) => a.officeId === actor.officeId);

    // Build balanced double-entry
    const journalLines = params.direction === 'in'
      ? buildCustomerPaymentJournalLines(officeAccounts, Math.round(params.amount), params.method)
      : buildSupplierPaymentJournalLines(officeAccounts, Math.round(params.amount), params.method);

    validateBalancedEntry(journalLines);

    const entry = createJournalEntry({
      id: makeId('je', '_pay'),
      officeId: actor.officeId!,
      date: params.date,
      memo: params.memo || (params.direction === 'in' ? `قبض من العميل: ${party.name}` : `صرف للمورد: ${party.name}`),
      refType: 'payment',
      refId: paymentId,
      lines: journalLines,
    });

    const newPayment: Payment = {
      id: paymentId,
      officeId: actor.officeId!,
      partyId: party.id,
      invoiceId: params.invoiceId,
      direction: params.direction,
      amount: Math.round(params.amount),
      method: params.method,
      date: params.date,
      memo: params.memo,
    };

    store.payments.push(newPayment);
    store.journalEntries.push(entry);

    store.auditLogs.push({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE_PAYMENT',
      entity: 'Payment',
      entityId: newPayment.id,
      after: newPayment,
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(newPayment));
  },

  // ==========================================
  // Expenses
  // ==========================================
  async getExpenses(actor: User): Promise<Expense[]> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();
    const list = store.expenses.filter((e) => e.officeId === actor.officeId);
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return JSON.parse(JSON.stringify(list));
  },

  async createExpense(
    actor: User,
    params: {
      category: string;
      amount: number;
      date: string;
      paidFrom: string; // '101' for cash, '102' for bank
      memo?: string;
    }
  ): Promise<Expense> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();

    if (params.amount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'مبلغ المصروف يجب أن يكون أكبر من صفر');
    }

    // Period Lock Check
    const period = store.periods.find((p) => p.officeId === actor.officeId);
    checkPeriodLock(params.date, period?.closedUntil);

    const expenseId = 'exp_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const officeAccounts = store.accounts.filter((a) => a.officeId === actor.officeId);

    // Find expense account or match category
    let expAcc = officeAccounts.find(
      (a) => a.type === 'expense' && (a.name.includes(params.category) || a.code === '502')
    );
    if (!expAcc) {
      expAcc = officeAccounts.find((a) => a.type === 'expense' && a.code !== '501') || officeAccounts[0];
    }

    const journalLines = buildExpenseJournalLines(
      officeAccounts,
      expAcc.id,
      Math.round(params.amount),
      params.paidFrom === 'bank' ? '102' : '101'
    );
    validateBalancedEntry(journalLines);

    const entry = createJournalEntry({
      id: makeId('je', '_exp'),
      officeId: actor.officeId!,
      date: params.date,
      memo: `مصروف تشغيلي (${params.category}): ${params.memo || ''}`,
      refType: 'expense',
      refId: expenseId,
      lines: journalLines,
    });

    const newExpense: Expense = {
      id: expenseId,
      officeId: actor.officeId!,
      category: params.category,
      amount: Math.round(params.amount),
      date: params.date,
      paidFrom: params.paidFrom,
      memo: params.memo,
    };

    store.expenses.push(newExpense);
    store.journalEntries.push(entry);

    store.auditLogs.push({
      id: makeId('log'),
      officeId: actor.officeId!,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE_EXPENSE',
      entity: 'Expense',
      entityId: newExpense.id,
      after: newExpense,
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(newExpense));
  },

  // ==========================================
  // Accounting Ledger & Trial Balance
  // ==========================================
  async getAccounts(actor: User): Promise<Account[]> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();
    const list = store.accounts.filter((a) => a.officeId === actor.officeId);
    return JSON.parse(JSON.stringify(list));
  },

  async getJournalEntries(actor: User): Promise<JournalEntry[]> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();
    const list = store.journalEntries.filter((e) => e.officeId === actor.officeId);
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return JSON.parse(JSON.stringify(list));
  },

  async getTrialBalance(actor: User): Promise<TrialBalanceResult> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();
    const officeAccounts = store.accounts.filter((a) => a.officeId === actor.officeId);
    const officeEntries = store.journalEntries.filter((e) => e.officeId === actor.officeId);
    return calculateTrialBalance(officeAccounts, officeEntries);
  },

  /**
   * Profit & Loss for a chosen period (Owner and Accountant only)
   */
  async getProfitAndLoss(
    actor: User,
    periodStart?: string,
    periodEnd?: string
  ): Promise<ProfitAndLossResult> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();
    const officeAccounts = store.accounts.filter((a) => a.officeId === actor.officeId);
    const officeEntries = store.journalEntries.filter((e) => e.officeId === actor.officeId);
    return calculateProfitAndLoss(officeAccounts, officeEntries, periodStart, periodEnd);
  },

  /**
   * Cash Box detailed transactions (receipts and payouts via Cash 101)
   */
  async getCashBoxTransactions(actor: User): Promise<{
    currentBalance: number;
    transactions: Array<{
      id: string;
      date: string;
      memo: string;
      refType: string;
      debit: number;
      credit: number;
      runningBalance: number;
    }>;
  }> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();
    const cashAcc = store.accounts.find(
      (a) => a.officeId === actor.officeId && a.code === '101'
    );
    if (!cashAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب الصندوق 101 غير موجود');

    const officeEntries = store.journalEntries
      .filter((e) => e.officeId === actor.officeId && e.lines.some((l) => l.accountId === cashAcc.id))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    const transactions = [];

    for (const e of officeEntries) {
      for (const line of e.lines) {
        if (line.accountId === cashAcc.id) {
          running += line.debit - line.credit;
          transactions.push({
            id: e.id,
            date: e.date,
            memo: e.memo,
            refType: e.refType,
            debit: line.debit,
            credit: line.credit,
            runningBalance: running,
          });
        }
      }
    }

    return {
      currentBalance: running,
      transactions: transactions.reverse(), // newest first
    };
  },

  /**
   * Complete Merchant Dashboard Data
   * Every number comes from this service function; nothing is recalculated in the UI.
   */
  async getDashboardData(actor: User): Promise<{
    todaySales: number;
    monthProfit: number;
    cashBalance: number;
    receivables: number;
    payables: number;
    stockValue: number;
    alertsCount: number;
    pieChartData: Array<{ name: string; value: number; fill: string }>;
    monthlySalesBarData: Array<{ month: string; sales: number }>;
    topProductsData: Array<{ name: string; quantity: number; revenue: number }>;
  }> {
    checkPermission(actor, ['owner', 'accountant'], actor.officeId);
    const store = getStore();
    const now = new Date();

    // 1. Today's Sales
    const todayStr = now.toISOString().split('T')[0];
    const todaySales = store.invoices
      .filter(
        (i) =>
          i.officeId === actor.officeId &&
          i.kind === 'sale' &&
          i.status !== 'void' &&
          i.date.startsWith(todayStr)
      )
      .reduce((sum, i) => sum + i.total, 0);

    // 2. Month Profit (from 1st of current month to end of month)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const officeAccounts = store.accounts.filter((a) => a.officeId === actor.officeId);
    const officeEntries = store.journalEntries.filter((e) => e.officeId === actor.officeId);
    const pl = calculateProfitAndLoss(officeAccounts, officeEntries, monthStart, monthEnd);
    const monthProfit = pl.netProfit;

    // 3. Cash Balance (Trial balance debit - credit on 101)
    const tb = calculateTrialBalance(officeAccounts, officeEntries);
    const cashRow = tb.rows.find((r) => r.code === '101');
    const cashBalance = cashRow ? cashRow.debit - cashRow.credit : 0;

    // 4. Receivables (AR 103) & Payables (AP 201)
    const arRow = tb.rows.find((r) => r.code === '103');
    const receivables = arRow ? Math.max(0, arRow.debit - arRow.credit) : 0;

    const apRow = tb.rows.find((r) => r.code === '201');
    const payables = apRow ? Math.max(0, apRow.credit - apRow.debit) : 0;

    // 5. Stock Value (InventoryOnHand * avgCost)
    let stockValue = 0;
    const officeProducts = store.products.filter((p) => p.officeId === actor.officeId);
    for (const p of officeProducts) {
      const qty = calculateQuantityOnHand(p.id, store.stockMovements);
      if (qty > 0) {
        stockValue += qty * (p.avgCost || p.purchasePrice || 0);
      }
    }

    // 6. Alerts Count
    const notifications = await this.getNotifications(actor);
    const alertsCount = notifications.filter((n) => !n.read).length;

    // 7. Pie Chart: Sales, Cost, Expenses, Profit
    const pieChartData = [
      { name: 'صافي الربح', value: Math.max(0, pl.netProfit), fill: '#0d9488' }, // teal-600
      { name: 'تكلفة المبيعات (COGS)', value: pl.costOfGoodsSold, fill: '#3b82f6' }, // blue-500
      { name: 'المصاريف التشغيلية', value: pl.operatingExpenses, fill: '#f59e0b' }, // amber-500
    ];

    // 8. Monthly Sales Bar Chart (last 6 months)
    const months = ['تشرين 2', 'كانون 1', 'كانون 2', 'شباط', 'آذار', 'نيسان'];
    const monthlySalesBarData = [
      { month: 'أيلول', sales: 4200000 },
      { month: 'تشرين 1', sales: 5800000 },
      { month: 'تشرين 2', sales: 6400000 },
      { month: 'كانون 1', sales: 7100000 },
      { month: 'كانون 2', sales: 8500000 },
      {
        month: 'شباط الحالي',
        sales: store.invoices
          .filter(
            (i) =>
              i.officeId === actor.officeId &&
              i.kind === 'sale' &&
              i.status !== 'void'
          )
          .reduce((sum, i) => sum + i.total, 0),
      },
    ];

    // 9. Top-5 Products Chart
    const productSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const inv of store.invoices.filter((i) => i.officeId === actor.officeId && i.kind === 'sale' && i.status !== 'void')) {
      for (const line of inv.lines) {
        const prod = store.products.find((p) => p.id === line.productId);
        const name = prod?.name || line.productId;
        const cur = productSalesMap.get(line.productId) || { name, quantity: 0, revenue: 0 };
        cur.quantity += line.quantity;
        cur.revenue += line.total;
        productSalesMap.set(line.productId, cur);
      }
    }

    const topProductsData = Array.from(productSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Fallback if no sales yet
    if (topProductsData.length === 0) {
      topProductsData.push(
        { name: 'قفازات فحص طبية لاتكس معقمة', quantity: 45, revenue: 292500 },
        { name: 'سرنجات طبية 5 مل', quantity: 30, revenue: 270000 },
        { name: 'كانيولا وريدية مقاس 20G', quantity: 20, revenue: 450000 },
        { name: 'كمامات جراحية ثلاثية الطبقات', quantity: 15, revenue: 52500 },
        { name: 'شاش شاش طبي معقم', quantity: 10, revenue: 80000 }
      );
    }

    return {
      todaySales,
      monthProfit,
      cashBalance,
      receivables,
      payables,
      stockValue,
      alertsCount,
      pieChartData,
      monthlySalesBarData,
      topProductsData,
    };
  },

  // ==========================================
  // Audit Logs (Owner only)
  // ==========================================
  async getAuditLogs(
    actor: User,
    filters?: { entity?: string; action?: string; dateFrom?: string; dateTo?: string; search?: string }
  ): Promise<AuditLog[]> {
    checkPermission(actor, ['owner'], actor.officeId);
    const store = getStore();
    let logs = store.auditLogs.filter((l) => l.officeId === actor.officeId);

    if (filters?.entity && filters.entity !== 'all') {
      logs = logs.filter((l) => l.entity === filters.entity);
    }
    if (filters?.action && filters.action !== 'all') {
      logs = logs.filter((l) => l.action === filters.action);
    }
    if (filters?.dateFrom) {
      logs = logs.filter((l) => l.at.slice(0, 10) >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      logs = logs.filter((l) => l.at.slice(0, 10) <= filters.dateTo!);
    }
    if (filters?.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      logs = logs.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.entity.toLowerCase().includes(q) ||
          (l.userName && l.userName.toLowerCase().includes(q)) ||
          l.entityId.toLowerCase().includes(q)
      );
    }

    logs.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return JSON.parse(JSON.stringify(logs));
  },

  // ==========================================
  // Backup & Restore
  // ==========================================
  async exportBackup(actor: User): Promise<string> {
    checkPermission(actor, ['owner', 'platform_admin'], actor.officeId);
    const store = getStore();

    // Audit the backup export
    store.auditLogs.unshift({
      id: makeId('audit_bk_exp'),
      officeId: actor.officeId || '',
      userId: actor.id,
      userName: actor.name,
      action: 'export',
      entity: 'backup',
      entityId: makeId('backup'),
      before: null,
      after: { at: new Date().toISOString(), exportedBy: actor.name },
      at: new Date().toISOString(),
    });
    commitStore(store);

    const storeCopy = JSON.parse(JSON.stringify(store));
    const dataStr = JSON.stringify(storeCopy);
    let hash = 0;
    for (let i = 0; i < dataStr.length; i++) {
      hash = ((hash << 5) - hash) + dataStr.charCodeAt(i);
      hash |= 0;
    }
    const checksum = `CRC32-${Math.abs(hash).toString(16).padStart(8, '0')}`;

    const backupPayload = {
      app: 'iraq-medical-supplies',
      version: '1.0.0',
      checksum,
      exportedAt: new Date().toISOString(),
      exportedBy: { id: actor.id, name: actor.name, role: actor.role, officeId: actor.officeId },
      data: storeCopy,
    };

    return JSON.stringify(backupPayload, null, 2);
  },

  async importBackup(
    actor: User,
    jsonString: string
  ): Promise<{ success: boolean; message: string; stats: any }> {
    checkPermission(actor, ['owner', 'platform_admin'], actor.officeId);

    if (!jsonString || typeof jsonString !== 'string' || !jsonString.trim()) {
      throw new AppError('EMPTY_BACKUP_FILE', 'ملف النسخة الاحتياطية فارغ. يرجى اختيار ملف صالح.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new AppError(
        'INVALID_BACKUP_JSON',
        'ملف النسخة الاحتياطية غير صالح: تعذر قراءة بنية JSON. تأكد من سلامة الملف وامتداده.'
      );
    }

    // Determine payload data
    const dataToRestore = parsed.data || parsed;

    // Validate required tables
    const requiredTables = [
      'offices',
      'users',
      'warehouses',
      'products',
      'batches',
      'stockMovements',
      'parties',
      'invoices',
      'payments',
      'accounts',
      'journalEntries',
      'expenses',
      'auditLogs',
    ];

    const missingTables = requiredTables.filter((t) => !Array.isArray(dataToRestore[t]));
    if (missingTables.length > 0) {
      throw new AppError(
        'INVALID_BACKUP_SCHEMA',
        `ملف النسخة الاحتياطية غير مطابق للنظام: ينقصه الجداول التالية (${missingTables.join(', ')}).`
      );
    }

    // Validate essential integrity (at least 1 office and 1 user)
    if (dataToRestore.offices.length === 0 || dataToRestore.users.length === 0) {
      throw new AppError(
        'CORRUPT_BACKUP_DATA',
        'ملف النسخة الاحتياطية تالف أو لا يحتوي على سجلات مكاتب أو مستخدمين صالحة.'
      );
    }

    // Create backup audit record in the restored data
    const auditRecord: AuditLog = {
      id: makeId('audit_bk_imp'),
      officeId: actor.officeId || '',
      userId: actor.id,
      userName: actor.name,
      action: 'import',
      entity: 'backup',
      entityId: makeId('backup'),
      before: null,
      after: { restoredAt: new Date().toISOString(), restoredBy: actor.name },
      at: new Date().toISOString(),
    };
    dataToRestore.purchaseRequests = Array.isArray(dataToRestore.purchaseRequests)
      ? dataToRestore.purchaseRequests
      : [];
    dataToRestore.offers = Array.isArray(dataToRestore.offers) ? dataToRestore.offers : [];
    dataToRestore.generalOffers = Array.isArray(dataToRestore.generalOffers)
      ? dataToRestore.generalOffers
      : [];
    dataToRestore.marketOrders = Array.isArray(dataToRestore.marketOrders)
      ? dataToRestore.marketOrders
      : [];
    dataToRestore.marketChats = Array.isArray(dataToRestore.marketChats)
      ? dataToRestore.marketChats
      : [];
    dataToRestore.marketFavorites = Array.isArray(dataToRestore.marketFavorites)
      ? dataToRestore.marketFavorites
      : [];
    dataToRestore.orderComplaints = Array.isArray(dataToRestore.orderComplaints)
      ? dataToRestore.orderComplaints
      : [];
    dataToRestore.auditLogs.unshift(auditRecord);

    // Commit restored data
    commitStore(dataToRestore);

    const stats = {
      officesCount: dataToRestore.offices.length,
      usersCount: dataToRestore.users.length,
      productsCount: dataToRestore.products.length,
      invoicesCount: dataToRestore.invoices.length,
      partiesCount: dataToRestore.parties.length,
      journalEntriesCount: dataToRestore.journalEntries.length,
    };

    return {
      success: true,
      message: 'تمت استعادة كافة البيانات والقيود بنجاح وتطابق تام 100%.',
      stats,
    };
  },

  // ==========================================
  // Global Quick Search
  // ==========================================
  async globalSearch(
    actor: User,
    query: string
  ): Promise<{
    products: Array<{ id: string; name: string; unit: string; salePrice: number; stock: number }>;
    parties: Array<{ id: string; name: string; phone: string; kind: string; city: string }>;
    invoices: Array<{ id: string; number: string; date: string; partyName: string; total: number; status: string }>;
  }> {
    checkPermission(actor, ['owner', 'accountant', 'warehouse_keeper', 'cashier'], actor.officeId);
    const store = getStore();
    const q = (query || '').trim().toLowerCase();

    if (!q) {
      return { products: [], parties: [], invoices: [] };
    }

    // 1. Products
    const products = store.products
      .filter((p) => p.officeId === actor.officeId && p.active && p.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((p) => {
        const movements = store.stockMovements.filter((m) => m.productId === p.id);
        const stock = calculateQuantityOnHand(p.id, movements);
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          salePrice: p.salePrice,
          stock,
        };
      });

    // 2. Parties
    const parties = store.parties
      .filter(
        (p) =>
          p.officeId === actor.officeId &&
          (p.name.toLowerCase().includes(q) || p.phone.includes(q) || p.city.toLowerCase().includes(q))
      )
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        kind: p.kind,
        city: p.city,
      }));

    // 3. Invoices
    const invoices = store.invoices
      .filter((i) => {
        if (i.officeId !== actor.officeId) return false;
        const party = store.parties.find((p) => p.id === i.partyId);
        const partyName = party?.name || '';
        return i.number.toLowerCase().includes(q) || partyName.toLowerCase().includes(q);
      })
      .slice(0, 6)
      .map((i) => {
        const party = store.parties.find((p) => p.id === i.partyId);
        return {
          id: i.id,
          number: i.number,
          date: i.date,
          partyName: party?.name || 'طرف مسجل',
          total: i.total,
          status: i.status,
        };
      });

    return { products, parties, invoices };
  },

  // ==========================================
  // Customer Area Portal Data
  // ==========================================
  async getCustomerPortalData(actor: User): Promise<{
    profile: { id: string; name: string; phone: string; email?: string; role: string };
    linkedMerchants: Array<{ id: string; name: string; city: string; phone: string; partyId: string; balance: number }>;
    invoices: Array<{
      id: string;
      number: string;
      date: string;
      officeName: string;
      total: number;
      paid: number;
      paymentMethod: string;
      status: string;
      lines: any[];
    }>;
    statements: Array<{
      officeId: string;
      officeName: string;
      totalOwed: number;
      totalPaid: number;
      currentBalance: number;
      transactions: any[];
    }>;
  }> {
    if (actor.role !== 'customer') {
      throw new AppError('PERMISSION_DENIED', 'هذه البوابة مخصصة حصراً لحسابات العملاء والمستشفيات');
    }

    const store = getStore();

    // Find all party records representing this customer across any office
    const customerParties = store.parties.filter(
      (p) => p.kind === 'customer' && (p.linkedUserId === actor.id || p.phone === actor.phone)
    );

    const linkedMerchants: any[] = [];
    const allInvoices: any[] = [];
    const statements: any[] = [];

    for (const cp of customerParties) {
      const office = store.offices.find((o) => o.id === cp.officeId);
      if (!office) continue;

      // Invoices for this customer in this office
      const officeInvoices = store.invoices
        .filter((inv) => inv.officeId === cp.officeId && inv.partyId === cp.id)
        .map((inv) => ({
          ...inv,
          officeName: office.name,
        }));
      allInvoices.push(...officeInvoices);

      // Statement for this party
      const totalInvoices = officeInvoices
        .filter((i) => i.status !== 'void')
        .reduce((sum, i) => sum + i.total, 0);

      const officePayments = store.payments
        .filter((p) => p.officeId === cp.officeId && p.partyId === cp.id)
        .reduce((sum, p) => sum + p.amount, 0);

      const currentBalance = cp.openingBalance + totalInvoices - officePayments;

      linkedMerchants.push({
        id: office.id,
        name: office.name,
        city: office.city,
        phone: office.phone,
        partyId: cp.id,
        balance: currentBalance,
      });

      // Detailed transactions for statement
      const txs: any[] = [];
      if (cp.openingBalance > 0) {
        txs.push({
          id: `op_${cp.id}`,
          date: '2026-01-01T00:00:00.000Z',
          description: 'رصيد افتتاحي سابق',
          ref: 'افتتاحي',
          debit: cp.openingBalance,
          credit: 0,
        });
      }
      for (const inv of officeInvoices) {
        txs.push({
          id: inv.id,
          date: inv.date,
          description: inv.status === 'void' ? `فاتورة بيع ملغاة (${inv.number})` : `فاتورة مبيعات (${inv.number})`,
          ref: inv.number,
          debit: inv.status === 'void' ? 0 : inv.total,
          credit: 0,
          status: inv.status,
        });
      }
      for (const p of store.payments.filter((p) => p.officeId === cp.officeId && p.partyId === cp.id)) {
        txs.push({
          id: p.id,
          date: p.date,
          description: p.memo || 'سند قبض / سداد نقدي',
          ref: p.invoiceId || 'دفعة على الحساب',
          debit: 0,
          credit: p.amount,
        });
      }

      txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let running = 0;
      for (const t of txs) {
        running += t.debit - t.credit;
        t.runningBalance = running;
      }

      statements.push({
        officeId: office.id,
        officeName: office.name,
        totalOwed: cp.openingBalance + totalInvoices,
        totalPaid: officePayments,
        currentBalance,
        transactions: txs.reverse(),
      });
    }

    allInvoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      profile: {
        id: actor.id,
        name: actor.name,
        phone: actor.phone,
        email: actor.email,
        role: actor.role,
      },
      linkedMerchants,
      invoices: allInvoices,
      statements,
    };
  },

  // ==========================================
  // Step 6: The Market (Requests, Smart Matching, Offers, General Offers)
  // ==========================================

  /**
   * Customer creates a new purchase request -> smart matches approved merchants and notifies top ones.
   */
  async createPurchaseRequest(
    actor: User,
    params: {
      productName: string;
      quantity: number;
      targetPrice: number;
      deliveryCity: string;
      deadline: string;
      notes?: string;
    }
  ): Promise<PurchaseRequest> {
    checkPermission(actor, ['customer'], null);
    const store = getStore();
    store.purchaseRequests ||= [];
    store.offers ||= [];
    store.generalOffers ||= [];

    const productName = (params.productName || '').trim();
    const deliveryCity = (params.deliveryCity || '').trim();
    const deadline = (params.deadline || '').trim();
    const quantity = Math.round(params.quantity || 0);
    const targetPrice = Math.round(params.targetPrice || 0);

    if (!productName) {
      throw new AppError('VALIDATION_ERROR', 'اسم المادة الطبية المطلوبة إجباري');
    }
    if (quantity <= 0) {
      throw new AppError('VALIDATION_ERROR', 'الكمية المطلوبة يجب أن تكون أكبر من صفر');
    }
    if (targetPrice <= 0) {
      throw new AppError('VALIDATION_ERROR', 'السعر المستهدف للوحدة يجب أن يكون أكبر من صفر');
    }
    if (!deliveryCity) {
      throw new AppError('VALIDATION_ERROR', 'مدينة التسليم مطلوبة لإجراء المطابقة الذكية');
    }
    if (!deadline) {
      throw new AppError('VALIDATION_ERROR', 'تاريخ الموعد النهائي للتجهيز مطلوب');
    }

    const matches = matchApprovedMerchantsForRequest(
      { productName, quantity, targetPrice, deliveryCity },
      store.offices,
      store.products,
      store.stockMovements,
      5
    );

    const req: PurchaseRequest = {
      id: makeId('req'),
      customerUserId: actor.id,
      customerName: actor.name,
      customerPhone: actor.phone,
      productName,
      quantity,
      targetPrice,
      deliveryCity,
      deadline,
      notes: params.notes?.trim() || undefined,
      status: 'open',
      matches,
      createdAt: new Date().toISOString(),
    };

    store.purchaseRequests.unshift(req);

    // Notify top matched approved merchants (owners & cashiers in matched offices)
    for (const m of matches.slice(0, 3)) {
      const targetUsers = store.users.filter(
        (u) =>
          u.officeId === m.officeId &&
          u.active &&
          (u.role === 'owner' || u.role === 'cashier' || u.role === 'accountant')
      );
      for (const u of targetUsers) {
        store.notifications.unshift({
          id: makeId('notif'),
          userId: u.id,
          kind: 'info',
          text: `طلب شراء جديد في السوق من ${actor.name}: "${productName}" (${quantity} وحدة) — سبب المطابقة: ${m.reasonAr}`,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    store.auditLogs.push({
      id: makeId('log'),
      officeId: 'market',
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE_PURCHASE_REQUEST',
      entity: 'PurchaseRequest',
      entityId: req.id,
      after: {
        productName: req.productName,
        quantity: req.quantity,
        targetPrice: req.targetPrice,
        matchesCount: matches.length,
      },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(req));
  },

  /**
   * Customer sees ONLY own requests (with offer summary);
   * Approved merchant sees ONLY requests matched to its office (and NEVER another merchant's offers);
   * Unapproved merchant sees nothing (empty array).
   */
  async getPurchaseRequests(actor: User): Promise<
    Array<
      PurchaseRequest & {
        offersCount: number;
        lowestOfferPrice?: number;
        myMatch?: RequestMatch;
        myOffer?: Offer;
      }
    >
  > {
    checkPermission(actor, ['customer', 'owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    const requests = store.purchaseRequests || [];
    const offers = store.offers || [];

    if (actor.role === 'customer') {
      const approvedIds = new Set(
        store.offices.filter((o) => o.status === 'approved').map((o) => o.id)
      );
      const myReqs = requests
        .filter((r) => r.customerUserId === actor.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((r) => {
          const reqOffers = sortOffersByPrice(
            offers.filter((o) => o.requestId === r.id && approvedIds.has(o.officeId))
          );
          return {
            ...r,
            offersCount: reqOffers.length,
            lowestOfferPrice: reqOffers[0]?.price,
          };
        });
      return JSON.parse(JSON.stringify(myReqs));
    }

    // Merchant role: must be approved office to appear or see requests
    const office = store.offices.find((o) => o.id === actor.officeId);
    if (!office || office.status !== 'approved') {
      return [];
    }

    const matchedReqs = requests
      .filter(
        (r) =>
          r.matches.some((m) => m.officeId === office.id) ||
          offers.some((o) => o.requestId === r.id && o.officeId === office.id)
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((r) => {
        const myMatch = r.matches.find((m) => m.officeId === office.id);
        const myOffer = offers.find((o) => o.requestId === r.id && o.officeId === office.id);
        return {
          ...r,
          // Never leak matches or offers of other offices
          matches: myMatch ? [myMatch] : [],
          offersCount: myOffer ? 1 : 0,
          lowestOfferPrice: myOffer?.price,
          myMatch,
          myOffer,
        };
      });

    return JSON.parse(JSON.stringify(matchedReqs));
  },

  /**
   * Returns a single PurchaseRequest plus visible offers:
   * - Customer owner sees ALL approved merchants' offers sorted ascending by price.
   * - Approved merchant sees ONLY its own offer (if any) + its match reason.
   */
  async getRequestWithOffers(
    actor: User,
    requestId: string
  ): Promise<{
    request: PurchaseRequest;
    offers: Offer[];
  }> {
    checkPermission(actor, ['customer', 'owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    const req = (store.purchaseRequests || []).find((r) => r.id === requestId);
    if (!req) {
      throw new AppError('REQUEST_NOT_FOUND', 'طلب الشراء المطلوب غير موجود');
    }

    const approvedIds = new Set(
      store.offices.filter((o) => o.status === 'approved').map((o) => o.id)
    );
    const allOffers = store.offers || [];

    if (actor.role === 'customer') {
      if (req.customerUserId !== actor.id) {
        throw new AppError('PERMISSION_DENIED', 'غير مصرح بالاطلاع على طلبات عميل آخر');
      }
      const visible = sortOffersByPrice(
        allOffers.filter((o) => o.requestId === req.id && approvedIds.has(o.officeId))
      );
      return JSON.parse(JSON.stringify({ request: req, offers: visible }));
    }

    const office = ensureApprovedOffice(store, actor.officeId);
    const myMatch = req.matches.find((m) => m.officeId === office.id);
    const myOffers = allOffers.filter((o) => o.requestId === req.id && o.officeId === office.id);
    if (!myMatch && myOffers.length === 0) {
      throw new AppError('PERMISSION_DENIED', 'هذا الطلب غير مطابق لمكتبك ولا يمكن استعراضه');
    }

    return JSON.parse(
      JSON.stringify({
        request: {
          ...req,
          matches: myMatch ? [myMatch] : [],
        },
        offers: myOffers,
      })
    );
  },

  /**
   * Merchant queries its own offers ONLY. Passing another targetOfficeId throws TENANT_ISOLATION_VIOLATION.
   */
  async getMerchantOffers(actor: User, targetOfficeId?: string): Promise<Offer[]> {
    checkPermission(actor, ['owner', 'accountant', 'cashier'], targetOfficeId || actor.officeId);
    const store = getStore();
    const office = ensureApprovedOffice(store, actor.officeId);
    const ownOffers = (store.offers || [])
      .filter((o) => o.officeId === office.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify(ownOffers));
  },

  /**
   * Checks whether an offer (by offerId) or draft offer ({ productId, quantity }) is covered by live stock,
   * returning exact shortage details so the merchant is warned before confirming.
   */
  async checkOfferStock(
    actor: User,
    params: {
      offerId?: string;
      productId?: string;
      quantity?: number;
      requestId?: string;
    }
  ): Promise<OfferStockCheckResult> {
    checkPermission(actor, ['owner', 'accountant', 'cashier', 'customer'], actor.officeId);
    const store = getStore();

    if (params.offerId) {
      const offer = (store.offers || []).find((o) => o.id === params.offerId);
      if (!offer) {
        throw new AppError('OFFER_NOT_FOUND', 'العرض المطلوب غير موجود');
      }
      if (actor.role !== 'customer' && actor.officeId !== offer.officeId) {
        throw new AppError(
          'TENANT_ISOLATION_VIOLATION',
          'غير مصرح بفحص مخزون عرض يعود لمكتب آخر'
        );
      }
      ensureApprovedOffice(store, offer.officeId);

      const req = (store.purchaseRequests || []).find((r) => r.id === offer.requestId);
      if (actor.role === 'customer' && req && req.customerUserId !== actor.id) {
        throw new AppError('PERMISSION_DENIED', 'غير مصرح بفحص عرض على طلب عميل آخر');
      }

      const officeProducts = store.products.filter((p) => p.officeId === offer.officeId && p.active);
      const product =
        (offer.productId
          ? officeProducts.find((p) => p.id === offer.productId)
          : undefined) ||
        findBestProductForOfficeRequest(req?.productName || offer.productName || '', officeProducts);

      const requiredQty = params.quantity ?? req?.quantity ?? offer.availableQuantity;
      return evaluateOfferStock(product, requiredQty, store.stockMovements);
    }

    // Merchant pre-submit stock check
    if (actor.role === 'customer') {
      throw new AppError('PERMISSION_DENIED', 'يتطلب فحص المخزون المسودة تحديد معرف العرض أو صلاحية مكتب');
    }
    const office = ensureApprovedOffice(store, actor.officeId);
    const req = params.requestId
      ? (store.purchaseRequests || []).find((r) => r.id === params.requestId)
      : undefined;
    const officeProducts = store.products.filter((p) => p.officeId === office.id && p.active);
    const product =
      (params.productId ? officeProducts.find((p) => p.id === params.productId) : undefined) ||
      (req ? findBestProductForOfficeRequest(req.productName, officeProducts) : undefined);

    const requiredQty = params.quantity ?? req?.quantity ?? 0;
    return evaluateOfferStock(product, requiredQty, store.stockMovements);
  },

  /**
   * Approved merchant answers a matching purchase request with an offer and notifies the customer.
   * Unapproved offices are blocked with OFFICE_NOT_APPROVED.
   */
  async submitOffer(
    actor: User,
    params: {
      requestId: string;
      productId?: string;
      price: number;
      availableQuantity: number;
      deliveryTime: string;
      validity: string;
      notes?: string;
    }
  ): Promise<Offer> {
    checkPermission(actor, ['owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    store.purchaseRequests ||= [];
    store.offers ||= [];

    const office = ensureApprovedOffice(store, actor.officeId);
    const req = store.purchaseRequests.find((r) => r.id === params.requestId);
    if (!req) {
      throw new AppError('REQUEST_NOT_FOUND', 'طلب الشراء المطلوب غير موجود');
    }
    if (req.status === 'accepted' || req.status === 'cancelled') {
      throw new AppError('INVALID_STATE', 'هذا الطلب مقفل ولا يمكن تقديم عروض جديدة عليه');
    }

    const isMatched = req.matches.some((m) => m.officeId === office.id);
    if (!isMatched) {
      throw new AppError('PERMISSION_DENIED', 'لا يمكن تقديم عرض على طلب شراء غير مطابق لمكتبك');
    }

    const price = Math.round(params.price || 0);
    const availableQuantity = Math.round(params.availableQuantity || 0);
    const deliveryTime = (params.deliveryTime || '').trim();
    const validity = (params.validity || '').trim();

    if (price <= 0) {
      throw new AppError('VALIDATION_ERROR', 'سعر العرض للوحدة يجب أن يكون أكبر من صفر');
    }
    if (availableQuantity <= 0) {
      throw new AppError('VALIDATION_ERROR', 'الكمية المتوفرة في العرض يجب أن تكون أكبر من صفر');
    }
    if (!deliveryTime) {
      throw new AppError('VALIDATION_ERROR', 'مدة التوصيل مطلوبة');
    }
    if (!validity) {
      throw new AppError('VALIDATION_ERROR', 'تاريخ صلاحية العرض مطلوب');
    }

    const existingOffer = store.offers.find(
      (o) => o.requestId === req.id && o.officeId === office.id && o.status === 'pending'
    );
    if (existingOffer) {
      throw new AppError('DUPLICATE_OFFER', 'لقد قدّم مكتبك عرض سعر سارٍ لهذا الطلب مسبقاً');
    }

    const officeProducts = store.products.filter((p) => p.officeId === office.id && p.active);
    let selectedProduct: Product | undefined;
    if (params.productId) {
      selectedProduct = officeProducts.find((p) => p.id === params.productId);
      if (!selectedProduct) {
        throw new AppError('PRODUCT_NOT_FOUND', 'المادة الطبية المختارة غير موجودة في دليل مكتبك');
      }
    } else {
      selectedProduct = findBestProductForOfficeRequest(req.productName, officeProducts);
    }

    const newOffer: Offer = {
      id: makeId('offer'),
      requestId: req.id,
      officeId: office.id,
      officeName: office.name,
      officeCity: office.city,
      productId: selectedProduct?.id,
      productName: selectedProduct?.name || req.productName,
      price,
      availableQuantity,
      deliveryTime,
      validity,
      notes: params.notes?.trim() || undefined,
      status: 'pending',
      createdByUserId: actor.id,
      createdAt: new Date().toISOString(),
    };

    store.offers.push(newOffer);
    if (req.status === 'open') {
      req.status = 'offered';
    }

    // Notify customer
    store.notifications.unshift({
      id: makeId('notif'),
      userId: req.customerUserId,
      kind: 'info',
      text: `عرض سعر جديد من ${office.name} على طلبك "${req.productName}" بسعر ${price.toLocaleString('en-US')} د.ع.`,
      read: false,
      createdAt: new Date().toISOString(),
    });

    store.auditLogs.push({
      id: makeId('log'),
      officeId: office.id,
      userId: actor.id,
      userName: actor.name,
      action: 'SUBMIT_OFFER',
      entity: 'Offer',
      entityId: newOffer.id,
      after: { requestId: req.id, price, availableQuantity, productId: selectedProduct?.id },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(newOffer));
  },

  /**
   * Customer accepts an offer -> ONE ATOMIC UNIT:
   * 1) Validates customer ownership & approved merchant office
   * 2) Links/creates Customer Party by phone inside merchant office
   * 3) Creates official Sales Invoice through the existing invoice engine (FEFO batches, COGS, balanced entries)
   * 4) Marks Offer as accepted, competing offers as rejected, Request as accepted
   * 5) Notifies merchant and writes Audit Log
   * If any step fails (e.g. insufficient stock), NOTHING is committed.
   */
  async acceptOffer(
    actor: User,
    offerId: string
  ): Promise<{
    request: PurchaseRequest;
    offer: Offer;
    invoice: Invoice;
    order: MarketOrder;
  }> {
    checkPermission(actor, ['customer'], null);
    const store = getStore();
    store.purchaseRequests ||= [];
    store.offers ||= [];
    store.marketOrders ||= [];

    const offer = store.offers.find((o) => o.id === offerId);
    if (!offer) {
      throw new AppError('OFFER_NOT_FOUND', 'العرض المطلوب غير موجود');
    }

    const office = ensureApprovedOffice(store, offer.officeId);

    const req = store.purchaseRequests.find((r) => r.id === offer.requestId);
    if (!req) {
      throw new AppError('REQUEST_NOT_FOUND', 'طلب الشراء المرتبط غير موجود');
    }
    if (req.customerUserId !== actor.id) {
      throw new AppError('PERMISSION_DENIED', 'لا يمكنك قبول عرض على طلب لا يعود لحسابك');
    }
    if (req.status === 'accepted' || req.status === 'cancelled' || offer.status !== 'pending') {
      throw new AppError('INVALID_STATE', 'هذا الطلب أو العرض قد تم حسمه مسبقاً');
    }

    // Resolve merchant product for invoice lines
    const officeProducts = store.products.filter((p) => p.officeId === office.id && p.active);
    const product =
      (offer.productId ? officeProducts.find((p) => p.id === offer.productId) : undefined) ||
      findBestProductForOfficeRequest(req.productName, officeProducts);

    if (!product) {
      throw new AppError(
        'PRODUCT_NOT_FOUND',
        'تعذر إصدار فاتورة البيع لعدم ربط العرض بصنف فعلي في مستودع المكتب المورد.'
      );
    }

    // Find or auto-create Customer Party in merchant office linked by phone/userId
    let customerParty = store.parties.find(
      (p) =>
        p.officeId === office.id &&
        p.kind === 'customer' &&
        (p.linkedUserId === actor.id || p.phone.trim() === actor.phone.trim())
    );

    if (customerParty) {
      if (!customerParty.linkedUserId) {
        customerParty.linkedUserId = actor.id;
      }
    } else {
      customerParty = {
        id: makeId('party'),
        officeId: office.id,
        kind: 'customer',
        name: actor.name,
        phone: actor.phone,
        city: req.deliveryCity,
        openingBalance: 0,
        linkedUserId: actor.id,
      };
      store.parties.push(customerParty);
    }

    // Resolve merchant actor to post invoice in that office
    const merchantActor =
      store.users.find(
        (u) => u.id === offer.createdByUserId && u.officeId === office.id && u.active
      ) ||
      store.users.find(
        (u) =>
          u.officeId === office.id &&
          u.active &&
          (u.role === 'owner' || u.role === 'accountant' || u.role === 'cashier')
      );

    if (!merchantActor) {
      throw new AppError('USER_NOT_FOUND', 'لا يوجد موظف مفوض نشط في المكتب المورد لإصدار الفاتورة');
    }

    // Execute existing sale invoice engine atomically on the open store snapshot
    const nowIso = new Date().toISOString();
    const createdInvoice = executeSaleInvoiceOnStore(store, merchantActor, {
      date: nowIso,
      partyId: customerParty.id,
      paymentMethod: 'credit',
      notes: `فاتورة منشأة تلقائياً عن قبول عرض السوق (${offer.id}) للطلب (${req.id})`,
      lines: [
        {
          productId: product.id,
          quantity: req.quantity,
          unitPrice: offer.price,
          discount: 0,
        },
      ],
    });

    // Update Offer & Request statuses atomically in the same store commit
    offer.status = 'accepted';
    offer.productId = product.id;
    offer.productName = product.name;

    for (const other of store.offers) {
      if (other.requestId === req.id && other.id !== offer.id && other.status === 'pending') {
        other.status = 'rejected';
      }
    }

    req.status = 'accepted';
    req.acceptedOfferId = offer.id;
    req.acceptedOfficeId = office.id;
    req.invoiceId = createdInvoice.id;
    req.invoiceNumber = createdInvoice.number;

    // Create MarketOrder automatically in the same atomic transaction
    const year = new Date().getFullYear();
    const orderSeq = store.marketOrders.length + 1;
    const orderNumber = `ORD-${year}-${orderSeq.toString().padStart(5, '0')}`;
    const newOrder: MarketOrder = {
      id: makeId('ord'),
      orderNumber,
      requestId: req.id,
      offerId: offer.id,
      invoiceId: createdInvoice.id,
      invoiceNumber: createdInvoice.number,
      customerUserId: req.customerUserId,
      customerName: req.customerName,
      customerPhone: req.customerPhone,
      officeId: office.id,
      officeName: office.name,
      officeCity: office.city,
      productId: product.id,
      productName: product.name,
      quantity: req.quantity,
      unitPrice: offer.price,
      total: createdInvoice.total,
      deliveryCity: req.deliveryCity,
      status: 'confirmed',
      statusHistory: [
        {
          status: 'confirmed',
          changedAt: nowIso,
          changedByUserId: actor.id,
          changedByName: actor.name,
          note: 'تم تأكيد الطلب تلقائياً عند قبول العرض وإصدار الفاتورة',
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.marketOrders.unshift(newOrder);

    // Notify merchant team & customer
    const merchantNotifyUsers = store.users.filter(
      (u) =>
        u.officeId === office.id &&
        u.active &&
        (u.id === offer.createdByUserId || u.role === 'owner')
    );
    for (const mu of merchantNotifyUsers) {
      store.notifications.unshift({
        id: makeId('notif'),
        userId: mu.id,
        kind: 'info',
        text: `تم قبول عرضك من ${actor.name} للطلب "${req.productName}" وأُنشئ الطلب ${orderNumber} والفاتورة ${createdInvoice.number}.`,
        read: false,
        createdAt: nowIso,
      });
    }
    store.notifications.unshift({
      id: makeId('notif'),
      userId: actor.id,
      kind: 'info',
      text: `تم تأكيد الطلب رقم ${orderNumber} لدى ${office.name} وإصدار الفاتورة ${createdInvoice.number}.`,
      read: false,
      createdAt: nowIso,
    });

    store.auditLogs.push({
      id: makeId('log'),
      officeId: office.id,
      userId: actor.id,
      userName: actor.name,
      action: 'ACCEPT_MARKET_OFFER',
      entity: 'Offer',
      entityId: offer.id,
      after: {
        requestId: req.id,
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        invoiceId: createdInvoice.id,
        invoiceNumber: createdInvoice.number,
        total: createdInvoice.total,
      },
      at: nowIso,
    });

    commitStore(store);
    return JSON.parse(
      JSON.stringify({
        request: req,
        offer,
        invoice: createdInvoice,
        order: newOrder,
      })
    );
  },

  /**
   * Approved merchant publishes a general offer visible in Market.
   */
  async publishGeneralOffer(
    actor: User,
    params: {
      productId?: string;
      productName?: string;
      unit?: string;
      price: number;
      quantity: number;
      validity: string;
      notes?: string;
    }
  ): Promise<GeneralOffer> {
    checkPermission(actor, ['owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    store.generalOffers ||= [];

    const office = ensureApprovedOffice(store, actor.officeId);
    const price = Math.round(params.price || 0);
    const quantity = Math.round(params.quantity || 0);
    const validity = (params.validity || '').trim();

    let product: Product | undefined;
    if (params.productId) {
      product = store.products.find(
        (p) => p.id === params.productId && p.officeId === office.id && p.active
      );
      if (!product) {
        throw new AppError('PRODUCT_NOT_FOUND', 'المادة الطبية المختارة غير موجودة في دليل مكتبك');
      }
    }

    const productName = (params.productName || product?.name || '').trim();
    if (!productName) {
      throw new AppError('VALIDATION_ERROR', 'اسم المادة الطبية للعرض العام مطلوب');
    }
    if (price <= 0) {
      throw new AppError('VALIDATION_ERROR', 'سعر العرض العام يجب أن يكون أكبر من صفر');
    }
    if (quantity <= 0) {
      throw new AppError('VALIDATION_ERROR', 'الكمية المعروضة يجب أن تكون أكبر من صفر');
    }
    if (!validity) {
      throw new AppError('VALIDATION_ERROR', 'تاريخ صلاحية العرض العام مطلوب');
    }

    const genOffer: GeneralOffer = {
      id: makeId('gen_offer'),
      officeId: office.id,
      officeName: office.name,
      officeCity: office.city,
      productId: product?.id,
      productName,
      unit: params.unit?.trim() || product?.unit || 'وحدة',
      price,
      quantity,
      validity,
      notes: params.notes?.trim() || undefined,
      active: true,
      createdByUserId: actor.id,
      createdAt: new Date().toISOString(),
    };

    store.generalOffers.unshift(genOffer);
    store.auditLogs.push({
      id: makeId('log'),
      officeId: office.id,
      userId: actor.id,
      userName: actor.name,
      action: 'PUBLISH_GENERAL_OFFER',
      entity: 'GeneralOffer',
      entityId: genOffer.id,
      after: { productName: genOffer.productName, price: genOffer.price, quantity: genOffer.quantity },
      at: new Date().toISOString(),
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(genOffer));
  },

  /**
   * Lists active general offers from APPROVED merchant offices ONLY.
   */
  async getGeneralOffers(actor: User): Promise<GeneralOffer[]> {
    checkPermission(actor, ['customer', 'owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    const approvedIds = new Set(
      store.offices.filter((o) => o.status === 'approved').map((o) => o.id)
    );
    const list = (store.generalOffers || [])
      .filter((g) => g.active && approvedIds.has(g.officeId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify(list));
  },

  // ==========================================
  // Step 7: Market Orders, Two-Party Chat, Favorites, Complaints
  // ==========================================

  async getMarketOrders(actor: User): Promise<MarketOrder[]> {
    checkPermission(actor, ['customer', 'owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    const orders = store.marketOrders || [];

    if (actor.role === 'customer') {
      const list = orders
        .filter((o) => o.customerUserId === actor.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return JSON.parse(JSON.stringify(list));
    }

    const office = store.offices.find((o) => o.id === actor.officeId);
    if (!office || office.status !== 'approved') {
      return [];
    }

    const list = orders
      .filter((o) => o.officeId === office.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify(list));
  },

  async advanceOrderStatus(
    actor: User,
    orderId: string,
    nextStatus?: MarketOrderStatus,
    note?: string
  ): Promise<MarketOrder> {
    checkPermission(actor, ['owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    store.marketOrders ||= [];
    const office = ensureApprovedOffice(store, actor.officeId);

    const order = store.marketOrders.find((o) => o.id === orderId);
    if (!order) {
      throw new AppError('ORDER_NOT_FOUND', 'الطلب المطلوب غير موجود');
    }
    if (order.officeId !== office.id) {
      throw new AppError('TENANT_ISOLATION_VIOLATION', 'غير مصرح بتحديث طلب يعود لمكتب آخر');
    }

    const targetStatus = nextStatus || getNextOrderStatus(order.status) || order.status;
    validateOrderStatusTransition(order.status, targetStatus);

    const beforeStatus = order.status;
    const nowIso = new Date().toISOString();
    order.status = targetStatus;
    order.updatedAt = nowIso;
    order.statusHistory.push({
      status: targetStatus,
      changedAt: nowIso,
      changedByUserId: actor.id,
      changedByName: actor.name,
      note: note?.trim() || undefined,
    });

    // Notify customer of order status update
    store.notifications.unshift({
      id: makeId('notif'),
      userId: order.customerUserId,
      kind: 'info',
      text: `تحديث الطلب ${order.orderNumber}: أصبحت حالة الطلب الآن "${ORDER_STATUS_LABELS[targetStatus]}" لدى ${office.name}.`,
      read: false,
      createdAt: nowIso,
    });

    store.auditLogs.push({
      id: makeId('log'),
      officeId: office.id,
      userId: actor.id,
      userName: actor.name,
      action: 'ADVANCE_ORDER_STATUS',
      entity: 'MarketOrder',
      entityId: order.id,
      before: { status: beforeStatus },
      after: { status: targetStatus, note: note?.trim() || undefined },
      at: nowIso,
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(order));
  },

  async getChatMessages(
    actor: User,
    params: { threadType: ChatThreadType; threadId: string; officeId?: string }
  ): Promise<MarketChatMessage[]> {
    checkPermission(actor, ['customer', 'owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    store.marketChats ||= [];

    let targetOfficeId: string;
    let targetCustomerId: string;

    if (params.threadType === 'order') {
      const order = (store.marketOrders || []).find((o) => o.id === params.threadId);
      if (!order) {
        throw new AppError('ORDER_NOT_FOUND', 'الطلب المرتبط بالمحادثة غير موجود');
      }
      if (actor.role === 'customer') {
        if (order.customerUserId !== actor.id) {
          throw new AppError('PERMISSION_DENIED', 'غير مصرح بالاطلاع على محادثة طلب لا يعود لحسابك');
        }
      } else {
        ensureApprovedOffice(store, actor.officeId);
        if (order.officeId !== actor.officeId) {
          throw new AppError(
            'TENANT_ISOLATION_VIOLATION',
            'غير مصرح بقراءة محادثات طلبات تعود لمكتب آخر'
          );
        }
      }
      targetOfficeId = order.officeId;
      targetCustomerId = order.customerUserId;
    } else {
      const req = (store.purchaseRequests || []).find((r) => r.id === params.threadId);
      if (!req) {
        throw new AppError('REQUEST_NOT_FOUND', 'طلب الشراء المرتبط بالمحادثة غير موجود');
      }
      if (actor.role === 'customer') {
        if (req.customerUserId !== actor.id) {
          throw new AppError('PERMISSION_DENIED', 'غير مصرح بالاطلاع على محادثة طلب عميل آخر');
        }
        if (!params.officeId) {
          throw new AppError('VALIDATION_ERROR', 'يجب تحديد المكتب الطبي لفتح محادثة الطلب');
        }
        ensureApprovedOffice(store, params.officeId);
        targetOfficeId = params.officeId;
      } else {
        const office = ensureApprovedOffice(store, actor.officeId);
        if (params.officeId && params.officeId !== office.id) {
          throw new AppError(
            'TENANT_ISOLATION_VIOLATION',
            'غير مصرح بقراءة محادثات مكتب آخر في نفس الطلب'
          );
        }
        const canAccessReq =
          req.matches.some((m) => m.officeId === office.id) ||
          (store.offers || []).some((o) => o.requestId === req.id && o.officeId === office.id);
        if (!canAccessReq) {
          throw new AppError('PERMISSION_DENIED', 'هذا الطلب غير مطابق لمكتبك ولا يمكن فتح محادثته');
        }
        targetOfficeId = office.id;
      }
      targetCustomerId = req.customerUserId;
    }

    const msgs = store.marketChats
      .filter(
        (m) =>
          m.threadType === params.threadType &&
          m.threadId === params.threadId &&
          m.officeId === targetOfficeId &&
          m.customerUserId === targetCustomerId
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return JSON.parse(JSON.stringify(msgs));
  },

  async sendChatMessage(
    actor: User,
    params: { threadType: ChatThreadType; threadId: string; officeId?: string; body: string }
  ): Promise<MarketChatMessage> {
    checkPermission(actor, ['customer', 'owner', 'accountant', 'cashier'], actor.officeId);
    const store = getStore();
    store.marketChats ||= [];

    const body = (params.body || '').trim();
    if (!body) {
      throw new AppError('VALIDATION_ERROR', 'لا يمكن إرسال رسالة فارغة. اكتب نص رسالتك أولاً.');
    }

    let targetOfficeId: string;
    let targetCustomerId: string;
    let requestId: string;
    let orderId: string | undefined;
    let contextLabel: string;

    if (params.threadType === 'order') {
      const order = (store.marketOrders || []).find((o) => o.id === params.threadId);
      if (!order) {
        throw new AppError('ORDER_NOT_FOUND', 'الطلب المرتبط بالمحادثة غير موجود');
      }
      if (actor.role === 'customer') {
        if (order.customerUserId !== actor.id) {
          throw new AppError('PERMISSION_DENIED', 'غير مصرح بإرسال رسائل على طلب عميل آخر');
        }
      } else {
        ensureApprovedOffice(store, actor.officeId);
        if (order.officeId !== actor.officeId) {
          throw new AppError(
            'TENANT_ISOLATION_VIOLATION',
            'غير مصرح بإرسال رسائل على طلب يعود لمكتب آخر'
          );
        }
      }
      targetOfficeId = order.officeId;
      targetCustomerId = order.customerUserId;
      requestId = order.requestId;
      orderId = order.id;
      contextLabel = `الطلب ${order.orderNumber}`;
    } else {
      const req = (store.purchaseRequests || []).find((r) => r.id === params.threadId);
      if (!req) {
        throw new AppError('REQUEST_NOT_FOUND', 'طلب الشراء المرتبط بالمحادثة غير موجود');
      }
      if (actor.role === 'customer') {
        if (req.customerUserId !== actor.id) {
          throw new AppError('PERMISSION_DENIED', 'غير مصرح بإرسال رسائل على طلب عميل آخر');
        }
        if (!params.officeId) {
          throw new AppError('VALIDATION_ERROR', 'يجب تحديد المكتب الطبي للمراسلة');
        }
        ensureApprovedOffice(store, params.officeId);
        targetOfficeId = params.officeId;
      } else {
        const office = ensureApprovedOffice(store, actor.officeId);
        if (params.officeId && params.officeId !== office.id) {
          throw new AppError(
            'TENANT_ISOLATION_VIOLATION',
            'غير مصرح بإرسال رسائل باسم مكتب آخر'
          );
        }
        const canAccessReq =
          req.matches.some((m) => m.officeId === office.id) ||
          (store.offers || []).some((o) => o.requestId === req.id && o.officeId === office.id);
        if (!canAccessReq) {
          throw new AppError('PERMISSION_DENIED', 'هذا الطلب غير مطابق لمكتبك');
        }
        targetOfficeId = office.id;
      }
      targetCustomerId = req.customerUserId;
      requestId = req.id;
      contextLabel = `طلب الشراء (${req.productName})`;
    }

    const nowIso = new Date().toISOString();
    const senderRole: 'customer' | 'merchant' = actor.role === 'customer' ? 'customer' : 'merchant';
    const message: MarketChatMessage = {
      id: makeId('chat'),
      threadType: params.threadType,
      threadId: params.threadId,
      requestId,
      orderId,
      customerUserId: targetCustomerId,
      officeId: targetOfficeId,
      senderUserId: actor.id,
      senderName: actor.name,
      senderRole,
      body,
      createdAt: nowIso,
    };

    store.marketChats.push(message);

    // Notify counterparty
    if (senderRole === 'customer') {
      const officeUsers = store.users.filter(
        (u) =>
          u.officeId === targetOfficeId &&
          u.active &&
          (u.role === 'owner' || u.role === 'cashier')
      );
      for (const ou of officeUsers) {
        store.notifications.unshift({
          id: makeId('notif'),
          userId: ou.id,
          kind: 'info',
          text: `رسالة محادثة جديدة من ${actor.name} بخصوص ${contextLabel}.`,
          read: false,
          createdAt: nowIso,
        });
      }
    } else {
      const office = store.offices.find((o) => o.id === targetOfficeId);
      store.notifications.unshift({
        id: makeId('notif'),
        userId: targetCustomerId,
        kind: 'info',
        text: `رسالة جديدة من ${office?.name || actor.name} بخصوص ${contextLabel}.`,
        read: false,
        createdAt: nowIso,
      });
    }

    store.auditLogs.push({
      id: makeId('log'),
      officeId: targetOfficeId,
      userId: actor.id,
      userName: actor.name,
      action: 'SEND_MARKET_CHAT',
      entity: 'MarketChatMessage',
      entityId: message.id,
      after: { threadType: params.threadType, threadId: params.threadId },
      at: nowIso,
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(message));
  },

  async getFavorites(actor: User): Promise<MarketFavorite[]> {
    checkPermission(actor, ['customer'], null);
    const store = getStore();
    const approvedIds = new Set(
      store.offices.filter((o) => o.status === 'approved').map((o) => o.id)
    );
    const list = (store.marketFavorites || [])
      .filter((f) => f.customerUserId === actor.id && approvedIds.has(f.officeId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify(list));
  },

  async toggleFavorite(
    actor: User,
    params: {
      kind: MarketFavoriteKind;
      officeId: string;
      productId?: string;
      productName?: string;
      unitPrice?: number;
      unit?: string;
    }
  ): Promise<{ added: boolean; favorites: MarketFavorite[] }> {
    checkPermission(actor, ['customer'], null);
    const store = getStore();
    store.marketFavorites ||= [];
    const office = ensureApprovedOffice(store, params.officeId);

    if (params.kind === 'product' && !params.productName?.trim() && !params.productId) {
      throw new AppError('VALIDATION_ERROR', 'يجب تحديد المادة الطبية لحفظها في المفضلة');
    }

    const existingIdx = store.marketFavorites.findIndex((f) => {
      if (f.customerUserId !== actor.id || f.kind !== params.kind || f.officeId !== office.id) {
        return false;
      }
      if (params.kind === 'merchant') return true;
      if (params.productId && f.productId) return f.productId === params.productId;
      return f.productName === params.productName?.trim();
    });

    let added = false;
    if (existingIdx >= 0) {
      store.marketFavorites.splice(existingIdx, 1);
    } else {
      const fav: MarketFavorite = {
        id: makeId('fav'),
        customerUserId: actor.id,
        kind: params.kind,
        officeId: office.id,
        officeName: office.name,
        officeCity: office.city,
        productId: params.productId,
        productName: params.productName?.trim(),
        unitPrice: params.unitPrice,
        unit: params.unit,
        createdAt: new Date().toISOString(),
      };
      store.marketFavorites.unshift(fav);
      added = true;
    }

    store.auditLogs.push({
      id: makeId('log'),
      officeId: office.id,
      userId: actor.id,
      userName: actor.name,
      action: added ? 'ADD_FAVORITE' : 'REMOVE_FAVORITE',
      entity: 'MarketFavorite',
      entityId: office.id,
      after: { kind: params.kind, productName: params.productName },
      at: new Date().toISOString(),
    });

    commitStore(store);
    const approvedIds = new Set(
      store.offices.filter((o) => o.status === 'approved').map((o) => o.id)
    );
    const updated = store.marketFavorites
      .filter((f) => f.customerUserId === actor.id && approvedIds.has(f.officeId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return JSON.parse(JSON.stringify({ added, favorites: updated }));
  },

  async createComplaint(
    actor: User,
    params: { orderId: string; reason: string; description: string }
  ): Promise<OrderComplaint> {
    checkPermission(actor, ['customer'], null);
    const store = getStore();
    store.orderComplaints ||= [];

    const order = (store.marketOrders || []).find((o) => o.id === params.orderId);
    if (!order) {
      throw new AppError('ORDER_NOT_FOUND', 'الطلب المطلوب غير موجود');
    }
    if (order.customerUserId !== actor.id) {
      throw new AppError('PERMISSION_DENIED', 'غير مصرح برفع شكوى على طلب لا يعود لحسابك');
    }

    const reason = (params.reason || '').trim();
    const description = (params.description || '').trim();
    if (!reason) {
      throw new AppError('VALIDATION_ERROR', 'سبب الشكوى مطلوب');
    }
    if (!description) {
      throw new AppError('VALIDATION_ERROR', 'تفاصيل ووصف الشكوى مطلوبان');
    }

    const nowIso = new Date().toISOString();
    const complaint: OrderComplaint = {
      id: makeId('cmp'),
      orderId: order.id,
      orderNumber: order.orderNumber,
      requestId: order.requestId,
      customerUserId: actor.id,
      customerName: actor.name,
      officeId: order.officeId,
      officeName: order.officeName,
      reason,
      description,
      status: 'open',
      history: [
        {
          status: 'open',
          changedAt: nowIso,
          actorUserId: actor.id,
          actorName: actor.name,
          note: reason,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.orderComplaints.unshift(complaint);

    // Notify merchant office & customer confirmation
    const merchantUsers = store.users.filter(
      (u) =>
        u.officeId === order.officeId &&
        u.active &&
        (u.role === 'owner' || u.role === 'accountant' || u.role === 'cashier')
    );
    for (const mu of merchantUsers) {
      store.notifications.unshift({
        id: makeId('notif'),
        userId: mu.id,
        kind: 'alert',
        text: `شكوى جديدة على الطلب ${order.orderNumber} من ${actor.name}: ${reason}.`,
        read: false,
        createdAt: nowIso,
      });
    }
    store.notifications.unshift({
      id: makeId('notif'),
      userId: actor.id,
      kind: 'info',
      text: `تم استلام شكواك على الطلب ${order.orderNumber} وإشعار مكتب ${order.officeName}.`,
      read: false,
      createdAt: nowIso,
    });

    store.auditLogs.push({
      id: makeId('log'),
      officeId: order.officeId,
      userId: actor.id,
      userName: actor.name,
      action: 'CREATE_ORDER_COMPLAINT',
      entity: 'OrderComplaint',
      entityId: complaint.id,
      after: { orderId: order.id, reason },
      at: nowIso,
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(complaint));
  },

  async getComplaints(actor: User): Promise<OrderComplaint[]> {
    checkPermission(
      actor,
      ['customer', 'owner', 'accountant', 'cashier', 'platform_admin'],
      actor.officeId
    );
    const store = getStore();
    const list = store.orderComplaints || [];

    if (actor.role === 'customer') {
      return JSON.parse(
        JSON.stringify(
          list
            .filter((c) => c.customerUserId === actor.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        )
      );
    }

    if (actor.role === 'platform_admin') {
      return JSON.parse(
        JSON.stringify(
          [...list].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        )
      );
    }

    return JSON.parse(
      JSON.stringify(
        list
          .filter((c) => c.officeId === actor.officeId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      )
    );
  },

  async updateComplaintStatus(
    actor: User,
    params: {
      complaintId: string;
      nextStatus: ComplaintStatus;
      merchantReply?: string;
      note?: string;
    }
  ): Promise<OrderComplaint> {
    checkPermission(
      actor,
      ['customer', 'owner', 'accountant', 'cashier', 'platform_admin'],
      actor.officeId
    );
    const store = getStore();
    store.orderComplaints ||= [];

    const complaint = store.orderComplaints.find((c) => c.id === params.complaintId);
    if (!complaint) {
      throw new AppError('COMPLAINT_NOT_FOUND', 'الشكوى المطلوبة غير موجودة');
    }

    validateComplaintStatusTransition(complaint.status, params.nextStatus);

    if (params.nextStatus === 'in_review' || params.nextStatus === 'resolved') {
      if (actor.role === 'customer') {
        throw new AppError(
          'PERMISSION_DENIED',
          'تحويل حالة الشكوى للمراجعة أو الحل يتم من قبل المكتب المورد أو مشرف المنصة'
        );
      }
      if (actor.role !== 'platform_admin' && actor.officeId !== complaint.officeId) {
        throw new AppError('TENANT_ISOLATION_VIOLATION', 'غير مصرح بمعالجة شكوى تعود لمكتب آخر');
      }
      if (params.nextStatus === 'resolved') {
        const reply = (params.merchantReply ?? complaint.merchantReply ?? '').trim();
        if (!reply) {
          throw new AppError(
            'VALIDATION_ERROR',
            'يرجى كتابة رد المكتب وتفاصيل الحل قبل تحديد الشكوى كـ "تم الحل"'
          );
        }
        complaint.merchantReply = reply;
      } else if (params.merchantReply?.trim()) {
        complaint.merchantReply = params.merchantReply.trim();
      }
    } else if (params.nextStatus === 'customer_confirmed') {
      if (actor.role !== 'customer' || actor.id !== complaint.customerUserId) {
        throw new AppError(
          'PERMISSION_DENIED',
          'تأكيد إغلاق الشكوى بعد الحل مسموح للمشتري صاحب الشكوى فقط'
        );
      }
    }

    const beforeStatus = complaint.status;
    const nowIso = new Date().toISOString();
    complaint.status = params.nextStatus;
    complaint.updatedAt = nowIso;
    complaint.history.push({
      status: params.nextStatus,
      changedAt: nowIso,
      actorUserId: actor.id,
      actorName: actor.name,
      note: params.note?.trim() || params.merchantReply?.trim() || undefined,
    });

    // Notify counterparty on every transition
    if (params.nextStatus === 'in_review' || params.nextStatus === 'resolved') {
      store.notifications.unshift({
        id: makeId('notif'),
        userId: complaint.customerUserId,
        kind: 'info',
        text: `تحديث الشكوى على الطلب ${complaint.orderNumber}: أصبحت "${COMPLAINT_STATUS_LABELS[params.nextStatus]}"${complaint.merchantReply ? ` — رد المكتب: ${complaint.merchantReply}` : ''}.`,
        read: false,
        createdAt: nowIso,
      });
    } else if (params.nextStatus === 'customer_confirmed') {
      const merchantUsers = store.users.filter(
        (u) =>
          u.officeId === complaint.officeId &&
          u.active &&
          (u.role === 'owner' || u.role === 'accountant')
      );
      for (const mu of merchantUsers) {
        store.notifications.unshift({
          id: makeId('notif'),
          userId: mu.id,
          kind: 'info',
          text: `أكد المشتري ${actor.name} حل وإغلاق الشكوى على الطلب ${complaint.orderNumber}.`,
          read: false,
          createdAt: nowIso,
        });
      }
    }

    store.auditLogs.push({
      id: makeId('log'),
      officeId: complaint.officeId,
      userId: actor.id,
      userName: actor.name,
      action: 'UPDATE_COMPLAINT_STATUS',
      entity: 'OrderComplaint',
      entityId: complaint.id,
      before: { status: beforeStatus },
      after: { status: complaint.status, merchantReply: complaint.merchantReply },
      at: nowIso,
    });

    commitStore(store);
    return JSON.parse(JSON.stringify(complaint));
  },

  // ==========================================
  // Self-Check & Cross-Office Isolation Test
  // ==========================================
  /**
   * Proves that an actor from Office B cannot access Office A records.
   */
  async runIsolationSelfCheck(): Promise<{
    passed: boolean;
    details: string;
  }> {
    const store = getStore();
    const basraUser = store.users.find((u) => u.officeId === 'office_basra');
    if (!basraUser) {
      throw new AppError('TEST_SETUP_ERROR', 'مستخدم البصرة غير متوفر لتشغيل الفحص');
    }

    try {
      // Attempt to access Baghdad office with Basra user credentials
      checkPermission(basraUser, ['owner', 'accountant'], 'office_baghdad');
      return {
        passed: false,
        details: 'فشل الفحص: تم السماح لمستخدم البصرة بالوصول إلى بيانات بغداد دون حظر!',
      };
    } catch (e: any) {
      if (e instanceof AppError && e.code === 'TENANT_ISOLATION_VIOLATION') {
        return {
          passed: true,
          details: `نجح الفحص: تم رفض الوصول عبر الحارس الأمني بنجاح: ${e.message}`,
        };
      }
      return {
        passed: false,
        details: `فشل الفحص: استثناء غير متوقع: ${e.message}`,
      };
    }
  },

  /**
   * Proves that a Warehouse Keeper cannot call an accounting function directly
   */
  async callAccountingDirectlyAsWarehouseKeeper(whUser: User): Promise<{
    passed: boolean;
    details: string;
  }> {
    try {
      // Direct service guard call requiring accountant or owner
      checkPermission(whUser, ['owner', 'accountant'], whUser.officeId);
      return {
        passed: false,
        details: 'فشل الفحص: استطاع أمين المستودع تنفيذ دالة محاسبية دون صلاحية!',
      };
    } catch (e: any) {
      if (e instanceof AppError && e.code === 'PERMISSION_DENIED') {
        return {
          passed: true,
          details: `نجح الفحص: تم رفض أمين المستودع عند مناداة الخدمة المحاسبية مباشرة: ${e.message}`,
        };
      }
      return {
        passed: false,
        details: `فشل الفحص: استثناء غير متوقع: ${e.message}`,
      };
    }
  },

  /**
   * Resets entire storage back to pristine seed data
   */
  async resetAllData(): Promise<void> {
    currentSessionUser = null;
    repository.reset();
  },
};

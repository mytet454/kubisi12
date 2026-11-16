/**
 * src/domain/types.ts
 * Pure business logic and domain entities for "سوق المستلزمات الطبية" (Iraq).
 * No React and no storage inside.
 */

export type UserRole =
  | 'owner'
  | 'accountant'
  | 'warehouse_keeper'
  | 'cashier'
  | 'customer'
  | 'platform_admin';

export type MerchantStatus = 'pending' | 'approved' | 'rejected';

export interface Office {
  id: string;
  name: string;
  city: string;
  phone: string;
  status: MerchantStatus;
  licenseFile?: string;
  licenseUploadedAt?: string;
  licenseDataUrl?: string;
  rejectionReason?: string;
  invoiceHeader?: string;
  invoiceFooter?: string;
  nearExpiryDays: number;
  defaultReorderLevel: number;
  allowNegativeStock: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  officeId: string | null; // null for Customer and Platform Admin
  failedAttempts: number;
  lockedUntil: string | null;
  twoStepEnabled: boolean;
  twoStepCode?: string;
  active: boolean;
  lastActiveAt?: string;
}

export interface Warehouse {
  id: string;
  officeId: string;
  name: string;
  city: string;
  isDefault?: boolean;
}

export interface Product {
  id: string;
  officeId: string;
  name: string;
  unit: string;
  purchasePrice: number; // IQD integer
  salePrice: number;     // IQD integer
  reorderLevel: number;
  avgCost: number;       // IQD integer WAC
  active: boolean;
}

export interface Batch {
  id: string;
  productId: string;
  warehouseId: string;
  lotNumber: string;
  expiryDate: string; // ISO or YYYY-MM-DD
}

export interface ProductStockInfo extends Product {
  quantityOnHand: number;
  batches: Array<Batch & { quantityOnHand: number; daysToExpiry: number }>;
  isLowStock: boolean;
  isNearExpiry: boolean;
}

export type MovementType = 'purchase' | 'sale' | 'adjustment' | 'transfer' | 'count';

export interface StockMovement {
  id: string;
  officeId: string;
  type: MovementType;
  productId: string;
  batchId: string;
  warehouseId: string;
  quantity: number; // + or -
  refType: string;
  refId: string;
  date: string;
  userId: string;
}

export type PartyKind = 'customer' | 'supplier';

export interface Party {
  id: string;
  officeId: string;
  kind: PartyKind;
  name: string;
  phone: string;
  city: string;
  openingBalance: number;
  linkedUserId?: string | null;
}

export type InvoiceKind = 'sale' | 'purchase';
export type InvoiceStatus = 'posted' | 'void';

export interface InvoiceLine {
  productId: string;
  batchId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface Invoice {
  id: string;
  officeId: string;
  kind: InvoiceKind;
  number: string; // sequential per office e.g. INV-2026-000001
  date: string;
  partyId: string;
  lines: InvoiceLine[];
  discount: number;
  total: number;
  paid: number;
  paymentMethod: 'cash' | 'transfer' | 'credit';
  status: InvoiceStatus;
  notes?: string;
  userId: string;
  voidReason?: string;
  voidedAt?: string;
}

export interface Payment {
  id: string;
  officeId: string;
  partyId: string;
  invoiceId?: string;
  direction: 'in' | 'out';
  amount: number;
  method: 'cash' | 'transfer';
  date: string;
  memo?: string;
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string;
  officeId: string;
  code: string;
  name: string;
  type: AccountType;
}

export interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  officeId: string;
  date: string;
  memo: string;
  refType: string;
  refId: string;
  reversalOf?: string;
  lines: JournalLine[];
}

export interface Expense {
  id: string;
  officeId: string;
  category: string;
  amount: number;
  date: string;
  paidFrom: string;
  memo?: string;
}

export interface Notification {
  id: string;
  userId: string;
  kind: 'alert' | 'info' | 'system';
  text: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  officeId: string;
  userId: string;
  userName?: string;
  action: string;
  entity: string;
  entityId: string;
  before?: any;
  after?: any;
  at: string;
}

export interface Period {
  id: string;
  officeId: string;
  closedUntil: string;
}

// ==========================================
// Step 6: The Market (Requests & Offers)
// ==========================================
export type PurchaseRequestStatus = 'open' | 'offered' | 'accepted' | 'cancelled';

export interface RequestMatch {
  officeId: string;
  officeName: string;
  officeCity: string;
  productId?: string;
  productName?: string;
  unitPrice?: number;
  availableStock?: number;
  score: number;
  reasonAr: string;
}

export interface PurchaseRequest {
  id: string;
  customerUserId: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  quantity: number;
  targetPrice: number; // IQD unit price
  deliveryCity: string;
  deadline: string; // YYYY-MM-DD
  notes?: string;
  status: PurchaseRequestStatus;
  matches: RequestMatch[];
  acceptedOfferId?: string;
  acceptedOfficeId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  createdAt: string;
}

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface Offer {
  id: string;
  requestId: string;
  officeId: string;
  officeName: string;
  officeCity: string;
  productId?: string;
  productName?: string;
  price: number; // IQD unit price
  availableQuantity: number;
  deliveryTime: string;
  validity: string; // YYYY-MM-DD
  notes?: string;
  status: OfferStatus;
  createdByUserId: string;
  createdAt: string;
}

export interface GeneralOffer {
  id: string;
  officeId: string;
  officeName: string;
  officeCity: string;
  productId?: string;
  productName: string;
  unit?: string;
  price: number;
  quantity: number;
  validity: string; // YYYY-MM-DD
  notes?: string;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
}

// ==========================================
// Step 7: Market Orders, Chat, Favorites, Complaints
// ==========================================
export type MarketOrderStatus = 'confirmed' | 'preparing' | 'shipped' | 'delivered';

export interface OrderStatusChange {
  status: MarketOrderStatus;
  changedAt: string;
  changedByUserId: string;
  changedByName: string;
  note?: string;
}

export interface MarketOrder {
  id: string;
  orderNumber: string;
  requestId: string;
  offerId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerUserId: string;
  customerName: string;
  customerPhone: string;
  officeId: string;
  officeName: string;
  officeCity: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  deliveryCity: string;
  status: MarketOrderStatus;
  statusHistory: OrderStatusChange[];
  createdAt: string;
  updatedAt: string;
}

export type ChatThreadType = 'request' | 'order';

export interface MarketChatMessage {
  id: string;
  threadType: ChatThreadType;
  threadId: string; // requestId or orderId
  requestId: string;
  orderId?: string;
  customerUserId: string;
  officeId: string;
  senderUserId: string;
  senderName: string;
  senderRole: 'customer' | 'merchant';
  body: string;
  createdAt: string;
}

export type MarketFavoriteKind = 'product' | 'merchant';

export interface MarketFavorite {
  id: string;
  customerUserId: string;
  kind: MarketFavoriteKind;
  officeId: string;
  officeName: string;
  officeCity: string;
  productId?: string;
  productName?: string;
  unitPrice?: number;
  unit?: string;
  createdAt: string;
}

export type ComplaintStatus = 'open' | 'in_review' | 'resolved' | 'customer_confirmed';

export interface ComplaintHistoryItem {
  status: ComplaintStatus;
  changedAt: string;
  actorUserId: string;
  actorName: string;
  note?: string;
}

export interface OrderComplaint {
  id: string;
  orderId: string;
  orderNumber: string;
  requestId: string;
  customerUserId: string;
  customerName: string;
  officeId: string;
  officeName: string;
  reason: string;
  description: string;
  merchantReply?: string;
  status: ComplaintStatus;
  history: ComplaintHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export class AppError extends Error {
  code: string;
  constructor(code: string, messageArabic: string) {
    super(messageArabic);
    this.name = 'AppError';
    this.code = code;
  }
}

// Navigation Item Keys
export type NavItemKey =
  | 'dashboard'
  | 'market'
  | 'invoices'
  | 'inventory'
  | 'parties'
  | 'accounting'
  | 'expenses'
  | 'employees'
  | 'settings'
  | 'audit_log'
  | 'merchants_admin'
  | 'customer_portal'
  | 'self_test';

export interface NavItemConfig {
  key: NavItemKey;
  label: string;
  iconName: string;
  allowedRoles: UserRole[];
}

export const NAV_ITEMS_REGISTRY: NavItemConfig[] = [
  {
    key: 'dashboard',
    label: 'لوحة التحكم',
    iconName: 'LayoutDashboard',
    allowedRoles: ['owner', 'accountant'],
  },
  {
    key: 'market',
    label: 'سوق العرض والطلب',
    iconName: 'ShoppingBag',
    allowedRoles: ['owner', 'accountant', 'cashier', 'customer'],
  },
  {
    key: 'invoices',
    label: 'الفواتير والمبيعات',
    iconName: 'FileText',
    allowedRoles: ['owner', 'accountant', 'cashier'],
  },
  {
    key: 'inventory',
    label: 'المستودع والمخزون',
    iconName: 'Package',
    allowedRoles: ['owner', 'accountant', 'warehouse_keeper'],
  },
  {
    key: 'parties',
    label: 'العملاء والموردون',
    iconName: 'Users',
    allowedRoles: ['owner', 'accountant', 'cashier'],
  },
  {
    key: 'accounting',
    label: 'النظام المحاسبي',
    iconName: 'Scale',
    allowedRoles: ['owner', 'accountant'],
  },
  {
    key: 'expenses',
    label: 'المصاريف',
    iconName: 'Receipt',
    allowedRoles: ['owner', 'accountant'],
  },
  {
    key: 'employees',
    label: 'الموظفون والصلاحيات',
    iconName: 'UserCheck',
    allowedRoles: ['owner'],
  },
  {
    key: 'settings',
    label: 'إعدادات المكتب',
    iconName: 'Settings',
    allowedRoles: ['owner'],
  },
  {
    key: 'audit_log',
    label: 'سجل الرقابة والتدقيق',
    iconName: 'ShieldAlert',
    allowedRoles: ['owner'],
  },
  {
    key: 'self_test',
    label: 'فحص النظام والاعتماد',
    iconName: 'ShieldCheck',
    allowedRoles: ['owner', 'platform_admin'],
  },
  {
    key: 'merchants_admin',
    label: 'إدارة تراخيص المكاتب',
    iconName: 'Building2',
    allowedRoles: ['platform_admin'],
  },
  {
    key: 'customer_portal',
    label: 'بوابة المستشفى والمشتري',
    iconName: 'Store',
    allowedRoles: ['customer'],
  },
];

/**
 * Pure function: get allowed navigation items for a given role
 */
export function getAllowedNavItems(role: UserRole): NavItemConfig[] {
  return NAV_ITEMS_REGISTRY.filter((item) => item.allowedRoles.includes(role));
}

/**
 * Pure function: calculate simple deterministic hash for passwords
 */
export function hashPassword(password: string): string {
  let hash = 0;
  const salt = 'iq_medical_salt_2026';
  const combined = password + salt;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return 'h_' + Math.abs(hash).toString(16);
}

/**
 * Pure function: check if account is locked
 */
export function isAccountLocked(user: User, currentTime: Date = new Date()): { locked: boolean; remainingMinutes: number } {
  if (!user.lockedUntil) return { locked: false, remainingMinutes: 0 };
  const lockedDate = new Date(user.lockedUntil);
  if (lockedDate > currentTime) {
    const remainingMs = lockedDate.getTime() - currentTime.getTime();
    const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
    return { locked: true, remainingMinutes };
  }
  return { locked: false, remainingMinutes: 0 };
}

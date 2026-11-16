/**
 * src/data/repository.ts
 * Repository and storage adapters for "سوق المستلزمات الطبية".
 * Persists in localStorage with graceful in-memory fallback.
 * Supports isolated in-memory instances for self-tests.
 */
import {
  Account,
  AuditLog,
  Batch,
  Expense,
  GeneralOffer,
  Invoice,
  JournalEntry,
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
} from '../domain/types';
import { createInitialSeedData } from './seed';

export * from '../domain/types';

export interface DatabaseSchema {
  offices: Office[];
  users: User[];
  warehouses: Warehouse[];
  products: Product[];
  batches: Batch[];
  stockMovements: StockMovement[];
  parties: Party[];
  invoices: Invoice[];
  payments: Payment[];
  accounts: Account[];
  journalEntries: JournalEntry[];
  expenses: Expense[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  periods: Period[];
  purchaseRequests: PurchaseRequest[];
  offers: Offer[];
  generalOffers: GeneralOffer[];
  marketOrders: MarketOrder[];
  marketChats: MarketChatMessage[];
  marketFavorites: MarketFavorite[];
  orderComplaints: OrderComplaint[];
}

const STORAGE_KEY = 'iraq_med_supplies_step1_db';

class MemoryStorageAdapter {
  private data: DatabaseSchema;

  constructor(initialData?: DatabaseSchema) {
    this.data = initialData ? JSON.parse(JSON.stringify(initialData)) : createInitialSeedData();
  }

  load(): DatabaseSchema {
    return JSON.parse(JSON.stringify(this.data));
  }

  save(data: DatabaseSchema): void {
    this.data = JSON.parse(JSON.stringify(data));
  }

  reset(): DatabaseSchema {
    this.data = createInitialSeedData();
    return JSON.parse(JSON.stringify(this.data));
  }
}

class LocalStorageAdapter {
  load(): DatabaseSchema {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return createInitialSeedData();
      }
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seed = createInitialSeedData();
        this.save(seed);
        return seed;
      }
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        purchaseRequests: Array.isArray(parsed.purchaseRequests) ? parsed.purchaseRequests : [],
        offers: Array.isArray(parsed.offers) ? parsed.offers : [],
        generalOffers: Array.isArray(parsed.generalOffers) ? parsed.generalOffers : [],
        marketOrders: Array.isArray(parsed.marketOrders) ? parsed.marketOrders : [],
        marketChats: Array.isArray(parsed.marketChats) ? parsed.marketChats : [],
        marketFavorites: Array.isArray(parsed.marketFavorites) ? parsed.marketFavorites : [],
        orderComplaints: Array.isArray(parsed.orderComplaints) ? parsed.orderComplaints : [],
      };
    } catch (e) {
      console.warn('LocalStorage error, falling back to memory seed:', e);
      return createInitialSeedData();
    }
  }

  save(data: DatabaseSchema): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }

  reset(): DatabaseSchema {
    const seed = createInitialSeedData();
    this.save(seed);
    return seed;
  }
}

// Global active store
let activeAdapter: { load: () => DatabaseSchema; save: (d: DatabaseSchema) => void; reset: () => DatabaseSchema } =
  typeof window !== 'undefined' && window.localStorage ? new LocalStorageAdapter() : new MemoryStorageAdapter();

export const repository = {
  getSnapshot(): DatabaseSchema {
    return activeAdapter.load();
  },

  commit(data: DatabaseSchema): void {
    activeAdapter.save(data);
  },

  reset(): DatabaseSchema {
    return activeAdapter.reset();
  },

  /**
   * Create an isolated, pristine in-memory repository instance for testing
   */
  createIsolatedInstance(): {
    getSnapshot: () => DatabaseSchema;
    commit: (d: DatabaseSchema) => void;
    reset: () => DatabaseSchema;
  } {
    const mem = new MemoryStorageAdapter();
    return {
      getSnapshot: () => mem.load(),
      commit: (d: DatabaseSchema) => mem.save(d),
      reset: () => mem.reset(),
    };
  },
};

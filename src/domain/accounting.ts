/**
 * src/domain/accounting.ts
 * Pure accounting business logic for "سوق المستلزمات الطبية" (Iraq).
 * No React, no storage. All amounts are integer Iraqi Dinar (IQD).
 */
import { Account, AppError, JournalEntry, JournalLine } from './types';

export interface PostEntryParams {
  id: string;
  officeId: string;
  date: string;
  memo: string;
  refType: string;
  refId: string;
  reversalOf?: string;
  lines: JournalLine[];
}

/**
 * Standard Account Codes according to chart of accounts
 */
export const STANDARD_ACCOUNTS = {
  CASH: '101',           // صندوق النقد الرئيسي
  BANK: '102',           // الحساب المصرفي
  AR: '103',             // المدينون - ذمم العملاء
  INVENTORY: '104',      // مخزون بضاعة المستلزمات الطبية
  AP: '201',             // الدائنون - ذمم الموردين
  CAPITAL: '301',        // رأس مال المالك
  SALES_REVENUE: '401',  // إيرادات مبيعات المستلزمات الطبية
  COGS: '501',           // تكلفة البضاعة المباعة
} as const;

/**
 * Validates that debits equal credits in a journal entry.
 * Throws AppError if unbalanced or total is non-positive.
 */
export function validateBalancedEntry(lines: JournalLine[]): void {
  if (!lines || lines.length < 2) {
    throw new AppError('ACCOUNTING_INVALID_ENTRY', 'يجب أن يحتوي القيد المحاسبي على طرفين على الأقل (مدين ودائن)');
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) {
      throw new AppError('ACCOUNTING_NEGATIVE_AMOUNT', 'المبالغ المحاسبية يجب أن تكون قيماً موجبة أو صفر');
    }
    if (line.debit > 0 && line.credit > 0) {
      throw new AppError('ACCOUNTING_LINE_DUAL_ENTRY', 'لا يمكن لطرف القيد الواحد أن يكون مديناً ودائناً في الوقت نفسه');
    }
    totalDebit += Math.round(line.debit);
    totalCredit += Math.round(line.credit);
  }

  if (totalDebit !== totalCredit) {
    throw new AppError(
      'UNBALANCED_JOURNAL_ENTRY',
      `القيد المحاسبي غير متوازن: إجمالي المدين (${totalDebit.toLocaleString('en-US')} د.ع) لا يساوي إجمالي الدائن (${totalCredit.toLocaleString('en-US')} د.ع)`
    );
  }

  if (totalDebit <= 0) {
    throw new AppError('ACCOUNTING_ZERO_ENTRY', 'لا يمكن ترحيل قيد محاسبي بقيمة إجمالية صفر');
  }
}

/**
 * Creates a validated JournalEntry object.
 */
export function createJournalEntry(params: PostEntryParams): JournalEntry {
  validateBalancedEntry(params.lines);
  return {
    id: params.id,
    officeId: params.officeId,
    date: params.date,
    memo: params.memo,
    refType: params.refType,
    refId: params.refId,
    reversalOf: params.reversalOf,
    lines: params.lines.map((l) => ({
      accountId: l.accountId,
      debit: Math.round(l.debit),
      credit: Math.round(l.credit),
    })),
  };
}

/**
 * Generates posting rules for a Purchase Invoice:
 * Dr. Inventory (104) = invoice total
 *   Cr. Accounts Payable / Supplier (201) [if credit] OR Cash (101) [if cash] OR Bank (102) [if transfer]
 */
export function buildPurchaseJournalLines(
  accounts: Account[],
  totalAmount: number,
  paymentMethod: 'cash' | 'transfer' | 'credit'
): JournalLine[] {
  const invAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.INVENTORY);
  if (!invAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب مخزون البضاعة (104) غير معرف في الدليل');

  let creditAccId: string;
  if (paymentMethod === 'cash') {
    const cashAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.CASH);
    if (!cashAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب الصندوق (101) غير معرف في الدليل');
    creditAccId = cashAcc.id;
  } else if (paymentMethod === 'transfer') {
    const bankAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.BANK);
    if (!bankAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب المصرف (102) غير معرف في الدليل');
    creditAccId = bankAcc.id;
  } else {
    const apAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.AP);
    if (!apAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب ذمم الموردين (201) غير معرف في الدليل');
    creditAccId = apAcc.id;
  }

  return [
    { accountId: invAcc.id, debit: totalAmount, credit: 0 },
    { accountId: creditAccId, debit: 0, credit: totalAmount },
  ];
}

/**
 * Generates posting rules for a Sale Invoice (two balanced entries):
 * Entry 1 (Revenue):
 *   Dr. Cash (101) / Bank (102) / Accounts Receivable (103) = sale total
 *     Cr. Sales Revenue (401) = sale total
 *
 * Entry 2 (COGS):
 *   Dr. Cost of Goods Sold (501) = total cost (WAC * qty)
 *     Cr. Inventory (104) = total cost (WAC * qty)
 */
export function buildSaleJournalLines(
  accounts: Account[],
  saleTotal: number,
  cogsTotal: number,
  paymentMethod: 'cash' | 'transfer' | 'credit'
): { revenueLines: JournalLine[]; cogsLines: JournalLine[] } {
  let debitAccId: string;
  if (paymentMethod === 'cash') {
    const cashAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.CASH);
    if (!cashAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب الصندوق (101) غير معرف');
    debitAccId = cashAcc.id;
  } else if (paymentMethod === 'transfer') {
    const bankAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.BANK);
    if (!bankAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب المصرف (102) غير معرف');
    debitAccId = bankAcc.id;
  } else {
    const arAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.AR);
    if (!arAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب ذمم العملاء (103) غير معرف');
    debitAccId = arAcc.id;
  }

  const revAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.SALES_REVENUE);
  if (!revAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب إيرادات المبيعات (401) غير معرف');

  const cogsAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.COGS);
  if (!cogsAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب تكلفة البضاعة المباعة (501) غير معرف');

  const invAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.INVENTORY);
  if (!invAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب المخزون (104) غير معرف');

  const revenueLines: JournalLine[] = [
    { accountId: debitAccId, debit: saleTotal, credit: 0 },
    { accountId: revAcc.id, debit: 0, credit: saleTotal },
  ];

  const cogsLines: JournalLine[] = cogsTotal > 0
    ? [
        { accountId: cogsAcc.id, debit: cogsTotal, credit: 0 },
        { accountId: invAcc.id, debit: 0, credit: cogsTotal },
      ]
    : [];

  return { revenueLines, cogsLines };
}

/**
 * Customer payment received:
 * Dr. Cash (101) / Bank (102)
 *   Cr. Accounts Receivable (103)
 */
export function buildCustomerPaymentJournalLines(
  accounts: Account[],
  amount: number,
  method: 'cash' | 'transfer'
): JournalLine[] {
  const targetAcc = accounts.find((a) => a.code === (method === 'cash' ? STANDARD_ACCOUNTS.CASH : STANDARD_ACCOUNTS.BANK));
  if (!targetAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب الصندوق أو المصرف غير معرف');

  const arAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.AR);
  if (!arAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب ذمم العملاء (103) غير معرف');

  return [
    { accountId: targetAcc.id, debit: amount, credit: 0 },
    { accountId: arAcc.id, debit: 0, credit: amount },
  ];
}

/**
 * Supplier payment made:
 * Dr. Accounts Payable (201)
 *   Cr. Cash (101) / Bank (102)
 */
export function buildSupplierPaymentJournalLines(
  accounts: Account[],
  amount: number,
  method: 'cash' | 'transfer'
): JournalLine[] {
  const apAcc = accounts.find((a) => a.code === STANDARD_ACCOUNTS.AP);
  if (!apAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب ذمم الموردين (201) غير معرف');

  const targetAcc = accounts.find((a) => a.code === (method === 'cash' ? STANDARD_ACCOUNTS.CASH : STANDARD_ACCOUNTS.BANK));
  if (!targetAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب الصندوق أو المصرف غير معرف');

  return [
    { accountId: apAcc.id, debit: amount, credit: 0 },
    { accountId: targetAcc.id, debit: 0, credit: amount },
  ];
}

/**
 * Expense payment:
 * Dr. Expense Account (e.g. 502, 503, 504, 505)
 *   Cr. Cash (101) / Bank (102)
 */
export function buildExpenseJournalLines(
  accounts: Account[],
  expenseAccountId: string,
  amount: number,
  paidFromCode: string = STANDARD_ACCOUNTS.CASH
): JournalLine[] {
  const expAcc = accounts.find((a) => a.id === expenseAccountId);
  if (!expAcc) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب المصروف غير معرف');

  const cashOrBank = accounts.find((a) => a.code === paidFromCode);
  if (!cashOrBank) throw new AppError('ACCOUNT_NOT_FOUND', 'حساب السداد (صندوق/مصرف) غير معرف');

  return [
    { accountId: expAcc.id, debit: amount, credit: 0 },
    { accountId: cashOrBank.id, debit: 0, credit: amount },
  ];
}

/**
 * Creates a reversing journal entry (exact mirror of the original: debits become credits).
 */
export function buildReversalEntry(originalEntry: JournalEntry, newId: string, date: string, memo?: string): JournalEntry {
  const reversedLines: JournalLine[] = originalEntry.lines.map((l) => ({
    accountId: l.accountId,
    debit: l.credit,
    credit: l.debit,
  }));

  return createJournalEntry({
    id: newId,
    officeId: originalEntry.officeId,
    date,
    memo: memo || `قيد عكسي لإلغاء القيد (${originalEntry.id}) - ${originalEntry.memo}`,
    refType: originalEntry.refType,
    refId: originalEntry.refId,
    reversalOf: originalEntry.id,
    lines: reversedLines,
  });
}

/**
 * Trial Balance Row
 */
export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balanceDebit: number;
  balanceCredit: number;
}

export interface TrialBalanceResult {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

/**
 * Calculates the Trial Balance (ميزان المراجعة) across all posted journal entries for an office.
 */
export function calculateTrialBalance(accounts: Account[], entries: JournalEntry[]): TrialBalanceResult {
  const accountTotals = new Map<string, { debit: number; credit: number }>();

  // Initialize
  for (const acc of accounts) {
    accountTotals.set(acc.id, { debit: 0, credit: 0 });
  }

  // Sum lines
  for (const entry of entries) {
    for (const line of entry.lines) {
      const cur = accountTotals.get(line.accountId) || { debit: 0, credit: 0 };
      cur.debit += line.debit;
      cur.credit += line.credit;
      accountTotals.set(line.accountId, cur);
    }
  }

  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const acc of accounts) {
    const totals = accountTotals.get(acc.id) || { debit: 0, credit: 0 };
    totalDebit += totals.debit;
    totalCredit += totals.credit;

    const net = totals.debit - totals.credit;
    const balanceDebit = net > 0 ? net : 0;
    const balanceCredit = net < 0 ? -net : 0;

    rows.push({
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      debit: totals.debit,
      credit: totals.credit,
      balanceDebit,
      balanceCredit,
    });
  }

  return {
    rows,
    totalDebit,
    totalCredit,
    isBalanced: totalDebit === totalCredit,
  };
}

/**
 * Profit and Loss Statement Result
 */
export interface ProfitAndLossResult {
  periodStart: string;
  periodEnd: string;
  salesRevenue: number;     // 401
  costOfGoodsSold: number;  // 501
  grossProfit: number;      // salesRevenue - costOfGoodsSold
  operatingExpenses: number;// 502, 503, 504, 505, etc.
  expensesBreakdown: Array<{
    code: string;
    name: string;
    amount: number;
  }>;
  netProfit: number;        // grossProfit - operatingExpenses
}

/**
 * Calculates Profit & Loss (قائمة الدخل - الأرباح والخسائر) for a chosen date range.
 * Pure function: reads only chart of accounts and journal entries.
 */
export function calculateProfitAndLoss(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart?: string,
  periodEnd?: string
): ProfitAndLossResult {
  const startTs = periodStart ? new Date(periodStart).getTime() : 0;
  const endTs = periodEnd ? new Date(periodEnd).getTime() : Number.MAX_SAFE_INTEGER;

  // Filter entries in period
  const periodEntries = entries.filter((e) => {
    const t = new Date(e.date).getTime();
    return t >= startTs && t <= endTs;
  });

  const accountNetDebits = new Map<string, number>();
  for (const acc of accounts) {
    accountNetDebits.set(acc.id, 0);
  }

  for (const entry of periodEntries) {
    for (const line of entry.lines) {
      const cur = accountNetDebits.get(line.accountId) || 0;
      // For expenses and assets, normal balance is debit. For revenue and liabilities, normal balance is credit.
      accountNetDebits.set(line.accountId, cur + (line.debit - line.credit));
    }
  }

  // 1. Sales Revenue (code 401 or type 'revenue') -> credit minus debit
  let salesRevenue = 0;
  const revAccounts = accounts.filter((a) => a.type === 'revenue' || a.code === STANDARD_ACCOUNTS.SALES_REVENUE);
  for (const acc of revAccounts) {
    const netDebit = accountNetDebits.get(acc.id) || 0;
    salesRevenue += -netDebit; // revenue is credit normal
  }

  // 2. Cost of Goods Sold (code 501) -> debit minus credit
  let costOfGoodsSold = 0;
  const cogsAccounts = accounts.filter((a) => a.code === STANDARD_ACCOUNTS.COGS);
  for (const acc of cogsAccounts) {
    costOfGoodsSold += accountNetDebits.get(acc.id) || 0;
  }

  const grossProfit = salesRevenue - costOfGoodsSold;

  // 3. Operating Expenses (type 'expense' excluding 501)
  let operatingExpenses = 0;
  const expensesBreakdown: Array<{ code: string; name: string; amount: number }> = [];
  const otherExpenseAccounts = accounts.filter(
    (a) => a.type === 'expense' && a.code !== STANDARD_ACCOUNTS.COGS
  );

  for (const acc of otherExpenseAccounts) {
    const net = accountNetDebits.get(acc.id) || 0;
    if (net !== 0) {
      operatingExpenses += net;
      expensesBreakdown.push({
        code: acc.code,
        name: acc.name,
        amount: net,
      });
    }
  }

  const netProfit = grossProfit - operatingExpenses;

  return {
    periodStart: periodStart || '2026-01-01',
    periodEnd: periodEnd || new Date().toISOString(),
    salesRevenue,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    expensesBreakdown,
    netProfit,
  };
}

/**
 * Checks if a given transaction date falls in a closed accounting period.
 * Throws AppError('PERIOD_CLOSED') if transactionDate <= closedUntil.
 */
export function checkPeriodLock(transactionDate: string, closedUntil?: string): void {
  if (!closedUntil) return;
  const txDate = new Date(transactionDate).getTime();
  const lockDate = new Date(closedUntil).getTime();
  if (txDate <= lockDate) {
    throw new AppError(
      'PERIOD_CLOSED',
      `الفترة المحاسبية مقفلة حتى تاريخ ${new Date(closedUntil).toLocaleDateString('ar-IQ')}. لا يمكن إجراء تعديلات أو عمليات في فترة مغلقة.`
    );
  }
}


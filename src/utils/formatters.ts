/**
 * src/utils/formatters.ts
 * Number, Currency (IQD), and Date formatters for Iraq (Asia/Baghdad)
 */

export function formatIQD(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '0 د.ع';
  }
  // Integer round, thousands separators
  const rounded = Math.round(amount);
  const formatted = new Intl.NumberFormat('en-US').format(rounded);
  return `${formatted} د.ع`;
}

export function formatDateBaghdad(dateStr: string | Date): string {
  if (!dateStr) return '-';
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return '-';
    // dd/mm/yyyy in Baghdad timezone
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Baghdad',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return formatter.format(d);
  } catch {
    return String(dateStr);
  }
}

export function formatDateTimeBaghdad(dateStr: string | Date): string {
  if (!dateStr) return '-';
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return '-';
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Baghdad',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return formatter.format(d);
  } catch {
    return String(dateStr);
  }
}

export function calculateDaysRemaining(expiryDateStr: string): number {
  if (!expiryDateStr) return 999;
  const expiry = new Date(expiryDateStr);
  const now = new Date();
  // Clear times
  expiry.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

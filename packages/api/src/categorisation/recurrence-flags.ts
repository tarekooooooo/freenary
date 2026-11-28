import type {
  RecurrenceFrequency,
  RecurrenceTransaction,
  RecurringExpense,
} from "./recurrence";
import { STABLE_AMOUNT_SPREAD } from "./recurrence";

/**
 * Flags for a recurring expense, as described in #427.
 *
 * A price change is only reported once the new price has repeated: the
 * last two charges must agree with each other and differ from the median
 * of the earlier charges by more than `STABLE_AMOUNT_SPREAD`. A single
 * different charge is therefore a one-off variation, not a price change.
 * A subscription is "possibly ended" once no payment has arrived for
 * more than 1.5x its interval; the member confirms or dismisses that, it
 * is never treated as ended on detection alone.
 */
export interface RecurringPriceChange {
  previousAmountMinor: number;
  currentAmountMinor: number;
  changedOn: Date;
  yearlyImpactMinor: number;
}

export interface RecurringFlags {
  priceChange: RecurringPriceChange | null;
  possiblyEnded: boolean;
}

export type FlaggedRecurringExpense = RecurringExpense & RecurringFlags;

/** No payment for more than this multiple of the interval: possibly ended. */
export const POSSIBLY_ENDED_INTERVAL_MULTIPLIER = 1.5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const PERIODS_PER_YEAR: Record<RecurrenceFrequency, number> = {
  annual: 1,
  irregular: 12,
  monthly: 12,
  quarterly: 4,
  weekly: 52,
};

export function medianMinor(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

export function detectRecurringPriceChange(
  transactions: readonly RecurrenceTransaction[],
  frequency: RecurrenceFrequency = "monthly",
): RecurringPriceChange | null {
  const ordered = [...transactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  if (ordered.length < 4) return null;
  const amounts = ordered.map((transaction) => Math.abs(transaction.amount));
  const currentAmounts = amounts.slice(-2);
  const previous = medianMinor(amounts.slice(0, -2));
  const current = medianMinor(currentAmounts);
  if (previous <= 0 || current === previous) return null;
  if (
    Math.abs((currentAmounts[0] ?? 0) - (currentAmounts[1] ?? 0)) / current >
    STABLE_AMOUNT_SPREAD
  ) {
    return null;
  }
  if (Math.abs(current - previous) / previous <= STABLE_AMOUNT_SPREAD) {
    return null;
  }
  return {
    changedOn: ordered[ordered.length - 2]?.date ?? new Date(),
    currentAmountMinor: Math.round(current),
    previousAmountMinor: Math.round(previous),
    yearlyImpactMinor: Math.round(
      (current - previous) * (PERIODS_PER_YEAR[frequency] ?? 12),
    ),
  };
}

export function isPossiblyEnded(
  expense: RecurringExpense,
  asOf: Date = new Date(),
): boolean {
  if (expense.intervalDays <= 0) return false;
  return (
    asOf.getTime() - expense.lastSeen.getTime() >
    POSSIBLY_ENDED_INTERVAL_MULTIPLIER * expense.intervalDays * MS_PER_DAY
  );
}

export function flagRecurringExpense(
  expense: RecurringExpense,
  transactions: readonly RecurrenceTransaction[],
  asOf: Date = new Date(),
): FlaggedRecurringExpense {
  return {
    ...expense,
    possiblyEnded: isPossiblyEnded(expense, asOf),
    priceChange: detectRecurringPriceChange(transactions, expense.frequency),
  };
}

/** Largest yearly impact first, for Insights; items without a price change last. */
export function sortRecurringByYearlyImpact<T extends RecurringFlags>(
  expenses: readonly T[],
): T[] {
  return [...expenses].sort(
    (a, b) =>
      Math.abs(b.priceChange?.yearlyImpactMinor ?? 0) -
      Math.abs(a.priceChange?.yearlyImpactMinor ?? 0),
  );
}

/**
 * A confirmed end is stored as `recurringEndedAt` on MerchantOverride
 * (see the PR notes for why a new model was not added). A confirmed end
 * only excludes an item from upcoming totals and the forecast while no
 * payment has arrived after it: a new payment brings the item back.
 */
export function isConfirmedEnded(
  expense: RecurringExpense,
  confirmedEndedAt: Date | null,
  transactions: readonly RecurrenceTransaction[] = [],
): boolean {
  if (confirmedEndedAt === null) return false;
  return !transactions.some(
    (transaction) => transaction.date.getTime() > confirmedEndedAt.getTime(),
  );
}

export function isExcludedFromUpcomingTotals(
  expense: RecurringExpense,
  confirmedEndedAt: Date | null,
  transactions: readonly RecurrenceTransaction[] = [],
): boolean {
  return (
    isPossiblyEnded(expense) ||
    isConfirmedEnded(expense, confirmedEndedAt, transactions)
  );
}

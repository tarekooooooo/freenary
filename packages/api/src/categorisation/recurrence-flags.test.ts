import { describe, expect, it } from "bun:test";

import type {
  RecurrenceTransaction,
  RecurringExpense,
} from "./recurrence";
import {
  detectRecurringPriceChange,
  flagRecurringExpense,
  isConfirmedEnded,
  isExcludedFromUpcomingTotals,
  isPossiblyEnded,
  sortRecurringByYearlyImpact,
} from "./recurrence-flags";

const charge = (
  amount: number,
  date: Date,
): RecurrenceTransaction => ({
  amount: -amount,
  category: "subscriptions",
  counterpartyName: "Basic-Fit",
  currency: "EUR",
  date,
  merchantKey: "basic-fit",
  resolvedCategory: null,
});

const monthlyCharges = (amounts: number[]): RecurrenceTransaction[] =>
  amounts.map((amount, index) =>
    charge(amount, new Date(2026, index, 5)),
  );

const expense = (overrides: Partial<RecurringExpense> = {}): RecurringExpense =>
  ({
    amountSpread: 0,
    category: "subscriptions",
    confidence: "confirmed",
    currency: "EUR",
    frequency: "monthly",
    intervalDays: 30,
    intervalSpread: 0,
    kind: "fixed",
    lastSeen: new Date(2026, 5, 5),
    merchantKey: "basic-fit",
    merchantName: "Basic-Fit",
    nextExpected: new Date(2026, 6, 5),
    occurrences: 6,
    reportingAmountMinor: 1500,
    typicalAmountMinor: 1500,
    ...overrides,
  });

describe("detectRecurringPriceChange", () => {
  it("reports a price change once the new price has repeated", () => {
    const change = detectRecurringPriceChange(
      monthlyCharges([1500, 1500, 1500, 1500, 1800, 1800]),
    );
    expect(change?.previousAmountMinor).toBe(1500);
    expect(change?.currentAmountMinor).toBe(1800);
    expect(change?.changedOn).toEqual(new Date(2026, 4, 5));
    expect(change?.yearlyImpactMinor).toBe(3600);
  });

  it("ignores a one-off variation in the latest charges", () => {
    expect(
      detectRecurringPriceChange(
        monthlyCharges([1500, 1500, 1500, 1500, 1800, 1500]),
      ),
    ).toBeNull();
  });

  it("ignores a single different charge at the end", () => {
    expect(
      detectRecurringPriceChange(
        monthlyCharges([1500, 1500, 1500, 1500, 1500, 1800]),
      ),
    ).toBeNull();
  });

  it("reports nothing when the price never changed", () => {
    expect(
      detectRecurringPriceChange(monthlyCharges([1500, 1500, 1500, 1500])),
    ).toBeNull();
  });
});

describe("isPossiblyEnded", () => {
  it("flags a monthly payment missing for more than 1.5x its interval", () => {
    expect(isPossiblyEnded(expense(), new Date(2026, 8, 15))).toBe(true);
  });

  it("keeps a monthly payment that is only a few days late", () => {
    expect(isPossiblyEnded(expense(), new Date(2026, 5, 30))).toBe(false);
  });
});

describe("flagRecurringExpense", () => {
  it("combines a price change with a late payment", () => {
    const flagged = flagRecurringExpense(
      expense(),
      monthlyCharges([1500, 1500, 1500, 1500, 1800, 1800]),
      new Date(2026, 8, 15),
    );
    expect(flagged.priceChange?.currentAmountMinor).toBe(1800);
    expect(flagged.possiblyEnded).toBe(true);
  });
});

describe("confirmed end", () => {
  it("excludes a confirmed end from upcoming totals", () => {
    const recent = expense({ lastSeen: new Date() });
    const endedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(isConfirmedEnded(recent, endedAt, [])).toBe(true);
    expect(isExcludedFromUpcomingTotals(recent, endedAt, [])).toBe(true);
  });

  it("brings the item back when a new payment arrives after the confirmed end", () => {
    const recent = expense({ lastSeen: new Date() });
    const endedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const returned = [charge(1500, new Date())];
    expect(isConfirmedEnded(recent, endedAt, returned)).toBe(false);
    expect(isExcludedFromUpcomingTotals(recent, endedAt, returned)).toBe(false);
  });

  it("orders price increases by largest yearly impact first", () => {
    const small = flagRecurringExpense(
      expense({ merchantKey: "small", merchantName: "Small" }),
      monthlyCharges([1000, 1000, 1000, 1000, 1100, 1100]),
    );
    const large = flagRecurringExpense(
      expense({ merchantKey: "large", merchantName: "Large" }),
      monthlyCharges([1000, 1000, 1000, 1000, 2000, 2000]),
    );
    expect(sortRecurringByYearlyImpact([small, large])[0]).toBe(large);
  });
});

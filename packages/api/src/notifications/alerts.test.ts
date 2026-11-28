import { describe, expect, it } from "bun:test";

import {
  buildBudgetLineAlert,
  buildLowBalanceAlert,
  buildUnusualExpenseAlert,
  filterNewAlerts,
  isAlertTypeEnabled,
  DEFAULT_NOTIFICATION_ALERT_SETTINGS,
} from "./alerts";

const budgetLine = {
  budgetMonth: "November",
  categoryName: "Groceries",
  currency: "EUR",
  daysLeft: 9,
  plannedMinor: 40000,
  actualMinor: 32000,
};

describe("budget line alerts", () => {
  it("alerts at 80% with days left", () => {
    const alert = buildBudgetLineAlert(budgetLine);
    expect(alert?.type).toBe("budget_line_almost_used");
    expect(alert?.bodyEn).toBe(
      "You have used 80% of Groceries for November, with 9 days left.",
    );
  });

  it("alerts again at 100% with a different dedupe key", () => {
    const warning = buildBudgetLineAlert(budgetLine);
    const full = buildBudgetLineAlert({ ...budgetLine, actualMinor: 40000 });
    expect(full?.type).toBe("budget_line_used_up");
    expect(full?.dedupeKey).not.toBe(warning?.dedupeKey);
  });

  it("does not alert below 80%", () => {
    expect(
      buildBudgetLineAlert({ ...budgetLine, actualMinor: 20000 }),
    ).toBeNull();
  });

  it("does not repeat an alert already raised for the same line and month", () => {
    const alert = buildBudgetLineAlert(budgetLine);
    expect(alert).not.toBeNull();
    if (!alert) return;
    expect(filterNewAlerts([alert], [alert.dedupeKey])).toEqual([]);
    expect(filterNewAlerts([alert], [])).toEqual([alert]);
  });
});

describe("low balance alerts", () => {
  const lowBalance = {
    accountId: "main",
    accountName: "Main account",
    alreadyAlertedBelow: false,
    balanceMinor: 12000,
    currency: "EUR",
    thresholdMinor: 20000,
  };

  it("alerts under the threshold set for the account", () => {
    const alert = buildLowBalanceAlert(lowBalance);
    expect(alert?.type).toBe("low_balance");
    expect(alert?.bodyEn).toContain("Main account is at");
    expect(alert?.bodyEn).toContain("under the");
  });

  it("does not alert without a threshold", () => {
    expect(
      buildLowBalanceAlert({ ...lowBalance, thresholdMinor: null }),
    ).toBeNull();
  });

  it("fires again only after the balance has gone back above the threshold", () => {
    expect(
      buildLowBalanceAlert({ ...lowBalance, alreadyAlertedBelow: true }),
    ).toBeNull();
    expect(
      buildLowBalanceAlert({ ...lowBalance, balanceMinor: 25000 }),
    ).toBeNull();
  });
});

describe("unusual expense alerts", () => {
  const unusual = {
    amountMinor: 64000,
    currency: "EUR",
    excluded: false,
    internalTransfer: false,
    merchantName: "Fnac",
    transactionId: "tx-1",
    usualAmountMinor: 12800,
  };

  it("alerts on an expense about 5 times the usual amount", () => {
    const alert = buildUnusualExpenseAlert(unusual);
    expect(alert?.type).toBe("unusual_expense");
    expect(alert?.bodyEn).toContain("Fnac charged");
    expect(alert?.bodyEn).toContain("about 5 times what you usually spend there.");
  });

  it("never alerts for excluded transactions or internal transfers", () => {
    expect(
      buildUnusualExpenseAlert({ ...unusual, excluded: true }),
    ).toBeNull();
    expect(
      buildUnusualExpenseAlert({ ...unusual, internalTransfer: true }),
    ).toBeNull();
  });

  it("does not alert for a normal expense", () => {
    expect(
      buildUnusualExpenseAlert({ ...unusual, amountMinor: 15000 }),
    ).toBeNull();
  });
});

describe("notification alert settings", () => {
  it("turns each type off with one switch", () => {
    const settings = {
      ...DEFAULT_NOTIFICATION_ALERT_SETTINGS,
      budgetLine: false,
    };
    expect(isAlertTypeEnabled(settings, "budget_line_almost_used")).toBe(false);
    expect(isAlertTypeEnabled(settings, "low_balance")).toBe(true);
    expect(isAlertTypeEnabled(settings, "unusual_expense")).toBe(true);
  });
});

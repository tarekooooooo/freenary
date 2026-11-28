/**
 * New notification alerts, as described in #423, mirroring the one
 * existing type `transactions_to_check` (see `types.ts` and
 * `notifyTransactionsToCheck` in `categorisation/run.ts`).
 *
 * Each alert is raised once per line / account / transaction: callers
 * dedupe on `dedupeKey` (stored with the notification), so a later sync
 * does not raise the same alert again. Excluded accounts, excluded
 * transactions and internal transfers never raise an alert.
 */
export type AlertNotificationType =
  | "budget_line_almost_used"
  | "budget_line_used_up"
  | "low_balance"
  | "unusual_expense";

/** Fixed thresholds for v1 (see the PR notes): 80% then 100%. */
export const BUDGET_WARNING_THRESHOLD = 0.8;
export const BUDGET_FULL_THRESHOLD = 1;

/** An unusual expense is at least this many times the usual amount. */
export const UNUSUAL_EXPENSE_MULTIPLIER = 3;

export interface NotificationAlertSettings {
  budgetLine: boolean;
  lowBalance: boolean;
  unusualExpense: boolean;
}

export const DEFAULT_NOTIFICATION_ALERT_SETTINGS: NotificationAlertSettings =
  {
    budgetLine: true,
    lowBalance: true,
    unusualExpense: true,
  };

export function isAlertTypeEnabled(
  settings: NotificationAlertSettings,
  type: AlertNotificationType,
): boolean {
  if (type === "budget_line_almost_used" || type === "budget_line_used_up") {
    return settings.budgetLine;
  }
  if (type === "low_balance") return settings.lowBalance;
  return settings.unusualExpense;
}

export interface AlertDraft {
  type: AlertNotificationType;
  dedupeKey: string;
  titleEn: string;
  titleFr: string;
  bodyEn: string;
  bodyFr: string;
}

const formatAmount = (minor: number, currency: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 100,
  );

export interface BudgetLineInput {
  budgetMonth: string;
  categoryName: string;
  plannedMinor: number;
  actualMinor: number;
  daysLeft: number;
  currency: string;
}

export type BudgetAlertLevel = "warning" | "full" | null;

export function budgetLineAlertLevel(input: BudgetLineInput): BudgetAlertLevel {
  if (input.plannedMinor <= 0) return null;
  const ratio = input.actualMinor / input.plannedMinor;
  if (ratio >= BUDGET_FULL_THRESHOLD) return "full";
  if (ratio >= BUDGET_WARNING_THRESHOLD) return "warning";
  return null;
}

export function buildBudgetLineAlert(
  input: BudgetLineInput,
): AlertDraft | null {
  const level = budgetLineAlertLevel(input);
  if (level === null) return null;
  const percent = level === "full" ? 100 : 80;
  const type: AlertNotificationType =
    level === "full" ? "budget_line_used_up" : "budget_line_almost_used";
  return {
    bodyEn: `You have used ${percent}% of ${input.categoryName} for ${input.budgetMonth}, with ${input.daysLeft} days left.`,
    bodyFr:
      level === "full"
        ? `Vous avez utilisé 100 % de ${input.categoryName} pour ${input.budgetMonth}.`
        : `Vous avez utilisé 80 % de ${input.categoryName} pour ${input.budgetMonth}, il reste ${input.daysLeft} jours.`,
    dedupeKey: `budget:${input.budgetMonth}:${input.categoryName}:${level}`,
    titleEn: `${input.categoryName} budget ${percent}% used`,
    titleFr: `Budget ${input.categoryName} utilisé à ${percent} %`,
    type,
  };
}

export interface LowBalanceInput {
  accountId: string;
  accountName: string;
  balanceMinor: number;
  thresholdMinor: number | null;
  currency: string;
  /** True when an alert was already raised while below the threshold. */
  alreadyAlertedBelow: boolean;
}

export function lowBalanceShouldAlert(input: LowBalanceInput): boolean {
  if (input.thresholdMinor === null) return false;
  return (
    input.balanceMinor < input.thresholdMinor && !input.alreadyAlertedBelow
  );
}

export function buildLowBalanceAlert(input: LowBalanceInput): AlertDraft | null {
  if (!lowBalanceShouldAlert(input) || input.thresholdMinor === null) {
    return null;
  }
  return {
    bodyEn: `${input.accountName} is at ${formatAmount(input.balanceMinor, input.currency, "en")}, under the ${formatAmount(input.thresholdMinor, input.currency, "en")} you set.`,
    bodyFr: `${input.accountName} est à ${formatAmount(input.balanceMinor, input.currency, "fr")}, sous les ${formatAmount(input.thresholdMinor, input.currency, "fr")} que vous avez définis.`,
    dedupeKey: `low-balance:${input.accountId}`,
    titleEn: `Low balance on ${input.accountName}`,
    titleFr: `Solde faible sur ${input.accountName}`,
    type: "low_balance",
  };
}

export interface UnusualExpenseInput {
  transactionId: string;
  merchantName: string;
  amountMinor: number;
  usualAmountMinor: number;
  currency: string;
  excluded: boolean;
  internalTransfer: boolean;
}

export function unusualExpenseShouldAlert(
  input: UnusualExpenseInput,
): boolean {
  if (input.excluded || input.internalTransfer) return false;
  if (input.usualAmountMinor <= 0) return false;
  return input.amountMinor / input.usualAmountMinor >= UNUSUAL_EXPENSE_MULTIPLIER;
}

export function buildUnusualExpenseAlert(
  input: UnusualExpenseInput,
): AlertDraft | null {
  if (!unusualExpenseShouldAlert(input)) return null;
  const times = Math.round(input.amountMinor / input.usualAmountMinor);
  return {
    bodyEn: `${input.merchantName} charged ${formatAmount(input.amountMinor, input.currency, "en")}, about ${times} times what you usually spend there.`,
    bodyFr: `${input.merchantName} a facturé ${formatAmount(input.amountMinor, input.currency, "fr")}, soit environ ${times} fois ce que vous dépensez habituellement là-bas.`,
    dedupeKey: `unusual-expense:${input.transactionId}`,
    titleEn: `Unusual expense at ${input.merchantName}`,
    titleFr: `Dépense inhabituelle chez ${input.merchantName}`,
    type: "unusual_expense",
  };
}

/** Drop alerts whose dedupe key was already raised, so a sync never repeats one. */
export function filterNewAlerts(
  alerts: readonly AlertDraft[],
  raisedDedupeKeys: readonly string[],
): AlertDraft[] {
  const raised = new Set(raisedDedupeKeys);
  return alerts.filter((alert) => !raised.has(alert.dedupeKey));
}

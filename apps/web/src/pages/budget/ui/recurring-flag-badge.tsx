/**
 * Badges for a flagged recurring expense (#427), for use in
 * `recurring-table.tsx` and `recurring-insights.tsx`.
 *
 * Labels are in English and French. The price badge shows the old amount,
 * the new amount and the change date; the "possibly ended" badge shows
 * the month of the last payment ("No Basic-Fit payment since August.
 * Cancelled?") and invites the member to confirm or keep the item.
 */
export interface RecurringFlagBadgeProps {
  priceChange: {
    previousAmountMinor: number;
    currentAmountMinor: number;
    changedOn: Date;
  } | null;
  possiblyEnded: boolean;
  lastSeen: Date;
  currency: string;
  locale?: "en" | "fr";
}

export const RecurringFlagBadge = ({
  priceChange,
  possiblyEnded,
  lastSeen,
  currency,
  locale = "en",
}: RecurringFlagBadgeProps) => {
  if (!priceChange && !possiblyEnded) return null;
  const formatAmount = (minor: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      minor / 100,
    );
  const formatMonth = (date: Date) =>
    new Intl.DateTimeFormat(locale, { month: "long" }).format(date);
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
  return (
    <span className="flex flex-wrap gap-1">
      {priceChange && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
          {locale === "fr"
            ? `Prix passé de ${formatAmount(priceChange.previousAmountMinor)} à ${formatAmount(priceChange.currentAmountMinor)} le ${formatDate(priceChange.changedOn)}`
            : `Price changed from ${formatAmount(priceChange.previousAmountMinor)} to ${formatAmount(priceChange.currentAmountMinor)} on ${formatDate(priceChange.changedOn)}`}
        </span>
      )}
      {possiblyEnded && (
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900">
          {locale === "fr"
            ? `Aucun paiement depuis ${formatMonth(lastSeen)}. Résilié ?`
            : `No payment since ${formatMonth(lastSeen)}. Cancelled?`}
        </span>
      )}
    </span>
  );
};

export type CapacityNoticeSummary = {
  monthLabel: string;
  spotsLeft: number | null;
  totalCapacity: number | null;
  reservedCount: number | null;
  hasExactCount: boolean;
};

type CapacityNoticeVariant = "light" | "outline" | "dark";

function getVariantClasses(variant: CapacityNoticeVariant) {
  switch (variant) {
    case "outline":
      return {
        wrapper: "border border-violet-100 bg-violet-50/70 text-violet-950",
        badge: "bg-white text-violet-700 border border-violet-200",
        headline: "text-violet-950",
        body: "text-violet-900/80",
        footnote: "text-violet-900/70",
      };
    case "dark":
      return {
        wrapper: "border border-white/10 bg-white/10 text-white",
        badge: "bg-white/15 text-orange-200 border border-white/10",
        headline: "text-white",
        body: "text-gray-200",
        footnote: "text-gray-300",
      };
    case "light":
    default:
      return {
        wrapper: "border border-orange-100 bg-white/90 text-gray-900 shadow-sm",
        badge: "bg-orange-50 text-orange-700 border border-orange-100",
        headline: "text-gray-900",
        body: "text-gray-600",
        footnote: "text-gray-500",
      };
  }
}

export default function CapacityNotice({
  summary,
  variant = "light",
  compact = false,
  className = "",
}: {
  summary: CapacityNoticeSummary;
  variant?: CapacityNoticeVariant;
  compact?: boolean;
  className?: string;
}) {
  const classes = getVariantClasses(variant);
  const headline = summary.hasExactCount
    ? `This month: ${summary.spotsLeft ?? 0} onboarding spots left`
    : "Limited onboarding capacity this month";
  const footnote =
    summary.hasExactCount && (summary.spotsLeft ?? 0) <= 0
      ? "If this month fills up, you can still sign up and join the next review window."
      : null;

  return (
    <div
      className={`rounded-2xl ${compact ? "p-4" : "p-5"} ${classes.wrapper} ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${classes.badge}`}
        >
          <span className="h-2 w-2 rounded-full bg-orange-500" />
          Limited monthly intake
        </span>
        {summary.hasExactCount && (
          <span className={`text-xs font-medium ${classes.footnote}`}>
            {summary.monthLabel}
          </span>
        )}
      </div>
      <p className={`mt-3 text-base font-semibold ${classes.headline}`}>{headline}</p>
      <p className={`mt-1.5 text-sm leading-relaxed ${classes.body}`}>
        Reviewed and approved by our team before a spot is reserved. Every client is
        paired with a real account manager, so intake stays intentionally limited.
      </p>
      {footnote && (
        <p className={`mt-2 text-xs leading-relaxed ${classes.footnote}`}>{footnote}</p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import type {
  OutcomeSummary,
  Segment,
  KeyedSegment,
} from "@/lib/application-outcomes-summary";

function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

function ratio(seg: Segment): string {
  return `${seg.interviews}/${seg.applications}`;
}

const WINDOWS = [
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 180, label: "180d" },
  { days: 365, label: "1y" },
];

function SegmentRow({
  label,
  seg,
  minSample,
}: {
  label: string;
  seg: Segment;
  minSample: number;
}) {
  const low = seg.applications < minSample;
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">{ratio(seg)}</span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            low ? "text-gray-400" : "text-gray-900"
          }`}
          title={low ? `Below ${minSample} applications — too few to report` : ""}
        >
          {low ? "—" : pct(seg.rate)}
        </span>
      </div>
    </div>
  );
}

function CompareCard({
  title,
  a,
  b,
  minSample,
}: {
  title: string;
  a: { label: string; seg: Segment };
  b: { label: string; seg: Segment };
  minSample: number;
}) {
  const both =
    a.seg.rate != null && b.seg.rate != null
      ? Math.round((a.seg.rate - b.seg.rate) * 100)
      : null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <SegmentRow label={a.label} seg={a.seg} minSample={minSample} />
      <SegmentRow label={b.label} seg={b.seg} minSample={minSample} />
      {both != null && (
        <p className="mt-2 text-xs text-gray-500">
          {both === 0
            ? "No difference in this window."
            : `${a.label} converts ${Math.abs(both)} pts ${
                both > 0 ? "higher" : "lower"
              } — correlation, not proven cause.`}
        </p>
      )}
    </div>
  );
}

function SegmentTable({
  title,
  rows,
  minSample,
  labelFor,
}: {
  title: string;
  rows: KeyedSegment[];
  minSample: number;
  labelFor?: (key: string) => string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No data yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 text-left">
              <th className="font-medium py-1">Segment</th>
              <th className="font-medium py-1 text-right">Interviews / Apps</th>
              <th className="font-medium py-1 text-right">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const low = r.applications < minSample;
              return (
                <tr key={r.key} className="border-t border-gray-100">
                  <td className="py-2 text-gray-700">
                    {labelFor ? labelFor(r.key) : r.key}
                  </td>
                  <td className="py-2 text-right text-gray-400 text-xs tabular-nums">
                    {ratio(r)}
                  </td>
                  <td
                    className={`py-2 text-right font-semibold tabular-nums ${
                      low ? "text-gray-400" : "text-gray-900"
                    }`}
                  >
                    {low ? "—" : pct(r.rate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function ConversionClient({
  summary,
  amNames,
  days,
  totalApplications,
}: {
  summary: OutcomeSummary;
  amNames: Record<string, string>;
  days: number;
  totalApplications: number;
}) {
  const { overall, min_sample } = summary;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Interview Conversion</h1>
          <p className="text-sm text-gray-500">
            Application → interview rate by segment, last {days} days.
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <Link
              key={w.days}
              href={`?days=${w.days}`}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                w.days === days
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {w.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Honesty banner */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed">
        These are conversion rates <strong>by segment</strong>, not proven cause.
        Tailored / high-score applications often also target better-fit roles, so
        a higher rate is correlation. Segments under {min_sample} applications show
        “—” to avoid reading noise as signal. A causal number needs a randomized
        holdout (planned v2).
      </div>

      {/* Overall */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-8">
        <div>
          <div className="text-4xl font-bold text-indigo-600 tabular-nums">
            {overall.applications < min_sample ? "—" : pct(overall.rate)}
          </div>
          <div className="text-xs text-gray-500 mt-1">Overall conversion</div>
        </div>
        <div className="text-sm text-gray-600 space-y-1">
          <div>
            <span className="font-semibold text-gray-900 tabular-nums">
              {totalApplications}
            </span>{" "}
            applications
          </div>
          <div>
            <span className="font-semibold text-gray-900 tabular-nums">
              {overall.interviews}
            </span>{" "}
            interviews
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CompareCard
          title="Résumé tailoring"
          a={{ label: "Tailored", seg: summary.by_tailored.tailored }}
          b={{ label: "Base résumé", seg: summary.by_tailored.untailored }}
          minSample={min_sample}
        />
        <CompareCard
          title="AI-drafted answers"
          a={{ label: "Used AI answers", seg: summary.by_ai_usage.with_ai }}
          b={{ label: "No AI answers", seg: summary.by_ai_usage.without_ai }}
          minSample={min_sample}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SegmentTable
          title="By match-score band"
          rows={summary.by_score_band}
          minSample={min_sample}
        />
        <SegmentTable
          title="By ATS"
          rows={summary.by_ats}
          minSample={min_sample}
        />
      </div>

      <SegmentTable
        title="By account manager"
        rows={summary.by_am}
        minSample={min_sample}
        labelFor={(key) => amNames[key] ?? key}
      />
    </div>
  );
}

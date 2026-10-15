import { money, shortDate } from "@/lib/format";
import type { FinancialDay } from "@/services/admin";

// Plain SVG bars: deposits against withdrawals for each day. No chart library.
export function FlowChart({ series, currency }: { series: FinancialDay[]; currency: string }) {
  const W = 720, H = 220, top = 12, bottom = 26;
  const max = Math.max(1, ...series.flatMap((d) => [d.deposits, d.withdrawals]));
  const slot = W / Math.max(series.length, 1);
  const bar = Math.max(1.5, Math.min(14, slot * 0.38));
  const y = (value: number) => top + (H - top - bottom) * (1 - value / max);
  const base = H - bottom;
  const first = series[0];
  const last = series.at(-1);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily deposits and withdrawals in ${currency}`} className="w-full">
        <line x1="0" x2={W} y1={base} y2={base} className="stroke-line" />
        {series.map((d, i) => {
          const x = i * slot + slot / 2;
          return (
            <g key={d.day}>
              <title>{`${shortDate(d.day)}: deposits ${money(d.deposits, currency)}, withdrawals ${money(d.withdrawals, currency)}`}</title>
              <rect x={x - bar - 0.5} width={bar} y={y(d.deposits)} height={base - y(d.deposits)} rx="1.5" className="fill-brand" />
              <rect x={x + 0.5} width={bar} y={y(d.withdrawals)} height={base - y(d.withdrawals)} rx="1.5" className="fill-coin" />
            </g>
          );
        })}
        {first && <text x="0" y={H - 6} className="fill-muted text-[11px]">{shortDate(first.day)}</text>}
        {last && <text x={W} y={H - 6} textAnchor="end" className="fill-muted text-[11px]">{shortDate(last.day)}</text>}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand" />Deposits</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-coin" />Withdrawals</span>
        <span className="ml-auto">Tallest bar: {money(max, currency)}</span>
      </figcaption>
    </figure>
  );
}

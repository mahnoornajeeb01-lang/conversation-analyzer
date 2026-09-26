"use client";

import { useEffect, useRef, useState } from "react";

/** Track an element's rendered width so SVG charts can draw at true pixel size. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round axis ticks (0, 0.5, 1, 1.5…) covering `value` in roughly `count` steps. */
function niceTicks(value: number, count = 4, integer = false): number[] {
  const raw = Math.max(value, integer ? 1 : 0.1) / count;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  let step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  if (integer) step = Math.max(1, Math.round(step));
  const ticks = [0];
  while (ticks[ticks.length - 1] < value - 1e-9) ticks.push(+(ticks[ticks.length - 1] + step).toFixed(6));
  return ticks;
}

export function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      className="keep-palette pointer-events-none absolute z-30 ring-1 ring-white/10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-xl"
      style={{ left: x, top: y - 8 }}
    >
      {children}
    </div>
  );
}

export interface Column {
  key: string;
  value: number;
  color: string;
  tooltip: React.ReactNode;
  onClick?: () => void;
}

/** Vertical columns on one baseline with a recessive grid and an optional reference line. */
export function ColumnChart({
  data,
  height = 220,
  format = (v) => v.toFixed(1),
  reference,
  xLabel,
  integer = false,
  emptyText = "No data",
}: {
  data: Column[];
  height?: number;
  format?: (v: number) => string;
  reference?: { value: number; label: string };
  xLabel?: (index: number) => string;
  /** Counts: keep axis ticks on whole numbers. */
  integer?: boolean;
  emptyText?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = xLabel ? 26 : 10;
  const plotW = Math.max(width - padL - padR, 0);
  const plotH = height - padT - padB;
  const ticks = niceTicks(Math.max(...data.map((d) => d.value), reference?.value ?? 0), 4, integer);
  const max = ticks[ticks.length - 1] || 1;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(Math.min(24, band * 0.62), 2);
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  if (!data.length) {
    return <p className="py-10 text-center text-sm text-slate-500">{emptyText}</p>;
  }

  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(plotW / 44, 1)));

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} style={{ stroke: t === 0 ? "var(--chart-axis)" : "var(--chart-grid)" }} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-400 font-mono text-[10px]">
                {format(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const cx = padL + band * i + band / 2;
            const top = y(d.value);
            const h = Math.max(padT + plotH - top, d.value > 0 ? 2 : 0);
            const r = Math.min(4, barW / 2, h);
            const x0 = cx - barW / 2;
            const base = padT + plotH;
            const path = `M${x0},${base} V${base - h + r} Q${x0},${base - h} ${x0 + r},${base - h} H${x0 + barW - r} Q${x0 + barW},${base - h} ${x0 + barW},${base - h + r} V${base} Z`;
            const dim = hover !== null && hover !== i;
            return (
              <g key={d.key}>
                <path d={path} style={{ fill: d.color }} opacity={dim ? 0.35 : 1} className="transition-opacity" />
                <rect
                  x={padL + band * i}
                  y={padT}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  className={d.onClick ? "cursor-pointer" : undefined}
                  onMouseEnter={() => setHover(i)}
                  onClick={d.onClick}
                />
                {xLabel && i % labelEvery === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-slate-400 font-mono text-[10px]">
                    {xLabel(i)}
                  </text>
                )}
              </g>
            );
          })}

          {reference && reference.value > 0 && (
            <g>
              <line x1={padL} x2={width - padR} y1={y(reference.value)} y2={y(reference.value)} style={{ stroke: "var(--chart-ink)" }} strokeOpacity={0.55} />
              {/* White halo keeps the label legible where it crosses a column. */}
              <text
                x={padL + 6}
                y={y(reference.value) - 5}
                style={{ stroke: "var(--color-surface)" }}
                strokeWidth={4}
                paintOrder="stroke"
                strokeLinejoin="round"
                className="fill-slate-700 text-[10px] font-semibold"
              >
                {reference.label}
              </text>
            </g>
          )}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={padL + band * hover + band / 2} y={y(data[hover].value)}>
          {data[hover].tooltip}
        </Tooltip>
      )}
    </div>
  );
}

export interface BarRow {
  key: string;
  label: React.ReactNode;
  value: number;
  display: string;
  color: string;
  tooltip?: React.ReactNode;
}

/** Horizontal bars for comparing a handful of named values; value label at the tip. */
export function BarList({ rows, max }: { rows: BarRow[]; max?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const top = max ?? Math.max(...rows.map((r) => r.value), 0);
  return (
    <div className="space-y-3.5">
      {rows.map((row) => (
        <div
          key={row.key}
          className="group relative"
          onMouseEnter={() => setHover(row.key)}
          onMouseLeave={() => setHover(null)}
        >
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">{row.label}</span>
            <span className="shrink-0 font-mono text-xs font-medium text-slate-900">{row.display}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-[width,filter] duration-500 group-hover:brightness-110"
              style={{ width: `${top > 0 ? Math.max((row.value / top) * 100, row.value > 0 ? 1.5 : 0) : 0}%`, background: row.color }}
            />
          </div>
          {hover === row.key && row.tooltip && (
            <div className="keep-palette pointer-events-none absolute right-0 top-0 z-30 -translate-y-full rounded-lg bg-slate-900 ring-1 ring-white/10 px-3 py-2 text-xs text-white shadow-xl">
              {row.tooltip}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export interface StackPart {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** 100% stacked bar with 2px surface gaps; hover a segment for its share. */
export function StackedBar({ parts, height = 14 }: { parts: StackPart[]; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const segments: (StackPart & { pct: number; mid: number })[] = [];
  let offset = 0;
  for (const p of parts) {
    const pct = (p.value / total) * 100;
    if (pct < 0.5) continue;
    segments.push({ ...p, pct, mid: offset + pct / 2 });
    offset += pct;
  }
  const active = segments.find((s) => s.key === hover);

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div className="flex w-full gap-[2px] overflow-hidden rounded-full" style={{ height }}>
        {segments.map((s) => (
          <div
            key={s.key}
            onMouseEnter={() => setHover(s.key)}
            className="h-full transition-opacity"
            style={{ width: `${s.pct}%`, background: s.color, opacity: hover && hover !== s.key ? 0.4 : 1 }}
          />
        ))}
      </div>
      {active && (
        <div
          className="keep-palette pointer-events-none absolute z-30 ring-1 ring-white/10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-xl"
          style={{ left: `${active.mid}%`, top: -6 }}
        >
          {active.label}: <strong>{Math.round(active.pct)}%</strong>
        </div>
      )}
    </div>
  );
}

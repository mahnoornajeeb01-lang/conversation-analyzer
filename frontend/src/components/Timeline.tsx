"use client";

import { Flame, MessagesSquare, MinusCircle, type LucideIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { formatClock, type SpeakerMeta } from "@/lib/format";
import type { AnalysisReport, Classification } from "@/lib/types";

export const CLASSIFICATION_META: Record<
  Classification,
  { icon: LucideIcon; short: string; description: string; color: string; chip: string }
> = {
  "Successful Interruption (Floor Transfer)": {
    icon: Flame,
    short: "Floor transfer",
    description: "The interrupter took over and the other speaker stopped.",
    color: "#d03b3b",
    chip: "border-red-200 bg-red-50 text-red-700",
  },
  "Competitive Overlap / Backchannel": {
    icon: MessagesSquare,
    short: "Backchannel",
    description: "Both kept talking, e.g. “mm-hm” or competing for the floor.",
    color: "#eda100",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
  },
  "Brief Overlap": {
    icon: MinusCircle,
    short: "Brief overlap",
    description: "A short, incidental overlap at a turn boundary.",
    color: "#8f8d86",
    chip: "border-slate-200 bg-slate-50 text-slate-600",
  },
};

function buildTicks(totalDuration: number, targetCount = 8): number[] {
  if (totalDuration <= 0) return [0];
  const rawStep = totalDuration / targetCount;
  const niceSteps = [1, 2, 5, 10, 15, 20, 30, 60, 90, 120, 180, 300, 600];
  const step = niceSteps.find((s) => s >= rawStep) ?? Math.ceil(rawStep);
  const ticks: number[] = [];
  for (let t = 0; t <= totalDuration; t += step) ticks.push(t);
  if (totalDuration - ticks[ticks.length - 1] > step * 0.4) ticks.push(totalDuration);
  return ticks;
}

interface Block {
  start: number;
  end: number;
  color: string;
  tip: string;
}

export default function Timeline({
  report,
  speakers,
  currentTime,
  onSeek,
  showInterruptions = true,
}: {
  report: AnalysisReport;
  speakers: Record<string, SpeakerMeta>;
  currentTime: number;
  onSeek: (seconds: number) => void;
  showInterruptions?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const total = report.total_duration;
  const ticks = useMemo(() => buildTicks(total), [total]);

  const lanes = useMemo(() => {
    return report.speakers.map((label) => {
      const meta = speakers[label];
      const blocks: Block[] = report.segments
        .filter((s) => s.speaker === label)
        .map((s) => ({
          start: s.start,
          end: s.end,
          color: meta?.color ?? "#64748b",
          tip: `${meta?.name ?? label} · ${formatClock(s.start)} – ${formatClock(s.end)} (${(s.end - s.start).toFixed(1)}s)`,
        }));
      return { label, meta, blocks };
    });
  }, [report, speakers]);

  if (total <= 0) return null;
  const playheadPct = Math.min((currentTime / total) * 100, 100);

  const showTip = (event: React.MouseEvent, text: string) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: event.clientX - rect.left, y: event.clientY - rect.top, text });
  };

  const handleTrackClick = (event: React.MouseEvent) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const labelW = 112;
    const x = event.clientX - rect.left - labelW;
    const w = rect.width - labelW;
    if (x >= 0) onSeek((x / w) * total);
  };

  return (
    <div className="select-none">
      <div ref={trackRef} className="relative" onMouseLeave={() => setTip(null)}>
        {showInterruptions && report.interruptions.length > 0 && (
          <div className="relative ml-28 h-7">
            {report.interruptions.map((event, idx) => {
              const meta = CLASSIFICATION_META[event.classification];
              const Icon = meta.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  aria-label={`${meta.short} at ${formatClock(event.timestamp)}`}
                  onMouseMove={(e) =>
                    showTip(
                      e,
                      `${speakers[event.interrupter]?.name ?? event.interrupter} over ${
                        speakers[event.interrupted]?.name ?? event.interrupted
                      } · ${meta.short} · ${event.overlap_duration.toFixed(2)}s`,
                    )
                  }
                  onClick={() => onSeek(event.timestamp)}
                  style={{ left: `${(event.timestamp / total) * 100}%` }}
                  className={`absolute top-0.5 -translate-x-1/2 rounded-full border p-1 transition-transform hover:scale-125 ${meta.chip}`}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        )}

        <div onClick={handleTrackClick} className="cursor-pointer space-y-2">
          {lanes.map(({ label, meta, blocks }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="flex w-25 shrink-0 items-center gap-2 overflow-hidden">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta?.color }} />
                <span className="truncate text-xs font-medium text-slate-700">{meta?.name ?? label}</span>
              </div>
              <div className="relative h-8 flex-1 rounded-lg bg-slate-50 ring-1 ring-slate-100 ring-inset">
                {report.overlaps.map((o, i) => (
                  <div
                    key={`o${i}`}
                    className="absolute inset-y-0 bg-rose-400/15"
                    style={{ left: `${(o.start / total) * 100}%`, width: `${Math.max((o.duration / total) * 100, 0.3)}%` }}
                  />
                ))}
                {blocks.map((b, i) => (
                  <div
                    key={i}
                    onMouseMove={(e) => showTip(e, b.tip)}
                    onMouseLeave={() => setTip(null)}
                    className="absolute top-1.5 bottom-1.5 rounded-[4px] transition hover:top-1 hover:bottom-1 hover:brightness-110"
                    style={{
                      left: `${(b.start / total) * 100}%`,
                      width: `max(calc(${((b.end - b.start) / total) * 100}% - 2px), 2px)`,
                      background: b.color,
                    }}
                  />
                ))}
                <div
                  className="pointer-events-none absolute inset-y-0 w-0.5 bg-slate-900/80"
                  style={{ left: `${playheadPct}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-2 ml-28 h-4 font-mono text-[10px] text-slate-400">
          {ticks.map((t, i) => (
            <span
              key={t}
              // The end label sits flush with the track's right edge; on phones only every other label fits.
              className={`absolute ${t === total ? "-translate-x-full" : "-translate-x-1/2"} ${
                i % 2 === 1 && t !== total ? "max-sm:hidden" : ""
              } ${i === ticks.length - 2 && ticks[ticks.length - 1] === total ? "max-sm:hidden" : ""}`}
              style={{ left: `${(t / total) * 100}%` }}
            >
              {formatClock(t)}
            </span>
          ))}
        </div>

        {tip && (
          <div
            className="keep-palette pointer-events-none absolute z-30 ring-1 ring-white/10 max-w-xs -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-3 py-2 text-xs whitespace-pre-line text-white shadow-xl"
            style={{ left: tip.x, top: tip.y - 10 }}
          >
            {tip.text}
          </div>
        )}
      </div>
    </div>
  );
}

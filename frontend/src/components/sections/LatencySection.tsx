"use client";

import { Play, Timer } from "lucide-react";
import { useMemo } from "react";
import { Cell, Column, Row, Table, TableBody, TableHeader } from "react-aria-components";

import { BarList, ColumnChart } from "@/components/charts";
import { Card, EmptyState, Insight, MiniStat, PageHeader } from "@/components/ui";
import { formatClock, formatSeconds, speakerName, type SpeakerMeta } from "@/lib/format";
import type { AnalysisReport } from "@/lib/types";

const BANDS = [
  { label: "< 0.2s", sub: "Instant", max: 0.2 },
  { label: "0.2–0.5s", sub: "Quick", max: 0.5 },
  { label: "0.5–1s", sub: "Natural", max: 1 },
  { label: "1–2s", sub: "Slow", max: 2 },
  { label: "2s +", sub: "Long pause", max: Infinity },
];

function bandOf(seconds: number) {
  return BANDS.findIndex((b) => seconds < b.max);
}

const BAND_CHIP = [
  "bg-emerald-50 text-emerald-700",
  "bg-emerald-50 text-emerald-700",
  "bg-slate-100 text-slate-600",
  "bg-amber-50 text-amber-700",
  "bg-red-50 text-red-700",
];

export default function LatencySection({
  report,
  speakers,
  onSeek,
}: {
  report: AnalysisReport;
  speakers: Record<string, SpeakerMeta>;
  onSeek: (seconds: number) => void;
}) {
  const stats = report.latency_stats;

  const perSpeaker = useMemo(() => {
    return report.speakers
      .map((s) => {
        const replies = report.latencies.filter((l) => l.next_speaker === s);
        const avg = replies.length ? replies.reduce((a, l) => a + l.latency_seconds, 0) / replies.length : 0;
        return { speaker: s, avg, count: replies.length };
      })
      .filter((r) => r.count > 0);
  }, [report]);

  const histogram = useMemo(() => {
    const counts = BANDS.map(() => 0);
    for (const l of report.latencies) counts[bandOf(l.latency_seconds)] += 1;
    return counts;
  }, [report]);

  const fastest = perSpeaker.length > 1 ? [...perSpeaker].sort((a, b) => a.avg - b.avg)[0] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Layer 01"
        title="Response Latency"
        description="How long each speaker waits before replying: the silence between one person finishing and the other starting. Around 0.2–1s feels natural in conversation."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStat label="Average" value={formatSeconds(stats.average)} hint={`${stats.total_turns_analyzed} hand-offs`} />
        <MiniStat label="Median" value={formatSeconds(stats.median)} hint="typical reply" />
        <MiniStat label="Fastest" value={formatSeconds(stats.minimum)} />
        <MiniStat label="Slowest" value={formatSeconds(stats.maximum)} />
      </div>

      {report.latencies.length === 0 ? (
        <Card>
          <EmptyState
            icon={Timer}
            title="No clean hand-offs"
            text="Latency is measured when one speaker finishes and another starts after a gap. None were found, often because turns overlap."
          />
        </Card>
      ) : (
        <>
          <Card
            title="Latency per turn"
            subtitle="Each column is one hand-off, coloured by who replied. Click a column to hear it."
            action={
              <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                {perSpeaker.map((r) => (
                  <span key={r.speaker} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: speakers[r.speaker]?.color }} />
                    {speakerName(speakers, r.speaker)} replies
                  </span>
                ))}
              </div>
            }
          >
            <ColumnChart
              height={260}
              format={(v) => `${v.toFixed(1)}s`}
              reference={{ value: stats.average, label: `average ${stats.average.toFixed(2)}s` }}
              xLabel={(i) => `#${i + 1}`}
              data={report.latencies.map((l, i) => ({
                key: String(i),
                value: l.latency_seconds,
                color: speakers[l.next_speaker]?.color ?? "#64748b",
                onClick: () => onSeek(Math.max(l.previous_end - 1.5, 0)),
                tooltip: (
                  <>
                    <p className="font-semibold">
                      Turn #{i + 1} · {formatClock(l.next_start)}
                    </p>
                    <p className="text-slate-300">
                      {speakerName(speakers, l.next_speaker)} replied to {speakerName(speakers, l.previous_speaker)}
                    </p>
                    <p className="mt-1 text-sm font-semibold">{l.latency_seconds.toFixed(2)}s</p>
                  </>
                ),
              }))}
            />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Average reply time by speaker" subtitle="How quickly each person responds to the other">
              <BarList
                rows={perSpeaker.map((r) => ({
                  key: r.speaker,
                  label: speakerName(speakers, r.speaker),
                  value: r.avg,
                  display: formatSeconds(r.avg),
                  color: speakers[r.speaker]?.color ?? "#64748b",
                  tooltip: `${r.count} replies`,
                }))}
              />
              {fastest && (
                <Insight>
                  <strong className="text-slate-900">{speakerName(speakers, fastest.speaker)}</strong> responds fastest,
                  averaging {formatSeconds(fastest.avg)} before speaking.
                </Insight>
              )}
            </Card>

            <Card title="Latency distribution" subtitle="Number of hand-offs in each timing band">
              <ColumnChart
                height={200}
                format={(v) => String(Math.round(v))}
                integer
                xLabel={(i) => BANDS[i].label}
                data={histogram.map((count, i) => ({
                  key: BANDS[i].label,
                  value: count,
                  color: "var(--color-violet-500)",
                  tooltip: (
                    <>
                      <p className="font-semibold">{BANDS[i].sub}</p>
                      <p className="text-slate-300">
                        {count} hand-off{count === 1 ? "" : "s"} · {BANDS[i].label}
                      </p>
                    </>
                  ),
                }))}
              />
            </Card>
          </div>

          <Card title="All hand-offs" subtitle="Click a row to play the moment before the reply" bodyClassName="p-0">
            <div className="scroll-thin max-h-96 overflow-auto">
              <Table
                aria-label="All hand-offs"
                onRowAction={(key) => {
                  const l = report.latencies[Number(key)];
                  if (l) onSeek(Math.max(l.previous_end - 1.5, 0));
                }}
                className="w-full min-w-[520px] text-sm"
              >
                <TableHeader className="sticky top-0 z-10 bg-surface-solid text-[11px] tracking-wide text-slate-500 uppercase shadow-[inset_0_-1px_0_var(--color-slate-100)]">
                  <Column className="w-14 px-5 py-2.5 text-left font-medium outline-none">#</Column>
                  <Column className="px-3 py-2.5 text-left font-medium outline-none">Time</Column>
                  <Column isRowHeader className="px-3 py-2.5 text-left font-medium outline-none">
                    From → To
                  </Column>
                  <Column className="px-3 py-2.5 text-right font-medium outline-none">Latency</Column>
                  <Column className="px-5 py-2.5 text-right font-medium outline-none">Pace</Column>
                </TableHeader>
                <TableBody>
                  {report.latencies.map((l, i) => {
                    const band = bandOf(l.latency_seconds);
                    return (
                      <Row
                        key={i}
                        id={i}
                        className="group cursor-pointer border-b border-slate-100 outline-none last:border-b-0 hover:bg-slate-50 focus-visible:bg-violet-50 pressed:bg-slate-100"
                      >
                        <Cell className="px-5 py-2.5 font-mono text-xs text-slate-400 tabular-nums">{i + 1}</Cell>
                        <Cell className="px-3 py-2.5 font-mono text-xs text-slate-600 tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            <Play className="h-3 w-3 text-slate-300 group-hover:text-violet-500" />
                            {formatClock(l.next_start)}
                          </span>
                        </Cell>
                        <Cell className="px-3 py-2.5 text-slate-700">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: speakers[l.previous_speaker]?.color }} />
                            {speakerName(speakers, l.previous_speaker)}
                            <span className="text-slate-300">→</span>
                            <span className="h-2 w-2 rounded-full" style={{ background: speakers[l.next_speaker]?.color }} />
                            {speakerName(speakers, l.next_speaker)}
                          </span>
                        </Cell>
                        <Cell className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                          {l.latency_seconds.toFixed(2)}s
                        </Cell>
                        <Cell className="px-5 py-2.5 text-right">
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${BAND_CHIP[band]}`}>
                            {BANDS[band].sub}
                          </span>
                        </Cell>
                      </Row>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

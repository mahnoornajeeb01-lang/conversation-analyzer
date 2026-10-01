"use client";

import { Zap } from "lucide-react";
import { useMemo } from "react";
import { GridList, GridListItem } from "react-aria-components";

import { BarList, StackedBar } from "@/components/charts";
import Timeline, { CLASSIFICATION_META } from "@/components/Timeline";
import { Card, EmptyState, Insight, Legend, MiniStat, PageHeader } from "@/components/ui";
import { formatClock, speakerName, type SpeakerMeta } from "@/lib/format";
import type { AnalysisReport, Classification } from "@/lib/types";
import { Reveal, Stagger } from "@/components/motion";

const CLASS_ORDER: Classification[] = [
  "Successful Interruption (Floor Transfer)",
  "Competitive Overlap / Backchannel",
  "Brief Overlap",
];

export default function InterruptionsSection({
  report,
  speakers,
  currentTime,
  onSeek,
}: {
  report: AnalysisReport;
  speakers: Record<string, SpeakerMeta>;
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  const counts = useMemo(() => {
    const c = Object.fromEntries(CLASS_ORDER.map((k) => [k, 0])) as Record<Classification, number>;
    for (const e of report.interruptions) c[e.classification] += 1;
    return c;
  }, [report]);

  const byInterrupter = useMemo(
    () =>
      report.speakers.map((s) => {
        const events = report.interruptions.filter((e) => e.interrupter === s);
        return {
          speaker: s,
          total: events.length,
          floor: events.filter((e) => e.classification === "Successful Interruption (Floor Transfer)").length,
        };
      }),
    [report],
  );

  const overlapSeconds = report.overlaps.reduce((s, o) => s + o.duration, 0);
  const overlapShare = report.total_duration ? overlapSeconds / report.total_duration : 0;

  return (
    <Stagger root className="space-y-6">
      <Reveal>
        <PageHeader
          eyebrow="Layer 02"
          title="Interruptions"
          description="Moments when both people spoke at once, classified by what happened next: did the interrupter take over, did both keep talking, or was it just a brief overlap?"
        />
      </Reveal>

      <Reveal>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MiniStat label="Interruptions" value={report.interruption_count} />
          <MiniStat label="Floor transfers" value={report.successful_interruption_count} hint="interrupter took over" />
          <MiniStat label="Overlapping speech" value={`${overlapSeconds.toFixed(1)}s`} hint={`${(overlapShare * 100).toFixed(1)}% of the recording`} />
          <MiniStat label="Overlap events" value={report.overlap_count} />
        </div>
      </Reveal>

      <Reveal>
        {report.interruptions.length === 0 ? (
          <Card>
            <EmptyState
              icon={Zap}
              title="No interruptions"
              text="The speakers never talked over each other in this recording. Every turn was taken cleanly."
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="What kind of interruptions" subtitle="Share of all overlap events by outcome">
                <StackedBar
                  height={16}
                  parts={CLASS_ORDER.map((k) => ({
                    key: k,
                    label: CLASSIFICATION_META[k].short,
                    value: counts[k],
                    color: CLASSIFICATION_META[k].color,
                  }))}
                />
                <ul className="mt-5 space-y-2">
                  {CLASS_ORDER.map((k) => {
                    const meta = CLASSIFICATION_META[k];
                    const Icon = meta.icon;
                    return (
                      <li
                        key={k}
                        className="flex items-center gap-3 rounded-lg border border-slate-100 p-3"
                      >
                        <span className={`rounded-lg border p-1.5 ${meta.chip}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-800">{meta.short}</span>
                          <span className="block text-xs text-slate-500">{meta.description}</span>
                        </span>
                        <span className="text-lg font-semibold text-slate-900 tabular-nums">{counts[k]}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              <Card title="Who interrupts whom" subtitle="Interruptions started by each speaker">
                <BarList
                  rows={byInterrupter.map((r) => ({
                    key: r.speaker,
                    label: speakerName(speakers, r.speaker),
                    value: r.total,
                    display: `${r.total} (${r.floor} took floor)`,
                    color: speakers[r.speaker]?.color ?? "#64748b",
                    tooltip: `${speakerName(speakers, r.speaker)} started ${r.total} overlap${r.total === 1 ? "" : "s"}`,
                  }))}
                />
                {(() => {
                  const top = [...byInterrupter].sort((a, b) => b.total - a.total)[0];
                  const second = [...byInterrupter].sort((a, b) => b.total - a.total)[1];
                  if (!top || top.total === 0) return null;
                  return (
                    <Insight>
                      {second && top.total === second.total ? (
                        <>Both speakers interrupted equally often.</>
                      ) : (
                        <>
                          <strong className="text-slate-900">{speakerName(speakers, top.speaker)}</strong> interrupts
                          most, starting {top.total} of {report.interruption_count} overlaps.
                        </>
                      )}
                    </Insight>
                  );
                })()}
              </Card>
            </div>

            <Card
              title="Where interruptions happen"
              subtitle="Markers above the lanes show each event; shaded bands are overlapping speech"
              action={<Legend items={CLASS_ORDER.map((k) => ({ label: CLASSIFICATION_META[k].short, color: CLASSIFICATION_META[k].color }))} />}
            >
              <Timeline report={report} speakers={speakers} currentTime={currentTime} onSeek={onSeek} />
            </Card>

            <Card title="Interruption log" subtitle="Click an event to play it" bodyClassName="p-0">
              <GridList
                aria-label="Interruption log"
                onAction={(key) => {
                  const event = report.interruptions[Number(key)];
                  if (event) onSeek(Math.max(event.timestamp - 1, 0));
                }}
                className="scroll-thin max-h-96 divide-y divide-slate-100 overflow-y-auto outline-none"
              >
                {report.interruptions.map((event, idx) => {
                  const meta = CLASSIFICATION_META[event.classification];
                  const Icon = meta.icon;
                  return (
                    <GridListItem
                      key={idx}
                      id={idx}
                      textValue={`${speakerName(speakers, event.interrupter)} talked over ${speakerName(speakers, event.interrupted)} at ${formatClock(event.timestamp)}`}
                      className="flex cursor-pointer items-center gap-4 px-5 py-3 outline-none hover:bg-slate-50 focus-visible:bg-violet-50 pressed:bg-slate-100"
                    >
                      <span className={`rounded-lg border p-1.5 ${meta.chip}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm text-slate-800">
                          <span className="h-2 w-2 rounded-full" style={{ background: speakers[event.interrupter]?.color }} />
                          <strong className="font-semibold">{speakerName(speakers, event.interrupter)}</strong>
                          <span className="text-slate-400">talked over</span>
                          <span className="h-2 w-2 rounded-full" style={{ background: speakers[event.interrupted]?.color }} />
                          <strong className="font-semibold">{speakerName(speakers, event.interrupted)}</strong>
                        </span>
                        <span className="text-xs text-slate-500">{meta.short}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-slate-500">
                        <span className="block font-mono font-medium text-slate-800 tabular-nums">{formatClock(event.timestamp)}</span>
                        {event.overlap_duration.toFixed(2)}s overlap
                      </span>
                    </GridListItem>
                  );
                })}
              </GridList>
            </Card>
          </>
        )}
      </Reveal>
    </Stagger>
  );
}

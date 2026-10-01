"use client";

import { ArrowRight, Clock, GitMerge, MessagesSquare, Repeat, Timer, Zap } from "lucide-react";

import { Button } from "@/components/aria";
import { ColumnChart } from "@/components/charts";
import type { View } from "@/components/Sidebar";
import Timeline, { CLASSIFICATION_META } from "@/components/Timeline";
import { Utterance } from "@/components/sections/TranscriptSection";
import { Card, Legend, SpeakerAvatar, StatCard } from "@/components/ui";
import { formatClock, formatDuration, formatPercent, formatSeconds, type SpeakerMeta } from "@/lib/format";
import type { AnalysisReport, Classification } from "@/lib/types";

const CLASS_ORDER: Classification[] = [
  "Successful Interruption (Floor Transfer)",
  "Competitive Overlap / Backchannel",
  "Brief Overlap",
];

function DetailsLink({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="link" size="sm" onPress={onPress} className="group -my-1 -mr-2">
      View details
      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
    </Button>
  );
}

export default function Overview({
  report,
  speakers,
  currentTime,
  onSeek,
  onNavigate,
}: {
  report: AnalysisReport;
  speakers: Record<string, SpeakerMeta>;
  currentTime: number;
  onSeek: (seconds: number) => void;
  onNavigate: (view: View) => void;
}) {
  const overlapSeconds = report.overlaps.reduce((s, o) => s + o.duration, 0);
  const classCounts = CLASS_ORDER.map((c) => ({
    classification: c,
    count: report.interruptions.filter((e) => e.classification === c).length,
  }));
  const maxClassCount = Math.max(1, ...classCounts.map((c) => c.count));

  return (
    <div className="space-y-6">
      {/* Key numbers: 3 columns x 2 rows */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <StatCard icon={Clock} label="Duration" value={formatDuration(report.total_duration)} hint={`${report.speaker_count} speakers`} accent="#2a78d6" />
        <StatCard icon={Timer} label="Avg. response" value={formatSeconds(report.latency_stats.average)} hint={`median ${formatSeconds(report.latency_stats.median)}`} accent="#7c3aed" onPress={() => onNavigate("latency")} />
        <StatCard icon={Repeat} label="Hand-offs" value={report.latency_stats.total_turns_analyzed} hint="clean speaker changes measured" accent="#7c3aed" onPress={() => onNavigate("latency")} />
        <StatCard icon={Zap} label="Interruptions" value={report.interruption_count} hint={`${report.successful_interruption_count} took the floor`} accent="#d03b3b" onPress={() => onNavigate("interruptions")} />
        <StatCard icon={MessagesSquare} label="Backchannels" value={report.backchannel_count} hint="both kept talking" accent="#eda100" onPress={() => onNavigate("interruptions")} />
        <StatCard icon={GitMerge} label="Overlaps" value={report.overlap_count} hint={`${overlapSeconds.toFixed(1)}s talking at once`} accent="#ea580c" onPress={() => onNavigate("interruptions")} />
      </div>

      {/* Timeline */}
      <Card
        title="Conversation timeline"
        subtitle="Who spoke when. Hover a block for details, click to jump the audio there."
        action={<Legend items={[...report.speakers.map((s) => ({ label: speakers[s]?.name ?? s, color: speakers[s]?.color })), { label: "Overlap", color: "rgba(251,113,133,0.35)" }]} />}
      >
        <Timeline report={report} speakers={speakers} currentTime={currentTime} onSeek={onSeek} />
      </Card>

      {/* Transcript preview */}
      {report.transcript ? (
        <Card
          title="Transcript"
          subtitle={`${report.transcript.language_name} detected · ${report.transcript.word_count.toLocaleString()} words`}
          action={<DetailsLink onPress={() => onNavigate("transcript")} />}
          bodyClassName="p-0"
        >
          {report.transcript.segments.length ? (
            <ol className="divide-y divide-slate-100">
              {report.transcript.segments.slice(0, 4).map((s) => (
                <Utterance
                  key={`${s.start}-${s.speaker}`}
                  segment={s}
                  transcript={report.transcript!}
                  speakers={speakers}
                  active={currentTime >= s.start && currentTime < s.end}
                  onSeek={onSeek}
                />
              ))}
            </ol>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No words were recognized in this recording.</p>
          )}
          {report.transcript.segments.length > 4 && (
            <div className="border-t border-slate-100 px-5 py-3 text-center">
              <Button variant="link" size="sm" onPress={() => onNavigate("transcript")}>
                Read all {report.transcript.segments.length} utterances
              </Button>
            </div>
          )}
        </Card>
      ) : report.transcript_error ? (
        <Card title="Transcript" subtitle="What each speaker said">
          <p className="text-sm text-slate-500">{report.transcript_error}</p>
        </Card>
      ) : null}

      {/* Speakers, latency and interruptions: 3 equal columns */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Speakers" subtitle="Share of speaking time">
          <ul className="space-y-5">
            {report.speaker_profiles.map((profile) => {
              const meta = speakers[profile.speaker];
              return (
                <li key={profile.speaker}>
                  <div className="flex items-center gap-3">
                    <SpeakerAvatar initials={meta?.initials ?? "?"} color={meta?.color ?? "#64748b"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{meta?.name ?? profile.speaker}</p>
                      <p className="truncate text-xs text-slate-500">
                        {formatDuration(profile.talk_time)} · {profile.turns} turns
                      </p>
                    </div>
                    <p className="text-lg font-semibold tracking-tight text-slate-900 tabular-nums">
                      {formatPercent(profile.talk_share)}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${profile.talk_share * 100}%`, background: meta?.color }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card
          title="Response latency"
          subtitle="Silence before each reply"
          action={<DetailsLink onPress={() => onNavigate("latency")} />}
        >
          <ColumnChart
            height={180}
            format={(v) => `${v.toFixed(1)}s`}
            reference={{ value: report.latency_stats.average, label: `avg ${report.latency_stats.average.toFixed(2)}s` }}
            emptyText="No speaker hand-offs were detected."
            data={report.latencies.map((l, i) => ({
              key: String(i),
              value: l.latency_seconds,
              color: speakers[l.next_speaker]?.color ?? "#64748b",
              onClick: () => onSeek(l.previous_end),
              tooltip: (
                <>
                  <p className="font-semibold">Turn {i + 1} · {formatClock(l.next_start)}</p>
                  <p className="text-slate-300">
                    {speakers[l.next_speaker]?.name} replied to {speakers[l.previous_speaker]?.name} after{" "}
                    <strong className="text-white">{l.latency_seconds.toFixed(2)}s</strong>
                  </p>
                </>
              ),
            }))}
          />
        </Card>

        <Card
          title="Interruptions"
          subtitle="When both spoke at once"
          action={<DetailsLink onPress={() => onNavigate("interruptions")} />}
        >
          {report.interruptions.length ? (
            <ul className="space-y-5">
              {classCounts.map(({ classification, count }) => {
                const meta = CLASSIFICATION_META[classification];
                const Icon = meta.icon;
                return (
                  <li key={classification}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
                        <Icon className="h-4 w-4 shrink-0" style={{ color: meta.color }} />
                        <span className="truncate">{meta.short}</span>
                      </span>
                      <span className="font-semibold text-slate-900 tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(count / maxClassCount) * 100}%`, background: meta.color }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{meta.description}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No overlapping speech was detected.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

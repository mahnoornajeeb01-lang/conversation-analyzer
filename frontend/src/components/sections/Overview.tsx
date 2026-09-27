"use client";

import { ArrowRight, Clock, GitMerge, MessagesSquare, Repeat, Timer, Zap } from "lucide-react";
import { motion } from "framer-motion";

import { ColumnChart } from "@/components/charts";
import type { View } from "@/components/Sidebar";
import Timeline, { CLASSIFICATION_META } from "@/components/Timeline";
import { Card, Legend, SpeakerAvatar, StatCard } from "@/components/ui";
import { formatClock, formatDuration, formatPercent, formatSeconds, type SpeakerMeta } from "@/lib/format";
import type { AnalysisReport, Classification } from "@/lib/types";

const CLASS_ORDER: Classification[] = [
  "Successful Interruption (Floor Transfer)",
  "Competitive Overlap / Backchannel",
  "Brief Overlap",
];

function DetailsLink({ onClick, label = "View details" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-violet-600 transition hover:bg-violet-50"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
    </button>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Clock} label="Duration" value={formatDuration(report.total_duration)} hint={`${report.speaker_count} speakers`} accent="#2a78d6" delay={0} />
        <StatCard icon={Timer} label="Avg. response" value={formatSeconds(report.latency_stats.average)} hint={`median ${formatSeconds(report.latency_stats.median)}`} accent="#7c3aed" onClick={() => onNavigate("latency")} delay={40} />
        <StatCard icon={Repeat} label="Hand-offs" value={report.latency_stats.total_turns_analyzed} hint="clean speaker changes measured" accent="#7c3aed" onClick={() => onNavigate("latency")} delay={80} />
        <StatCard icon={Zap} label="Interruptions" value={report.interruption_count} hint={`${report.successful_interruption_count} took the floor`} accent="#d03b3b" onClick={() => onNavigate("interruptions")} delay={120} />
        <StatCard icon={MessagesSquare} label="Backchannels" value={report.backchannel_count} hint="both kept talking" accent="#eda100" onClick={() => onNavigate("interruptions")} delay={160} />
        <StatCard icon={GitMerge} label="Overlaps" value={report.overlap_count} hint={`${overlapSeconds.toFixed(1)}s talking at once`} accent="#ea580c" onClick={() => onNavigate("interruptions")} delay={200} />
      </div>

      {/* Timeline */}
      <Card
        title="Conversation timeline"
        subtitle="Who spoke when. Hover a block for details, click to jump the audio there."
        action={<Legend items={[...report.speakers.map((s) => ({ label: speakers[s]?.name ?? s, color: speakers[s]?.color })), { label: "Overlap", color: "rgba(251,113,133,0.35)" }]} />}
      >
        <Timeline report={report} speakers={speakers} currentTime={currentTime} onSeek={onSeek} />
      </Card>

      {/* Speakers, latency and interruptions: 3 equal columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Speakers" subtitle="Share of speaking time">
          <ul className="space-y-4">
            {report.speaker_profiles.map((profile, i) => {
              const meta = speakers[profile.speaker];
              return (
                <motion.li
                  key={profile.speaker}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                >
                  <div className="flex items-center gap-3">
                    <SpeakerAvatar initials={meta?.initials ?? "?"} color={meta?.color ?? "#64748b"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{meta?.name ?? profile.speaker}</p>
                      <p className="truncate text-xs text-slate-500">
                        {formatDuration(profile.talk_time)} · {profile.turns} turns
                      </p>
                    </div>
                    <p className="text-lg font-bold tracking-tight text-slate-900 tabular-nums">
                      {formatPercent(profile.talk_share)}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${profile.talk_share * 100}%`, background: meta?.color }}
                    />
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </Card>

        <Card
          title="Response latency"
          subtitle="Silence before each reply"
          action={<DetailsLink onClick={() => onNavigate("latency")} />}
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
          action={<DetailsLink onClick={() => onNavigate("interruptions")} />}
        >
          {report.interruptions.length ? (
            <ul className="space-y-4">
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

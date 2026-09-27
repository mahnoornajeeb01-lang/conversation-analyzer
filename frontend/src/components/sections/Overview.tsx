"use client";

import { ArrowRight, BadgeCheck, Clock, GitMerge, Languages, Smile, Timer, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";

import { ColumnChart, StackedBar } from "@/components/charts";
import type { View } from "@/components/Sidebar";
import Timeline from "@/components/Timeline";
import { Card, Legend, SpeakerAvatar, StatCard } from "@/components/ui";
import {
  EMOTION_META,
  EMOTION_ORDER,
  EMOTION_SOURCE,
  formatClock,
  formatDuration,
  formatPercent,
  formatSeconds,
  type SpeakerMeta,
} from "@/lib/format";
import { languageName } from "@/lib/languages";
import type { AnalysisReport, Emotion } from "@/lib/types";

function languageHint(report: AnalysisReport): string {
  const t = report.transcript;
  if (!t) return "";
  if (t.language_source === "selected") return `selected manually · Whisper ${t.model}`;
  return t.language_probability !== null
    ? `${Math.round(t.language_probability * 100)}% confident · Whisper ${t.model}`
    : `detected · Whisper ${t.model}`;
}

export function overallMood(report: AnalysisReport): Emotion | null {
  if (!report.emotions?.length) return null;
  const totals: Record<string, number> = {};
  for (const summary of report.emotions) {
    const share = report.speaker_profiles.find((p) => p.speaker === summary.speaker)?.talk_share ?? 1;
    for (const d of summary.distribution) totals[d.emotion] = (totals[d.emotion] ?? 0) + d.score * share;
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const topNonNeutral = ranked.find(([e]) => e !== "neutral");
  // Same rule as the backend's per-speaker summary.
  if (ranked[0][0] === "neutral" && topNonNeutral && topNonNeutral[1] / sum >= 0.3) {
    return topNonNeutral[0] as Emotion;
  }
  return ranked[0][0] as Emotion;
}

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
  const mood = useMemo(() => overallMood(report), [report]);
  const namesFound = report.speaker_profiles.filter((p) => p.detected_name).length;
  const words = report.transcript?.word_count ?? 0;
  const emotionBySpeaker = new Map(report.emotions?.map((e) => [e.speaker, e]) ?? []);
  const overlapSeconds = report.overlaps.reduce((s, o) => s + o.duration, 0);

  return (
    <div className="space-y-6">
      {/* Key numbers: 3 columns x 2 rows */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Clock} label="Duration" value={formatDuration(report.total_duration)} hint={`${report.speaker_count} speakers · ${words.toLocaleString()} words`} accent="#2a78d6" onClick={() => onNavigate("transcript")} delay={0} />
        <StatCard icon={Languages} label="Language" value={languageName(report.transcript?.language)} hint={languageHint(report)} accent="#64748b" onClick={() => onNavigate("transcript")} delay={40} />
        <StatCard icon={Smile} label="Overall mood" value={mood ? EMOTION_META[mood].label : "—"} hint={report.emotions && report.emotion_source ? `from ${EMOTION_SOURCE[report.emotion_source].sidebar}` : "emotion model unavailable"} accent="#16a34a" onClick={report.emotions ? () => onNavigate("emotions") : undefined} delay={80} />
        <StatCard icon={Timer} label="Avg. response" value={formatSeconds(report.latency_stats.average)} hint={`median ${formatSeconds(report.latency_stats.median)} · ${report.latency_stats.total_turns_analyzed} hand-offs`} accent="#7c3aed" onClick={() => onNavigate("latency")} delay={120} />
        <StatCard icon={Zap} label="Interruptions" value={report.interruption_count} hint={`${report.successful_interruption_count} took the floor`} accent="#d03b3b" onClick={() => onNavigate("interruptions")} delay={160} />
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

      {/* Speakers, latency and emotions: 3 equal columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          title="Speakers"
          subtitle={
            namesFound
              ? `${namesFound} of ${report.speaker_count} names detected`
              : "Numbered by order of appearance"
          }
          action={<DetailsLink onClick={() => onNavigate("transcript")} label="Transcript" />}
        >
          <ul className="space-y-4">
            {report.speaker_profiles.map((profile, i) => {
              const meta = speakers[profile.speaker];
              const emo = emotionBySpeaker.get(profile.speaker);
              const emoMeta = emo ? EMOTION_META[emo.dominant] : null;
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
                      <p className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                        <span className="truncate">{profile.display_name}</span>
                        {profile.detected_name && (
                          <span title={profile.name_evidence ?? "Name detected"}>
                            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {formatDuration(profile.talk_time)} · {profile.turns} turns
                        {emoMeta && ` · ${emoMeta.label.toLowerCase()}`}
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
          title="Emotional tone"
          subtitle="Share of each speaker's talk time"
          action={report.emotions ? <DetailsLink onClick={() => onNavigate("emotions")} /> : undefined}
        >
          {report.emotions ? (
            <div className="space-y-4">
              {report.emotions.map((e) => (
                <div key={e.speaker}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-slate-800">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: speakers[e.speaker]?.color }} />
                      <span className="truncate">{speakers[e.speaker]?.name ?? e.speaker}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      mostly <strong className="text-slate-800">{EMOTION_META[e.dominant].label.toLowerCase()}</strong>
                    </span>
                  </div>
                  <StackedBar
                    parts={EMOTION_ORDER.map((emo) => ({
                      key: emo,
                      label: EMOTION_META[emo].label,
                      value: e.distribution.find((d) => d.emotion === emo)?.score ?? 0,
                      color: EMOTION_META[emo].color,
                    }))}
                  />
                </div>
              ))}
              <div className="border-t border-slate-100 pt-3">
                <Legend items={EMOTION_ORDER.map((e) => ({ label: EMOTION_META[e].label, color: EMOTION_META[e].color }))} />
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Emotion analysis is unavailable for this recording.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

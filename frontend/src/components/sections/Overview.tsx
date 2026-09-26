"use client";

import {
  ArrowRight,
  BadgeCheck,
  Clock,
  GitMerge,
  Languages,
  MessagesSquare,
  Repeat,
  Smile,
  Timer,
  UserRound,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";

import { ColumnChart, StackedBar } from "@/components/charts";
import type { View } from "@/components/Sidebar";
import Timeline from "@/components/Timeline";
import { Card, Legend, SpeakerAvatar, StatCard } from "@/components/ui";
import {
  EMOTION_META,
  EMOTION_ORDER,
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
  if (ranked[0][0] === "neutral" && topNonNeutral && topNonNeutral[1] / sum >= 0.2) {
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

  return (
    <div className="space-y-6">
      {/* Speakers */}
      <Card
        title="Speakers in this conversation"
        subtitle={
          namesFound
            ? `${namesFound} of ${report.speaker_count} speaker name${namesFound === 1 ? "" : "s"} picked up from the conversation`
            : "No names were mentioned in the audio, so speakers are numbered by order of appearance"
        }
        action={<DetailsLink onClick={() => onNavigate("transcript")} label="Read transcript" />}
      >
        <div className={`grid gap-4 ${report.speaker_profiles.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {report.speaker_profiles.map((profile, i) => {
            const meta = speakers[profile.speaker];
            const emo = emotionBySpeaker.get(profile.speaker);
            const emoMeta = emo ? EMOTION_META[emo.dominant] : null;
            const EmoIcon = emoMeta?.icon;
            return (
              <motion.div
                key={profile.speaker}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                whileHover={{ y: -4 }}
                className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-surface p-5 backdrop-blur-xl transition-[border-color,box-shadow] duration-200 hover:border-violet-500/40 hover:shadow-[0_16px_40px_-16px_rgba(139,92,246,0.45)]"
              >
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: meta?.color }} />
                <div className="flex items-start gap-4">
                  <div className="transition-transform duration-200 group-hover:scale-105">
                    <SpeakerAvatar initials={meta?.initials ?? "?"} color={meta?.color ?? "#64748b"} size="lg" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold tracking-tight text-slate-900">{profile.display_name}</p>
                    {profile.detected_name ? (
                      <p
                        className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700"
                        title={profile.name_evidence ?? undefined}
                      >
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Name detected · {profile.speaker}
                      </p>
                    ) : (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <UserRound className="h-3.5 w-3.5" />
                        Name not mentioned
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold tracking-tight text-slate-900">{formatPercent(profile.talk_share)}</p>
                    <p className="text-[11px] text-slate-500">of talk time</p>
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-4 gap-2 border-t border-slate-100 pt-4 text-center">
                  {[
                    ["Talk time", formatDuration(profile.talk_time)],
                    ["Turns", profile.turns],
                    ["Words", profile.words],
                    ["Words/min", Math.round(profile.words_per_minute)],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">{label}</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-slate-800">{value}</dd>
                    </div>
                  ))}
                </dl>

                {emoMeta && EmoIcon && (
                  <button
                    type="button"
                    onClick={() => onNavigate("emotions")}
                    className="mt-4 flex w-full items-center justify-between rounded-xl bg-surface px-3 py-2 text-xs ring-1 ring-slate-200/80 transition hover:ring-violet-200"
                  >
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: emoMeta.color }} />
                      Overall tone
                    </span>
                    <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                      <EmoIcon className="h-3.5 w-3.5 text-slate-500" />
                      {emoMeta.label}
                    </span>
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span className="font-medium">Share of speaking time</span>
            <Legend items={report.speaker_profiles.map((p) => ({ label: `${p.display_name} ${formatPercent(p.talk_share)}`, color: speakers[p.speaker]?.color }))} />
          </div>
          <StackedBar
            height={12}
            parts={report.speaker_profiles.map((p) => ({
              key: p.speaker,
              label: p.display_name,
              value: p.talk_time,
              color: speakers[p.speaker]?.color,
            }))}
          />
        </div>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Clock} label="Duration" value={formatDuration(report.total_duration)} hint={`${report.speaker_count} speakers`} accent="#2a78d6" delay={0} />
        <StatCard icon={MessagesSquare} label="Words spoken" value={words.toLocaleString()} hint={`${report.transcript?.segments.length ?? 0} transcript lines`} accent="#0891b2" onClick={() => onNavigate("transcript")} delay={40} />
        <StatCard icon={Timer} label="Avg. response" value={formatSeconds(report.latency_stats.average)} hint={`median ${formatSeconds(report.latency_stats.median)}`} accent="#7c3aed" onClick={() => onNavigate("latency")} delay={80} />
        <StatCard icon={Repeat} label="Turn changes" value={report.latency_stats.total_turns_analyzed} hint="speaker hand-offs measured" accent="#7c3aed" onClick={() => onNavigate("latency")} delay={120} />
        <StatCard icon={Zap} label="Interruptions" value={report.interruption_count} hint={`${report.successful_interruption_count} took the floor`} accent="#d03b3b" onClick={() => onNavigate("interruptions")} delay={160} />
        <StatCard icon={GitMerge} label="Overlaps" value={report.overlap_count} hint={`${report.overlaps.reduce((s, o) => s + o.duration, 0).toFixed(1)}s talking at once`} accent="#ea580c" onClick={() => onNavigate("interruptions")} delay={200} />
        <StatCard icon={Smile} label="Overall mood" value={mood ? EMOTION_META[mood].label : "—"} hint={report.emotions ? (report.emotion_source === "audio" ? "from tone of voice" : "from the words spoken") : "emotion model unavailable"} accent="#16a34a" onClick={report.emotions ? () => onNavigate("emotions") : undefined} delay={240} />
        <StatCard icon={Languages} label="Language" value={languageName(report.transcript?.language)} hint={languageHint(report)} accent="#64748b" onClick={() => onNavigate("transcript")} delay={280} />
      </div>

      {/* Timeline */}
      <Card
        title="Conversation timeline"
        subtitle="Who spoke when. Hover a block for details, click to jump the audio there."
        action={<Legend items={[...report.speakers.map((s) => ({ label: speakers[s]?.name ?? s, color: speakers[s]?.color })), { label: "Overlap", color: "rgba(251,113,133,0.35)" }]} />}
      >
        <Timeline report={report} speakers={speakers} currentTime={currentTime} onSeek={onSeek} />
      </Card>

      {/* Previews */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Response latency per turn"
          subtitle="Seconds of silence before each reply"
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
          title="Emotional tone by speaker"
          subtitle={`Share of each speaker's talk time by emotion, ${report.emotion_source === "audio" ? "read from tone of voice" : "read from the words"}`}
          action={report.emotions ? <DetailsLink onClick={() => onNavigate("emotions")} /> : undefined}
        >
          {report.emotions ? (
            <div className="space-y-5 pt-1">
              {report.emotions.map((e) => (
                <div key={e.speaker}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-slate-800">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: speakers[e.speaker]?.color }} />
                      {speakers[e.speaker]?.name ?? e.speaker}
                    </span>
                    <span className="text-xs text-slate-500">
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
              <Legend items={EMOTION_ORDER.map((e) => ({ label: EMOTION_META[e].label, color: EMOTION_META[e].color }))} />
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Emotion analysis is unavailable for this recording.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

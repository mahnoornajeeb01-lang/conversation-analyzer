"use client";

import { Info, Smile } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";

import { StackedBar } from "@/components/charts";
import Timeline from "@/components/Timeline";
import { Card, EmptyState, Legend, SectionHeader, SpeakerAvatar } from "@/components/ui";
import { EMOTION_META, EMOTION_ORDER, formatClock, speakerName, type SpeakerMeta } from "@/lib/format";
import type { AnalysisReport } from "@/lib/types";

export default function EmotionsSection({
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
  const moments = useMemo(
    () =>
      (report.transcript?.segments ?? [])
        .filter((s) => s.emotion && s.emotion !== "neutral")
        .sort((a, b) => (b.emotion_confidence ?? 0) - (a.emotion_confidence ?? 0))
        .slice(0, 8)
        .sort((a, b) => a.start - b.start),
    [report],
  );

  const header = (
    <SectionHeader
      icon={Smile}
      eyebrow="Layer 04"
      title="Emotions"
      description={`The emotional tone of each speaker, inferred line by line from ${report.emotion_source === "audio" ? "how they sounded" : "what they said"} and weighted by how long they spoke.`}
    />
  );

  if (!report.emotions?.length) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={Smile}
            title="Emotion analysis unavailable"
            text="The emotion model could not be loaded on the server. Check the backend log, then analyze the recording again."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-xs leading-relaxed text-violet-900">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {report.emotion_source === "audio"
          ? "Emotions are detected from each speaker's voice (pitch, energy, rhythm) with a wav2vec2 speech-emotion model trained on acted English speech. Calm or monotone speakers tend to read as neutral, and the words themselves are not considered."
          : "Emotions are detected from the words spoken (RoBERTa GoEmotions model), not from the voice, so sarcasm or tone may be missed."}
      </div>

      <div className={`grid gap-6 ${report.emotions.length > 2 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {report.emotions.map((summary, i) => {
          const meta = speakers[summary.speaker];
          const dom = EMOTION_META[summary.dominant];
          const DomIcon = dom.icon;
          const ranked = [...summary.distribution].sort((a, b) => b.score - a.score);
          return (
            <motion.section
              key={summary.speaker}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              whileHover={{ y: -4 }}
              className="group rounded-2xl border border-slate-200/80 bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 hover:border-violet-500/40 hover:shadow-[0_16px_40px_-16px_rgba(139,92,246,0.45)]"
            >
              <div className="flex items-center gap-3">
                <SpeakerAvatar initials={meta?.initials ?? "?"} color={meta?.color ?? "#64748b"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{speakerName(speakers, summary.speaker)}</p>
                  <p className="text-xs text-slate-500">
                    {Object.values(summary.line_counts).reduce((a, b) => a + (b ?? 0), 0)} lines analysed
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
                    style={{ background: dom.color }}
                  >
                    <DomIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[10px] tracking-wide text-slate-400 uppercase">Overall</p>
                    <p className="text-sm font-semibold text-slate-900">{dom.label}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <StackedBar
                  height={14}
                  parts={EMOTION_ORDER.map((emo) => ({
                    key: emo,
                    label: EMOTION_META[emo].label,
                    value: summary.distribution.find((d) => d.emotion === emo)?.score ?? 0,
                    color: EMOTION_META[emo].color,
                  }))}
                />
              </div>

              <ul className="mt-4 space-y-2">
                {ranked.map((d) => {
                  const m = EMOTION_META[d.emotion];
                  const Icon = m.icon;
                  return (
                    <li key={d.emotion} className="flex items-center gap-3 text-sm">
                      <Icon className="h-4 w-4 text-slate-400" />
                      <span className="w-20 text-slate-700">{m.label}</span>
                      <span className="h-1.5 flex-1 rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full transition-[width] duration-700"
                          style={{ width: `${d.score * 100}%`, background: m.color }}
                        />
                      </span>
                      <span className="w-10 text-right font-mono text-xs font-medium text-slate-900">
                        {Math.round(d.score * 100)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </motion.section>
          );
        })}
      </div>

      <Card
        title="Emotion over time"
        subtitle="Each line is coloured by its detected emotion. Hover to read it, click to play."
        action={<Legend items={EMOTION_ORDER.map((e) => ({ label: EMOTION_META[e].label, color: EMOTION_META[e].color }))} />}
      >
        <Timeline
          report={report}
          speakers={speakers}
          currentTime={currentTime}
          onSeek={onSeek}
          mode="emotion"
          showInterruptions={false}
        />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card title="Emotion comparison" subtitle="Share of talk time per emotion, side by side" bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] tracking-wide text-slate-400 uppercase">
              <tr className="border-b border-slate-100">
                <th className="px-5 py-2.5 font-medium">Emotion</th>
                {report.emotions.map((e) => (
                  <th key={e.speaker} className="px-3 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                      <span className="h-2 w-2 rounded-full" style={{ background: speakers[e.speaker]?.color }} />
                      {speakerName(speakers, e.speaker)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EMOTION_ORDER.map((emo) => (
                <tr key={emo} className="border-b border-slate-50 transition hover:bg-slate-50/70">
                  <td className="px-5 py-2.5">
                    <span className="inline-flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: EMOTION_META[emo].color }} />
                      {EMOTION_META[emo].label}
                    </span>
                  </td>
                  {report.emotions!.map((e) => {
                    const score = e.distribution.find((d) => d.emotion === emo)?.score ?? 0;
                    return (
                      <td key={e.speaker} className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-16 rounded-full bg-slate-100">
                            <span className="block h-full rounded-full" style={{ width: `${score * 100}%`, background: EMOTION_META[emo].color }} />
                          </span>
                          <span className="font-mono text-xs text-slate-800">{Math.round(score * 100)}%</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Most emotional moments" subtitle="Strongest non-neutral lines in the conversation" bodyClassName="p-0">
          {moments.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">The whole conversation reads as neutral.</p>
          ) : (
            <ul className="scroll-thin max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
              {moments.map((m, i) => {
                const emo = EMOTION_META[m.emotion!];
                const Icon = emo.icon;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => onSeek(m.start)}
                      className="flex w-full gap-3 px-5 py-3 text-left transition hover:bg-violet-50/50"
                    >
                      <span
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ background: emo.color }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-800">{speakerName(speakers, m.speaker)}</span>
                          <span className="font-mono text-slate-400">{formatClock(m.start)}</span>
                          <span className="ml-auto font-medium text-slate-600">
                            {emo.label} · {Math.round((m.emotion_confidence ?? 0) * 100)}%
                          </span>
                        </span>
                        <span className="mt-0.5 block text-sm leading-relaxed text-slate-700">&ldquo;{m.text}&rdquo;</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

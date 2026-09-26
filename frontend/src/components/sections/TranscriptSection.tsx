"use client";

import { Download, FileText, Info, LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BarList } from "@/components/charts";
import type { Stage } from "@/components/PipelineSteps";
import { Card, EmptyState, MiniStat, SectionHeader, SpeakerAvatar } from "@/components/ui";
import { EMOTION_META, formatClock, speakerName, type SpeakerMeta } from "@/lib/format";
import { languageName } from "@/lib/languages";
import type { AnalysisReport, Transcript } from "@/lib/types";

export default function TranscriptSection({
  stage,
  transcript,
  report,
  speakers,
  currentTime,
  isPlaying,
  onSeek,
}: {
  stage: Stage;
  transcript: Transcript | null;
  report: AnalysisReport | null;
  speakers: Record<string, SpeakerMeta>;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (seconds: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const source = report?.transcript ?? transcript;
  const segments = useMemo(() => source?.segments ?? [], [source]);
  const activeIndex = segments.findIndex((s) => currentTime >= s.start && currentTime < s.end);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => (!filter || segment.speaker === filter) && (!q || segment.text.toLowerCase().includes(q)));
  }, [segments, query, filter]);

  useEffect(() => {
    const list = listRef.current;
    const active = activeRef.current;
    if (!isPlaying || !list || !active) return;
    const top = active.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + active.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: top - 40, behavior: "smooth" });
    }
  }, [activeIndex, isPlaying]);

  const wordsBySpeaker = useMemo(
    () =>
      (report?.speaker_profiles ?? []).map((p) => ({
        key: p.speaker,
        label: speakerName(speakers, p.speaker),
        value: p.words,
        display: `${p.words} words`,
        color: speakers[p.speaker]?.color ?? "#64748b",
        tooltip: `${Math.round(p.words_per_minute)} words per minute`,
      })),
    [report, speakers],
  );

  const download = () => {
    const lines = segments.map(
      (s) => `[${formatClock(s.start)}] ${s.speaker ? speakerName(speakers, s.speaker) + ": " : ""}${s.text}`,
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(report?.filename ?? "transcript").replace(/\.[^.]+$/, "")}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="rounded bg-amber-100 px-0.5 text-slate-900">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={FileText}
        eyebrow="Layer 01"
        title="Speech-to-Text"
        description="The full transcript produced by Whisper, attributed to each speaker. Click any line to play the audio from that point."
        action={
          segments.length > 0 && (
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-surface px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              <Download className="h-3.5 w-3.5" />
              Download .txt
            </button>
          )
        }
      />

      {source && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat label="Words" value={source.word_count.toLocaleString()} />
          <MiniStat label="Lines" value={segments.length} />
          <MiniStat label="Language" value={languageName(source.language)} hint={source.language_source === "selected" ? "selected manually" : source.language_probability !== null ? `${Math.round(source.language_probability * 100)}% confident` : undefined} />
          <MiniStat label="Model" value={`Whisper ${source.model}`} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card bodyClassName="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the transcript…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pr-3 pl-9 text-sm outline-none transition focus:border-violet-300 focus:bg-surface focus:ring-4 focus:ring-violet-100"
              />
            </div>
            {report && (
              <div className="flex flex-wrap gap-1.5">
                {[null, ...report.speakers].map((s) => (
                  <button
                    key={s ?? "all"}
                    type="button"
                    onClick={() => setFilter(s)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      filter === s ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {s && <span className="h-2 w-2 rounded-full" style={{ background: speakers[s]?.color }} />}
                    {s ? speakerName(speakers, s) : "All"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {stage === "transcribing" && (
            <div className="flex items-center gap-3 px-5 py-12 text-sm text-slate-500">
              <LoaderCircle className="h-5 w-5 animate-spin text-violet-500" />
              Converting speech to text… the first run also downloads the speech model.
            </div>
          )}
          {stage === "analyzing" && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Transcript ready. Identifying speakers and emotions…
            </div>
          )}
          {report?.diarization_source === "mock" && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Speaker diarization is in simulation mode, so speaker labels are illustrative. The text itself is real.
            </div>
          )}

          {segments.length > 0 && visible.length === 0 && (
            <EmptyState icon={Search} title="No matching lines" text="Try a different search term or speaker filter." />
          )}

          <div ref={listRef} className="scroll-thin max-h-[640px] space-y-0.5 overflow-y-auto p-2">
            {visible.map(({ segment, index }) => {
              const meta = segment.speaker ? speakers[segment.speaker] : undefined;
              const active = index === activeIndex;
              const emo = segment.emotion ? EMOTION_META[segment.emotion] : null;
              return (
                <button
                  key={`${segment.start}-${index}`}
                  ref={active ? activeRef : undefined}
                  type="button"
                  onClick={() => onSeek(segment.start)}
                  className={`group flex w-full gap-3 rounded-xl px-3 py-3 text-left transition ${
                    active ? "bg-violet-50 ring-1 ring-violet-200" : "hover:bg-slate-50"
                  }`}
                >
                  {meta ? (
                    <SpeakerAvatar initials={meta.initials} color={meta.color} size="md" />
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded-full bg-slate-100" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-slate-900">
                        {segment.speaker ? speakerName(speakers, segment.speaker) : "Unattributed"}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatClock(segment.start)} – {formatClock(segment.end)}
                      </span>
                      {emo && (
                        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          <span className="h-2 w-2 rounded-full" style={{ background: emo.color }} />
                          {emo.label}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-700">{highlight(segment.text)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {report && (
          <div className="space-y-6">
            <Card title="Words by speaker" subtitle="Hover a bar for speaking pace">
              <BarList rows={wordsBySpeaker} />
            </Card>
            <Card title="Speaking pace" subtitle="Words per minute of own talk time">
              <div className="space-y-3">
                {report.speaker_profiles.map((p) => (
                  <div key={p.speaker} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: speakers[p.speaker]?.color }} />
                      {speakerName(speakers, p.speaker)}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {Math.round(p.words_per_minute)} <span className="text-xs font-normal text-slate-500">wpm</span>
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-[11px] leading-relaxed text-slate-400">
                  Conversational English typically runs at 120–160 wpm.
                </p>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { Check, Copy, Download, Languages, Play, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button as AriaButton, Input, SearchField } from "react-aria-components";

import { Button, focusRing } from "@/components/aria";
import { Card, EmptyState, MiniStat, PageHeader, SpeakerAvatar } from "@/components/ui";
import { formatClock, languageLabel, speakerName, type SpeakerMeta } from "@/lib/format";
import type { AnalysisReport, Transcript, TranscriptSegment } from "@/lib/types";
import { Reveal, Stagger } from "@/components/motion";

/** Plain-text transcript, one "[m:ss] Speaker: text" line per utterance. */
export function transcriptText(transcript: Transcript, speakers: Record<string, SpeakerMeta>): string {
  return transcript.segments
    .map((s) => `[${formatClock(s.start)}] ${speakerName(speakers, s.speaker)}: ${s.text}`)
    .join("\n");
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLocaleLowerCase();
  const q = query.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    parts.push(text.slice(from, at), <mark key={at} className="rounded-sm bg-amber-200 px-0.5 text-slate-900">{text.slice(at, at + q.length)}</mark>);
    from = at + q.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

/** One utterance: who, when (press to play from there) and what they said. */
export function Utterance({
  segment,
  transcript,
  speakers,
  active,
  query = "",
  onSeek,
}: {
  segment: TranscriptSegment;
  transcript: Transcript;
  speakers: Record<string, SpeakerMeta>;
  active: boolean;
  query?: string;
  onSeek: (seconds: number) => void;
}) {
  const meta = segment.speaker ? speakers[segment.speaker] : undefined;
  return (
    <li
      className={`flex gap-3 border-l-2 px-5 py-3.5 transition-colors ${
        active ? "border-violet-500 bg-violet-50/70" : "border-transparent"
      }`}
    >
      <SpeakerAvatar initials={meta?.initials ?? "?"} color={meta?.color ?? "#64748b"} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{speakerName(speakers, segment.speaker)}</span>
          <AriaButton
            onPress={() => onSeek(segment.start)}
            aria-label={`Play from ${formatClock(segment.start)}`}
            className={`group inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] text-slate-500 tabular-nums transition-colors hover:bg-violet-50 hover:text-violet-700 ${focusRing}`}
          >
            <Play className="h-2.5 w-2.5" />
            {formatClock(segment.start)}
          </AriaButton>
        </div>
        <p
          lang={transcript.language}
          dir={transcript.right_to_left ? "rtl" : "auto"}
          className={`mt-1 text-sm leading-relaxed text-slate-700 ${transcript.right_to_left ? "text-right text-lg leading-loose" : ""}`}
        >
          <Highlight text={segment.text} query={query} />
        </p>
      </div>
    </li>
  );
}

export default function TranscriptSection({
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
  const transcript = report.transcript;
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const visible = useMemo(() => {
    if (!transcript) return [];
    const q = query.trim().toLocaleLowerCase();
    return q ? transcript.segments.filter((s) => s.text.toLocaleLowerCase().includes(q)) : transcript.segments;
  }, [transcript, query]);

  const header = (
    <PageHeader
      eyebrow="Layer 03"
      title="Transcript"
      description="What each speaker said, transcribed with Whisper. The spoken language is detected automatically, and each word is attributed to whoever was talking at that moment."
    />
  );

  if (!transcript) {
    return (
      <Stagger root className="space-y-6">
        <Reveal>
          {header}
        </Reveal>
        <Reveal>
          <Card>
            <EmptyState
              icon={Languages}
              title="No transcript for this recording"
              text={report.transcript_error ?? "Speech-to-text is switched off on the analysis server."}
            />
          </Card>
        </Reveal>
      </Stagger>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transcriptText(transcript, speakers));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the download still works */
    }
  };

  const download = () => {
    const blob = new Blob([transcriptText(transcript, speakers)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.filename.replace(/\.[^.]+$/, "")}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confidence =
    transcript.language_probability == null ? null : Math.round(transcript.language_probability * 100);
  const mixed = (transcript.languages?.length ?? 0) > 1;

  return (
    <Stagger root className="space-y-6">
      <Reveal>
        {header}
      </Reveal>

      <Reveal>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MiniStat
            label={mixed ? "Languages" : "Language"}
            value={languageLabel(transcript)}
            hint={
              mixed
                ? transcript.languages!.map((l) => `${l.code.toUpperCase()} ${Math.round(l.share * 100)}%`).join(" · ")
                : transcript.language.toUpperCase() || undefined
            }
          />
          {mixed ? (
            <MiniStat label="Main language" value={transcript.language_name} hint="mixed-language recording" />
          ) : confidence == null ? (
            <MiniStat label="Speakers" value={new Set(transcript.segments.map((s) => s.speaker)).size} />
          ) : (
            <MiniStat label="Detection confidence" value={`${confidence}%`} hint={confidence < 70 ? "low: may be mixed languages" : "detected automatically"} />
          )}
          <MiniStat label="Words" value={transcript.word_count.toLocaleString()} />
          <MiniStat label="Utterances" value={transcript.segments.length} hint={transcript.model} />
        </div>
      </Reveal>

      <Reveal>
        <Card
          title="Full transcript"
          subtitle="Press a timestamp to play from there. The line being played is highlighted."
          bodyClassName="p-0"
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" onPress={copy} isDisabled={!transcript.segments.length}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" onPress={download} isDisabled={!transcript.segments.length}>
                <Download className="h-3.5 w-3.5" />
                .txt
              </Button>
            </div>
          }
        >
          {transcript.segments.length === 0 ? (
            <EmptyState icon={Languages} title="No words recognized" text="Whisper didn't recognize any words in this recording." />
          ) : (
            <>
              <div className="border-b border-slate-100 px-5 py-3">
                <SearchField aria-label="Search the transcript" value={query} onChange={setQuery} className="group relative max-w-sm">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search the transcript"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-surface pr-9 pl-9 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 [&::-webkit-search-cancel-button]:hidden"
                  />
                  <AriaButton
                    className={`absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 group-empty:hidden ${focusRing}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </AriaButton>
                </SearchField>
                {query && (
                  <p className="mt-2 text-xs text-slate-500" aria-live="polite">
                    {visible.length} of {transcript.segments.length} utterances match
                  </p>
                )}
              </div>
              {visible.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">Nothing in the transcript matches “{query}”.</p>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {visible.map((s) => (
                    <Utterance
                      key={`${s.start}-${s.speaker}`}
                      segment={s}
                      transcript={transcript}
                      speakers={speakers}
                      active={currentTime >= s.start && currentTime < s.end}
                      query={query.trim()}
                      onSeek={onSeek}
                    />
                  ))}
                </ol>
              )}
            </>
          )}
        </Card>
      </Reveal>
    </Stagger>
  );
}

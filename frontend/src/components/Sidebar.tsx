"use client";

import { motion } from "framer-motion";
import {
  AudioLines,
  FileText,
  LayoutDashboard,
  Lock,
  LoaderCircle,
  Smile,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { EMOTION_SOURCE } from "@/lib/format";
import { languageName } from "@/lib/languages";
import type { AnalysisReport, Transcript } from "@/lib/types";

export type View = "overview" | "transcript" | "latency" | "interruptions" | "emotions";

interface NavItem {
  key: View;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const OVERVIEW: NavItem = { key: "overview", label: "Overview", hint: "Upload & summary", icon: LayoutDashboard };

const LAYERS: NavItem[] = [
  { key: "transcript", label: "Speech-to-Text", hint: "Full transcript", icon: FileText },
  { key: "latency", label: "Response Latency", hint: "Gaps between turns", icon: Timer },
  { key: "interruptions", label: "Interruptions", hint: "Overlaps & floor-taking", icon: Zap },
  { key: "emotions", label: "Emotions", hint: "Tone of each speaker", icon: Smile },
];

export default function Sidebar({
  view,
  onNavigate,
  report,
  transcript,
  busy,
}: {
  view: View;
  onNavigate: (view: View) => void;
  report: AnalysisReport | null;
  transcript: Transcript | null;
  busy: boolean;
}) {
  const available = (key: View) => {
    if (key === "overview") return true;
    if (key === "transcript") return Boolean(transcript || report);
    return Boolean(report);
  };

  const badge = (key: View): string | null => {
    if (!report) return key === "transcript" && transcript ? String(transcript.segments.length) : null;
    switch (key) {
      case "transcript":
        return String(report.transcript?.segments.length ?? 0);
      case "latency":
        return `${report.latency_stats.average.toFixed(1)}s`;
      case "interruptions":
        return String(report.interruption_count);
      case "emotions":
        return report.emotions ? String(report.emotions.length) : "—";
      default:
        return null;
    }
  };

  const renderItem = (item: NavItem, index: number, step?: number) => {
    const enabled = available(item.key);
    const active = view === item.key;
    const Icon = item.icon;
    const b = badge(item.key);
    const loading = !enabled && busy;
    return (
      <motion.li
        key={item.key}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.05 * index, duration: 0.3 }}
        className="group/item relative"
      >
        <button
          type="button"
          disabled={!enabled}
          onClick={() => onNavigate(item.key)}
          aria-current={active ? "page" : undefined}
          className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
            active
              ? "text-white"
              : enabled
                ? "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                : "cursor-not-allowed text-slate-400 opacity-50"
          }`}
        >
          {active && (
            <motion.span
              layoutId="nav-active"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="absolute inset-0 rounded-xl border border-violet-500/40 bg-violet-600/20 shadow-[0_0_20px_rgba(139,92,246,0.25)]"
            />
          )}
          <span
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              active
                ? "bg-gradient-to-tr from-violet-600 to-indigo-500 text-white shadow-[0_0_14px_rgba(139,92,246,0.55)]"
                : enabled
                  ? "bg-white/[0.06] text-slate-300 group-hover/item:bg-white/10 group-hover/item:text-white"
                  : "bg-white/[0.03] text-slate-500"
            }`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {step !== undefined && (
                <span className="font-mono text-[10px] text-slate-500">{String(step).padStart(2, "0")}</span>
              )}
              {item.label}
            </span>
            <span className="block truncate text-[11px] text-slate-500">{item.hint}</span>
          </span>
          <span className="relative">
            {loading ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-violet-400" />
            ) : !enabled ? (
              <Lock className="h-3.5 w-3.5 text-slate-500" />
            ) : (
              b && (
                <span
                  className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                    active ? "bg-violet-400/20 text-violet-200" : "bg-white/[0.06] text-slate-400"
                  }`}
                >
                  {b}
                </span>
              )
            )}
          </span>
        </button>

        {!enabled && (
          <span
            role="tooltip"
            className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 hidden w-max max-w-52 -translate-y-1/2 translate-x-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-200 opacity-0 shadow-xl transition duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100 lg:block"
          >
            {busy ? "Unlocks as soon as its data is ready" : "Upload a recording to unlock"}
          </span>
        )}
      </motion.li>
    );
  };

  return (
    <aside className="keep-palette relative z-30 flex w-full shrink-0 flex-col border-white/[0.06] bg-[#0b0f19]/95 text-slate-200 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-r">
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <motion.div
          whileHover={{ rotate: -6, scale: 1.06 }}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.45)]"
        >
          <AudioLines className="h-5 w-5" />
        </motion.div>
        <div>
          <p className="text-[15px] font-bold tracking-tight text-white">Conversation Analyzer</p>
          <p className="text-xs text-slate-400">Speech intelligence dashboard</p>
        </div>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-4 lg:overflow-visible">
        <ul className="space-y-1">{renderItem(OVERVIEW, 0)}</ul>

        <p className="mt-6 mb-2 px-3 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
          Analysis layers
        </p>
        <ul className="relative space-y-1">
          <span className="absolute top-5 bottom-5 left-[27px] w-px bg-gradient-to-b from-violet-500/30 via-white/[0.06] to-transparent" aria-hidden />
          {LAYERS.map((item, i) => renderItem(item, i + 1, i + 1))}
        </ul>

        {!report && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mx-1 mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs leading-relaxed text-slate-400"
          >
            {busy
              ? "Processing your recording. Each layer unlocks as soon as its data is ready."
              : "Upload a recording on the Overview screen to unlock the analysis layers."}
          </motion.p>
        )}
      </nav>

      {report && (
        <div className="border-t border-white/[0.06] px-5 py-4 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${report.diarization_source === "mock" ? "bg-amber-400" : "bg-emerald-400"}`}
            />
            Diarization: {report.diarization_source === "mock" ? "simulated" : "pyannote 3.1"}
          </div>
          {report.transcript && (
            <div className="mt-1 pl-3.5">
              Whisper {report.transcript.model} · {languageName(report.transcript.language)}
            </div>
          )}
          {report.emotion_source && (
            <div className="mt-1 pl-3.5">Emotions: {EMOTION_SOURCE[report.emotion_source].sidebar}</div>
          )}
        </div>
      )}
    </aside>
  );
}

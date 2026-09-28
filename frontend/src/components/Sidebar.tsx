"use client";

import {
  AudioLines,
  CircleHelp,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  Settings,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { AnalysisReport } from "@/lib/types";

export type View = "overview" | "latency" | "interruptions";

interface NavItem {
  key: View;
  label: string;
  icon: LucideIcon;
}

const OVERVIEW: NavItem = { key: "overview", label: "Overview", icon: LayoutDashboard };

const LAYERS: NavItem[] = [
  { key: "latency", label: "Response latency", icon: Timer },
  { key: "interruptions", label: "Interruptions", icon: Zap },
];

export default function Sidebar({
  view,
  onNavigate,
  report,
  busy,
}: {
  view: View;
  onNavigate: (view: View) => void;
  report: AnalysisReport | null;
  busy: boolean;
}) {
  const badge = (key: View): string | null => {
    if (!report) return null;
    switch (key) {
      case "latency":
        return `${report.latency_stats.average.toFixed(1)}s`;
      case "interruptions":
        return String(report.interruption_count);
      default:
        return null;
    }
  };

  const renderItem = (item: NavItem) => {
    const enabled = item.key === "overview" || Boolean(report);
    const active = view === item.key;
    const Icon = item.icon;
    const b = badge(item.key);
    return (
      <li key={item.key}>
        <button
          type="button"
          disabled={!enabled}
          onClick={() => onNavigate(item.key)}
          aria-current={active ? "page" : undefined}
          title={enabled ? undefined : busy ? "Unlocks when processing finishes" : "Upload a recording to unlock"}
          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
            active
              ? "border-slate-200 bg-surface-solid font-semibold dark:bg-slate-100 text-slate-900 shadow-sm"
              : enabled
                ? "border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                : "cursor-not-allowed border-transparent font-medium text-slate-400"
          }`}
        >
          <Icon className={`h-4 w-4 shrink-0 ${active ? "text-violet-600" : ""}`} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {!enabled ? (
            busy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-violet-500" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )
          ) : (
            b && (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{b}</span>
            )
          )}
        </button>
      </li>
    );
  };

  const footerItem = (Icon: LucideIcon, label: string) => (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </button>
    </li>
  );

  return (
    <aside className="relative z-30 flex w-full shrink-0 flex-col border-b border-slate-200 bg-slate-50 dark:bg-surface-solid lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-r lg:border-b-0">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
          <AudioLines className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-slate-900">Conversation Analyzer</p>
          <p className="text-xs text-slate-500">Turn-taking &amp; timing</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-1">{renderItem(OVERVIEW)}</ul>

        <p className="mt-6 mb-2 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Analysis layers
        </p>
        <ul className="space-y-1">{LAYERS.map(renderItem)}</ul>

        {!report && (
          <p className="mt-2 px-3 text-xs leading-relaxed text-slate-400">
            {busy
              ? "Processing your recording. Layers unlock when it finishes."
              : "Layers unlock once a recording has been processed."}
          </p>
        )}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3">
        <ul className="space-y-1">
          {footerItem(Settings, "Settings")}
          {footerItem(CircleHelp, "Help & documentation")}
        </ul>
        {report && (
          <p className="mt-2 flex items-center gap-2 px-3 text-[11px] text-slate-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${report.diarization_source === "mock" ? "bg-amber-400" : "bg-emerald-500"}`}
            />
            Diarization: {report.diarization_source === "mock" ? "simulated" : "pyannote 3.1"}
          </p>
        )}
      </div>
    </aside>
  );
}

"use client";

import {
  AudioLines,
  CircleHelp,
  Languages,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  Menu,
  Timer,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { LayoutGroup, motion } from "framer-motion";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";

import { Button, focusRing, IconButton } from "@/components/aria";
import type { AnalysisReport } from "@/lib/types";

export type View = "overview" | "latency" | "interruptions" | "transcript";

interface NavItem {
  key: View;
  label: string;
  icon: LucideIcon;
}

const OVERVIEW: NavItem = { key: "overview", label: "Overview", icon: LayoutDashboard };

const LAYERS: NavItem[] = [
  { key: "latency", label: "Response latency", icon: Timer },
  { key: "interruptions", label: "Interruptions", icon: Zap },
  { key: "transcript", label: "Transcript", icon: Languages },
];

const GLOSSARY = [
  {
    term: "Response latency",
    text: "The silence between one speaker finishing and the next starting. Around 0.2–1s feels natural in conversation.",
  },
  { term: "Hand-off", text: "A clean change of speaker with a gap in between, which is where latency is measured." },
  { term: "Floor transfer", text: "An interruption where the interrupter takes over and the other speaker stops." },
  { term: "Backchannel", text: "Both people keep talking through the overlap, e.g. “mm-hm” or competing for the floor." },
  { term: "Brief overlap", text: "A short, incidental overlap at a turn boundary." },
  {
    term: "Transcript",
    text: "Speech-to-text by Whisper, which also detects the spoken language. Each word is credited to whoever was talking at that moment.",
  },
];

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
  report: AnalysisReport | null;
  busy: boolean;
}

function Brand() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
        <AudioLines className="h-4 w-4" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-slate-900">Conversation Analyzer</p>
        <p className="text-xs text-slate-500">Turn-taking &amp; timing</p>
      </div>
    </div>
  );
}

function HelpDialog() {
  return (
    <DialogTrigger>
      <AriaButton
        className={`flex h-9 w-full cursor-default items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
      >
        <CircleHelp className="h-4 w-4 shrink-0" />
        Help &amp; definitions
      </AriaButton>
      <ModalOverlay
        isDismissable
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm transition-opacity duration-200 entering:opacity-0 exiting:opacity-0"
      >
        <Modal className="w-full max-w-lg rounded-xl border border-slate-200 bg-surface-solid shadow-2xl entering:animate-dialog-in exiting:animate-dialog-out">
          <Dialog className="outline-none">
            {({ close }) => (
              <>
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                  <div>
                    <Heading slot="title" className="text-base font-semibold text-slate-900">
                      How the analysis works
                    </Heading>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Speakers are identified first, then every turn is measured.
                    </p>
                  </div>
                  <IconButton icon={X} label="Close" variant="ghost" onPress={close} />
                </div>
                <dl className="divide-y divide-slate-100 px-6">
                  {GLOSSARY.map((g) => (
                    <div key={g.term} className="grid gap-1 py-3.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
                      <dt className="text-sm font-semibold text-slate-900">{g.term}</dt>
                      <dd className="text-sm leading-relaxed text-slate-600">{g.text}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex justify-end border-t border-slate-100 px-6 py-4">
                  <Button variant="primary" onPress={close}>
                    Got it
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

function SidebarContent({ view, onNavigate, report, busy }: SidebarProps) {
  const badge = (key: View): string | null => {
    if (!report) return null;
    switch (key) {
      case "latency":
        return `${report.latency_stats.average.toFixed(1)}s`;
      case "interruptions":
        return String(report.interruption_count);
      case "transcript":
        return report.transcript ? report.transcript.language.toUpperCase() : null;
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
        <AriaButton
          isDisabled={!enabled}
          onPress={() => onNavigate(item.key)}
          aria-current={active ? "page" : undefined}
          className={`relative flex h-9 w-full cursor-default items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors ${focusRing} ${
            active
              ? "font-semibold text-violet-700"
              : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          }`}
        >
          {active && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-10 rounded-lg bg-violet-50"
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
            />
          )}
          <Icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {!enabled ? (
            busy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-violet-500" aria-label="Processing" />
            ) : (
              <Lock className="h-3.5 w-3.5" aria-label="Locked" />
            )
          ) : (
            b && (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 tabular-nums">
                {b}
              </span>
            )
          )}
        </AriaButton>
      </li>
    );
  };

  return (
    <>
      <Brand />

      <nav aria-label="Main" className="scroll-thin isolate flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">{renderItem(OVERVIEW)}</ul>

        <p className="mt-6 mb-2 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Analysis layers
        </p>
        <ul className="space-y-1">{LAYERS.map(renderItem)}</ul>

        {!report && (
          <p className="mt-3 px-3 text-xs leading-relaxed text-slate-400">
            {busy
              ? "Processing your recording. Layers unlock when it finishes."
              : "Layers unlock once a recording has been processed."}
          </p>
        )}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <HelpDialog />
        {report && (
          <p className="mt-1 flex h-8 items-center gap-2 px-3 text-xs text-slate-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${report.diarization_source === "mock" ? "bg-amber-400" : "bg-emerald-500"}`}
            />
            Diarization: {report.diarization_source === "mock" ? "simulated" : "pyannote 3.1"}
          </p>
        )}
        {report?.transcript && (
          <p className="flex h-8 items-center gap-2 px-3 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Speech-to-text: {report.transcript.model}
          </p>
        )}
      </div>
    </>
  );
}

/** Fixed sidebar on large screens. */
export default function Sidebar(props: SidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-surface lg:flex">
      <LayoutGroup id="sidebar">
        <SidebarContent {...props} />
      </LayoutGroup>
    </aside>
  );
}

/** Menu button and slide-in drawer with the same navigation, for small screens. */
export function MobileNav(props: SidebarProps) {
  return (
    <DialogTrigger>
      <IconButton icon={Menu} label="Open navigation" variant="ghost" className="-ml-2 lg:hidden" />
      <ModalOverlay
        isDismissable
        className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-200 entering:opacity-0 exiting:opacity-0 lg:hidden"
      >
        <Modal className="fixed inset-y-0 left-0 w-72 max-w-[85vw] border-r border-slate-200 bg-surface-solid shadow-2xl entering:animate-drawer-in exiting:animate-drawer-out">
          <Dialog aria-label="Navigation" className="flex h-full flex-col outline-none">
            {({ close }) => (
              <LayoutGroup id="drawer">
                <SidebarContent
                  {...props}
                  onNavigate={(view) => {
                    props.onNavigate(view);
                    close();
                  }}
                />
              </LayoutGroup>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

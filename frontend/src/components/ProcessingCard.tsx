"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Label, ProgressBar } from "react-aria-components";

import { formatClock } from "@/lib/format";

const TEXT = {
  analyzing: {
    title: "Analyzing who spoke when",
    text: "Identifying the speakers, then measuring response latency and interruptions.",
  },
  transcribing: {
    title: "Transcribing the conversation",
    text: "Detecting the spoken language and converting the speech to text.",
  },
};

export type ProcessingStage = keyof typeof TEXT;

// Bar heights for the animated sound wave (a fixed shape, so it doesn't jump on re-render).
const BARS = [0.35, 0.6, 0.9, 0.5, 0.75, 1, 0.65, 0.4, 0.8, 0.55, 0.95, 0.45, 0.7, 0.85, 0.5, 0.3, 0.6, 0.9, 0.4, 0.7];

function SoundWave() {
  return (
    <div className="flex h-10 items-center gap-[3px]" aria-hidden>
      {BARS.map((h, i) => (
        <span
          key={i}
          className="w-1 animate-wave rounded-full bg-gradient-to-t from-violet-600 to-indigo-400"
          style={{ height: `${h * 100}%`, animationDelay: `${(i % 10) * 0.09}s` }}
        />
      ))}
    </div>
  );
}

/** Shown while a recording is processed: what is happening now, and how long it's taken. */
export default function ProcessingCard({ stage }: { stage: ProcessingStage }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { title, text } = TEXT[stage];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-4"
    >
      <ProgressBar isIndeterminate className="overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-xs">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <SoundWave />
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={stage}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                <Label className="text-sm font-semibold text-slate-900">{title}</Label>
                <p className="mt-0.5 text-xs text-slate-500">{text} Longer recordings can take a few minutes.</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 tabular-nums">
            {formatClock(elapsed)} elapsed
          </span>
        </div>
        <div className="relative h-1 overflow-hidden bg-slate-100">
          <div className="absolute inset-y-0 w-1/3 animate-[progress_1.4s_ease-in-out_infinite] rounded-full bg-violet-600" />
        </div>
      </ProgressBar>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[118px] animate-fade-up rounded-xl border border-slate-200 bg-surface p-5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton mt-5 h-6 w-28 rounded" />
            <div className="skeleton mt-2 h-3 w-24 rounded" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

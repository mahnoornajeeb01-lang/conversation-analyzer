"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ChevronRight, FileDown, LoaderCircle, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import PipelineSteps, { type Stage } from "@/components/PipelineSteps";
import InterruptionsSection from "@/components/sections/InterruptionsSection";
import LatencySection from "@/components/sections/LatencySection";
import Overview from "@/components/sections/Overview";
import Sidebar, { type View } from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import UploadCard from "@/components/UploadCard";
import { analyzeRecording, downloadReportPdf } from "@/lib/api";
import { buildSpeakerMeta } from "@/lib/format";
import type { AnalysisReport } from "@/lib/types";

const VIEW_TITLES: Record<View, string> = {
  overview: "Overview",
  latency: "Response Latency",
  interruptions: "Interruptions",
};

function ProcessingCard() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl border border-slate-200/80 bg-surface p-4 backdrop-blur-xl">
          <div className="h-9 w-9 rounded-xl bg-slate-100" />
          <div className="mt-5 h-3 w-20 rounded bg-slate-100" />
          <div className="mt-2 h-6 w-28 rounded bg-slate-100" />
        </div>
      ))}
      <p className="col-span-full flex items-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="h-4 w-4 animate-spin text-violet-500 dark:text-violet-400" />
        Identifying who spoke when, then measuring response latency and interruptions…
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const [view, setView] = useState<View>("overview");
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stageRef = useRef<Stage>("idle");

  const speakers = useMemo(() => buildSpeakerMeta(report), [report]);

  const updateStage = (next: Stage) => {
    stageRef.current = next;
    setStage(next);
  };

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const navigate = useCallback((next: View) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setFile(null);
    setAudioUrl(null);
    setReport(null);
    setError(null);
    setPdfError(null);
    setFailedAt(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setView("overview");
    updateStage("idle");
  }, []);

  const handleFileSelected = useCallback(async (selected: File) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFile(selected);
    setAudioUrl(URL.createObjectURL(selected));
    setReport(null);
    setError(null);
    setPdfError(null);
    setFailedAt(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setView("overview");
    updateStage("analyzing");

    let pipelineStarted = false;
    try {
      await analyzeRecording(
        selected,
        (event) => {
          pipelineStarted = true;
          switch (event.stage) {
            case "analyzing":
              updateStage("analyzing");
              break;
            case "report":
              setReport(event.report);
              updateStage("done");
              break;
            case "error":
              throw new Error(event.detail);
          }
        },
        controller.signal,
      );
      if (stageRef.current !== "done") {
        throw new Error("The server closed the connection before analysis finished.");
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      // 0 = upload rejected/unreachable before the pipeline started, 1 = analysis.
      setFailedAt(pipelineStarted ? 1 : 0);
      setError((err as Error).message);
      updateStage("error");
    }
  }, []);

  const exportPdf = async () => {
    if (!report) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      await downloadReportPdf(report);
    } catch (err) {
      setPdfError((err as Error).message);
    } finally {
      setPdfBusy(false);
    }
  };

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, seconds);
    setCurrentTime(audio.currentTime);
    audio.play().catch(() => {
      /* playback can be blocked until the user interacts; ignore */
    });
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const busy = stage === "analyzing";

  const player = (
    <UploadCard
      file={file}
      disabled={busy}
      isPlaying={isPlaying}
      currentTime={currentTime}
      duration={duration}
      onFileSelected={handleFileSelected}
      onReset={reset}
      onTogglePlay={togglePlay}
      onSeek={seek}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar view={view} onNavigate={navigate} report={report} busy={busy} />

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-40 border-b border-slate-200/60 bg-page/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
            <nav className="flex min-w-0 items-center gap-1.5 text-sm">
              <button type="button" onClick={() => navigate("overview")} className="hidden text-slate-500 transition hover:text-violet-600 sm:inline dark:hover:text-violet-400">
                Dashboard
              </button>
              <ChevronRight className="hidden h-3.5 w-3.5 text-slate-300 sm:block" />
              <span className="truncate font-semibold text-slate-900">{VIEW_TITLES[view]}</span>
            </nav>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <ThemeToggle />
              {report && (
                <button
                  type="button"
                  onClick={exportPdf}
                  disabled={pdfBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-md transition hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(124,58,237,0.5)] disabled:scale-100 disabled:opacity-60"
                >
                  {pdfBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{pdfBusy ? "Preparing PDF…" : "Download PDF"}</span>
                  <span className="sm:hidden">PDF</span>
                </button>
              )}
              <span
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-xl ${
                  stage === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : busy
                      ? "border-violet-500/30 bg-violet-500/10 text-violet-700"
                      : "border-slate-200 bg-surface text-slate-700"
                }`}
              >
                {busy ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  <span
                    className={`h-2 w-2 rounded-full ${
                      stage === "error"
                        ? "bg-red-500"
                        : "animate-pulse bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                    }`}
                  />
                )}
                <span className={stage === "done" ? "hidden sm:inline" : undefined}>
                  {{ idle: "Ready", analyzing: "Analyzing", done: "Analysis complete", error: "Failed" }[stage]}
                </span>
                {stage === "done" && report?.timings.total ? (
                  <span className="hidden font-mono opacity-70 sm:inline">· {report.timings.total.toFixed(0)}s</span>
                ) : null}
              </span>
            </div>
          </div>
          {file && view !== "overview" && <div className="mx-auto max-w-6xl px-5 pb-3 sm:px-8">{player}</div>}
        </div>

        <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8">
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="metadata"
              className="hidden"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            />
          )}

          {pdfError && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">PDF export failed</p>
                <p>{pdfError}</p>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="space-y-6"
            >
              {view === "overview" && (
                <>
                  <header>
                    <p className="text-xs font-bold tracking-wider text-violet-600 uppercase dark:text-violet-400">
                      Conversation intelligence
                    </p>
                    <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
                      {report ? "Conversation overview" : "Analyze a conversation"}
                    </h1>
                    <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
                      {report
                        ? "A summary of the whole recording. Click any card, or a layer in the sidebar, to open its detailed analysis."
                        : "Upload a recording to see who spoke when, how quickly each person responds, and who interrupts whom."}
                    </p>
                  </header>

                  {file && <PipelineSteps stage={stage} failedAt={failedAt} />}
                  {player}

                  {error && (
                    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">
                          {failedAt === 0 ? "Upload failed" : "Analysis failed"}
                        </p>
                        <p>{error}</p>
                      </div>
                    </div>
                  )}

                  {busy && <ProcessingCard />}
                  {report && (
                    <Overview report={report} speakers={speakers} currentTime={currentTime} onSeek={seek} onNavigate={navigate} />
                  )}
                </>
              )}

              {view === "latency" && report && <LatencySection report={report} speakers={speakers} onSeek={seek} />}
              {view === "interruptions" && report && (
                <InterruptionsSection report={report} speakers={speakers} currentTime={currentTime} onSeek={seek} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
    </MotionConfig>
  );
}

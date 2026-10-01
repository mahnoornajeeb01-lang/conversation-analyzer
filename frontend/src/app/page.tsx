"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ChevronRight, FileDown, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Breadcrumb, Breadcrumbs, Label, Link, ProgressBar } from "react-aria-components";

import { Button, focusRing } from "@/components/aria";
import PipelineSteps, { type Stage } from "@/components/PipelineSteps";
import RecentAnalyses from "@/components/RecentAnalyses";
import ScrollToggle from "@/components/ScrollToggle";
import InterruptionsSection from "@/components/sections/InterruptionsSection";
import LatencySection from "@/components/sections/LatencySection";
import Overview from "@/components/sections/Overview";
import TranscriptSection from "@/components/sections/TranscriptSection";
import Sidebar, { MobileNav, type View } from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import UploadCard from "@/components/UploadCard";
import { Alert, PageHeader } from "@/components/ui";
import WhatHappensNext from "@/components/WhatHappensNext";
import { analyzeRecording, downloadReportPdf } from "@/lib/api";
import { buildSpeakerMeta } from "@/lib/format";
import { loadHistory, prependHistory, type AnalysisRecord } from "@/lib/history";
import type { AnalysisReport } from "@/lib/types";

const VIEW_TITLES: Record<View, string> = {
  overview: "Overview",
  latency: "Response Latency",
  interruptions: "Interruptions",
  transcript: "Transcript",
};

const PROCESSING_TEXT = {
  analyzing: {
    title: "Analyzing who spoke when",
    text: "Identifying the speakers, then measuring response latency and interruptions.",
  },
  transcribing: {
    title: "Transcribing the conversation",
    text: "Detecting the spoken language and converting the speech to text.",
  },
};

function ProcessingCard({ stage }: { stage: keyof typeof PROCESSING_TEXT }) {
  const { title, text } = PROCESSING_TEXT[stage];
  return (
    <div className="space-y-4">
      <ProgressBar isIndeterminate className="rounded-xl border border-slate-200 bg-surface p-5 shadow-xs">
        <div className="flex items-center gap-2 text-sm">
          <LoaderCircle className="h-4 w-4 animate-spin text-violet-600" />
          <Label className="font-medium text-slate-900">{title}</Label>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {text} Longer recordings can take a few minutes.
        </p>
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="absolute inset-y-0 w-1/3 animate-[progress_1.4s_ease-in-out_infinite] rounded-full bg-violet-600" />
        </div>
      </ProgressBar>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[118px] animate-pulse rounded-xl border border-slate-200 bg-surface p-5">
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="mt-5 h-6 w-28 rounded bg-slate-100" />
            <div className="mt-2 h-3 w-24 rounded bg-slate-100" />
          </div>
        ))}
      </div>
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
  const [history, setHistory] = useState<AnalysisRecord[]>([]);

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

  // Read after mount: localStorage isn't available during server rendering.
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const recordRun = useCallback((record: Omit<AnalysisRecord, "id" | "uploadedAt">) => {
    const uploadedAt = new Date().toISOString();
    setHistory((list) => prependHistory(list, { ...record, id: `${uploadedAt}-${record.filename}`, uploadedAt }));
  }, []);

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
            case "transcribing":
              updateStage(event.stage);
              break;
            case "report":
              setReport(event.report);
              updateStage("done");
              recordRun({
                filename: selected.name,
                duration: event.report.total_duration,
                speakers: event.report.speaker_count,
                language: event.report.transcript?.language_name ?? null,
                status: "complete",
              });
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
      recordRun({ filename: selected.name, duration: null, speakers: null, status: "failed" });
    }
  }, [recordRun]);

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

  const busy = stage === "analyzing" || stage === "transcribing";

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

  const sidebarProps = { view, onNavigate: navigate, report, busy };

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex min-h-screen">
      <Sidebar {...sidebarProps} />

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-40 border-b border-slate-200 bg-surface-solid/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <MobileNav {...sidebarProps} />
              {/* On the overview "Dashboard" is the current page; elsewhere it links back to it. */}
              <Breadcrumbs className="flex min-w-0 items-center gap-2 text-sm">
                {view === "overview" ? (
                  <Breadcrumb>
                    <Link className="font-medium text-slate-900">Dashboard</Link>
                  </Breadcrumb>
                ) : (
                  <>
                    <Breadcrumb className="flex items-center gap-2">
                      <Link
                        onPress={() => navigate("overview")}
                        className={`cursor-pointer rounded text-slate-500 transition-colors hover:text-slate-900 ${focusRing}`}
                      >
                        Dashboard
                      </Link>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden />
                    </Breadcrumb>
                    <Breadcrumb className="min-w-0">
                      <Link className="block truncate font-medium text-slate-900">{VIEW_TITLES[view]}</Link>
                    </Breadcrumb>
                  </>
                )}
              </Breadcrumbs>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {report && (
                <Button variant="primary" onPress={exportPdf} isPending={pdfBusy}>
                  {pdfBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  <span className="hidden sm:inline">{pdfBusy ? "Preparing PDF…" : "Download PDF"}</span>
                  <span className="sm:hidden">PDF</span>
                </Button>
              )}
              <ThemeToggle />
            </div>
          </div>
          {file && view !== "overview" && <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6 lg:px-8">{player}</div>}
        </div>

        <div className="mx-auto max-w-6xl space-y-6 px-4 pt-8 pb-24 sm:px-6 lg:px-8">
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

          {pdfError && <Alert title="PDF export failed">{pdfError}</Alert>}

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
                  <PageHeader
                    eyebrow="Conversation intelligence"
                    title={report ? "Conversation overview" : "Analyze a conversation"}
                    description={
                      report
                        ? "A summary of the whole recording. Click any card, or a layer in the sidebar, to open its detailed analysis."
                        : "Upload a recording to see who spoke when, how quickly each person responds, and who interrupts whom."
                    }
                  />

                  {file ? (
                    <>
                      <PipelineSteps stage={stage} failedAt={failedAt} />
                      {player}
                    </>
                  ) : (
                    <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                      {player}
                      <WhatHappensNext />
                    </div>
                  )}

                  {error && <Alert title={failedAt === 0 ? "Upload failed" : "Analysis failed"}>{error}</Alert>}

                  {(stage === "analyzing" || stage === "transcribing") && <ProcessingCard stage={stage} />}
                  {report && (
                    <Overview report={report} speakers={speakers} currentTime={currentTime} onSeek={seek} onNavigate={navigate} />
                  )}

                  <RecentAnalyses records={history} />
                </>
              )}

              {view === "latency" && report && <LatencySection report={report} speakers={speakers} onSeek={seek} />}
              {view === "transcript" && report && (
                <TranscriptSection report={report} speakers={speakers} currentTime={currentTime} onSeek={seek} />
              )}
              {view === "interruptions" && report && (
                <InterruptionsSection report={report} speakers={speakers} currentTime={currentTime} onSeek={seek} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <ScrollToggle />
    </div>
    </MotionConfig>
  );
}

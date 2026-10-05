"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Braces, ChevronRight, FileDown, History, LoaderCircle, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Breadcrumb, Breadcrumbs, Link } from "react-aria-components";

import { Button, IconButton, focusRing } from "@/components/aria";
import PipelineSteps, { type Stage } from "@/components/PipelineSteps";
import ProcessingCard from "@/components/ProcessingCard";
import RecentAnalyses, { type RecordActions } from "@/components/RecentAnalyses";
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
import { buildSpeakerMeta, languageLabel } from "@/lib/format";
import {
  downloadReportJson,
  loadAnalysis,
  loadHistory,
  prependHistory,
  removeHistory,
  saveAnalysis,
  type AnalysisRecord,
} from "@/lib/history";
import type { AnalysisReport } from "@/lib/types";

const VIEW_TITLES: Record<View, string> = {
  overview: "Overview",
  latency: "Response Latency",
  interruptions: "Interruptions",
  transcript: "Transcript",
  history: "Past analyses",
};

const savedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

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
  /** The past analysis being viewed, when it was reopened from the history. */
  const [openedRecord, setOpenedRecord] = useState<AnalysisRecord | null>(null);
  const [pdfPendingId, setPdfPendingId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

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

  /** Add a run to the history; completed runs also store their report and recording so they can be reopened. */
  const recordRun = useCallback(
    (record: Omit<AnalysisRecord, "id" | "uploadedAt">, saved?: { report: AnalysisReport; audio: File }) => {
      const uploadedAt = new Date().toISOString();
      const id = `${uploadedAt}-${record.filename}`;
      const add = (extra: Partial<AnalysisRecord>) =>
        setHistory((list) => prependHistory(list, { ...record, ...extra, id, uploadedAt }));
      if (!saved) return add({});
      void saveAnalysis(id, saved.report, saved.audio).then((stored) =>
        add(stored ? { saved: true, hasAudio: stored.hasAudio } : {}),
      );
    },
    [],
  );

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
    setOpenedRecord(null);
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
    setOpenedRecord(null);
    setHistoryError(null);
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
                language: event.report.transcript ? languageLabel(event.report.transcript) : null,
                status: "complete",
              }, { report: event.report, audio: selected });
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

  /** Load a past analysis's stored report, or explain why it can't be. */
  const loadSaved = async (record: AnalysisRecord) => {
    const saved = await loadAnalysis(record.id);
    if (!saved) {
      setHistoryError(
        `The saved report for “${record.filename}” isn't available in this browser anymore (browser data may have been cleared).`,
      );
    }
    return saved;
  };

  const recordActions: RecordActions = {
    pdfPendingId,
    onOpen: async (record) => {
      setHistoryError(null);
      const saved = await loadSaved(record);
      if (!saved) return;
      abortRef.current?.abort();
      audioRef.current?.pause();
      setFile(saved.audio);
      setAudioUrl(saved.audio ? URL.createObjectURL(saved.audio) : null);
      setReport(saved.report);
      setError(null);
      setPdfError(null);
      setFailedAt(null);
      setOpenedRecord(record);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      updateStage("done");
      navigate("overview");
    },
    onDownloadPdf: async (record) => {
      setHistoryError(null);
      setPdfError(null);
      const saved = await loadSaved(record);
      if (!saved) return;
      setPdfPendingId(record.id);
      try {
        await downloadReportPdf(saved.report);
      } catch (err) {
        setPdfError((err as Error).message);
      } finally {
        setPdfPendingId(null);
      }
    },
    onDownloadJson: async (record) => {
      setHistoryError(null);
      const saved = await loadSaved(record);
      if (saved) downloadReportJson(saved.report);
    },
    onDelete: (record) => setHistory((list) => removeHistory(list, record.id)),
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

  const sidebarProps = { view, onNavigate: navigate, report, busy, historyCount: history.length };

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
                <IconButton icon={Braces} label="Download data (JSON)" onPress={() => downloadReportJson(report)} />
              )}
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
          {file && view !== "overview" && view !== "history" && <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6 lg:px-8">{player}</div>}
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

          {pdfError && (
            <div className="animate-fade-up">
              <Alert title="PDF export failed">{pdfError}</Alert>
            </div>
          )}
          {historyError && (
            <div className="animate-fade-up">
              <Alert title="Couldn't open that analysis">{historyError}</Alert>
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
                  <PageHeader
                    eyebrow="Conversation intelligence"
                    title={report ? "Conversation overview" : "Analyze a conversation"}
                    description={
                      report
                        ? "A summary of the whole recording. Click any card, or a layer in the sidebar, to open its detailed analysis."
                        : "Upload a recording to see who spoke when, how quickly each person responds, and who interrupts whom."
                    }
                  />

                  {/* Dropping a file swaps the drop zone for the pipeline and player. */}
                  <AnimatePresence mode="wait" initial={false}>
                    {file || report ? (
                      <motion.div
                        key="loaded"
                        initial={{ opacity: 0, scale: 0.98, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="space-y-6"
                      >
                        {openedRecord ? (
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                            <p className="flex min-w-0 items-center gap-2.5 text-sm text-violet-900">
                              <History className="h-4 w-4 shrink-0" />
                              <span className="min-w-0">
                                Viewing a saved analysis from{" "}
                                <span className="font-semibold">{savedFormat.format(new Date(openedRecord.uploadedAt))}</span>
                                {!file && " (the recording wasn't stored, so playback is unavailable)"}
                              </span>
                            </p>
                            {!file && (
                              <Button size="sm" onPress={reset}>
                                <Plus className="h-3.5 w-3.5" />
                                Analyze a new recording
                              </Button>
                            )}
                          </div>
                        ) : (
                          <PipelineSteps stage={stage} failedAt={failedAt} />
                        )}
                        {file && player}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, filter: "blur(2px)" }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
                      >
                        {player}
                        <WhatHappensNext />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {error && (
                    <div className="animate-fade-up">
                      <Alert title={failedAt === 0 ? "Upload failed" : "Analysis failed"}>{error}</Alert>
                    </div>
                  )}

                  <AnimatePresence mode="wait" initial={false}>
                    {(stage === "analyzing" || stage === "transcribing") && <ProcessingCard key="processing" stage={stage} />}
                    {report && (
                      <Overview
                        key="results"
                        report={report}
                        speakers={speakers}
                        currentTime={currentTime}
                        onSeek={seek}
                        onNavigate={navigate}
                      />
                    )}
                  </AnimatePresence>

                  <RecentAnalyses records={history} limit={5} onViewAll={() => navigate("history")} {...recordActions} />
                </>
              )}

              {view === "history" && (
                <>
                  <PageHeader
                    eyebrow="Conversation intelligence"
                    title="Past analyses"
                    description="Every recording analyzed in this browser. Open one to see its overview, latency, interruptions and transcript again, or download its report as a PDF or its raw data as JSON."
                  />
                  <RecentAnalyses
                    records={history}
                    title="All analyses"
                    subtitle="Saved in this browser only. Other browsers and devices keep their own history."
                    {...recordActions}
                  />
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

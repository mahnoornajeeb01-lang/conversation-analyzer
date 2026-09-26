"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileAudio, Pause, Play, RotateCcw, Sparkles, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { LanguageSelect } from "@/components/LanguagePanel";
import { formatBytes, formatClock } from "@/lib/format";

const ACCEPTED = ".wav,.mp3,.m4a,.flac,.ogg,.mpeg,.mpg,.mpga,.mp2";
const FORMATS = ["WAV", "MP3", "M4A", "FLAC", "OGG", "MPEG"];

interface UploadCardProps {
  file: File | null;
  disabled: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  language: string | null;
  onLanguageChange: (code: string | null) => void;
  onFileSelected: (file: File) => void;
  onReset: () => void;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
}

export default function UploadCard({
  file,
  disabled,
  isPlaying,
  currentTime,
  duration,
  language,
  onLanguageChange,
  onFileSelected,
  onReset,
  onTogglePlay,
  onSeek,
}: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (list: FileList | null) => {
    const picked = list?.[0];
    if (picked) onFileSelected(picked);
  };

  if (file) {
    const pct = duration ? Math.min((currentTime / duration) * 100, 100) : 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200/80 bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-4">
          <motion.button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.35)]"
          >
            {isPlaying && (
              <motion.span
                className="absolute inset-0 rounded-full border-2 border-violet-400"
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.45, opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 pl-0.5" />}
          </motion.button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                <FileAudio className="h-4 w-4 shrink-0 text-violet-500" />
                <span className="truncate">{file.name}</span>
              </p>
              <span className="shrink-0 text-xs text-slate-400">{formatBytes(file.size)}</span>
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <span className="w-10 font-mono text-[11px] text-slate-500">{formatClock(currentTime)}</span>
              <div className="relative h-1.5 flex-1 rounded-full bg-slate-100">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                  style={{ width: `${pct}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={Math.min(currentTime, duration || 0)}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  disabled={!duration}
                  aria-label="Seek"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </div>
              <span className="w-10 text-right font-mono text-[11px] text-slate-500">{formatClock(duration)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-violet-400/60 hover:bg-violet-500/10 hover:text-violet-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New recording
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) pick(e.dataTransfer.files);
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={dragging ? { opacity: 1, y: 0, scale: [1, 1.015, 1.01] } : { opacity: 1, y: 0, scale: 1 }}
      transition={dragging ? { duration: 0.9, repeat: Infinity, repeatType: "reverse" } : { duration: 0.35 }}
      className={`group relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center backdrop-blur-xl transition-colors sm:p-12 ${
        dragging
          ? "border-violet-500 bg-violet-500/10"
          : "border-slate-200 bg-surface hover:border-violet-500/60"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.14),transparent_60%)] opacity-70 transition-opacity duration-500 group-hover:opacity-100"
      />
      <div className="relative">
        <motion.div
          animate={dragging ? { y: [0, -8, 0] } : { y: 0 }}
          transition={dragging ? { duration: 0.8, repeat: Infinity } : undefined}
          whileHover={{ y: -4 }}
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30"
        >
          <UploadCloud className="h-7 w-7" />
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.h2
            key={dragging ? "drop" : "idle"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mt-5 text-lg font-medium text-slate-900"
          >
            {dragging ? "Drop to start the analysis" : "Upload a conversation recording"}
          </motion.h2>
        </AnimatePresence>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
          Drag and drop an audio file, or browse. We&apos;ll transcribe it, identify each speaker, and measure
          response latency, interruptions and emotional tone.
        </p>

        <motion.button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2.5 font-medium text-white shadow-md transition-shadow hover:from-violet-500 hover:to-indigo-500 hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          Browse files
        </motion.button>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
          {FORMATS.map((f, i) => (
            <motion.span
              key={f}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.04 }}
              className="rounded-md border border-slate-200 bg-slate-100/70 px-2.5 py-1 font-mono text-[11px] text-slate-500"
            >
              {f}
            </motion.span>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
          <span className="text-[11px] text-slate-500">up to 200 MB</span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-600">
          <label htmlFor="upload-language">Spoken language</label>
          <LanguageSelect id="upload-language" value={language} onChange={onLanguageChange} disabled={disabled} />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Leave on auto-detect, or choose it if you know it. That&apos;s the most reliable option for mixed or accented speech.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </motion.div>
  );
}

"use client";

import { motion } from "framer-motion";
import { FileAudio, Pause, Play, RotateCcw, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { formatBytes, formatClock } from "@/lib/format";

const ACCEPTED = ".wav,.mp3,.m4a,.flac,.ogg,.mpeg,.mpg,.mpga,.mp2";
const FORMATS = ["WAV", "MP3", "M4A", "FLAC", "OGG", "MPEG"];

interface UploadCardProps {
  file: File | null;
  disabled: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
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
    <div
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
      className={`flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center shadow-sm transition-colors sm:px-10 ${
        dragging ? "border-violet-500 bg-violet-50" : "border-slate-300 bg-surface hover:border-violet-400"
      }`}
    >
      <motion.span
        animate={dragging ? { y: [0, -6, 0] } : { y: 0 }}
        transition={dragging ? { duration: 0.8, repeat: Infinity } : undefined}
        className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600"
      >
        <UploadCloud className="h-6 w-6" />
      </motion.span>

      <h2 className="mt-5 text-base font-semibold text-slate-900">
        {dragging ? "Release to start the analysis" : "Drop an audio file to begin"}
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
        Upload a recorded conversation and we&apos;ll map who spoke when, how quickly each person responds, and who
        interrupts whom.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-50 dark:hover:bg-violet-600/90"
        >
          Browse files
        </button>
        <span className="text-sm text-slate-500">or drag and drop</span>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
        {FORMATS.map((f) => (
          <span key={f} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
            {f}
          </span>
        ))}
        <span className="mx-1 h-3.5 w-px bg-slate-200" aria-hidden />
        <span className="text-[11px] text-slate-500">Max 200 MB</span>
      </div>

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
  );
}

"use client";

import { FileAudio, Pause, Play, RotateCcw, UploadCloud } from "lucide-react";
import {
  Button as AriaButton,
  DropZone,
  FileTrigger,
  Slider,
  SliderThumb,
  SliderTrack,
  type FileDropItem,
} from "react-aria-components";

import { Button, focusRing } from "@/components/aria";
import { formatBytes, formatClock } from "@/lib/format";

const ACCEPTED = [".wav", ".mp3", ".m4a", ".flac", ".ogg", ".mpeg", ".mpg", ".mpga", ".mp2"];
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

function Player({
  file,
  isPlaying,
  currentTime,
  duration,
  onReset,
  onTogglePlay,
  onSeek,
}: Omit<UploadCardProps, "disabled" | "onFileSelected"> & { file: File }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-surface p-4 shadow-xs sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5">
      <AriaButton
        onPress={onTogglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className={`flex h-11 w-11 shrink-0 cursor-default items-center justify-center rounded-full bg-violet-600 text-white shadow-sm transition-colors hover:bg-violet-700 pressed:bg-violet-800 dark:hover:bg-violet-500 ${focusRing}`}
      >
        {isPlaying ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5 translate-x-px" />}
      </AriaButton>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
            <FileAudio className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate">{file.name}</span>
          </p>
          <span className="shrink-0 text-xs text-slate-500">{formatBytes(file.size)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <span className="w-10 font-mono text-[11px] text-slate-500 tabular-nums">{formatClock(currentTime)}</span>
          <Slider
            aria-label="Playback position"
            minValue={0}
            maxValue={duration || 1}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={onSeek}
            isDisabled={!duration}
            className="flex-1"
          >
            <SliderTrack className="relative h-5 w-full cursor-pointer disabled:cursor-default">
              {({ state }) => (
                <>
                  <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-slate-100" />
                  <div
                    className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-violet-600"
                    style={{ width: `${state.getThumbPercent(0) * 100}%` }}
                  />
                  <SliderThumb className="top-1/2 h-3.5 w-3.5 rounded-full border-2 border-violet-600 bg-white shadow-sm transition-transform outline-none dragging:scale-125 focus-visible:ring-4 focus-visible:ring-violet-500/30 disabled:hidden" />
                </>
              )}
            </SliderTrack>
          </Slider>
          <span className="w-10 text-right font-mono text-[11px] text-slate-500 tabular-nums">{formatClock(duration)}</span>
        </div>
      </div>

      <Button size="sm" onPress={onReset} className="col-span-2 justify-self-end sm:col-span-1">
        <RotateCcw className="h-3.5 w-3.5" />
        New recording
      </Button>
    </div>
  );
}

export default function UploadCard(props: UploadCardProps) {
  const { file, disabled, onFileSelected } = props;

  if (file) return <Player {...props} file={file} />;

  return (
    <DropZone
      isDisabled={disabled}
      aria-label="Drop an audio file"
      onDrop={async (e) => {
        const item = e.items.find((i): i is FileDropItem => i.kind === "file");
        if (item) onFileSelected(await item.getFile());
      }}
      className={`group flex h-full min-h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-surface px-6 py-12 text-center transition-colors hover:border-violet-400 drop-target:border-violet-500 drop-target:bg-violet-50 sm:px-10 ${focusRing}`}
    >
      {({ isDropTarget }) => (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:text-violet-700">
            <UploadCloud className="h-6 w-6" />
          </span>

          <h2 className="mt-5 text-base font-semibold text-slate-900">
            {isDropTarget ? "Release to start the analysis" : "Drop an audio file to begin"}
          </h2>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
            Upload a recorded conversation and we&apos;ll map who spoke when, how quickly each person responds, and who
            interrupts whom.
          </p>

          <div className="mt-6 flex items-center gap-3">
            <FileTrigger
              acceptedFileTypes={ACCEPTED}
              onSelect={(files) => {
                const picked = files?.[0];
                if (picked) onFileSelected(picked);
              }}
            >
              <Button variant="primary" isDisabled={disabled}>
                Browse files
              </Button>
            </FileTrigger>
            <span className="text-sm text-slate-500">or drag and drop</span>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
            {FORMATS.map((f) => (
              <span key={f} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                {f}
              </span>
            ))}
            <span className="mx-1 h-3.5 w-px bg-slate-200" aria-hidden />
            <span className="text-[11px] text-slate-500">Max 200 MB</span>
          </div>
        </>
      )}
    </DropZone>
  );
}

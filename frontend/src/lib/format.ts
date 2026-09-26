import { Angry, Frown, Meh, Smile, Sparkles, Zap, type LucideIcon } from "lucide-react";

import type { AnalysisReport, Emotion } from "./types";

export function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function formatSeconds(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(decimals)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Speaker identity colours, assigned in fixed order of appearance (never by rank).
 * Slots come from the validated categorical palette: blue, orange, aqua, yellow;
 * each is a CSS variable with its own light/dark step (see globals.css).
 */
export const SPEAKER_COLORS = ["var(--speaker-1)", "var(--speaker-2)", "var(--speaker-3)", "var(--speaker-4)"] as const;

export interface SpeakerMeta {
  label: string;
  name: string;
  initials: string;
  color: string;
  index: number;
}

function initialsOf(name: string): string {
  const match = name.match(/^Speaker (\d+)$/);
  if (match) return `S${match[1]}`;
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Display name, initials and colour for every diarization label in the report. */
export function buildSpeakerMeta(report: AnalysisReport | null): Record<string, SpeakerMeta> {
  const map: Record<string, SpeakerMeta> = {};
  if (!report) return map;
  report.speakers.forEach((label, index) => {
    const profile = report.speaker_profiles?.find((p) => p.speaker === label);
    const name = profile?.display_name ?? label;
    map[label] = {
      label,
      name,
      initials: initialsOf(name),
      color: SPEAKER_COLORS[index % SPEAKER_COLORS.length],
      index,
    };
  });
  return map;
}

export function speakerName(meta: Record<string, SpeakerMeta>, label: string | null | undefined): string {
  if (!label) return "Unknown";
  return meta[label]?.name ?? label;
}

/**
 * Emotion families in stacking order. Colours are CSS variables (see globals.css) whose
 * light and dark steps were each checked with the dataviz palette validator; some sit
 * below 3:1 on their surface, so every emotion chart also carries text labels/percentages.
 */
export const EMOTION_ORDER: Emotion[] = ["surprise", "joy", "fear", "sadness", "anger", "neutral"];

export const EMOTION_META: Record<Emotion, { label: string; color: string; icon: LucideIcon }> = {
  surprise: { label: "Surprise", color: "var(--emo-surprise)", icon: Sparkles },
  joy: { label: "Joy", color: "var(--emo-joy)", icon: Smile },
  fear: { label: "Fear", color: "var(--emo-fear)", icon: Zap },
  sadness: { label: "Sadness", color: "var(--emo-sadness)", icon: Frown },
  anger: { label: "Anger", color: "var(--emo-anger)", icon: Angry },
  neutral: { label: "Neutral", color: "var(--emo-neutral)", icon: Meh },
};

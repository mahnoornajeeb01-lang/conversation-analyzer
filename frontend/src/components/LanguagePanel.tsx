"use client";

import { Languages, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { COMMON_LANGUAGES, LANGUAGES, languageName } from "@/lib/languages";
import type { Transcript } from "@/lib/types";

/** Below this, Whisper's language guess is shown as uncertain. */
const CONFIDENT = 0.7;

const OTHERS = Object.keys(LANGUAGES).filter((c) => !COMMON_LANGUAGES.includes(c));

export function LanguageSelect({
  value,
  onChange,
  disabled,
  autoLabel = "Auto-detect",
  id,
}: {
  value: string | null;
  onChange: (code: string | null) => void;
  disabled?: boolean;
  autoLabel?: string;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-xl border border-slate-200 bg-surface py-2 pr-8 pl-3 text-sm text-slate-800 outline-none transition hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:opacity-50"
    >
      <option value="">{autoLabel}</option>
      <optgroup label="Common">
        {COMMON_LANGUAGES.map((c) => (
          <option key={c} value={c}>
            {LANGUAGES[c]}
          </option>
        ))}
      </optgroup>
      <optgroup label="All languages">
        {OTHERS.map((c) => (
          <option key={c} value={c}>
            {LANGUAGES[c]}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

/** Detected language, Whisper's confidence and alternatives, with a one-click re-run. */
export function LanguageNotice({
  transcript,
  busy,
  onReanalyze,
}: {
  transcript: Transcript;
  busy: boolean;
  onReanalyze: (code: string | null) => void;
}) {
  const detected = transcript.language_source === "detected";
  const p = transcript.language_probability;
  const uncertain = detected && p !== null && p < CONFIDENT;
  const [choice, setChoice] = useState<string | null>(transcript.language_alternatives[0]?.code ?? null);

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border px-4 py-3 text-sm ${
        uncertain ? "border-amber-200 bg-amber-50" : "border-slate-200/80 bg-surface"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          uncertain ? "bg-amber-100 text-amber-700" : "bg-violet-50 text-violet-600"
        }`}
      >
        {uncertain ? <TriangleAlert className="h-4 w-4" /> : <Languages className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">
          {languageName(transcript.language)}
          <span className="ml-2 text-xs font-medium text-slate-500">
            {detected ? (p !== null ? `detected · ${Math.round(p * 100)}% confident` : "detected") : "selected manually"}
          </span>
        </p>
        <p className={`text-xs ${uncertain ? "text-amber-800" : "text-slate-500"}`}>
          {uncertain
            ? "Whisper isn't sure about the language, so the transcript may be wrong. Pick the correct one and re-analyze."
            : detected && transcript.language_alternatives.length > 0
              ? `Other candidates: ${transcript.language_alternatives
                  .map((a) => `${languageName(a.code)} ${Math.round(a.probability * 100)}%`)
                  .join(", ")}`
              : "Wrong language? Choose another and re-analyze."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSelect value={choice} onChange={setChoice} disabled={busy} autoLabel="Auto-detect again" />
        <button
          type="button"
          disabled={busy}
          onClick={() => onReanalyze(choice)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Re-analyze
        </button>
      </div>
    </div>
  );
}

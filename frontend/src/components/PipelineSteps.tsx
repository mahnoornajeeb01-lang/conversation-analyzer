import { Check, LoaderCircle, TriangleAlert, type LucideIcon } from "lucide-react";
import { AudioLines, Languages, Upload } from "lucide-react";

export type Stage = "idle" | "analyzing" | "transcribing" | "done" | "error";

type StepState = "pending" | "active" | "done" | "error";

const STEPS: { key: string; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "upload", label: "Upload", hint: "Add a recording", icon: Upload },
  { key: "analyze", label: "Timing analysis", hint: "Speakers, response latency & interruptions", icon: AudioLines },
  { key: "transcribe", label: "Transcription", hint: "Language detection & speech-to-text", icon: Languages },
];

function stateFor(index: number, stage: Stage, failedAt: number | null): StepState {
  if (stage === "error") {
    if (failedAt === index) return "error";
    return failedAt !== null && index < failedAt ? "done" : "pending";
  }
  const current = { idle: 0, analyzing: 1, transcribing: 2, done: 3, error: 0 }[stage];
  if (stage === "idle") return index === 0 ? "active" : "pending";
  if (index < current) return "done";
  if (index === current) return "active";
  return "pending";
}

export default function PipelineSteps({
  stage,
  failedAt,
}: {
  stage: Stage;
  /** Index of the step that failed when stage === "error". */
  failedAt: number | null;
}) {
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {STEPS.map((step, i) => {
        const state = stateFor(i, stage, failedAt);
        const Icon = step.icon;
        const styles = {
          pending: "border-slate-200 bg-surface text-slate-500",
          active: "border-violet-200 bg-violet-50 text-violet-700",
          done: "border-emerald-200 bg-emerald-50 text-emerald-700",
          error: "border-rose-200 bg-rose-50 text-rose-700",
        }[state];

        const working = state === "active" && stage !== "idle";
        return (
          <li
            key={step.key}
            className={`relative flex animate-fade-up items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 transition-colors duration-500 ${styles}`}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface shadow-xs">
              {working && <span className="absolute inset-0 animate-ping rounded-lg bg-violet-400/30" aria-hidden />}
              {/* Keyed by state so each change pops the new icon in. */}
              <span key={state} className="block animate-pop">
                {state === "done" ? (
                  <Check className="h-4 w-4" />
                ) : state === "error" ? (
                  <TriangleAlert className="h-4 w-4" />
                ) : working ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {i + 1}. {step.label}
              </p>
              <p className="truncate text-xs opacity-75">{step.hint}</p>
            </div>
            {working && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-hidden>
                <span className="absolute inset-y-0 w-1/3 animate-[progress_1.4s_ease-in-out_infinite] bg-violet-500" />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

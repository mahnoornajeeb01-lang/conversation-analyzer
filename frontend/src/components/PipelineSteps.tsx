import { Check, LoaderCircle, TriangleAlert, type LucideIcon } from "lucide-react";
import { AudioLines, FileText, Upload } from "lucide-react";

export type Stage = "idle" | "transcribing" | "analyzing" | "done" | "error";

type StepState = "pending" | "active" | "done" | "error";

const STEPS: { key: string; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "upload", label: "Upload", hint: "Add a recording", icon: Upload },
  { key: "transcribe", label: "Speech to text", hint: "Whisper transcription", icon: FileText },
  { key: "analyze", label: "Conversation analysis", hint: "Speakers, timing & emotions", icon: AudioLines },
];

function stateFor(index: number, stage: Stage, failedAt: number | null): StepState {
  if (stage === "error") {
    if (failedAt === index) return "error";
    return failedAt !== null && index < failedAt ? "done" : "pending";
  }
  const current = { idle: 0, transcribing: 1, analyzing: 2, done: 3, error: 0 }[stage];
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
    <ol className="grid gap-3 sm:grid-cols-3">
      {STEPS.map((step, i) => {
        const state = stateFor(i, stage, failedAt);
        const Icon = step.icon;
        const styles = {
          pending: "border-slate-200 bg-surface text-slate-400",
          active: "border-violet-300 bg-violet-50 text-violet-700",
          done: "border-emerald-200 bg-emerald-50 text-emerald-700",
          error: "border-rose-200 bg-rose-50 text-rose-700",
        }[state];

        return (
          <li key={step.key} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${styles}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface/80 shadow-sm">
              {state === "done" ? (
                <Check className="h-4 w-4" />
              ) : state === "error" ? (
                <TriangleAlert className="h-4 w-4" />
              ) : state === "active" && stage !== "idle" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {i + 1}. {step.label}
              </p>
              <p className="truncate text-xs opacity-75">{step.hint}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

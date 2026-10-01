import { Card } from "@/components/ui";

const STEPS = [
  { title: "Speaker identification", text: "The recording is split into time-stamped turns, each attributed to a distinct speaker." },
  { title: "Response latency", text: "The gap between one speaker finishing and the next starting is measured for every turn." },
  { title: "Interruptions", text: "Overlapping speech is detected and classified as a floor-taking interruption or a backchannel." },
];

export default function WhatHappensNext() {
  return (
    <Card title="What happens next" subtitle="Each recording runs through three stages.">
      <ol>
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative flex gap-3.5 pb-6 last:pb-0">
            {i < STEPS.length - 1 && (
              <span className="absolute top-8 bottom-1 left-[13px] w-px bg-slate-200" aria-hidden />
            )}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 font-mono text-[11px] font-semibold text-slate-600">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-slate-900">{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

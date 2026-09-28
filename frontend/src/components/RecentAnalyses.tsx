import { AudioWaveform, FileAudio } from "lucide-react";

import { formatClock } from "@/lib/format";
import type { AnalysisRecord } from "@/lib/history";

const COLUMNS = ["Recording", "Duration", "Speakers", "Uploaded", "Status"];

const uploadedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function RecentAnalyses({ records }: { records: AnalysisRecord[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-3 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Recent analyses</h2>
        <span className="text-xs text-slate-500">
          {records.length} {records.length === 1 ? "recording" : "recordings"}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              {COLUMNS.map((col) => (
                <th key={col} scope="col" className="px-6 py-2.5 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length}>
                  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <AudioWaveform className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-slate-700">No recordings analyzed yet</p>
                    <p className="mt-1 text-xs text-slate-500">Completed analyses will appear here.</p>
                  </div>
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} className="text-slate-700">
                  <td className="max-w-xs px-6 py-3">
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <FileAudio className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">{r.filename}</span>
                    </span>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs">{r.duration != null ? formatClock(r.duration) : "—"}</td>
                  <td className="px-6 py-3">{r.speakers ?? "—"}</td>
                  <td className="px-6 py-3 text-xs text-slate-500">{uploadedFormat.format(new Date(r.uploadedAt))}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                        r.status === "complete"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${r.status === "complete" ? "bg-emerald-500" : "bg-red-500"}`}
                      />
                      {r.status === "complete" ? "Complete" : "Failed"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

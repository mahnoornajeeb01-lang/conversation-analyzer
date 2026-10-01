"use client";

import { AudioWaveform, FileAudio } from "lucide-react";
import { Cell, Column, Row, Table, TableBody, TableHeader } from "react-aria-components";

import { Card } from "@/components/ui";
import { formatClock } from "@/lib/format";
import type { AnalysisRecord } from "@/lib/history";

const uploadedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const th = "px-5 py-2.5 text-left text-xs font-medium text-slate-500 outline-none";
const td = "px-5 py-3 outline-none";

export default function RecentAnalyses({ records }: { records: AnalysisRecord[] }) {
  return (
    <Card
      title="Recent analyses"
      subtitle="Recordings analyzed in this browser"
      action={
        <span className="text-xs text-slate-500">
          {records.length} {records.length === 1 ? "recording" : "recordings"}
        </span>
      }
      bodyClassName="overflow-x-auto"
    >
      <Table aria-label="Recent analyses" className="w-full min-w-[640px] text-sm">
        <TableHeader className="border-b border-slate-200 bg-slate-50">
          <Column isRowHeader className={th}>
            Recording
          </Column>
          <Column className={th}>Duration</Column>
          <Column className={th}>Speakers</Column>
          <Column className={th}>Uploaded</Column>
          <Column className={`${th} text-right`}>Status</Column>
        </TableHeader>
        <TableBody
          items={records}
          renderEmptyState={() => (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <AudioWaveform className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-700">No recordings analyzed yet</p>
              <p className="mt-1 text-xs text-slate-500">Completed analyses will appear here.</p>
            </div>
          )}
        >
          {(r) => (
            <Row id={r.id} className="border-b border-slate-100 text-slate-700 last:border-b-0">
              <Cell className={`${td} max-w-xs`}>
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  <FileAudio className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{r.filename}</span>
                </span>
              </Cell>
              <Cell className={`${td} font-mono text-xs tabular-nums`}>
                {r.duration != null ? formatClock(r.duration) : "—"}
              </Cell>
              <Cell className={td}>{r.speakers ?? "—"}</Cell>
              <Cell className={`${td} text-xs text-slate-500`}>{uploadedFormat.format(new Date(r.uploadedAt))}</Cell>
              <Cell className={`${td} text-right`}>
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
              </Cell>
            </Row>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

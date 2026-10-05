"use client";

import { ArrowRight, AudioWaveform, Braces, Eye, FileAudio, FileDown, LoaderCircle, Trash2, X } from "lucide-react";
import {
  Cell,
  Column,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  Row,
  Table,
  TableBody,
  TableHeader,
} from "react-aria-components";

import { Button, IconButton } from "@/components/aria";
import { Card } from "@/components/ui";
import { formatClock } from "@/lib/format";
import type { AnalysisRecord } from "@/lib/history";

const uploadedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const th = "px-5 py-2.5 text-left text-xs font-medium text-slate-500 outline-none";
const td = "px-5 py-3 outline-none";

export interface RecordActions {
  onOpen: (record: AnalysisRecord) => void;
  onDownloadPdf: (record: AnalysisRecord) => void;
  onDownloadJson: (record: AnalysisRecord) => void;
  onDelete: (record: AnalysisRecord) => void;
  /** Record whose PDF is being prepared. */
  pdfPendingId: string | null;
}

function DeleteButton({ record, onDelete }: { record: AnalysisRecord; onDelete: () => void }) {
  return (
    <DialogTrigger>
      <IconButton icon={Trash2} label="Delete" variant="ghost" />
      <ModalOverlay
        isDismissable
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm transition-opacity duration-200 entering:opacity-0 exiting:opacity-0"
      >
        <Modal className="w-full max-w-md rounded-xl border border-slate-200 bg-surface-solid shadow-2xl entering:animate-dialog-in exiting:animate-dialog-out">
          <Dialog role="alertdialog" className="outline-none">
            {({ close }) => (
              <>
                <div className="flex items-start justify-between gap-4 px-6 pt-5">
                  <Heading slot="title" className="text-base font-semibold text-slate-900">
                    Delete this analysis?
                  </Heading>
                  <IconButton icon={X} label="Close" variant="ghost" onPress={close} />
                </div>
                <p className="px-6 pt-1 pb-5 text-sm leading-relaxed text-slate-600">
                  <span className="font-medium break-all text-slate-900">{record.filename}</span> and its saved
                  report will be removed from this browser. This can&apos;t be undone.
                </p>
                <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                  <Button onPress={close}>Cancel</Button>
                  <Button
                    variant="primary"
                    className="bg-red-600 hover:bg-red-700 pressed:bg-red-800 dark:hover:bg-red-500"
                    onPress={() => {
                      onDelete();
                      close();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

export default function RecentAnalyses({
  records,
  limit,
  onViewAll,
  title = "Recent analyses",
  subtitle = "Recordings analyzed in this browser. Open one to see its full analysis again.",
  ...actions
}: RecordActions & {
  records: AnalysisRecord[];
  /** Show only the newest few, with a link to the full history. */
  limit?: number;
  onViewAll?: () => void;
  title?: string;
  subtitle?: string;
}) {
  const shown = limit ? records.slice(0, limit) : records;
  const hidden = records.length - shown.length;

  return (
    <Card
      title={title}
      subtitle={subtitle}
      action={
        hidden > 0 && onViewAll ? (
          <Button variant="link" size="sm" onPress={onViewAll}>
            View all {records.length}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <span className="text-xs text-slate-500">
            {records.length} {records.length === 1 ? "recording" : "recordings"}
          </span>
        )
      }
      bodyClassName="overflow-x-auto"
    >
      <Table aria-label={title} className="w-full min-w-[860px] text-sm">
        <TableHeader className="border-b border-slate-200 bg-slate-50">
          <Column isRowHeader className={th}>
            Recording
          </Column>
          <Column className={th}>Duration</Column>
          <Column className={th}>Speakers</Column>
          <Column className={th}>Language</Column>
          <Column className={th}>Uploaded</Column>
          <Column className={th}>Status</Column>
          <Column className={`${th} text-right`}>Actions</Column>
        </TableHeader>
        <TableBody
          items={shown}
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
          {(r) => {
            const openable = r.status === "complete" && r.saved;
            const pdfPending = actions.pdfPendingId === r.id;
            return (
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
                <Cell className={td}>{r.language ?? "—"}</Cell>
                <Cell className={`${td} text-xs text-slate-500`}>{uploadedFormat.format(new Date(r.uploadedAt))}</Cell>
                <Cell className={td}>
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
                <Cell className={`${td} py-2`}>
                  <span className="flex items-center justify-end gap-1">
                    {openable ? (
                      <>
                        <Button variant="link" size="sm" onPress={() => actions.onOpen(r)}>
                          <Eye className="h-3.5 w-3.5" />
                          Open
                        </Button>
                        <IconButton
                          icon={pdfPending ? LoaderCircle : FileDown}
                          label={pdfPending ? "Preparing PDF…" : "Download PDF"}
                          variant="ghost"
                          isPending={pdfPending}
                          className={pdfPending ? "[&_svg]:animate-spin" : ""}
                          onPress={() => actions.onDownloadPdf(r)}
                        />
                        <IconButton
                          icon={Braces}
                          label="Download data (JSON)"
                          variant="ghost"
                          onPress={() => actions.onDownloadJson(r)}
                        />
                      </>
                    ) : (
                      r.status === "complete" && (
                        <span className="mr-2 text-xs text-slate-400" title="Analyzed before reports were saved">
                          Report not saved
                        </span>
                      )
                    )}
                    <DeleteButton record={r} onDelete={() => actions.onDelete(r)} />
                  </span>
                </Cell>
              </Row>
            );
          }}
        </TableBody>
      </Table>
    </Card>
  );
}

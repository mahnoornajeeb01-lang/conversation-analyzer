import type { AnalysisReport, StreamEvent } from "./types";

/** Empty = same origin: the production build is served by the backend itself.
 *  `next dev` sets it to http://localhost:8000 via .env.development.local. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/**
 * Upload a recording and stream pipeline events back as they happen:
 * analyzing -> report (or error).
 */
export async function analyzeRecording(
  file: File,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const body = new FormData();
  body.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/analyze/stream`, {
      method: "POST",
      body,
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error(
      `Could not reach the analysis server${API_BASE_URL ? ` at ${API_BASE_URL}` : ""}. Is the backend running?`,
    );
  }

  if (!response.ok || !response.body) {
    let detail = `Request failed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as StreamEvent);
      newline = buffer.indexOf("\n");
    }
  }

  const tail = buffer.trim();
  if (tail) onEvent(JSON.parse(tail) as StreamEvent);
}

/** Render the finished report as a PDF on the server and save it. */
export async function downloadReportPdf(report: AnalysisReport): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/report/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
  } catch {
    throw new Error(`Could not reach the analysis server${API_BASE_URL ? ` at ${API_BASE_URL}` : ""}.`);
  }
  if (!response.ok) {
    let detail = `PDF export failed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename =
    disposition.match(/filename="?([^";]+)"?/)?.[1] ??
    `${report.filename.replace(/\.[^.]+$/, "")}-analysis.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

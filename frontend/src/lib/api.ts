import type { AnalysisReport, StreamEvent } from "./types";

/**
 * Where the analysis server is, decided at request time:
 * 1. `?server=https://….trycloudflare.com` in the page link (the Vercel site; share.bat
 *    prints this link), so a new tunnel address never needs a rebuild;
 * 2. NEXT_PUBLIC_API_BASE_URL (`next dev` sets http://localhost:8000 via .env.development.local);
 * 3. otherwise the same origin, for the copy of the site the backend serves itself.
 */
export function apiBase(): string {
  if (typeof window !== "undefined") {
    const fromLink = new URLSearchParams(window.location.search).get("server");
    if (fromLink && isAllowedServer(fromLink)) return new URL(fromLink).origin;
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

/** Only the addresses a share link can legitimately use, so a crafted link can't send
 *  someone's recording to an arbitrary server. */
function isAllowedServer(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && u.hostname.endsWith(".trycloudflare.com")) return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function unreachable(base: string): Error {
  return new Error(
    base
      ? "The analysis server is offline right now (the computer running it is off or was restarted). Please try again later."
      : "This page isn't connected to an analysis server yet. Please try again later.",
  );
}

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
  const base = apiBase();

  let response: Response;
  try {
    response = await fetch(`${base}/api/analyze/stream`, {
      method: "POST",
      body,
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw unreachable(base);
  }

  // No server: the Vercel host has no /api route. Tunnel errors (e.g. 530) mean the PC is off.
  if ((!base && (response.status === 404 || response.status === 405)) || response.status === 530) {
    throw unreachable(base);
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
  const base = apiBase();
  let response: Response;
  try {
    response = await fetch(`${base}/api/report/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
  } catch {
    throw unreachable(base);
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

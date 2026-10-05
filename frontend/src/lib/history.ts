/**
 * Past analyses, kept in this browser only (the server stores nothing between runs).
 * The list itself lives in localStorage; each completed run's full report and recording
 * live in IndexedDB, which has room for audio files.
 */

import type { AnalysisReport } from "./types";

export interface AnalysisRecord {
  id: string;
  filename: string;
  /** Seconds, or null when the analysis failed before the duration was known. */
  duration: number | null;
  speakers: number | null;
  /** Detected spoken language, e.g. "English". Absent on older records. */
  language?: string | null;
  uploadedAt: string;
  status: "complete" | "failed";
  /** The full report is stored and can be reopened. Absent on older records. */
  saved?: boolean;
  /** The recording was stored alongside the report, so playback works when reopened. */
  hasAudio?: boolean;
}

export interface SavedAnalysis {
  report: AnalysisReport;
  audio: File | null;
}

const STORAGE_KEY = "ca-recent-analyses";
const MAX_RECORDS = 50;

export function loadHistory(): AnalysisRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as AnalysisRecord[]) : [];
  } catch {
    return [];
  }
}

function storeHistory(list: AnalysisRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked (private mode); the list still shows for this visit */
  }
}

export function prependHistory(list: AnalysisRecord[], record: AnalysisRecord): AnalysisRecord[] {
  const next = [record, ...list];
  for (const evicted of next.slice(MAX_RECORDS)) {
    if (evicted.saved) void deleteAnalysis(evicted.id);
  }
  storeHistory(next.slice(0, MAX_RECORDS));
  return next.slice(0, MAX_RECORDS);
}

export function removeHistory(list: AnalysisRecord[], id: string): AnalysisRecord[] {
  const next = list.filter((r) => r.id !== id);
  storeHistory(next);
  void deleteAnalysis(id);
  return next;
}

// --- IndexedDB: full reports and recordings ------------------------------------------

const DB_NAME = "conversation-analyzer";
const STORE = "analyses";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Store a finished analysis. Falls back to the report alone when the recording doesn't
 * fit in the browser's quota. Resolves to what was stored, or null if nothing could be.
 */
export async function saveAnalysis(
  id: string,
  report: AnalysisReport,
  audio: File | null,
): Promise<{ hasAudio: boolean } | null> {
  try {
    await withStore("readwrite", (s) => s.put({ report, audio } satisfies SavedAnalysis, id));
    return { hasAudio: audio != null };
  } catch {
    if (!audio) return null;
    try {
      await withStore("readwrite", (s) => s.put({ report, audio: null } satisfies SavedAnalysis, id));
      return { hasAudio: false };
    } catch {
      return null;
    }
  }
}

export async function loadAnalysis(id: string): Promise<SavedAnalysis | null> {
  try {
    return ((await withStore("readonly", (s) => s.get(id))) as SavedAnalysis | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deleteAnalysis(id: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(id));
  } catch {
    /* nothing stored, or storage blocked */
  }
}

/** Save the report's raw data as a JSON file. */
export function downloadReportJson(report: AnalysisReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.filename.replace(/\.[^.]+$/, "")}-analysis.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

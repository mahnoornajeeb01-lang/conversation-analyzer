/** Recent analyses, kept in this browser only (the server stores nothing between runs). */

export interface AnalysisRecord {
  id: string;
  filename: string;
  /** Seconds, or null when the analysis failed before the duration was known. */
  duration: number | null;
  speakers: number | null;
  uploadedAt: string;
  status: "complete" | "failed";
}

const STORAGE_KEY = "ca-recent-analyses";
const MAX_RECORDS = 20;

export function loadHistory(): AnalysisRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as AnalysisRecord[]) : [];
  } catch {
    return [];
  }
}

export function prependHistory(list: AnalysisRecord[], record: AnalysisRecord): AnalysisRecord[] {
  const next = [record, ...list].slice(0, MAX_RECORDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked (private mode); the list still shows for this visit */
  }
  return next;
}

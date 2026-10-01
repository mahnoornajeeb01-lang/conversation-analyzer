export type Classification =
  | "Successful Interruption (Floor Transfer)"
  | "Competitive Overlap / Backchannel"
  | "Brief Overlap";

export interface SpeakerSegment {
  speaker: string;
  start: number;
  end: number;
}

export interface LatencyEvent {
  previous_speaker: string;
  next_speaker: string;
  previous_end: number;
  next_start: number;
  latency_seconds: number;
}

export interface LatencyStats {
  average: number;
  median: number;
  minimum: number;
  maximum: number;
  total_turns_analyzed: number;
}

export interface OverlapEvent {
  speaker_a: string;
  speaker_b: string;
  start: number;
  end: number;
  duration: number;
}

export interface InterruptionEvent {
  interrupter: string;
  interrupted: string;
  overlap_start: number;
  overlap_end: number;
  overlap_duration: number;
  time_to_yield: number;
  classification: Classification;
  timestamp: number;
}

export interface SpeakerProfile {
  speaker: string;
  talk_time: number;
  talk_share: number;
  turns: number;
}

export interface TranscriptSegment {
  speaker: string | null;
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  /** ISO 639-1 code detected by Whisper, e.g. "en" or "ur". */
  language: string;
  language_name: string;
  language_probability: number;
  right_to_left: boolean;
  segments: TranscriptSegment[];
  word_count: number;
  model: string;
}

export interface AnalysisReport {
  filename: string;
  total_duration: number;
  speakers: string[];
  speaker_count: number;
  segments: SpeakerSegment[];
  latencies: LatencyEvent[];
  latency_stats: LatencyStats;
  overlaps: OverlapEvent[];
  overlap_count: number;
  interruptions: InterruptionEvent[];
  interruption_count: number;
  successful_interruption_count: number;
  backchannel_count: number;
  diarization_source: "pyannote" | "mock";
  speaker_profiles: SpeakerProfile[];
  /** Missing when speech-to-text is switched off or failed (see transcript_error). */
  transcript?: Transcript | null;
  transcript_error?: string | null;
  /** Seconds spent per pipeline stage, plus "total". */
  timings: Record<string, number>;
}

export type StreamEvent =
  | { stage: "analyzing" }
  | { stage: "transcribing" }
  | { stage: "report"; report: AnalysisReport }
  | { stage: "error"; detail: string };

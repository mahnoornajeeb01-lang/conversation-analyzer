export type Classification =
  | "Successful Interruption (Floor Transfer)"
  | "Competitive Overlap / Backchannel"
  | "Brief Overlap";

export interface SpeakerSegment {
  speaker: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  speaker: string | null;
  start: number;
  end: number;
  text: string;
  emotion?: Emotion | null;
  emotion_confidence?: number | null;
}

export interface LanguageGuess {
  code: string;
  probability: number;
}

export interface Transcript {
  segments: TranscriptSegment[];
  language: string | null;
  /** Whisper's confidence; null when the user chose the language. */
  language_probability: number | null;
  language_source: "detected" | "selected";
  language_alternatives: LanguageGuess[];
  model: string;
  word_count: number;
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

export type Emotion = "joy" | "surprise" | "neutral" | "sadness" | "fear" | "anger";

export interface SpeakerProfile {
  speaker: string;
  display_name: string;
  detected_name: string | null;
  name_evidence: string | null;
  talk_time: number;
  talk_share: number;
  turns: number;
  words: number;
  words_per_minute: number;
}

export interface EmotionScore {
  emotion: Emotion;
  score: number;
}

export interface SpeakerEmotionSummary {
  speaker: string;
  dominant: Emotion;
  distribution: EmotionScore[];
  line_counts: Partial<Record<Emotion, number>>;
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
  transcript: Transcript | null;
  speaker_profiles: SpeakerProfile[];
  emotions: SpeakerEmotionSummary[] | null;
  /** "combined" = voice + words, "audio" = tone of voice (wav2vec2), "text" = the words (RoBERTa). */
  emotion_source: "combined" | "audio" | "text" | null;
  /** Seconds spent per pipeline stage, plus "total". */
  timings: Record<string, number>;
}

export type StreamEvent =
  | { stage: "transcribing" }
  | { stage: "transcript"; transcript: Transcript }
  | { stage: "analyzing" }
  | { stage: "report"; report: AnalysisReport }
  | { stage: "error"; detail: string };

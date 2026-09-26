"""Conversation timing analysis: response latency, speech overlap, and interruption detection."""

from __future__ import annotations

import statistics
from typing import List

from app.core.config import settings
from app.models.schema import (
    AnalysisReport,
    InterruptionClassification,
    InterruptionEvent,
    LatencyEvent,
    LatencyStats,
    OverlapEvent,
    SpeakerSegment,
)


def _sorted_by_start(segments: List[SpeakerSegment]) -> List[SpeakerSegment]:
    return sorted(segments, key=lambda s: (s.start, s.end))


def calculate_consecutive_latency(segments: List[SpeakerSegment]) -> List[LatencyEvent]:
    """Detect response-latency gaps between consecutive turns taken by different speakers.

    For each pair of consecutive segments (ordered by start time) where the speaker
    changes, latency is the silence between the previous speaker finishing and the
    next speaker starting: `next_start - previous_end`. Only positive gaps (i.e. no
    overlap) count as latency events.
    """
    ordered = _sorted_by_start(segments)
    latencies: List[LatencyEvent] = []

    for previous, current in zip(ordered, ordered[1:]):
        if previous.speaker == current.speaker:
            continue

        latency_seconds = current.start - previous.end
        if latency_seconds > 0:
            latencies.append(
                LatencyEvent(
                    previous_speaker=previous.speaker,
                    next_speaker=current.speaker,
                    previous_end=previous.end,
                    next_start=current.start,
                    latency_seconds=round(latency_seconds, 6),
                )
            )

    return latencies


def compute_latency_stats(latencies: List[LatencyEvent]) -> LatencyStats:
    """Aggregate average / median / min / max latency across all detected events."""
    if not latencies:
        return LatencyStats()

    values = [event.latency_seconds for event in latencies]
    return LatencyStats(
        average=round(statistics.mean(values), 6),
        median=round(statistics.median(values), 6),
        minimum=round(min(values), 6),
        maximum=round(max(values), 6),
        total_turns_analyzed=len(values),
    )


def calculate_overlaps(segments: List[SpeakerSegment]) -> List[OverlapEvent]:
    """Detect all periods where two segments from different speakers overlap in time.

    Compares every pair of segments (not just consecutive ones), since a short
    backchannel from one speaker can occur in the middle of a much longer turn
    from another.
    """
    ordered = _sorted_by_start(segments)
    overlaps: List[OverlapEvent] = []

    for i, s1 in enumerate(ordered):
        for s2 in ordered[i + 1 :]:
            # Segments are sorted by start time; once s2 starts after s1 ends,
            # no later segment can overlap s1 either.
            if s2.start >= s1.end:
                break

            if s1.speaker == s2.speaker:
                continue

            overlap_start = max(s1.start, s2.start)
            overlap_end = min(s1.end, s2.end)
            duration = overlap_end - overlap_start

            if duration > 0:
                overlaps.append(
                    OverlapEvent(
                        speaker_a=s1.speaker,
                        speaker_b=s2.speaker,
                        start=round(overlap_start, 6),
                        end=round(overlap_end, 6),
                        duration=duration,
                    )
                )

    return overlaps


def detect_interruptions(
    segments: List[SpeakerSegment],
    floor_transfer_threshold: float | None = None,
) -> List[InterruptionEvent]:
    """Classify each speaker overlap as a floor-transfer interruption, a competitive
    overlap / backchannel, or a brief overlap, using the heuristic:

    - The speaker who started talking second during the overlap is the "interrupter";
      the one already speaking is the "interrupted" party.
    - If the interrupted speaker stops within `floor_transfer_threshold` seconds of
      the interrupter starting, AND the interrupter keeps speaking past that point,
      the interrupted speaker lost the floor -> "Successful Interruption (Floor Transfer)".
    - If the interrupted speaker keeps speaking for the entire duration of the
      interrupter's overlapping turn, the interrupter did not take the floor ->
      "Competitive Overlap / Backchannel".
    - Anything else (partial yield that doesn't meet the threshold) is logged as a
      "Brief Overlap".
    """
    threshold = (
        floor_transfer_threshold
        if floor_transfer_threshold is not None
        else settings.floor_transfer_threshold_seconds
    )

    ordered = _sorted_by_start(segments)
    interruptions: List[InterruptionEvent] = []

    for i, first in enumerate(ordered):
        for second in ordered[i + 1 :]:
            if second.start >= first.end:
                break

            if first.speaker == second.speaker:
                continue

            overlap_start = max(first.start, second.start)
            overlap_end = min(first.end, second.end)
            overlap_duration = overlap_end - overlap_start
            if overlap_duration <= 0:
                continue

            # `first` was already speaking (earlier start) when `second` began.
            interrupted, interrupter = first, second
            time_to_yield = interrupted.end - interrupter.start

            classification: InterruptionClassification
            if time_to_yield <= threshold and interrupter.end > interrupted.end:
                classification = "Successful Interruption (Floor Transfer)"
            elif interrupted.end >= interrupter.end:
                classification = "Competitive Overlap / Backchannel"
            else:
                classification = "Brief Overlap"

            interruptions.append(
                InterruptionEvent(
                    interrupter=interrupter.speaker,
                    interrupted=interrupted.speaker,
                    overlap_start=round(overlap_start, 6),
                    overlap_end=round(overlap_end, 6),
                    overlap_duration=round(overlap_duration, 6),
                    time_to_yield=round(time_to_yield, 6),
                    classification=classification,
                    timestamp=round(overlap_start, 6),
                )
            )

    return interruptions


def generate_report(
    segments: List[SpeakerSegment],
    filename: str,
    diarization_source: str = "mock",
) -> AnalysisReport:
    """Run the full analysis pipeline over a set of speaker segments and assemble
    the structured report returned by the API."""
    ordered = _sorted_by_start(segments)

    total_duration = max((s.end for s in ordered), default=0.0)
    speakers = sorted({s.speaker for s in ordered})

    latencies = calculate_consecutive_latency(ordered)
    latency_stats = compute_latency_stats(latencies)

    overlaps = calculate_overlaps(ordered)
    interruptions = detect_interruptions(ordered)

    successful_count = sum(
        1 for e in interruptions if e.classification == "Successful Interruption (Floor Transfer)"
    )
    backchannel_count = sum(
        1 for e in interruptions if e.classification == "Competitive Overlap / Backchannel"
    )

    return AnalysisReport(
        filename=filename,
        total_duration=round(total_duration, 6),
        speakers=speakers,
        speaker_count=len(speakers),
        segments=ordered,
        latencies=latencies,
        latency_stats=latency_stats,
        overlaps=overlaps,
        overlap_count=len(overlaps),
        interruptions=interruptions,
        interruption_count=len(interruptions),
        successful_interruption_count=successful_count,
        backchannel_count=backchannel_count,
        diarization_source=diarization_source,  # type: ignore[arg-type]
    )

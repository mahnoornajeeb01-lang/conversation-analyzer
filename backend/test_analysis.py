from app.models.schema import SpeakerSegment
from app.services.analysis import calculate_consecutive_latency, calculate_overlaps

mock_segments = [
    SpeakerSegment(speaker="Speaker A", start=0.5, end=4.2),
    SpeakerSegment(speaker="Speaker B", start=4.9, end=8.3),   # Latency = 0.7s
    SpeakerSegment(speaker="Speaker A", start=8.1, end=12.5),  # Overlap = 0.2s (8.1 to 8.3)
]

latencies = calculate_consecutive_latency(mock_segments)
overlaps = calculate_overlaps(mock_segments)

print("--- ANALYSIS RESULTS ---")
print("Latencies detected:", [l.model_dump() for l in latencies])
print("Overlaps detected:", [o.model_dump() for o in overlaps])
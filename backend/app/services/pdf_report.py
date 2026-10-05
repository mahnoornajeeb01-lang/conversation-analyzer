"""Render an AnalysisReport as a PDF (reportlab): summary, speakers, timeline,
response latency, interruptions and the transcript.

Text uses a system TrueType font when one is available, and right-to-left file names
are reshaped/reordered so Urdu and Arabic read correctly.
"""

from __future__ import annotations

import io
import os
import re
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    CondPageBreak,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from xml.sax.saxutils import escape

from app.core.config import settings
from app.models.schema import AnalysisReport

# ---------------------------------------------------------------------------- styling

INK = colors.HexColor("#0f172a")
SECONDARY = colors.HexColor("#475569")
MUTED = colors.HexColor("#94a3b8")
HAIRLINE = colors.HexColor("#e2e8f0")
SOFT = colors.HexColor("#f8fafc")
ACCENT = colors.HexColor("#4f46e5")

# Same validated categorical palette as the dashboard (light mode).
SPEAKER_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
CLASS_SHORT = {
    "Successful Interruption (Floor Transfer)": "Floor transfer",
    "Competitive Overlap / Backchannel": "Backchannel",
    "Brief Overlap": "Brief overlap",
}
_FONT_CANDIDATES: List[Tuple[str, Optional[str]]] = [
    (r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
]
_fonts: Optional[Tuple[str, str]] = None

DIARIZATION_NAMES = {
    "pyannote": "pyannote/speaker-diarization-3.1",
    "pyannoteai": "pyannoteAI (hosted)",
}


def _register_fonts() -> Tuple[str, str]:
    global _fonts
    if _fonts:
        return _fonts
    candidates = list(_FONT_CANDIDATES)
    if settings.pdf_font_path:
        candidates.insert(0, (settings.pdf_font_path, None))
    for regular, bold in candidates:
        if not os.path.exists(regular):
            continue
        try:
            pdfmetrics.registerFont(TTFont("ReportSans", regular))
            bold_ok = bool(bold and os.path.exists(bold))
            pdfmetrics.registerFont(TTFont("ReportSans-Bold", bold if bold_ok else regular))
            _fonts = ("ReportSans", "ReportSans-Bold")
            return _fonts
        except Exception:
            continue
    _fonts = ("Helvetica", "Helvetica-Bold")
    return _fonts


_RTL = re.compile(r"[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]")


def _shape(text: str) -> str:
    """Join Arabic-script letters and put right-to-left runs in visual order."""
    if not _RTL.search(text):
        return text
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display

        return get_display(arabic_reshaper.reshape(text))
    except Exception:
        return text


def _clock(seconds: float) -> str:
    return f"{int(seconds // 60)}:{int(seconds % 60):02d}"


def _duration(seconds: float) -> str:
    return f"{int(seconds // 60)}m {round(seconds % 60):02d}s"


# ---------------------------------------------------------------------------- builder


class _Builder:
    def __init__(self, report: AnalysisReport) -> None:
        self.r = report
        self.font, self.bold = _register_fonts()
        self.colors: Dict[str, colors.Color] = {
            s: colors.HexColor(SPEAKER_COLORS[i % len(SPEAKER_COLORS)]) for i, s in enumerate(report.speakers)
        }
        base = dict(fontName=self.font, textColor=INK, alignment=TA_LEFT)
        self.s_title = ParagraphStyle("title", fontName=self.bold, fontSize=22, leading=27, textColor=INK)
        self.s_eyebrow = ParagraphStyle("eyebrow", fontName=self.bold, fontSize=8, leading=11, textColor=ACCENT)
        self.s_h2 = ParagraphStyle("h2", fontName=self.bold, fontSize=14, leading=18, textColor=INK, spaceBefore=6, spaceAfter=2)
        self.s_lead = ParagraphStyle("lead", fontSize=9, leading=13, textColor=SECONDARY, **{k: v for k, v in base.items() if k != "textColor"})
        self.s_body = ParagraphStyle("body", fontSize=9, leading=12.5, **base)
        self.s_small = ParagraphStyle("small", fontSize=7.5, leading=10, textColor=SECONDARY, **{k: v for k, v in base.items() if k != "textColor"})
        self.s_cell = ParagraphStyle("cell", fontSize=8, leading=10.5, **base)
        self.s_cell_b = ParagraphStyle("cellb", parent=self.s_cell, fontName=self.bold)
        self.s_kpi_v = ParagraphStyle("kpiv", fontName=self.bold, fontSize=15, leading=18, textColor=INK)
        self.s_cell_rtl = ParagraphStyle("cellrtl", parent=self.s_cell, alignment=TA_RIGHT)
        self.s_kpi_l = ParagraphStyle("kpil", fontName=self.font, fontSize=7, leading=9, textColor=SECONDARY)

    def name(self, label: Optional[str]) -> str:
        return label or "Unknown"

    def p(self, text: str, style: ParagraphStyle) -> Paragraph:
        return Paragraph(escape(_shape(text)), style)

    def rtl_paragraph(self, text: str, width: float) -> Paragraph:
        """Right-to-left text wrapped in logical order first, then each line shaped, so
        multi-line Urdu/Arabic reads top-to-bottom (reportlab wraps left-to-right)."""
        style = self.s_cell_rtl
        lines: List[List[str]] = [[]]
        for word in text.split():
            trial = " ".join(lines[-1] + [word])
            if lines[-1] and pdfmetrics.stringWidth(_shape(trial), style.fontName, style.fontSize) > width:
                lines.append([word])
            else:
                lines[-1].append(word)
        return Paragraph("<br/>".join(escape(_shape(" ".join(line))) for line in lines), style)

    def section(self, eyebrow: str, title: str, lead: str) -> List:
        return [
            CondPageBreak(60 * mm),
            Spacer(1, 4 * mm),
            self.p(eyebrow.upper(), self.s_eyebrow),
            self.p(title, self.s_h2),
            self.p(lead, self.s_lead),
            Spacer(1, 3 * mm),
        ]

    def table(self, rows: List[List], widths: List[Optional[float]], header: bool = True, zebra: bool = True) -> Table:
        # A None width takes whatever is left, so every table spans the full text width.
        fixed = sum(w for w in widths if w is not None)
        flexible = widths.count(None)
        widths = [w if w is not None else (self.content_w - fixed) / flexible for w in widths]
        t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
        style = [
            ("FONTNAME", (0, 0), (-1, -1), self.font),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (0, 0), (-1, -1), INK),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, HAIRLINE),
        ]
        if header:
            style += [
                ("FONTNAME", (0, 0), (-1, 0), self.bold),
                ("FONTSIZE", (0, 0), (-1, 0), 7),
                ("TEXTCOLOR", (0, 0), (-1, 0), SECONDARY),
                ("LINEBELOW", (0, 0), (-1, 0), 0.8, MUTED),
            ]
        if zebra:
            for i in range(1 if header else 0, len(rows)):
                if i % 2 == 0:
                    style.append(("BACKGROUND", (0, i), (-1, i), SOFT))
        t.setStyle(TableStyle(style))
        return t

    # ------------------------------------------------------------------ drawings

    def dot(self, color: colors.Color, size: float = 6) -> Drawing:
        d = Drawing(size, size)
        d.add(Rect(0, 0, size, size, rx=size / 2, ry=size / 2, fillColor=color, strokeColor=None))
        return d

    def timeline(self, width: float) -> Drawing:
        r = self.r
        label_w, lane_h, gap = 70, 14, 8
        height = len(r.speakers) * (lane_h + gap) + 18
        d = Drawing(width, height)
        plot_w = width - label_w
        total = max(r.total_duration, 0.001)
        for i, sp in enumerate(r.speakers):
            y = height - (i + 1) * (lane_h + gap)
            d.add(String(0, y + 4, self.name(sp)[:14], fontName=self.font, fontSize=7.5, fillColor=INK))
            d.add(Rect(label_w, y, plot_w, lane_h, fillColor=SOFT, strokeColor=HAIRLINE, strokeWidth=0.4))
            for o in r.overlaps:
                d.add(Rect(label_w + o.start / total * plot_w, y, max(o.duration / total * plot_w, 0.6), lane_h,
                           fillColor=colors.Color(0.98, 0.44, 0.52, alpha=0.18), strokeColor=None))
            for seg in r.segments:
                if seg.speaker != sp:
                    continue
                x = label_w + seg.start / total * plot_w
                w = max((seg.end - seg.start) / total * plot_w - 0.8, 0.8)
                d.add(Rect(x, y + 2, w, lane_h - 4, rx=1.5, ry=1.5, fillColor=self.colors[sp], strokeColor=None))
        steps = 6
        for k in range(steps + 1):
            t = total * k / steps
            x = label_w + plot_w * k / steps
            d.add(String(x, 2, _clock(t), fontName=self.font, fontSize=6.5, fillColor=MUTED, textAnchor="middle"))
        return d

    def latency_chart(self, width: float, height: float = 120) -> Drawing:
        lat = self.r.latencies
        d = Drawing(width, height)
        if not lat:
            return d
        pad_l, pad_b, pad_t = 28, 14, 8
        plot_w, plot_h = width - pad_l - 4, height - pad_b - pad_t
        top = max(max(l.latency_seconds for l in lat), self.r.latency_stats.average, 0.1)
        step = next(s for s in (0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 30, 60) if top / s <= 5)
        ymax = step * (int(top / step) + 1)
        for k in range(int(ymax / step) + 1):
            v = k * step
            y = pad_b + v / ymax * plot_h
            d.add(Line(pad_l, y, width - 4, y, strokeColor=HAIRLINE if k else MUTED, strokeWidth=0.5))
            d.add(String(pad_l - 4, y - 2.5, f"{v:g}s", fontName=self.font, fontSize=6.5, fillColor=MUTED, textAnchor="end"))
        band = plot_w / len(lat)
        bar_w = min(14, band * 0.6)
        for i, l in enumerate(lat):
            h = max(l.latency_seconds / ymax * plot_h, 0.8)
            x = pad_l + band * i + (band - bar_w) / 2
            d.add(Rect(x, pad_b, bar_w, h, fillColor=self.colors.get(l.next_speaker, MUTED), strokeColor=None))
            if len(lat) <= 30 or i % max(1, len(lat) // 15) == 0:
                d.add(String(x + bar_w / 2, 3, f"#{i + 1}", fontName=self.font, fontSize=6, fillColor=MUTED, textAnchor="middle"))
        avg = self.r.latency_stats.average
        y = pad_b + avg / ymax * plot_h
        d.add(Line(pad_l, y, width - 4, y, strokeColor=INK, strokeWidth=0.6, strokeDashArray=None))
        d.add(String(pad_l + 3, y + 2.5, f"average {avg:.2f}s", fontName=self.bold, fontSize=6.5, fillColor=INK))
        return d

    # ------------------------------------------------------------------ sections

    def build(self) -> bytes:
        r = self.r
        buf = io.BytesIO()
        page_w, _ = A4
        margin = 16 * mm
        content_w = self.content_w = page_w - 2 * margin
        doc = SimpleDocTemplate(
            buf, pagesize=A4, leftMargin=margin, rightMargin=margin, topMargin=18 * mm, bottomMargin=16 * mm,
            title=f"Conversation analysis – {r.filename}", author="Conversation Analyzer",
        )
        story: List = []
        story += [
            self.p("CONVERSATION ANALYSIS REPORT", self.s_eyebrow),
            Spacer(1, 1.5 * mm),
            self.p(r.filename, self.s_title),
            Spacer(1, 1.5 * mm),
            self.p(
                f"Generated {datetime.now():%d %B %Y, %H:%M} · Duration {_duration(r.total_duration)} · "
                f"{r.speaker_count} speakers",
                self.s_lead,
            ),
            Spacer(1, 5 * mm),
        ]

        # KPI grid
        kpis = [
            ("Duration", _duration(r.total_duration)),
            ("Speakers", str(r.speaker_count)),
            ("Avg. response", f"{r.latency_stats.average:.2f}s"),
            ("Hand-offs", str(r.latency_stats.total_turns_analyzed)),
            ("Interruptions", str(r.interruption_count)),
            ("Overlaps", str(r.overlap_count)),
        ]
        cells = [[[self.p(v, self.s_kpi_v), self.p(l.upper(), self.s_kpi_l)] for l, v in kpis[i:i + 3]] for i in (0, 3)]
        kpi = Table(cells, colWidths=[content_w / 3] * 3, rowHeights=[16 * mm] * 2)
        kpi.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, HAIRLINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, HAIRLINE),
            ("BACKGROUND", (0, 0), (-1, -1), SOFT),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(kpi)

        # Speakers
        story += self.section("Speakers", "Who took part", "Speakers are numbered by order of appearance.")
        rows = [["", "Speaker", "Talk share", "Talk time", "Turns"]]
        for p in r.speaker_profiles:
            rows.append([self.dot(self.colors[p.speaker]), self.p(p.speaker, self.s_cell_b),
                         f"{round(p.talk_share * 100)}%", _duration(p.talk_time), p.turns])
        story.append(self.table(rows, [8 * mm, 60 * mm, 30 * mm, 30 * mm, None]))

        story += self.section("Timeline", "Conversation timeline",
                              "Who spoke when. Shaded bands mark moments where both people spoke at once.")
        story.append(self.timeline(content_w))

        # Latency
        s = r.latency_stats
        story += self.section("Layer 01", "Response latency",
                              "The silence between one person finishing and the other starting. Around 0.2–1 s feels natural.")
        story.append(self.table([["Average", "Median", "Fastest", "Slowest", "Hand-offs"],
                                 [f"{s.average:.2f}s", f"{s.median:.2f}s", f"{s.minimum:.2f}s", f"{s.maximum:.2f}s", s.total_turns_analyzed]],
                                [content_w / 5] * 5, zebra=False))
        if r.latencies:
            story += [Spacer(1, 3 * mm), self.p("Latency per turn (coloured by who replied)", self.s_small),
                      Spacer(1, 1 * mm), self.latency_chart(content_w)]
            per = []
            for sp in r.speakers:
                replies = [l.latency_seconds for l in r.latencies if l.next_speaker == sp]
                if replies:
                    per.append([self.dot(self.colors[sp]), self.name(sp), len(replies), f"{sum(replies) / len(replies):.2f}s"])
            story += [Spacer(1, 3 * mm),
                      KeepTogether(self.table([["", "Speaker", "Replies", "Average reply time"]] + per, [8 * mm, 60 * mm, 25 * mm, None]))]

        # Interruptions
        story += self.section("Layer 02", "Interruptions",
                              "Moments of overlapping speech, classified by what happened next.")
        counts = {k: 0 for k in CLASS_SHORT}
        for e in r.interruptions:
            counts[e.classification] = counts.get(e.classification, 0) + 1
        overlap_s = sum(o.duration for o in r.overlaps)
        story.append(self.table(
            [["Interruptions", "Floor transfers", "Backchannels", "Brief overlaps", "Overlapping speech"],
             [r.interruption_count, counts["Successful Interruption (Floor Transfer)"], counts["Competitive Overlap / Backchannel"],
              counts["Brief Overlap"], f"{overlap_s:.1f}s"]],
            [content_w / 5] * 5, zebra=False))
        if r.interruptions:
            rows = [["Time", "Interrupter", "Interrupted", "Type", "Overlap"]]
            for e in r.interruptions:
                rows.append([_clock(e.timestamp), self.name(e.interrupter), self.name(e.interrupted),
                             CLASS_SHORT.get(e.classification, e.classification), f"{e.overlap_duration:.2f}s"])
            story += [Spacer(1, 3 * mm), self.table(rows, [18 * mm, 45 * mm, 45 * mm, 35 * mm, None])]
        else:
            story.append(self.p("No overlapping speech was detected.", self.s_small))

        # Transcript
        tr = r.transcript
        if tr is not None or r.transcript_error:
            if tr and len(tr.languages) > 1:
                mix = ", ".join(f"{l.name} {round(l.share * 100)}%" for l in tr.languages)
                lead = f"Mixed languages: {mix} · {tr.word_count} words."
            elif tr and tr.language_probability is not None:
                lead = f"Detected language: {tr.language_name} ({round(tr.language_probability * 100)}% confidence) · {tr.word_count} words."
            elif tr:
                lead = f"{tr.word_count} words."
            else:
                lead = "What each speaker said."
            story += self.section("Layer 03", "Transcript", lead)
            if tr and tr.segments:
                text_w = content_w - 16 * mm - 28 * mm
                rows = [["Time", "Speaker", "Text"]]
                for seg in tr.segments:
                    text = (
                        self.rtl_paragraph(seg.text, text_w - 12)
                        if tr.right_to_left
                        else self.p(seg.text, self.s_cell)
                    )
                    rows.append([_clock(seg.start), self.p(self.name(seg.speaker), self.s_cell_b), text])
                table = self.table(rows, [16 * mm, 28 * mm, None])
                table.setStyle(TableStyle([("VALIGN", (0, 1), (-1, -1), "TOP")]))
                story.append(table)
            else:
                story.append(self.p(r.transcript_error or "No words were recognized in this recording.", self.s_small))

        # Method notes
        notes = [
            f"Speaker diarization: {DIARIZATION_NAMES.get(r.diarization_source, 'simulated (illustrative only)')}.",
            "Latency is measured only for clean hand-offs between different speakers; overlapping turns are counted as interruptions instead.",
        ]
        if r.transcript:
            engine = "pyannoteAI" if r.diarization_source == "pyannoteai" else "faster-whisper"
            notes.append(f"Transcript: {r.transcript.model} ({engine}); each word is attributed to the speaker talking at that moment.")
        if r.timings.get("total"):
            notes.append(f"Processed in {r.timings['total']:.1f}s.")
        story += [Spacer(1, 6 * mm), KeepTogether([self.p("METHOD NOTES", self.s_eyebrow), Spacer(1, 1 * mm)]
                                                  + [self.p("• " + n, self.s_small) for n in notes])]

        def decorate(canvas, doc_) -> None:
            canvas.saveState()
            canvas.setFillColor(ACCENT)
            canvas.rect(0, A4[1] - 3, A4[0], 3, stroke=0, fill=1)
            canvas.setFont(self.font, 7)
            canvas.setFillColor(MUTED)
            canvas.drawString(margin, 9 * mm, _shape(f"Conversation Analyzer · {r.filename}"))
            canvas.drawRightString(A4[0] - margin, 9 * mm, f"Page {doc_.page}")
            canvas.restoreState()

        doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
        return buf.getvalue()


def build_pdf(report: AnalysisReport) -> bytes:
    return _Builder(report).build()

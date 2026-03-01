#!/usr/bin/env python3
"""
Noody Skincare — Monthly Business Review PDF Generator
======================================================
Reads monthly data JSON (from monthly-report.js) and generates a professional PDF report.

Usage:
  python3 generate-monthly-pdf.py --input monthly-data.json --output report.pdf
  python3 generate-monthly-pdf.py --demo  (generates with sample data)

Called automatically by monthly-report.js when --pdf flag is used.
"""

import json
import sys
import os
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics import renderPDF

# ─── BRAND COLOURS ───────────────────────────────────────────
NOODY_SAGE = HexColor("#8BAB8B")
NOODY_DARK = HexColor("#2D4A2D")
NOODY_CREAM = HexColor("#F5F0E8")
NOODY_TAN = HexColor("#D4C5A9")
ACCENT_GREEN = HexColor("#5A8F5A")
ACCENT_RED = HexColor("#C0392B")
ACCENT_AMBER = HexColor("#E67E22")
LIGHT_GREY = HexColor("#F2F2F2")
MID_GREY = HexColor("#888888")
DARK_GREY = HexColor("#333333")
WHITE = white
BLACK = black

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm

# ─── CUSTOM STYLES ───────────────────────────────────────────
def get_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        "ReportTitle", parent=styles["Title"],
        fontSize=28, leading=34, textColor=NOODY_DARK,
        fontName="Helvetica-Bold", spaceAfter=4 * mm,
    ))
    styles.add(ParagraphStyle(
        "ReportSubtitle", parent=styles["Normal"],
        fontSize=13, leading=17, textColor=MID_GREY,
        fontName="Helvetica", spaceAfter=8 * mm,
    ))
    styles.add(ParagraphStyle(
        "SectionHeader", parent=styles["Heading1"],
        fontSize=16, leading=20, textColor=NOODY_DARK,
        fontName="Helvetica-Bold", spaceBefore=8 * mm, spaceAfter=4 * mm,
        borderWidth=0, borderColor=NOODY_SAGE, borderPadding=0,
    ))
    styles.add(ParagraphStyle(
        "SubHeader", parent=styles["Heading2"],
        fontSize=12, leading=15, textColor=ACCENT_GREEN,
        fontName="Helvetica-Bold", spaceBefore=4 * mm, spaceAfter=2 * mm,
    ))
    styles.add(ParagraphStyle(
        "NBodyText", parent=styles["Normal"],
        fontSize=10, leading=14, textColor=DARK_GREY,
        fontName="Helvetica", spaceAfter=3 * mm,
    ))
    styles.add(ParagraphStyle(
        "SmallText", parent=styles["Normal"],
        fontSize=8, leading=10, textColor=MID_GREY,
        fontName="Helvetica",
    ))
    styles.add(ParagraphStyle(
        "KPIValue", parent=styles["Normal"],
        fontSize=22, leading=26, textColor=NOODY_DARK,
        fontName="Helvetica-Bold", alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        "KPILabel", parent=styles["Normal"],
        fontSize=8, leading=10, textColor=MID_GREY,
        fontName="Helvetica", alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        "KPIChange", parent=styles["Normal"],
        fontSize=9, leading=11, textColor=ACCENT_GREEN,
        fontName="Helvetica-Bold", alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        "GradeA", parent=styles["Normal"],
        fontSize=36, leading=40, textColor=ACCENT_GREEN,
        fontName="Helvetica-Bold", alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        "TableHeader", parent=styles["Normal"],
        fontSize=9, leading=11, textColor=WHITE,
        fontName="Helvetica-Bold", alignment=TA_LEFT,
    ))
    styles.add(ParagraphStyle(
        "TableCell", parent=styles["Normal"],
        fontSize=9, leading=11, textColor=DARK_GREY,
        fontName="Helvetica",
    ))
    styles.add(ParagraphStyle(
        "TableCellRight", parent=styles["Normal"],
        fontSize=9, leading=11, textColor=DARK_GREY,
        fontName="Helvetica", alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        "WinText", parent=styles["Normal"],
        fontSize=10, leading=13, textColor=ACCENT_GREEN,
        fontName="Helvetica-Bold",
    ))
    styles.add(ParagraphStyle(
        "ConcernText", parent=styles["Normal"],
        fontSize=10, leading=13, textColor=ACCENT_RED,
        fontName="Helvetica-Bold",
    ))
    return styles


# ─── HELPERS ─────────────────────────────────────────────────
def fmt_money(val):
    if val is None:
        return "N/A"
    return f"${val:,.0f}"

def fmt_pct(val):
    if val is None:
        return "N/A"
    return f"{val:+.0f}%" if val != 0 else "0%"

def pct_color(val):
    if val is None:
        return MID_GREY
    return ACCENT_GREEN if val > 0 else ACCENT_RED if val < 0 else MID_GREY

def grade_color(grade):
    if not grade:
        return MID_GREY
    g = grade.upper()[0]
    return {
        "A": ACCENT_GREEN, "B": HexColor("#3498DB"),
        "C": ACCENT_AMBER, "D": ACCENT_RED, "F": ACCENT_RED,
    }.get(g, MID_GREY)


# ─── PAGE TEMPLATE ───────────────────────────────────────────
def header_footer(canvas_obj, doc):
    canvas_obj.saveState()

    # Header line
    canvas_obj.setStrokeColor(NOODY_SAGE)
    canvas_obj.setLineWidth(2)
    canvas_obj.line(MARGIN, PAGE_H - 15 * mm, PAGE_W - MARGIN, PAGE_H - 15 * mm)

    # Header text
    canvas_obj.setFont("Helvetica", 7)
    canvas_obj.setFillColor(MID_GREY)
    canvas_obj.drawString(MARGIN, PAGE_H - 12 * mm, "NOODY SKINCARE")
    canvas_obj.drawRightString(PAGE_W - MARGIN, PAGE_H - 12 * mm, "MONTHLY BUSINESS REVIEW — CONFIDENTIAL")

    # Footer
    canvas_obj.setStrokeColor(LIGHT_GREY)
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(MARGIN, 12 * mm, PAGE_W - MARGIN, 12 * mm)
    canvas_obj.setFont("Helvetica", 7)
    canvas_obj.setFillColor(MID_GREY)
    canvas_obj.drawString(MARGIN, 8 * mm, f"Generated {datetime.now().strftime('%d %B %Y, %I:%M %p NZST')}")
    canvas_obj.drawRightString(PAGE_W - MARGIN, 8 * mm, f"Page {doc.page}")

    canvas_obj.restoreState()


# ─── KPI CARD ────────────────────────────────────────────────
def kpi_card(value, label, change=None, styles=None):
    """Create a KPI card as a table cell block."""
    elements = []
    elements.append(Paragraph(str(value), styles["KPIValue"]))
    elements.append(Paragraph(label, styles["KPILabel"]))
    if change is not None:
        change_style = ParagraphStyle(
            "change_tmp", parent=styles["KPIChange"],
            textColor=pct_color(change),
        )
        elements.append(Paragraph(f"{'▲' if change > 0 else '▼' if change < 0 else '—'} {fmt_pct(change)} vs YTD avg", change_style))
    return elements


def styled_table(headers, rows, col_widths=None):
    """Create a consistently styled data table."""
    style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NOODY_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), DARK_GREY),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#DDDDDD")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT_GREY]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ])

    data = [headers] + rows
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(style)
    return t


def section_divider():
    return HRFlowable(
        width="100%", thickness=1, color=NOODY_SAGE,
        spaceBefore=4 * mm, spaceAfter=4 * mm,
    )


# ─── BAR CHART ───────────────────────────────────────────────
def create_bar_chart(data_pairs, title="", width=450, height=180):
    """Create a simple bar chart. data_pairs = [(label, value), ...]"""
    drawing = Drawing(width, height)

    chart = VerticalBarChart()
    chart.x = 50
    chart.y = 30
    chart.width = width - 80
    chart.height = height - 60
    chart.data = [[v for _, v in data_pairs]]
    chart.categoryAxis.categoryNames = [l for l, _ in data_pairs]
    chart.categoryAxis.labels.fontSize = 7
    chart.categoryAxis.labels.angle = 0
    chart.valueAxis.valueMin = 0
    chart.valueAxis.labels.fontSize = 7
    chart.bars[0].fillColor = NOODY_SAGE
    chart.bars[0].strokeColor = NOODY_DARK
    chart.bars[0].strokeWidth = 0.5
    chart.barWidth = max(10, min(30, (width - 100) / max(len(data_pairs), 1) - 5))

    drawing.add(chart)

    if title:
        drawing.add(String(width / 2, height - 12, title,
                           fontSize=9, fontName="Helvetica-Bold",
                           fillColor=NOODY_DARK, textAnchor="middle"))

    return drawing


# ─── BUILD THE REPORT ────────────────────────────────────────
def build_report(data, analysis, output_path):
    styles = get_styles()
    story = []

    shopify = next((d for d in data if d.get("source") == "shopify" and not d.get("error")), None)
    meta = next((d for d in data if d.get("source") == "meta_ads" and not d.get("error")), None)
    xero = next((d for d in data if d.get("source") == "xero" and not d.get("error")), None)
    social = next((d for d in data if d.get("source") == "social" and not d.get("error")), None)
    klaviyo = next((d for d in data if d.get("source") == "klaviyo" and not d.get("error")), None)

    period = shopify.get("period", "Monthly") if shopify else analysis.get("reportTitle", "Monthly Report")

    # ══════════════════════════════════════════════════════════
    # PAGE 1: COVER / EXECUTIVE SUMMARY
    # ══════════════════════════════════════════════════════════
    story.append(Spacer(1, 20 * mm))
    story.append(Paragraph("Noody Skincare", styles["ReportTitle"]))
    story.append(Paragraph(f"Monthly Business Review — {period}", styles["ReportSubtitle"]))
    story.append(section_divider())

    # Overall grade
    grade = analysis.get("overallGrade", "N/A")
    grade_rationale = analysis.get("gradeRationale", "")

    grade_style = ParagraphStyle("grade_dyn", parent=styles["GradeA"], textColor=grade_color(grade))
    grade_table = Table(
        [[Paragraph(grade, grade_style), Paragraph(f"<b>Overall Grade</b><br/>{grade_rationale}", styles["NBodyText"])]],
        colWidths=[30 * mm, 130 * mm],
    )
    grade_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(grade_table)
    story.append(Spacer(1, 6 * mm))

    # Executive Summary
    story.append(Paragraph("Executive Summary", styles["SectionHeader"]))
    story.append(Paragraph(analysis.get("executiveSummary", "No data available."), styles["NBodyText"]))
    story.append(Spacer(1, 4 * mm))

    # KPI Dashboard
    story.append(Paragraph("Key Performance Indicators", styles["SubHeader"]))

    s_month = shopify.get("month", {}) if shopify else {}
    s_comp = shopify.get("comparison", {}) if shopify else {}
    x_month = xero.get("month", {}) if xero else {}
    m_month = meta.get("month", {}) if meta else {}

    kpi_data = [
        [
            kpi_card(fmt_money(s_month.get("revenue")), "REVENUE", s_comp.get("vsYtdAvgRevPct"), styles),
            kpi_card(str(s_month.get("orders", "—")), "ORDERS", s_comp.get("vsPreMonthOrdersPct"), styles),
            kpi_card(fmt_money(s_month.get("aov")), "AOV", s_comp.get("vsYtdAvgAOVPct"), styles),
            kpi_card(f"{x_month.get('netMarginPct', '?')}%", "NET MARGIN", None, styles),
        ]
    ]

    kpi_table = Table(kpi_data, colWidths=[40 * mm] * 4)
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GREY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("BOX", (0, 0), (-1, -1), 1, NOODY_SAGE),
        ("LINEBEFORE", (1, 0), (1, -1), 0.5, HexColor("#DDDDDD")),
        ("LINEBEFORE", (2, 0), (2, -1), 0.5, HexColor("#DDDDDD")),
        ("LINEBEFORE", (3, 0), (3, -1), 0.5, HexColor("#DDDDDD")),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 4 * mm))

    # Second row KPIs
    kpi_row2 = [
        [
            kpi_card(fmt_money(m_month.get("spend")), "AD SPEND", None, styles),
            kpi_card(f"{m_month.get('roas', '—')}x", "ROAS", None, styles),
            kpi_card(f"{s_month.get('repeatRate', '—')}%", "REPEAT RATE", None, styles),
            kpi_card(fmt_money(s_month.get("dailyAvgRevenue")), "DAILY AVG", None, styles),
        ]
    ]
    kpi_table2 = Table(kpi_row2, colWidths=[40 * mm] * 4)
    kpi_table2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GREY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("BOX", (0, 0), (-1, -1), 1, NOODY_SAGE),
        ("LINEBEFORE", (1, 0), (1, -1), 0.5, HexColor("#DDDDDD")),
        ("LINEBEFORE", (2, 0), (2, -1), 0.5, HexColor("#DDDDDD")),
        ("LINEBEFORE", (3, 0), (3, -1), 0.5, HexColor("#DDDDDD")),
    ]))
    story.append(kpi_table2)

    # ══════════════════════════════════════════════════════════
    # PAGE 2: REVENUE & DTC PERFORMANCE
    # ══════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(Paragraph("Revenue Performance", styles["SectionHeader"]))

    ra = analysis.get("revenueAnalysis", {})
    if ra.get("headline"):
        story.append(Paragraph(ra["headline"], styles["NBodyText"]))
    if ra.get("keyInsight"):
        story.append(Paragraph(f"<i>{ra['keyInsight']}</i>", styles["NBodyText"]))

    # Month vs YTD vs Prev Month comparison table
    story.append(Paragraph("Period Comparison", styles["SubHeader"]))
    s_prev = shopify.get("prevMonth", {}) if shopify else {}
    s_ytd = shopify.get("ytd", {}) if shopify else {}

    comp_rows = [
        ["Revenue", fmt_money(s_month.get("revenue")), fmt_money(s_prev.get("revenue")), fmt_pct(s_comp.get("vsPreMonthRevPct")), fmt_money(s_ytd.get("monthlyAvgRevenue")), fmt_pct(s_comp.get("vsYtdAvgRevPct"))],
        ["Orders", str(s_month.get("orders", "—")), str(s_prev.get("orders", "—")), fmt_pct(s_comp.get("vsPreMonthOrdersPct")), "—", "—"],
        ["AOV", fmt_money(s_month.get("aov")), fmt_money(s_prev.get("aov")), fmt_pct(s_comp.get("vsYtdAvgAOVPct")), fmt_money(s_ytd.get("aov")), "—"],
        ["Daily Avg", fmt_money(s_month.get("dailyAvgRevenue")), fmt_money(s_prev.get("dailyAvgRevenue")), "—", fmt_money(s_ytd.get("dailyAvgRevenue")), "—"],
        ["Customers", str(s_month.get("uniqueCustomers", "—")), "—", "—", "—", "—"],
        ["Repeat Rate", f"{s_month.get('repeatRate', '—')}%", "—", "—", "—", "—"],
    ]

    story.append(styled_table(
        ["Metric", "This Month", "Prev Month", "MoM Change", "YTD Monthly Avg", "vs YTD"],
        comp_rows,
        col_widths=[28 * mm, 26 * mm, 26 * mm, 22 * mm, 32 * mm, 22 * mm],
    ))
    story.append(Spacer(1, 4 * mm))

    # Weekly breakdown chart
    weekly = s_month.get("weeklyBreakdown", [])
    if weekly:
        story.append(Paragraph("Weekly Revenue Trend", styles["SubHeader"]))
        chart_data = [(f"Wk {w['week']}", w["revenue"]) for w in weekly]
        story.append(create_bar_chart(chart_data, width=420, height=150))
        story.append(Spacer(1, 4 * mm))

    # Top Products
    top_prods = s_month.get("topProducts", [])
    if top_prods:
        story.append(Paragraph("Top Products", styles["SubHeader"]))
        prod_rows = []
        for i, p in enumerate(top_prods[:10], 1):
            prod_rows.append([str(i), p["name"], str(p["qty"]), fmt_money(p["revenue"])])

        story.append(styled_table(
            ["#", "Product", "Units", "Revenue"],
            prod_rows,
            col_widths=[10 * mm, 80 * mm, 20 * mm, 30 * mm],
        ))
        story.append(Spacer(1, 4 * mm))

    # Discount analysis
    if s_month.get("totalDiscounts"):
        story.append(Paragraph("Discount Analysis", styles["SubHeader"]))
        story.append(Paragraph(
            f"Total discounts given: <b>{fmt_money(s_month['totalDiscounts'])}</b> — "
            f"<b>{s_month.get('discountedOrderPct', 0)}%</b> of orders used a discount code.",
            styles["NBodyText"],
        ))

    # ══════════════════════════════════════════════════════════
    # PAGE 3: META ADS
    # ══════════════════════════════════════════════════════════
    if meta:
        story.append(PageBreak())
        story.append(Paragraph("Meta Advertising Performance", styles["SectionHeader"]))

        m_prev = meta.get("prevMonth", {})
        m_ytd_avg = meta.get("ytdMonthlyAvg", {})
        m_comp = meta.get("comparison", {})

        meta_rows = [
            ["Spend", fmt_money(m_month.get("spend")), fmt_money(m_prev.get("spend")), fmt_pct(m_comp.get("vsPreMonthSpendPct")), fmt_money(m_ytd_avg.get("spend")), fmt_pct(m_comp.get("vsYtdAvgSpendPct"))],
            ["Revenue", fmt_money(m_month.get("purchaseValue")), fmt_money(m_prev.get("purchaseValue")), "—", "—", "—"],
            ["ROAS", f"{m_month.get('roas', '—')}x", f"{m_prev.get('roas', '—')}x", fmt_pct(m_comp.get("vsPreMonthROASPct")), f"{m_ytd_avg.get('roas', '—')}x", "—"],
            ["CPA", fmt_money(m_month.get("cpa")), fmt_money(m_prev.get("cpa")), "—", fmt_money(m_ytd_avg.get("cpa")), "—"],
            ["Purchases", str(m_month.get("purchases", "—")), str(m_prev.get("purchases", "—")), "—", "—", "—"],
            ["CTR", f"{m_month.get('ctr', '—')}%", f"{m_prev.get('ctr', '—')}%", "—", f"{m_ytd_avg.get('ctr', '—')}%", "—"],
            ["Reach", f"{m_month.get('reach', 0):,}", f"{m_prev.get('reach', 0):,}", "—", "—", "—"],
            ["Frequency", f"{m_month.get('frequency', '—')}x", f"{m_prev.get('frequency', '—')}x", "—", "—", "—"],
        ]

        story.append(styled_table(
            ["Metric", "This Month", "Prev Month", "MoM Change", "YTD Avg", "vs YTD"],
            meta_rows,
            col_widths=[24 * mm, 26 * mm, 26 * mm, 22 * mm, 24 * mm, 22 * mm],
        ))
        story.append(Spacer(1, 4 * mm))

        # Campaign breakdown
        campaigns = meta.get("campaigns", [])
        if campaigns:
            story.append(Paragraph("Campaign Breakdown", styles["SubHeader"]))
            camp_rows = []
            for c in campaigns[:8]:
                camp_rows.append([
                    c["name"][:35],
                    fmt_money(c.get("spend")),
                    fmt_money(c.get("purchaseValue")),
                    f"{c.get('roas', '—')}x",
                    str(c.get("purchases", 0)),
                    f"{c.get('ctr', '—')}%",
                ])

            story.append(styled_table(
                ["Campaign", "Spend", "Revenue", "ROAS", "Purchases", "CTR"],
                camp_rows,
                col_widths=[50 * mm, 22 * mm, 22 * mm, 18 * mm, 20 * mm, 18 * mm],
            ))

        # Efficiency note
        story.append(Spacer(1, 4 * mm))
        if m_month.get("spend") and s_month.get("revenue"):
            mer = round(m_month["spend"] / s_month["revenue"] * 100)
            story.append(Paragraph(
                f"<b>Marketing Efficiency Ratio (MER):</b> {mer}% — "
                f"For every $1 of Shopify revenue, {fmt_money(m_month['spend'] / s_month['revenue'] * 100 / 100)} was spent on Meta ads.",
                styles["NBodyText"],
            ))

    # ══════════════════════════════════════════════════════════
    # PAGE 4: FINANCIALS (XERO)
    # ══════════════════════════════════════════════════════════
    if xero:
        story.append(PageBreak())
        story.append(Paragraph("Financial Performance", styles["SectionHeader"]))

        x_prev = xero.get("prevMonth", {})
        x_ytd = xero.get("ytd", {})
        x_comp = xero.get("comparison", {})

        fin_rows = [
            ["Revenue", fmt_money(x_month.get("revenue")), fmt_money(x_prev.get("revenue")), fmt_pct(x_comp.get("vsPreMonthRevPct")), fmt_money(x_ytd.get("monthlyAvgRevenue")), fmt_pct(x_comp.get("vsYtdAvgRevPct"))],
            ["COGS", fmt_money(x_month.get("cogs")), fmt_money(x_prev.get("cogs")), "—", "—", "—"],
            ["Gross Profit", fmt_money(x_month.get("grossProfit")), fmt_money(x_prev.get("grossProfit")), "—", "—", "—"],
            ["Gross Margin", f"{x_month.get('grossMarginPct', '?')}%", f"{x_prev.get('grossMarginPct', '?')}%", "—", f"{x_ytd.get('grossMarginPct', '?')}%", "—"],
            ["Operating Expenses", fmt_money(x_month.get("operatingExpenses")), fmt_money(x_prev.get("operatingExpenses")), "—", "—", "—"],
            ["Net Profit", fmt_money(x_month.get("netProfit")), fmt_money(x_prev.get("netProfit")), fmt_pct(x_comp.get("vsPreMonthNetProfitPct")), fmt_money(x_ytd.get("monthlyAvgNetProfit")), "—"],
            ["Net Margin", f"{x_month.get('netMarginPct', '?')}%", f"{x_prev.get('netMarginPct', '?')}%", "—", f"{x_ytd.get('netMarginPct', '?')}%", "—"],
        ]

        story.append(styled_table(
            ["Metric", "This Month", "Prev Month", "MoM Change", "YTD Monthly Avg", "vs YTD"],
            fin_rows,
            col_widths=[30 * mm, 26 * mm, 26 * mm, 22 * mm, 30 * mm, 22 * mm],
        ))
        story.append(Spacer(1, 4 * mm))

        # Top expenses
        top_exp = x_month.get("topExpenses", [])
        if top_exp:
            story.append(Paragraph("Top Expenses", styles["SubHeader"]))
            exp_rows = [[e["name"], fmt_money(e["amount"])] for e in top_exp[:8]]
            story.append(styled_table(
                ["Expense Category", "Amount"],
                exp_rows,
                col_widths=[100 * mm, 40 * mm],
            ))
            story.append(Spacer(1, 4 * mm))

        # Ecommerce Equation
        prof = analysis.get("profitability", {})
        ee = prof.get("ecommerceEquation", {})
        if ee:
            story.append(Paragraph("Ecommerce Equation", styles["SubHeader"]))
            ee_text = (
                f"<b>Revenue:</b> {fmt_money(ee.get('revenue'))} &nbsp;&nbsp; "
                f"<b>- Marketing:</b> {fmt_money(ee.get('marketingCosts'))} &nbsp;&nbsp; "
                f"<b>- Variable:</b> {ee.get('variableCosts', 'N/A')} &nbsp;&nbsp; "
                f"<b>- Fixed:</b> {fmt_money(ee.get('fixedCosts'))} &nbsp;&nbsp; "
                f"<b>= Profit:</b> {fmt_money(ee.get('estimatedProfit'))}"
            )
            story.append(Paragraph(ee_text, styles["NBodyText"]))
            if ee.get("mer"):
                story.append(Paragraph(f"<b>MER:</b> {ee['mer']}", styles["NBodyText"]))

        # Overdue receivables
        recv = xero.get("receivables", {})
        if recv.get("overdueCount", 0) > 0:
            story.append(Paragraph("Outstanding Receivables", styles["SubHeader"]))
            story.append(Paragraph(
                f"<b>{recv['overdueCount']}</b> overdue invoices totaling <b>{fmt_money(recv['overdueAmount'])}</b>",
                styles["NBodyText"],
            ))
            if recv.get("topOverdue"):
                ov_rows = [[o["contact"], fmt_money(o["amount"]), o.get("dueDate", "—"), f"{o.get('daysOverdue', '?')} days"] for o in recv["topOverdue"][:5]]
                story.append(styled_table(
                    ["Contact", "Amount", "Due Date", "Days Overdue"],
                    ov_rows,
                    col_widths=[50 * mm, 30 * mm, 30 * mm, 30 * mm],
                ))

    # ══════════════════════════════════════════════════════════
    # PAGE 5: SOCIAL & EMAIL
    # ══════════════════════════════════════════════════════════
    story.append(PageBreak())

    # Instagram
    if social and social.get("instagram"):
        ig = social["instagram"]
        story.append(Paragraph("Instagram Performance", styles["SectionHeader"]))

        ig_rows = [
            ["Followers", f"{ig.get('followers', 0):,}"],
            ["Posts This Month", str(ig.get("postsThisMonth", 0))],
            ["Total Engagement", f"{ig.get('totalEngagement', 0):,}"],
            ["Avg Engagement/Post", str(ig.get("avgEngagementPerPost", 0))],
            ["Engagement Rate", f"{ig.get('engagementRate', 0)}%"],
            ["Likes", f"{ig.get('totalLikes', 0):,}"],
            ["Comments", f"{ig.get('totalComments', 0):,}"],
        ]

        story.append(styled_table(["Metric", "Value"], ig_rows, col_widths=[60 * mm, 40 * mm]))
        story.append(Spacer(1, 4 * mm))

        media_types = ig.get("mediaTypeBreakdown", {})
        if media_types:
            story.append(Paragraph(
                "<b>Content Mix:</b> " + ", ".join(f"{t}: {c}" for t, c in media_types.items()),
                styles["NBodyText"],
            ))

    # Klaviyo
    if klaviyo:
        story.append(Paragraph("Email Marketing (Klaviyo)", styles["SectionHeader"]))
        kl_month = klaviyo.get("month", {})
        story.append(Paragraph(
            f"<b>Campaigns Sent:</b> {kl_month.get('campaignsSent', 0)} &nbsp;&nbsp; "
            f"<b>Active Flows:</b> {kl_month.get('activeFlows', 0)}",
            styles["NBodyText"],
        ))
        names = kl_month.get("campaignNames", [])
        if names:
            story.append(Paragraph("<b>Campaigns:</b> " + ", ".join(names[:8]), styles["NBodyText"]))

    # ══════════════════════════════════════════════════════════
    # PAGE 6: CHANNEL GRADES, WINS, CONCERNS, RECOMMENDATIONS
    # ══════════════════════════════════════════════════════════
    story.append(PageBreak())

    # Channel Report Card
    channels = analysis.get("channelPerformance", [])
    if channels:
        story.append(Paragraph("Channel Report Card", styles["SectionHeader"]))
        ch_rows = []
        for ch in channels:
            grade_s = ParagraphStyle("g_tmp", parent=styles["TableCell"], textColor=grade_color(ch.get("grade")), fontName="Helvetica-Bold")
            ch_rows.append([
                ch.get("channel", ""),
                Paragraph(ch.get("grade", "—"), grade_s),
                ch.get("monthValue", "—"),
                ch.get("vsYtdAvg", "—"),
                ch.get("insight", "—")[:80],
            ])

        story.append(styled_table(
            ["Channel", "Grade", "Month Value", "vs YTD", "Insight"],
            ch_rows,
            col_widths=[30 * mm, 15 * mm, 30 * mm, 22 * mm, 60 * mm],
        ))
        story.append(Spacer(1, 6 * mm))

    # Wins
    wins = analysis.get("wins", [])
    if wins:
        story.append(Paragraph("Wins", styles["SectionHeader"]))
        for w in wins:
            story.append(Paragraph(f"<font color='#5A8F5A'>&#10003;</font> <b>{w.get('title', '')}</b>", styles["NBodyText"]))
            story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;{w.get('detail', '')}", styles["SmallText"]))
            story.append(Spacer(1, 2 * mm))

    # Concerns
    concerns = analysis.get("concerns", [])
    if concerns:
        story.append(Paragraph("Concerns", styles["SectionHeader"]))
        for c in concerns:
            urgency_map = {"critical": "&#9679; CRITICAL", "high": "&#9679; HIGH", "medium": "&#9679; MEDIUM", "low": "&#9679; LOW"}
            urgency_color = {"critical": "#C0392B", "high": "#E67E22", "medium": "#F1C40F", "low": "#888888"}
            urg = c.get("urgency", "medium")
            story.append(Paragraph(
                f"<font color='{urgency_color.get(urg, '#888')}'>{urgency_map.get(urg, '&#9679;')}</font> <b>{c.get('title', '')}</b>",
                styles["NBodyText"],
            ))
            story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;{c.get('detail', '')}", styles["SmallText"]))
            if c.get("suggestedFix"):
                fix_style = ParagraphStyle("fix_tmp", parent=styles["SmallText"], textColor=ACCENT_GREEN)
                story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;&#128161; {c['suggestedFix']}", fix_style))
            story.append(Spacer(1, 2 * mm))

    # Strategic Recommendations
    recs = analysis.get("strategicRecommendations", [])
    if recs:
        story.append(PageBreak())
        story.append(Paragraph("Strategic Recommendations", styles["SectionHeader"]))
        rec_rows = []
        for r in recs:
            rec_rows.append([
                str(r.get("priority", "")),
                r.get("recommendation", "")[:80],
                r.get("expectedImpact", "")[:50],
                r.get("owner", ""),
                r.get("timeframe", ""),
            ])

        story.append(styled_table(
            ["#", "Recommendation", "Expected Impact", "Owner", "Timeframe"],
            rec_rows,
            col_widths=[8 * mm, 62 * mm, 40 * mm, 20 * mm, 22 * mm],
        ))
        story.append(Spacer(1, 6 * mm))

    # Next Month Outlook
    outlook = analysis.get("nextMonthOutlook")
    if outlook:
        story.append(Paragraph("Next Month Outlook", styles["SectionHeader"]))
        story.append(Paragraph(outlook, styles["NBodyText"]))

    # YTD Summary
    ytd_summary = analysis.get("ytdSummary", {})
    if ytd_summary:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph("Year-to-Date Summary", styles["SubHeader"]))
        story.append(Paragraph(
            f"<b>YTD Revenue:</b> {fmt_money(ytd_summary.get('totalRevenue'))} &nbsp;&nbsp; "
            f"<b>Monthly Avg:</b> {fmt_money(ytd_summary.get('monthlyAvg'))} &nbsp;&nbsp; "
            f"<b>Trend:</b> {ytd_summary.get('trend', 'N/A')} &nbsp;&nbsp; "
            f"<b>Annualized:</b> {fmt_money(ytd_summary.get('annualizedProjection'))}",
            styles["NBodyText"],
        ))

    # ── BUILD PDF ────────────────────────────────────────────
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title=f"Noody Skincare — {period} Business Review",
        author="Noody Business Intelligence",
    )
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"✅ PDF generated: {output_path}")


# ─── DEMO DATA (for testing without live APIs) ──────────────
def get_demo_data():
    return [
        {
            "source": "shopify", "period": "February 2026",
            "month": {
                "orders": 187, "revenue": 17250, "grossSales": 18400, "aov": 92.25,
                "dailyAvgRevenue": 616, "dailyAvgOrders": 6.7,
                "uniqueCustomers": 163, "repeatCustomers": 12, "repeatRate": 7,
                "totalDiscounts": 1280, "discountedOrderPct": 34,
                "topProducts": [
                    {"name": "Nourishing Body Lotion", "qty": 68, "revenue": 4080, "orders": 62},
                    {"name": "Gentle Wash", "qty": 52, "revenue": 2860, "orders": 48},
                    {"name": "Soothing Balm", "qty": 41, "revenue": 2870, "orders": 38},
                    {"name": "Sun Balm SPF 50", "qty": 35, "revenue": 2100, "orders": 32},
                    {"name": "Bubble Bath", "qty": 29, "revenue": 1305, "orders": 27},
                    {"name": "Starter Kit", "qty": 18, "revenue": 1620, "orders": 18},
                    {"name": "Nappy Balm", "qty": 15, "revenue": 525, "orders": 14},
                ],
                "sourceBreakdown": [
                    {"name": "web", "orders": 142, "revenue": 13110},
                    {"name": "shopify_draft_order", "orders": 45, "revenue": 4140},
                ],
                "weeklyBreakdown": [
                    {"week": "1-7", "orders": 38, "revenue": 3510, "aov": 92.37},
                    {"week": "8-14", "orders": 51, "revenue": 4692, "aov": 92.00},
                    {"week": "15-21", "orders": 55, "revenue": 5170, "aov": 94.00},
                    {"week": "22-28", "orders": 43, "revenue": 3878, "aov": 90.19},
                ],
            },
            "prevMonth": {"orders": 201, "revenue": 18540, "aov": 92.24, "dailyAvgRevenue": 598},
            "ytd": {"orders": 388, "revenue": 35790, "aov": 92.24, "dailyAvgRevenue": 607, "monthlyAvgRevenue": 17895, "months": 2},
            "comparison": {"vsPreMonthRevPct": -7, "vsPreMonthOrdersPct": -7, "vsYtdAvgRevPct": -4, "vsYtdAvgAOVPct": 0},
        },
        {
            "source": "meta_ads", "period": "February 2026",
            "month": {"spend": 3250, "impressions": 285000, "clicks": 4120, "ctr": 1.45, "cpc": 0.79, "cpm": 11.40, "reach": 168000, "frequency": 1.70, "purchases": 42, "purchaseValue": 5880, "roas": 1.81, "cpa": 77.38, "addToCart": 312, "initiateCheckout": 89, "linkClicks": 3200},
            "prevMonth": {"spend": 2890, "impressions": 252000, "clicks": 3640, "ctr": 1.44, "cpc": 0.79, "reach": 148000, "frequency": 1.70, "purchases": 35, "purchaseValue": 4900, "roas": 1.70, "cpa": 82.57},
            "ytd": {"spend": 6140, "roas": 1.75, "cpa": 79.74, "ctr": 1.45},
            "ytdMonthlyAvg": {"spend": 3070, "roas": 1.75, "cpa": 79.74, "ctr": 1.45},
            "campaigns": [
                {"name": "NZ-Prospecting-Broad", "spend": 1450, "purchases": 18, "purchaseValue": 2520, "roas": 1.74, "cpa": 80.56, "ctr": 1.52, "reach": 85000},
                {"name": "NZ-Retargeting-VC", "spend": 680, "purchases": 12, "purchaseValue": 1800, "roas": 2.65, "cpa": 56.67, "ctr": 2.10, "reach": 22000},
                {"name": "NZ-Lookalike-Purchasers", "spend": 620, "purchases": 7, "purchaseValue": 980, "roas": 1.58, "cpa": 88.57, "ctr": 1.20, "reach": 42000},
                {"name": "AU-Prospecting-Parents", "spend": 500, "purchases": 5, "purchaseValue": 580, "roas": 1.16, "cpa": 100.00, "ctr": 1.10, "reach": 19000},
            ],
            "comparison": {"vsPreMonthSpendPct": 12, "vsPreMonthROASPct": 6, "vsYtdAvgSpendPct": 6},
        },
        {
            "source": "xero", "period": "February 2026",
            "month": {"revenue": 28500, "cogs": 7125, "grossProfit": 21375, "operatingExpenses": 16400, "netProfit": 4975, "grossMarginPct": 75, "netMarginPct": 17,
                "topExpenses": [
                    {"name": "Advertising", "amount": 4800}, {"name": "Courier & Freight", "amount": 3200},
                    {"name": "Rent", "amount": 2908}, {"name": "Staff Wages", "amount": 1800},
                    {"name": "Subscriptions & Software", "amount": 1450}, {"name": "Consultancy", "amount": 980},
                ]},
            "prevMonth": {"revenue": 31200, "cogs": 7800, "grossProfit": 23400, "operatingExpenses": 17100, "netProfit": 6300, "grossMarginPct": 75, "netMarginPct": 20},
            "ytd": {"revenue": 59700, "grossProfit": 44775, "netProfit": 11275, "months": 2, "monthlyAvgRevenue": 29850, "monthlyAvgNetProfit": 5637.50, "grossMarginPct": 75, "netMarginPct": 19},
            "receivables": {"overdueCount": 3, "overdueAmount": 8450, "topOverdue": [
                {"contact": "Farmers Trading Co", "amount": 5200, "dueDate": "2026-01-15", "daysOverdue": 46},
                {"contact": "Baby City NZ", "amount": 2100, "dueDate": "2026-02-01", "daysOverdue": 27},
                {"contact": "Unichem Pharmacy", "amount": 1150, "dueDate": "2026-02-10", "daysOverdue": 18},
            ]},
            "comparison": {"vsPreMonthRevPct": -9, "vsPreMonthNetProfitPct": -21, "vsYtdAvgRevPct": -5},
        },
        {
            "source": "social", "period": "February 2026",
            "instagram": {"followers": 13200, "postsThisMonth": 12, "totalLikes": 1840, "totalComments": 126, "totalEngagement": 1966, "avgEngagementPerPost": 164, "engagementRate": 1.24, "mediaTypeBreakdown": {"VIDEO": 8, "IMAGE": 4}},
        },
        {
            "source": "klaviyo", "period": "February 2026",
            "month": {"campaignsSent": 6, "campaignNames": ["Feb Newsletter", "Sun Balm Launch", "VIP Early Access", "Valentine's Bundle", "Eczema Awareness", "Win-Back Flow"], "activeFlows": 8},
        },
    ]


def get_demo_analysis():
    return {
        "reportTitle": "Noody Skincare — February 2026 Business Review",
        "executiveSummary": "February delivered $17,250 in Shopify revenue across 187 orders, coming in 4% below YTD average and 7% below January. Net profit of $4,975 (17% margin) through Xero shows the business remains profitable but margins compressed from 20% last month. Meta ROAS improved to 1.81x from 1.70x, suggesting ad efficiency is trending in the right direction. The $8,450 in overdue receivables from wholesale partners needs immediate attention.",
        "overallGrade": "B-",
        "gradeRationale": "Profitable month with improving ad efficiency, but revenue decline and overdue receivables are yellow flags.",
        "revenueAnalysis": {
            "headline": "February Shopify revenue $17,250 — down 7% from January, 4% below YTD average",
            "monthRevenue": 17250,
            "vsYtdAvg": "-4%",
            "vsPrevMonth": "-7%",
            "dailyAvg": 616,
            "keyInsight": "Week 3 (15-21 Feb) was strongest at $5,170, likely driven by the Sun Balm SPF 50 launch push. Post-launch momentum faded in week 4. DTC direct orders remain strong at 76% of total.",
            "dtcEstimate": "$13,110 (76%) from web direct — solid DTC base",
            "wholesaleEstimate": "$4,140 (24%) from draft orders — likely wholesale/Farmers",
        },
        "channelPerformance": [
            {"channel": "DTC (Shopify)", "grade": "B", "monthValue": "$17,250", "vsYtdAvg": "-4%", "keyMetrics": "187 orders, $92 AOV, 7% repeat", "insight": "Stable AOV but order volume declining. Repeat rate needs work — only 7% is low for skincare."},
            {"channel": "Meta Ads", "grade": "B+", "monthValue": "$3,250 spend, $5,880 rev", "vsYtdAvg": "ROAS 1.81x vs 1.75x avg", "keyMetrics": "1.81x ROAS, $77 CPA, 1.45% CTR", "insight": "Efficiency improving. Retargeting at 2.65x ROAS is strong. AU expansion needs optimization."},
            {"channel": "Email (Klaviyo)", "grade": "B", "monthValue": "6 campaigns, 8 active flows", "vsYtdAvg": "Consistent", "keyMetrics": "6 campaigns sent", "insight": "Good campaign cadence. Sun Balm launch and VIP access shows strategic use of email."},
            {"channel": "Instagram", "grade": "C+", "monthValue": "12 posts, 1,966 engagement", "vsYtdAvg": "1.24% engagement rate", "keyMetrics": "13.2K followers, 164 avg eng/post", "insight": "Engagement rate at 1.24% is below 2.5% benchmark. Video content (8 of 12 posts) is the right direction but needs better hooks."},
        ],
        "profitability": {
            "headline": "Net profit $4,975 on $28,500 Xero revenue — 17% margin, down from 20% last month",
            "xeroRevenue": 28500,
            "grossProfit": 21375,
            "grossMargin": "75%",
            "netProfit": 4975,
            "netMargin": "17%",
            "vsYtdAvgMargin": "Below YTD avg of 19%",
            "ecommerceEquation": {
                "revenue": 17250,
                "marketingCosts": 3250,
                "variableCosts": "est. $4,140",
                "fixedCosts": 8450,
                "estimatedProfit": 1410,
                "mer": "19%",
            },
            "topExpenses": "Advertising ($4,800), Courier ($3,200), Rent ($2,908)",
            "cashflowNote": "$8,450 overdue — Farmers ($5,200) is 46 days past due and needs escalation.",
        },
        "topProducts": [
            {"name": "Nourishing Body Lotion", "units": 68, "revenue": 4080, "trend": "stable"},
            {"name": "Soothing Balm", "units": 41, "revenue": 2870, "trend": "up"},
            {"name": "Gentle Wash", "units": 52, "revenue": 2860, "trend": "stable"},
            {"name": "Sun Balm SPF 50", "units": 35, "revenue": 2100, "trend": "up"},
            {"name": "Bubble Bath", "units": 29, "revenue": 1305, "trend": "stable"},
        ],
        "wins": [
            {"title": "Meta ROAS improved to 1.81x", "detail": "Up from 1.70x last month. Retargeting campaign at 2.65x is pulling efficiency up. CPA dropped from $83 to $77.", "impact": "high"},
            {"title": "Sun Balm SPF 50 gaining traction", "detail": "35 units in its first full month — already #4 product by revenue. Drove strongest week of the month.", "impact": "medium"},
            {"title": "Gross margin holding at 75%", "detail": "Consistent with YTD average despite discount activity at 34% of orders.", "impact": "medium"},
        ],
        "concerns": [
            {"title": "Revenue declining month-over-month", "detail": "Down 7% from January and 4% below YTD average. Order volume dropped from 201 to 187.", "urgency": "high", "suggestedFix": "Increase Meta spend on proven retargeting audiences. Test new prospecting creatives with Sun Balm angle."},
            {"title": "$8,450 in overdue receivables", "detail": "Farmers $5,200 is 46 days overdue. This impacts cash flow and ability to reinvest in marketing.", "urgency": "critical", "suggestedFix": "Call Farmers accounts payable this week. Send formal payment reminder to all overdue accounts."},
            {"title": "Instagram engagement rate below benchmark", "detail": "1.24% vs 2.5% industry benchmark. Despite posting 12 times (good frequency), content isn't resonating.", "urgency": "medium", "suggestedFix": "Focus on before/after UGC content and parent testimonials. Reduce product-only posts."},
            {"title": "Low repeat customer rate", "detail": "Only 7% of customers are repeat buyers. For a consumable skincare brand, this should be 20-30%.", "urgency": "high", "suggestedFix": "Implement post-purchase Klaviyo flow with replenishment reminders at 45/60/90 days. Consider subscription model."},
        ],
        "strategicRecommendations": [
            {"priority": 1, "recommendation": "Chase overdue receivables — call Farmers this week", "expectedImpact": "Recover $8,450 in cash flow", "owner": "Scott", "timeframe": "This week"},
            {"priority": 2, "recommendation": "Scale retargeting spend to $1,000/month — it's your best ROAS channel at 2.65x", "expectedImpact": "+$1,000-1,500 monthly revenue from proven audiences", "owner": "Marketing", "timeframe": "This week"},
            {"priority": 3, "recommendation": "Build replenishment email flow in Klaviyo", "expectedImpact": "Increase repeat rate from 7% to 15%+ over 3 months", "owner": "Ashleigh", "timeframe": "This month"},
            {"priority": 4, "recommendation": "Create 4 UGC-style reels featuring real parent testimonials", "expectedImpact": "Improve Instagram engagement from 1.24% toward 2.5%", "owner": "Marketing", "timeframe": "This month"},
            {"priority": 5, "recommendation": "Pause AU prospecting until NZ ROAS exceeds 2.5x consistently", "expectedImpact": "Save $500/month, reinvest in proven NZ audiences", "owner": "Scott", "timeframe": "This month"},
        ],
        "nextMonthOutlook": "March should benefit from Sun Balm momentum as summer continues in NZ and eczema season approaches in southern hemisphere autumn. Focus on recovering the overdue receivables to fund increased Meta retargeting spend. If repeat rate improvements from Klaviyo flows start showing by mid-March, project $19,000-20,000 Shopify revenue.",
        "ytdSummary": {
            "totalRevenue": 35790, "monthlyAvg": 17895,
            "trend": "slightly declining", "bestMonth": "January 2026",
            "worstMonth": "February 2026", "annualizedProjection": 214740,
        },
    }


# ─── MAIN ────────────────────────────────────────────────────
if __name__ == "__main__":
    if "--demo" in sys.argv:
        data = get_demo_data()
        analysis = get_demo_analysis()
        output = "/mnt/user-data/outputs/noody-monthly-review-demo.pdf"
    elif "--input" in sys.argv:
        idx = sys.argv.index("--input")
        input_path = sys.argv[idx + 1]
        output = sys.argv[sys.argv.index("--output") + 1] if "--output" in sys.argv else "monthly-review.pdf"
        with open(input_path, "r") as f:
            payload = json.load(f)
        data = payload.get("data", [])
        analysis = payload.get("analysis", {})
    else:
        print("Usage: python3 generate-monthly-pdf.py --demo")
        print("       python3 generate-monthly-pdf.py --input data.json --output report.pdf")
        sys.exit(1)

    build_report(data, analysis, output)

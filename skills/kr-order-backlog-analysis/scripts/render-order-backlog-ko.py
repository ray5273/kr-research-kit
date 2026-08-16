#!/usr/bin/env python3

import argparse
import json
import math
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError as exc:
    raise SystemExit("한글 그래프를 만들려면 Pillow가 필요합니다: python -m pip install pillow") from exc


COLORS = {
    "background": "#F8FAFC",
    "panel": "#FFFFFF",
    "ink": "#1E293B",
    "muted": "#64748B",
    "grid": "#E2E8F0",
    "project": "#0D9488",
    "service": "#7C3AED",
    "proxy": "#D97706",
    "undated": "#94A3B8",
    "cumulative": "#E11D48",
    "capacity_bg": "#EFF6FF",
    "capacity_border": "#BFDBFE",
    "capacity_ink": "#1E3A8A",
}

BASIS_LABELS = {
    "official-revenue-schedule": "전자공시가 밝힌 매출 인식 예정액",
    "official-contract-end-year": "공시 계약 잔액의 종료연도 분포",
    "contract-disclosure-maturity-proxy": "개별 계약공시 총액의 종료연도 분포 · 공식 수주잔고 아님",
    "official-total-only": "공식 수주잔고 총액 · 연도별 일정 미공시",
}

TITLE_LABELS = {
    "official-revenue-schedule": "연도별 수주잔고 매출 인식 예정액",
    "official-contract-end-year": "계약 종료연도별 잔여 공급액",
    "contract-disclosure-maturity-proxy": "계약공시 종료연도별 금액",
    "official-total-only": "공식 수주잔고 총액",
}


def font_path():
    candidates = [
        os.environ.get("KR_BACKLOG_FONT"),
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/Library/Fonts/AppleSDGothicNeo.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "C:/Windows/Fonts/malgun.ttf",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    raise SystemExit(
        "한글 글꼴을 찾지 못했습니다. KR_BACKLOG_FONT에 한글 TTF/TTC 경로를 지정해 주세요."
    )


FONT_PATH = font_path()


def load_font(size):
    return ImageFont.truetype(FONT_PATH, size=size)


def nice_maximum(value):
    if value <= 0:
        return 1
    exponent = 10 ** math.floor(math.log10(value))
    fraction = value / exponent
    nice_fraction = 1 if fraction <= 1 else 2 if fraction <= 2 else 5 if fraction <= 5 else 10
    return nice_fraction * exponent


def format_number(value):
    return f"{int(round(value)):,}"


def format_amount(value, unit, suffix=True):
    rounded = int(round(value))
    if unit == "억원":
        jo, eok = divmod(rounded, 10000)
        if jo and eok:
            return f"{jo}조 {eok:,}억원"
        if jo:
            return f"{jo}조원"
        return f"{eok:,}억원"
    return f"{format_number(value)}{unit if suffix else ''}"


def format_tick(value, unit):
    rounded = int(round(value))
    if rounded == 0:
        return "0"
    if unit == "억원":
        if rounded >= 10000 and rounded % 10000 == 0:
            return f"{rounded // 10000}조"
        if rounded >= 1000 and rounded % 1000 == 0:
            return f"{rounded // 1000}천억"
        return f"{rounded:,}억"
    return f"{rounded:,}"


def bar_color(data, bucket):
    if bucket.get("status") == "undated":
        return COLORS["undated"]
    if bucket.get("category") == "long-term-service":
        return COLORS["service"]
    if data.get("basis") == "contract-disclosure-maturity-proxy":
        return COLORS["proxy"]
    return COLORS["project"]


def draw_text(
    draw,
    xy,
    text,
    font,
    fill,
    anchor="la",
    spacing=4,
    stroke_width=0,
    stroke_fill=None,
):
    draw.multiline_text(
        xy,
        str(text),
        font=font,
        fill=fill,
        anchor=anchor,
        spacing=spacing,
        stroke_width=stroke_width,
        stroke_fill=stroke_fill,
    )


def render(payload, png_out):
    data = payload["data"]
    buckets = payload["buckets"]
    summary = payload["summary"]
    width, height = 1200, 820
    image = Image.new("RGB", (width, height), COLORS["background"])
    draw = ImageDraw.Draw(image)

    title_font = load_font(34)
    subtitle_font = load_font(19)
    body_font = load_font(16)
    small_font = load_font(14)
    tick_font = load_font(14)
    value_font = load_font(15)

    draw.rounded_rectangle((36, 28, 1164, 792), radius=10, fill=COLORS["panel"])
    company_label = data.get("chartCompany") or data.get("company")
    draw_text(
        draw,
        (70, 58),
        f"{company_label} · {TITLE_LABELS.get(data.get('basis'), '수주잔고 분석')}",
        title_font,
        COLORS["ink"],
    )
    draw_text(
        draw,
        (70, 107),
        BASIS_LABELS.get(data.get("basis"), "공시 수주잔고 분포"),
        subtitle_font,
        COLORS["muted"],
    )
    contract_count = sum(int(bucket.get("contractCount", 0)) for bucket in buckets)
    official_backlog = summary.get("officialBacklog")
    coverage = (
        summary.get("bucketAmount", 0) / official_backlog * 100
        if official_backlog
        else None
    )
    if coverage is not None and abs(summary.get("reconciliationGap") or 0) > 0.01:
        scope_note = (
            f"개별 계약 진행현황 {contract_count}건 기준 · 공식 수주잔고의 {coverage:.1f}%"
            " · 전체 잔고의 연도별 배분 아님"
        )
        draw_text(draw, (70, 137), scope_note, small_font, COLORS["capacity_ink"])
    draw_text(
        draw,
        (1130, 66),
        f"{data.get('ticker')} · 기준일 {data.get('asOf')}",
        body_font,
        COLORS["muted"],
        anchor="ra",
    )
    draw_text(
        draw,
        (1130, 104),
        f"단위: {data.get('unit')}",
        body_font,
        COLORS["muted"],
        anchor="ra",
    )

    chart_left, chart_top, chart_width, chart_height = 130, 180, 980, 348
    cumulative = 0
    cumulative_values = []
    for bucket in buckets:
        if bucket.get("status") == "dated" and bucket.get("category") != "long-term-service":
            cumulative += bucket.get("amount", 0)
            cumulative_values.append(cumulative)
        else:
            cumulative_values.append(None)
    maximum = nice_maximum(
        max(
            [1]
            + [bucket.get("amount", 0) for bucket in buckets]
            + [value for value in cumulative_values if value is not None]
        )
    )

    for step in range(6):
        value = maximum * step / 5
        y = chart_top + chart_height - chart_height * step / 5
        draw.line((chart_left, y, chart_left + chart_width, y), fill=COLORS["grid"], width=1)
        draw_text(
            draw,
            (chart_left - 16, y),
            format_tick(value, data.get("unit")),
            tick_font,
            COLORS["muted"],
            anchor="rm",
        )
    draw.line((chart_left, chart_top, chart_left, chart_top + chart_height), fill=COLORS["ink"], width=2)
    draw.line(
        (chart_left, chart_top + chart_height, chart_left + chart_width, chart_top + chart_height),
        fill=COLORS["ink"],
        width=2,
    )

    slot = chart_width / len(buckets)
    bar_width = max(18, min(70, slot * 0.58))
    points = []
    for index, bucket in enumerate(buckets):
        center_x = chart_left + slot * (index + 0.5)
        bar_height = bucket.get("amount", 0) / maximum * chart_height
        bar_top = chart_top + chart_height - bar_height
        draw.rectangle(
            (center_x - bar_width / 2, bar_top, center_x + bar_width / 2, chart_top + chart_height),
            fill=bar_color(data, bucket),
        )
        if bucket.get("status") == "undated":
            label = "종료일\n미정"
        elif bucket.get("category") == "long-term-service":
            label = f"{bucket.get('year')}\n장기 운영"
        else:
            label = str(bucket.get("year"))
        draw_text(
            draw,
            (center_x, chart_top + chart_height + 17),
            label,
            tick_font,
            COLORS["ink"],
            anchor="ma",
            spacing=1,
        )
        draw_text(
            draw,
            (center_x, max(chart_top + 5, bar_top - 10)),
            format_amount(bucket.get("amount", 0), data.get("unit")),
            value_font,
            COLORS["ink"],
            anchor="ms",
            stroke_width=3,
            stroke_fill=COLORS["panel"],
        )
        if cumulative_values[index] is not None:
            points.append(
                (
                    center_x,
                    chart_top + chart_height - cumulative_values[index] / maximum * chart_height,
                )
            )

    if len(points) >= 2:
        draw.line(points, fill=COLORS["cumulative"], width=4, joint="curve")
        for x, y in points:
            draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=COLORS["cumulative"])

    legend_y = 610
    draw.rectangle((130, legend_y, 154, legend_y + 14), fill=COLORS["project"])
    draw_text(draw, (166, legend_y + 7), "프로젝트 잔액", body_font, COLORS["ink"], anchor="lm")
    if any(bucket.get("category") == "long-term-service" for bucket in buckets):
        draw.rectangle((300, legend_y, 324, legend_y + 14), fill=COLORS["service"])
        draw_text(draw, (336, legend_y + 7), "장기 운영·유지보수", body_font, COLORS["ink"], anchor="lm")
    draw.line((530, legend_y + 7, 565, legend_y + 7), fill=COLORS["cumulative"], width=4)
    draw.ellipse((543, legend_y + 2, 553, legend_y + 12), fill=COLORS["cumulative"])
    draw_text(draw, (578, legend_y + 7), "프로젝트 누적액", body_font, COLORS["ink"], anchor="lm")
    if any(bucket.get("status") == "undated" for bucket in buckets):
        draw.rectangle((860, legend_y, 884, legend_y + 14), fill=COLORS["undated"])
        draw_text(draw, (896, legend_y + 7), "종료일 미정", body_font, COLORS["ink"], anchor="lm")

    summary_y = 650
    draw_text(
        draw,
        (130, summary_y),
        f"그래프 합계 {format_amount(summary.get('bucketAmount', 0), data.get('unit'))}",
        body_font,
        COLORS["muted"],
        anchor="la",
    )
    official = summary.get("officialBacklog")
    official_text = "공식 수주잔고 미공시" if official is None else f"공식 수주잔고 {format_amount(official, data.get('unit'))}"
    draw_text(draw, (1110, summary_y), official_text, body_font, COLORS["muted"], anchor="ra")

    capacity = data.get("capacity")
    if capacity:
        draw.rounded_rectangle(
            (105, 678, 1130, 746),
            radius=8,
            fill=COLORS["capacity_bg"],
            outline=COLORS["capacity_border"],
            width=1,
        )
        draw_text(draw, (128, 699), "생산능력 참고", body_font, COLORS["capacity_ink"], anchor="lm")
        draw_text(
            draw,
            (278, 699),
            capacity.get("display", "정량 공시 없음"),
            body_font,
            COLORS["capacity_ink"],
            anchor="lm",
        )
        if capacity.get("note"):
            draw_text(
                draw,
                (278, 727),
                capacity.get("note"),
                small_font,
                COLORS["capacity_ink"],
                anchor="lm",
            )

    footnote = data.get("chartFootnote") or "종료연도는 매출 인식연도가 아닙니다."
    draw_text(draw, (105, 763), f"※ {footnote}", small_font, COLORS["muted"], anchor="la")

    Path(png_out).parent.mkdir(parents=True, exist_ok=True)
    image.save(png_out, format="PNG", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--png-out", required=True)
    args = parser.parse_args()
    payload = json.load(sys.stdin)
    render(payload, args.png_out)


if __name__ == "__main__":
    main()

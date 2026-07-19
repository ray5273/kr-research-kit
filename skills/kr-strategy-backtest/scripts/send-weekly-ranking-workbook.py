#!/usr/bin/env python3
"""Create and send the audited weekly full-ranking Excel attachment.

This is intentionally fail-closed: a missing full ranking or unavailable
artifact-tool runtime must never result in a partial Telegram attachment.
"""
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HOME = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
NAME = "krx-weekly-regime-vol-portfolio"
CONFIG = HOME / "config" / NAME
INPUT = CONFIG / "annual-top300-weekly-full-ranking.json"
EXPORTER = HOME / "scripts" / "export-weekly-ranking-workbook-exceljs.cjs"
OUT = HOME / "artifacts" / NAME / "ranking-workbooks"
STATE = CONFIG / "ranking-workbook-state.json"

def read_json(file, default=None):
    try:
        return json.loads(file.read_text())
    except FileNotFoundError:
        return default

def env():
    values = dict(os.environ)
    try:
        for line in (CONFIG / ".env").read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass
    return values

def send_document(token, chat_id, file, caption):
    boundary = "----HermesRankingWorkbookBoundary"
    fields = [("chat_id", chat_id), ("caption", caption)]
    body = bytearray()
    for name, value in fields:
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    mime = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
    body.extend((f"--{boundary}\r\nContent-Disposition: form-data; name=\"document\"; filename=\"{file.name}\"\r\nContent-Type: {mime}\r\n\r\n").encode())
    body.extend(file.read_bytes())
    body.extend(f"\r\n--{boundary}--\r\n".encode())
    request = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendDocument", data=bytes(body), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    response = json.loads(urllib.request.urlopen(request, timeout=60).read())
    if not response.get("ok"):
        raise RuntimeError("Telegram document delivery failed")

def main():
    values = env()
    if not INPUT.exists():
        raise RuntimeError(f"Missing full ranking input: {INPUT}")
    ranking = read_json(INPUT)
    if ranking.get("schemaVersion") != "krx-weekly-ranking-workbook/v1":
        raise RuntimeError("Full ranking input has an unsupported schema")
    rows = ranking.get("fullRanking", [])
    if len(rows) < 10 or any(row.get("rank") != index + 1 for index, row in enumerate(rows)):
        raise RuntimeError("Full ranking input is incomplete or non-contiguous")
    excluded = {str(item.get("ticker", item)).zfill(6) if isinstance(item, dict) else str(item).zfill(6) for item in ranking.get("complianceExclusions", [])}
    if any(str(row.get("ticker", "")).zfill(6) in excluded for row in rows):
        raise RuntimeError("Full ranking input violates a compliance exclusion")
    modules = values.get("HERMES_XLSX_NODE_MODULES", str(HOME / "runtime" / "krx-ranking-workbook" / "node_modules"))
    if not Path(modules).is_dir():
        raise RuntimeError("HERMES_XLSX_NODE_MODULES must point to the ExcelJS node_modules directory")
    node = values.get("HERMES_NODE", "/opt/homebrew/opt/node@22/bin/node")
    if not Path(node).exists() or not EXPORTER.exists():
        raise RuntimeError("Node runtime or workbook exporter is unavailable")
    date = ranking.get("executionDate") or ranking.get("signalDate")
    if not date:
        raise RuntimeError("Full ranking input has no execution date")
    work = OUT / date
    work.mkdir(parents=True, exist_ok=True)
    local_exporter = work / EXPORTER.name
    shutil.copy2(EXPORTER, local_exporter)
    modules_link = work / "node_modules"
    if modules_link.is_symlink() or modules_link.exists():
        if modules_link.resolve() != Path(modules).resolve():
            if modules_link.is_dir() and not modules_link.is_symlink():
                raise RuntimeError(f"Refusing to replace non-symlink directory: {modules_link}")
            modules_link.unlink()
    if not modules_link.exists():
        modules_link.symlink_to(Path(modules), target_is_directory=True)
    output = work / f"krx-top300-weekly-full-ranking-{date}.xlsx"
    run = subprocess.run([node, str(local_exporter), "--input", str(INPUT), "--output", str(output)], text=True, capture_output=True)
    if run.returncode:
        raise RuntimeError(f"Workbook generation failed: {run.stderr.strip() or run.stdout.strip()}")
    if not output.exists() or output.stat().st_size < 10_000:
        raise RuntimeError("Workbook export is missing or unexpectedly small")
    state = read_json(STATE, {})
    key = f"{ranking.get('generatedAt')}:{output.name}"
    if state.get("sentKey") != key:
        token, chat_id = values.get("TELEGRAM_BOT_TOKEN"), values.get("TELEGRAM_CHAT_ID")
        if not token or not chat_id:
            raise RuntimeError("Telegram credentials are unavailable")
        send_document(token, chat_id, output, f"KRX Top 300 주간 전체 순위 · {ranking.get('signalDate')} 신호 → {date} 적용\n005930 제외 검증 및 점수 상세 포함")
        STATE.write_text(json.dumps({"sentKey": key, "output": str(output), "rows": len(rows)}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"success": True, "output": str(output), "rows": len(rows), "sent": state.get("sentKey") != key}, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)

#!/usr/bin/env python3
"""Eatit v3.4 Ralph Progress Dashboard — 本地实时进度面板。

用法:
    python3 eatit/scripts/eatit-dashboard.py            # 端口 8765
    python3 eatit/scripts/eatit-dashboard.py 9000       # 自定义端口

打开 http://localhost:8765 — 30 秒自动刷新。
零外部依赖,只用标准库。
"""

from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
from collections import OrderedDict
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent  # eatit/
FIX_PLAN = REPO_ROOT / ".ralph" / "fix_plan.md"
RALPH_LOG = REPO_ROOT / ".ralph" / "logs" / "ralph.log"
STATUS_JSON = REPO_ROOT / ".ralph" / "status.json"
WATCHDOG_LOG = REPO_ROOT / ".ralph" / "logs" / "watchdog.log"


def run(cmd: list[str], cwd: Path | None = None) -> str:
    try:
        return subprocess.check_output(cmd, cwd=cwd or REPO_ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def parse_fix_plan() -> tuple[OrderedDict[str, list[tuple[str, bool, str]]], int, int]:
    """Parse fix_plan.md, return milestones dict { 'M1 — title': [(node_id, done, raw)...] }."""
    if not FIX_PLAN.exists():
        return OrderedDict(), 0, 0
    text = FIX_PLAN.read_text(encoding="utf-8")
    milestones: OrderedDict[str, list[tuple[str, bool, str]]] = OrderedDict()
    current = None
    done_total = 0
    todo_total = 0
    for line in text.splitlines():
        m_milestone = re.match(r"^### (M[1-9][^\n]*)", line)
        if m_milestone:
            current = m_milestone.group(1).strip()
            milestones[current] = []
            continue
        m_node = re.match(r"^- \[(x| )\] (\*\*)?(M[0-9.a-zA-Z+]+)\b(.*)$", line)
        if m_node and current is not None:
            done = m_node.group(1) == "x"
            node_id = m_node.group(3)
            rest = m_node.group(4).strip(" *—-")
            milestones[current].append((node_id, done, rest[:100]))
            if done:
                done_total += 1
            else:
                todo_total += 1
    return milestones, done_total, todo_total


def is_ralph_alive() -> bool:
    out = run(["pgrep", "-f", "ralph_loop"])
    return bool(out.strip())


def ralph_status() -> dict:
    if not STATUS_JSON.exists():
        return {}
    try:
        return json.loads(STATUS_JSON.read_text())
    except Exception:
        return {}


def current_loop_info() -> dict:
    """Read tail of ralph.log to find current Loop start time + timeout."""
    if not RALPH_LOG.exists():
        return {}
    lines = RALPH_LOG.read_text(errors="ignore").splitlines()[-50:]
    info = {"loop_id": None, "started_at": None, "timeout_minutes": None, "completed": None}
    # Strip ANSI
    ansi = re.compile(r"\x1b\[[0-9;]*m")
    for line in lines:
        s = ansi.sub("", line)
        m = re.match(r"\[([\d\-:\s]+)\] \[LOOP\] === Starting Loop #(\d+)", s)
        if m:
            info["started_at"] = m.group(1)
            info["loop_id"] = m.group(2)
            info["completed"] = False
        m2 = re.search(r"Starting Claude Code execution\.\.\. \(timeout: (\d+)m\)", s)
        if m2:
            info["timeout_minutes"] = int(m2.group(1))
        if "=== Completed Loop" in s:
            info["completed"] = True
    return info


def recent_commits(limit: int = 12) -> list[tuple[str, str]]:
    out = run(["git", "log", "--pretty=format:%h\t%s", f"-{limit}"])
    rows = []
    for line in out.splitlines():
        if "\t" in line:
            sha, msg = line.split("\t", 1)
            rows.append((sha, msg))
    return rows


def watchdog_recent() -> list[str]:
    if not WATCHDOG_LOG.exists():
        return []
    lines = WATCHDOG_LOG.read_text(errors="ignore").splitlines()[-5:]
    return [l for l in lines if l.strip()]


def now_china() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")


def render_progress_bar(done: int, total: int, width: int = 30) -> str:
    if total == 0:
        return "░" * width
    filled = round(done * width / total)
    return "█" * filled + "░" * (width - filled)


PAGE_CSS = """
body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
  background: #fafaf7; color: #0f1310; margin: 0; padding: 24px 32px; line-height: 1.5;
}
h1 { margin: 0 0 4px; font-size: 22px; font-weight: 600; }
.sub { color: #6b7560; font-size: 13px; margin-bottom: 24px; }
.card {
  background: #fff; border: 1px solid #e6e6df; border-radius: 12px;
  padding: 18px 22px; margin-bottom: 16px;
}
.card h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; color: #1f2622; }
.bar-wrap { display: flex; align-items: center; gap: 12px; margin: 6px 0; }
.bar-bg { flex: 1; height: 10px; background: #f0efe9; border-radius: 999px; overflow: hidden; }
.bar-fg { height: 100%; background: linear-gradient(90deg, #1F6B3A, #5fbf7c); transition: width .3s; }
.bar-fg.partial { background: linear-gradient(90deg, #d18b3f, #e6b87a); }
.bar-fg.idle { background: #d8d8d2; }
.bar-num { font-variant-numeric: tabular-nums; color: #6b7560; font-size: 12px; min-width: 80px; }
.big-bar .bar-bg { height: 14px; }
.big-bar .bar-num { font-size: 14px; color: #1f2622; min-width: 110px; font-weight: 500; }
.nodes { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 4px 12px; }
.node {
  font-size: 12px; padding: 4px 8px; border-radius: 6px; background: transparent;
  color: #9b9d96; font-variant-numeric: tabular-nums;
}
.node.done { color: #1F6B3A; background: #ecf4ee; }
.node.current { background: #fff3d6; color: #8a5a17; border: 1px solid #e6b87a; font-weight: 500; }
.commits { font-size: 12px; color: #4a4a44; line-height: 1.7; }
.commit-sha { color: #b48a4d; font-family: ui-monospace, SFMono-Regular, monospace; }
.health-row { display: flex; gap: 24px; align-items: center; margin: 4px 0; font-size: 13px; color: #4a4a44; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.dot.green { background: #1F6B3A; box-shadow: 0 0 0 3px rgba(31,107,58,.15); }
.dot.red { background: #c44d3a; box-shadow: 0 0 0 3px rgba(196,77,58,.15); }
.dot.amber { background: #d18b3f; box-shadow: 0 0 0 3px rgba(209,139,63,.15); }
.kbd { background: #f0efe9; border: 1px solid #d8d8d2; padding: 1px 6px; border-radius: 4px;
       font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; }
.foot { color: #9b9d96; font-size: 11px; margin-top: 24px; }
"""


def tail_live_log(lines: int = 30) -> str:
    """实时尾部 ralph live.log,过滤掉 ANSI 控制字符。"""
    live = REPO_ROOT / ".ralph" / "live.log"
    if not live.exists():
        return "(.ralph/live.log 不存在 — ralph 尚未启动?)"
    try:
        with live.open("rb") as f:
            f.seek(0, 2)  # SEEK_END
            size = f.tell()
            # 读最后 16KB,足够 50 行
            f.seek(max(0, size - 16384))
            chunk = f.read().decode("utf-8", errors="replace")
        # ANSI escape 清除
        ansi = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
        chunk = ansi.sub("", chunk)
        return "\n".join(chunk.splitlines()[-lines:])
    except Exception as e:
        return f"(读取 live.log 失败:{e})"


def tail_js_console(seconds: int = 120) -> str:
    """读最近 N 秒的 JS console 日志(diag.log Bridge → com.eatit.desktop.js)。"""
    try:
        out = subprocess.check_output(
            ["log", "show",
             "--predicate", 'subsystem == "com.eatit.desktop.js"',
             "--info", "--last", f"{seconds}s", "--style", "compact"],
            text=True, stderr=subprocess.DEVNULL, timeout=5,
        )
        return out.strip() or "(过去 {} 秒无 JS 日志)".format(seconds)
    except Exception as e:
        return f"(读取 JS 日志失败:{e})"


def render_html() -> str:
    milestones, done_total, todo_total = parse_fix_plan()
    total = done_total + todo_total
    pct = (done_total * 100 // total) if total else 0
    bar = render_progress_bar(done_total, total, 36)
    alive = is_ralph_alive()
    status = ralph_status()
    loop = current_loop_info()
    commits = recent_commits(12)
    wd = watchdog_recent()
    live_tail = tail_live_log(40)
    js_tail = tail_js_console(120)

    # Identify current node (first unchecked in fix_plan order)
    current_node = None
    for ms_name, nodes in milestones.items():
        for nid, done, _ in nodes:
            if not done:
                current_node = nid
                break
        if current_node:
            break

    # ETA: 18 min/loop average
    eta_minutes = todo_total * 18
    eta_h = eta_minutes // 60
    eta_m = eta_minutes % 60

    # Loop progress (if running)
    loop_html = ""
    if alive and loop.get("started_at") and not loop.get("completed"):
        try:
            t0 = datetime.strptime(loop["started_at"], "%Y-%m-%d %H:%M:%S").astimezone()
            elapsed = (datetime.now().astimezone() - t0).total_seconds()
            tmo = loop.get("timeout_minutes", 40)
            elapsed_pct = min(100, int(elapsed / (tmo * 60) * 100))
            loop_html = f'''
            <div class="bar-wrap">
              <div class="bar-bg"><div class="bar-fg partial" style="width:{elapsed_pct}%"></div></div>
              <div class="bar-num">{int(elapsed//60)}m / {tmo}m</div>
            </div>'''
        except Exception:
            pass

    # Milestone cards
    ms_cards = []
    for ms_name, nodes in milestones.items():
        ms_done = sum(1 for _, d, _ in nodes if d)
        ms_total = len(nodes)
        if ms_total == 0:
            continue
        ms_pct = ms_done * 100 // ms_total
        bar_class = "" if ms_pct == 100 else ("partial" if ms_pct > 0 else "idle")
        nodes_html = "".join(
            f'<div class="node {"done" if d else ("current" if nid == current_node else "")}" '
            f'title="{html.escape(rest)}">{"✓" if d else "○"} {html.escape(nid)}</div>'
            for nid, d, rest in nodes
        )
        ms_cards.append(f'''
        <div class="card">
          <h2>{html.escape(ms_name)} &nbsp;·&nbsp; {ms_done}/{ms_total}</h2>
          <div class="bar-wrap">
            <div class="bar-bg"><div class="bar-fg {bar_class}" style="width:{ms_pct}%"></div></div>
            <div class="bar-num">{ms_pct}%</div>
          </div>
          <div class="nodes">{nodes_html}</div>
        </div>''')

    # Commits
    commits_html = "<br>".join(
        f'<span class="commit-sha">{html.escape(sha)}</span> &nbsp; {html.escape(msg)}'
        for sha, msg in commits
    )

    # Watchdog
    wd_html = "<br>".join(html.escape(l) for l in wd) if wd else "<i>no watchdog activity yet</i>"

    health_dot = "green" if alive else "red"
    health_label = "Ralph 在跑" if alive else "Ralph 已死(watchdog 应在 15 min 内重启)"

    return f'''<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="5">
<title>Eatit v3.4 — {pct}% · {done_total}/{total}</title>
<style>{PAGE_CSS}</style>
</head>
<body>
<h1>Eatit v3.4 — macOS App Store 重构</h1>
<div class="sub">实时进度面板 · <b>5 秒</b>自动刷新 · {now_china()}</div>

<div class="card big-bar">
  <h2>总进度</h2>
  <div class="bar-wrap">
    <div class="bar-bg"><div class="bar-fg" style="width:{pct}%"></div></div>
    <div class="bar-num">{pct}% · {done_total}/{total}</div>
  </div>
  <div style="font-family: ui-monospace, monospace; color:#6b7560; font-size:13px; margin-top:8px;">
    {bar}
  </div>
  <div class="health-row" style="margin-top:14px;">
    <span><span class="dot {health_dot}"></span> &nbsp; {health_label}</span>
    <span>当前节点:<span class="kbd">{html.escape(current_node or "—")}</span></span>
    <span>剩余 ETA:<b>{eta_h}h {eta_m}m</b>(按 18 min/loop)</span>
  </div>
  {loop_html}
</div>

{"".join(ms_cards)}

<div class="card" id="live-tail-card">
  <h2>🔴 Ralph 实时输出 <span style="font-size:11px;color:#888;font-weight:400;margin-left:8px;">(.ralph/live.log 最近 40 行,5s 刷新)</span></h2>
  <pre style="background:#1a1a1a;color:#d4d4d4;padding:14px;border-radius:6px;max-height:360px;overflow-y:auto;font:11px/1.5 ui-monospace,monospace;white-space:pre-wrap;margin:0;">{html.escape(live_tail)}</pre>
</div>

<div class="card">
  <h2>🟢 Eatit JS Console <span style="font-size:11px;color:#888;font-weight:400;margin-left:8px;">(com.eatit.desktop.js 最近 2 分钟 — QQ/IP/ST 标记 + reject + error)</span></h2>
  <pre style="background:#0e1a0e;color:#a8d4a8;padding:14px;border-radius:6px;max-height:260px;overflow-y:auto;font:11px/1.5 ui-monospace,monospace;white-space:pre-wrap;margin:0;">{html.escape(js_tail)}</pre>
</div>

<div class="card">
  <h2>最近 commits</h2>
  <div class="commits">{commits_html}</div>
</div>

<div class="card">
  <h2>Watchdog 自检</h2>
  <div class="commits">{wd_html}</div>
  <div class="health-row" style="margin-top:8px;">
    <span class="kbd">crontab -l</span> &nbsp; 应见 <span class="kbd">*/15 * * * * /Users/shixuan/.local/bin/ralph-watchdog.sh</span>
  </div>
</div>

<div class="foot">
  PID Ralph: {html.escape(run(["pgrep", "-f", "ralph_loop"]).replace(chr(10), " "))} ·
  Loop: {html.escape(str(status.get("loop_count", "—")))} ·
  Calls: {html.escape(str(status.get("calls_made_this_hour", "—")))}/100/hr ·
  Tokens: {html.escape(str(status.get("tokens_used_this_hour", "—")))}
</div>
</body>
</html>
'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/index.html"):
            body = render_html().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/progress.json":
            milestones, done, todo = parse_fix_plan()
            data = {
                "done": done, "todo": todo, "total": done + todo,
                "ralph_alive": is_ralph_alive(),
                "milestones": {k: [{"id": n, "done": d, "desc": r} for n, d, r in v]
                               for k, v in milestones.items()},
                "loop": current_loop_info(),
                "status": ralph_status(),
                "recent_commits": [{"sha": s, "msg": m} for s, m in recent_commits(20)],
            }
            body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"not found")

    def log_message(self, *_args):
        pass  # quiet


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Eatit v3.4 dashboard → http://localhost:{port}/")
    print(f"Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()

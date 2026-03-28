#!/bin/bash
# postToolUse (matcher: Shell) — record a successful test run for this conversation.
# verify-completion.sh only nags after this marker exists (then removes it).

input=$(cat)

echo "$input" | python3 << 'PY'
import json
import pathlib
import re
import sys

raw = sys.stdin.read()
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    raise SystemExit(0)

conv = data.get("conversation_id") or ""
if not conv:
    raise SystemExit(0)

ti = data.get("tool_input") or {}
if isinstance(ti, str):
    try:
        ti = json.loads(ti)
    except json.JSONDecodeError:
        ti = {}

cmd = (ti.get("command") or "").strip()
if not cmd:
    raise SystemExit(0)


def is_test_command(c: str) -> bool:
    s = c.lower()
    if "vitest" in s:
        return True
    if re.search(r"\bnpm\s+test\b", s):
        return True
    if re.search(r"\bnpm\s+run\s+test", s):
        return True
    if re.search(r"\bpnpm\s+test\b", s):
        return True
    if re.search(r"\bpnpm\s+run\s+test", s):
        return True
    if "pytest" in s:
        return True
    if "cargo test" in s:
        return True
    return False


if not is_test_command(cmd):
    raise SystemExit(0)

out = data.get("tool_output")
if isinstance(out, str):
    try:
        parsed = json.loads(out)
    except json.JSONDecodeError:
        parsed = {}
else:
    parsed = out or {}

exit_code = parsed.get("exitCode")
if exit_code is None:
    exit_code = parsed.get("exit_code")

try:
    exit_code = int(exit_code)
except (TypeError, ValueError):
    raise SystemExit(0)

lock_dir = pathlib.Path("/tmp/dossier-scope-locks")
lock_dir.mkdir(parents=True, exist_ok=True)
stamp = lock_dir / f"{conv}.tests-verified"

if exit_code == 0:
    stamp.write_text("ok", encoding="utf-8")
else:
    try:
        stamp.unlink()
    except OSError:
        pass
PY

echo '{}'

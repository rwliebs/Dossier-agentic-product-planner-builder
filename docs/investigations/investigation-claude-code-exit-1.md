# Investigation context: Claude Code process exited with code 1

**Use**: Reference for investigator agent (`.cursor/agents/investigator.md`) when debugging card build failures where the agent reports "Claude Code process exited with code 1".

**Symptom**: Every card build fails; `last_build_error` shows "Claude Code process exited with code 1" (or similar). The message is generic; the real cause usually appears earlier in logs.

---

## What exit code 1 means

- Exit code **0** = success; any **non-zero** = failure. **Code 1** = general failure (not a specific bug).
- The message is short; the actual reason is typically in output **before** the exit line (often on stderr).

---

## Typical causes (investigation checklist)

Use these when tracing root cause, not as user-facing copy.

1. **API key / authentication**
   - Missing or invalid `ANTHROPIC_API_KEY` in environment (or `~/.dossier/config`).
   - Key expired or wrong value → process stops with code 1.

2. **Network**
   - DNS failure, proxy blocks, firewall rules blocking Claude API.
   - Rate limiting from the Claude API can also surface as exit 1.

3. **Configuration**
   - Invalid or broken JSON/YAML config (missing comma, wrong indentation).
   - Wrong or missing config file path.

4. **Dependencies / runtime**
   - Missing Node.js packages or Python libraries.
   - Unsupported Node.js or Python version.

5. **Paths and working directory**
   - Wrong `cwd` / worktree path (e.g. agent running in Dossier app root instead of project clone → exit 1). See `lib/orchestration/trigger-build.ts` comment: "Without this, multi-card builds left worktree_path null → agent ran in Dossier app root → exit 1."
   - Missing input files or invalid paths.

6. **Permissions**
   - Cannot access files or run scripts (Linux, macOS, restricted Windows).

7. **CI / Docker**
   - Secrets not passed to the job; wrong working directory; env vars not passed into container.

---

## Investigation steps (for investigator)

1. **Check API key**: Env and `~/.dossier/config`; confirm key valid and not expired.
2. **Read full error output**: Scroll up in terminal/logs; find first error line (often stderr); note file names, line numbers, missing values.
3. **Run with verbose/debug**: If supported, enable debug/verbose to see config loading, network calls, permission checks.
4. **Validate config and paths**: JSON/YAML syntax; file paths exist; `worktree_path` / `cwd` correct for the run.
5. **Check dependencies**: Node/npm (and Python if used); versions; install/reinstall if needed.
6. **Permissions**: Ensure process can read/write target dirs and execute required commands.
7. **CI/Docker**: Confirm secrets, working directory, and env vars are correct for the runner.

---

## References

- User-provided: Error code 1 in Claude Code often indicates API connection issues (network, firewall, rate limiting).
- [How to Fix Claude Code Exit Code 1 Error?](https://www.webfactoryltd.com/blog/fix-claude-code-exit-code-1-error/) — common causes and step-by-step fixes.
- In-repo: `lib/orchestration/trigger-build.ts` (clone/worktree_path), `lib/orchestration/agentic-flow-client.ts` (SDK `query()` with `cwd`), `lib/orchestration/process-webhook.ts` (execution_failed → `last_build_error`).

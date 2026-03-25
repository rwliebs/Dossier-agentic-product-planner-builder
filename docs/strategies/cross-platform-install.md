# Strategy: Cross-Platform Install & First-Run (Windows Focus)

## Context

A real Windows user installed the npm package and eventually succeeded — but only with significant manual intervention. The five issues below are ordered by severity (first = most likely to cause abandonment).

## Issue Analysis

### 1. better-sqlite3 native addon fails on Windows (~5 min fix for us, blocks 100% of Windows users)

**Current state:**
- `bin/postinstall.mjs` runs `npm install better-sqlite3 --no-save` in `.next/standalone/` after `npm install`
- This triggers `node-gyp` compilation, which requires Visual Studio Build Tools + C++ workload
- Without those tools, `npm install` fails with a native compilation error
- The README says "Prerequisites: Node.js 20+" — no mention of build tools

**Root cause:** better-sqlite3 uses `prebuild-install` (fetches prebuilt binaries from GitHub releases) but only if the package is installed normally. Our postinstall runs a bare `npm install better-sqlite3` in a standalone directory with a dummy package.json, which may not trigger prebuild correctly.

**Options (choose one, recommend A+C):**

| Option | Effort | Effect |
|--------|--------|--------|
| **A. Fix postinstall to use prebuild-install explicitly** | ~30 min | Fetch prebuilt binary without needing build tools. `npx prebuild-install --runtime napi --target 7 --arch x64` inside the standalone better-sqlite3 dir. |
| **B. Ship prebuilt binaries for all platforms via prebuildify** | ~2 hr | Add `prebuildify --napi --strip` to the build step. Produces `prebuilds/` dir with platform binaries. Publish those in the npm tarball. Zero compilation needed for any user. |
| **C. Document Windows prerequisites** | ~15 min | Add to README: `npm install -g windows-build-tools` or VS Build Tools C++ workload. Immediate unblock for users willing to install. |
| **D. sql.js (WASM) fallback** | ~4 hr | Replace better-sqlite3 with sql.js when native binary fails to load. sql.js is pure WASM, zero compilation. Trade-off: ~2-5x slower for DB operations, different API (async vs sync). |

### 2. .next/standalone ships without compiled binary AND without build source

**Current state:**
- `scripts/copy-native-deps.sh` explicitly skips better-sqlite3: "Do NOT copy — they contain platform-specific native binaries"
- `bin/postinstall.mjs` tries to install them fresh at `npm install` time
- But if prebuild-install fails and `binding.gyp` isn't in the standalone dir, it's unrecoverable

**Fix:** This is the same issue as #1. If we fix postinstall to reliably fetch prebuilds OR ship prebuildify output in the tarball, this resolves automatically.

### 3. `spawn('start', [url])` breaks on Windows Command Prompt

**Current state** (`bin/dossier.mjs` line 108-114):
```javascript
const cmd =
  platform === "darwin"
    ? "open"
    : platform === "win32"
      ? "start"
      : "xdg-open";
spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
```

**Problem:** `start` is a CMD built-in, not an executable. `spawn` expects an executable on PATH. On Windows, this needs `spawn('cmd', ['/c', 'start', url])` or — better — the `open` npm package which handles all edge cases.

**Fix options:**

| Option | Effort | Effect |
|--------|--------|--------|
| **A. Use `spawn('cmd', ['/c', 'start', '', url])`** | ~5 min | Works on all Windows shells. The empty string argument is needed because `start` treats the first quoted arg as a window title. |
| ~~**B. Add `open` npm package**~~ | ~10 min | **CHOSEN.** Battle-tested cross-platform. Zero platform branching needed. Node 20+ required (upgraded). |

**Recommend B** — `open` is a single dependency that eliminates all platform edge cases. The `restart-and-open` API route also uses platform-specific commands (line 82) and would benefit.

### 4. README missing Windows prerequisites

**Current state** (line 139):
```
Prerequisites: Node.js 20+, Anthropic API key.
```

**Fix:** Add Windows callout. ~15 min. Content:

```markdown
**Windows users:** Native addon compilation requires Visual Studio Build Tools.
Install with: `npm install -g windows-build-tools` (from an elevated PowerShell),
or install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)
with the "Desktop development with C++" workload.
```

### 5. sql.js (WASM) fallback when better-sqlite3 fails

**Current state:** The app hard-crashes if `better-sqlite3` can't load.

**Feasibility assessment:**
- `sqlite-adapter.ts` uses synchronous `better-sqlite3` API: `db.prepare().run()`, `db.prepare().get()`, `db.prepare().all()`, `db.pragma()`, `db.transaction()`
- `sql.js` is async and has a different API shape
- The `DbAdapter` interface is already an abstraction layer — adding a sql.js implementation behind it is architecturally clean
- **Effort:** ~4 hours for a sql.js adapter + fallback logic in `lib/db/index.ts`
- **Trade-off:** sql.js is ~2-5x slower for DB operations and loads a ~1.5MB WASM binary. Acceptable for a local-first desktop app.

**Recommend: defer.** If #1 is fixed properly (prebuilt binaries), sql.js becomes unnecessary. Only implement if prebuilt binaries can't cover all targets (e.g., ARM Linux, exotic architectures).

## Prioritized Plan

| Priority | Issue | Fix | Effort | Impact |
|----------|-------|-----|--------|--------|
| **P0** | #3 Browser open | Add `open` npm package | 10 min | Eliminates crash on Windows first-run |
| **P0** | #4 README | Add Windows prerequisites | 15 min | Unblocks informed users immediately |
| **P1** | #1+#2 Native addon | Fix postinstall + test on Windows | 30 min–2 hr | Eliminates the #1 abandonment cause |
| **P2** | #5 sql.js fallback | Defer unless #1 can't be fixed | 4 hr | Safety net for edge cases |

## Implementation Sequence

1. Fix `openBrowser()` in `bin/dossier.mjs` (P0, can ship immediately)
2. Update README with Windows prerequisites (P0, can ship immediately)
3. Fix `postinstall.mjs` to reliably fetch prebuilt binaries (P1, needs Windows testing)
4. Assess sql.js fallback if #3 proves fragile across platforms (P2, defer)

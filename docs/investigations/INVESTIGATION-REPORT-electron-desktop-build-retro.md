# Investigation Report: Electron Desktop Build Retrospective

**Date:** 2026-03-03  
**Scope:** Electron desktop wrap for Dossier — packaged app crashes or shuts down immediately on open.  
**Trigger:** User: "This was built wrong" / "do a retro on this build"

---

## 1. Rules Audit

- [ ] **Rule:** "Always conduct recommended or required testing yourself" (user_rules)
- [ ] **Compliance:** Electron packaged app was not validated end-to-end on a clean launch (from DMG or after install) before claiming success; no automated or manual test captured stdout/stderr from the spawned Next.js process or the main process on failure.

- [ ] **Rule:** "NEVER claim work is complete or finished without actual verification" (user_rules)
- [ ] **Compliance:** Multiple iterations (asar unpack, extraResource, ignore filter, timeout increase) were made without a single verified run of the built DMG from a user-like scenario (double-click from DMG or from Applications).

- [ ] **Rule:** "Proceed without confirmation for routine code edits; User Approval Only When: A change would add or remove end user-facing functionality" (user_rules)
- [ ] **Compliance:** The switch from DMG to ZIP was a product/distribution choice made without user approval; reverted only after user requested DMG.

---

## 2. Expected Behavior

- [ ] **Expected behavior:** User can download a DMG, install Dossier, open the app, and use it with the same behavior as `pnpm run dossier` (Next.js UI, SQLite in `~/.dossier`, config from `~/.dossier/config`). The app stays open and shows the Dossier UI; it does not exit immediately or after a loading bar.
- [ ] **Source:** Plan "Electron Desktop Wrap for Dossier"; docs/SYSTEM_ARCHITECTURE.md (self-deployable, single-user, SQLite in ~/.dossier).

**Expected behavior established:** YES

---

## 3. Root Cause Investigation

### 3.1 Data Flow (Packaged App Launch)

- **Intended flow:** Double-click Dossier.app → Electron main (app.asar) → `createWindow()` (shows "Starting Dossier...") → `startNextServer(appPath)` → resolve `standaloneDir` via `process.resourcesPath` + `"standalone"` → `existsSync(serverJs)` → spawn Node with `server.js` (cwd = standaloneDir) → `waitForServer()` → load `http://localhost:${serverPort}` in window.
- **Data directory:** Main process calls `getDataDir()` (env `DOSSIER_DATA_DIR` or `$HOME/.dossier`), `loadConfig()`, passes `DOSSIER_DATA_DIR` into the spawned server’s env. Server and CLI both expect `~/.dossier`; when launched from GUI, `HOME` can be unset or different, leading to a different or relative data dir if not overridden.
- **Failure point:** Any thrown exception in `main()` before or during `startNextServer()` is caught by `main().catch(err => { console.error(err); app.quit(); })`. When the app is launched from Finder/Dock, there is no visible console; the user sees no window or a brief window and then immediate quit.

### 3.2 Uncertainty Register

**KNOWN:**

- Packaged app layout: `Contents/Resources/` contains `app.asar`, `standalone/`, `static/`, `public/` (verified via `ls` after `electron-forge package`).
- `process.resourcesPath` in Electron points to `Contents/Resources` for the running app.
- `electron/main.ts` uses `join(process.resourcesPath, "standalone")` when `app.isPackaged`; `server.js` is at `standalone/server.js`.
- No tests exist for the Electron main process or for "packaged app launches and stays open."
- The plan specified reusing `bin/dossier.mjs` logic; the implementation reimplemented that logic in TypeScript instead of invoking the same script, and added a dependency on system `node` for the spawned process.

**UNKNOWN:**

- Exact reason the app "shuts down right away" on the user’s machine (no crash dump or logs collected from a production-like run).
- Whether `process.resourcesPath` or `existsSync(serverJs)` behaves differently when the app is run from a mounted DMG vs from /Applications, or under quarantine.
- Whether `HOME` (and thus `getDataDir()` → `~/.dossier`) is set when the app is launched from the GUI on the user’s environment.

**ASSUMED:**

- That the same layout and paths that work in `out/Dossier-darwin-arm64/` after `package` also hold for the app inside the DMG and after copy to Applications (no verification was done from DMG launch).
- That increasing timeout and showing a "Starting Dossier..." window would be sufficient to surface or avoid the immediate quit (no verification after those changes).

**Status:** BLOCKED (root cause of "shuts down right away" not confirmed with evidence)

### 3.3 Bug Verification

**Bug verified:** YES — user reports app shuts down right away; previously reported loading bar halfway then close. Both indicate the process exits without a stable UI.

### 3.4 Technical Investigation

1. **Data flow:** Failure is in the startup path (main process or spawn). No logs or crash reports were collected from a real user launch; all reasoning is from code and local `package` layout.
2. **Logical errors:**  
   - Window is created and a data URL is loaded, then `startNextServer()` is awaited. If `startNextServer()` throws (e.g. `existsSync(serverJs)` false, or `waitForServer` timeout), the catch block runs and calls `app.quit()`. User sees no error because there is no visible dialog or log.  
   - Single-instance lock: if `requestSingleInstanceLock()` returns false, the app quits immediately with no UI — consistent with "shuts down right away."
3. **Design issues:**  
   - **No observable failure path:** All failures result in `app.quit()` and optional `console.error`; GUI users never see why the app closed.  
   - **No validation of packaged layout at runtime:** The code does not log or assert `process.resourcesPath`, `standaloneDir`, or `existsSync(serverJs)` in packaged mode, so we cannot confirm the DMG contains the expected paths.  
   - **Dependency on system Node:** The design spawns the system `node` to run `server.js`. If `node` is not on PATH or not where we expect (e.g. when launched from Finder), spawn can fail and trigger the error handler and quit.  
   - **Build vs. runtime not validated:** The plan assumed "run packaged app and smoke test"; no such test was run and no artifact (e.g. script or CI step) was added to run the packaged app and assert it stays up or capture logs.

### 3.5 Root Cause Analysis

#### 3.5.1 Behaviors

- [ ] **Current behavior:** Packaged Dossier app (DMG) opens and then shuts down immediately (or shows a loading bar partway then closes). No error is shown to the user.
- [ ] **Source:** User report; [electron/main.ts](electron/main.ts) (main().catch → app.quit(); no user-visible error).
- [ ] **Expected behavior:** App opens, shows "Starting Dossier..." then the Dossier UI, and remains open using `~/.dossier` for data.

#### 3.5.2 Root Causes (5-why style)

1. **Why does the user see no explanation when the app closes?**  
   Because all failure paths call `app.quit()` and at most `console.error`, and the app is not run from a terminal, so nothing is visible.

2. **Why do we rely on console only?**  
   Because the implementation never added a user-visible error path (dialog or in-window message) for startup failures in the packaged app.

3. **Why might the app exit immediately?**  
   Possibilities: (a) `requestSingleInstanceLock()` is false (another instance or stale lock); (b) `existsSync(serverJs)` is false in the packaged environment (wrong path or DMG layout); (c) spawn of `node` fails (node not found or permission); (d) uncaught exception before window is shown (e.g. in loadConfig/getDataDir if HOME is missing). No logs or run from DMG were collected to distinguish.

4. **Why don’t we know which of these it is?**  
   Because there was no step to run the built DMG (or installed app), capture main-process and child-process stdout/stderr, or add a minimal "failure dialog" to show the error before quitting.

5. **Why was that step skipped?**  
   Because the build was considered done after `electron-forge make` succeeded and the DMG was produced, without a defined success criterion of "launch from DMG and see the app stay open" and without automating or manually performing that check.

**Root cause (concise):** The Electron desktop build was shipped without validating that the packaged app actually starts and stays open when launched like a normal user (e.g. from DMG). There is no user-visible error reporting and no collected logs, so the exact failure mode on the user’s machine is unknown; the implementation allows multiple failure paths (single-instance, missing server path, missing Node, or exception) that all result in silent or near-silent exit.

**Alternatives considered:**  
- Adding a dialog or in-window error before `app.quit()` so the user at least sees the error.  
- Writing main-process and child-process logs to a file in `~/.dossier/logs/` when packaged, so support can ask for the log.  
- Running the packaged app from the command line (e.g. `open out/make/Dossier-*.dmg` then launch the app from Terminal with stdout/stderr visible) as a mandatory step before calling the build done.  
- Using a single executable that embeds Node (e.g. pkg or a bundled Node binary) instead of depending on system Node, to avoid "node not found" when PATH is minimal in GUI launches.

---

## 4. Test-Driven Development

### 4.1 Current Test Coverage

- [ ] **Test name:** N/A  
- [ ] **Current result:** No tests exist for the Electron main process, for the packaged app, or for the startup sequence (createWindow, startNextServer, waitForServer).  
- [ ] **Test coverage:** 0% for Electron and packaged flow.  
- [ ] **Test issues:** "No tests for Electron or packaged app launch."

**Test applicable:** YES — tests should be added to encode expected behavior (e.g. main process resolves standalone path correctly when packaged; spawn env includes DOSSIER_DATA_DIR; on failure, user sees an error instead of silent quit).

**Recommendation:**  
- Add a small integration or E2E step: build the app, run the packaged executable (e.g. `out/.../Dossier.app/Contents/MacOS/Dossier`) with env that redirects stdout/stderr to a file, then assert the process stays alive for N seconds and/or that a request to localhost:PORT returns 200.  
- Optionally add unit tests for `getDataDir()`, path resolution for `standaloneDir` when `app.isPackaged` is true (e.g. mock `process.resourcesPath`), and that a failure in `startNextServer` does not call `app.quit()` without first showing an error (e.g. via a test double for app/dialog).

---

## 5. Report Summary

| Item | Content |
|------|--------|
| **Expected behavior** | User installs Dossier from DMG, opens the app, sees "Starting Dossier..." then the Dossier UI; app uses `~/.dossier` and does not exit immediately. |
| **Current behavior** | Packaged app opens then shuts down right away (or loading bar partway then close); no error message is shown. |
| **Data flow** | Electron main → createWindow → startNextServer (process.resourcesPath + "standalone", spawn node server.js) → waitForServer → loadURL. Failure at any step leads to catch → app.quit() with no user-visible error. |
| **Root cause** | Build was not validated by actually running the packaged app (e.g. from DMG) and capturing logs; there is no user-visible error path and no runtime check that the packaged layout is correct; multiple possible failure modes (single-instance, path, Node not found, exception) all result in silent or near-silent exit. |
| **Source** | [electron/main.ts](electron/main.ts), [forge.config.js](forge.config.js), plan Electron Desktop Wrap, user reports. |
| **Tests** | None today. Recommended: (1) integration/E2E that runs the packaged app and asserts it stays up and serves HTTP; (2) unit tests for path resolution and error handling so failures are visible to the user instead of calling app.quit() only. |

---

## 6. Recommendations for Fixer

1. **Make failure visible**  
   Before any `app.quit()` after a startup failure, show the error in a dialog or in the window (e.g. the existing data-URL error page) and ensure the window is visible and not closed for a few seconds so the user can read it.

2. **Confirm path and layout at runtime (packaged only)**  
   When `app.isPackaged` is true, log or assert `process.resourcesPath`, `standaloneDir`, and `existsSync(serverJs)` to a file in `getDataDir()` (e.g. `~/.dossier/logs/electron-main.log`) so that if the app exits, the last run’s paths and existence check are available.

3. **Validate from DMG (or installed app) before marking done**  
   Add a step (manual or scripted): build DMG, mount it, copy app to Applications (or run from DMM), launch the app from Terminal (e.g. `./Dossier.app/Contents/MacOS/Dossier 2>&1 | tee ~/dossier-launch.log`) and confirm the window appears and the app does not exit; if it does, use the log and any new error dialog to identify the cause.

4. **Optionally harden Node resolution**  
   If logs show "node not found" or spawn errors when launched from GUI, consider bundling a Node binary for the target platform or falling back to a fixed list of paths and showing a clear error if Node is not found instead of exiting silently.

5. **Add a minimal test**  
   At least one test that runs the packaged main process (or a mock) and verifies that on `existsSync(serverJs) === false` the code does not call `app.quit()` without first setting an error message the user can see (e.g. via a stub for `app` and `BrowserWindow`).

# agentic-flow install notes

When you run `pnpm install` (or `npm install`), you may see warnings related to **agentic-flow** and **agentdb**. This doc explains what they mean and whether they affect Dossier.

## What you see

1. **Lockfile is up to date / Already up to date**  
   Normal. No action needed.

2. **Failed to create bin at … agentdb-cli.js**  
   pnpm tries to create the `agentdb` binary from agentic-flow’s `package.json` bin entry, but the target file doesn’t exist in the published package:
   - Declared: `agentic-flow/dist/agentdb/cli/agentdb-cli.js`
   - In the alpha package, `dist/agentdb/` exists but there is **no** `cli/agentdb-cli.js` (only `index.js`, `validate-frontier.cjs`, etc.).

3. **Ignored build scripts: agentic-flow**  
   pnpm does not run lifecycle scripts (e.g. `postinstall`) by default. You can run `pnpm approve-builds`, approve agentic-flow, then `pnpm install` again if you need those scripts.

## Does Dossier need agentdb or those scripts?

**No.** Dossier uses agentic-flow only as a **library**:

- It resolves `agentic-flow/agentic-flow/dist/` and uses:
  - `dist/utils/agentLoader.js` (e.g. `getAgent()` for agent definitions)
  - SDK `query()` for execution (see `lib/orchestration/agentic-flow-client.ts`).
- Dossier does **not** call the `agentdb` CLI or any agentic-flow bin.
- The core app works without the agentdb binary and without running agentic-flow’s build scripts.

## Upstream context

- **Missing agentdb CLI path:** The alpha package’s `package.json` points the `agentdb` bin at a path that isn’t present in the published tarball. That’s an **agentic-flow packaging/layout issue** (wrong path or file not shipped). Repo: [ruvnet/agentic-flow](https://github.com/ruvnet/agentic-flow).
- **AgentDB runtime patch (#111):** [Issue #111](https://github.com/ruvnet/agentic-flow/issues/111) is about the **runtime patch** looking for the wrong controller path (`src/controllers/AgentController.js` vs v2’s `lib/controllers/BaseController.js`). It’s a different path bug (patch target, not the CLI). It doesn’t block Dossier’s use of the programmatic API or the current library usage.

## Summary

| Item                    | Affects Dossier? | Action |
|-------------------------|------------------|--------|
| agentdb bin missing     | No               | Ignore unless you need the agentdb CLI. Upstream fix: ship the file or correct the bin path. |
| agentic-flow build scripts skipped | No        | Ignore for Dossier. Use `pnpm approve-builds` only if you need agentic-flow’s postinstall for something else. |

Use **pnpm install** (or npm) as in the [install docs](README.md#install-and-run). The warnings do not affect the core Dossier app.

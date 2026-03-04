# Runnable Project Scaffold Strategy

## Purpose

Ensure every project has a runnable root (package.json, framework config, app entry) so that after cards are built, the user can run the app with `npm install && npm run dev` (or equivalent). The scaffold is produced at **project finalization** time, not at build time.

## Principle

**Scaffold is part of project finalization.** When the user clicks "Finalize Project", Dossier creates six project-wide documents in parallel. One of them is the "project-scaffold" artifact: the LLM generates the minimal set of root files (package.json, configs, app entry) based on the project's tech_stack and deployment. Dossier parses that artifact and writes the files to the repo clone. Folder structure (empty dirs + .gitkeep) remains the responsibility of the architectural summary and `createRootFoldersInRepo`; scaffold file contents are written by `writeScaffoldFilesToRepo`.

## Separation of concerns

- **createRootFoldersInRepo**: Creates root folders from the architectural summary (## Root folder structure). Only directories and .gitkeep. No scaffold file contents.
- **writeScaffoldFilesToRepo**: Writes scaffold file contents (package.json, next.config.js, src/app/page.tsx, etc.). Skips files that already exist. Does not create the folder list; folder structure is created first by createRootFoldersInRepo.

## Flow

1. User clicks "Finalize Project".
2. runFinalizeMultiStep runs 6 LLM calls in parallel (architectural-summary, data-contracts, domain-summaries, user-workflow-summaries, design-system, **project-scaffold**).
3. Artifacts are persisted. Finalize handler fetches artifacts, parses root folders from architectural-summary, gets project-scaffold content.
4. ensureClone; then createRootFoldersInRepo (if rootFolders.length > 0); then parseScaffoldFiles(project-scaffold content); then writeScaffoldFilesToRepo (if scaffoldFiles.length > 0); then pushBranch once.
5. project.finalized_at is set.

## Output format (project-scaffold artifact)

The LLM generates markdown with one block per file:

```markdown
### FILE: <relative-path>
\`\`\`
<file contents>
\`\`\`
```

parseScaffoldFiles extracts path + content pairs. writeScaffoldFilesToRepo writes each file (creating parent dirs as needed), skips existing files, commits with message "chore: add project scaffold (Dossier finalization)".

## Edge cases

- **No repo connected**: Skip both folder and scaffold writing (same as today).
- **Existing repo with package.json**: writeScaffoldFilesToRepo skips files that already exist; no overwrite.
- **Scaffold LLM fails**: project-scaffold artifact may be missing or empty; parseScaffoldFiles returns []; writeScaffoldFilesToRepo is no-op. Finalization still succeeds; repo may not be runnable until the build agent adds root files (graceful degradation).

## Manual verification (four stacks)

To confirm an appropriate root and root files for **four different stacks** (e.g. Next.js, Vite+React, Python/FastAPI, Node/Express):

1. **Prerequisites**: Planning LLM enabled (`ANTHROPIC_API_KEY` set, `NEXT_PUBLIC_PLANNING_LLM_ENABLED` not false). A real repo URL set on each project (e.g. same test repo for all four; each project gets its own clone under `~/.dossier/repos/<projectId>/`).
2. **Seed projects**: Create four projects with different `tech_stack` values and connect the repo. Seed each with at least one workflow (so "Approve Project" is visible). Example script: `npx tsx scripts/seed-four-stacks.ts`.
3. **Browser**: Open the app (e.g. http://127.0.0.1:3000). Via Settings → Projects, select each project and click "Approve Project". Wait for finalize to complete (toast: "Approved: N context documents created").
4. **Inspect clones**: For each project ID, check `~/.dossier/repos/<projectId>/` for stack-appropriate root files (e.g. Next.js: `package.json`, `next.config.js`, app entry; Vite: `package.json`, `vite.config.ts`; FastAPI: `requirements.txt`, `main.py` or similar; Express: `package.json`, `src/index.ts` or similar).

If finalize runs without a live LLM (or with mocks), the required context documents are not created and the handler returns 502; no clone or scaffold is written. Run the manual test in an environment where the planning LLM can complete all six doc steps.

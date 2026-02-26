# Releases, Packages, and Installability Strategy

Single recommendation for GitHub releases, package publishing, and installability. Aligns with [ADR 0007 (production release gate)](../adr/0007-release-gate-auth-rls-required.md): alpha/pre-release distribution is allowed; production deployment is not until auth and RLS are in place.

---

## 1. Summary

| Area | Do now | After release gate (auth + RLS) |
|------|--------|----------------------------------|
| **GitHub Release** | Yes — tag (e.g. `v0.1.0`), release notes, mark **Pre-release** | Keep; mark as full release when production-ready |
| **Package (npm)** | Yes — publish with `--tag alpha`; one-line platform caveat in README | Move to `latest` when ready; consider multi-platform builds |
| **GitHub Packages (npm)** | Optional — use only if you prefer registry on GitHub | Same |
| **Installability** | Yes — `npx dossier-agentic-product-planner-builder` and global install; document platform and “local only” | Same UX; drop alpha caveats when releasing to `latest` |

---

## 2. GitHub Releases

**Purpose:** Versioned milestones, changelog, and a clear “try this version” (clone at tag or download assets).

- **Do now**
  - Create a release for the current version (e.g. `v0.1.0`).
  - Mark it **Pre-release** (or “Alpha”) so it does not imply production-ready.
  - Add short release notes (e.g. “Alpha – local/dev use. Auth and RLS not yet in place; see ADR 0007.”).
- **Later**
  - When auth and RLS are done and you consider the app production-ready, create a release without the Pre-release flag and reference the release checklist.

**Note:** ADR 0007 gates *production deployment*, not having a GitHub release. Pre-release releases are explicitly allowed.

---

## 3. Package publishing: npm vs GitHub Packages

**npm (public registry)**  
- **Recommendation:** Primary option. Simple, familiar (`npx dossier-agentic-product-planner-builder`, `npm install -g dossier-agentic-product-planner-builder`).  
- Publish with a dist-tag so alpha doesn’t become default: `pnpm publish --tag alpha`.  
- Add `repository` (and optional `publishConfig`) to `package.json` so the npm page links to the repo.

**GitHub Packages (npm on GitHub)**  
- Use if you want the package to live in the same org/repo and use GitHub’s registry only.  
- Requires auth for install (`npm login --registry=https://npm.pkg.github.com`) and possibly scope (e.g. `@org/dossier`).  
- **Recommendation:** Optional. Prefer public npm for discoverability and lower friction unless you have a reason to keep the package private or GitHub-only.

**Practical choice:** Publish to **npm with `--tag alpha`** now. Revisit GitHub Packages only if you need private or org-scoped distribution.

---

## 4. Installability

**Current state:** `bin/dossier.mjs` is already written for install-and-run: it expects a pre-built `.next/standalone` and uses `~/.dossier` for data. `package.json` has `bin` and `files` set.

**User experience:**

- **Run without installing:** `npx dossier-agentic-product-planner-builder` (or `npx dossier-agentic-product-planner-builder@alpha` to pin alpha).
- **Global install:** `pnpm add -g dossier-agentic-product-planner-builder` or `npm install -g dossier-agentic-product-planner-builder`, then run `dossier`.

**Publish flow:**

1. Run `pnpm run build` (or `npm run build`) so `.next/standalone` (and static/public) is up to date.
2. Publish: `pnpm publish --tag alpha`.
3. The published tarball includes `bin/`, `.next/standalone/`, `.next/static/`, `public/` (per `files` in `package.json`).

**Platform caveat:** The app depends on **better-sqlite3** (native). The standalone is built on the machine that runs the publish (e.g. macOS). Other platforms may need to clone and build from source until you add multi-platform builds. In README, add one line, e.g.:

- *“Pre-built npm package is built for [e.g. macOS]. On other platforms, clone the repo and run `pnpm install && pnpm run build && pnpm run dossier`.”*

---

## 5. README and expectations

Add or keep these points in the main README:

- **Quickstart:** Include the one-command option: *“Run without cloning: `npx dossier-agentic-product-planner-builder` (Node 18+). First run creates `~/.dossier`.”*
- **Alpha / local only:** *“Current releases are alpha. For local and development use only. Authentication and RLS are not yet in place (see ADR 0007).”*
- **Platform:** One sentence on which OS the pre-built package is built for and what to do on others (clone and build).

---

## 6. Checklist

**Before first GitHub release**

- [ ] Tag: `git tag v0.1.0` (or current version).
- [ ] Create GitHub release from tag; mark as Pre-release; add short notes and alpha/local-only caveat.

**Before first npm publish**

- [ ] `package.json`: add `"repository": "https://github.com/rwliebs/Dossier"` (or your repo URL).
- [ ] Optional: `"publishConfig": { "access": "public" }` if the package is scoped (e.g. `@org/dossier`).
- [ ] `pnpm run build` (or `npm run build`).
- [ ] `pnpm publish --tag alpha` (or `pnpm run release:alpha`).
- [ ] README: quickstart with `npx dossier-agentic-product-planner-builder`, alpha/local-only note, platform caveat.

**After auth + RLS (ADR 0007)**

- [ ] Release checklist and sign-off for auth/RLS.
- [ ] Publish to `latest` when ready: `pnpm publish` (or `pnpm publish --tag latest`).
- [ ] Optionally: GitHub release without Pre-release flag and multi-platform build/publish if desired.

---

## 7. References

- [ADR 0007 — Production release gate (auth + RLS)](../adr/0007-release-gate-auth-rls-required.md)
- [ADR 0004 — No-auth-first MVP](../adr/0004-no-auth-first-mvp.md)
- `bin/dossier.mjs` — CLI entry; expects `.next/standalone` and uses `~/.dossier`.

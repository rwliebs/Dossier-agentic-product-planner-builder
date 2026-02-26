# Releases, Packages, and Installability Strategy

Single recommendation for GitHub releases, package publishing, and installability. Aligns with [ADR 0007 (production release gate)](../adr/0007-release-gate-auth-rls-required.md): alpha/pre-release distribution is allowed; production deployment is not until auth and RLS are in place.

---

## 1. Summary

| Area | Do now | After release gate (auth + RLS) |
|------|--------|----------------------------------|
| **GitHub Release** | Yes — tag (e.g. `v0.1.0`), release notes, mark **Pre-release** | Keep; mark as full release when production-ready |
| **Package** | **GitHub Packages** (primary) — scoped `@rwliebs/dossier-agentic-product-planner-builder`; publish with GitHub PAT | Same |
| **npm (public)** | Not used (npm requires 2FA for publish; we use GitHub Packages instead) | — |
| **Installability** | Yes — `npx @rwliebs/dossier-agentic-product-planner-builder`; users auth to GitHub Packages once | Same UX; drop alpha caveats when ready |

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

## 3. Package publishing: GitHub Packages

**We use GitHub Packages** (not the public npm registry). npm now requires 2FA for publishing; GitHub Packages uses a GitHub PAT (no 2FA required for publish).

- **Package name:** `@rwliebs/dossier-agentic-product-planner-builder` (scoped; required by GitHub Packages).
- **Config:** `package.json` has `publishConfig.registry: "https://npm.pkg.github.com/"`. Repo `.npmrc` has `@rwliebs:registry=https://npm.pkg.github.com` so installs resolve from GitHub.
- **Publish auth:** Add `//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT` to `~/.npmrc` (or project `.npmrc` and do not commit it). PAT needs `write:packages` (and `read:packages` if you install from GitHub Packages). Then run `pnpm run release:alpha`.
- **Install:** Users point `@rwliebs` at GitHub (clone has `.npmrc`) and [authenticate](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages) with a PAT that has `read:packages`. Then `npx @rwliebs/dossier-agentic-product-planner-builder`.

---

## 4. Installability

**Current state:** `bin/dossier.mjs` is already written for install-and-run: it expects a pre-built `.next/standalone` and uses `~/.dossier` for data. `package.json` has `bin` and `files` set.

**User experience:**

- **Run without installing:** `npx @rwliebs/dossier-agentic-product-planner-builder` (after one-time auth to GitHub Packages).
- **Global install:** `pnpm add -g @rwliebs/dossier-agentic-product-planner-builder` (with registry/auth for `@rwliebs`), then run `dossier`.

**Publish flow:**

1. Auth: ensure `~/.npmrc` (or local `.npmrc`, not committed) contains `//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT` (PAT with `write:packages`).
2. Run `pnpm run build` so `.next/standalone` is up to date.
3. Publish: `pnpm publish --tag alpha --no-git-checks` (or `pnpm run release:alpha`). Package goes to GitHub Packages.
4. The published tarball includes `bin/`, `.next/standalone/`, `.next/static/`, `public/` (per `files` in `package.json`).

**Platform caveat:** The app depends on **better-sqlite3** (native). The standalone is built on the machine that runs the publish (e.g. macOS). Other platforms may need to clone and build from source until you add multi-platform builds. In README, add one line, e.g.:

- *“Pre-built npm package is built for [e.g. macOS]. On other platforms, clone the repo and run `pnpm install && pnpm run build && pnpm run dossier`.”*

---

## 5. README and expectations

Add or keep these points in the main README:

- **Quickstart:** Include the one-command option: *“Run without cloning: `npx @rwliebs/dossier-agentic-product-planner-builder` (Node 18+). First run creates `~/.dossier`.”*
- **Alpha / local only:** *“Current releases are alpha. For local and development use only. Authentication and RLS are not yet in place (see ADR 0007).”*
- **Platform:** One sentence on which OS the pre-built package is built for and what to do on others (clone and build).

---

## 6. Checklist

**Before first GitHub release**

- [ ] Tag: `git tag v0.1.0` (or current version).
- [ ] Create GitHub release from tag; mark as Pre-release; add short notes and alpha/local-only caveat.

**Before first publish (GitHub Packages)**

- [x] `package.json`: `name` is `@rwliebs/dossier-agentic-product-planner-builder`, `repository` and `publishConfig.registry` set.
- [x] `.npmrc` in repo: `@rwliebs:registry=https://npm.pkg.github.com`.
- [ ] Add to `~/.npmrc` (do not commit): `//npm.pkg.github.com/:_authToken=GITHUB_PAT` (PAT with `write:packages`).
- [ ] `pnpm run release:alpha` (build + publish to GitHub Packages).
- [ ] README: quickstart with `npx @rwliebs/dossier-agentic-product-planner-builder`, alpha/local-only note, platform caveat.

**After auth + RLS (ADR 0007)**

- [ ] Release checklist and sign-off for auth/RLS.
- [ ] Publish to `latest` when ready: `pnpm publish` (still to GitHub Packages).
- [ ] Optionally: GitHub release without Pre-release flag and multi-platform build/publish if desired.

---

## 7. References

- [ADR 0007 — Production release gate (auth + RLS)](../adr/0007-release-gate-auth-rls-required.md)
- [ADR 0004 — No-auth-first MVP](../adr/0004-no-auth-first-mvp.md)
- `bin/dossier.mjs` — CLI entry; expects `.next/standalone` and uses `~/.dossier`.

# Desktop build and distribution

How to produce signed/notarized Windows (.exe), Linux (.deb), and macOS (.dmg) installers and enable auto-updates from GitHub Releases.

## Artifact formats

| Platform | Format | Use |
|----------|--------|-----|
| Windows | `Dossier Setup X.Y.Z.exe` (+ `.nupkg`, `RELEASES`) | Direct download, Squirrel auto-update |
| Linux | `Dossier_X.Y.Z_arch.deb` | Direct download, .deb-based stores |
| macOS | `Dossier-X.Y.Z-arm64.dmg` (or x64) | Direct download, notarized for Gatekeeper |

Version `X.Y.Z` comes from `package.json` `version`.

## Auto-update

The app uses [update.electronjs.org](https://update.electronjs.org) (free for open-source apps on GitHub). When you create a **GitHub Release** with the built installers:

- **macOS / Windows:** The app checks for updates at startup and periodically; users get a prompt to restart when a new version is available.
- **Linux:** .deb installs do not use the same auto-update feed; users upgrade via re-download or package manager.

**To enable auto-update:** Push a version tag (e.g. `v0.5.3`) so the workflow runs. The **release** job creates a GitHub Release and attaches the Windows, Linux, and macOS artifacts. Ensure `package.json` `version` matches the tag (e.g. `0.5.3` for tag `v0.5.3`).

## Signing and notarization

When the following **repository secrets** are set, the CI build signs and (on macOS) notarizes the installers. If secrets are missing, builds still run but produce **unsigned** installers (fine for local/testing; stores and auto-update on macOS prefer signed/notarized).

### macOS (code sign + notarization)

Choose **one** of these two methods.

**Option A – App-specific password (simplest)**

| Secret | Description |
|--------|-------------|
| `APPLE_ID` | Apple ID email (Developer account) |
| `APPLE_APP_SPECIFIC_PASSWORD` | [App-specific password](https://support.apple.com/en-us/HT204397) (not your normal Apple ID password) |
| `APPLE_TEAM_ID` | Team ID from [developer.apple.com/account](https://developer.apple.com/account/#/membership) |

**Option B – App Store Connect API key**

| Secret | Description |
|--------|-------------|
| `APPLE_API_KEY_ID` | 10-character Key ID (e.g. from `AuthKey_XXXXXXXXXX.p8`) |
| `APPLE_API_ISSUER` | Issuer UUID from App Store Connect → Users and Access → Integrations → API Keys |
| `APPLE_API_KEY_BASE64` | Base64-encoded contents of your `.p8` key file (download from App Store Connect; only available once) |

The workflow decodes this to a temporary file and sets `APPLE_API_KEY_PATH` before the build. Do not commit the `.p8` file.

### Windows (Squirrel code signing)

Windows signing is **active**. Set the following repository secrets and the CI build will sign the installer automatically. When the secrets are absent, an unsigned installer is produced (acceptable for development and testing).

| Secret | Description |
|--------|-------------|
| `WINDOWS_CERTIFICATE_PFX_BASE64` | Base64-encoded `.pfx` (or `.p12`) code signing certificate |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the PFX |

The workflow decodes the base64 to `cert.pfx` on the Windows runner before building. Do not commit `cert.pfx`; it is in `.gitignore`.

### Local signed builds

- **macOS:** Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (or the API key vars) in your environment and run `pnpm run electron:make` on a Mac. Signing and notarization run automatically when credentials are present.
- **Windows:** Put your `.pfx` at the repo root as `cert.pfx` (or set `certificateFile` in `forge.config.js`), set `WINDOWS_CERTIFICATE_PASSWORD`, and run `pnpm run electron:make` on Windows. For CI we use base64 + secret instead of a committed file.

## Building on demand (CI)

The **Desktop installers** workflow builds all three platforms and (on tag push) creates a GitHub Release.

1. **Trigger**
   - **Manual:** Actions → **Desktop installers** → **Run workflow**. Uses the version in `package.json` on the chosen branch. Artifacts are uploaded; no release is created.
   - **Release (auto-update):** Bump `version` in `package.json`, commit, push, then push a tag `v*` (e.g. `v0.5.3`). The workflow builds, uploads artifacts, and the **release** job creates a GitHub Release with all installers attached.

2. **Download**
   - Open the run → **Summary** → **Artifacts**.
   - Download `dossier-windows-<version>`, `dossier-linux-<version>`, `dossier-macos-<version>`.
   - For tagged runs, the same files are attached to the GitHub Release.

3. **Use for stores**
   - Attach the installer files from the release (or artifacts) to your web site or app store submission. Signing/notarization is applied when the secrets above are set.

## Building locally

Electron Forge only produces installers for the **current OS** (no cross-compilation).

- **macOS:** `pnpm run electron:make` → `out/make/*.dmg` (signed/notarized if Apple env vars are set).
- **Windows:** Same command on Windows → `out/make/*.exe` (+ Squirrel artifacts; signed if `cert.pfx` and password are set).
- **Linux:** Same command on Linux → `out/make/*.deb`.

To get all three from one place, use the CI workflow.

## Configuration

- **Version:** Set in root `package.json` → `version`. Must match the release tag (e.g. `0.5.3` for `v0.5.3`) for auto-update and clear artifact naming.
- **Makers / publishers:** Defined in `forge.config.js` (DMG, Squirrel, deb; GitHub publisher for releases). To add more makers (e.g. Linux AppImage), add the Forge maker and any required tools in CI.
- **Repo for auto-update:** In `electron/main.ts`, `updateElectronApp({ repo: "rwliebs/Dossier" })`. Change if the repo owner/name changes.

## See also

- [ADR 0014: Releases and distribution](../adr/0014-releases-and-distribution.md)
- [Electron Forge: Code signing (macOS)](https://www.electronforge.io/guides/code-signing/code-signing-macos)
- [Electron Forge: Auto update](https://www.electronforge.io/advanced/auto-update)
- [update.electronjs.org](https://update.electronjs.org)

/**
 * Client-side helpers for starting GitHub OAuth (browser only).
 */

export const GITHUB_OAUTH_REOPEN_KEYS_SESSION = "dossier_reopen_api_keys";

/** Dispatched on `window` after OAuth returns to `/` so the sidebar can open the repo picker (unless keys dialog reopen). */
export const GITHUB_OAUTH_REPO_PICKER_EVENT = "dossier-open-github-repo-picker";

/** Relative URL for GET /api/github/oauth/start with optional loopback port override. */
export function githubOAuthStartHref(returnTo: string): string {
  const params = new URLSearchParams({ return_to: returnTo });
  if (typeof window !== "undefined" && window.location.port) {
    params.set("port", window.location.port);
  }
  return `/api/github/oauth/start?${params.toString()}`;
}

import { resolveGitHubToken } from "@/lib/github/resolve-github-token";
import { json, internalError } from "@/lib/api/response-helpers";

/** GET /api/github/user — { login } using resolved token */
export async function GET() {
  try {
    const token = resolveGitHubToken();
    if (!token) {
      return json({ error: "GitHub token not configured." }, 503);
    }

    const res = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        return json({ error: "GitHub token is invalid or expired." }, 401);
      }
      return json({ error: "Failed to load GitHub user." }, 502);
    }

    const data = (await res.json()) as { login?: string };
    if (!data.login) {
      return json({ error: "Unexpected GitHub response." }, 502);
    }

    return json({ login: data.login });
  } catch (err) {
    console.error("GET /api/github/user error:", err);
    return internalError();
  }
}

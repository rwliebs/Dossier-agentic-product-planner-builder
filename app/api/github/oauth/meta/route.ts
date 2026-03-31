import { NextResponse } from "next/server";
import { githubOAuthClientId } from "@/lib/github/oauth-server";

/** GET — whether OAuth client id is configured (no secrets exposed). */
export async function GET() {
  const configured = Boolean(githubOAuthClientId());
  return NextResponse.json({ oauthConfigured: configured });
}

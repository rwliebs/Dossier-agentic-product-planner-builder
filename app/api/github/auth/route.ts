import { removeConfigKeys, writeConfigFile } from "@/lib/config/data-dir";
import { DOSSIER_GITHUB_IGNORE_ENV_KEY } from "@/lib/github/resolve-github-token";
import { json } from "@/lib/api/response-helpers";

/** DELETE / POST — clear stored token; if env still has GITHUB_TOKEN, ignore it until reconnect */
export async function DELETE() {
  return disconnect();
}

export async function POST() {
  return disconnect();
}

async function disconnect(): Promise<Response> {
  try {
    removeConfigKeys(["GITHUB_TOKEN"]);
    writeConfigFile({ [DOSSIER_GITHUB_IGNORE_ENV_KEY]: "1" });
    return json({ ok: true });
  } catch (e) {
    console.error("GitHub disconnect (config) failed:", e);
    return json({ error: "Failed to update stored credentials." }, 500);
  }
}

/**
 * Runs planning via Claude Agent SDK query().
 * This is the execution path for all credentialed users (API key or OAuth token).
 * Tools: WebSearch always; Read/Glob/Grep only when a repo is connected (cwd provided).
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Read-only tools for planning: inspect repo, no writes or Bash. */
const REPO_TOOLS = ["Read", "Glob", "Grep"] as const;
const WEB_TOOLS = ["WebSearch"] as const;

function getPlanningTools(cwd?: string): string[] {
  return cwd ? [...REPO_TOOLS, ...WEB_TOOLS] : [...WEB_TOOLS];
}

/** Distinguishes API keys (sk-ant-api*) from OAuth tokens (sk-ant-oat*). */
function isApiKey(credential: string): boolean {
  return credential.startsWith("sk-ant-") && !credential.startsWith("sk-ant-oat");
}

export interface PlanningSdkOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  signal?: AbortSignal;
  /** When set, Read/Glob/Grep run in this directory (e.g. cloned repo path). */
  cwd?: string;
  /**
   * Explicit API key or OAuth token. When set, passed via options.env so the SDK
   * uses it instead of process.env. Required when caller passes apiKey override.
   */
  apiKey?: string;
}

/**
 * Build env override so the SDK uses the given credential instead of process.env.
 * API keys use ANTHROPIC_API_KEY; OAuth tokens use CLAUDE_CODE_OAUTH_TOKEN + ANTHROPIC_AUTH_TOKEN.
 */
function buildEnvWithCredential(credential: string): Record<string, string | undefined> {
  const base = { ...process.env } as Record<string, string | undefined>;
  if (isApiKey(credential)) {
    base.ANTHROPIC_API_KEY = credential;
  } else {
    base.CLAUDE_CODE_OAUTH_TOKEN = credential;
    base.ANTHROPIC_AUTH_TOKEN = credential;
  }
  return base;
}

/**
 * Returns a promise that rejects with AbortError when the signal fires.
 * If already aborted, rejects immediately.
 */
function abortPromise(signal?: AbortSignal): Promise<never> | null {
  if (!signal) return null;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

/**
 * Runs a planning session via Agent SDK and returns accumulated assistant text.
 * Planner can use Read/Glob/Grep when repo is connected; WebSearch always available.
 * When apiKey is provided, it is passed via options.env; otherwise the SDK uses process.env.
 *
 * Each iterator.next() is raced against the abort signal so that a stalled SDK
 * stream is interrupted immediately when the caller's timeout fires.
 */
export async function runPlanningQuery(options: PlanningSdkOptions): Promise<string> {
  const model = options.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
  const tools = getPlanningTools(options.cwd);
  const result = query({
    prompt: options.userMessage,
    options: {
      systemPrompt: options.systemPrompt,
      model,
      permissionMode: "default",
      tools,
      allowedTools: tools,
      persistSession: false,
      ...(options.cwd && { cwd: options.cwd }),
      ...(options.apiKey && { env: buildEnvWithCredential(options.apiKey) }),
    },
  });

  const abort = abortPromise(options.signal);
  const iter = result[Symbol.asyncIterator]();
  let output = "";

  while (true) {
    const next = iter.next();
    const step = abort ? await Promise.race([next, abort]) : await next;
    if (step.done) break;
    const m = step.value as { type?: string; message?: { content?: Array<{ type?: string; text?: string }> } };
    if (m.type === "assistant" && m.message?.content) {
      const chunk =
        m.message.content
          ?.map((c) => (c.type === "text" ? c.text : ""))
          .join("") || "";
      output += chunk;
    }
  }
  return output;
}

/**
 * Returns an async iterable of text chunks from the Agent SDK for planning streaming.
 * Yields text deltas for parseActionsFromStream.
 *
 * Each iterator.next() is raced against the abort signal so a stalled SDK
 * stream is interrupted immediately when the caller's idle timer fires.
 */
export async function* streamPlanningQuery(options: PlanningSdkOptions): AsyncGenerator<string> {
  const model = options.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
  const tools = getPlanningTools(options.cwd);
  const result = query({
    prompt: options.userMessage,
    options: {
      systemPrompt: options.systemPrompt,
      model,
      permissionMode: "default",
      tools,
      allowedTools: tools,
      persistSession: false,
      ...(options.cwd && { cwd: options.cwd }),
      ...(options.apiKey && { env: buildEnvWithCredential(options.apiKey) }),
    },
  });

  const abort = abortPromise(options.signal);
  const iter = result[Symbol.asyncIterator]();

  while (true) {
    const next = iter.next();
    const step = abort ? await Promise.race([next, abort]) : await next;
    if (step.done) break;
    const m = step.value as { type?: string; message?: { content?: Array<{ type?: string; text?: string }> } };
    if (m.type === "assistant" && m.message?.content) {
      const chunk =
        m.message.content
          ?.map((c) => (c.type === "text" ? c.text : ""))
          .join("") || "";
      if (chunk) yield chunk;
    }
  }
}

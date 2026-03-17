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

export interface PlanningSdkOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  signal?: AbortSignal;
  /** When set, Read/Glob/Grep run in this directory (e.g. cloned repo path). */
  cwd?: string;
}

/**
 * Runs a planning session via Agent SDK and returns accumulated assistant text.
 * Planner can use Read/Glob/Grep when repo is connected; WebSearch always available.
 * Caller must ensure process.env has ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN set.
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
    },
  });

  let output = "";
  for await (const msg of result) {
    if (options.signal?.aborted) break;
    const m = msg as { type?: string; message?: { content?: Array<{ type?: string; text?: string }> } };
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
    },
  });

  for await (const msg of result) {
    if (options.signal?.aborted) break;
    const m = msg as { type?: string; message?: { content?: Array<{ type?: string; text?: string }> } };
    if (m.type === "assistant" && m.message?.content) {
      const chunk =
        m.message.content
          ?.map((c) => (c.type === "text" ? c.text : ""))
          .join("") || "";
      if (chunk) yield chunk;
    }
  }
}

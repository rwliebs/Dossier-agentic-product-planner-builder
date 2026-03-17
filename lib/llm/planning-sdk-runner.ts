/**
 * Runs planning via Claude Agent SDK query() with read-only tools (Read, Glob, Grep).
 * Currently unused: planning uses Messages API with ANTHROPIC_API_KEY only (OAuth token
 * is no longer provided). Kept for possible future use (e.g. SDK path with API key).
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Read-only tools for planning: inspect repo, no writes or Bash. */
const PLANNING_TOOLS = ["Read", "Glob", "Grep"] as const;

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
 * Planner can use Read/Glob/Grep to inspect the repo; we parse the final JSON from text.
 * Caller must ensure process.env has ANTHROPIC_API_KEY set (SDK uses it).
 */
export async function runPlanningQuery(options: PlanningSdkOptions): Promise<string> {
  const model = options.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
  const result = query({
    prompt: options.userMessage,
    options: {
      systemPrompt: options.systemPrompt,
      model,
      permissionMode: "default",
      tools: [...PLANNING_TOOLS],
      allowedTools: [...PLANNING_TOOLS],
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
 * Yields the same shape as Messages API stream (text deltas) for parseActionsFromStream.
 */
export async function* streamPlanningQuery(options: PlanningSdkOptions): AsyncGenerator<string> {
  const model = options.model ?? process.env.PLANNING_LLM_MODEL ?? DEFAULT_MODEL;
  const result = query({
    prompt: options.userMessage,
    options: {
      systemPrompt: options.systemPrompt,
      model,
      permissionMode: "default",
      tools: [...PLANNING_TOOLS],
      allowedTools: [...PLANNING_TOOLS],
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

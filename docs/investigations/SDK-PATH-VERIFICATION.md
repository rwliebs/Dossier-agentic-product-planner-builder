# SDK path verification: does the Claude Agent SDK use `options.cwd` for file operations?

**Conclusion: YES.** The SDK is designed to use `options.cwd` as the working directory for the session, and it passes that value to the spawned Claude Code process. File operations (Read/Write/Edit/Bash) run by that process should therefore occur in the directory we pass.

---

## 1. SDK types (sdk.d.ts)

**Query options (Options):**
```ts
/**
 * Current working directory for the session. Defaults to `process.cwd()`.
 */
cwd?: string;
```
Source: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (lines 517–520).

**System init message sent to Claude Code process:**
```ts
export declare type SDKSystemMessage = {
    type: 'system';
    subtype: 'init';
    // ...
    cwd: string;   // ← cwd is sent to the process
    tools: string[];
    // ...
};
```
Source: `sdk.d.ts` (lines 1645–1672).

So the session’s `cwd` is included in the init message that the SDK sends to the Claude Code backend.

---

## 2. Bundled implementation (sdk.mjs)

In the minified bundle:

- Options are passed through with `cwd` (e.g. `cwd:w`, `cwd:$`) into the session/query config.
- When spawning the Claude Code process, the spawn options include `cwd`:  
  `Yq(X,Y,{cwd:$,stdio:["pipe","pipe",G],...})`  
  So the child process is started with that working directory.
- The pattern `process(Q){let{command:X,args:Y,cwd:$,env:W,signal:J}=Q` shows that the internal “process” call receives and uses `cwd` from the options.

So the SDK does pass `options.cwd` into the spawned process as its working directory.

---

## 3. Public documentation

Anthropic’s docs describe the option as:

- **“Working directory for file operations”**
- **“Set the cwd parameter to control which directory the agent operates in”**

So the documented contract is that `cwd` is the directory the agent operates in (and where file operations happen).

---

## 4. How Dossier uses it

We pass an absolute path from the assignment:

```ts
runQueryAndCollectOutput(taskDescription, {
  systemPrompt: agent.systemPrompt,
  cwd: payload.worktree_path || undefined,  // absolute path from DB
  onStream: (chunk: string) => { ... },
})
```

And in `query()`:

```ts
const result = query({
  prompt: taskDescription,
  options: {
    // ...
    cwd: options.cwd,
    // ...
  },
});
```

So we pass `worktree_path` (absolute) as `options.cwd`. The SDK is designed to use that as the session and process working directory.

---

## 5. Implication for the “no changes” bug

Given this verification:

- The SDK path is correct: the agent is intended to run (and perform file operations) in the `cwd` we pass, i.e. our worktree path.
- So the cause of “No changes to commit” is **not** “the SDK writes somewhere else than our worktree.”
- Other possibilities to investigate:
  1. **Path resolution:** We already store and pass an absolute path; still worth confirming at runtime that the value passed to `query({ options: { cwd } })` is exactly the worktree path (e.g. via logging).
  2. **Timing:** The completion callback runs after the SDK promise resolves; the subprocess may have exited but file system or git might not yet see all writes (e.g. if the process was killed or there was a race). Less likely but possible.
  3. **Claude Code process behavior:** The binary might change directory after init, or use a sandbox; that would be a bug or undocumented behavior in the SDK/Claude Code, not in our use of `cwd`.
  4. **First run vs current repo state:** The “no changes” event was for the first run. The current repo state (with `Header.tsx` / `HeroSection.tsx` and git status showing changes) could be from the **second** (rebuild) run. So the first run might genuinely have written nothing to the worktree (e.g. agent error or different cwd in that run). Adding diagnostic logging (worktree path, `git status` output, and assignment_id) when auto-commit runs will clarify this.

---

## 6. Recommended next steps for the fixer

1. **Treat SDK path as verified:** No need to change how we pass `cwd`; the SDK is designed to use it for the session and the spawned process.
2. **Add diagnostics:** In `performAutoCommit`, log the exact `worktreePath` used, the raw `git status --porcelain --untracked-files=all` output (or line count), and `assignment_id`, so the next “no changes” occurrence can be tied to a specific run and path.
3. **Revisit timing/ordering:** If logs show the same path and branch but empty status, consider whether the completion handler runs before the subprocess has fully exited or before the OS has flushed writes (and whether a short delay or re-check is appropriate).
4. **Keep execution timeout and stale-run recovery** as separate improvements so that stuck runs don’t stay “building” indefinitely.

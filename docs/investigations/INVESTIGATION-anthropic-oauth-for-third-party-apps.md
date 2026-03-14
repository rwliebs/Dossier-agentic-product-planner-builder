# Investigation: Anthropic OAuth for third-party applications

**Date:** 2026-03  
**Question:** Can Dossier implement a proper OAuth 2.0 flow (redirect → consent → callback → token exchange) so users "Sign in with Anthropic" instead of pasting a token?

**Scope:** Only official Anthropic sources. No guessing.

---

## Official sources checked

### 1. Claude API overview (docs.anthropic.com)

- **Authentication:** Documented method is **API key only**.
- **Headers:** `x-api-key` (required), `anthropic-version`, `content-type`.
- **Getting keys:** "Generate API keys in Account Settings" (Console).
- **OAuth:** Not mentioned. No authorization URL, token URL, client registration, or redirect flow.

### 2. Claude Code authentication (docs.anthropic.com – Claude Code IAM)

- **Claude Code (CLI):** "Run `claude` in your terminal. On first launch, Claude Code opens a browser window for you to log in." Login URL can be copied to clipboard.
- **Auth types:** Cloud providers (Bedrock, Vertex, Foundry), Claude Console, Claude for Teams/Enterprise, Claude Pro/Max (Claude.ai account).
- **Credential storage:** e.g. macOS Keychain; `apiKeyHelper` for custom scripts.
- **OAuth for third-party apps:** Not documented. The browser login is for the first-party Claude Code app, not for embedding in other apps.

### 3. Anthropic support (support.anthropic.com)

- **OAuth:** No support article describing a public OAuth 2.0 flow for third-party apps.
- **SSO:** Docs cover domain capture / SSO for organizations, not "Sign in with Anthropic" for arbitrary apps.
- **API security:** API key best practices only.

### 4. docs.anthropic.com paths

- `/en/docs/build-with-claude/oauth` → **404 Not Found** (no OAuth page in public docs).

---

## Conclusion

- **Public Claude API docs** describe **API key** as the only documented authentication method. There is **no published** OAuth 2.0 flow (authorization endpoint, token endpoint, client registration, redirect_uri, scopes) for third-party applications.
- **Claude Code** has its own browser login for the CLI; that flow is not specified as a reusable OAuth flow for other apps.
- **We do not have** official documentation for: `client_id`, `redirect_uri`, authorization URL, token URL, or code exchange for a third-party app like Dossier.

Therefore we **do not implement** an OAuth redirect/callback flow based on guesswork or non-authoritative sources. The current supported path remains: user obtains a token via `claude setup-token` (or equivalent), pastes it into Dossier setup; we store it and set `CLAUDE_CODE_OAUTH_TOKEN` for the Agent SDK.

If Anthropic later publishes OAuth 2.0 documentation for third-party apps (endpoints, registration, scopes), this doc should be updated and the flow implemented from that documentation only.

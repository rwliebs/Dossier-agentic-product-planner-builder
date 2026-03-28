'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { KeyRound, Github, Loader2, CheckCircle2 } from 'lucide-react';
import { githubOAuthStartHref } from '@/lib/github/oauth-client';

const GITHUB_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'GitHub authorization was cancelled. Try again when you’re ready.',
  invalid_state: 'Something went wrong with the sign-in flow. Try Connect GitHub again.',
  server: 'Could not finish GitHub sign-in. Try again or use a personal access token.',
  misconfigured: 'GitHub OAuth is not configured. Add GITHUB_OAUTH_CLIENT_ID for development.',
};

export default function SetupPage() {
  const router = useRouter();
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);
  const [oauthSuccessMessage, setOauthSuccessMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [configPath, setConfigPath] = useState('~/.dossier/config');
  const [anthropicViaCli, setAnthropicViaCli] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [showPat, setShowPat] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refreshStatus = useCallback(() => {
    return fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data: { needsSetup: boolean; missingKeys: string[]; configPath?: string; anthropicViaCli?: boolean }) => {
        if (!data.needsSetup) {
          router.replace('/');
          return;
        }
        setMissingKeys(data.missingKeys ?? []);
        if (data.configPath) setConfigPath(data.configPath);
        setAnthropicViaCli(!!data.anthropicViaCli);
      })
      .catch(() => setMissingKeys(['ANTHROPIC_API_KEY', 'GITHUB_TOKEN']));
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const ghErr = params.get('github_error');
    if (ghErr) {
      setOauthBanner(GITHUB_ERROR_MESSAGES[ghErr] ?? 'GitHub sign-in failed. Try again.');
      const url = new URL(window.location.href);
      url.searchParams.delete('github_error');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
    const ghOk = params.get('github_oauth');
    if (ghOk === 'success') {
      setOauthBanner(null);
      setOauthSuccessMessage('GitHub connected. Finish setup below if you still need your Anthropic key.');
      const url = new URL(window.location.href);
      url.searchParams.delete('github_oauth');
      window.history.replaceState({}, '', url.pathname + url.search);
    }

    fetch('/api/github/oauth/meta')
      .then((r) => r.json())
      .then((m: { oauthConfigured?: boolean }) => setOauthConfigured(!!m.oauthConfigured))
      .catch(() => setOauthConfigured(false));

    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!missingKeys.includes('GITHUB_TOKEN')) {
      fetch('/api/github/user')
        .then((r) => r.json())
        .then((d: { login?: string }) => {
          if (d.login) setGithubLogin(d.login);
          else setGithubLogin(null);
        })
        .catch(() => setGithubLogin(null));
    } else {
      setGithubLogin(null);
    }
  }, [missingKeys]);

  const needsAnthropic =
    (missingKeys.includes('ANTHROPIC_API_KEY') || missingKeys.length === 0) && !anthropicViaCli;
  const needsGithub = missingKeys.includes('GITHUB_TOKEN') || missingKeys.length === 0;
  const hasGithubConfigured = !missingKeys.includes('GITHUB_TOKEN');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: anthropicApiKey.trim() || undefined,
          githubToken: githubToken.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to save');
        return;
      }
      if (data.configPath) setConfigPath(data.configPath);
      setSuccess(true);
      setTimeout(() => router.replace('/'), 1500);
    } catch {
      setError('Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const startConnectGitHub = () => {
    window.location.href = githubOAuthStartHref('/setup');
  };

  const handleDisconnectGithub = async () => {
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/github/auth', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Failed to disconnect');
        return;
      }
      await refreshStatus();
    } catch {
      setError('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const submitDisabled =
    loading ||
    success ||
    (needsAnthropic && !anthropicViaCli && !anthropicApiKey.trim()) ||
    (needsGithub && !githubToken.trim());

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Dossier Setup</h1>
          <p className="text-muted-foreground text-sm">
            Enter your API keys to get started. Keys are saved to{' '}
            <code className="text-xs bg-muted px-1 rounded">{configPath}</code> with{' '}
            <code className="text-xs bg-muted px-1 rounded">repo</code> scope for GitHub.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {oauthSuccessMessage && (
            <div className="rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm text-green-800 dark:text-green-200">
              {oauthSuccessMessage}
            </div>
          )}
          {oauthBanner && (
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {oauthBanner}
            </div>
          )}
          {anthropicViaCli && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500" />
              <span>Claude Code CLI detected — Max subscription will be used for planning.</span>
            </div>
          )}
          {needsAnthropic && (
            <div className="space-y-2">
              <label htmlFor="anthropic" className="text-sm font-medium flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Anthropic API Key
              </label>
              <input
                id="anthropic"
                type="password"
                placeholder="sk-ant-..."
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Get yours at{' '}
                <a
                  href="https://console.anthropic.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  console.anthropic.com
                </a>
                . If you use Claude Code, we’ll use your installed CLI config when no key is set.
              </p>
            </div>
          )}

          {needsGithub && (
            <div className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Github className="h-4 w-4" />
                GitHub
              </div>
              <p className="text-xs text-muted-foreground">
                You’ll return here after authorizing on GitHub. We request the{' '}
                <code className="bg-muted px-1 rounded">repo</code> scope. Revoke anytime under{' '}
                <a
                  href="https://github.com/settings/applications"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Authorized OAuth apps
                </a>
                .
              </p>
              <Button
                type="button"
                className="w-full"
                disabled={oauthConfigured === false}
                onClick={startConnectGitHub}
              >
                <Github className="h-4 w-4 mr-2" />
                Connect GitHub
              </Button>
              {oauthConfigured === false && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  For local development, set <code className="bg-muted px-1 rounded">GITHUB_OAUTH_CLIENT_ID</code> in{' '}
                  <code className="bg-muted px-1 rounded">.env.local</code> and register a{' '}
                  <a
                    href="https://github.com/settings/applications/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    GitHub OAuth app
                  </a>{' '}
                  with callback <code className="bg-muted px-1 rounded">http://127.0.0.1:PORT/api/github/oauth/callback</code>.
                </p>
              )}
              <button
                type="button"
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => setShowPat(!showPat)}
              >
                {showPat ? 'Hide' : 'Use a personal access token instead'}
              </button>
              {showPat && (
                <div className="space-y-2 pt-1">
                  <label htmlFor="github" className="text-sm font-medium flex items-center gap-2">
                    <Github className="h-4 w-4" />
                    GitHub token (PAT)
                  </label>
                  <input
                    id="github"
                    type="password"
                    placeholder="ghp_..."
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Create at{' '}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      github.com/settings/tokens
                    </a>{' '}
                    with <code className="bg-muted px-1 rounded">repo</code> scope.
                  </p>
                </div>
              )}
            </div>
          )}

          {!needsGithub && hasGithubConfigured && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                GitHub connected
                {githubLogin && (
                  <span className="font-normal text-muted-foreground">
                    (@{githubLogin})
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" size="sm" onClick={startConnectGitHub}>
                  Reconnect GitHub
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disconnecting}
                  onClick={handleDisconnectGithub}
                >
                  {disconnecting ? 'Removing…' : 'Remove stored token'}
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {success && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500 animate-in fade-in duration-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Keys saved. Redirecting&hellip;</span>
            </div>
          )}

          <Button type="submit" disabled={submitDisabled} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving&hellip;
              </>
            ) : (
              'Save and continue'
            )}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          Keys are stored locally and never sent to any server except Anthropic and GitHub.
        </p>
      </div>
    </div>
  );
}

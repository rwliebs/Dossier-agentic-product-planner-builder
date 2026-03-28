'use client';

import { useState, useEffect } from 'react';
import { KeyRound, Github, Loader2, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  githubOAuthStartHref,
  GITHUB_OAUTH_REOPEN_KEYS_SESSION,
} from '@/lib/github/oauth-client';

interface ApiKeysDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SetupStatus {
  needsSetup: boolean;
  missingKeys: string[];
  configPath?: string;
  anthropicViaCli?: boolean;
}

export function ApiKeysDialog({ open, onOpenChange }: ApiKeysDialogProps) {
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [configPath, setConfigPath] = useState('~/.dossier/config');
  const [anthropicViaCli, setAnthropicViaCli] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [showPat, setShowPat] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatusLoading(true);
    setError(null);
    setSuccess(false);
    setAnthropicApiKey('');
    setGithubToken('');
    setShowPat(false);
    setGithubLogin(null);

    Promise.all([
      fetch('/api/setup/status').then((r) => r.json()) as Promise<SetupStatus>,
      fetch('/api/github/oauth/meta').then((r) => r.json()) as Promise<{ oauthConfigured?: boolean }>,
    ])
      .then(([data, meta]) => {
        setMissingKeys(data.missingKeys ?? []);
        if (data.configPath) setConfigPath(data.configPath);
        setAnthropicViaCli(!!data.anthropicViaCli);
        setOauthConfigured(meta.oauthConfigured ?? false);
      })
      .catch(() => {
        setMissingKeys(['ANTHROPIC_API_KEY', 'GITHUB_TOKEN']);
        setOauthConfigured(false);
      })
      .finally(() => setStatusLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || statusLoading) return;
    const hasGithub = !missingKeys.includes('GITHUB_TOKEN');
    if (!hasGithub) {
      setGithubLogin(null);
      return;
    }
    fetch('/api/github/user')
      .then((r) => r.json())
      .then((d: { login?: string }) => {
        if (d.login) setGithubLogin(d.login);
      })
      .catch(() => {});
  }, [open, statusLoading, missingKeys]);

  const hasAnthropic = !missingKeys.includes('ANTHROPIC_API_KEY');
  const hasGithub = !missingKeys.includes('GITHUB_TOKEN');

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
      const st = await fetch('/api/setup/status').then((r) => r.json()) as SetupStatus;
      setMissingKeys(st.missingKeys ?? []);
      setTimeout(() => {
        onOpenChange(false);
      }, 800);
    } catch {
      setError('Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const startConnectGitHub = () => {
    try {
      sessionStorage.setItem(GITHUB_OAUTH_REOPEN_KEYS_SESSION, '1');
    } catch {
      /* ignore */
    }
    window.location.href = githubOAuthStartHref('/');
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
      const st = await fetch('/api/setup/status').then((r) => r.json()) as SetupStatus;
      setMissingKeys(st.missingKeys ?? []);
      setGithubLogin(null);
    } catch {
      setError('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const canSubmit =
    (anthropicApiKey.trim().length > 0 || githubToken.trim().length > 0) &&
    !loading &&
    !success;

  const oauthDevHint =
    oauthConfigured === false ? (
      <p className="text-xs text-amber-600 dark:text-amber-500">
        Set <code className="bg-muted px-1 rounded">GITHUB_OAUTH_CLIENT_ID</code> in{' '}
        <code className="bg-muted px-1 rounded">.env.local</code> to enable Connect GitHub.
      </p>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!loading}>
        <DialogHeader>
          <DialogTitle>API Keys &amp; Tokens</DialogTitle>
          <DialogDescription>
            Keys are saved to{' '}
            <code className="text-xs bg-muted px-1 rounded">{configPath}</code>.
            Leave a field blank to keep the current value.
          </DialogDescription>
        </DialogHeader>

        {statusLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="api-keys-anthropic" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Anthropic API Key
                {hasAnthropic && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {anthropicViaCli ? '(via Claude CLI)' : '(configured)'}
                  </span>
                )}
              </Label>
              <Input
                id="api-keys-anthropic"
                type="password"
                placeholder={hasAnthropic ? '••••••••' : 'sk-ant-...'}
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                autoComplete="off"
                className="font-mono text-sm"
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
              </p>
            </div>

            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4" />
                <span className="text-sm font-medium">GitHub</span>
                {hasGithub && (
                  <span className="text-xs font-normal text-muted-foreground">(configured)</span>
                )}
              </div>
              {hasGithub && githubLogin && (
                <p className="text-xs text-muted-foreground">
                  Signed in as <span className="font-mono text-foreground">@{githubLogin}</span>
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="default"
                  className="w-full"
                  disabled={oauthConfigured === false}
                  onClick={startConnectGitHub}
                >
                  <Github className="h-4 w-4 mr-2" />
                  {hasGithub ? 'Reconnect GitHub' : 'Connect GitHub'}
                </Button>
                {oauthDevHint}
                {hasGithub && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={disconnecting}
                    onClick={handleDisconnectGithub}
                  >
                    {disconnecting ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        Removing…
                      </>
                    ) : (
                      'Remove stored GitHub token'
                    )}
                  </Button>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => setShowPat(!showPat)}
              >
                {showPat ? 'Hide' : 'Use a personal access token instead'}
              </button>
              {showPat && (
                <div className="space-y-2 pt-1">
                  <Label htmlFor="api-keys-github">GitHub PAT</Label>
                  <Input
                    id="api-keys-github"
                    type="password"
                    placeholder={hasGithub ? '••••••••' : 'ghp_...'}
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    autoComplete="off"
                    className="font-mono text-sm"
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
                    with <code className="bg-muted px-1 rounded">repo</code> scope. Stored in{' '}
                    <code className="bg-muted px-1 rounded">GITHUB_TOKEN</code> like an OAuth token.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {success && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                <span>Keys saved.</span>
              </div>
            )}

            <DialogFooter showCloseButton={false}>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        <p className="text-xs text-muted-foreground">
          Keys are stored locally and never sent to any server except Anthropic
          and GitHub.
        </p>
      </DialogContent>
    </Dialog>
  );
}

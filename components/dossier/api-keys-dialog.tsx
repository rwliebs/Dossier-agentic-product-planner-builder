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

interface ApiKeysDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SetupStatus {
  needsSetup: boolean;
  missingKeys: string[];
  configPath?: string;
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

  useEffect(() => {
    if (!open) return;
    setStatusLoading(true);
    setError(null);
    setSuccess(false);
    setAnthropicApiKey('');
    setGithubToken('');
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data: SetupStatus) => {
        setMissingKeys(data.missingKeys ?? []);
        if (data.configPath) setConfigPath(data.configPath);
      })
      .catch(() => setMissingKeys(['ANTHROPIC_API_KEY', 'GITHUB_TOKEN']))
      .finally(() => setStatusLoading(false));
  }, [open]);

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
      setTimeout(() => {
        onOpenChange(false);
      }, 800);
    } catch {
      setError('Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    (anthropicApiKey.trim().length > 0 || githubToken.trim().length > 0) &&
    !loading &&
    !success;

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
                    (configured)
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

            <div className="space-y-2">
              <Label htmlFor="api-keys-github" className="flex items-center gap-2">
                <Github className="h-4 w-4" />
                GitHub Token
                {hasGithub && (
                  <span className="text-xs font-normal text-muted-foreground">
                    (configured)
                  </span>
                )}
              </Label>
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
                with <code className="bg-muted px-1 rounded">repo</code> scope
              </p>
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

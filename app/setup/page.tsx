'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { KeyRound, Github, Loader2 } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data: { needsSetup: boolean; missingKeys: string[] }) => {
        if (!data.needsSetup) {
          router.replace('/');
          return;
        }
        setMissingKeys(data.missingKeys ?? []);
      })
      .catch(() => setMissingKeys(['ANTHROPIC_API_KEY', 'GITHUB_TOKEN']));
  }, [router]);

  const needsAnthropic = missingKeys.includes('ANTHROPIC_API_KEY') || missingKeys.length === 0;
  const needsGithub = missingKeys.includes('GITHUB_TOKEN') || missingKeys.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: anthropicApiKey || undefined,
          githubToken: githubToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to save');
        return;
      }
      setSuccess(true);
    } catch {
      setError('Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Dossier Setup</h1>
          <p className="text-muted-foreground text-sm">
            Enter your API keys to enable planning and build features. Keys are saved to{' '}
            <code className="text-xs bg-muted px-1 rounded">.env.local</code> in your project.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
                Required for planning LLM and claude-flow builds.
              </p>
            </div>
          )}

          {needsGithub && (
            <div className="space-y-2">
              <label htmlFor="github" className="text-sm font-medium flex items-center gap-2">
                <Github className="h-4 w-4" />
                GitHub Token
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
                Required for pushing branches and creating PRs in your project repo.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {success && (
            <p className="text-sm text-green-600 dark:text-green-500">
              Keys saved. Restart the app (stop and run <code className="bg-muted px-1 rounded">npm run dev</code> again) for changes to take effect.
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || (!anthropicApiKey && !githubToken)}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save and continue'
            )}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          Keys are stored in <code className="bg-muted px-1 rounded">.env.local</code> and never
          sent to any server except Anthropic and GitHub.
        </p>
      </div>
    </div>
  );
}

import { execSync, spawn } from 'child_process';

/**
 * Every known way to open a URL in a browser, ordered by reliability per
 * platform.  `openBrowser` walks this list and stops at the first success.
 *
 * Windows:
 *   1. rundll32 url.dll,FileProtocolHandler <url>
 *      — Win32 API via system DLL, present since Windows 95.
 *        Does not depend on shell built-ins. Most reliable.
 *   2. start "" <url>  (via shell)
 *      — cmd.exe built-in.  Must run through shell, not spawned directly.
 *   3. explorer <url>
 *      — Windows Explorer handles URL protocol associations.
 *
 * macOS:
 *   1. open <url>        — ships with every macOS
 *   2. osascript          — AppleScript fallback
 *
 * Linux:
 *   1. xdg-open <url>               — freedesktop standard
 *   2. sensible-browser <url>        — Debian/Ubuntu
 *   3. wslview <url>                 — WSL → host Windows browser
 *   4. google-chrome / firefox / chromium-browser / chromium
 */
export function getBrowserCommands(
  url: string,
  platform: NodeJS.Platform = process.platform,
): Array<{ cmd: string; shell?: boolean }> {
  if (platform === 'win32') {
    return [
      { cmd: `rundll32 url.dll,FileProtocolHandler ${url}` },
      { cmd: `start "" "${url}"`, shell: true },
      { cmd: `explorer "${url}"` },
    ];
  }
  if (platform === 'darwin') {
    return [
      { cmd: `open "${url}"` },
      { cmd: `osascript -e 'open location "${url}"'` },
    ];
  }
  // Linux / FreeBSD / others
  return [
    { cmd: `xdg-open "${url}"` },
    { cmd: `sensible-browser "${url}"` },
    { cmd: `wslview "${url}"` },
    { cmd: `google-chrome "${url}"` },
    { cmd: `firefox "${url}"` },
    { cmd: `chromium-browser "${url}"` },
    { cmd: `chromium "${url}"` },
  ];
}

/**
 * Try to run a command synchronously.  Returns true if it exits without
 * throwing (exit code 0), false otherwise.
 */
function tryExec(cmd: string, shell: boolean): boolean {
  try {
    execSync(cmd, { stdio: 'ignore', timeout: 5000, shell });
    return true;
  } catch {
    return false;
  }
}

/**
 * Open `url` in the user's default browser.  Tries every known command for
 * the current platform in order and stops at the first one that works.
 *
 * Returns `true` if a browser was opened, `false` if all methods failed.
 */
export function openBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const commands = getBrowserCommands(url, platform);

  for (const { cmd, shell } of commands) {
    if (tryExec(cmd, shell ?? true)) return true;
  }

  console.error(
    `  Could not open browser. Please open this URL manually:\n  ${url}`,
  );
  return false;
}

import net from 'node:net';

/**
 * Check whether a single TCP port is free on 127.0.0.1 by briefly attempting
 * to listen on it.  Uses only the Node.js `net` module — no platform-specific
 * commands (e.g. `lsof`, `netstat`).
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Scan a range of ports and return the first free one, or `null` if every
 * port in the range is occupied.
 */
export async function findFreePort(
  start: number,
  end: number,
): Promise<number | null> {
  for (let port = start; port <= end; port++) {
    if (await isPortFree(port)) return port;
  }
  return null;
}

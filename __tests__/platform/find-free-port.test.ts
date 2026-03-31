import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import { isPortFree, findFreePort } from "@/lib/platform/find-free-port";

function occupyPort(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("isPortFree", () => {
  let servers: net.Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.map(closeServer));
    servers = [];
  });

  it("returns true for a port nobody is listening on", async () => {
    const result = await isPortFree(49_123);
    expect(result).toBe(true);
  });

  it("returns false for a port that is occupied", async () => {
    const server = await occupyPort(49_124);
    servers.push(server);

    const result = await isPortFree(49_124);
    expect(result).toBe(false);
  });

  it("correctly detects a port freed after being occupied", async () => {
    const server = await occupyPort(49_125);
    expect(await isPortFree(49_125)).toBe(false);

    await closeServer(server);

    expect(await isPortFree(49_125)).toBe(true);
  });
});

describe("findFreePort", () => {
  let servers: net.Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.map(closeServer));
    servers = [];
  });

  it("returns the first free port in the range", async () => {
    const port = await findFreePort(49_200, 49_205);
    expect(port).toBe(49_200);
  });

  it("skips occupied ports and returns the next free one", async () => {
    const s1 = await occupyPort(49_210);
    const s2 = await occupyPort(49_211);
    servers.push(s1, s2);

    const port = await findFreePort(49_210, 49_215);
    expect(port).toBe(49_212);
  });

  it("returns null when every port in the range is occupied", async () => {
    const s1 = await occupyPort(49_220);
    const s2 = await occupyPort(49_221);
    servers.push(s1, s2);

    const port = await findFreePort(49_220, 49_221);
    expect(port).toBeNull();
  });
});

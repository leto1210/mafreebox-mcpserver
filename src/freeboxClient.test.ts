import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FreeboxClient } from "./freeboxClient.js";

test("FreeboxClient authorizes, opens a session, and reuses it for authenticated calls", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;

  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "app-token", track_id: 42 } },
    { success: true, result: { logged_in: false, challenge: "challenge-123" } },
    { success: true, result: { session_token: "session-abc", permissions: { settings: true } } },
    { success: true, result: { status: "up", ipv4: "1.2.3.4" } },
    { success: true, result: { uptime: 12345 } },
  ];

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    const payload = responses.shift();
    if (!payload) {
      throw new Error("Unexpected fetch call");
    }

    return {
      status: 200,
      json: async () => payload,
    } as Response;
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.1.2",
      deviceName: "Claude AI",
    });

    const authorization = await client.startAuthorization();
    assert.equal(authorization.trackId, 42);

    const connection = await client.getConnectionStatus();
    assert.deepEqual(connection, { status: "up", ipv4: "1.2.3.4" });

    const system = await client.getSystemInfo();
    assert.deepEqual(system, { uptime: 12345 });

    assert.equal(fetchCalls.length, 6);
    assert.match(fetchCalls[0].url, /\/api_version$/);
    assert.match(fetchCalls[2].url, /\/api\/v8\/login\/$/);
    assert.match(fetchCalls[3].url, /\/api\/v8\/login\/session\/$/);

    const authHeaderFirstCall = fetchCalls[4].init?.headers as Record<string, string>;
    const authHeaderSecondCall = fetchCalls[5].init?.headers as Record<string, string>;
    assert.equal(authHeaderFirstCall["X-Fbx-App-Auth"], "session-abc");
    assert.equal(authHeaderSecondCall["X-Fbx-App-Auth"], "session-abc");
  } finally {
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
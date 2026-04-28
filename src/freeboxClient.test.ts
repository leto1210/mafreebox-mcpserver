import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FreeboxClient } from "./freeboxClient.js";

function createJsonResponse(payload: unknown, status = 200, contentType = "application/json"): Response {
  return {
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null),
    },
    text: async () => JSON.stringify(payload),
  } as Response;
}

function createTextResponse(body: string, status = 200, contentType = "text/html"): Response {
  return {
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null),
    },
    text: async () => body,
  } as Response;
}

test("FreeboxClient authorizes, opens a session, and reuses it for authenticated calls", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

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

    return createJsonResponse(payload);
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
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("FreeboxClient retries once when the session expires", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "app-token", track_id: 42 } },
    { success: true, result: { logged_in: false, challenge: "challenge-1" } },
    { success: true, result: { session_token: "session-1", permissions: { settings: true } } },
    { success: false, error_code: "auth_required", msg: "Session expired" },
    { success: true, result: { logged_in: false, challenge: "challenge-2" } },
    { success: true, result: { session_token: "session-2", permissions: { settings: true } } },
    { success: true, result: { uptime: 67890 } },
  ];

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    const payload = responses.shift();
    if (!payload) {
      throw new Error("Unexpected fetch call");
    }

    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.1.2",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();
    const system = await client.getSystemInfo();

    assert.deepEqual(system, { uptime: 67890 });
    assert.equal(fetchCalls.length, 8);

    const firstSystemHeaders = fetchCalls[4].init?.headers as Record<string, string>;
    const retriedSystemHeaders = fetchCalls[7].init?.headers as Record<string, string>;
    assert.equal(firstSystemHeaders["X-Fbx-App-Auth"], "session-1");
    assert.equal(retriedSystemHeaders["X-Fbx-App-Auth"], "session-2");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("FreeboxClient sends downloads/add as form-urlencoded", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "app-token", track_id: 42 } },
    { success: true, result: { logged_in: false, challenge: "challenge-1" } },
    { success: true, result: { session_token: "session-1", permissions: { downloader: true } } },
    { success: true, result: { id: 99 } },
  ];

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    const payload = responses.shift();
    if (!payload) {
      throw new Error("Unexpected fetch call");
    }

    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.1.2",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();
    const result = await client.addDownload("magnet:?xt=urn:btih:test");

    assert.deepEqual(result, { id: 99 });
    const requestHeaders = fetchCalls[4].init?.headers as Record<string, string>;
    assert.equal(requestHeaders["Content-Type"], "application/x-www-form-urlencoded");
    assert.equal(fetchCalls[4].init?.body, "download_url=magnet%3A%3Fxt%3Durn%3Abtih%3Atest");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("FreeboxClient fails clearly on non-JSON responses", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => createTextResponse("<html>proxy error</html>")) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.1.2",
      deviceName: "Claude AI",
    });

    await assert.rejects(() => client.discover(), /Réponse non-JSON/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("FreeboxClient reports request timeouts clearly", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  process.env.FREEBOX_REQUEST_TIMEOUT = "50";
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    throw abortError;
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.1.2",
      deviceName: "Claude AI",
    });

    await assert.rejects(() => client.discover(), /Délai dépassé après 50 ms/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    delete process.env.FREEBOX_REQUEST_TIMEOUT;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("FreeboxClient can reset local authorization state", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "app-token", track_id: 42 } },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) {
      throw new Error("Unexpected fetch call");
    }

    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.1.2",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();
    assert.equal(client.isAuthorized(), true);

    const reset = await client.resetAuthorization();

    assert.equal(client.isAuthorized(), false);
    assert.deepEqual(client.getPermissions(), {});
    assert.equal(reset.tokenFilePath, tokenFile);
    await assert.rejects(() => client.getSystemInfo(), /Aucun app_token/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("FreeboxClient surfaces actionable insufficient_rights errors", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "app-token", track_id: 42 } },
    { success: true, result: { logged_in: false, challenge: "challenge-1" } },
    { success: true, result: { session_token: "session-1", permissions: { settings: false } } },
    { success: false, error_code: "insufficient_rights", missing_right: "settings", msg: "Not enough rights" },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) {
      throw new Error("Unexpected fetch call");
    }

    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.1.2",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    await assert.rejects(
      () => client.setWifiEnabled(true),
      /Permission manquante : "Modification des réglages de la Freebox".*freebox_reset_authorization/
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("FreeboxClient detects capabilities for a Pop model", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    createJsonResponse({
      api_version: "8.0",
      box_model_name: "Freebox Pop",
      box_flavor: "light",
    })) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.1.2",
      deviceName: "Claude AI",
    });

    const capabilities = await client.getCapabilities();
    assert.equal(capabilities.model, "pop");
    assert.equal(capabilities.vmSupport, "none");
    assert.equal(capabilities.wifi7, true);
    assert.equal(client.supportsVm(capabilities), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("FreeboxClient caches capabilities for repeated calls", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    return createJsonResponse({
      api_version: "9.0",
      box_model_name: "Freebox v9",
      box_flavor: "full",
    });
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.1.2",
      deviceName: "Claude AI",
    });

    const first = await client.getCapabilities();
    const second = await client.getCapabilities();

    assert.equal(first.model, "ultra");
    assert.equal(second.model, "ultra");
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
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

// ─── Phase 4 Tests ──────────────────────────────────────────────────────

test("DHCP static leases: get, add, update, delete", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "token-1", track_id: 1 } },
    { success: true, result: { logged_in: false, challenge: "ch1" } },
    { success: true, result: { session_token: "sess1", permissions: { settings: true } } },
    // getDhcpStaticLeases
    { success: true, result: [{ id: "lease-1", mac: "AA:BB:CC:DD:EE:FF", ip: "192.168.1.50" }] },
    // addDhcpStaticLease
    { success: true, result: { id: "lease-2" } },
    // updateDhcpStaticLease
    { success: true, result: { id: "lease-1" } },
    // deleteDhcpStaticLease
    { success: true, result: {} },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) throw new Error("Unexpected fetch call");
    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.3.0",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    const leases = await client.getDhcpStaticLeases();
    assert.ok(Array.isArray(leases));
    assert.equal(leases[0].ip, "192.168.1.50");

    const added = await client.addDhcpStaticLease({ mac: "AA:BB:CC:DD:EE:11", ip: "192.168.1.60" });
    assert.ok(added);

    const updated = await client.updateDhcpStaticLease("lease-1", { ip: "192.168.1.51" });
    assert.ok(updated);

    const deleted = await client.deleteDhcpStaticLease("lease-1");
    assert.ok(deleted);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("WiFi guest networks: get, add, update, delete", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "token-2", track_id: 2 } },
    { success: true, result: { logged_in: false, challenge: "ch2" } },
    { success: true, result: { session_token: "sess2", permissions: { settings: true } } },
    // getWifiGuestNetworks
    { success: true, result: { guest: [{ id: "guest-1", ssid: "Guest WiFi" }] } },
    // addWifiGuestNetwork
    { success: true, result: { id: "guest-2" } },
    // updateWifiGuestNetwork
    { success: true, result: { id: "guest-1" } },
    // deleteWifiGuestNetwork
    { success: true, result: {} },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) throw new Error("Unexpected fetch call");
    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.3.0",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    const networks = await client.getWifiGuestNetworks();
    assert.ok(networks);

    const added = await client.addWifiGuestNetwork({ ssid: "Guest2" });
    assert.ok(added);

    const updated = await client.updateWifiGuestNetwork("guest-1", { ssid: "Guest WiFi Updated" });
    assert.ok(updated);

    const deleted = await client.deleteWifiGuestNetwork("guest-1");
    assert.ok(deleted);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("WiFi advanced: access points, stations, planning", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "token-3", track_id: 3 } },
    { success: true, result: { logged_in: false, challenge: "ch3" } },
    { success: true, result: { session_token: "sess3", permissions: { settings: true } } },
    // getWifiAccessPoints
    { success: true, result: [{ id: "ap-1", band: "2.4", ssid: "MainWiFi" }] },
    // getWifiStations
    { success: true, result: [{ mac: "AA:BB:CC:DD:EE:00", signal: -50, band: "2.4" }] },
    // getWifiPlanning
    { success: true, result: { enabled: true } },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) throw new Error("Unexpected fetch call");
    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.3.0",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    const aps = await client.getWifiAccessPoints();
    assert.ok(Array.isArray(aps));

    const stations = await client.getWifiStations();
    assert.ok(Array.isArray(stations));

    const planning = await client.getWifiPlanning();
    assert.ok(planning);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Download stats and details: stats, config, trackers, peers, files", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "token-4", track_id: 4 } },
    { success: true, result: { logged_in: false, challenge: "ch4" } },
    { success: true, result: { session_token: "sess4", permissions: { downloads: true } } },
    // getDownloadStats
    { success: true, result: { bytes_done: 1000000, nb_torrents: 2 } },
    // getDownloadsConfig
    { success: true, result: { path: "/Disque dur/Telecharges" } },
    // getDownloadTrackers
    { success: true, result: [{ url: "http://tracker.example.com" }] },
    // getDownloadPeers
    { success: true, result: [{ ip: "1.2.3.4", country: "FR" }] },
    // getDownloadFiles
    { success: true, result: [{ id: 1, name: "file.txt", size: 1024 }] },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) throw new Error("Unexpected fetch call");
    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.3.0",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    const stats = await client.getDownloadStats();
    assert.ok(stats);

    const config = await client.getDownloadsConfig();
    assert.ok(config);

    const trackers = await client.getDownloadTrackers(1);
    assert.ok(Array.isArray(trackers));

    const peers = await client.getDownloadPeers(1);
    assert.ok(Array.isArray(peers));

    const files = await client.getDownloadFiles(1);
    assert.ok(Array.isArray(files));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ─── Phase 6 Tests ──────────────────────────────────────────────────────

test("FTP config: get and update", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "token-6a", track_id: 10 } },
    { success: true, result: { logged_in: false, challenge: "ch6a" } },
    { success: true, result: { session_token: "sess6a", permissions: { settings: true } } },
    { success: true, result: { enabled: true, allow_anonymous: false, port_ctrl: 21 } },
    { success: true, result: { enabled: false } },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) throw new Error("Unexpected fetch call");
    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.4.0",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    const config = await client.getFtpConfig();
    assert.ok(config);
    assert.equal((config as { enabled: boolean }).enabled, true);

    const updated = await client.setFtpConfig({ enabled: false });
    assert.ok(updated);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Switch: status and port stats", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "token-6b", track_id: 11 } },
    { success: true, result: { logged_in: false, challenge: "ch6b" } },
    { success: true, result: { session_token: "sess6b", permissions: { settings: true } } },
    { success: true, result: [{ id: 1, link: true, speed: "1000fd" }, { id: 2, link: false }] },
    { success: true, result: { rx_good_octets: 123456, tx_octets: 789012 } },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) throw new Error("Unexpected fetch call");
    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.4.0",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    const status = await client.getSwitchStatus();
    assert.ok(Array.isArray(status));

    const stats = await client.getSwitchPortStats(1);
    assert.ok(stats);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("LCD config: get and update", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "token-6c", track_id: 12 } },
    { success: true, result: { logged_in: false, challenge: "ch6c" } },
    { success: true, result: { session_token: "sess6c", permissions: { settings: true } } },
    { success: true, result: { brightness: 50, orientation: 0 } },
    { success: true, result: { brightness: 80 } },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) throw new Error("Unexpected fetch call");
    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.4.0",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    const config = await client.getLcdConfig();
    assert.ok(config);

    const updated = await client.setLcdConfig({ brightness: 80 });
    assert.ok(updated);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Share links: list, create, get, delete", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "token-6d", track_id: 13 } },
    { success: true, result: { logged_in: false, challenge: "ch6d" } },
    { success: true, result: { session_token: "sess6d", permissions: { explorer: true } } },
    { success: true, result: [{ token: "abc123", path: "/Disque dur/Photos" }] },
    { success: true, result: { token: "def456", path: "/Disque dur/Films", expire: 0 } },
    { success: true, result: { token: "def456", path: "/Disque dur/Films" } },
    { success: true, result: {} },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) throw new Error("Unexpected fetch call");
    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.4.0",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    const links = await client.listShareLinks();
    assert.ok(Array.isArray(links));

    const created = await client.createShareLink({ path: "/Disque dur/Films" });
    assert.ok(created);

    const link = await client.getShareLink("def456");
    assert.ok(link);

    const deleted = await client.deleteShareLink("def456");
    assert.ok(deleted !== undefined);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("AirMedia: config and receivers", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "token-6e", track_id: 14 } },
    { success: true, result: { logged_in: false, challenge: "ch6e" } },
    { success: true, result: { session_token: "sess6e", permissions: { settings: true } } },
    { success: true, result: { enabled: true, password: "" } },
    { success: true, result: [{ name: "Freebox Player", type: "video" }] },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) throw new Error("Unexpected fetch call");
    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.4.0",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    const config = await client.getAirmediaConfig();
    assert.ok(config);

    const receivers = await client.getAirmediaReceivers();
    assert.ok(Array.isArray(receivers));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Download file priority: set priority for torrent file", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "freebox-mcp-"));
  const tokenFile = join(tempDir, "token.json");
  process.env.FREEBOX_TOKEN_FILE = tokenFile;
  const originalFetch = globalThis.fetch;

  const responses = [
    { api_version: "8.0" },
    { success: true, result: { app_token: "token-5", track_id: 5 } },
    { success: true, result: { logged_in: false, challenge: "ch5" } },
    { success: true, result: { session_token: "sess5", permissions: { downloads: true } } },
    // setDownloadFilePriority
    { success: true, result: { priority: "high" } },
  ];

  globalThis.fetch = (async () => {
    const payload = responses.shift();
    if (!payload) throw new Error("Unexpected fetch call");
    return createJsonResponse(payload);
  }) as typeof fetch;

  try {
    const client = new FreeboxClient({
      host: "mafreebox.freebox.fr",
      appId: "fr.freebox.mcp",
      appName: "Freebox MCP",
      appVersion: "1.3.0",
      deviceName: "Claude AI",
    });

    await client.startAuthorization();

    const result = await client.setDownloadFilePriority(1, 2, "high");
    assert.ok(result);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FREEBOX_TOKEN_FILE;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

/**
 * freebox-mcp — client d'authentification et d'accès à l'API Freebox OS
 *
 * Flow d'authentification :
 *  1. GET /api_version                → découverte
 *  2. POST /api/vX/login/authorize/   → demande d'app_token (affichage LCD Freebox)
 *  3. GET  /api/vX/login/             → obtenir le challenge
 *  4. POST /api/vX/login/session/     → ouvrir la session avec HMAC-SHA1(app_token, challenge)
 *  5. Toutes les requêtes → header X-Fbx-App-Auth: <session_token>
 */

import { createHmac } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";

function debug(msg: string) {
  if (process.env.DEBUG === "1") process.stderr.write(`[DEBUG] ${msg}\n`);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const PERMISSION_LABELS: Record<string, string> = {
  settings: "Modification des réglages de la Freebox",
  contacts: "Répertoire téléphonique",
  calls: "Journal d'appels",
  downloader: "Gestionnaire de téléchargements",
  explorer: "Explorateur de fichiers",
  parental: "Contrôle parental",
  pvr: "Enregistrements",
  vm: "Machines virtuelles",
};

function getRequestTimeoutMs(): number {
  const configured = process.env.FREEBOX_REQUEST_TIMEOUT;
  if (!configured) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(configured, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_TIMEOUT_MS;
}

function resolveTokenFilePath(): string {
  const configured = process.env.FREEBOX_TOKEN_FILE;
  if (!configured) {
    return join(__dirname, "..", "freebox_token.json");
  }
  return isAbsolute(configured) ? configured : join(process.cwd(), configured);
}

export interface FreeboxConfig {
  host: string;       // ex: "mafreebox.freebox.fr"
  appId: string;      // ex: "fr.freebox.mcp"
  appName: string;    // ex: "Freebox MCP"
  appVersion: string; // ex: "1.0.0"
  deviceName: string; // ex: "Claude MCP"
}

interface StoredToken {
  appToken: string;
  trackId: number;
  apiVersion: number;
}

interface SessionInfo {
  sessionToken: string;
  permissions: Record<string, boolean>;
}

interface FreeboxApiResponse<T> {
  success: boolean;
  result: T;
  msg?: string;
  error_code?: string;
  missing_right?: string;
}

export type FreeboxModel = "ultra" | "delta" | "pop" | "revolution" | "unknown";
export type VmSupport = "full" | "none";

export interface FreeboxCapabilities {
  model: FreeboxModel;
  modelName: string;
  boxFlavor: "full" | "light";
  vmSupport: VmSupport;
  wifi6ghz: boolean;
  wifi7: boolean;
  hasInternalStorage: boolean;
}

interface ApiVersionInfo {
  api_version?: string;
  box_model_name?: string;
  box_model?: string;
  device_name?: string;
  box_flavor?: string;
}

interface RequestOptions {
  body?: unknown;
  authenticated?: boolean;
  contentType?: string;
  encodeBody?: (body: unknown) => BodyInit | undefined;
}

export class FreeboxClient {
  private config: FreeboxConfig;
  private tokenFilePath: string;
  private requestTimeoutMs: number;
  private apiVersion = 8;
  private sessionToken: string | null = null;
  private appToken: string | null = null;
  private permissions: Record<string, boolean> = {};
  private capabilities: FreeboxCapabilities | null = null;
  private capabilitiesLastUpdated = 0;
  private readonly capabilitiesCacheTtlMs = 5 * 60 * 1000;

  constructor(config: FreeboxConfig) {
    this.config = config;
    this.tokenFilePath = resolveTokenFilePath();
    this.requestTimeoutMs = getRequestTimeoutMs();
    this.loadStoredToken();
  }

  // ─── Persistance du token ───────────────────────────────────────────────────

  private loadStoredToken(): void {
    debug(`chargement token depuis: ${this.tokenFilePath}`);
    if (existsSync(this.tokenFilePath)) {
      try {
        const data: StoredToken = JSON.parse(readFileSync(this.tokenFilePath, "utf8"));
        this.appToken = data.appToken;
        this.apiVersion = data.apiVersion ?? 8;
        debug(`token chargé (apiVersion=${this.apiVersion})`);
      } catch (e) {
        debug(`échec lecture token: ${e}`);
      }
    } else {
      debug("aucun token existant");
    }
  }

  private saveToken(appToken: string, trackId: number): void {
    const data: StoredToken = { appToken, trackId, apiVersion: this.apiVersion };
    const tokenDir = dirname(this.tokenFilePath);
    debug(`sauvegarde token dans: ${this.tokenFilePath}`);
    if (!existsSync(tokenDir)) {
      mkdirSync(tokenDir, { recursive: true });
    }
    writeFileSync(this.tokenFilePath, JSON.stringify(data, null, 2));
    debug("token sauvegardé");
  }

  private getPermissionLabel(permission?: string): string {
    if (!permission) {
      return "Permission inconnue";
    }
    return PERMISSION_LABELS[permission] ?? permission;
  }

  private buildPermissionErrorMessage(missingRight?: string): string {
    const permissionLabel = this.getPermissionLabel(missingRight);
    const missingPart = missingRight
      ? `Permission manquante : "${permissionLabel}".`
      : "Cette action requiert des droits supplémentaires sur la Freebox.";

    return `${missingPart} Utilisez freebox_reset_authorization, puis relancez l'autorisation en accordant tous les droits nécessaires sur l'écran de la Freebox.`;
  }

  // ─── URL builder ────────────────────────────────────────────────────────────

  private url(path: string): string {
    return `http://${this.config.host}/api/v${this.apiVersion}${path}`;
  }

  private detectModelFromName(modelName: string): FreeboxModel {
    const lower = modelName.toLowerCase();

    if (lower.includes("v9") || lower.includes("ultra")) return "ultra";
    if (lower.includes("pop") || lower.includes("v8")) return "pop";
    if (lower.includes("v7") || lower.includes("delta")) return "delta";
    if (
      lower.includes("v6") ||
      lower.includes("revolution") ||
      lower.includes("révolution") ||
      lower.includes("mini")
    ) {
      return "revolution";
    }

    return "unknown";
  }

  private buildCapabilities(model: FreeboxModel, modelName: string, boxFlavor: "full" | "light"): FreeboxCapabilities {
    switch (model) {
      case "ultra":
        return {
          model,
          modelName,
          boxFlavor,
          vmSupport: "full",
          wifi6ghz: true,
          wifi7: true,
          hasInternalStorage: boxFlavor === "full",
        };
      case "delta":
        return {
          model,
          modelName,
          boxFlavor,
          vmSupport: "full",
          wifi6ghz: true,
          wifi7: false,
          hasInternalStorage: boxFlavor === "full",
        };
      case "pop":
        return {
          model,
          modelName,
          boxFlavor,
          vmSupport: "none",
          wifi6ghz: false,
          wifi7: true,
          hasInternalStorage: false,
        };
      case "revolution":
        return {
          model,
          modelName,
          boxFlavor,
          vmSupport: "none",
          wifi6ghz: false,
          wifi7: false,
          hasInternalStorage: true,
        };
      default:
        return {
          model,
          modelName,
          boxFlavor,
          vmSupport: "none",
          wifi6ghz: false,
          wifi7: false,
          hasInternalStorage: boxFlavor === "full",
        };
    }
  }

  private async checkActualStorage(): Promise<boolean> {
    if (!this.appToken) {
      return false;
    }

    try {
      const disks = await this.getStorageDisks();
      if (!Array.isArray(disks)) {
        return false;
      }

      return disks.some((disk: unknown) => {
        if (!disk || typeof disk !== "object") {
          return false;
        }
        const typed = disk as { type?: string; bus_type?: string; model?: string };
        const type = (typed.type ?? "").toLowerCase();
        const busType = (typed.bus_type ?? "").toLowerCase();
        const model = (typed.model ?? "").toLowerCase();
        return (
          type.includes("internal") ||
          type.includes("nvme") ||
          type.includes("sata") ||
          busType.includes("sata") ||
          busType.includes("nvme") ||
          model.includes("nvme")
        );
      });
    } catch {
      return false;
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Délai dépassé après ${this.requestTimeoutMs} ms pour ${url}`);
      }
      throw new Error(`Échec de la requête vers ${url}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseJsonBody<T>(res: Response, method: string, url: string): Promise<T> {
    const contentType = res.headers.get("content-type") ?? "";
    const rawText = await res.text();

    if (!contentType.includes("application/json")) {
      const snippet = rawText.slice(0, 200).trim();
      throw new Error(
        `Réponse non-JSON pour ${method} ${url} (status ${res.status})${snippet ? `: ${snippet}` : ""}`
      );
    }

    try {
      return JSON.parse(rawText) as T;
    } catch {
      const snippet = rawText.slice(0, 200).trim();
      throw new Error(
        `JSON invalide pour ${method} ${url} (status ${res.status})${snippet ? `: ${snippet}` : ""}`
      );
    }
  }

  private async performRequest<T>(
    method: string,
    path: string,
    options: RequestOptions,
    retrying = false
  ): Promise<T> {
    const {
      body,
      authenticated = true,
      contentType = "application/json",
      encodeBody = (value: unknown) => (value === undefined ? undefined : JSON.stringify(value)),
    } = options;

    const headers: Record<string, string> = {};
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    if (authenticated && this.sessionToken) {
      headers["X-Fbx-App-Auth"] = this.sessionToken;
    }

    const url = this.url(path);
    debug(`→ ${method} ${url}`);

    const res = await this.fetchWithTimeout(url, {
      method,
      headers,
      body: encodeBody(body),
    });

    const json = await this.parseJsonBody<FreeboxApiResponse<T>>(res, method, url);
    debug(`← ${res.status} success=${json.success}${json.error_code ? ` error=${json.error_code}` : ""}`);

    if (!json.success) {
      if (authenticated && !retrying && (json.error_code === "auth_required" || res.status === 401)) {
        debug("session expirée, tentative de reconnexion");
        this.sessionToken = null;
        await this.openSession();
        return this.performRequest<T>(method, path, options, true);
      }

      if (json.error_code === "insufficient_rights") {
        throw new Error(this.buildPermissionErrorMessage(json.missing_right));
      }

      throw new Error(`Freebox API error [${json.error_code ?? "unknown"}]: ${json.msg ?? "no message"}`);
    }

    return json.result;
  }

  // ─── Low-level fetch ────────────────────────────────────────────────────────

  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    return this.performRequest(method, path, options);
  }

  // ─── Découverte ─────────────────────────────────────────────────────────────

  async discover(): Promise<void> {
    const url = `http://${this.config.host}/api_version`;
    const res = await this.fetchWithTimeout(url, { method: "GET" });
    const info = await this.parseJsonBody<{ api_version: string }>(res, "GET", url);
    const major = parseInt(info.api_version.split(".")[0]);
    if (major > 0) this.apiVersion = major;
  }

  async getCapabilities(forceRefresh = false): Promise<FreeboxCapabilities> {
    if (
      !forceRefresh &&
      this.capabilities &&
      Date.now() - this.capabilitiesLastUpdated < this.capabilitiesCacheTtlMs
    ) {
      return this.capabilities;
    }

    const url = `http://${this.config.host}/api_version`;
    const res = await this.fetchWithTimeout(url, { method: "GET" });
    const info = await this.parseJsonBody<ApiVersionInfo>(res, "GET", url);

    const apiVersion = info.api_version;
    if (apiVersion) {
      const major = parseInt(apiVersion.split(".")[0]);
      if (major > 0) {
        this.apiVersion = major;
      }
    }

    const modelName = info.box_model_name || info.box_model || info.device_name || "Freebox";
    const boxFlavor = info.box_flavor === "full" ? "full" : "light";
    const model = this.detectModelFromName(modelName);

    const capabilities = this.buildCapabilities(model, modelName, boxFlavor);

    const hasRealStorage = await this.checkActualStorage();
    if (hasRealStorage) {
      capabilities.hasInternalStorage = true;
    }

    this.capabilities = capabilities;
    this.capabilitiesLastUpdated = Date.now();
    return capabilities;
  }

  // ─── Authentification ───────────────────────────────────────────────────────

  /**
   * Lance la procédure d'autorisation initiale.
   * L'utilisateur doit appuyer sur ">" sur la Freebox.
   * Retourne le track_id pour pouvoir poller le statut.
   */
  async startAuthorization(): Promise<{ trackId: number; message: string }> {
    await this.discover();

    const result = await this.request<{ app_token: string; track_id: number }>(
      "POST",
      "/login/authorize/",
      {
        body: {
          app_id: this.config.appId,
          app_name: this.config.appName,
          app_version: this.config.appVersion,
          device_name: this.config.deviceName,
        },
        authenticated: false,
      }
    );

    this.appToken = result.app_token;
    this.saveToken(result.app_token, result.track_id);

    return {
      trackId: result.track_id,
      message: `Autorisation en attente (track_id: ${result.track_id}). Veuillez appuyer sur ">" sur votre Freebox.`,
    };
  }

  /**
   * Vérifie l'état de la demande d'autorisation.
   */
  async checkAuthorizationStatus(trackId: number): Promise<{ status: string; challenge?: string }> {
    const result = await this.request<{ status: string; challenge: string }>(
      "GET",
      `/login/authorize/${trackId}`,
      { authenticated: false }
    );
    return result;
  }

  /**
   * Ouvre une session à partir de l'app_token stocké.
   * Calcule le password = HMAC-SHA1(app_token, challenge)
   */
  async openSession(): Promise<SessionInfo> {
    if (!this.appToken) {
      throw new Error("Aucun app_token. Lancez d'abord startAuthorization().");
    }

    // 1. Obtenir le challenge
    const loginResult = await this.request<{ logged_in: boolean; challenge: string }>(
      "GET",
      "/login/",
      { authenticated: false }
    );

    // 2. Calculer le password
    const password = createHmac("sha1", this.appToken)
      .update(loginResult.challenge)
      .digest("hex");

    // 3. Ouvrir la session
    const session = await this.request<{ session_token: string; permissions: Record<string, boolean> }>(
      "POST",
      "/login/session/",
      {
        body: {
          app_id: this.config.appId,
          password,
        },
        authenticated: false,
      }
    );

    this.sessionToken = session.session_token;
    this.permissions = session.permissions ?? {};
    return { sessionToken: session.session_token, permissions: session.permissions };
  }

  /**
   * S'assure qu'une session est ouverte, sinon en ouvre une.
   */
  async ensureSession(): Promise<void> {
    if (!this.sessionToken) {
      await this.openSession();
    }
  }

  async closeSession(): Promise<void> {
    if (!this.sessionToken) return;
    try {
      await this.request("POST", "/login/logout/", { body: {} });
    } finally {
      this.sessionToken = null;
      this.permissions = {};
      this.capabilities = null;
      this.capabilitiesLastUpdated = 0;
    }
  }

  async resetAuthorization(): Promise<{ message: string; tokenFilePath: string }> {
    try {
      await this.closeSession();
    } catch (e) {
      debug(`échec fermeture session avant reset: ${e}`);
    }

    if (existsSync(this.tokenFilePath)) {
      unlinkSync(this.tokenFilePath);
    }

    this.sessionToken = null;
    this.appToken = null;
    this.permissions = {};
    this.capabilities = null;
    this.capabilitiesLastUpdated = 0;

    return {
      message: "Autorisation Freebox réinitialisée. Relancez freebox_authorize pour réenregistrer l'application.",
      tokenFilePath: this.tokenFilePath,
    };
  }

  // ─── APIs métier ────────────────────────────────────────────────────────────

  async getConnectionStatus() {
    await this.ensureSession();
    return this.request("GET", "/connection/");
  }

  async getSystemInfo() {
    await this.ensureSession();
    return this.request("GET", "/system/");
  }

  async reboot() {
    await this.ensureSession();
    return this.request("POST", "/system/reboot/", { body: {} });
  }

  async getLanHosts() {
    await this.ensureSession();
    return this.request("GET", "/lan/browser/pub/");
  }

  async getWifiConfig() {
    await this.ensureSession();
    return this.request("GET", "/wifi/config/");
  }

  async setWifiEnabled(enabled: boolean) {
    await this.ensureSession();
    return this.request("PUT", "/wifi/config/", { body: { enabled } });
  }

  async getWifiBSS() {
    await this.ensureSession();
    return this.request("GET", "/wifi/bss/");
  }

  async getDownloads() {
    await this.ensureSession();
    return this.request("GET", "/downloads/");
  }

  async addDownload(downloadUrl: string) {
    await this.ensureSession();
    const params = new URLSearchParams();
    params.append("download_url", downloadUrl);

    return this.request("POST", "/downloads/add/", {
      body: params,
      contentType: "application/x-www-form-urlencoded",
      encodeBody: (value) => {
        if (!(value instanceof URLSearchParams)) {
          return undefined;
        }
        return value.toString();
      },
    });
  }

  async deleteDownload(id: number) {
    await this.ensureSession();
    return this.request("DELETE", `/downloads/${id}/`);
  }

  async updateDownload(id: number, status: "stopped" | "downloading") {
    await this.ensureSession();
    return this.request("PUT", `/downloads/${id}/`, { body: { status } });
  }

  async getCallLog() {
    await this.ensureSession();
    return this.request("GET", "/call/log/");
  }

  async markCallRead(id: number) {
    await this.ensureSession();
    return this.request("PUT", `/call/log/${id}/`, { body: { is_new: false } });
  }

  async getContacts() {
    await this.ensureSession();
    return this.request("GET", "/contact/");
  }

  async listFiles(path: string) {
    await this.ensureSession();
    const encoded = encodeURIComponent(Buffer.from(path).toString("base64"));
    return this.request("GET", `/fs/ls/${encoded}`);
  }

  async getDHCPConfig() {
    await this.ensureSession();
    return this.request("GET", "/dhcp/config/");
  }

  async getDHCPLeases() {
    await this.ensureSession();
    return this.request("GET", "/dhcp/leases/");
  }

  async getPortForwarding() {
    await this.ensureSession();
    return this.request("GET", "/fw/redir/");
  }

  async addPortForwarding(rule: {
    lan_port: number;
    wan_port_start: number;
    wan_port_end: number;
    lan_ip: string;
    ip_proto: "tcp" | "udp";
    enabled: boolean;
    comment: string;
  }) {
    await this.ensureSession();
    return this.request("POST", "/fw/redir/", { body: rule });
  }

  async deletePortForwarding(id: number) {
    await this.ensureSession();
    return this.request("DELETE", `/fw/redir/${id}/`);
  }

  async getParentalConfig() {
    await this.ensureSession();
    return this.request("GET", "/parental/config/");
  }

  async getParentalFilters() {
    await this.ensureSession();
    return this.request("GET", "/parental/filter/");
  }

  async getVMs() {
    await this.ensureSession();
    return this.request("GET", "/vm/");
  }

  async startVM(id: number) {
    await this.ensureSession();
    return this.request("POST", `/vm/${id}/start/`, { body: {} });
  }

  async stopVM(id: number) {
    await this.ensureSession();
    return this.request("POST", `/vm/${id}/stop/`, { body: {} });
  }

  async getStorageDisks() {
    await this.ensureSession();
    return this.request("GET", "/storage/disk/");
  }

  async getFreeplug() {
    await this.ensureSession();
    return this.request("GET", "/freeplug/");
  }

  async wakeOnLan(mac: string, password?: string) {
    await this.ensureSession();
    const body: Record<string, string> = { mac };
    if (password) body.password = password;
    return this.request("POST", "/lan/wol/pub/", { body });
  }

  async getRRDStats(db: string, fields: string[], date_start?: number, date_end?: number, precision?: number) {
    await this.ensureSession();
    return this.request("POST", "/rrd/", {
      body: {
        db,
        fields,
        ...(date_start && { date_start }),
        ...(date_end && { date_end }),
        ...(precision && { precision }),
      },
    });
  }

  isAuthorized(): boolean {
    return !!this.appToken;
  }

  getPermissions(): Record<string, boolean> {
    return { ...this.permissions };
  }

  supportsVm(capabilities?: FreeboxCapabilities): boolean {
    const cap = capabilities ?? this.capabilities;
    return cap?.vmSupport === "full";
  }
}

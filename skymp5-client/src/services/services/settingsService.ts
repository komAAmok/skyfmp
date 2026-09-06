import { HttpClient, HttpHeaders, HttpResponse, printConsole, Utility } from "skyrimPlatform";
import { AuthService } from "./authService";
import { ClientListener, CombinedController, Sp } from "./clientListener";
import { Mod, ServerManifest } from "../messages_http/serverManifest";
import { TimersService } from "./timersService";
import { logTrace } from "../../logging";

interface IHttpClientWithCallback {
  get(path: string, options?: { headers?: HttpHeaders }): Promise<HttpResponse>;
  post(path: string, options: { body: string, contentType: string, headers?: HttpHeaders }): Promise<HttpResponse>;

  get(path: string, options: { headers?: HttpHeaders } | undefined, callback: (response: HttpResponse) => void): void;
}

export interface TargetPeer {
  host: string;
  port: number;
  publicKeys?: Record<string, string | undefined>;
}

export type TargetPeerCallback = (targetPeer: TargetPeer) => void;

export class SettingsService extends ClientListener {
  constructor(private sp: Sp, private controller: CombinedController) {
    super();
  }

  public getServerMasterKey() {
    let masterKey = this.sp.settings["skymp5-client"]["server-master-key"];
    if (!masterKey) {
      masterKey = this.sp.settings["skymp5-client"]["master-key"];
    }
    if (!masterKey) {
      masterKey = this.sp.settings["skymp5-client"]["server-ip"] + ":" + this.sp.settings["skymp5-client"]["server-port"];
    }
    return masterKey;
  }

  public getMasterUrl() {
    return this.normalizeUrl((this.sp.settings["skymp5-client"]["master"] as string) || "https://gateway.skymp.net");
  }

  /**
   * Direct connect mode: no master API / gateway is involved at all. The player
   * types "<host>:<port>" into the in-game menu (F2) and we connect straight to
   * that peer. This is what makes LAN, Radmin VPN, Hamachi, a home-hosted
   * server and a public VPS/Docker deployment all work the same way.
   *
   * Enabled explicitly via "directConnect": true, and implicitly whenever no
   * "master" URL is configured (which is the case for OFFLINE_MODE builds).
   */
  public isDirectConnectMode(): boolean {
    const settings = this.sp.settings["skymp5-client"];

    const explicit = settings["directConnect"];
    if (typeof explicit === "boolean") {
      return explicit;
    }

    return !settings["master"];
  }

  /**
   * Address entered by the player at runtime. Takes priority over
   * "server-ip"/"server-port" from skymp5-client-settings.txt.
   */
  public getTargetPeerOverride(): TargetPeer | null {
    return this.targetPeerOverride;
  }

  public setTargetPeerOverride(targetPeer: TargetPeer | null) {
    this.targetPeerOverride = targetPeer;

    // The resolved peer is memoized to avoid repeating the serverinfo request on
    // every reconnect. A new address must invalidate it, otherwise we would keep
    // dialing the previous host.
    this.targetPeerCache = null;
  }

  public getConfiguredPeer(): TargetPeer {
    return {
      host: (this.sp.settings['skymp5-client']['server-ip'] as string) || "127.0.0.1",
      port: (this.sp.settings['skymp5-client']['server-port'] as number) || 7777,
      publicKeys: this.sp.settings['skymp5-client']['server-public-keys'] as Record<string, string | undefined> | undefined,
    };
  }

  /**
   * The game server also runs a small HTTP server that serves its data
   * directory (see skymp5-server/ts/ui.ts). Its port is derived from the game
   * port, so a direct connect client can fetch manifest.json without a master
   * API. Keep in sync with `uiPort` there.
   */
  public getServerHttpUrl(peer: TargetPeer): string {
    const httpPort = peer.port === 7777 ? 3000 : peer.port + 1;
    return `http://${peer.host}:${httpPort}`;
  }

  public makeMasterApiClient(): IHttpClientWithCallback {
    const masterApiBaseUrl = this.getMasterUrl();
    return new HttpClient(masterApiBaseUrl) as IHttpClientWithCallback;
  }

  public getTargetPeer(callback?: TargetPeerCallback): { targetPeerCached: TargetPeer | null } {
    if (this.targetPeerCache) {
      callback?.(this.targetPeerCache);
      return { targetPeerCached: this.targetPeerCache };
    }
    this.getTargetPeerImpl((targetPeer) => {
      this.targetPeerCache = targetPeer;
      callback?.(targetPeer);
    });
    // Direct connect resolves synchronously, so the cache may already be filled
    // by the time we get here. Report it instead of a spurious "not ready".
    return { targetPeerCached: this.targetPeerCache };
  }

  // have to use callbacks here: promises don't work in the main menu
  private getTargetPeerImpl(callback: TargetPeerCallback) {
    const serverInfoRequestTimeoutMs = 5000;
    const defaultPeer: TargetPeer = this.getConfiguredPeer();

    if (this.targetPeerOverride) {
      logTrace(this, 'Using target peer entered by the player', this.targetPeerOverride);
      callback({
        ...this.targetPeerOverride,
        publicKeys: { ...defaultPeer.publicKeys, ...this.targetPeerOverride.publicKeys },
      });
      return;
    }

    if (this.isDirectConnectMode()) {
      logTrace(this, 'Direct connect mode, skipping serverinfo request, using', defaultPeer);
      callback(defaultPeer);
      return;
    }

    const masterApiClient = this.makeMasterApiClient();
    const masterKey = this.getServerMasterKey();

    let resolved = false;

    const states = {
      start: () => {
        try {
          if (this.sp.settings['skymp5-client']['server-info-ignore'] as boolean) {
            logTrace(this, 'Skipping serverinfo request due to server-info-ignore in config');
            states.resolve(defaultPeer);
            return;
          }
          this.controller.lookupListener(TimersService).setTimeout(
            () => states.reject(new Error('getTargetPeer: serverinfo request timed out')),
            serverInfoRequestTimeoutMs,
          );

          let headers: HttpHeaders = {};
          let session = this.controller.lookupListener(AuthService).readAuthDataFromDisk()?.session;
          if (session) {
            headers['X-Session'] = session;
          }

          masterApiClient.get(
            `/api/servers/${masterKey}/serverinfo`, { headers },
            states.handleResponse,
          );
        } catch (e) {
          states.reject(e);
        }
      },
      handleResponse: (res: HttpResponse) => {
        try {
          if (res.status !== 200) {
            throw new Error(`status ${res.status}`);
          }
          states.resolve(JSON.parse(res.body));
        } catch (e) {
          states.reject(e);
        }
      },

      resolve: (targetPeer: TargetPeer) => {
        if (resolved) {
          return;
        }
        resolved = true;

        logTrace(this, `Resolved target peer`, targetPeer);

        const enrichedTargetPeer = { ...targetPeer };
        enrichedTargetPeer.publicKeys = { ...defaultPeer.publicKeys, ...targetPeer.publicKeys };

        logTrace(this, `Enriched target peer`, enrichedTargetPeer);

        callback(enrichedTargetPeer);
      },
      reject: (err: unknown) => {
        if (resolved) {
          return;
        }
        resolved = true;

        logTrace(this, `Server info request failed, falling back to`, defaultPeer, `; error:`, err);
        callback(defaultPeer);
      },
    };

    states.start();
  }

  /**
   * Returns the mod list the server expects, or null when it could not be
   * determined (server unreachable / no manifest). null must not be confused
   * with an empty list: an empty list means "the server has no mods at all".
   */
  public async getServerMods(): Promise<Mod[] | null> {
    if (this.isDirectConnectMode()) {
      return this.getServerModsDirect();
    }

    const masterApiClient = this.makeMasterApiClient();

    const masterKey = this.getServerMasterKey();
    printConsole(masterKey);

    for (let attempt = 0; attempt < 5; ++attempt) {
      try {
        printConsole(`Trying to get server mods, attempt ${attempt}`);
        const res = await masterApiClient.get(`/api/servers/${masterKey}/manifest.json`);
        if (res.status != 200) {
          throw new Error(`status code ${res.status}, error ${res.error}`);
        }
        const manifest = JSON.parse(res.body) as ServerManifest;
        if (manifest.versionMajor !== 1) {
          printConsole(`server manifest version is ${manifest.versionMajor}, we expect 1`);
          return null;
        }
        return manifest.mods;
      } catch (e) {
        printConsole(`Request/parse error: ${e}`);
        await Utility.wait(0.1 + Math.random());
      }
    }

    return null;
  };

  /**
   * Direct connect mode has no master API, so the manifest is fetched from the
   * game server itself. A single attempt with no retries: the check is a
   * convenience for the player, not something worth stalling startup for.
   */
  private async getServerModsDirect(): Promise<Mod[] | null> {
    const peer = this.getTargetPeerOverride() ?? this.getConfiguredPeer();
    if (!peer.host) {
      return null;
    }

    const baseUrl = this.getServerHttpUrl(peer);
    logTrace(this, 'Requesting manifest.json from', baseUrl);

    try {
      const res = await (new HttpClient(baseUrl) as IHttpClientWithCallback).get('/manifest.json');
      if (res.status !== 200) {
        throw new Error(`status code ${res.status}, error ${res.error}`);
      }
      const manifest = JSON.parse(res.body) as ServerManifest;
      if (manifest.versionMajor !== 1) {
        throw new Error(`server manifest version is ${manifest.versionMajor}, we expect 1`);
      }
      return manifest.mods;
    } catch (e) {
      logTrace(this, 'Could not fetch manifest.json:', e);
      return null;
    }
  }

  private normalizeUrl(url: string) {
    if (url.endsWith('/')) {
      return url.slice(0, url.length - 1);
    }
    return url;
  };

  private targetPeerCache: TargetPeer | null = null;
  private targetPeerOverride: TargetPeer | null = null;
}

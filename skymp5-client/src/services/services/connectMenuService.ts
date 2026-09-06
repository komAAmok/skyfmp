import * as crypto from "crypto";
import * as fs from "fs";
import { BrowserMessageEvent, DxScanCode } from "skyrimPlatform";
import { logError, logTrace } from "../../logging";
import { FunctionInfo } from "../../lib/functionInfo";
import { AuthNeededEvent } from "../events/authNeededEvent";
import { BrowserWindowLoadedEvent } from "../events/browserWindowLoadedEvent";
import { ConnectionDenied } from "../events/connectionDenied";
import { ConnectionMessage } from "../events/connectionMessage";
import { CreateActorMessage } from "../messages/createActorMessage";
import { QueryKeyCodeBindings } from "../events/queryKeyCodeBindings";
import { ClientListener, CombinedController, Sp } from "./clientListener";
import { NetworkingService } from "./networkingService";
import { SettingsService } from "./settingsService";

// for widgetSetter, which is stringified and evaluated in the browser
declare const window: any;

// Constants used on both the client and the browser side (see widgetSetter)
const events = {
  connect: 'connectMenuConnect',
  disconnect: 'connectMenuDisconnect',
  addressChanged: 'connectMenuAddressChanged',
  close: 'connectMenuClose',
};

// Variables used on both the client and the browser side (see widgetSetter)
//
// The status is kept as a fixed pair of lines on purpose: the UI reuses a widget
// component as long as its element count stays the same, so a constant shape
// means the address field never loses what the player typed and the hint state
// stays in sync with the elements that carry hints.
let browserState = {
  address: '',
  statusLines: ['', ''],
  isConnected: false,
};

const translations = {
  "en": {
    caption: 'Multiplayer',
    addressHint: 'Host address, e.g. 192.168.1.10:7777',
    connect: 'Connect',
    disconnect: 'Disconnect',
    close: 'Close (F2)',
    connectHint: 'Connect to the host you entered',
    disconnectHint: 'Leave the server',
    connecting: 'connecting',
    connected: 'connected',
    disconnected: 'not connected',
    badAddress: 'bad address, expected <ip>:<port>',
    connectionFailed: 'could not reach the host\ncheck the address, firewall and port forwarding',
    connectionLost: 'connection lost, retrying...',
    versionMismatch: 'the host runs a different version of the mod',
  },
  "zh": {
    caption: '联机',
    addressHint: '房主地址，例如 192.168.1.10:7777',
    connect: '连接',
    disconnect: '断开',
    close: '关闭 (F2)',
    connectHint: '连接到填写的房主地址',
    disconnectHint: '离开服务器',
    connecting: '正在连接',
    connected: '已连接',
    disconnected: '未连接',
    badAddress: '地址格式错误，应为 <IP>:<端口>',
    connectionFailed: '无法连接到房主\n请检查地址、防火墙与端口转发',
    connectionLost: '连接已断开，正在重连...',
    versionMismatch: '房主使用的 mod 版本与你不一致',
  },
  "ru": {
    caption: 'Мультиплеер',
    addressHint: 'Адрес хоста, например 192.168.1.10:7777',
    connect: 'Подключиться',
    disconnect: 'Отключиться',
    close: 'Закрыть (F2)',
    connectHint: 'Подключиться к указанному хосту',
    disconnectHint: 'Покинуть сервер',
    connecting: 'подключение',
    connected: 'подключено',
    disconnected: 'нет подключения',
    badAddress: 'неверный адрес, ожидается <ip>:<порт>',
    connectionFailed: 'хост недоступен\nпроверьте адрес, файрвол и проброс портов',
    connectionLost: 'соединение потеряно, переподключаемся...',
    versionMismatch: 'на хосте другая версия мода',
  },
} as const;

type TranslationStrings = { [K in keyof typeof translations['en']]: string };

let strings: TranslationStrings = translations['en'];

try {
  const lang = fs.readFileSync('./Data/Platform/Distribution/locale', 'utf8').trim();
  if (lang in translations) {
    strings = translations[lang as keyof typeof translations];
  }
} catch {
  // locale file not found or unreadable, default to 'en'
}

interface DirectConnectData {
  address: string;
  profileId: number;
}

const kDefaultPort = 7777;

/**
 * Owns the in-game multiplayer menu (F2) used in direct connect mode: the
 * player types "<host>:<port>", presses Connect and the client dials that peer
 * directly. No master server, no gateway, no external account — which is what
 * makes LAN, Radmin VPN, Hamachi and a public VPS/Docker host all work the
 * same way.
 *
 * When a master API is configured this service stays completely inactive and
 * AuthService keeps driving the login flow.
 */
export class ConnectMenuService extends ClientListener {
  constructor(private sp: Sp, private controller: CombinedController) {
    super();

    this.controller.emitter.on("authNeeded", (e) => this.onAuthNeeded(e));
    this.controller.emitter.on("browserWindowLoaded", (e) => this.onBrowserWindowLoaded(e));
    this.controller.emitter.on("connectionAccepted", () => this.onConnectionAccepted());
    this.controller.emitter.on("connectionFailed", () => this.onConnectionFailed());
    this.controller.emitter.on("connectionDenied", (e) => this.onConnectionDenied(e));
    this.controller.emitter.on("connectionDisconnect", () => this.onConnectionDisconnect());
    this.controller.emitter.on("createActorMessage", (e) => this.onCreateActorMessage(e));
    this.controller.emitter.on("queryKeyCodeBindings", (e) => this.onQueryKeyCodeBindings(e));
    this.controller.on("browserMessage", (e) => this.onBrowserMessage(e));
  }

  public get isActive(): boolean {
    return this.controller.lookupListener(SettingsService).isDirectConnectMode();
  }

  private onAuthNeeded(e: AuthNeededEvent) {
    if (!this.isActive) {
      return;
    }
    logTrace(this, `Received authNeeded event, direct connect mode`);
    this.trigger.authNeededFired = true;
    this.openMenuWhenReady();
  }

  private onBrowserWindowLoaded(e: BrowserWindowLoadedEvent) {
    if (!this.isActive) {
      return;
    }
    this.trigger.browserWindowLoadedFired = true;
    this.openMenuWhenReady();
  }

  /**
   * The menu can only be drawn once the CEF page has loaded, and it is only
   * wanted once the client asked for credentials. Whichever happens last opens
   * the menu.
   */
  private openMenuWhenReady() {
    if (!this.trigger.conditionMet || this.everOpened) {
      return;
    }

    const data = this.readData();
    browserState.address = data.address;
    browserState.statusLines = [strings.disconnected, ''];
    browserState.isConnected = false;

    if (this.sp.settings["skymp5-client"]["autoConnect"] && data.address) {
      logTrace(this, `autoConnect is set, connecting to`, data.address);
      this.everOpened = true;
      this.connect(data.address);
      return;
    }

    this.openMenu();
  }

  private onQueryKeyCodeBindings(e: QueryKeyCodeBindings) {
    if (!this.isActive) {
      return;
    }
    if (!e.isDown([DxScanCode.F2])) {
      return;
    }
    if (this.isMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  private openMenu() {
    this.everOpened = true;
    this.isMenuOpen = true;

    if (browserState.address === '') {
      browserState.address = this.readData().address;
    }
    browserState.isConnected = this.isConnected();
    if (!this.isConnecting) {
      browserState.statusLines =
        [browserState.isConnected ? strings.connected : strings.disconnected, ''];
    }

    this.refreshWidgets();
    this.sp.browser.setVisible(true);
    this.sp.browser.setFocused(true);
  }

  private closeMenu() {
    this.isMenuOpen = false;
    this.sp.browser.executeJavaScript('window.skyrimPlatform.widgets.set([]);');
    this.sp.browser.setFocused(false);
  }

  private refreshWidgets() {
    if (!this.isMenuOpen) {
      return;
    }
    this.sp.browser.executeJavaScript(
      new FunctionInfo(this.widgetSetter).getText({ events, browserState, strings }));
  }

  private setStatus(status: string) {
    // Normalized to exactly two lines to keep the widget shape constant.
    const lines = status.replace(/\r/g, '').split('\n');
    const next = [lines[0] || '', lines[1] || ''];

    if (browserState.statusLines[0] === next[0] && browserState.statusLines[1] === next[1]) {
      return;
    }
    browserState.statusLines = next;
    this.refreshWidgets();
  }

  private onBrowserMessage(e: BrowserMessageEvent) {
    if (!this.isActive || !this.isMenuOpen) {
      return;
    }

    switch (e.arguments[0]) {
      case events.addressChanged:
        if (typeof e.arguments[1] === 'string') {
          browserState.address = e.arguments[1];
        }
        break;
      case events.connect:
        this.connect(browserState.address);
        break;
      case events.disconnect:
        this.disconnect();
        break;
      case events.close:
        this.closeMenu();
        break;
      default:
        break;
    }
  }

  private connect(rawAddress: string) {
    const peer = ConnectMenuService.parseAddress(rawAddress);
    if (!peer) {
      logError(this, `Could not parse address`, rawAddress);
      this.setStatus(strings.badAddress);
      return;
    }

    const data = this.readData();
    this.writeData({ address: rawAddress.trim(), profileId: data.profileId });

    const settingsService = this.controller.lookupListener(SettingsService);
    const networkingService = this.controller.lookupListener(NetworkingService);

    const previous = settingsService.getTargetPeerOverride();
    const sameAddress = previous && previous.host === peer.host && previous.port === peer.port;

    if (sameAddress && networkingService.isConnected()) {
      // Nothing to do; the connection routine is a no-op while a socket is up,
      // so reporting "connecting" here would hang the status forever.
      logTrace(this, `Already connected to ${peer.host}:${peer.port}`);
      this.isConnecting = false;
      browserState.isConnected = true;
      this.setStatus(strings.connected);
      return;
    }

    settingsService.setTargetPeerOverride(peer);

    // Drop any live or in-flight connection so the new address is actually
    // dialed. NetworkingService.connect() also handles this, but closing here
    // covers a retry to the same address after a failure.
    networkingService.close();

    this.isConnecting = true;
    this.setStatus(strings.connecting);

    logTrace(this, `Connecting to ${peer.host}:${peer.port} as profile ${data.profileId}`);
    this.controller.emitter.emit("authAttempt", {
      authGameData: { local: { profileId: data.profileId } },
    });
  }

  private disconnect() {
    this.isConnecting = false;
    this.controller.lookupListener(NetworkingService).close();
    browserState.isConnected = false;
    this.setStatus(strings.disconnected);
  }

  private onConnectionAccepted() {
    if (!this.isActive) {
      return;
    }
    browserState.isConnected = true;
    this.setStatus(strings.connected);
  }

  private onCreateActorMessage(e: ConnectionMessage<CreateActorMessage>) {
    if (!this.isActive || !e.message.isMe) {
      return;
    }
    this.isConnecting = false;
    browserState.isConnected = true;
    if (this.isMenuOpen) {
      logTrace(this, `Spawned, closing the menu`);
      this.closeMenu();
    }
  }

  private onConnectionFailed() {
    if (!this.isActive) {
      return;
    }
    browserState.isConnected = false;
    this.setStatus(strings.connectionFailed);
  }

  private onConnectionDenied(e: ConnectionDenied) {
    if (!this.isActive) {
      return;
    }
    browserState.isConnected = false;

    // The server uses the SLikeNet password to reject incompatible protocol
    // versions, which surfaces here as "invalid password".
    const error = (e.error || '').toString();
    const isVersionMismatch = error.toLowerCase().includes("invalid password");

    // Server-supplied text goes into a single widget line, so trim it.
    const shown = isVersionMismatch
      ? strings.versionMismatch
      : error.replace(/[\r\n]+/g, ' ').slice(0, 120);

    this.setStatus(shown);

    if (isVersionMismatch && !this.isMenuOpen) {
      this.openMenu();
    }
  }

  private onConnectionDisconnect() {
    if (!this.isActive) {
      return;
    }
    browserState.isConnected = false;
    if (this.isConnecting) {
      this.setStatus(strings.connectionFailed);
    } else {
      this.setStatus(strings.connectionLost);
    }
  }

  private isConnected() {
    try {
      return this.controller.lookupListener(NetworkingService).isConnected();
    } catch (e) {
      return false;
    }
  }

  /**
   * Accepts "host", "host:port", "[ipv6]" and "[ipv6]:port". Returns null for
   * anything that is not a plausible address, so the player gets told instead of
   * the client silently dialing garbage.
   */
  public static parseAddress(raw: string): { host: string, port: number } | null {
    let value = (raw || '').trim();

    // Tolerate a pasted URL-ish value
    value = value.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '').replace(/\/+$/, '');

    if (value === '') {
      return null;
    }

    const bracketed = value.match(/^\[([^\]]+)\](?::(\d{1,5}))?$/);
    if (bracketed) {
      return ConnectMenuService.makePeer(bracketed[1], bracketed[2]);
    }

    const parts = value.split(':');
    if (parts.length === 1) {
      return ConnectMenuService.makePeer(parts[0], undefined);
    }
    if (parts.length === 2) {
      return ConnectMenuService.makePeer(parts[0], parts[1]);
    }

    // A bare IPv6 address is ambiguous without brackets
    return null;
  }

  private static makePeer(host: string, portStr?: string) {
    if (!/^[A-Za-z0-9._:-]+$/.test(host)) {
      return null;
    }

    let port = kDefaultPort;
    if (portStr !== undefined && portStr !== '') {
      if (!/^\d{1,5}$/.test(portStr)) {
        return null;
      }
      port = parseInt(portStr, 10);
      if (port < 1 || port > 65535) {
        return null;
      }
    }

    return { host, port };
  }

  private readData(): DirectConnectData {
    if (this.data) {
      return this.data;
    }

    let stored: Partial<DirectConnectData> = {};
    try {
      // @ts-expect-error (TODO: Remove in 2.10.0)
      const raw = this.sp.getPluginSourceCode(this.pluginDataName, "PluginsNoLoad");
      if (raw) {
        stored = JSON.parse(raw.slice(2)) || {};
      }
    } catch (e) {
      logTrace(this, `No stored connect data:`, e);
    }

    const settings = this.sp.settings["skymp5-client"];
    const configuredIp = settings["server-ip"] as string | undefined;
    const configuredPort = settings["server-port"] as number | undefined;
    const fallbackAddress = configuredIp
      ? `${configuredIp}:${configuredPort || kDefaultPort}`
      : '';

    this.data = {
      address: typeof stored.address === 'string' && stored.address !== ''
        ? stored.address
        : fallbackAddress,
      profileId: Number.isInteger(stored.profileId) && (stored.profileId as number) > 0
        ? stored.profileId as number
        : ConnectMenuService.generateProfileId(),
    };

    return this.data;
  }

  private writeData(data: DirectConnectData) {
    this.data = data;
    try {
      this.sp.writePlugin(
        this.pluginDataName,
        "//" + JSON.stringify(data),
        // @ts-expect-error (TODO: Remove in 2.10.0)
        "PluginsNoLoad"
      );
    } catch (e) {
      logError(this, `Failed to persist connect data:`, e, `- the address will not be remembered`);
    }
  }

  /**
   * In offline/direct mode the server keys a character by profileId, so every
   * player needs their own. It is generated once per installation and kept, so
   * reconnecting returns you to the same character.
   */
  private static generateProfileId(): number {
    // Positive int32: the server passes profileId around as a JS number and
    // stores it as a signed 32-bit value.
    return (crypto.randomBytes(4).readUInt32BE(0) % 0x7ffffffe) + 1;
  }

  // Runs in the browser (CEF) context. It may only use the variables injected by
  // FunctionInfo.getText: events, browserState, strings.
  private widgetSetter = () => {
    window.skyrimPlatform.widgets.set([{
      type: "form",
      id: 3,
      caption: strings.caption,
      elements: [
        {
          type: "text",
          text: strings.addressHint,
          tags: [],
        },
        {
          type: "inputText",
          initialValue: browserState.address,
          placeholder: "192.168.1.10:7777",
          tags: [],
          onInput: (e: any) => window.skyrimPlatform.sendMessage(
            events.addressChanged, e.target.value),
        },
        {
          type: "button",
          text: strings.connect,
          tags: ["BUTTON_STYLE_FRAME", "ELEMENT_STYLE_MARGIN_EXTENDED"],
          click: () => window.skyrimPlatform.sendMessage(events.connect),
          hint: strings.connectHint,
        },
        {
          type: "button",
          text: strings.disconnect,
          tags: [],
          isDisabled: !browserState.isConnected,
          click: () => window.skyrimPlatform.sendMessage(events.disconnect),
          hint: strings.disconnectHint,
        },
        {
          type: "button",
          text: strings.close,
          tags: [],
          click: () => window.skyrimPlatform.sendMessage(events.close),
        },
        {
          type: "text",
          text: browserState.statusLines[0],
          tags: [],
        },
        {
          type: "text",
          text: browserState.statusLines[1],
          tags: [],
        },
      ],
    }]);
  };

  private trigger = {
    authNeededFired: false,
    browserWindowLoadedFired: false,

    get conditionMet() {
      return this.authNeededFired && this.browserWindowLoadedFired;
    }
  };

  private data: DirectConnectData | null = null;
  private isMenuOpen = false;
  private isConnecting = false;
  private everOpened = false;

  private readonly pluginDataName = `connect-data-no-load`;
}

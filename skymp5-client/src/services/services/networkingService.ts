import { logTrace, logError } from "../../logging";
import { NeverError } from "../../lib/errors";
import { MsgType } from "../../messages";
import { SendMessageEvent } from "../events/sendMessageEvent";
import { SendMessageWithRefrIdEvent } from "../events/sendMessageWithRefrIdEvent";
import { AnyMessage } from "../messages/anyMessage";
import { ClientListener, CombinedController, Sp } from "./clientListener";
import { RemoteServer } from "./remoteServer";
import { SendRawMessageEvent } from "../events/sendRawMessageEvent";

export class NetworkingService extends ClientListener {
  constructor(private sp: Sp, private controller: CombinedController) {
    super();
    this.controller.on("tick", () => this.onTick());

    this.controller.emitter.on("sendMessage", (e) => this.onSendMessage(e));
    this.controller.emitter.on("sendRawMessage", (e) => this.onSendRawMessage(e));
    this.controller.emitter.on("sendMessageWithRefrId", (e) => this.onSendMessageWithRefrId(e));
  }

  private onSendMessage(e: SendMessageEvent<AnyMessage>) {
    this.sp.mpClientPlugin.send(JSON.stringify(e.message), this.isReliable(e.reliability));
  }

  private onSendRawMessage(e: SendRawMessageEvent) {
    // @ts-expect-error
    this.sp.mpClientPlugin.sendRaw(e.rawMessage, e.rawMessage.byteLength, this.isReliable(e.reliability));
  }

  private onSendMessageWithRefrId(e: SendMessageWithRefrIdEvent<AnyMessage>) {
    const refrId = e.message._refrId;

    const remoteServer = this.controller.lookupListener(RemoteServer);

    const idxInModel = refrId
      ? remoteServer.getWorldModel().forms.findIndex((f) => f && f.refrId === refrId)
      : remoteServer.getWorldModel().playerCharacterFormIdx;

    // fixes "can't get property idx of null or undefined"
    if (!remoteServer.getWorldModel().forms[idxInModel]) {
      return;
    }

    // @ts-ignore
    e.message.idx = remoteServer.getWorldModel().forms[idxInModel].idx;

    delete e.message._refrId;

    this.sp.mpClientPlugin.send(JSON.stringify(e.message), this.isReliable(e.reliability));
  }

  connect(hostName: string, port: number) {
    const current = this.serverAddress;
    const addressChanged = current.hostName !== hostName || current.port !== port;

    if (addressChanged) {
      // Tear down any in-flight attempt to the previous host, otherwise the old
      // socket keeps retrying in the background for its whole timeout.
      this.sp.mpClientPlugin.destroyClient();
    }

    this.serverAddress = { hostName, port };
    this.reconnectAttempts = 0;
    this.reconnectAtMs = 0;
    this.createClientSafe();
  }

  reconnect() {
    this.scheduleReconnect();
  }

  close() {
    // Cancel a pending reconnect, otherwise an explicit disconnect would be
    // silently undone a second later.
    this.reconnectAtMs = 0;
    this.reconnectAttempts = 0;
    this.sp.mpClientPlugin.destroyClient();
  }

  isConnected() {
    return this.sp.mpClientPlugin.isConnected();
  }

  /**
   * Retrying immediately on every failure means a typo in the address produces a
   * tight loop of connection attempts. Back off instead, capped so that a
   * recoverable hiccup still reconnects promptly.
   */
  private scheduleReconnect() {
    const { hostName, port } = this.serverAddress;
    if (hostName === "" || port === 0) {
      // Nothing to reconnect to yet (no address chosen). Retrying would just log
      // an error every tick.
      return;
    }

    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 10);
    this.reconnectAtMs = Date.now() + delayMs;
    logTrace(this, `Reconnect scheduled in ${delayMs} ms`);
  }

  private onTick() {
    if (this.reconnectAtMs !== 0 && Date.now() >= this.reconnectAtMs) {
      this.reconnectAtMs = 0;
      this.createClientSafe();
    }

    this.sp.mpClientPlugin.tick((packetType, rawContent, error) => {
      switch (packetType) {
        case "connectionAccepted":
          this.reconnectAttempts = 0;
          this.reconnectAtMs = 0;
          this.controller.emitter.emit("connectionAccepted", {});
          break;
        case "connectionDenied":
          this.controller.emitter.emit("connectionDenied", { error });
          this.scheduleReconnect();
          break;
        case "connectionFailed":
          this.controller.emitter.emit("connectionFailed", {});
          this.scheduleReconnect();
          break;
        case "disconnect":
          this.controller.emitter.emit("connectionDisconnect", {});
          this.scheduleReconnect();
          break;
        case "message":
          // TODO: in theory can be empty jsonContent and non-empty error

          let msgAny: AnyMessage;
          
          if (rawContent === null) {
            msgAny = {} as AnyMessage;
            logError(this, "null rawContent");
          } else if ((new Uint8Array(rawContent as unknown as ArrayBuffer)[0]) === 0x7b) {
            // assume json
            msgAny = JSON.parse(this.sp.decodeUtf8(rawContent as unknown as ArrayBuffer));
          } else {
            // assume raw
            const event = { rawContent: rawContent as unknown as ArrayBuffer};
            return this.controller.emitter.emit("anyRawMessage", event);
          }

          if (msgAny.t === MsgType.OpenContainer) {
            const event = { message: msgAny };
            this.controller.emitter.emit("openContainerMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.UpdateMovement) {
            const event = { message: msgAny };
            this.controller.emitter.emit("updateMovementMessage", event)
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.UpdateAnimation) {
            const event = { message: msgAny };
            this.controller.emitter.emit("updateAnimationMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.UpdateEquipment) {
            const event = { message: msgAny };
            this.controller.emitter.emit("updateEquipmentMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.ChangeValues) {
            const event = { message: msgAny };
            this.controller.emitter.emit("changeValuesMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.SpellCast) {
            const event = { message: msgAny };
            this.controller.emitter.emit("spellCastMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.UpdateAnimVariables) {
            const event = { message: msgAny };
            this.controller.emitter.emit("updateAnimVariablesMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.UpdateAppearance) {
            const event = { message: msgAny };
            this.controller.emitter.emit("updateAppearanceMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.Teleport) {
            const event = { message: msgAny };
            this.controller.emitter.emit("teleportMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.UpdateProperty) {
            const event = { message: msgAny };
            this.controller.emitter.emit("updatePropertyMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.DeathStateContainer) {
            const event = { message: msgAny };
            this.controller.emitter.emit("deathStateContainerMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.CreateActor) {
            const event = { message: msgAny };
            this.controller.emitter.emit("createActorMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.CustomPacket) {
            const event = { message: msgAny };
            this.controller.emitter.emit("customPacketMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.DestroyActor) {
            const event = { message: msgAny };
            this.controller.emitter.emit("destroyActorMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.HostStart) {
            const event = { message: msgAny };
            this.controller.emitter.emit("hostStartMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.HostStop) {
            const event = { message: msgAny };
            this.controller.emitter.emit("hostStopMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.SetInventory) {
            const event = { message: msgAny };
            this.controller.emitter.emit("setInventoryMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.SetRaceMenuOpen) {
            const event = { message: msgAny };
            this.controller.emitter.emit("setRaceMenuOpenMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.SpSnippet) {
            const event = { message: msgAny };
            this.controller.emitter.emit("spSnippetMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.UpdateGamemodeData) {
            const event = { message: msgAny };
            this.controller.emitter.emit("updateGamemodeDataMessage", event);
            this.controller.emitter.emit("anyMessage", event);
          } else if (msgAny.t === MsgType.Teleport2) {
            const event = { message: msgAny };
            this.controller.emitter.emit("teleportMessage2", event);
            this.controller.emitter.emit("anyMessage", event);
          } else {
            // throw new NeverError(msgAny);
            throw new Error("Unhandled MsgType " + msgAny.t);
          }
          break;
      }
    });
  }

  private createClientSafe() {
    const { hostName, port } = this.serverAddress;

    logTrace(this, "createClientSafe " + hostName + ":" + port);

    if (this.serverAddress.hostName !== "" && this.serverAddress.port !== 0) {
      this.sp.mpClientPlugin.createClient(hostName, port);
    } else {
      logError(this, "createClientSafe failed");
    }
  }

  private get serverAddress(): { hostName: string, port: number } {
    const res: unknown = this.sp.storage["serverAddress"];
    if (typeof res === "object") {
      const result = res as { hostName: string, port: number };
      if (typeof result.hostName === "string" && typeof result.port === "number") {
        return result;
      }
    }
    return { hostName: "", port: 0 };
  }

  private set serverAddress(newValue: { hostName: string, port: number }) {
    this.sp.storage["serverAddress"] = newValue;
  }

  private isReliable(reliability: "reliable" | "unreliable") {
    switch (reliability) {
      case "reliable":
        return true;
      case "unreliable":
        return false;
      default:
        throw new NeverError(reliability);
    }
  }

  private reconnectAttempts = 0;
  private reconnectAtMs = 0;
};

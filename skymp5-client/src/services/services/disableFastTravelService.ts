import { ClientListener, Sp, CombinedController } from "./clientListener";
import { GameLoadEvent } from "../events/gameLoadEvent";

// Fast travel must stay off for the whole session, but the flag is game state
// rather than something that decays per frame. Re-applying it on a slow timer
// keeps the guarantee (in case a script or a load re-enables it) while dropping
// ~99% of the native Papyrus calls the previous per-frame version made.
const reapplyIntervalMs = 5000;

export class DisableFastTravelService extends ClientListener {
    constructor(private sp: Sp, private controller: CombinedController) {
        super();

        this.controller.on("update", () => this.onUpdate());
        this.controller.emitter.on("gameLoad", (e: GameLoadEvent) => this.disableFastTravel());
    }

    private onUpdate() {
        const now = Date.now();
        if (now - this.lastAppliedMs < reapplyIntervalMs) {
            return;
        }
        this.lastAppliedMs = now;
        this.disableFastTravel();
    }

    private disableFastTravel() {
        this.lastAppliedMs = Date.now();
        this.sp.Game.enableFastTravel(false);
    }

    private lastAppliedMs = 0;
}

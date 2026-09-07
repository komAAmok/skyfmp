import * as fs from "fs";
import * as path from "path";

/**
 * Directory the server executable lives in.
 *
 * The packaged server is a single executable produced with Node SEA and is
 * usually started by double-clicking it, so the process working directory
 * cannot be trusted. Everything the server needs at runtime (scam_native.node,
 * server-settings.json, data/, gamemode.js, ...) sits next to the executable
 * and is resolved relative to it.
 *
 * When the server is launched as plain Node during development
 * (`node dist_back/skymp5-server.js` from the repo root), process.execPath is
 * the Node binary itself and has none of these files beside it; fall back to
 * the working directory in that case.
 */
export const serverRoot = (() => {
  const exeDir = path.dirname(process.execPath);
  if (
    fs.existsSync(path.join(exeDir, "scam_native.node")) ||
    fs.existsSync(path.join(exeDir, "server-settings.json"))
  ) {
    return exeDir;
  }
  return process.cwd();
})();

export const resolveInServerRoot = (p: string): string =>
  path.isAbsolute(p) ? p : path.join(serverRoot, p);
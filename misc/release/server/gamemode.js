// Minimal gamemode.
//
// The server reloads this file whenever it changes and exposes the `mp` API
// (mp.get / mp.set / mp.onDeath / ... ). Leaving it empty gives plain
// free-roam multiplayer: players spawn, sync and can play together with no
// extra rules on top.
//
// Everything below is optional; delete or extend as you like.

// eslint-disable-next-line no-undef
const server = mp;

server.onDeath = (actorId, killerId) => {
  console.log(`actor ${actorId.toString(16)} died (killer ${killerId.toString(16)})`);
};

console.log("gamemode.js loaded");

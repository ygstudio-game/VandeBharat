// WebSocket gateway — room-based pub/sub for pipeline stage events
// sessionRooms: specific session subscribers
// globalClients: dashboard / general listeners (receive all events)

const sessionRooms = new Map(); // sessionId → Set<WebSocket>
const globalClients = new Set();

function _send(ws, payload) {
  try {
    if (ws.readyState === 1 /* OPEN */) ws.send(payload);
  } catch (_) {}
}

function addGlobal(ws) {
  globalClients.add(ws);
}

function join(sessionId, ws) {
  if (!sessionRooms.has(sessionId)) sessionRooms.set(sessionId, new Set());
  sessionRooms.get(sessionId).add(ws);
}

function leaveAll(ws) {
  globalClients.delete(ws);
  for (const [sessionId, room] of sessionRooms) {
    room.delete(ws);
    if (room.size === 0) sessionRooms.delete(sessionId);
  }
}

// Emit to session-specific room AND all global listeners
function broadcast(sessionId, event) {
  const payload = JSON.stringify(event);
  const room = sessionRooms.get(sessionId);
  if (room) for (const ws of room) _send(ws, payload);
  for (const ws of globalClients) _send(ws, payload);
}

// Emit to every connected client (global + all rooms)
function broadcastAll(event) {
  const payload = JSON.stringify(event);
  for (const ws of globalClients) _send(ws, payload);
  for (const [, room] of sessionRooms) for (const ws of room) _send(ws, payload);
}

module.exports = { addGlobal, join, leaveAll, broadcast, broadcastAll };

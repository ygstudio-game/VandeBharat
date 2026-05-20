// Phase 6: WebSocket gateway — broadcast pipeline stage updates to connected frontend clients
const clients = new Map(); // sessionId → Set<WebSocket>

function broadcast(sessionId, event) {
  const room = clients.get(sessionId);
  if (!room) return;
  const payload = JSON.stringify(event);
  for (const ws of room) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

module.exports = { clients, broadcast };

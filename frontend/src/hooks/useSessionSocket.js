import { useState, useEffect, useRef, useCallback } from 'react';

const WS_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001')
  .replace(/^http/, 'ws');

// Singleton WS connection shared across all hook instances
let sharedWs = null;
const subscribers = new Set(); // (event) => void

function getSharedWs() {
  if (sharedWs && (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)) {
    return sharedWs;
  }
  sharedWs = new WebSocket(`${WS_BASE}/ws`);

  sharedWs.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      for (const cb of subscribers) cb(event);
    } catch (_) {}
  };

  sharedWs.onclose = () => {
    sharedWs = null;
    // Reconnect after 3s
    setTimeout(getSharedWs, 3000);
  };

  sharedWs.onerror = () => {
    sharedWs?.close();
  };

  return sharedWs;
}

// Subscribe to a session room after connection opens
function subscribeSession(sessionId) {
  const ws = getSharedWs();
  if (!sessionId) return;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
  } else {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
    }, { once: true });
  }
}

/**
 * Hook — subscribe to live pipeline events.
 * @param {string|null} sessionId  Specific session to subscribe to (null = global only)
 * @returns {{ lastEvent, connected }}
 */
export function useSessionSocket(sessionId = null) {
  const [lastEvent, setLastEvent] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  const onEvent = useCallback((event) => {
    // Filter to relevant events: global events OR events for this session
    if (!sessionId || !event.sessionId || event.sessionId === sessionId) {
      setLastEvent(event);
    }
  }, [sessionId]);

  useEffect(() => {
    subscribers.add(onEvent);
    wsRef.current = getSharedWs();

    // Track connected state
    const checkState = () => setConnected(wsRef.current?.readyState === WebSocket.OPEN);
    const interval = setInterval(checkState, 1000);
    checkState();

    if (sessionId) subscribeSession(sessionId);

    return () => {
      subscribers.delete(onEvent);
      clearInterval(interval);
    };
  }, [onEvent, sessionId]);

  return { lastEvent, connected };
}

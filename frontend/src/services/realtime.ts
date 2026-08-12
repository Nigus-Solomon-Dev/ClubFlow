/**
 * Realtime client built on socket.io.
 * Connects with the current JWT and lets the UI subscribe to live events.
 *
 * Connection states are tracked so the UI can tell the user when the live
 * link is down. When the socket reconnects after a drop, subscribers are
 * re-driven with the standard data events so they refetch the current state
 * and never silently miss an update from e.g. the kitchen.
 */
import { io, type Socket } from 'socket.io-client';
import { AUTH_STORAGE_KEYS } from '../constants';

export const REAL_TIME_EVENTS = {
  orderUpdated: 'order.updated',
  orderCancellationRequested: 'order.cancellation.requested',
  orderCancellationApproved: 'order.cancellation.approved',
  orderCancellationDecided: 'order.cancellation.decided',
  orderEditRequested: 'order.edit.requested',
  orderEditDecided: 'order.edit.decided',
  shiftAccepted: 'shift.accepted',
  shiftOpened: 'shift.opened',
  shiftClosed: 'shift.closed',
  inventoryUpdated: 'inventory.updated',
  dashboardUpdated: 'dashboard.updated',
  handoverChanged: 'handover.changed',
} as const;

export type RealTimeEvent = (typeof REAL_TIME_EVENTS)[keyof typeof REAL_TIME_EVENTS];

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

// Events shortlisted to re-fire after a reconnect so every subscriber page
// (POS, barman, dashboard) refetches the latest state and nothing is missed.
const RESYNC_EVENTS: RealTimeEvent[] = [
  REAL_TIME_EVENTS.orderUpdated,
  REAL_TIME_EVENTS.orderCancellationRequested,
  REAL_TIME_EVENTS.orderCancellationApproved,
  REAL_TIME_EVENTS.orderCancellationDecided,
  REAL_TIME_EVENTS.orderEditRequested,
  REAL_TIME_EVENTS.orderEditDecided,
  REAL_TIME_EVENTS.shiftAccepted,
  REAL_TIME_EVENTS.shiftOpened,
  REAL_TIME_EVENTS.shiftClosed,
  REAL_TIME_EVENTS.inventoryUpdated,
  REAL_TIME_EVENTS.dashboardUpdated,
  REAL_TIME_EVENTS.handoverChanged,
];

let socket: Socket | null = null;
let authSubscribed = false;
let hasConnectedBefore = false;
let currentStatus: ConnectionStatus = 'disconnected';

const statusHandlers = new Set<(status: ConnectionStatus) => void>();
const listeners = new Map<RealTimeEvent, Set<(payload: unknown) => void>>();

function setStatus(status: ConnectionStatus): void {
  if (currentStatus === status) return;
  currentStatus = status;
  statusHandlers.forEach((handler) => handler(status));
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
}

function fireLocal(event: RealTimeEvent, payload: unknown): void {
  listeners.get(event)?.forEach((handler) => handler(payload));
}

/**
 * Route every packet received on the socket through the listener map.
 * Registered once per connection, so subscriptions keep working across
 * reconnects and account switches (a new Socket object never drops them).
 */
function bindSocketEvents(): void {
  if (!socket) return;
  socket.offAny();
  socket.onAny((event: string, payload: unknown) => {
    fireLocal(event as RealTimeEvent, payload);
  });
}

/** Subscribe to connection status changes. Returns an unsubscribe function. */
export function subscribeConnectionStatus(
  handler: (status: ConnectionStatus) => void,
): () => void {
  statusHandlers.add(handler);
  handler(currentStatus);
  return () => {
    statusHandlers.delete(handler);
  };
}

export function connectionStatus(): ConnectionStatus {
  return currentStatus;
}

function authChanged(): void {
  // Connect only while a session exists; otherwise stop listening.
  const token = getToken();
  if (token) {
    connect(token);
  } else {
    disconnect();
  }
}

export function initRealtime(): void {
  if (authSubscribed || typeof window === 'undefined') return;
  authSubscribed = true;
  window.addEventListener('rm:auth', authChanged);
  window.addEventListener('storage', authChanged);
  const token = getToken();
  if (token) connect(token);
}

export function connect(token: string): void {
  if (typeof window === 'undefined') return;
  disconnect();
  setStatus('connecting');
  socket = io(WS_URL, {
    autoConnect: true,
    transports: ['websocket'],
    reconnectionAttempts: Infinity,
    auth: { token },
  });
  bindSocketEvents();

  socket.on('connect', () => {
    const wasReconnect = hasConnectedBefore;
    hasConnectedBefore = true;
    setStatus('connected');

    // On a real reconnect (not the very first link) make every subscriber
    // pull the current state so nothing was missed while offline.
    if (wasReconnect) {
      RESYNC_EVENTS.forEach((event) => fireLocal(event, {}));
    }
  });
  socket.on('disconnect', () => {
    setStatus('reconnecting');
  });
  socket.on('connect_error', () => {
    setStatus('reconnecting');
  });
}

export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  setStatus('disconnected');
}

export function on(
  event: RealTimeEvent,
  handler: (payload: unknown) => void,
): () => void {
  const handlers = listeners.get(event) ?? new Set();
  handlers.add(handler);
  listeners.set(event, handlers);

  return () => {
    handlers.delete(handler);
  };
}

export function live(): boolean {
  return socket?.connected ?? false;
}
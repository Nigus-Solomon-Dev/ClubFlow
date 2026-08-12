'use client';

import { useEffect, useRef, useState } from 'react';
import { canAccess, useAuth } from '../context/AuthContext';
import { on, REAL_TIME_EVENTS, type RealTimeEvent } from '../services/realtime';
import type { Role } from '../types';

interface Toast {
  id: number;
  message: string;
}

function messageFor(
  event: RealTimeEvent,
  role: Role,
): string | null {
  switch (event) {
    case REAL_TIME_EVENTS.orderCancellationRequested:
      return 'A cancellation has been requested';
    case REAL_TIME_EVENTS.orderCancellationApproved:
      return 'Barman approved a cancellation';
    case REAL_TIME_EVENTS.orderCancellationDecided:
      return 'A cancellation request was decided';
    case REAL_TIME_EVENTS.orderEditRequested:
      return canAccess(role, ['BARMAN', 'MANAGER'])
        ? 'An order edit was requested'
        : null;
    case REAL_TIME_EVENTS.orderEditDecided:
      return canAccess(role, ['WAITER', 'MANAGER'])
        ? 'An order edit was decided'
        : null;
    case REAL_TIME_EVENTS.shiftAccepted:
      return canAccess(role, ['WAITER']) ? 'Your shift money was accepted' : null;
    case REAL_TIME_EVENTS.shiftOpened:
      return null;
    case REAL_TIME_EVENTS.shiftClosed:
      return null;
    case REAL_TIME_EVENTS.inventoryUpdated:
      return canAccess(role, ['BARMAN', 'MANAGER'])
        ? 'Inventory was updated'
        : null;
    case REAL_TIME_EVENTS.orderUpdated:
      return canAccess(role, ['MANAGER', 'OWNER'])
        ? 'An order was updated'
        : null;
    case REAL_TIME_EVENTS.dashboardUpdated:
      return null;
    case REAL_TIME_EVENTS.handoverChanged:
      return null;
    default:
      return null;
  }
}

const WATCH_EVENTS: RealTimeEvent[] = [
  REAL_TIME_EVENTS.orderUpdated,
  REAL_TIME_EVENTS.orderCancellationRequested,
  REAL_TIME_EVENTS.orderCancellationApproved,
  REAL_TIME_EVENTS.orderCancellationDecided,
  REAL_TIME_EVENTS.orderEditRequested,
  REAL_TIME_EVENTS.orderEditDecided,
  REAL_TIME_EVENTS.shiftAccepted,
  REAL_TIME_EVENTS.inventoryUpdated,
];

export function LiveToasts() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const role = user?.role;

  useEffect(() => {
    if (!role) return;
    const unsubs = WATCH_EVENTS.map((event) =>
      on(event, () => {
        const message = messageFor(event, role);
        if (!message) return;
        const id = ++idRef.current;
        setToasts((t) => [...t.slice(-3), { id, message }]);
        window.setTimeout(() => {
          setToasts((t) => t.filter((toast) => toast.id !== id));
        }, 4000);
      }),
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [role]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="max-w-xs rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-lg"
        >
          <p className="text-sm font-medium text-zinc-900">{toast.message}</p>
        </div>
      ))}
    </div>
  );
}
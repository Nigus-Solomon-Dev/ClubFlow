'use client';

import { useEffect, useMemo } from 'react';
import { on, type RealTimeEvent } from '../services/realtime';

export function useRealtime(
  events: RealTimeEvent | RealTimeEvent[],
  handler: (payload: unknown) => void,
): void {
  const list = useMemo(
    () => (Array.isArray(events) ? events : [events]),
    [events],
  );
  useEffect(() => {
    const unsubs = list.map((event) => on(event, handler));
    return () => unsubs.forEach((unsub) => unsub());
  }, [list, handler]);
}
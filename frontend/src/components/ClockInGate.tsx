'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button, Card, EmptyState } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/hooks/useRealtime';
import { api } from '@/services/api';
import { REAL_TIME_EVENTS } from '@/services/realtime';
import type { Shift } from '@/types';

export default function ClockInGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    api
      .shifts()
      .then((s) => {
        setShifts(s);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(reload, [reload]);

  useRealtime(
    [
      REAL_TIME_EVENTS.shiftOpened,
      REAL_TIME_EVENTS.shiftClosed,
      REAL_TIME_EVENTS.shiftAccepted,
    ],
    reload,
  );

  const onDuty = shifts.some((s) => s.status === 'OPEN');

  useEffect(() => {
    if (!loaded || onDuty) return;
    const t = setTimeout(() => router.replace('/shifts'), 2500);
    return () => clearTimeout(t);
  }, [loaded, onDuty, router]);

  if (!loaded) {
    return <EmptyState>Checking your shift…</EmptyState>;
  }

  if (!onDuty) {
    return (
      <Card>
        <div className="py-8 text-center">
          <p className="mb-1 text-lg font-semibold text-zinc-900">
            You&rsquo;re not clocked in
          </p>
          <p className="mx-auto mb-5 max-w-sm text-sm text-zinc-500">
            {user?.role === 'WAITER'
              ? 'You can&rsquo;t take orders until you clock in.'
              : 'You can&rsquo;t start working until you clock in.'}
          </p>
          <Button onClick={() => router.push('/shifts')}>Go to Shifts</Button>
          <p className="mt-4 text-xs text-zinc-400">
            Redirecting you to Shifts…
          </p>
        </div>
      </Card>
    );
  }

  return <>{children}</>;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import DateText from '@/components/DateText';
import { Alert, Badge, Button, Card, EmptyState } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import type { Shift } from '@/types';

export default function ShiftsPage() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isManager = user?.role === 'MANAGER' || user?.role === 'OWNER';

  const reload = useCallback(() => {
    api
      .shifts()
      .then(setShifts)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  useEffect(reload, [reload]);

  async function run<T>(fn: () => Promise<T>, msg: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(msg);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function handleClose() {
    setError(null);
    setNotice(null);
    try {
      const s = await api.closeShift();
      setNotice(
        `Shift closed. Money to give: ${Number(s.expectedMoney ?? 0).toFixed(2)} ETB`,
      );
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  const myOpen = shifts.some(
    (s) => s.status === 'OPEN' && (!isManager || s.user?.id === user?.id),
  );

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Shifts</h1>
          <p className="text-sm text-zinc-500">
            {isManager ? 'All staff clock-ins' : 'Your clock-ins'}
          </p>
        </div>
        {!isManager ? (
          <div className="flex gap-2">
            <Button onClick={() => run(() => api.openShift(), 'Shift opened')} disabled={myOpen}>
              Clock in
            </Button>
            <Button variant="secondary" onClick={handleClose} disabled={!myOpen}>
              Clock out
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      {shifts.length === 0 ? (
        <Card>
          <EmptyState>No shifts recorded yet.</EmptyState>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-2 pr-4">{isManager ? 'Staff' : ''}</th>
                <th className="py-2 pr-4">Start</th>
                <th className="py-2 pr-4">End</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Money to give</th>
                <th className="py-2">Given</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100">
                  {isManager ? (
                    <td className="py-2 pr-4 font-medium text-zinc-900">{s.user?.name}</td>
                  ) : (
                    <td />
                  )}
                  <td className="py-2 pr-4 text-zinc-600"><DateText value={s.startedAt} /></td>
                  <td className="py-2 pr-4 text-zinc-600">{s.endedAt ? <DateText value={s.endedAt} /> : '—'}</td>
                  <td className="py-2 pr-4">
                    {s.status === 'OPEN' ? <Badge tone="green">OPEN</Badge> : <Badge tone="neutral">CLOSED</Badge>}
                  </td>
                  <td className="py-2 pr-4 font-semibold text-zinc-900">
                    {Number(s.expectedMoney ?? 0).toFixed(2)}
                  </td>
                  <td className="py-2">
                    {s.status === 'OPEN' ? (
                      <span className="text-zinc-400">—</span>
                    ) : s.paidAt ? (
                      <span className="font-semibold text-green-600">Given</span>
                    ) : (
                      <span className="font-medium text-amber-600">Not given</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
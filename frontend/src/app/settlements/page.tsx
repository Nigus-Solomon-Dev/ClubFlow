'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import { Alert, Badge, Button, Card, EmptyState } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import type { Role, Settlement, SettlementEntry, Shift } from '@/types';

export default function SettlementsPage() {
  const { user } = useAuth();
  const canAccept = user?.role === 'CASHIER' || user?.role === 'MANAGER' || user?.role === 'OWNER';
  const canViewShifts = canAccept;
  const canManage = user?.role === 'MANAGER' || user?.role === 'OWNER';

  const acceptTargets: Record<Role, Role | null> = {
    CASHIER: 'WAITER',
    MANAGER: 'CASHIER',
    OWNER: 'MANAGER',
    WAITER: null,
    BARMAN: null,
  };

  const [today, setToday] = useState<Settlement | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [history, setHistory] = useState<SettlementEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api
      .settlementToday()
      .then(setToday)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
    if (canViewShifts) {
      api
        .shiftsToday()
        .then(setShifts)
        .catch(() => undefined);
    }
    if (canManage) {
      api
        .settlementsHistory()
        .then((h) => setHistory(h.flatMap((x) => x.entries)))
        .catch(() => undefined);
    }
  }, [canViewShifts, canManage]);

  useEffect(reload, [reload]);

  async function acceptShift(s: Shift) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api.acceptShift(s.id);
      setNotice(`${s.user?.name ?? 'Employee'} money accepted.`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function closeDay() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const s = await api.closeSettlement();
      setToday(s);
      setNotice('Day closed.');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const remaining = (today?.expected ?? 0) - (today?.collected ?? 0);

  const chain = useMemo(() => {
    const sum = (rows: Shift[]) =>
      rows.reduce((acc, r) => acc + Number(r.expectedMoney ?? 0), 0);
    const waiters = shifts.filter((s) => s.user?.role === 'WAITER');
    const cashiers = shifts.filter((s) => s.user?.role === 'CASHIER');
    const managers = shifts.filter((s) => s.user?.role === 'MANAGER');
    return [
      {
        label: 'Waiters gave to cashier',
        given: sum(waiters.filter((s) => s.paidAt)),
        outstanding: sum(waiters.filter((s) => !s.paidAt)),
      },
      {
        label: 'Cashier gave to manager',
        given: sum(cashiers.filter((s) => s.paidAt)),
        outstanding: sum(cashiers.filter((s) => !s.paidAt)),
      },
      {
        label: 'Manager gave to owner',
        given: sum(managers.filter((s) => s.paidAt)),
        outstanding: sum(managers.filter((s) => !s.paidAt)),
      },
    ];
  }, [shifts]);

  const canAcceptRow = (s: Shift) =>
    canAccept &&
    s.user?.id !== user?.id &&
    acceptTargets[user!.role] === s.user?.role;

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">End of day</h1>
          <p className="text-sm text-zinc-500">
            Accept each waiter cash and close the day.
          </p>
        </div>
        {today ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={reload} disabled={busy} className="px-3 py-1.5">
              Refresh
            </Button>
            <Badge tone={today.isClosed ? 'green' : 'amber'}>
              {today.isClosed ? 'CLOSED' : 'OPEN'}
            </Badge>
          </div>
        ) : null}
      </header>

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      {!today ? (
        <EmptyState>Loading today settlement…</EmptyState>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat tile="Total expected" value={today.expected.toFixed(2)} />
            <Stat tile="Accepted" value={today.collected.toFixed(2)} tone="green" />
            <Stat
              tile="Remaining"
              value={remaining.toFixed(2)}
              tone={remaining <= 0 ? 'green' : 'amber'}
            />
          </div>

          <Card title={today.isClosed ? 'Day closed — summary' : 'Money to give'}>
            {shifts.length === 0 ? (
              <EmptyState>No shifts closed yet today.</EmptyState>
            ) : (
              <>
                <ul className="divide-y divide-zinc-100">
                  {shifts.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <p className="font-medium text-zinc-900">
                        {s.user?.name ?? 'Employee'}{' '}
                        <span className="font-normal text-zinc-500">
                          ({s.user?.role ?? ''})
                        </span>{' '}
                        <span className="font-normal text-zinc-500">
                          money to give:
                        </span>{' '}
                        <span className="font-semibold text-zinc-900">
                          {Number(s.expectedMoney ?? 0).toFixed(2)}
                        </span>
                      </p>
                      {s.paidAt ? (
                        <span className="text-sm font-semibold text-green-600">
                          Accepted
                        </span>
                      ) : canAcceptRow(s) ? (
                        <Button
                          variant="secondary"
                          onClick={() => acceptShift(s)}
                          disabled={busy}
                          className="px-3 py-1.5"
                        >
                          Accept
                        </Button>
                      ) : (
                        <span className="text-sm font-medium text-amber-600">
                          Not given
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {!today.isClosed ? (
                  <div className="mt-4 border-t border-zinc-100 pt-4">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (window.confirm('Close the day and lock the settlement?')) {
                          closeDay();
                        }
                      }}
                      disabled={busy}
                      className="w-full sm:w-auto"
                    >
                      Close the day
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Card>
        </>
      )}

      {canViewShifts ? (
        <Card title="Money chain — should tie" className="mt-6">
          <ul className="space-y-2">
            {chain.map((c) => (
              <li
                key={c.label}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="font-medium text-zinc-900">{c.label}</span>
                <span className="text-zinc-500">
                  <span className="font-semibold text-zinc-900">
                    {c.given.toFixed(2)}
                  </span>{' '}
                  given
                  {c.outstanding > 0 ? (
                    <span className="ml-2 font-medium text-amber-600">
                      + {c.outstanding.toFixed(2)} outstanding
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {canManage ? (
        <Card title="Recent settlements" className="mt-6">
          {history.length === 0 ? (
            <EmptyState>No settlement entries yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {history.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="font-medium text-zinc-900">{e.employeeName}</span>
                  <span className="text-zinc-500">
                    {e.expected.toFixed(2)} / {e.collected?.toFixed(2) ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </AppShell>
  );
}

function Stat({
  tile,
  value,
  tone = 'neutral',
}: {
  tile: string;
  value: ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red';
}) {
  const tones: Record<string, string> = {
    neutral: 'text-zinc-900',
    green: 'text-green-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  };
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{tile}</p>
      <p className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</p>
    </div>
  );
}

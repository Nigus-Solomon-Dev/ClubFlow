'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import { isToday } from '@/components/orders';
import { Alert, Badge, Button, Card, EmptyState } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/hooks/useRealtime';
import { api } from '@/services/api';
import { REAL_TIME_EVENTS } from '@/services/realtime';
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
      Promise.all([api.shifts(), api.shiftsToday()])
        .then(([all, todayList]) => {
          const map = new Map<string, Shift>();
          all.forEach((s) => map.set(s.id, s));
          todayList.forEach((s) => map.set(s.id, s));
          setShifts(Array.from(map.values()));
        })
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

  useRealtime(
    [
      REAL_TIME_EVENTS.shiftAccepted,
      REAL_TIME_EVENTS.shiftClosed,
      REAL_TIME_EVENTS.shiftOpened,
      REAL_TIME_EVENTS.handoverChanged,
      REAL_TIME_EVENTS.dashboardUpdated,
    ],
    reload,
  );

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
      setTimeout(() => setError(null), 3500);
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
      setTimeout(() => setError(null), 3500);
    } finally {
      setBusy(false);
    }
  }

  const isCashier = user?.role === 'CASHIER';

  const myOpenShift = useMemo(
    () => shifts.find((s) => s.user?.id === user?.id && s.status === 'OPEN'),
    [shifts, user],
  );
  const myUnacceptedClosed = useMemo(
    () =>
      shifts.find(
        (s) =>
          s.user?.id === user?.id &&
          s.status === 'CLOSED' &&
          !s.paidAt &&
          isToday(s.endedAt ?? s.startedAt),
      ),
    [shifts, user],
  );
  const activeCashierShift = myOpenShift ?? myUnacceptedClosed;

  const waiterShifts = useMemo(() => {
    if (!isCashier) {
      return shifts.filter(
        (s) =>
          s.user?.role === 'WAITER' && isToday(s.endedAt ?? s.startedAt),
      );
    }
    // If cashier's shift was accepted by manager or cashier is off-duty, start 100% fresh (empty)
    if (!activeCashierShift) return [];

    const cashierStartTime = new Date(activeCashierShift.startedAt).getTime();
    const cashierEndTime = activeCashierShift.endedAt
      ? new Date(activeCashierShift.endedAt).getTime() + 10000
      : Date.now() + 10000;

    return shifts.filter((s) => {
      if (s.user?.role !== 'WAITER') return false;
      // If unpaid, show if from today
      if (!s.paidAt) return isToday(s.endedAt ?? s.startedAt);
      // If paid, only show if it was accepted in this active cashier shift cycle
      const time = new Date(s.endedAt ?? s.startedAt).getTime();
      return time >= cashierStartTime && time <= cashierEndTime;
    });
  }, [shifts, isCashier, activeCashierShift]);

  const cashierExpected = useMemo(
    () =>
      waiterShifts.reduce(
        (acc, s) => acc + Number(s.expectedMoney ?? 0),
        0,
      ),
    [waiterShifts],
  );
  const cashierCollected = useMemo(
    () =>
      waiterShifts
        .filter((s) => s.paidAt)
        .reduce((acc, s) => acc + Number(s.expectedMoney ?? 0), 0),
    [waiterShifts],
  );

  const totalExpected = isCashier ? cashierExpected : (today?.expected ?? 0);
  const totalAccepted = isCashier ? cashierCollected : (today?.collected ?? 0);
  const remaining = totalExpected - totalAccepted;

  const chain = useMemo(() => {
    const sum = (rows: Shift[]) =>
      rows.reduce((acc, r) => acc + Number(r.expectedMoney ?? 0), 0);

    if (isCashier) {
      if (!activeCashierShift) {
        return [
          {
            label: 'Waiters gave to cashier (current cycle)',
            given: 0,
            outstanding: 0,
          },
          {
            label: 'Cashier gave to manager (current cycle)',
            given: 0,
            outstanding: 0,
          },
        ];
      }
      const cashierGiven = activeCashierShift.paidAt
        ? Number(activeCashierShift.expectedMoney ?? 0)
        : 0;
      const cashierOutstanding = !activeCashierShift.paidAt
        ? Number(activeCashierShift.expectedMoney ?? 0)
        : 0;

      return [
        {
          label: 'Waiters gave to cashier (current shift)',
          given: sum(waiterShifts.filter((s) => s.paidAt)),
          outstanding: sum(waiterShifts.filter((s) => !s.paidAt)),
        },
        {
          label: 'Cashier gave to manager (current shift)',
          given: cashierGiven,
          outstanding: cashierOutstanding,
        },
      ];
    }

    const todayWaiters = shifts.filter(
      (s) => s.user?.role === 'WAITER' && isToday(s.endedAt ?? s.startedAt),
    );
    const todayCashiers = shifts.filter(
      (s) => s.user?.role === 'CASHIER' && isToday(s.endedAt ?? s.startedAt),
    );
    const todayManagers = shifts.filter(
      (s) => s.user?.role === 'MANAGER' && isToday(s.endedAt ?? s.startedAt),
    );

    return [
      {
        label: 'Waiters gave to cashier (today)',
        given: sum(todayWaiters.filter((s) => s.paidAt)),
        outstanding: sum(todayWaiters.filter((s) => !s.paidAt)),
      },
      {
        label: 'Cashier gave to manager (today)',
        given: sum(todayCashiers.filter((s) => s.paidAt)),
        outstanding: sum(todayCashiers.filter((s) => !s.paidAt)),
      },
      {
        label: 'Manager gave to owner (today)',
        given: sum(todayManagers.filter((s) => s.paidAt)),
        outstanding: sum(todayManagers.filter((s) => !s.paidAt)),
      },
    ];
  }, [shifts, isCashier, activeCashierShift, waiterShifts]);

  const canAcceptRow = (s: Shift) =>
    canAccept &&
    s.user?.id !== user?.id &&
    acceptTargets[user!.role] === s.user?.role;

  const pendingShifts = useMemo(() => {
    if (user?.role === 'CASHIER') {
      return waiterShifts;
    }
    if (user?.role === 'MANAGER') {
      return shifts.filter(
        (s) =>
          (s.user?.role === 'CASHIER' || s.user?.role === 'WAITER') &&
          isToday(s.endedAt ?? s.startedAt),
      );
    }
    return shifts.filter((s) => s.user?.role !== 'OWNER');
  }, [shifts, user, waiterShifts]);

  const pastSettlement = useMemo(() => {
    return history.length > 0 ? history[0] : null;
  }, [history]);

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
            <Stat tile="Total expected" value={totalExpected.toFixed(2)} />
            <Stat tile="Accepted" value={totalAccepted.toFixed(2)} tone="green" />
            <Stat
              tile="Remaining"
              value={Math.max(0, remaining).toFixed(2)}
              tone={remaining <= 0 ? 'green' : 'amber'}
            />
          </div>

          <Card title={today.isClosed ? 'Day closed — summary' : 'Money to give'}>
            {pendingShifts.length === 0 ? (
              <EmptyState>
                {isCashier && !activeCashierShift
                  ? 'No active shift cycle. All settled & fresh.'
                  : 'No shifts waiting to be collected.'}
              </EmptyState>
            ) : (
              <>
                <ul className="divide-y divide-zinc-100">
                  {pendingShifts.map((s) => (
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
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Today's live money chain — should tie">
            <ul className="space-y-3">
              {chain.map((c) => (
                <li
                  key={c.label}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-zinc-100 pb-2.5 last:border-0 last:pb-0"
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
                    ) : (
                      <span className="ml-2 font-medium text-green-600">
                        (0.00 outstanding)
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {canManage && pastSettlement ? (
            <Card title="Yesterday & past closed settlements">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                  <span>Staff member</span>
                  <span>Expected / Collected</span>
                </div>
                <ul className="divide-y divide-zinc-100 text-sm">
                  {history.slice(0, 5).map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="font-medium text-zinc-800">
                        {e.employeeName}
                      </span>
                      <span className="text-zinc-600">
                        {e.expected.toFixed(2)} /{' '}
                        <span className="font-semibold text-green-700">
                          {e.collected?.toFixed(2) ?? '—'}
                        </span>{' '}
                        ETB
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ) : null}
        </div>
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

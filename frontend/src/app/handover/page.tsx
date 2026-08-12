'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/hooks/useRealtime';
import { api } from '@/services/api';
import { REAL_TIME_EVENTS } from '@/services/realtime';
import { formatLeft, giveUnit } from '@/lib/stock';
import StockItemsList from '@/components/stock/StockItemsList';
import type {
  Employee,
  ManagerStockHandover,
  Product,
  Shift,
  StockHandover,
  StockHandoverAlert,
} from '@/types';

interface GiveLine {
  productId: string;
  name: string;
  unit: string;
  qty: number;
  stockQty: number;
}

function fmtTime(d: string): string {
  return new Date(d).toLocaleString();
}

function GiveStockCard({
  products,
  barmans,
  openHandovers,
  onDutyIds,
  onChanged,
}: {
  products: Product[];
  barmans: Employee[];
  openHandovers: StockHandover[];
  onDutyIds: Set<string>;
  onChanged: () => void;
}) {
  const [barmanId, setBarmanId] = useState('');
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<{ product: Product; qty: number } | null>(null);
  const [cart, setCart] = useState<GiveLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => {
    if (q.trim() === '') return [];
    const needle = q.trim().toLowerCase();
    return products
      .filter((p) => p.isAvailable !== false)
      .filter((p) => p.name.toLowerCase().includes(needle))
      .slice(0, 20);
  }, [products, q]);

  const resultsEmpty = q.trim() !== '' && results.length === 0;

  function pickProduct(p: Product) {
    setPending({ product: p, qty: 1 });
  }

  function addPending() {
    if (!pending || pending.qty <= 0) return;
    const g = giveUnit(pending.product);
    const stockQty = pending.qty * g.factor;
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === pending.product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === pending.product.id
            ? {
                ...l,
                qty: l.qty + pending.qty,
                stockQty: l.stockQty + stockQty,
              }
            : l,
        );
      }
      return [
        ...prev,
        {
          productId: pending.product.id,
          name: pending.product.name,
          unit: g.name,
          qty: pending.qty,
          stockQty,
        },
      ];
    });
    setPending(null);
    setQ('');
  }

  function selectBarman(id: string) {
    setBarmanId(id);
    setCart([]);
    setPending(null);
  }

  async function handOver() {
    setError(null);
    setNotice(null);
    if (!barmanId) {
      setError('Select the barman who is on duty.');
      return;
    }
    if (cart.length === 0) {
      setError('Add at least one item to hand over.');
      return;
    }
    setBusy(true);
    try {
      const saved = await api.giveStock({
        barmanId,
        items: cart.map((c) => ({ productId: c.productId, givenQty: c.stockQty })),
      });
      setNotice(
        `Stock added to ${saved.barman?.name ?? 'the barman'}. It is now on his balance.`,
      );
      setCart([]);
      setPending(null);
      setQ('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to hand over stock');
    } finally {
      setBusy(false);
    }
  }

  const selectedOpen = openHandovers.find((h) => h.barman?.id === barmanId);

  return (
    <Card title="Give stock to a barman">
      <label className="text-sm font-medium text-zinc-700">Barman (on duty)</label>
      <select
        value={barmanId}
        onChange={(e) => selectBarman(e.target.value)}
        className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">Select a barman…</option>
        {barmans.map((b) => {
          const onDuty = onDutyIds.has(b.id);
          return (
            <option key={b.id} value={b.id}>
              {b.name} {onDuty ? '· on duty' : '· not clocked in'}
            </option>
          );
        })}
      </select>

      {!barmanId ? (
        <EmptyState>
          Select a barman who has clocked in. Stock can only be given to an open
          stock balance.
        </EmptyState>
      ) : (
        <>
          {selectedOpen ? (
            <p className="mb-3 text-xs text-zinc-500">
              {selectedOpen.items.length} product
              {selectedOpen.items.length === 1 ? '' : 's'} on his balance since{' '}
              {fmtTime(selectedOpen.openedAt)}
            </p>
          ) : (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This barman has not clocked in yet. Ask them to open their stock
              from their History screen.
            </div>
          )}

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a drink to give…"
            autoFocus
            className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-500"
          />

          {results.length > 0 ? (
            <div className="mb-3 max-h-48 space-y-1 overflow-auto">
              {results.map((p) => {
                const g = giveUnit(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => pickProduct(p)}
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <span className="truncate font-medium text-zinc-900">
                      {p.name}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">
                      in whole {g.name.toLowerCase()}s
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {resultsEmpty ? (
            <div className="mb-3">
              <EmptyState>No drinks match your search.</EmptyState>
            </div>
          ) : null}

          {pending ? (
            <div className="mb-3 rounded-lg border border-zinc-200 p-3">
              <p className="text-sm font-medium text-zinc-900">
                {pending.product.name}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="h-8 w-8 px-0"
                    onClick={() =>
                      setPending((p) =>
                        p ? { ...p, qty: Math.max(1, p.qty - 1) } : p,
                      )
                    }
                  >
                    −
                  </Button>
                  <span className="w-8 text-center text-lg font-semibold">
                    {pending.qty}
                  </span>
                  <Button
                    variant="secondary"
                    className="h-8 w-8 px-0"
                    onClick={() =>
                      setPending((p) => (p ? { ...p, qty: p.qty + 1 } : p))
                    }
                  >
                    +
                  </Button>
                  <span className="text-sm text-zinc-500">
                    whole {giveUnit(pending.product).name.toLowerCase()}
                  </span>
                </div>
                <Button onClick={addPending}>Add</Button>
              </div>
            </div>
          ) : null}

          {cart.length > 0 ? (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm">
              {cart.map((c) => (
                <li
                  key={c.productId}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate font-medium text-zinc-900">
                    {c.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-zinc-600">
                      {c.qty} {c.unit.toLowerCase()}
                      {c.qty > 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() =>
                        setCart((prev) =>
                          prev.filter((l) => l.productId !== c.productId),
                        )
                      }
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          {notice ? (
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {notice}
            </div>
          ) : null}

          <Button
            className="mt-4 w-full"
            onClick={handOver}
            disabled={busy || !barmanId || cart.length === 0 || !selectedOpen}
          >
            {busy ? 'Handing over…' : 'Hand over stock'}
          </Button>
        </>
      )}
    </Card>
  );
}

function GiveStockToManagerCard({
  products,
  managers,
  openHandover,
  onChanged,
}: {
  products: Product[];
  managers: Employee[];
  openHandover: ManagerStockHandover | null;
  onChanged: () => void;
}) {
  const [managerId, setManagerId] = useState('');
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<{ product: Product; qty: number } | null>(null);
  const [cart, setCart] = useState<GiveLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => {
    if (q.trim() === '') return [];
    const needle = q.trim().toLowerCase();
    return products
      .filter((p) => p.isAvailable !== false)
      .filter((p) => p.name.toLowerCase().includes(needle))
      .slice(0, 20);
  }, [products, q]);

  const resultsEmpty = q.trim() !== '' && results.length === 0;

  function pickProduct(p: Product) {
    setPending({ product: p, qty: 1 });
  }

  function addPending() {
    if (!pending || pending.qty <= 0) return;
    const g = giveUnit(pending.product);
    const stockQty = pending.qty * g.factor;
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === pending.product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === pending.product.id
            ? { ...l, qty: l.qty + pending.qty, stockQty: l.stockQty + stockQty }
            : l,
        );
      }
      return [
        ...prev,
        {
          productId: pending.product.id,
          name: pending.product.name,
          unit: g.name,
          qty: pending.qty,
          stockQty,
        },
      ];
    });
    setPending(null);
    setQ('');
  }

  async function handOver() {
    setError(null);
    setNotice(null);
    if (!managerId) {
      setError('Select the manager.');
      return;
    }
    if (cart.length === 0) {
      setError('Add at least one item to hand over.');
      return;
    }
    setBusy(true);
    try {
      const saved = await api.managerStockGive({
        managerId,
        items: cart.map((c) => ({ productId: c.productId, givenQty: c.stockQty })),
      });
      setNotice(
        `Stock added to ${saved.manager?.name ?? 'the manager'}. It is now on his balance.`,
      );
      setCart([]);
      setPending(null);
      setQ('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to hand over stock');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Give stock to the manager">
      <label className="text-sm font-medium text-zinc-700">Manager</label>
      <select
        value={managerId}
        onChange={(e) => setManagerId(e.target.value)}
        className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">Select a manager…</option>
        {managers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {openHandover?.manager?.id === m.id ? ' · balance open' : ''}
          </option>
        ))}
      </select>

      {!managerId ? (
        <EmptyState>
          Select the manager. Hand-over keeps adding to his open balance — the
          owner and the manager settle it together at the end.
        </EmptyState>
      ) : (
        <>
          {openHandover && openHandover.manager?.id === managerId ? (
            <p className="mb-3 text-xs text-zinc-500">
              {openHandover.items.length} product
              {openHandover.items.length === 1 ? '' : 's'} on his balance since{' '}
              {fmtTime(openHandover.openedAt)}
            </p>
          ) : (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This manager has no open balance yet — handing over will open one.
            </div>
          )}

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a drink to give…"
            className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-500"
          />

          {results.length > 0 ? (
            <div className="mb-3 max-h-48 space-y-1 overflow-auto">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickProduct(p)}
                  className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:border-zinc-400 hover:bg-zinc-50"
                >
                  <span className="truncate font-medium text-zinc-900">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">
                    in whole {giveUnit(p).name.toLowerCase()}s
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {resultsEmpty ? (
            <div className="mb-3">
              <EmptyState>No drinks match your search.</EmptyState>
            </div>
          ) : null}

          {pending ? (
            <div className="mb-3 rounded-lg border border-zinc-200 p-3">
              <p className="text-sm font-medium text-zinc-900">
                {pending.product.name}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="h-8 w-8 px-0"
                    onClick={() =>
                      setPending((p) =>
                        p ? { ...p, qty: Math.max(1, p.qty - 1) } : p,
                      )
                    }
                  >
                    −
                  </Button>
                  <span className="w-8 text-center text-lg font-semibold">
                    {pending.qty}
                  </span>
                  <Button
                    variant="secondary"
                    className="h-8 w-8 px-0"
                    onClick={() =>
                      setPending((p) => (p ? { ...p, qty: p.qty + 1 } : p))
                    }
                  >
                    +
                  </Button>
                  <span className="text-sm text-zinc-500">
                    whole {giveUnit(pending.product).name.toLowerCase()}
                  </span>
                </div>
                <Button onClick={addPending}>Add</Button>
              </div>
            </div>
          ) : null}

          {cart.length > 0 ? (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm">
              {cart.map((c) => (
                <li
                  key={c.productId}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate font-medium text-zinc-900">
                    {c.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-zinc-600">
                      {c.qty} {c.unit.toLowerCase()}
                      {c.qty > 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() =>
                        setCart((prev) =>
                          prev.filter((l) => l.productId !== c.productId),
                        )
                      }
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          {notice ? (
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {notice}
            </div>
          ) : null}

          <Button
            className="mt-4 w-full"
            onClick={handOver}
            disabled={busy || !managerId || cart.length === 0}
          >
            {busy ? 'Handing over…' : 'Hand over stock to the manager'}
          </Button>
        </>
      )}
    </Card>
  );
}

function AlertsCard({ alerts }: { alerts: StockHandoverAlert[] }) {
  const empties = alerts.filter((a) => a.level === 'empty');
  const warns = alerts.filter((a) => a.level === 'warn');

  return (
    <Card title="Running low — alerts">
      {alerts.length === 0 ? (
        <EmptyState>No drink is running low right now.</EmptyState>
      ) : (
        <>
          {empties.length > 0 ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">
              Out of stock
            </p>
          ) : null}
          <ul className="space-y-1">
            {empties.map((a) => (
              <li
                key={`${a.handoverId}-${a.product.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-red-800">
                    {a.product.name}
                  </p>
                  <p className="text-xs text-red-600">{a.barman.name}</p>
                </div>
                <Badge tone="red">0 left</Badge>
              </li>
            ))}
          </ul>

          {warns.length > 0 ? (
            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-amber-500">
              Below one full unit
            </p>
          ) : null}
          <ul className="space-y-1">
            {warns.map((a) => (
              <li
                key={`${a.handoverId}-${a.product.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-amber-800">
                    {a.product.name}
                  </p>
                  <p className="text-xs text-amber-600">{a.barman.name}</p>
                </div>
                <Badge tone="amber">{formatLeft(a.product, a.left)} left</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function ClosedHandoversCard({
  handovers,
  onChanged,
}: {
  handovers: StockHandover[];
  onChanged: () => void;
}) {
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept(h: StockHandover) {
    setError(null);
    setAcceptingId(h.id);
    try {
      await api.acceptStockHandover(h.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept stock');
    } finally {
      setAcceptingId(null);
    }
  }

  const pending = handovers.filter((h) => !h.acceptedAt);

  if (pending.length === 0) {
    return (
      <Card title="Closed stock (barman)">
        <EmptyState>No closed barman stock waiting to be accepted.</EmptyState>
      </Card>
    );
  }
  return (
    <Card title="Closed stock (barman)">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map((h) => (
          <div key={h.id} className="rounded-lg border border-zinc-200 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-zinc-900">
                {h.barman?.name ?? 'Barman'}
              </p>
              <p className="text-xs text-zinc-500">
                Closed {fmtTime(h.closedAt ?? h.openedAt)}
              </p>
            </div>
            <StockItemsList handover={h} />
            <div className="mt-3">
              <Button
                className="w-full"
                onClick={() => accept(h)}
                disabled={acceptingId === h.id}
              >
                {acceptingId === h.id ? 'Accepting…' : 'Accept'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ClosedManagerHandoverCard({
  handovers,
  onChanged,
}: {
  handovers: ManagerStockHandover[];
  onChanged: () => void;
}) {
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept(h: ManagerStockHandover) {
    setError(null);
    setAcceptingId(h.id);
    try {
      await api.acceptManagerStockHandover(h.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept stock');
    } finally {
      setAcceptingId(null);
    }
  }

  const pending = handovers.filter((h) => h.status === 'CLOSED' && !h.acceptedAt);

  if (pending.length === 0) {
    return (
      <Card title="Closed stock (manager)">
        <EmptyState>No closed manager stock waiting to be accepted.</EmptyState>
      </Card>
    );
  }
  return (
    <Card title="Closed stock — accept from the manager">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map((h) => (
          <div key={h.id} className="rounded-lg border border-zinc-200 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-zinc-900">
                {h.manager?.name ?? 'Manager'}
              </p>
              <p className="text-xs text-zinc-500">
                Counted {fmtTime(h.closedAt ?? h.openedAt)}
              </p>
            </div>
            <StockItemsList handover={h} />
            <div className="mt-3">
              <Button
                className="w-full"
                onClick={() => accept(h)}
                disabled={acceptingId === h.id}
              >
                {acceptingId === h.id ? 'Accepting…' : 'Accept'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MyManagerStockCard({
  handovers,
  shifts,
  openBarmanCount,
  unacceptedCount,
  onChanged,
}: {
  handovers: ManagerStockHandover[];
  shifts: Shift[];
  openBarmanCount: number;
  unacceptedCount: number;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const open = handovers.find((h) => h.status === 'OPEN');
  const recent = useMemo(() => {
    if (open) return open;
    const closed = handovers
      .filter((h) => h.status === 'CLOSED')
      .sort(
        (a, b) =>
          new Date(b.closedAt ?? b.openedAt).getTime() -
          new Date(a.closedAt ?? a.openedAt).getTime(),
      );
    return closed[0] ?? null;
  }, [handovers, open]);

  const pendingSettle = useMemo(
    () =>
      shifts.find(
        (s) => s.user?.id === user?.id && s.isSettle && !s.paidAt,
      ) ?? null,
    [shifts, user],
  );

  const lastSettle = useMemo(() => {
    const settles = shifts
      .filter((s) => s.user?.id === user?.id && s.isSettle)
      .sort(
        (a, b) =>
          new Date(b.endedAt ?? b.startedAt).getTime() -
          new Date(a.endedAt ?? a.startedAt).getTime(),
      );
    return settles[0] ?? null;
  }, [shifts, user]);

  const moneyToGive = useMemo(() => {
    if (pendingSettle) return Number(pendingSettle.expectedMoney ?? 0);
    const windowStart = lastSettle
      ? new Date(lastSettle.endedAt ?? lastSettle.startedAt)
      : new Date(0);
    return shifts
      .filter(
        (s) =>
          s.paidById === user?.id &&
          s.user?.role === 'CASHIER' &&
          s.paidAt &&
          new Date(s.paidAt) > windowStart,
      )
      .reduce((sum, s) => sum + Number(s.expectedMoney ?? 0), 0);
  }, [shifts, pendingSettle, lastSettle, user]);

  async function doSettle() {
    setError(null);
    setNotice(null);
    const items = (open?.items ?? []).map((it) => ({
      productId: it.productId,
      countedQty: it.left,
    }));
    setBusy(true);
    try {
      const res = await api.managerStockSettle(items);
      setNotice(
        `Settled with the owner. Money to give: ${Number(
          res.shift.expectedMoney,
        ).toFixed(2)} — the owner accepts it on the End of day screen.${
          res.stock ? ' Stock closed for the owner to accept.' : ''
        }`,
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to settle');
    } finally {
      setBusy(false);
    }
  }

  const blockedByBarman =
    openBarmanCount > 0 || unacceptedCount > 0;
  const blockedMessage =
    openBarmanCount > 0
      ? `You cannot settle with the owner until every barman&apos;s stock batch is counted and closed (${openBarmanCount} still open).`
      : unacceptedCount > 0
        ? `Accept the counted barman stock first before settling — their returned stock lands back in your balance (${unacceptedCount} waiting).`
        : null;

  return (
    <Card title="My stock & settle">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="text-xs font-medium text-zinc-500">Money to give (to the owner)</p>
          <p className="mt-1 text-xl font-semibold text-zinc-900">
            {moneyToGive.toFixed(2)}
          </p>
          {pendingSettle ? (
            <p className="mt-1 text-xs text-amber-600">
              Waiting for the owner to accept your last settle.
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="text-xs font-medium text-zinc-500">Owner stock balance</p>
          <p className="mt-1 text-xl font-semibold text-zinc-900">
            {recent
              ? recent.status === 'OPEN'
                ? 'Open'
                : 'Closed'
              : 'None'}
          </p>
          {recent && recent.status === 'OPEN' ? (
            <p className="mt-1 text-xs text-zinc-500">
              given {recent.items.length} item
              {recent.items.length === 1 ? '' : 's'} · since{' '}
              {new Date(recent.openedAt).toLocaleDateString()}
            </p>
          ) : recent && recent.acceptedAt ? (
            <p className="mt-1 text-xs text-green-600">
              Accepted by the owner {fmtTime(recent.acceptedAt)}
            </p>
          ) : recent && recent.status === 'CLOSED' ? (
            <p className="mt-1 text-xs text-amber-600">
              Waiting for the owner to accept the count.
            </p>
          ) : null}
        </div>
      </div>

      {open ? (
        <>
          <StockItemsList handover={open} />
        </>
      ) : (
        <EmptyState>
          The owner has not given you stock yet. Money settling still works
          without an owner stock balance.
        </EmptyState>
      )}

      {blockedByBarman ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {blockedMessage}
        </div>
      ) : null}

      <Button
        className="mt-4 w-full"
        onClick={doSettle}
        disabled={busy || blockedByBarman || Boolean(pendingSettle)}
      >
        {busy
          ? 'Settling…'
          : pendingSettle
          ? 'Waiting for the owner'
          : 'Settle with the owner (clock out)'}
      </Button>
    </Card>
  );
}

function ManagerView() {
  const [handovers, setHandovers] = useState<StockHandover[]>([]);
  const [managerHandovers, setManagerHandovers] = useState<ManagerStockHandover[]>([]);
  const [alerts, setAlerts] = useState<StockHandoverAlert[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([
      api.stockHandovers(),
      api.managerStockHandovers(),
      api.stockHandoverAlerts(),
      api.employees(),
      api.products(),
      api.shifts(),
    ])
      .then(([h, mh, a, e, p, s]) => {
        setHandovers(h);
        setManagerHandovers(mh);
        setAlerts(a);
        setEmployees(e);
        setProducts(p);
        setShifts(s);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load'),
      );
  }, []);

  // Fast path for live updates: stock + shift state is all that can change.
  const reloadStock = useCallback(() => {
    Promise.all([
      api.stockHandovers(),
      api.managerStockHandovers(),
      api.stockHandoverAlerts(),
      api.shifts(),
    ])
      .then(([h, mh, a, s]) => {
        setHandovers(h);
        setManagerHandovers(mh);
        setAlerts(a);
        setShifts(s);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load'),
      );
  }, []);

  useEffect(reload, [reload]);
  useRealtime(
    [
      REAL_TIME_EVENTS.handoverChanged,
      REAL_TIME_EVENTS.orderUpdated,
      REAL_TIME_EVENTS.inventoryUpdated,
      REAL_TIME_EVENTS.shiftOpened,
      REAL_TIME_EVENTS.shiftClosed,
      REAL_TIME_EVENTS.shiftAccepted,
    ],
    reloadStock,
  );

  const barmans = useMemo(
    () => employees.filter((e) => e.role === 'BARMAN' && e.isActive !== false),
    [employees],
  );
  const openHandovers = useMemo(
    () => handovers.filter((h) => h.status === 'OPEN'),
    [handovers],
  );
  const closedHandovers = useMemo(
    () => handovers.filter((h) => h.status === 'CLOSED'),
    [handovers],
  );
  const openBarmanCount = openHandovers.length;
  const unacceptedCount = closedHandovers.filter((h) => !h.acceptedAt).length;
  const onDutyIds = useMemo(
    () =>
      new Set(
        shifts
          .filter((s) => s.status === 'OPEN')
          .map((s) => s.user?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    [shifts],
  );

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <GiveStockCard
          products={products}
          barmans={barmans}
          openHandovers={openHandovers}
          onDutyIds={onDutyIds}
          onChanged={reloadStock}
        />
        <AlertsCard alerts={alerts} />
      </div>

      <div className="mt-6">
        <MyManagerStockCard
          handovers={managerHandovers}
          shifts={shifts}
          openBarmanCount={openBarmanCount}
          unacceptedCount={unacceptedCount}
          onChanged={reloadStock}
        />
      </div>

      <div className="mt-6">
        <ClosedHandoversCard handovers={closedHandovers} onChanged={reloadStock} />
      </div>
    </div>
  );
}

function OwnerView() {
  const [handovers, setHandovers] = useState<StockHandover[]>([]);
  const [managerHandovers, setManagerHandovers] = useState<ManagerStockHandover[]>([]);
  const [alerts, setAlerts] = useState<StockHandoverAlert[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([
      api.stockHandovers(),
      api.managerStockHandovers(),
      api.stockHandoverAlerts(),
      api.employees(),
      api.products(),
      api.shifts(),
    ])
      .then(([h, mh, a, e, p, s]) => {
        setHandovers(h);
        setManagerHandovers(mh);
        setAlerts(a);
        setEmployees(e);
        setProducts(p);
        setShifts(s);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load'),
      );
  }, []);

  const reloadStock = useCallback(() => {
    Promise.all([
      api.stockHandovers(),
      api.managerStockHandovers(),
      api.stockHandoverAlerts(),
      api.shifts(),
    ])
      .then(([h, mh, a, s]) => {
        setHandovers(h);
        setManagerHandovers(mh);
        setAlerts(a);
        setShifts(s);
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load'),
      );
  }, []);

  useEffect(reload, [reload]);
  useRealtime(
    [
      REAL_TIME_EVENTS.handoverChanged,
      REAL_TIME_EVENTS.orderUpdated,
      REAL_TIME_EVENTS.inventoryUpdated,
      REAL_TIME_EVENTS.shiftOpened,
      REAL_TIME_EVENTS.shiftClosed,
      REAL_TIME_EVENTS.shiftAccepted,
    ],
    reloadStock,
  );

  const barmans = useMemo(
    () => employees.filter((e) => e.role === 'BARMAN' && e.isActive !== false),
    [employees],
  );
  const managers = useMemo(
    () => employees.filter((e) => e.role === 'MANAGER' && e.isActive !== false),
    [employees],
  );
  const openHandovers = useMemo(
    () => handovers.filter((h) => h.status === 'OPEN'),
    [handovers],
  );
  const managerOpen = managerHandovers.find((h) => h.status === 'OPEN') ?? null;
  const onDutyIds = useMemo(
    () =>
      new Set(
        shifts
          .filter((s) => s.status === 'OPEN')
          .map((s) => s.user?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    [shifts],
  );

  return (
    <div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <GiveStockToManagerCard
          products={products}
          managers={managers}
          openHandover={managerOpen}
          onChanged={reloadStock}
        />
        <AlertsCard alerts={alerts} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <GiveStockCard
            products={products}
            barmans={barmans}
            openHandovers={openHandovers}
            onDutyIds={onDutyIds}
            onChanged={reloadStock}
          />
        </div>
        <div>
          <ClosedManagerHandoverCard
            handovers={managerHandovers}
            onChanged={reloadStock}
          />
        </div>
      </div>
    </div>
  );
}

export default function HandoverPage() {
  const { user } = useAuth();

  if (!user) return null;
  if (user.role === 'CASHIER') {
    return (
      <div className="grid gap-6">
        <Card title="Stock handover">
          <p className="text-sm text-zinc-600">
            The cashier no longer handles stock. Your only job is collecting
            money from waiters (End of day).
          </p>
        </Card>
      </div>
    );
  }
  if (user.role === 'OWNER') return <OwnerView />;
  return <ManagerView />;
}
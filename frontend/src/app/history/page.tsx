'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { Alert, Card, EmptyState } from '@/components/ui';
import {
  CancelModal,
  EditOrderModal,
  isToday,
  OrderTable,
} from '@/components/orders';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/hooks/useRealtime';
import { api } from '@/services/api';
import { REAL_TIME_EVENTS } from '@/services/realtime';
import type { Order, Product, Shift } from '@/types';

export default function HistoryPage() {
  const { user } = useAuth();
  return (
    <AppShell>
      {user?.role === 'WAITER' ? (
        <WaiterHistory />
      ) : user?.role === 'BARMAN' ? (
        <BarmanHistory />
      ) : (
        <CashierHistory />
      )}
    </AppShell>
  );
}

function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    api
      .orders()
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);
  useEffect(reload, [reload]);
  return { orders, error, reload };
}

function ItemTotals({ orders, inHand }: { orders: Order[]; inHand: boolean }) {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    api
      .products()
      .then(setProducts)
      .catch(() => undefined);
  }, []);

  const served = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (o.status === 'COMPLETED') {
        for (const it of o.items ?? []) {
          map.set(it.productName, (map.get(it.productName) ?? 0) + it.quantity);
        }
      }
    }
    return map;
  }, [orders]);

  const hand = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (o.status === 'SENT') {
        for (const it of o.items ?? []) {
          map.set(it.productName, (map.get(it.productName) ?? 0) + it.quantity);
        }
      }
    }
    return map;
  }, [orders]);

  const rows = useMemo(() => {
    const merged = new Map<
      string,
      { name: string; served: number; hand: number }
    >();
    for (const p of products) {
      merged.set(p.name.toLowerCase(), {
        name: p.name,
        served: served.get(p.name) ?? 0,
        hand: hand.get(p.name) ?? 0,
      });
    }
    for (const [name] of served) {
      const key = name.toLowerCase();
      if (!merged.has(key)) {
        merged.set(key, {
          name,
          served: served.get(name) ?? 0,
          hand: hand.get(name) ?? 0,
        });
      }
    }

    const all = [...merged.values()];
    if (q.trim() === '') {
      return all
        .filter((r) => r.served > 0 || r.hand > 0)
        .sort((a, b) => b.served - a.served);
    }
    const needle = q.trim().toLowerCase();
    return all
      .filter((r) => r.name.toLowerCase().includes(needle))
      .sort((a, b) => b.served - a.served);
  }, [products, served, hand, q]);

  return (
    <Card title="Items" className="mb-6">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search an item, e.g. Sambuca"
        className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
      />
      {rows.length === 0 ? (
        <EmptyState>No items match your search.</EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {rows.map(({ name, served: servedQty, hand: handQty }) => (
            <li
              key={name}
              className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium text-zinc-900">{name}</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-zinc-500">
                  Served:{' '}
                  <span className="font-semibold text-zinc-900">{servedQty}</span>
                </span>
                {inHand ? (
                  <span className="text-zinc-500">
                    In hand:{' '}
                    <span className="font-semibold text-zinc-900">{handQty}</span>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WaiterHistory() {
  const { user } = useAuth();
  const { orders, error, reload } = useOrders();
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const refresh = useCallback(() => {
    reload();
    api
      .shifts()
      .then(setShifts)
      .catch(() => undefined);
  }, [reload]);

  useEffect(() => {
    api
      .shifts()
      .then(setShifts)
      .catch(() => undefined);
  }, []);

  useRealtime(
    [
      REAL_TIME_EVENTS.shiftAccepted,
      REAL_TIME_EVENTS.shiftOpened,
      REAL_TIME_EVENTS.orderUpdated,
    ],
    refresh,
  );

  const paidWindows = useMemo(
    () =>
      (shifts ?? [])
        .filter((s) => s.status === 'CLOSED' && !!s.paidAt)
        .map((s) => ({
          start: new Date(s.startedAt).getTime(),
          end: new Date(s.endedAt ?? s.startedAt).getTime(),
        })),
    [shifts],
  );

  const mine = useMemo(
    () =>
      orders.filter((o) => o.waiter?.id === user?.id && o.status !== 'DRAFT'),
    [orders, user],
  );

  const visible = useMemo(
    () =>
      mine.filter((o) => {
        if (o.shift) {
          return !o.shift.paidAt;
        }
        if (o.status === 'COMPLETED' || o.status === 'CANCELLED') {
          const t = new Date(o.createdAt).getTime();
          if (paidWindows.some((w) => t >= w.start && t <= w.end)) return false;
        }
        return true;
      }),
    [mine, paidWindows],
  );

  const pocketMoney = useMemo(
    () =>
      visible
        .filter((o) => o.status === 'COMPLETED')
        .reduce((s, o) => s + Number(o.totalPrice), 0),
    [visible],
  );

  async function submitCancel(reason: string) {
    if (!cancelOrder) return;
    await api.requestCancellation(cancelOrder.id, reason);
    setNotice('Cancellation sent. It will be reviewed before the order is cancelled.');
    reload();
  }

  return (
    <div>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      <div className="mb-6 flex items-center justify-end">
        <p className="text-sm text-zinc-500">
          Pocket money:{' '}
          <span className="font-semibold text-zinc-900">${pocketMoney.toFixed(2)}</span>
        </p>
      </div>

      <Card title="All my orders">
        {visible.length === 0 ? (
          <EmptyState>No orders yet — build one in POS.</EmptyState>
        ) : (
          <OrderTable
            orders={visible}
            onCancel={setCancelOrder}
            onEdit={setEditOrder}
          />
        )}
      </Card>

      {cancelOrder ? (
        <CancelModal
          order={cancelOrder}
          onClose={() => setCancelOrder(null)}
          onSubmit={submitCancel}
        />
      ) : null}

      {editOrder ? (
        <EditOrderModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={(needsApproval) => {
            setNotice(
              needsApproval
                ? `Change to order #${editOrder.orderNumber} sent for barman approval.`
                : `Order #${editOrder.orderNumber} updated.`,
            );
            setEditOrder(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function BarmanHistory() {
  const { orders, error } = useOrders();

  const today = useMemo(
    () =>
      orders
        .filter(
          (o) =>
            (o.status === 'COMPLETED' && isToday(o.completedAt)) ||
            (o.status === 'CANCELLED' && isToday(o.cancelledAt)),
        )
        .slice()
        .sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [orders],
  );

  return (
    <div>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}

      <ItemTotals orders={orders} inHand />

      <Card title="Today's orders">
        {today.length === 0 ? (
          <EmptyState>Nothing completed or cancelled today.</EmptyState>
        ) : (
          <OrderTable orders={today} />
        )}
      </Card>
    </div>
  );
}

function CashierHistory() {
  const { orders, error } = useOrders();

  const today = useMemo(
    () =>
      orders
        .filter(
          (o) =>
            (o.status === 'COMPLETED' && isToday(o.completedAt)) ||
            (o.status === 'CANCELLED' && isToday(o.cancelledAt)),
        )
        .slice()
        .sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [orders],
  );

  return (
    <div>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}

      <Card title="Today's orders">
        {today.length === 0 ? (
          <EmptyState>No completed or cancelled orders today.</EmptyState>
        ) : (
          <OrderTable orders={today} />
        )}
      </Card>
    </div>
  );
}
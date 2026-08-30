'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { Alert, Button, Card, EmptyState } from '@/components/ui';
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
import StockItemsList from '@/components/stock/StockItemsList';
import type { Order, StockHandover } from '@/types';

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

function WaiterHistory() {
  const { user } = useAuth();
  const { orders, error, reload } = useOrders();
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    reload();
  }, [reload]);

  useRealtime(
    [
      REAL_TIME_EVENTS.shiftAccepted,
      REAL_TIME_EVENTS.shiftOpened,
      REAL_TIME_EVENTS.shiftClosed,
      REAL_TIME_EVENTS.orderUpdated,
    ],
    refresh,
  );

  const mine = useMemo(
    () =>
      orders.filter((o) => o.waiter?.id === user?.id && o.status !== 'DRAFT'),
    [orders, user],
  );

  const visible = useMemo(
    () => mine.filter((o) => o.shift && o.shift.status === 'OPEN'),
    [mine],
  );

  const pocketMoney = useMemo(
    () =>
      visible
        .filter((o) => o.status === 'COMPLETED')
        .reduce((s, o) => s + Number(o.totalPrice), 0),
    [visible],
  );

  const history = useMemo(
    () =>
      mine
        .filter((o) => {
          if (!o.shift) return false;
          if (o.shift.status === 'OPEN') return true;
          return isToday(o.createdAt) && !o.shift.paidAt;
        })
        .slice()
        .sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [mine],
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
        {history.length === 0 ? (
          <EmptyState>No orders yet — build one in POS.</EmptyState>
        ) : (
          <OrderTable
            orders={history}
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

function BarmanStockCard() {
  const [handovers, setHandovers] = useState<StockHandover[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api
      .stockHandoverMine()
      .then((h) => {
        setHandovers(h);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  useEffect(reload, [reload]);
  useRealtime(
    [
      REAL_TIME_EVENTS.handoverChanged,
      REAL_TIME_EVENTS.shiftClosed,
      REAL_TIME_EVENTS.shiftOpened,
    ],
    reload,
  );

  const open = handovers.find((h) => h.status === 'OPEN');
  const closed = useMemo(
    () =>
      handovers
        .filter((h) => h.status === 'CLOSED')
        .sort(
          (a, b) =>
            new Date(b.closedAt ?? b.openedAt).getTime() -
            new Date(a.closedAt ?? a.openedAt).getTime(),
        ),
    [handovers],
  );

  const latest = open ?? closed.find((h) => !h.acceptedAt);

  async function clockIn() {
    setError(null);
    setBusy(true);
    try {
      await api.openShift();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clock in');
      setTimeout(() => setError(null), 3500);
    } finally {
      setBusy(false);
    }
  }

  async function clockOut() {
    setError(null);
    setBusy(true);
    try {
      await api.closeShift();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clock out');
      setTimeout(() => setError(null), 3500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="My stock" className="mb-6">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {!latest ? (
        <div className="py-2 text-center">
          <p className="mb-4 text-sm text-zinc-500">
            You are not on duty yet. The manager can only give you stock after
            you clock in.
          </p>
          <Button onClick={clockIn} disabled={busy}>
            {busy ? 'Opening…' : 'Clock in / open my stock'}
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-zinc-600">
              {open ? 'On duty since' : 'Closed'}{' '}
              <span className="font-semibold text-zinc-900">
                {new Date(
                  open ? open.openedAt : (latest.closedAt ?? latest.openedAt),
                ).toLocaleString()}
              </span>
            </p>
            {open ? (
              <Button variant="secondary" onClick={clockOut} disabled={busy}>
                {busy ? 'Closing…' : 'Clock out'}
              </Button>
            ) : latest.acceptedAt ? (
              <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                Accepted
              </span>
            ) : (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                Waiting for the manager to count &amp; accept
              </span>
            )}
          </div>
          <StockItemsList handover={latest} limit={3} />
        </>
      )}
    </Card>
  );
}

function BarmanHistory() {
  const { orders, error, reload } = useOrders();

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

  useRealtime(
    [REAL_TIME_EVENTS.orderUpdated, REAL_TIME_EVENTS.handoverChanged],
    reload,
  );

  return (
    <div>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}

      <BarmanStockCard />

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
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ClockInGate from '@/components/ClockInGate';
import { OrderRow } from '@/components/orders';
import { Alert, Button, Card, EmptyState } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/hooks/useRealtime';
import { api } from '@/services/api';
import { REAL_TIME_EVENTS } from '@/services/realtime';
import type { Order, Product, RestaurantTable, SellingUnit } from '@/types';

interface CartLine {
  key: string;
  productId: string;
  name: string;
  unitId?: string | null;
  unitName?: string | null;
  unitPrice: number;
  quantity: number;
}

export default function PosPage() {
  const { user } = useAuth();
  const isWaiter = user?.role === 'WAITER';
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  useRealtime(
    [
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
    ],
    reload,
  );

  return (
    <AppShell>
      <ClockInGate>
        {isWaiter ? (
          <WaiterPos key={reloadKey} onChanged={reload} />
        ) : (
          <StaffPos key={reloadKey} />
        )}
      </ClockInGate>
    </AppShell>
  );
}

function displayPrice(p: Product): number {
  const u = p.sellingUnits?.find((x) => x.isDefault) ?? p.sellingUnits?.[0];
  return u ? Number(u.price) : Number(p.price);
}

function WaiterPos({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tableId, setTableId] = useState('');
  const [menuQ, setMenuQ] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [unitPick, setUnitPick] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.products(), api.tables(), api.orders()])
      .then(([p, t, o]) => {
        setProducts(p);
        setTables(t);
        setOrders(o);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  const pocketMoney = useMemo(() => {
    const mine = orders.filter(
      (o) => o.waiter?.id === user?.id && o.status !== 'DRAFT',
    );
    return mine
      .filter(
        (o) => o.shift && o.shift.status === 'OPEN' && o.status === 'COMPLETED',
      )
      .reduce((s, o) => s + Number(o.totalPrice), 0);
  }, [orders, user]);

  function addToCart(product: Product, unit?: SellingUnit) {
    const u =
      unit ??
      product.sellingUnits?.find((x) => x.isDefault) ??
      product.sellingUnits?.[0];
    const key = `${product.id}|${u?.id ?? ''}`;
    const unitPrice = u ? Number(u.price) : Number(product.price);
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          name: product.name,
          unitId: u?.id ?? null,
          unitName: u?.name ?? null,
          unitPrice,
          quantity: 1,
        },
      ];
    });
  }

  function handleProductTap(product: Product) {
    if ((product.sellingUnits?.length ?? 0) > 1) {
      setUnitPick(product);
    } else {
      addToCart(product);
    }
  }

  function setQty(key: string, qty: number) {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, quantity: qty } : l)),
    );
  }

  async function saveAndSend() {
    setError(null);
    setNotice(null);
    if (cart.length === 0) {
      setError('Add at least one item to the order.');
      return;
    }
    try {
      const items = cart.map((c) => ({
        productId: c.productId,
        quantity: c.quantity,
        ...(c.unitId ? { sellingUnitId: c.unitId } : {}),
      }));
      const order = await api.createOrder({ tableId: tableId || undefined, items });
      const sent = await api.sendOrder(order.id);
      setNotice(`Order #${sent.orderNumber} sent to the kitchen.`);
      setCart([]);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send order');
    }
  }

  const cartTotal = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-end">
        <p className="text-sm text-zinc-500">
          Pocket money:{' '}
          <span className="font-semibold text-zinc-900">
            ${pocketMoney.toFixed(2)}
          </span>
        </p>
      </div>

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Table & drinks">
          <select
            className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
          >
            <option value="">Takeaway (no table)</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            value={menuQ}
            onChange={(e) => setMenuQ(e.target.value)}
            placeholder="Search a drink…"
            autoFocus
            className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-zinc-500"
          />
          <div className="space-y-2">
            {menuQ.trim() === '' ? (
              <EmptyState>Search a drink to add it.</EmptyState>
            ) : (
              products
                .filter((p) => p.isAvailable !== false)
                .filter((p) => p.name.toLowerCase().includes(menuQ.trim().toLowerCase()))
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProductTap(p)}
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <span className="truncate text-sm font-medium text-zinc-900">{p.name}</span>
                    <span className="shrink-0 text-sm text-zinc-500">{displayPrice(p).toFixed(2)}</span>
                  </button>
                ))
            )}
            {menuQ.trim() !== '' &&
            products.filter((p) =>
              p.name.toLowerCase().includes(menuQ.trim().toLowerCase()),
            ).length === 0 ? (
              <EmptyState>No drinks match your search.</EmptyState>
            ) : null}
          </div>
        </Card>

        <Card title="Current order">
          {cart.length === 0 ? (
            <EmptyState>Tap menu items to add them.</EmptyState>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {cart.map((l) => (
                <li key={l.key} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium text-zinc-900">
                      {l.name}
                      {l.unitName ? (
                        <span className="ml-1 text-xs font-normal text-zinc-400">
                          · {l.unitName}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-zinc-400">{Number(l.unitPrice).toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" className="h-8 w-8 px-0" onClick={() => setQty(l.key, l.quantity - 1)}>
                      −
                    </Button>
                    <span className="w-6 text-center">{l.quantity}</span>
                    <Button variant="secondary" className="h-8 w-8 px-0" onClick={() => setQty(l.key, l.quantity + 1)}>
                      +
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
            <span className="font-semibold text-zinc-900">Total</span>
            <span className="text-lg font-bold text-zinc-900">{cartTotal.toFixed(2)}</span>
          </div>
          <Button className="mt-4 w-full" onClick={saveAndSend} disabled={cart.length === 0}>
            Save & send to kitchen
          </Button>
        </Card>
      </div>

      {unitPick ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">{unitPick.name}</h2>
                <p className="mt-1 text-sm text-zinc-500">Choose a unit</p>
              </div>
              <button
                onClick={() => setUnitPick(null)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {(unitPick.sellingUnits ?? []).map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    addToCart(unitPick, u);
                    setUnitPick(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm text-left hover:border-zinc-400 hover:bg-zinc-50"
                >
                  <span className="font-medium text-zinc-900">{u.name}</span>
                  <span className="text-zinc-500">{Number(u.price).toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StaffPos() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isBarman = user?.role === 'BARMAN';

  const reload = useCallback(() => {
    api
      .orders()
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  useEffect(reload, [reload]);

  async function act<T>(fn: () => Promise<T>) {
    setError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  const sent = useMemo(() => orders.filter((o) => o.status === 'SENT'), [orders]);

  const barmanPending = useMemo(
    () =>
      orders.flatMap((o) =>
        (o.cancellationRequests ?? [])
          .filter((r) => r.status === 'PENDING' && !r.barmanId)
          .map((r) => ({ order: o, request: r })),
      ),
    [orders],
  );

  const barmanEdits = useMemo(
    () =>
      orders.flatMap((o) =>
        (o.editRequests ?? [])
          .filter((r) => r.status === 'PENDING')
          .map((r) => ({ order: o, request: r })),
      ),
    [orders],
  );

  return (
    <div>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}

      {isBarman ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Ready to serve (SENT)">
              {sent.length === 0 ? (
                <EmptyState>No orders waiting in the kitchen.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {sent.map((o) => (
                    <li key={o.id} className="rounded-lg border border-zinc-200 p-3">
                      <p className="font-semibold text-zinc-900">
                        #{o.orderNumber} · {o.waiter?.name ?? '—'} ·{' '}
                        {o.table?.name ?? 'Takeaway'}
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-zinc-600">
                        {(o.items ?? []).map((it) => (
                          <li key={it.id}>
                            {it.productName}
                            {it.sellingName ? ` · ${it.sellingName}` : ''} × {it.quantity}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="mt-3 w-full"
                        onClick={() => act(() => api.completeOrder(o.id))}
                      >
                        Complete order
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Cancellations (your approval)">
              {barmanPending.length === 0 ? (
                <EmptyState>No cancellations awaiting barman approval.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {barmanPending.map(({ order, request }) => (
                    <li key={request.id} className="rounded-lg border border-zinc-200 p-3">
                      <p className="font-semibold text-zinc-900">
                        Order #{order.orderNumber} · {order.waiter?.name ?? 'Waiter'}
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-zinc-600">
                        {(order.items ?? []).map((it) => (
                          <li key={it.id}>
                            {it.productName}
                            {it.sellingName ? ` · ${it.sellingName}` : ''} × {it.quantity}
                          </li>
                        ))}
                      </ul>
                      {request.reason ? (
                        <p className="mt-1 text-sm text-zinc-600">Reason: {request.reason}</p>
                      ) : null}
                      <Button
                        variant="danger"
                        className="mt-3 w-full"
                        onClick={() => act(() => api.barmanApproveCancellation(request.id))}
                      >
                        Cancel order
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Edit requests (your approval)">
              {barmanEdits.length === 0 ? (
                <EmptyState>No order edits awaiting barman approval.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {barmanEdits.map(({ order, request }) => (
                    <li key={request.id} className="rounded-lg border border-zinc-200 p-3">
                      <p className="font-semibold text-zinc-900">
                        Order #{order.orderNumber} · {order.waiter?.name ?? 'Waiter'}
                      </p>
                      <div className="mt-1 text-sm text-zinc-600">
{(request.items ?? []).map((it) => (
                  <p key={it.productId}>
                    {it.productName ?? 'Item'}
                    {it.sellingName ? ` · ${it.sellingName}` : ''} × {it.quantity}
                    {it.unitPrice ? ` · ${Number(it.unitPrice).toFixed(2)}` : ''}
                  </p>
                ))}
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">
                        {order.status === 'COMPLETED'
                          ? 'Served order — approving sends it back to the kitchen to be re-made.'
                          : 'Order will update right away.'}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          className="w-full"
                          onClick={() =>
                            act(() => api.decideEditRequest(request.id, 'APPROVED'))
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          className="w-full"
                          onClick={() =>
                            act(() => api.decideEditRequest(request.id, 'REJECTED'))
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          </>
      ) : (
        <>
          <Card title="Sent — waiting to be served" className="mb-6">
            {sent.length === 0 ? (
              <EmptyState>No orders waiting to be served.</EmptyState>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {sent.map((o) => (
                  <OrderRow key={o.id} order={o} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
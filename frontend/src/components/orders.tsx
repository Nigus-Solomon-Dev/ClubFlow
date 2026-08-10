'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Badge, Button, EmptyState } from '@/components/ui';
import { api } from '@/services/api';
import type { Order, OrderItem, OrderStatus, Product, SellingUnit } from '@/types';

export function itemsSummary(items?: OrderItem[]): string {
  return (items ?? [])
    .map(
      (it) =>
        `${it.productName}${it.sellingName ? ` (${it.sellingName})` : ''}×${it.quantity}`,
    )
    .join(', ');
}

export function isToday(date?: string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function statusTone(status: OrderStatus) {
  switch (status) {
    case 'DRAFT':
      return 'amber' as const;
    case 'SENT':
      return 'blue' as const;
    case 'COMPLETED':
      return 'green' as const;
    case 'CANCELLED':
      return 'red' as const;
  }
}

export function formatTime(date?: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function orderTime(o: Order): string {
  return o.completedAt ?? o.cancelledAt ?? o.createdAt;
}

export function canEditOrder(o: Order): boolean {
  return (
    (o.status === 'SENT' || o.status === 'COMPLETED') &&
    !(o.cancellationRequests ?? []).some((r) => r.status === 'PENDING') &&
    !(o.editRequests ?? []).some((r) => r.status === 'PENDING')
  );
}

export function OrderTable({
  orders,
  onCancel,
  onEdit,
}: {
  orders: Order[];
  onCancel?: (order: Order) => void;
  onEdit?: (order: Order) => void;
}) {
  const sorted = [...orders].sort(
    (a, b) => new Date(orderTime(b)).getTime() - new Date(orderTime(a)).getTime(),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
            <th className="py-2 pr-4 font-medium">Order</th>
            <th className="hidden py-2 pr-4 font-medium md:table-cell">Waiter</th>
            <th className="hidden py-2 pr-4 font-medium md:table-cell">Table</th>
            <th className="hidden py-2 pr-4 font-medium sm:table-cell">Items</th>
            <th className="py-2 pr-4 text-right font-medium">Total</th>
            <th className="hidden py-2 pr-4 font-medium md:table-cell">Time</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            {onCancel || onEdit ? <th className="py-2 font-medium">Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr
              key={o.id}
              className="border-b border-zinc-100 align-top last:border-0"
            >
              <td className="whitespace-nowrap py-2.5 pr-4 font-semibold text-zinc-900">
                #{o.orderNumber}
              </td>
              <td className="hidden whitespace-nowrap py-2.5 pr-4 text-zinc-700 md:table-cell">
                {o.waiter?.name ?? '—'}
              </td>
              <td className="hidden whitespace-nowrap py-2.5 pr-4 text-zinc-700 md:table-cell">
                {o.table?.name ?? 'Takeaway'}
              </td>
              <td className="hidden max-w-xs truncate py-2.5 pr-4 text-zinc-500 sm:table-cell">
                {itemsSummary(o.items)}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-4 text-right font-semibold text-zinc-900">
                {Number(o.totalPrice).toFixed(2)}
              </td>
              <td className="hidden whitespace-nowrap py-2.5 pr-4 text-zinc-500 md:table-cell">
                {formatTime(orderTime(o))}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-4">
                <Badge tone={statusTone(o.status)}>{o.status}</Badge>
              </td>
              {onCancel || onEdit ? (
                <td className="whitespace-nowrap py-2.5">
                  <div className="flex items-center gap-1">
                    {onEdit && canEditOrder(o) ? (
                      <Button
                        variant="ghost"
                        className="text-xs"
                        onClick={() => onEdit(o)}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {onCancel &&
                    o.status !== 'CANCELLED' &&
                    !(o.cancellationRequests ?? []).some(
                      (r) => r.status === 'PENDING',
                    ) ? (
                      <Button
                        variant="ghost"
                        className="text-xs"
                        onClick={() => onCancel(o)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderRow({
  order,
  onCancel,
  extra,
}: {
  order: Order;
  onCancel?: (order: Order) => void;
  extra?: ReactNode;
}) {
  const pendingCancel = (order.cancellationRequests ?? []).some(
    (r) => r.status === 'PENDING',
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="font-medium text-zinc-900">
          #{order.orderNumber} · {order.waiter?.name ?? '—'} ·{' '}
          {order.table?.name ?? 'Takeaway'}
        </p>
        <p className="truncate text-xs text-zinc-500">{itemsSummary(order.items)}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-zinc-900">
          {Number(order.totalPrice).toFixed(2)}
        </span>
        <Badge tone={statusTone(order.status)}>{order.status}</Badge>
        {onCancel && order.status !== 'CANCELLED' && !pendingCancel ? (
          <Button variant="ghost" className="text-xs" onClick={() => onCancel(order)}>
            Cancel
          </Button>
        ) : null}
        {extra}
      </div>
    </li>
  );
}

export function CancelModal({
  order,
  onClose,
  onSubmit,
}: {
  order: Order;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to send cancellation');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">
          Cancel order #{order.orderNumber}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {order.waiter?.name ?? ''} · {order.table?.name ?? 'Takeaway'} ·{' '}
          {Number(order.totalPrice).toFixed(2)}
        </p>
        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Reason (required)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. customer changed their mind"
          rows={3}
          autoFocus
          className="mt-1 w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        {err ? (
          <div className="mt-3">
            <Alert>{err}</Alert>
          </div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={submit}
            disabled={busy || reason.trim().length === 0}
          >
            {busy ? 'Sending…' : 'Send cancellation'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EmptyList({ message }: { message: string }) {
  return <EmptyState>{message}</EmptyState>;
}

interface EditLine {
  key: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  sellingUnitId?: string | null;
  sellingName?: string | null;
}

function defaultUnit(p: Product): SellingUnit | undefined {
  return (
    p.sellingUnits?.find((u) => u.isDefault) ?? p.sellingUnits?.[0]
  );
}

function displayPrice(p: Product): number {
  const u = defaultUnit(p);
  return u ? Number(u.price) : Number(p.price);
}

export function EditOrderModal({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: (needsApproval: boolean) => void;
}) {
  const [lines, setLines] = useState<EditLine[]>(() =>
    (order.items ?? []).map((it) => ({
      key: it.id || `${it.productId ?? ''}|${it.sellingUnitId ?? ''}`,
      productId: it.productId ?? '',
      name: it.productName,
      unitPrice: Number(it.unitPrice),
      quantity: it.quantity,
      sellingUnitId: it.sellingUnitId,
      sellingName: it.sellingName,
    })),
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [addQ, setAddQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .products()
      .then(setProducts)
      .catch(() => undefined);
  }, []);

  const suggestions = useMemo(
    () =>
      products
        .filter((p) => p.isAvailable !== false)
        .filter((p) => p.name.toLowerCase().includes(addQ.trim().toLowerCase()))
        .slice(0, 12),
    [products, addQ],
  );

  function setQty(key: string, qty: number) {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, quantity: qty } : l)),
    );
  }

  function addProduct(p: Product) {
    const u = defaultUnit(p);
    const key = `${p.id}|${u?.id ?? ''}`;
    setLines((prev) => {
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
          productId: p.id,
          name: p.name,
          unitPrice: u ? Number(u.price) : Number(p.price),
          quantity: 1,
          sellingUnitId: u?.id ?? null,
          sellingName: u?.name ?? null,
        },
      ];
    });
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  async function save() {
    if (busy) return;
    if (lines.length === 0) {
      setErr('Add at least one item.');
      return;
    }
    if (lines.some((l) => !l.productId)) {
      setErr('Some items can no longer be edited.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const items = lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        ...(l.sellingUnitId ? { sellingUnitId: l.sellingUnitId } : {}),
      }));
      const result = await api.proposeEdit(order.id, items);
      onSaved('requestedById' in result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save changes');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Edit order #{order.orderNumber}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {order.waiter?.name ?? ''} · {order.table?.name ?? 'Takeaway'}
              {order.status === 'COMPLETED' ? ' · served — changes need barman approval' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-auto">
          {lines.length === 0 ? (
            <EmptyState>No items — add some below.</EmptyState>
          ) : (
            lines.map((l) => (
              <div
                key={l.key}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">
                    {l.name}
                    {l.sellingName ? (
                      <span className="ml-1 text-xs font-normal text-zinc-400">
                        · {l.sellingName}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-400">{l.unitPrice.toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="h-8 w-8 px-0"
                    onClick={() => setQty(l.key, l.quantity - 1)}
                  >
                    −
                  </Button>
                  <span className="w-6 text-center">{l.quantity}</span>
                  <Button
                    variant="secondary"
                    className="h-8 w-8 px-0"
                    onClick={() => setQty(l.key, l.quantity + 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-zinc-700">Add an item</label>
          <input
            value={addQ}
            onChange={(e) => setAddQ(e.target.value)}
            placeholder="Search the menu…"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
          <div className="mt-2 grid max-h-32 grid-cols-2 gap-1 overflow-auto">
            {suggestions.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="rounded-lg border border-zinc-200 px-2 py-1.5 text-left text-xs hover:border-zinc-400 hover:bg-zinc-50"
              >
                <span className="block truncate font-medium text-zinc-900">{p.name}</span>
                <span className="text-zinc-500">{displayPrice(p).toFixed(2)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
          <span className="font-semibold text-zinc-900">Total</span>
          <span className="text-lg font-bold text-zinc-900">{total.toFixed(2)}</span>
        </div>

        {err ? (
          <div className="mt-3">
            <Alert>{err}</Alert>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button
            className="flex-1"
            onClick={save}
            disabled={busy || lines.length === 0}
          >
            {busy
              ? 'Saving…'
              : order.status === 'COMPLETED'
                ? 'Request change'
                : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
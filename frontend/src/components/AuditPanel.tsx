'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DateText from '@/components/DateText';
import { Alert, Card, EmptyState } from '@/components/ui';
import { api, auditApi } from '@/services/api';
import type {
  ActivityEntry,
  AuditCancellation,
  AuditOrder,
  Shift,
} from '@/types';

type Tab = 'trail' | 'orders' | 'cancellations' | 'shifts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'trail', label: 'Audit Trail' },
  { id: 'orders', label: 'Order History' },
  { id: 'cancellations', label: 'Cancellations' },
  { id: 'shifts', label: 'Shift Logs' },
];

export default function AuditPanel() {
  const [tab, setTab] = useState<Tab>('trail');
  const [trail, setTrail] = useState<ActivityEntry[]>([]);
  const [orders, setOrders] = useState<AuditOrder[]>([]);
  const [cancellations, setCancellations] = useState<AuditCancellation[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((active: Tab) => {
    if (active === 'trail') {
      auditApi.trail({ limit: 300 }).then(setTrail).catch((e) => setError(e.message));
    } else if (active === 'orders') {
      auditApi.orders().then(setOrders).catch((e) => setError(e.message));
    } else if (active === 'cancellations') {
      auditApi.cancellations().then(setCancellations).catch((e) => setError(e.message));
    } else {
      api.shifts().then(setShifts).catch((e) => setError(e.message));
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const counts = useMemo(
    () => ({
      trail: trail.length,
      orders: orders.length,
      cancellations: cancellations.length,
      shifts: shifts.length as number | undefined,
    }),
    [trail, orders, cancellations, shifts],
  );

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Audit</h1>
        <p className="text-sm text-zinc-500">
          Every important action is recorded for traceability.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            {t.label}
            {counts[t.id] !== undefined ? (
              <span className="ml-2 text-xs opacity-70">{counts[t.id]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card>
        {tab === 'trail' && <TrailTab rows={trail} />}
        {tab === 'orders' && <OrdersTab rows={orders} />}
        {tab === 'cancellations' && <CancellationsTab rows={cancellations} />}
        {tab === 'shifts' && <ShiftsTab rows={shifts} />}
      </Card>
    </div>
  );
}

function TrailTab({ rows }: { rows: ActivityEntry[] }) {
  if (rows.length === 0) return <EmptyState>No activity recorded yet.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Employee</th>
            <th className="py-2 pr-4 font-medium">Action</th>
            <th className="py-2 font-medium">Entity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-zinc-100">
              <td className="py-2 pr-4 whitespace-nowrap text-xs text-zinc-400">
                <DateText value={r.createdAt} />
              </td>
              <td className="py-2 pr-4 text-zinc-900">
                {r.user?.name ?? '—'}
                <span className="ml-1 text-xs uppercase text-zinc-400">
                  {r.user?.role}
                </span>
              </td>
              <td className="py-2 pr-4 font-medium text-zinc-900">{r.action}</td>
              <td className="py-2 text-zinc-500">
                {r.entity}{r.entityId ? ` (${r.entityId})` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTab({ rows }: { rows: AuditOrder[] }) {
  if (rows.length === 0) return <EmptyState>No orders found.</EmptyState>;
  return (
    <ul className="divide-y divide-zinc-100">
      {rows.map((o) => (
        <li key={o.id} className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-zinc-900">
              #{o.orderNumber} · {o.waiter?.name ?? 'Waiter'}
              {o.table ? ` · ${o.table.name}` : ' · Takeaway'}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-900">
                {Number(o.totalPrice).toFixed(2)}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase text-zinc-600">
                {o.status}
              </span>
            </div>
          </div>
          {o.items && o.items.length > 0 ? (
            <p className="mt-1 text-sm text-zinc-500">
              {o.items.map((it) => `${it.productName} ×${it.quantity}`).join(', ')}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-zinc-400">
            <DateText value={o.createdAt} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function CancellationsTab({ rows }: { rows: AuditCancellation[] }) {
  if (rows.length === 0) return <EmptyState>No cancellations recorded.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400">
            <th className="py-2 pr-4 font-medium">Order</th>
            <th className="py-2 pr-4 font-medium">Requested by</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Barman</th>
            <th className="py-2 font-medium">Decided by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100">
              <td className="py-2 pr-4 whitespace-nowrap text-zinc-900">
                #{c.order.orderNumber}
              </td>
              <td className="py-2 pr-4 text-zinc-600">{c.requestedBy?.name}</td>
              <td className="py-2 pr-4">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase text-zinc-600">
                  {c.status}
                </span>
              </td>
              <td className="py-2 pr-4 text-zinc-600">{c.barman?.name ?? '—'}</td>
              <td className="py-2 text-zinc-600">{c.decidedBy?.name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShiftsTab({ rows }: { rows: Shift[] }) {
  if (rows.length === 0) return <EmptyState>No shifts recorded.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400">
            <th className="py-2 pr-4 font-medium">Employee</th>
            <th className="py-2 pr-4 font-medium">Started</th>
            <th className="py-2 pr-4 font-medium">Ended</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-zinc-100">
              <td className="py-2 pr-4 text-zinc-900">
                {s.user?.name ?? '—'}
                <span className="ml-1 text-xs uppercase text-zinc-400">
                  {s.user?.role}
                </span>
              </td>
              <td className="py-2 pr-4 text-xs text-zinc-500">
                <DateText value={s.startedAt} />
              </td>
              <td className="py-2 pr-4 text-xs text-zinc-500">
                {s.endedAt ? <DateText value={s.endedAt} /> : '—'}
              </td>
              <td className="py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${
                    s.status === 'OPEN'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {s.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

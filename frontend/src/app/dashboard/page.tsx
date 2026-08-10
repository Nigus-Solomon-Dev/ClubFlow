'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { Badge, Card, EmptyState, StatCard } from '@/components/ui';
import { useRealtime } from '@/hooks/useRealtime';
import { api } from '@/services/api';
import { REAL_TIME_EVENTS } from '@/services/realtime';
import type { Dashboard, SalesReport } from '@/types';

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.dashboard(), api.salesReport()])
      .then(([d, s]) => {
        setData(d);
        setSales(s);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(REAL_TIME_EVENTS.dashboardUpdated, load);

  if (error) {
    return (
      <AppShell>
        <Card>
          <p className="text-red-600">{error}</p>
        </Card>
      </AppShell>
    );
  }

  if (!data || !sales) {
    return (
      <AppShell>
        <EmptyState>Loading dashboard…</EmptyState>
      </AppShell>
    );
  }

  const stats = [
    { label: 'Revenue today', value: data.today.revenue ?? '0', hint: 'completed orders' },
    { label: 'Orders today', value: data.today.orders, hint: `${sales.orders} completed total` },
    { label: 'Products', value: data.totals.products, hint: `${data.totals.categories} categories` },
    { label: 'Tables', value: data.totals.activeTables, hint: `${data.totals.tables} total` },
    { label: 'Employees', value: data.totals.employees, hint: 'active accounts' },
    { label: 'Low stock', value: data.totals.lowStockItems, hint: 'items qty < 5' },
    { label: 'Open shifts', value: data.totals.openShifts, hint: 'staff on the clock' },
    { label: 'Pending orders', value: data.totals.pendingOrders, hint: 'draft or sent' },
  ];

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500">Live overview of restaurant operations.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} hint={s.hint} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Today's sales">
          <dl className="space-y-3 text-sm">
            <Row label="Revenue" value={String(sales.revenue ?? 0)} />
            <Row label="Completed orders" value={String(sales.orders)} />
            <Row label="Line items sold" value={String(sales.items)} />
            <Row label="Avg order value" value={sales.averageOrderValue.toFixed(2)} />
          </dl>
        </Card>
        <Card title="Operations">
          <ul className="space-y-2 text-sm text-zinc-600">
            <li className="flex items-center justify-between">
              <span>Active tables</span>
              <Badge tone="green">{data.totals.activeTables}</Badge>
            </li>
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-semibold text-zinc-900">{value}</dd>
    </div>
  );
}
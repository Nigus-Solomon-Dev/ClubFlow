'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { Badge, Card, EmptyState, StatCard } from '@/components/ui';
import { useRealtime } from '@/hooks/useRealtime';
import { api } from '@/services/api';
import { REAL_TIME_EVENTS } from '@/services/realtime';
import { formatLeft } from '@/lib/stock';
import type { Dashboard, StockHandoverAlert } from '@/types';

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [alerts, setAlerts] = useState<StockHandoverAlert[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.dashboard(), api.stockHandoverAlerts()])
      .then(([d, a]) => {
        setData(d);
        setAlerts(a);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(
    [REAL_TIME_EVENTS.dashboardUpdated, REAL_TIME_EVENTS.handoverChanged],
    load,
  );

  if (error) {
    return (
      <AppShell>
        <Card>
          <p className="text-red-600">{error}</p>
        </Card>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <EmptyState>Loading dashboard…</EmptyState>
      </AppShell>
    );
  }

  const stats = [
    { label: 'Revenue today', value: data.today.revenue ?? '0', hint: 'completed orders' },
    { label: 'Products', value: data.totals.products, hint: `${data.totals.categories} categories` },
    { label: 'Tables', value: data.totals.activeTables, hint: `${data.totals.tables} total` },
    { label: 'Employees', value: data.totals.employees, hint: 'active accounts' },
    { label: 'Low stock', value: data.totals.lowStockItems, hint: 'items qty < 5' },
    { label: 'Open shifts', value: data.totals.openShifts, hint: 'staff on the clock' },
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
        <Card title="Operations">
          <ul className="space-y-2 text-sm text-zinc-600">
            <li className="flex items-center justify-between">
              <span>Active tables</span>
              <Badge tone="green">{data.totals.activeTables}</Badge>
            </li>
          </ul>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Stock alerts (running low)">
          {alerts.length === 0 ? (
            <EmptyState>No barman is running low on any drink right now.</EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {alerts.map((a) => (
                <li
                  key={`${a.handoverId}-${a.product.id}`}
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    a.level === 'empty'
                      ? 'border-red-200 bg-red-50'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <p
                    className={`truncate font-semibold ${
                      a.level === 'empty' ? 'text-red-800' : 'text-amber-800'
                    }`}
                  >
                    {a.product.name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {a.barman.name} ·{' '}
                    <span
                      className={
                        a.level === 'empty' ? 'font-medium text-red-700' : 'font-medium text-amber-700'
                      }
                    >
                      {a.level === 'empty' ? '0 left' : `${formatLeft(a.product, a.left)} left`}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link
              href="/handover"
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Go to stock
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
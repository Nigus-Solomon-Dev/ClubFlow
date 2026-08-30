'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import AuditPanel from '@/components/AuditPanel';
import { Badge, Card, EmptyState, StatCard } from '@/components/ui';
import { api } from '@/services/api';
import type {
  CategorySales,
  DailySales,
  EmployeeReport,
  InventoryUsage,
  LowProduct,
  MonthlySales,
  TopProduct,
  WeeklySales,
} from '@/types';

export default function ReportsPage() {
  const [view, setView] = useState<'summary' | 'audit'>('summary');
  const [sales, setSales] = useState<Awaited<ReturnType<typeof api.salesReport>> | null>(null);
  const [categories, setCategories] = useState<CategorySales[]>([]);
  const [top, setTop] = useState<TopProduct[]>([]);
  const [low, setLow] = useState<LowProduct[]>([]);
  const [daily, setDaily] = useState<DailySales[]>([]);
  const [weekly, setWeekly] = useState<WeeklySales[]>([]);
  const [employees, setEmployees] = useState<EmployeeReport[]>([]);
  const [monthly, setMonthly] = useState<MonthlySales[]>([]);
  const [usage, setUsage] = useState<InventoryUsage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.salesReport(),
      api.salesByCategory(),
      api.topProducts(),
      api.lowSellingProducts(),
      api.dailySales(),
      api.weeklySales(),
      api.employeeReport(),
      api.monthlySales(),
      api.inventoryUsage(),
    ])
      .then(([s, c, t, l, d, w, e, m, u]) => {
        setSales(s);
        setCategories(c);
        setTop(t);
        setLow(l);
        setDaily(d);
        setWeekly(w);
        setEmployees(e);
        setMonthly(m);
        setUsage(u);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  const maxTop = Math.max(1, ...top.map((t) => Number(t._sum.subtotal ?? 0)));

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Reports</h1>
        <p className="text-sm text-zinc-500">Sales, operations and audit trail.</p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setView('summary')}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
            view === 'summary'
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          Summary
        </button>
        <button
          onClick={() => setView('audit')}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
            view === 'audit'
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          Audit trail
        </button>
      </div>

      {view === 'audit' ? (
        <AuditPanel />
      ) : error ? (
        <Card><p className="text-red-600">{error}</p></Card>
      ) : !sales ? (
        <EmptyState>Loading reports…</EmptyState>
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Revenue" value={String(sales.revenue ?? 0)} />
            <StatCard label="Orders" value={sales.orders} />
            <StatCard label="Items sold" value={sales.items} />
            <StatCard label="Avg order value" value={sales.averageOrderValue.toFixed(2)} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="By category">
              {categories.length === 0 ? (
                <EmptyState>No sales today.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {categories.map((c) => (
                    <li key={c.category} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-700">{c.category}</span>
                      <span className="font-medium text-zinc-900">{c.revenue.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Top products">
              {top.length === 0 ? (
                <EmptyState>No data yet.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {top.map((t) => (
                    <li key={t.productName} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-zinc-900">{t.productName}</span>
                        <span className="text-zinc-600">
                          {Number(t._sum.quantity ?? 0)} × {Number(t._sum.subtotal ?? 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full bg-zinc-800"
                          style={{ width: `${(Number(t._sum.subtotal ?? 0) / maxTop) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Daily sales">
              {daily.length === 0 ? (
                <EmptyState>No orders today.</EmptyState>
              ) : (
                <ul className="space-y-2 text-sm">
                  {daily.map((d) => (
                    <li key={d.date} className="flex items-center justify-between">
                      <span className="text-zinc-700">{d.date}</span>
                      <span className="text-zinc-600">{d.orders} order(s)</span>
                      <span className="font-medium text-zinc-900">{d.revenue.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="By employee">
              {employees.length === 0 ? (
                <EmptyState>No staff sales today.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400">
                        <th className="py-2 pr-4 font-medium">Employee</th>
                        <th className="py-2 pr-4 font-medium">Role</th>
                        <th className="py-2 pr-4 text-right font-medium">Orders</th>
                        <th className="py-2 pr-4 text-right font-medium">Items</th>
                        <th className="py-2 pr-4 text-right font-medium">Cancelled</th>
                        <th className="py-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((e) => (
                        <tr key={e.userId} className="border-b border-zinc-100">
                          <td className="py-2 pr-4 font-medium text-zinc-900">{e.name}</td>
                          <td className="py-2 pr-4">
                            <Badge tone={e.role === 'BARMAN' ? 'blue' : 'neutral'}>
                              {e.role}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 text-right text-zinc-600">{e.orders}</td>
                          <td className="py-2 pr-4 text-right text-zinc-600">{e.items}</td>
                          <td className="py-2 pr-4 text-right text-zinc-600">{e.cancelled}</td>
                          <td className="py-2 text-right font-medium text-zinc-900">
                            {e.revenue.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Weekly sales">
              {weekly.length === 0 ? (
                <EmptyState>No weekly sales data yet.</EmptyState>
              ) : (
                <ul className="space-y-2 text-sm">
                  {weekly.map((w) => (
                    <li key={w.start} className="flex items-center justify-between">
                      <span className="text-zinc-700">Week of {w.start}</span>
                      <span className="text-zinc-600">{w.orders} order(s)</span>
                      <span className="font-medium text-zinc-900">{w.revenue.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Low-selling products">
              {low.length === 0 ? (
                <EmptyState>No low-selling data yet.</EmptyState>
              ) : (
                <ul className="space-y-2 text-sm">
                  {low.map((p) => (
                    <li key={p.productName} className="flex items-center justify-between">
                      <span className="text-zinc-700">{p.productName}</span>
                      <span className="text-zinc-600">
                        {Number(p._sum.quantity ?? 0)} × {Number(p._sum.subtotal ?? 0).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Inventory usage">
              {usage.length === 0 ? (
                <EmptyState>No inventory consumed yet.</EmptyState>
              ) : (
                <ul className="space-y-2 text-sm">
                  {usage.map((u) => (
                    <li key={u.productName} className="flex items-center justify-between">
                      <span className="text-zinc-700">{u.productName}</span>
                      <span className="font-medium text-zinc-900">{u.consumed} used</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Monthly summary">
              {monthly.length === 0 ? (
                <EmptyState>No monthly sales data yet.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400">
                        <th className="py-2 pr-4 font-medium">Month</th>
                        <th className="py-2 pr-4 text-right font-medium">Orders</th>
                        <th className="py-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((m) => (
                        <tr key={m.month} className="border-b border-zinc-100">
                          <td className="py-2 pr-4 font-medium text-zinc-900">{m.month}</td>
                          <td className="py-2 pr-4 text-right text-zinc-600">{m.orders}</td>
                          <td className="py-2 text-right font-medium text-zinc-900">
                            {m.revenue.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}

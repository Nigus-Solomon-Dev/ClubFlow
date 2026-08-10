'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import type {
  Employee,
  Product,
  ReconciliationReport,
  StockHandover,
} from '@/types';

function todayKey(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function productLabel(p: { name: string; stockUnit: string }): string {
  return `${p.name} (${p.stockUnit.toLowerCase()})`;
}

function HandoverCard({
  handover,
  onCount,
}: {
  handover: StockHandover;
  onCount?: (handover: StockHandover, counts: Record<string, string>) => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const it of handover.items) initial[it.productId] = String(it.givenQty);
    return initial;
  });
  const counted = handover.status === 'COUNTED';

  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-zinc-900">
            {handover.barman?.name ?? 'Barman'} · {handover.date}
          </p>
          <p className="text-xs text-zinc-500">
            Given by {handover.manager?.name ?? 'Manager'}
            {counted
              ? ` · counted by ${handover.countedBy?.name ?? 'Cashier'}`
              : ' · awaiting count'}
          </p>
        </div>
        <Badge tone={counted ? 'green' : 'amber'}>
          {counted ? 'COUNTED' : 'ACTIVE'}
        </Badge>
      </div>

      <div className="mt-3 divide-y divide-zinc-100 text-sm">
        {handover.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-zinc-900">
                {productLabel(it.product)}
              </p>
              {counted ? (
                <p className="text-xs text-zinc-500">
                  Given {fmt(it.givenQty)} · remaining {fmt(it.countedQty)} ·
                  consumed {fmt(it.consumedQty)}
                </p>
              ) : null}
            </div>
            {onCount && !counted ? (
              <Input
                type="number"
                step="any"
                min="0"
                className="w-28"
                value={counts[it.productId] ?? ''}
                onChange={(e) =>
                  setCounts((prev) => ({
                    ...prev,
                    [it.productId]: e.target.value,
                  }))
                }
              />
            ) : (
              <span className="whitespace-nowrap text-zinc-700">
                {fmt(it.givenQty)}
              </span>
            )}
          </div>
        ))}
      </div>

      {onCount && !counted ? (
        <Button
          className="mt-3 w-full"
          onClick={() => onCount(handover, counts)}
        >
          Accept count
        </Button>
      ) : null}
    </div>
  );
}

function ReconciliationCard() {
  const [date, setDate] = useState(todayKey());
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .stockReconciliation(date)
      .then((r) => {
        if (active) {
          setReport(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [date]);

  const varianceCount = report?.rows.filter((r) => r.variance != null && r.variance !== 0).length ?? 0;

  return (
    <Card title={`Reconciliation (${date})`}>
      <div className="mb-4 flex items-end gap-3">
        <div className="w-48">
          <label className="text-sm font-medium text-zinc-700">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {busy ? <p className="text-sm text-zinc-500">Loading…</p> : null}
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {report ? (
        <>
          {!report.summary.allCounted ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Some handovers for this day are still open — counted amounts are
              partial.
            </div>
          ) : null}
          {report.handovers === 0 && report.rows.length === 0 ? (
            <EmptyState>No handovers or sales on this day.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-400">
                    <th className="py-2 pr-4 font-medium">Product</th>
                    <th className="py-2 pr-4 text-right font-medium">Given</th>
                    <th className="py-2 pr-4 text-right font-medium">Sold</th>
                    <th className="py-2 pr-4 text-right font-medium">Expected</th>
                    <th className="py-2 pr-4 text-right font-medium">Counted</th>
                    <th className="py-2 text-right font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.product.id} className="border-b border-zinc-100 last:border-0">
                      <td className="py-2 pr-4">
                        <p className="font-medium text-zinc-900">{r.product.name}</p>
                        <p className="text-xs uppercase text-zinc-400">
                          {r.product.category?.name ?? ''} · {r.product.stockUnit}
                        </p>
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-700">{fmt(r.given)}</td>
                      <td className="py-2 pr-4 text-right text-zinc-700">{fmt(r.sold)}</td>
                      <td className="py-2 pr-4 text-right text-zinc-700">
                        {fmt(r.expectedRemaining)}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-700">
                        {fmt(r.counted)}
                      </td>
                      <td className="py-2 text-right">
                        {r.variance == null ? (
                          <span className="text-zinc-400">—</span>
                        ) : r.variance === 0 ? (
                          <span className="font-medium text-green-600">0</span>
                        ) : (
                          <span className="font-medium text-red-600">
                            {fmt(r.variance)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3 border-t border-zinc-100 pt-3 text-sm">
            <p className="text-zinc-600">
              Given <span className="font-semibold text-zinc-900">{fmt(report.summary.given)}</span>
            </p>
            <p className="text-zinc-600">
              Sold <span className="font-semibold text-zinc-900">{fmt(report.summary.sold)}</span>
            </p>
            <p className="text-zinc-600">
              Counted{' '}
              <span className="font-semibold text-zinc-900">{fmt(report.summary.counted)}</span>
            </p>
            <p className="text-zinc-600">
              Lines with variance{' '}
              <span className={`font-semibold ${varianceCount === 0 ? 'text-green-600' : 'text-red-600'}`}>
                {varianceCount}
              </span>
            </p>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function ManagerView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [handovers, setHandovers] = useState<StockHandover[]>([]);
  const [barmanId, setBarmanId] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([api.stockHandovers(), api.products(), api.employees()])
      .then(([h, p, e]) => {
        setHandovers(h);
        setProducts(p);
        setEmployees(e);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  useEffect(reload, [reload]);

  const barmans = useMemo(
    () => employees.filter((e) => e.role === 'BARMAN' && e.isActive !== false),
    [employees],
  );

  function selectBarman(id: string) {
    setBarmanId(id);
    const h = handovers.find(
      (x) => x.date === todayKey() && x.barman?.id === id && x.status === 'ACTIVE',
    );
    const m: Record<string, string> = {};
    for (const it of h?.items ?? []) m[it.productId] = String(it.givenQty);
    setQty(m);
  }

  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const key = p.category?.name ?? 'Other';
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, [products]);

  async function save() {
    setError(null);
    setNotice(null);
    if (!barmanId) {
      setError('Select a barman to give stock to.');
      return;
    }
    const items = Object.entries(qty)
      .filter(([, v]) => v.trim() !== '' && Number(v) > 0)
      .map(([productId, v]) => ({ productId, givenQty: Number(v) }));
    if (items.length === 0) {
      setError('Enter at least one quantity.');
      return;
    }
    try {
      const saved = await api.createStockHandover({ barmanId, items });
      setNotice(`Stock handed to ${saved.barman?.name ?? 'barman'}.`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save handover');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Give stock (today)">
        <label className="text-sm font-medium text-zinc-700">Barman</label>
        <select
          value={barmanId}
          onChange={(e) => selectBarman(e.target.value)}
          className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Select a barman…</option>
          {barmans.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        {!barmanId ? (
          <EmptyState>Select a barman to enter quantities.</EmptyState>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-auto pr-1">
            {groups.map(([category, items]) => (
              <div key={category}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {category}
                </p>
                <div className="space-y-2">
                  {items.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate text-zinc-900">
                        {productLabel(p)}
                      </span>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0"
                        className="w-28"
                        value={qty[p.id] ?? ''}
                        onChange={(e) =>
                          setQty((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {error ? (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {notice}
          </div>
        ) : null}

        <Button className="mt-4 w-full" onClick={save} disabled={!barmanId}>
          Save handover
        </Button>
      </Card>

      <Card title="All handovers">
        {handovers.length === 0 ? (
          <EmptyState>No stock handovers yet — give today&apos;s stock to a barman.</EmptyState>
        ) : (
          <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
            {handovers.map((h) => (
              <HandoverCard key={h.id} handover={h} />
            ))}
          </div>
        )}
      </Card>

      <div className="lg:col-span-2">
        <ReconciliationCard />
      </div>
    </div>
  );
}

function CashierView() {
  const [active, setActive] = useState<StockHandover[]>([]);
  const [handovers, setHandovers] = useState<StockHandover[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    Promise.all([api.stockHandoverActive(), api.stockHandovers()])
      .then(([a, h]) => {
        setActive(a);
        setHandovers(h);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  useEffect(reload, [reload]);

  async function accept(handover: StockHandover, counts: Record<string, string>) {
    setError(null);
    const items = handover.items
      .map((it) => ({
        productId: it.productId,
        countedQty: Number(counts[it.productId] ?? it.givenQty),
      }))
      .filter((i) => Number.isFinite(i.countedQty));
    if (items.length !== handover.items.length) {
      setError('Enter a valid count for every item.');
      return;
    }
    setBusy(true);
    try {
      await api.countStockHandover(handover.id, items);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept count');
    } finally {
      setBusy(false);
    }
  }

  const today = todayKey();
  const todayCounted = handovers.filter((h) => h.date === today && h.status === 'COUNTED');

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Count & accept (open handovers)">
        {error ? (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        {active.length === 0 ? (
          <EmptyState>No open handovers to count right now.</EmptyState>
        ) : (
          <div className="space-y-3">
            {active.map((h) => (
              <HandoverCard key={h.id} handover={h} onCount={accept} />
            ))}
          </div>
        )}
      </Card>

      <Card title={`Counted today (${today})`}>
        {todayCounted.length === 0 ? (
          <EmptyState>Nothing counted yet tonight.</EmptyState>
        ) : (
          <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
            {todayCounted.map((h) => (
              <HandoverCard key={h.id} handover={h} />
            ))}
          </div>
        )}
        {busy ? <p className="mt-3 text-sm text-zinc-500">Saving…</p> : null}
      </Card>
    </div>
  );
}

export default function HandoverPage() {
  const { user } = useAuth();

  if (!user) return null;

  if (user.role === 'CASHIER') return <CashierView />;
  return <ManagerView />;
}

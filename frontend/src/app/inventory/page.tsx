'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import DateText from '@/components/DateText';
import { Alert, Button, Card, EmptyState, Input } from '@/components/ui';
import { api } from '@/services/api';
import type { Inventory, InventoryMovement } from '@/types';

export default function InventoryPage() {
  const [rows, setRows] = useState<Inventory[]>([]);
  const [history, setHistory] = useState<InventoryMovement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafts, setdrafts] = useState<Record<string, { quantity: string; unit: string }>>({});

  const reload = useCallback(() => {
    api
      .inventory()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
    api
      .inventoryHistory()
      .then(setHistory)
      .catch(() => undefined);
  }, []);

  useEffect(reload, [reload]);

  function draft(row: Inventory) {
    return (
      drafts[row.id] ?? {
        quantity: String(row.quantity),
        unit: row.unit,
      }
    );
  }

  async function save(row: Inventory) {
    setError(null);
    setNotice(null);
    try {
      const d = draft(row);
      await api.updateInventory(row.id, { quantity: Number(d.quantity), unit: d.unit });
      setNotice('Inventory updated');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-bold text-zinc-900">Inventory</h1>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <EmptyState>No inventory records. Add products first — each gets a stock row.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const d = draft(row);
            return (
              <Card key={row.id}>
                <p className="font-semibold text-zinc-900">{row.product?.name ?? 'Product'}</p>
                <p className="mb-3 text-xs text-zinc-400">{row.product?.category?.name}</p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={d.quantity}
                    onChange={(e) =>
                      setdrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...d, quantity: e.target.value },
                      }))
                    }
                  />
                  <Input
                    value={d.unit}
                    onChange={(e) =>
                      setdrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...d, unit: e.target.value },
                      }))
                    }
                  />
                </div>
                <Button className="mt-3 w-full" onClick={() => save(row)}>
                  Save
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Card title="Stock history" className="mt-6">
        {history.length === 0 ? (
          <EmptyState>No stock movements recorded yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="py-2 pr-4 font-medium">Item</th>
                  <th className="py-2 pr-4 text-right font-medium">Change</th>
                  <th className="py-2 pr-4 text-right font-medium">After</th>
                  <th className="py-2 pr-4 font-medium">Reason</th>
                  <th className="py-2 pr-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-4 font-medium text-zinc-900">{h.productName}</td>
                    <td
                      className={`py-2 pr-4 text-right font-semibold ${
                        h.change < 0 ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {h.change > 0 ? '+' : ''}{h.change}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-600">{h.quantityAfter}</td>
                    <td className="py-2 pr-4 text-zinc-500">
                      {h.reason === 'order.complete'
                        ? h.order
                          ? `Order #${h.order.orderNumber}`
                          : 'Order served'
                        : 'Manual'}
                    </td>
                    <td className="py-2 text-xs text-zinc-400">
                      <DateText value={h.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
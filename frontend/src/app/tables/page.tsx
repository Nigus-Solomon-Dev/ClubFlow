'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { Alert, Badge, Button, Card, EmptyState, Input } from '@/components/ui';
import { api } from '@/services/api';
import type { RestaurantTable } from '@/types';

export default function TablesPage() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .tables()
      .then(setTables)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  useEffect(reload, [reload]);

  async function run<T>(fn: () => Promise<T>, msg: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(msg);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    run(() => api.createTable(name.trim()), 'Table added');
    setName('');
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-bold text-zinc-900">Tables</h1>
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      <Card title="Add table" className="max-w-md">
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Table name, e.g. Table 3"
          />
          <Button type="submit">Add</Button>
        </form>
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tables.length === 0 ? (
          <EmptyState>No tables yet.</EmptyState>
        ) : (
          tables.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-semibold text-zinc-900">{t.name}</p>
                <p className="mt-0.5">
                  {t.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="px-2 text-xs"
                  onClick={() => run(() => api.updateTable(t.id, { isActive: !t.isActive }), 'Table updated')}
                >
                  {t.isActive ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  variant="danger"
                  className="px-2 text-xs"
                  onClick={() => run(() => api.deleteTable(t.id), 'Table deleted')}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui';
import { formatLeft } from '@/lib/stock';
import type { StockHandoverItem } from '@/types';

export type StockLine = Pick<
  StockHandoverItem,
  'id' | 'product' | 'givenQty' | 'left'
>;

/**
 * Searchable list of a stock batch's items showing "Given" and "In hand".
 * Used by the barman's "My stock" card, the manager's closed-stock card and
 * the owner<->manager handover so the screens stay identical.
 *
 * `limit` controls how many items are shown before the user has to search:
 * the barman's card shows 3 to stay simple, the manager's closed-stock card
 * leaves the default (all) so nothing is hidden while counting.
 */
export default function StockItemsList({
  handover,
  limit = Infinity,
}: {
  handover: { items: StockLine[] };
  limit?: number;
}) {
  const [q, setQ] = useState('');
  const items = useMemo(() => {
    const list = handover.items;
    if (q.trim() === '') return list;
    const needle = q.trim().toLowerCase();
    return list.filter((it) =>
      it.product.name.toLowerCase().includes(needle),
    );
  }, [handover.items, q]);

  const searching = q.trim() !== '';
  const total = items.length;
  const shown = searching ? items : items.slice(0, limit);
  const hasMore = !searching && total > limit;

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search an item, e.g. Sambuca"
        className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
      />
      {shown.length === 0 ? (
        <EmptyState>
          {handover.items.length === 0
            ? 'No stock given yet — the manager will add it here.'
            : 'No items match your search.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {shown.map((it) => (
            <li
              key={it.id}
              className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="truncate font-medium text-zinc-900">
                {it.product.name}
              </p>
              <p className="text-sm text-zinc-500">
                Given{' '}
                <span className="font-semibold text-zinc-900">
                  {formatLeft(it.product, it.givenQty)}
                </span>{' '}
                · In hand{' '}
                <span className="font-semibold text-zinc-900">
                  {formatLeft(it.product, it.left)}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
      {hasMore ? (
        <p className="mt-2 text-xs text-zinc-400">
          Showing {limit} of {total} items — search above to see the rest.
        </p>
      ) : null}
    </div>
  );
}

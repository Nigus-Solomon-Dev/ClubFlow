'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { Alert, Badge, Button, Card, EmptyState, Input } from '@/components/ui';
import { api } from '@/services/api';
import type { Category, Product } from '@/types';

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [catName, setCatName] = useState('');
  const [prod, setProd] = useState({
    name: '',
    categoryId: '',
    price: '',
    unit: 'unit',
  });

  const reload = useCallback(() => {
    Promise.all([api.categories(), api.products()])
      .then(([c, p]) => {
        setCategories(c);
        setProducts(p);
      })
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

  function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return;
    run(() => api.createCategory(catName.trim()), 'Category added');
    setCatName('');
  }

  function addProduct(e: FormEvent) {
    e.preventDefault();
    if (!prod.name.trim() || !prod.categoryId || !prod.price) return;
    run(
      () =>
        api.createProduct({
          name: prod.name.trim(),
          categoryId: prod.categoryId,
          price: Number(prod.price),
          unit: prod.unit,
        }),
      'Product added (with auto inventory)',
    );
    setProd({ name: '', categoryId: prod.categoryId, price: '', unit: 'unit' });
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-bold text-zinc-900">Menu</h1>

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Categories">
          <form onSubmit={addCategory} className="mb-4 flex gap-2">
            <Input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="New category name"
            />
            <Button type="submit">Add</Button>
          </form>
          {categories.length === 0 ? (
            <EmptyState>No categories yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-medium text-zinc-900">{c.name}</span>
                    <span className="ml-2 text-xs text-zinc-400">
                      {c._count?.products ?? 0} products
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="px-2" onClick={() => setNameInPlace(c)}>
                      Rename
                    </Button>
                    <Button
                      variant="danger"
                      className="px-2"
                      onClick={() => run(() => api.deleteCategory(c.id), 'Category deleted')}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Add product">
          <form onSubmit={addProduct} className="space-y-3">
            <Input
              value={prod.name}
              onChange={(e) => setProd({ ...prod, name: e.target.value })}
              placeholder="Product name"
            />
            <select
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={prod.categoryId}
              onChange={(e) => setProd({ ...prod, categoryId: e.target.value })}
            >
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                value={prod.price}
                onChange={(e) => setProd({ ...prod, price: e.target.value })}
                placeholder="Price"
              />
              <Input
                value={prod.unit}
                onChange={(e) => setProd({ ...prod, unit: e.target.value })}
                placeholder="Unit (e.g. cup)"
              />
            </div>
            <Button type="submit" className="w-full">
              Add product
            </Button>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Products">
          {products.length === 0 ? (
            <EmptyState>No products yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-zinc-500">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Price</th>
                    <th className="py-2 pr-4">Stock</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-4 font-medium text-zinc-900">{p.name}</td>
                      <td className="py-2 pr-4 text-zinc-600">{p.category?.name ?? '—'}</td>
                      <td className="py-2 pr-4 text-zinc-600">{Number(p.price).toFixed(2)}</td>
                      <td className="py-2 pr-4 text-zinc-600">{p.inventory?.quantity ?? 0} {p.inventory?.unit ?? ''}</td>
                      <td className="py-2 pr-4">
                        {p.isAvailable !== false ? (
                          <Badge tone="green">Available</Badge>
                        ) : (
                          <Badge tone="red">Unavailable</Badge>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost"
                          className="px-2"
                          onClick={() =>
                            run(
                              () => api.updateProduct(p.id, { isAvailable: p.isAvailable !== false ? false : true }),
                              'Availability toggled',
                            )
                          }
                        >
                          {p.isAvailable !== false ? 'Hide' : 'Show'}
                        </Button>
                        <Button
                          variant="danger"
                          className="px-2"
                          onClick={() => run(() => api.deleteProduct(p.id), 'Product deleted')}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );

  function setNameInPlace(c: Category) {
    const name = window.prompt('New name', c.name);
    if (name && name.trim()) {
      run(() => api.updateCategory(c.id, name.trim()), 'Category updated');
    }
  }
}
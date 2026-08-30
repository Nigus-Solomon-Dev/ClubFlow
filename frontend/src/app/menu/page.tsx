'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { Alert, Badge, Button, Card, EmptyState, Input } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import type { Category, Product, ProductStockSummary, ManagerStockHandover } from '@/types';

export default function MenuPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<ProductStockSummary[]>([]);
  const [managerHandovers, setManagerHandovers] = useState<ManagerStockHandover[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [catName, setCatName] = useState('');
  type SellingUnitConfig = {
  bottle: { enabled: boolean; price: string; perBottle: number };
  half: { enabled: boolean; price: string; perBottle: number };
  double: { enabled: boolean; price: string; perBottle: number };
  shot: { enabled: boolean; price: string; perBottle: number };
};

const initialSellingUnits: SellingUnitConfig = {
  bottle: { enabled: true, price: '', perBottle: 1 },
  half: { enabled: false, price: '', perBottle: 2 },
  double: { enabled: false, price: '', perBottle: 20 },
  shot: { enabled: false, price: '', perBottle: 40 },
};

const [showUnitsCard, setShowUnitsCard] = useState(false);
const [prod, setProd] = useState({
  name: '',
  categoryId: '',
  price: '',
  unit: 'unit',
  piecesPerCase: 24,
  kasaCount: 0,
  bottlePrice: '',
  sellingUnits: initialSellingUnits,
});

  const reload = useCallback(() => {
    Promise.all([
      api.categories(),
      api.products(),
      api.productStockSummary(),
      api.managerStockHandovers(),
    ])
      .then(([c, p, s, mh]) => {
        setCategories(c);
        setProducts(p);
        setStock(s);
        setManagerHandovers(mh);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  useEffect(reload, [reload]);

  const stockById = new Map(stock.map((s) => [s.productId, s]));

  const givenProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const h of managerHandovers) {
      if (h.status === 'OPEN') {
        for (const item of h.items) {
          const left = Number(item.givenQty) - Number(item.givenAwayQty);
          if (left > 0) {
            ids.add(item.productId);
          }
        }
      }
    }
    return ids;
  }, [managerHandovers]);

  const givenProducts = useMemo(
    () => products.filter((p) => givenProductIds.has(p.id)),
    [products, givenProductIds]
  );

  async function run<T>(fn: () => Promise<T>, msg: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(msg);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setTimeout(() => setError(null), 3500);
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
    const isKasa = isKasaCategory(getSelectedCategoryName());
    const isAlcohol = isAlcoholCategory(getSelectedCategoryName());
    const kasaCount = isKasa ? (prod.kasaCount ?? 0) : 0;
    const pieces = kasaCount * 24;

    const payload: any = {
      name: prod.name.trim(),
      categoryId: prod.categoryId,
      price: Number(prod.price),
      unit: isAlcohol ? 'Bottle' : isKasa ? 'Kasa' : prod.unit,
      piecesPerCase: isKasa ? 24 : prod.piecesPerCase,
      initialPieces: isAlcohol ? 0 : pieces,
    };

    if (isAlcohol) {
      const units = [];
      if (prod.sellingUnits.bottle.enabled) {
        units.push({
          name: 'Bottle',
          price: Number(prod.sellingUnits.bottle.price) || Number(prod.price),
          stockConsumption: 1,
          isDefault: true,
        });
      }
      if (prod.sellingUnits.half.enabled) {
        units.push({
          name: 'Half',
          price: Number(prod.sellingUnits.half.price) || 0,
          stockConsumption: 0.5,
          isDefault: false,
        });
      }
      if (prod.sellingUnits.double.enabled && prod.sellingUnits.double.perBottle) {
        units.push({
          name: 'Double',
          price: Number(prod.sellingUnits.double.price) || 0,
          stockConsumption: 1 / Number(prod.sellingUnits.double.perBottle),
          isDefault: false,
        });
      }
      if (prod.sellingUnits.shot.enabled && prod.sellingUnits.shot.perBottle) {
        units.push({
          name: 'Shot',
          price: Number(prod.sellingUnits.shot.price) || 0,
          stockConsumption: 1 / Number(prod.sellingUnits.shot.perBottle),
          isDefault: false,
        });
      }
      payload.sellingUnits = units;
    }

    run(
      () => api.createProduct(payload),
      'Product added (with auto inventory)',
    );
    setProd({
      name: '',
      categoryId: prod.categoryId,
      price: '',
      unit: 'unit',
      piecesPerCase: 24,
      kasaCount: 0,
      bottlePrice: '',
      sellingUnits: initialSellingUnits,
    });
    setShowUnitsCard(false);
  }

  function goToHandover(productId: string) {
    router.push('/handover');
  }

  function setNameInPlace(c: Category) {
    const name = window.prompt('New name', c.name);
    if (name && name.trim()) {
      api.updateCategory(c.id, name.trim()).then(() => {
        reload();
      }).catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    }
  }

  function isKasaCategory(categoryName: string) {
    return categoryName === 'Soft Drinks' || categoryName === 'Beer / Cold Drinks';
  }

  function isAlcoholCategory(categoryName: string) {
    return categoryName === 'Alcohol';
  }

  function getSelectedCategoryName() {
    const cat = categories.find(c => c.id === prod.categoryId);
    return cat?.name ?? '';
  }

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-bold text-zinc-900">Products</h1>

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
              onChange={(e) => {
                const newCatId = e.target.value;
                const cat = categories.find((c) => c.id === newCatId);
                setProd({ ...prod, categoryId: newCatId });
                if (cat && isAlcoholCategory(cat.name)) {
                  setShowUnitsCard(true);
                }
              }}
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
                placeholder={
                  isAlcoholCategory(getSelectedCategoryName())
                    ? 'Price for bottle (ETB)'
                    : 'Price per piece (ETB)'
                }
              />
              {isKasaCategory(getSelectedCategoryName()) ? (
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={prod.kasaCount ?? ''}
                    onChange={(e) => setProd({ ...prod, kasaCount: Number(e.target.value) || 0 })}
                    placeholder="How many kasas"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden pr-20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                    × 24 pcs
                  </span>
                </div>
              ) : isAlcoholCategory(getSelectedCategoryName()) ? (
                <button
                  type="button"
                  onClick={() => setShowUnitsCard((prev) => !prev)}
                  className="flex h-full w-full items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <span className="truncate">🍷 Bottle Units</span>
                  <span className="ml-1 text-xs rounded-full bg-amber-200 px-2 py-0.5 font-semibold text-amber-800 shrink-0">
                    {showUnitsCard ? 'Hide ▲' : 'Configure ▼'}
                  </span>
                </button>
              ) : (
                <div>
                  <Input
                    value={prod.unit}
                    onChange={(e) => setProd({ ...prod, unit: e.target.value })}
                    placeholder="Unit (e.g. cup)"
                  />
                </div>
              )}
            </div>

            {isAlcoholCategory(getSelectedCategoryName()) && showUnitsCard ? (
              <Card title="Selling units (portions & pricing)" className="mt-3 p-3 bg-amber-50 border-amber-200">
                <div className="space-y-3">
                  {/* Bottle (Base) */}
                  <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-amber-100">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prod.sellingUnits.bottle.enabled}
                        onChange={(e) =>
                          setProd({
                            ...prod,
                            sellingUnits: {
                              ...prod.sellingUnits,
                              bottle: { ...prod.sellingUnits.bottle, enabled: e.target.checked },
                            },
                          })
                        }
                        className="w-4 h-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm font-semibold text-zinc-900">Bottle</span>
                      <span className="text-xs text-zinc-500">(1 whole bottle)</span>
                    </label>
                    <span className="text-xs text-zinc-500 font-medium">
                      {prod.price ? `${prod.price} ETB` : 'Base price'}
                    </span>
                  </div>

                  {/* Half (Fixed ratio: always 2 per bottle, Price editable) */}
                  <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-amber-100">
                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={prod.sellingUnits.half.enabled}
                        onChange={(e) =>
                          setProd({
                            ...prod,
                            sellingUnits: {
                              ...prod.sellingUnits,
                              half: { ...prod.sellingUnits.half, enabled: e.target.checked },
                            },
                          })
                        }
                        className="w-4 h-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm font-medium text-zinc-900">Half</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-600 font-semibold border border-zinc-200">
                        2 / bottle
                      </span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9.]*"
                        value={prod.sellingUnits.half.price}
                        onChange={(e) =>
                          setProd({
                            ...prod,
                            sellingUnits: {
                              ...prod.sellingUnits,
                              half: { ...prod.sellingUnits.half, price: e.target.value },
                            },
                          })
                        }
                        placeholder="Price (ETB)"
                        className="w-28 text-sm"
                        disabled={!prod.sellingUnits.half.enabled}
                      />
                    </div>
                  </div>

                  {/* Double (Ratio editable, Price editable) */}
                  <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-amber-100">
                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={prod.sellingUnits.double.enabled}
                        onChange={(e) =>
                          setProd({
                            ...prod,
                            sellingUnits: {
                              ...prod.sellingUnits,
                              double: { ...prod.sellingUnits.double, enabled: e.target.checked },
                            },
                          })
                        }
                        className="w-4 h-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm font-medium text-zinc-900">Double</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={prod.sellingUnits.double.perBottle || ''}
                          onChange={(e) =>
                            setProd({
                              ...prod,
                              sellingUnits: {
                                ...prod.sellingUnits,
                                double: {
                                  ...prod.sellingUnits.double,
                                  perBottle: Number(e.target.value) || 0,
                                },
                              },
                            })
                          }
                          placeholder="20"
                          className="w-20 pr-6 text-sm"
                          min="1"
                          disabled={!prod.sellingUnits.double.enabled}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                          /btl
                        </span>
                      </div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9.]*"
                        value={prod.sellingUnits.double.price}
                        onChange={(e) =>
                          setProd({
                            ...prod,
                            sellingUnits: {
                              ...prod.sellingUnits,
                              double: { ...prod.sellingUnits.double, price: e.target.value },
                            },
                          })
                        }
                        placeholder="Price (ETB)"
                        className="w-28 text-sm"
                        disabled={!prod.sellingUnits.double.enabled}
                      />
                    </div>
                  </div>

                  {/* Shot (Ratio editable, Price editable) */}
                  <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-amber-100">
                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={prod.sellingUnits.shot.enabled}
                        onChange={(e) =>
                          setProd({
                            ...prod,
                            sellingUnits: {
                              ...prod.sellingUnits,
                              shot: { ...prod.sellingUnits.shot, enabled: e.target.checked },
                            },
                          })
                        }
                        className="w-4 h-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm font-medium text-zinc-900">Shot</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={prod.sellingUnits.shot.perBottle || ''}
                          onChange={(e) =>
                            setProd({
                              ...prod,
                              sellingUnits: {
                                ...prod.sellingUnits,
                                shot: {
                                  ...prod.sellingUnits.shot,
                                  perBottle: Number(e.target.value) || 0,
                                },
                              },
                            })
                          }
                          placeholder="40"
                          className="w-20 pr-6 text-sm"
                          min="1"
                          disabled={!prod.sellingUnits.shot.enabled}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                          /btl
                        </span>
                      </div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9.]*"
                        value={prod.sellingUnits.shot.price}
                        onChange={(e) =>
                          setProd({
                            ...prod,
                            sellingUnits: {
                              ...prod.sellingUnits,
                              shot: { ...prod.sellingUnits.shot, price: e.target.value },
                            },
                          })
                        }
                        placeholder="Price (ETB)"
                        className="w-28 text-sm"
                        disabled={!prod.sellingUnits.shot.enabled}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ) : null}
            <Button type="submit" className="w-full mt-3">
              Add product
            </Button>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Products given to managers">
          {givenProducts.length === 0 ? (
            <EmptyState>No products have been handed over to managers yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-zinc-500">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Price</th>
                    <th className="py-2 pr-4">In hand</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {givenProducts.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-zinc-100 cursor-pointer hover:bg-zinc-50"
                      onClick={() => router.push('/handover')}
                    >
                      <td className="py-2 pr-4 font-medium text-zinc-900">{p.name}</td>
                      <td className="py-2 pr-4 text-zinc-600">{p.category?.name ?? '—'}</td>
                      <td className="py-2 pr-4 text-zinc-600">{Number(p.price).toFixed(2)}</td>
                      <td className="py-2 pr-4 text-zinc-600">
                        {stockById.get(p.id)?.total ?? 0}{' '}
                        <span className="text-xs text-zinc-400">
                          {stockById.get(p.id)?.stockUnit.toLowerCase() ?? ''}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        {p.isAvailable !== false ? (
                          <Badge tone="green">Available</Badge>
                        ) : (
                          <Badge tone="red">Unavailable</Badge>
                        )}
                      </td>
                      <td className="py-2 text-right text-zinc-400 text-xs">
                        View stock
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
}
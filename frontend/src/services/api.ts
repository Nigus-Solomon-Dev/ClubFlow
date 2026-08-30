/**
 * API client / service layer.
 * The frontend talks to the NestJS backend through this layer only.
 */

import { API_BASE_URL, AUTH_STORAGE_KEYS } from '../constants';
import type {
  ActivityEntry,
  AuditCancellation,
  AuditOrder,
  AuthUser,
  AuthResponse,
  CancellationRequest,
  Category,
  CategorySales,
  DailySales,
  Dashboard,
  Employee,
  EmployeeReport,
  Inventory,
  InventoryMovement,
  InventoryUsage,
  LoginDto,
  LowProduct,
  ManagerSettleResult,
  ManagerStockHandover,
  MonthlySales,
  Order,
  OrderEditRequest,
  OrderStatus,
  Product,
  ProductStockSummary,
  RegisterDto,
  RestaurantTable,
  SalesReport,
  Setting,
  Shift,
  TopProduct,
  Settlement,
  SettlementHistory,
  StockHandover,
  StockHandoverAlert,
  WeeklySales,
  CancellationReport,
} from '../types';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const AUTH_CHANGE_EVENT = 'rm:auth';

function notifyAuthChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export const storage = {
  _userCache: undefined as AuthUser | undefined,
  _userKey: null as string | null,
  getAccess(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
  },
  getRefresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken);
  },
  getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEYS.user);
    if (raw === this._userKey) {
      return this._userCache ?? null;
    }
    this._userKey = raw;
    this._userCache = raw ? (JSON.parse(raw) as AuthUser) : undefined;
    return this._userCache ?? null;
  },
  save(auth: AuthResponse): void {
    window.localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, auth.accessToken);
    window.localStorage.setItem(
      AUTH_STORAGE_KEYS.refreshToken,
      auth.refreshToken,
    );
    window.localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(auth.user));
    notifyAuthChanged();
  },
  clear(): void {
    window.localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
    window.localStorage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
    window.localStorage.removeItem(AUTH_STORAGE_KEYS.user);
    notifyAuthChanged();
  },
};

function errorMessage(data: unknown): string {
  if (data && typeof data === 'object') {
    const m = (data as { message?: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join(', ');
  }
  return 'Request failed';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  refreshOn401?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, refreshOn401 = true } = options;
  const headers: Record<string, string> = {};
  const access = token !== undefined ? token : storage.getAccess();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (access) headers['Authorization'] = `Bearer ${access}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (res.status === 401 && access && refreshOn401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      return request<T>(path, { ...options, token: storage.getAccess() });
    }
    storage.clear();
    if (typeof window !== 'undefined') {
      window.location.assign('/login');
    }
    throw new ApiError(401, 'Session expired');
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, errorMessage(data));
  }
  return data as T;
}

async function refreshToken(): Promise<boolean> {
  const refresh = storage.getRefresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as AuthResponse;
    storage.save(data);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  // Auth
  login: (dto: LoginDto) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: dto, token: null }),
  register: (dto: RegisterDto) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: dto }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  // Manager dashboard
  dashboard: () => request<Dashboard>('/manager/dashboard'),

  // Categories
  categories: () => request<Category[]>('/categories'),
  createCategory: (name: string) =>
    request<Category>('/categories', { method: 'POST', body: { name } }),
  updateCategory: (id: string, name: string) =>
    request<Category>(`/categories/${id}`, { method: 'PATCH', body: { name } }),
  deleteCategory: (id: string) =>
    request<Category>(`/categories/${id}`, { method: 'DELETE' }),

  // Products
  products: () => request<Product[]>('/products'),
  productStockSummary: () =>
    request<ProductStockSummary[]>('/stock-handovers/summary'),
  createProduct: (body: {
    name: string;
    categoryId: string;
    price: number;
    unit?: string;
    isAvailable?: boolean;
    piecesPerCase?: number;
    initialPieces?: number;
    bottlePrice?: number;
    sellingUnits?: Array<{
      name: string;
      price: number;
      stockConsumption: number;
      isDefault: boolean;
    }>;
  }) => request<Product>('/products', { method: 'POST', body }),
  updateProduct: (id: string, body: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: 'PATCH', body }),
  deleteProduct: (id: string) =>
    request<Product>(`/products/${id}`, { method: 'DELETE' }),

  // Tables
  tables: () => request<RestaurantTable[]>('/tables'),
  createTable: (name: string) =>
    request<RestaurantTable>('/tables', { method: 'POST', body: { name } }),
  updateTable: (id: string, body: { name?: string; isActive?: boolean }) =>
    request<RestaurantTable>(`/tables/${id}`, { method: 'PATCH', body }),
  deleteTable: (id: string) =>
    request<RestaurantTable>(`/tables/${id}`, { method: 'DELETE' }),

  // Inventory
  inventory: () => request<Inventory[]>('/inventory'),
  inventoryHistory: () =>
    request<InventoryMovement[]>('/inventory/history'),
  updateInventory: (id: string, body: { quantity: number; unit?: string }) =>
    request<Inventory>(`/inventory/${id}`, { method: 'PATCH', body }),

  // Employees
  employees: () => request<Employee[]>('/employees'),
  updateEmployee: (id: string, body: Partial<Employee>) =>
    request<Employee>(`/employees/${id}`, { method: 'PATCH', body }),

  // Settings
  settings: () => request<Setting[]>('/settings'),
  upsertSetting: (key: string, value: string) =>
    request<Setting>(`/settings/${key}`, { method: 'PUT', body: { value } }),

  // Orders
  orders: (status?: OrderStatus) =>
    request<Order[]>(`/orders${status ? `?status=${status}` : ''}`),
  order: (id: string) => request<Order>(`/orders/${id}`),
  createOrder: (body: {
    tableId?: string;
    items?: { productId: string; quantity?: number; sellingUnitId?: string }[];
  }) => request<Order>('/orders', { method: 'POST', body }),
  addOrderItem: (
    id: string,
    body: { productId: string; quantity?: number; sellingUnitId?: string },
  ) => request<Order>(`/orders/${id}/items`, { method: 'POST', body }),
  updateOrderItem: (id: string, itemId: string, quantity: number) =>
    request<Order>(`/orders/${id}/items/${itemId}`, { method: 'PATCH', body: { quantity } }),
  removeOrderItem: (id: string, itemId: string) =>
    request<Order>(`/orders/${id}/items/${itemId}`, { method: 'DELETE' }),
  sendOrder: (id: string) => request<Order>(`/orders/${id}/send`, { method: 'POST' }),
  completeOrder: (id: string) =>
    request<Order>(`/orders/${id}/complete`, { method: 'POST' }),
  requestCancellation: (id: string, reason?: string) =>
    request<CancellationRequest>(`/orders/${id}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
  decideCancellation: (requestId: string, decision: 'APPROVED' | 'REJECTED') =>
    request<CancellationRequest>(`/orders/cancellations/${requestId}/decide`, {
      method: 'POST',
      body: { decision },
    }),
  barmanApproveCancellation: (requestId: string) =>
    request<CancellationRequest>(`/orders/cancellations/${requestId}/barman-approve`, {
      method: 'POST',
    }),
  proposeEdit: (
    id: string,
    items: { productId: string; quantity: number; sellingUnitId?: string }[],
  ) =>
    request<Order | OrderEditRequest>(`/orders/${id}/edit`, {
      method: 'POST',
      body: { items },
    }),
  decideEditRequest: (requestId: string, decision: 'APPROVED' | 'REJECTED') =>
    request<OrderEditRequest>(`/orders/edit-requests/${requestId}/decide`, {
      method: 'POST',
      body: { decision },
    }),

  // Shifts
  openShift: () => request<Shift>('/shifts/open', { method: 'POST' }),
  closeShift: () => request<Shift>('/shifts/close', { method: 'POST' }),
  acceptShift: (id: string) =>
    request<Shift>(`/shifts/${id}/accept`, { method: 'POST' }),
  shifts: () => request<Shift[]>('/shifts'),
  shiftsToday: () => request<Shift[]>('/shifts/today'),

  // Stock handovers
  stockHandovers: () => request<StockHandover[]>('/stock-handovers'),
  stockHandoverMine: () => request<StockHandover[]>('/stock-handovers/mine'),
  stockHandoverActive: () => request<StockHandover[]>('/stock-handovers/active'),
  stockHandoverAlerts: () => request<StockHandoverAlert[]>('/stock-handovers/alerts'),
  openStockHandover: () =>
    request<StockHandover>('/stock-handovers/open', { method: 'POST' }),
  giveStock: (body: {
    barmanId: string;
    items: { productId: string; givenQty: number }[];
  }) => request<StockHandover>('/stock-handovers/give', { method: 'POST', body }),
  closeStockHandover: (
    id: string,
    items: { productId: string; countedQty: number }[],
  ) =>
    request<StockHandover>(`/stock-handovers/${id}/close`, {
      method: 'POST',
      body: { items },
    }),
  acceptStockHandover: (id: string) =>
    request<StockHandover>(`/stock-handovers/${id}/accept`, {
      method: 'POST',
    }),

  // Manager stock handovers (owner -> manager)
  managerStockHandovers: () => request<ManagerStockHandover[]>('/manager-stock-handovers'),
  managerStockGive: (body: {
    managerId: string;
    items: { productId: string; givenQty: number }[];
  }) => request<ManagerStockHandover>('/manager-stock-handovers/give', { method: 'POST', body }),
  managerStockClose: (items: { productId: string; countedQty: number }[]) =>
    request<{ stock: ManagerStockHandover | null }>('/manager-stock-handovers/close', {
      method: 'POST',
      body: { items },
    }),
  managerCashDrop: () => request<Shift>('/shifts/manager-drop', { method: 'POST' }),
  acceptManagerStockHandover: (id: string) =>
    request<ManagerStockHandover>(`/manager-stock-handovers/${id}/accept`, {
      method: 'POST',
    }),

  // Settlements
  settlementToday: () => request<Settlement>('/settlements/today'),
  collectSettlement: (entries: { employeeId: string; collected?: number }[]) =>
    request<Settlement>('/settlements/today/collect', {
      method: 'POST',
      body: { entries },
    }),
  closeSettlement: () =>
    request<Settlement>('/settlements/today/close', { method: 'POST' }),
  settlementsHistory: () => request<SettlementHistory[]>('/settlements'),

  // Reports
  salesReport: (from?: string, to?: string) =>
    request<SalesReport>(`/reports/sales${rangeQuery(from, to)}`),
  salesByCategory: (from?: string, to?: string) =>
    request<CategorySales[]>(`/reports/sales-by-category${rangeQuery(from, to)}`),
  topProducts: (from?: string, to?: string, limit = 10) =>
    request<TopProduct[]>(
      `/reports/top-products?${buildQuery([['from', from], ['to', to], ['limit', String(limit)]])}`,
    ),
  dailySales: (from?: string, to?: string) =>
    request<DailySales[]>(`/reports/daily${rangeQuery(from, to)}`),
  employeeReport: (from?: string, to?: string) =>
    request<EmployeeReport[]>(`/reports/employees${rangeQuery(from, to)}`),
  monthlySales: (from?: string, to?: string) =>
    request<MonthlySales[]>(`/reports/monthly${rangeQuery(from, to)}`),
  weeklySales: (from?: string, to?: string) =>
    request<WeeklySales[]>(`/reports/weekly${rangeQuery(from, to)}`),
  lowSellingProducts: (from?: string, to?: string, limit = 10) =>
    request<LowProduct[]>(
      `/reports/low-selling?${buildQuery([['from', from], ['to', to], ['limit', String(limit)]])}`,
    ),
  inventoryUsage: (from?: string, to?: string, limit = 20) =>
    request<InventoryUsage[]>(
      `/reports/inventory-usage?${buildQuery([['from', from], ['to', to], ['limit', String(limit)]])}`,
    ),
  cancellationReport: (from?: string, to?: string) =>
    request<CancellationReport>(`/reports/cancellations${rangeQuery(from, to)}`),
  activity: (limit = 100) => request<ActivityEntry[]>(`/reports/activity?limit=${limit}`),
};

export const auditApi = {
  trail: (opts?: { limit?: number; role?: string; action?: string }) =>
    request<ActivityEntry[]>(
      `/audit/trail?${buildQuery([['limit', opts?.limit ? String(opts.limit) : undefined], ['role', opts?.role], ['action', opts?.action]])}`,
    ),
  orders: () => request<AuditOrder[]>('/audit/orders'),
  cancellations: () => request<AuditCancellation[]>('/audit/cancellations'),
};

function rangeQuery(from?: string, to?: string): string {
  const query = buildQuery([['from', from], ['to', to]]);
  return query ? `?${query}` : '';
}

function buildQuery(params: Array<[string, string | undefined]>): string {
  const parts = params
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`);
  return parts.join('&');
}
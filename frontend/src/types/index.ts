/**
 * Shared TypeScript types for the frontend, mirroring the backend DTOs.
 */

export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'BARMAN' | 'WAITER';
export type OrderStatus = 'DRAFT' | 'SENT' | 'COMPLETED' | 'CANCELLED';
export type CancellationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type EditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface LoginDto {
  phone: string;
  password: string;
}

export interface RegisterDto {
  name: string;
  phone: string;
  password: string;
  role: Role;
}

export interface Category {
  id: string;
  name: string;
  products?: Product[];
  _count?: { products: number };
}

export interface SellingUnit {
  id: string;
  name: string;
  price: number;
  stockConsumption: number;
  isDefault: boolean;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  categoryId: string;
  stockUnit: string;
  piecesPerCase?: number | null;
  category?: Category;
  inventory?: Inventory;
  sellingUnits?: SellingUnit[];
}

export interface Inventory {
  id: string;
  quantity: number;
  unit: string;
  productId: string;
  product?: Product;
}

export interface RestaurantTable {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface Setting {
  id: string;
  key: string;
  value: string;
}

export interface OrderItem {
  id: string;
  productId?: string | null;
  sellingUnitId?: string | null;
  sellingName?: string | null;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  totalPrice: number;
  tableId?: string | null;
  table?: RestaurantTable | null;
  waiter?: { id: string; name: string };
  shiftId?: string | null;
  shift?: { id: string; status: 'OPEN' | 'CLOSED'; paidAt?: string | null } | null;
  items?: OrderItem[];
  sentAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  cancellationRequests?: CancellationRequest[];
  editRequests?: OrderEditRequest[];
}

export interface OrderEditRequest {
  id: string;
  orderId: string;
  requestedById: string;
  status: EditRequestStatus;
  createdAt: string;
  items?: {
    productId: string;
    quantity: number;
    productName?: string;
    unitPrice?: number;
    sellingName?: string | null;
  }[];
  requestedBy?: { id: string; name: string };
  decidedBy?: { id: string; name: string } | null;
  order?: Order;
}

export interface CancellationRequest {
  id: string;
  status: CancellationStatus;
  reason?: string | null;
  barmanId?: string | null;
  barmanDecidedAt?: string | null;
  requestedBy?: { id: string; name: string };
  order?: Order;
}

export interface Shift {
  id: string;
  status: 'OPEN' | 'CLOSED';
  startedAt: string;
  endedAt?: string | null;
  expectedMoney?: number;
  paidAt?: string | null;
  paidById?: string | null;
  user?: { id: string; name: string; role?: Role };
  paidBy?: { id: string; name: string } | null;
}

export interface StockHandoverProduct {
  id: string;
  name: string;
  stockUnit: string;
  piecesPerCase: number | null;
  category?: { name: string } | null;
}

export interface StockHandoverItem {
  id: string;
  productId: string;
  product: StockHandoverProduct;
  givenQty: number;
  countedQty: number | null;
  consumedQty: number | null;
}

export interface StockHandover {
  id: string;
  date: string;
  status: 'ACTIVE' | 'COUNTED';
  createdAt: string;
  countedAt?: string | null;
  manager?: { id: string; name: string } | null;
  barman?: { id: string; name: string } | null;
  countedBy?: { id: string; name: string } | null;
  items: StockHandoverItem[];
}

export interface ReconciliationRow {
  product: StockHandoverProduct;
  given: number;
  sold: number;
  expectedRemaining: number;
  counted: number | null;
  variance: number | null;
}

export interface ReconciliationReport {
  date: string;
  handovers: number;
  rows: ReconciliationRow[];
  summary: {
    given: number;
    sold: number;
    counted: number | null;
    allCounted: boolean;
  };
}

export interface Dashboard {
  today: { orders: number; revenue: number | null };
  totals: {
    products: number;
    categories: number;
    tables: number;
    activeTables: number;
    employees: number;
    openShifts: number;
    lowStockItems: number;
    pendingOrders: number;
  };
}

export interface SalesReport {
  orders: number;
  revenue: number | null;
  items: number;
  averageOrderValue: number;
}

export interface CategorySales {
  category: string;
  revenue: number;
  items: number;
}

export interface TopProduct {
  productName: string;
  _sum: { subtotal: number | null; quantity: number | null };
}

export interface DailySales {
  date: string;
  revenue: number;
  orders: number;
}

export interface EmployeeReport {
  userId: string;
  name: string;
  role: Role;
  orders: number;
  items: number;
  revenue: number;
  cancelled: number;
}

export interface MonthlySales {
  month: string;
  revenue: number;
  orders: number;
}

export interface WeeklySales {
  start: string;
  revenue: number;
  orders: number;
}

export interface LowProduct {
  productName: string;
  _sum: { subtotal: number | null; quantity: number | null };
}

export interface InventoryUsage {
  productName: string;
  consumed: number;
}

export interface CancellationReport {
  totalRequests: number;
  pending: number;
  approved: number;
  rejected: number;
  approvedValue: number;
}

export interface InventoryMovement {
  id: string;
  productName: string;
  change: number;
  quantityAfter: number;
  reason: string;
  orderId?: string | null;
  createdAt: string;
  order?: { orderNumber: number } | null;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  createdAt: string;
  user?: { name: string; role: Role };
}

export interface SettlementEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  expected: number;
  collected: number | null;
}

export interface Settlement {
  id: string;
  date: string;
  status: 'OPEN' | 'CLOSED';
  isClosed: boolean;
  closedAt?: string | null;
  expected: number;
  collected: number;
  difference: number;
  entries: SettlementEntry[];
}

export interface SettlementHistory {
  id: string;
  date: string;
  status: 'OPEN' | 'CLOSED';
  closedAt?: string | null;
  closedBy?: string | null;
  expected: number;
  collected: number;
  entries: SettlementEntry[];
}

export interface AuditOrder {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  totalPrice: number;
  createdAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  waiter?: { id: string; name: string };
  table?: { id: string; name: string } | null;
  items?: { productName: string; quantity: number; unitPrice: number }[];
  cancellationRequests?: {
    id: string;
    status: CancellationStatus;
    reason?: string | null;
    createdAt: string;
    requestedBy?: { name: string };
    barman?: { name: string } | null;
    decidedBy?: { name: string } | null;
  }[];
}

export interface AuditCancellation {
  id: string;
  status: CancellationStatus;
  reason?: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: number;
    status: OrderStatus;
    totalPrice: number;
  };
  requestedBy?: { id: string; name: string; role: Role };
  barman?: { id: string; name: string } | null;
  decidedBy?: { id: string; name: string } | null;
}
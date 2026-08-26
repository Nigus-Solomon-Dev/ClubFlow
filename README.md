# ClubStock — Restaurant & Nightclub Management SaaS

> A production-ready management system for restaurants and nightclubs (Addis Ababa club model), built to digitize the existing workflow while improving accountability, reducing theft, and giving owners full visibility into their business.

---

## What This App Does

ClubStock tracks the full **stock-and-cash chain** of a club:

```
Owner creates products
   ↓
Owner gives stock to Manager
   ↓
Manager gives stock to Barman (daily handover)
   ↓
Sales consume stock (barman completes orders)
   ↓
End-of-day: Cashier counts remaining stock + money and accepts
   ↓
Owner reviews reports remotely
```

The goal is **not** to change how clubs operate — it is to digitize the workflow, reduce manual reconciliation, and make theft/shortages visible.

---

## Key Business Rules

- **Orders are never deleted.** Cancelled orders stay in the system with a `Cancelled` status.
- **Inventory decreases only when the barman completes an order.**
- **Waiters** create drafts, send them (then locked), and request cancellations. They cannot edit sent orders, change prices, or touch inventory.
- **Barmen** receive orders, press DONE, and inventory auto-decrements. They cannot edit or delete orders or change prices.
- **Cashiers** approve cancellations, reconcile waiter payments, close shifts, and perform the night stock count.
- **Managers** manage employees, products, categories, prices, tables, and inventory.
- **Owners** monitor live dashboards and reports remotely but cannot edit operations.

---

## Inventory Model (Club-Specific)

Three product categories with different stock logic:

### Soft Drinks & Beer / Cold Drinks
- Stock is tracked in **pieces**, packed as **Kasa (24 pieces)**.
- 1 piece sold = 1 piece consumed.
- Owner enters stock as "how many kasas" (`kasa × 24` pieces).

### Alcohol
- Each product has its **own stock unit (Bottle)** and **selling units** (Bottle / Half / Double / Shot / Size).
- A bottle is consumed in **fractions** depending on the selling unit:
  - Black Label: 1 bottle = 20 doubles → 1 double = `1/20` bottle.
  - Jack Daniel's: 1 bottle = 40 shots → 1 shot = `1/40` bottle.
- Selling prices are configured per product (no global auto-calc formula). The owner sets prices freely.

> Core principle: separate **STOCK UNIT** (what the club owns), **SELLING UNIT** (what the customer buys), and **CONVERSION** (how much stock one sale consumes).

### Daily Stock Handover
- Manager gives stock to the barman at shift start → tracked as a handover.
- At night the **cashier counts what remains in the app and accepts** (like a waiter shift-accept).
- `consumed = given − counted`.

---

## Roles (MVP)

`OWNER`, `MANAGER`, `CASHIER`, `BARMAN`, `WAITER`

Intentionally excluded from MVP: Chef, Siga Korach, Payroll, Accounting, Supplier Management, Loyalty, Online Ordering, Delivery, Multi-Branch, AI Analytics, Payment Gateway.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Backend | NestJS, Prisma ORM, PostgreSQL, Socket.IO (WebSockets) |
| Architecture | Local Wi-Fi first (works offline); optional cloud sync for remote owner monitoring |

---

## Project Structure

```
restuerant  managment/
├── frontend/        # Next.js + TS + Tailwind (port 3000)
├── backend/         # NestJS + Prisma + PostgreSQL + Socket.IO (port 3001)
├── deploy/          # Deployment config
├── PROJECT.md       # Project constitution (rules of truth)
└── CLUB_INVENTORY_MODEL.md  # Inventory data model & business logic
```

---

## Getting Started

### Prerequisites
- Node.js (LTS)
- PostgreSQL
- npm / pnpm

### Backend
```bash
cd backend
npm install
# configure .env (DATABASE_URL, JWT secret, etc.)
npx prisma migrate dev
npx prisma db seed            # seed club products / categories
npm run start:dev             # http://localhost:3001
```

### Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

> The two apps communicate over HTTP + WebSocket. Set the backend URL in the frontend env (e.g. `NEXT_PUBLIC_API_URL`).

---

## UI Philosophy

- Mobile-first, large touch-friendly buttons, minimal typing, minimal clicks.
- Waiter / Barman / Cashier screens must be usable within minutes and without training.
- Numeric inputs use numeric keypads (no spinner arrows).
- Manager / Owner dashboards may carry more information.

---

## Documentation

- `PROJECT.md` — the project constitution. If code and docs conflict, `PROJECT.md` wins unless explicitly changed.
- `CLUB_INVENTORY_MODEL.md` — detailed nightclub inventory (stock unit / selling unit / conversion / consumption / reconciliation).

---

## Success Criteria

A successful MVP lets a club:
- Digitize waiter orders
- Manage drink inventory (pieces & bottles)
- Run daily stock handovers and night counts
- Reconcile waiter cash
- Detect discrepancies (theft / shortages)
- View reports and give owners confidence in daily operations

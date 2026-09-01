# Nightclub Inventory Data Model — Inventory Only

> Scope: understand and reflect how nightclub products are stocked, sold, consumed, and calculated in inventory.
> Do **NOT** modify or redesign the existing Waiter, Barman, or Manager workflow (ordering flow stays as-is).
> Do **NOT** implement features outside the inventory product / selling-unit / conversion / consumption / calculation logic described here.

---

## 1. Product Categories

There are **3 product categories**:

1. **SOFT DRINKS**
2. **BEER / COLD DRINKS**
3. **ALCOHOL**

---

## 2. SOFT DRINKS

### Products
| Product |
|---------|
| Sprite |
| Ambuha |
| Senq |
| Nigus |
| Sofi |
| Mirinda |
| Coca-Cola |
| Fanta |
| Pepsi |
| Tonic |

### Selling
- **1 piece = 150 ETB**
- **1 Kasa = 24 pieces**

### Inventory logic
- 1 Kasa = 24 pieces
- Every piece sold reduces inventory by **1 piece**

Example:
```
Opening stock = 5 Kasa = 120 pieces
Sold          = 7 pieces
Remaining     = 113 pieces
```

---

## 3. BEER / COLD DRINKS

### Products
| Product |
|---------|
| Harrer |
| Castel |
| Dashen |
| St. George |
| Arada |
| Heineken |
| Ten Shube |
| Habesha Keg |
| Balager |

### Selling
- **1 piece = 300 ETB**
- **1 Kasa = 24 pieces**

### Inventory logic
- 1 Kasa = 24 pieces
- Every piece sold reduces inventory by **1 piece**

Example:
```
Opening stock = 3 Kasa = 72 pieces
Sold          = 10 pieces
Remaining     = 62 pieces
```

---

## 4. ALCOHOL

> Alcohol does **NOT** use the same inventory logic as soft drinks / beer.
> Each alcohol product has its **own allowed selling units** and its **own conversion**.

### Selling configurations (per product)

| Product | Bottle | Half | Double | Shot | Size (ml) | Shots/Doubles per bottle | Allowed units |
|---|---|---|---|---|---|---|---|
| JOHNNIE WALKER GOLD LABEL | 32,000 | 16,000 | — | — | — | — | Bottle, Half |
| AMARULA | — | — | 500 | — | — | 20 doubles | Double only (unless configured) |
| JOHNNIE WALKER BLACK LABEL | 18,000 | 9,000 | 1,000 | — | — | 20 doubles | Bottle / Half / Double |
| GORDON'S | 14,000 | 7,000 | 800 | — | — | 20 doubles | Bottle / Half / Double |
| STOLICHNAYA | — | — | — | — | 750ml = 8,000 / 1L = 12,000 / 2L = 19,000 | — | Size only (no double/shot) |
| JOHNNIE WALKER DOUBLE BLACK Sr | 22,000 | 11,000 | 1,200 | — | — | 20 doubles | Bottle / Half / Double |
| JACK DANIEL'S | 16,000 | — | — | 450 | — | 40 shots | Bottle / Shot (no half/double) |
| WINTER PALACE | 750 ml = 4,500 / 1L = 8,000 | Half allowed only for 1L | — | — | — | — | Size / Half (1L only) |
| JOHN 18 | 36,000 | 18,000 | — | — | — | — | Bottle / Half |
| THE ORIGIN | 12,000 | — | — | — | — | — | Bottle only |
| CHIVAS REGAL | 20,000 | — | — | — | — | — | Bottle only |
| CHIVAS REGAL 21 | 32,000 | — | — | — | — | — | Bottle only (no double/half) |
| SAMBUCA | 4,800 | — | — | 300 | — | 16 shots | Bottle / Shot |
| TEQUILA | 4,800 | — | — | 300 | — | 16 shots | Bottle / Shot |
| RED BULL | 1,500 | — | — | — | — | — | Piece |

Notes:
- Red Bull: 1 piece = 1,500 ETB (alcohol section for pricing convenience; no bottle unit).
- WHOLESALE amounts: 20 doubles of Amarula = 10,000 ETB total sales value; Black Label 20 doubles = 20,000 ETB; Green 16,000 ETB; Double Black 24,000 ETB.

---

## 5. IMPORTANT ALCOHOL INVENTORY RULE (conversion)

A bottle can be consumed through different selling units. Inventory must consume stock **in fractions** of the bottle, never a full bottle per double/shot.

Example — Black Label (1 bottle = 20 doubles):
```
1 double sold  -> consumption = 1/20  = 0.05 bottle
5 doubles sold -> consumption = 5/20  = 0.25 bottle
20 doubles sold -> consumption = 1 full bottle
```

Same principle for shots:
```
Jack Daniel's: 1 bottle = 40 shots
10 shots sold -> consumption = 10/40 = 0.25 bottle
```

---

## IMPORTANT REVENUE RULE (doubles)

For products sold by double, the double price is intentionally configured so that selling all doubles from one bottle equals bottle price + 2,000 ETB.

```
DOUBLE PRICE = (Bottle Price + 2,000) / (doubles per bottle)
```

Examples:
```
Black Label:   (18,000 + 2,000) / 20 = 1,000 ETB
Gordon's:      (14,000 + 2,000) / 20 = 800 ETB
Double Black:  (22,000 + 2,000) / 20 = 1,200 ETB
Amarula:       (8,000  + 2,000) / 20 = 500 ETB
```

Do **NOT** hardcode this formula globally; products could have different business rules later.
Store the product's **actual selling configuration** (its allowed units and unit prices).

---

## CORE INVENTORY PHYSICALLY PRINCIPLE

Separate these three concepts per product:

| Concept | Meaning | Example (Black Label) |
|---|---|---|
| **STOCK UNIT** | What the club physically owns | Bottle |
| **SELLING UNIT** | What the customer buys | Bottle / Half / Double |
| **CONVERSION** | How much stock one sale consumes | 1/20 bottle per double |

```
Beer:          stock = Piece, selling = Piece, conversion = 1 piece
Soft drink:    stock = Piece, selling = Piece, conversion = 1 piece
```

This must be represented properly in the database / model.

---

## RECONCILIATION

The inventory system must calculate:

```
Opening Stock
+ Stock Added
- Stock Consumed
= Expected Remaining Stock
```

```
Selling Units Sold
× Selling Price
= Expected Sales
```

Rules:
- For alcohol, use the product's conversion; never subtract "1 bottle" when a double/shot is sold.
- Inventory stock shown against products that physically exist — do not create fake quantities.
- Do not guess missing prices or selling units; store only configured prices/units.

---

## GUARDRAILS

1. Do not modify the existing ordering workflow.
2. Do not modify unrelated features.
3. Only implement/review the inventory **product → selling-unit → conversion → consumption → reconciliation** logic described above.

---

## IMPLEMENTATION DECISIONS (agree with the owner, 2026-08)

**Approach: step by step — one feature at a time, then confirm.**

| # | Decision |
|---|---|
| 1 | Multi-size bottles (Stolichnaya 750ml/1L/2L, Winter Palace 750ml/1L) = **one product per size (SKU)**, each with its own stock line and price. |
| 2 | Employee display stays in the **selling unit** (e.g. "17 doubles remain"); internal stock keeps decimals/severals (e.g. 0.85 bottle). Display ≠ internal precision. |
| 3 | POS gains a **unit picker** step when ordering (e.g. Black Label → Double / Half / Bottle); order flow itself unchanged. |
| 4 | Stock levels shown as **"X Kasa + Y pieces"** (e.g. 26 → 1 Kasa 2 pieces). Entry/stock math stored in pieces. |
| 5 | **Daily stock handover flow** (shift-style): manager gives stock to the barman at the start → the stock is tracked; at night the **cashier counts what remains in the app and accepts**, just like the waiter shift-accept. Consumption = given − counted. |

**Data model added (Step 1):**
- `Product.stockUnit` (Piece/Bottle…) + `Product.piecesPerCase` (default 24).
- `SellingUnit` per product: name, price, `stockConsumption` factor (stock units per sale), `isDefault`.
- `OrderItem.sellingUnitId` — the sold unit is recorded on the order line.
- `Inventory`/`InventoryMovement` quantities — Decimal(12,4) so fractions like 1/20 or 1/16 of a bottle are exact.
- `StockHandover` + `StockHandoverItem` — daily manager→barman given qty; cashier records counted qty at night; `consumedQty = given − counted`.
- Backend-stored **per-product selling configuration** — no global "+(2,000)/doubles" rule; those prices are stored as configured prices.

**Remaining steps (next, in order):**
1. Seed the real products (soft drinks, beer/cold, alcohol) with their units, prices, and conversions.
2. Waiter POS: unit picker for multi-unit products; inventory consumes by conversion.
3. Manager: create/accept daily stock handover; Cashier: night count-&accept screen.
4. Reconciliation report (expected remain / expected sales).
5. Simplify manager screens to match club flow.
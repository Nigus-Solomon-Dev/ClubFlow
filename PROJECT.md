# Restaurant Management SaaS

> This document is the constitution of the project.
>
> If there is any conflict between the code, AI assumptions, or previous implementations, this document always takes precedence unless the user explicitly changes it.

---

# Project Overview

This project is a production-ready Restaurant Management SaaS designed for restaurants in Addis Ababa.

The goal is not to change how restaurants operate.

Instead, the goal is to digitize the existing workflow while improving accountability, reducing theft, reducing manual work, and giving restaurant owners complete visibility into their business.

This software is intended to become a commercial SaaS product.

Every decision should improve the business first, not simply add technology.

---

# Main Objectives

The software must:

- Reduce employee theft.
- Improve accountability.
- Reduce end-of-day reconciliation time.
- Preserve the restaurant's existing workflow.
- Be extremely easy for employees to use.
- Give managers complete operational control.
- Give owners complete business visibility.

---

# MVP Scope

Version 1 focuses ONLY on these users:

- Waiter
- Barman
- Cashier
- Manager
- Owner

The following modules are intentionally excluded from the MVP:

- Chef
- Siga Korach
- Payroll
- Accounting
- Supplier Management
- Customer Loyalty
- Online Ordering
- Delivery
- Multi-Branch Management
- AI Analytics
- Payment Gateway Integration

Do NOT implement these unless instructed.

---

# Business Philosophy

Never change the restaurant workflow unless it provides a measurable business benefit.

Restaurant owners buy trust, accountability, and visibility.

They do NOT buy software.

Every feature must solve a real business problem.

Always prefer simple solutions over complicated ones.

---

# Restaurant Workflow

## Beginning of Shift

1. Employees arrive.
2. Employees connect to the restaurant Wi-Fi.
3. Employees log into the system.
4. Cashier starts the daily shift.
5. Manager confirms inventory.

---

## Customer Orders

1. Customer calls the waiter.
2. Waiter selects a table.
3. Waiter creates a draft order.
4. Waiter may freely edit the draft.
5. Waiter sends the order.
6. Sent orders become locked.
7. Barman instantly receives the order.
8. Barman prepares the drinks.
9. Barman presses DONE.
10. Inventory updates automatically.
11. Customer pays the waiter.

---

## Cancellation Workflow

If an order has already been sent:

- Waiter cannot edit it.
- Waiter requests cancellation.
- Cashier approves the cancellation.
- Order status changes to Cancelled.
- Order is NEVER deleted.

---

## End of Shift

The cashier reconciles every waiter.

The system automatically calculates:

- Expected cash
- Orders completed
- Cancelled orders

The barman verifies remaining inventory.

The owner reviews reports remotely.

---

# Business Rules

The following rules are permanent.

## Orders

- Orders are NEVER deleted.
- Cancelled does NOT mean deleted.
- Every order has a unique Order ID.
- Every order records the waiter.
- Every order records timestamps.
- Multiple items belong to one order.

---

## Waiters

Waiters can:

- Login
- Select table
- Create draft orders
- Edit draft orders
- Send orders
- View own orders
- Request cancellations

Waiters CANNOT:

- Delete orders
- Edit sent orders
- Change prices
- Manage inventory

---

## Barman

Barman can:

- Receive orders
- View incoming orders
- Complete orders
- View inventory

Barman CANNOT:

- Delete orders
- Edit orders
- Change prices

When the barman presses DONE:

- Inventory automatically decreases.
- Order status changes to Completed.

---

## Cashier

Cashier can:

- View all orders
- Approve cancellations
- Reconcile waiter payments
- Close shifts
- View reports

Cashier cannot edit completed orders.

---

## Manager

Manager is responsible for the restaurant's daily operation.

Manager can:

- Manage employees
- Manage products
- Manage categories
- Manage inventory
- Manage prices
- Manage restaurant tables
- View reports
- Configure restaurant settings

---

## Owner

The Owner does NOT operate the restaurant.

The Owner monitors the business.

Owner can:

- View live dashboard
- View sales reports
- View inventory reports
- View employee performance
- View activity logs
- Monitor the restaurant remotely

Owner cannot edit restaurant operations.

---

# Inventory Rules

Inventory decreases only when the barman completes an order.

Inventory is never changed by the waiter.

Inventory reconciliation happens automatically at the end of the shift.

---

# Activity Log

Every important action must be recorded.

Examples:

- Login
- Logout
- Order Created
- Order Cancelled
- Order Completed
- Price Changed
- Inventory Updated
- Shift Started
- Shift Closed

Nothing important should happen without a log.

---

# Shift Management

Every employee has:

- Shift Start
- Shift End

The system must always know who was working.

---

# Product Availability

Manager can mark products:

- Available
- Out of Stock

Out-of-stock products immediately disappear from waiter ordering screens.

---

# Daily Closing Report

At the end of every shift the system generates:

- Total Sales
- Total Orders
- Completed Orders
- Cancelled Orders
- Expected Cash
- Inventory Difference
- Employee Performance

---

# User Interface Philosophy

The UI must be extremely simple.

Employees may have limited technical experience.

The system must prioritize:

- Simplicity
- Speed
- Large touch-friendly buttons
- Clear navigation
- Minimal typing
- Minimal clicks
- Mobile-first design

Avoid:

- Complex interfaces
- Fancy animations
- Unnecessary popups

Waiter, Barman, and Cashier screens should be usable within minutes without training.

Manager and Owner dashboards may contain more information.

---

# Tech Stack

## Frontend

- Next.js
- TypeScript
- Tailwind CSS

## Backend

- NestJS
- Prisma ORM
- PostgreSQL
- WebSockets

---

# Architecture

Employee Phones

↓

Restaurant Wi-Fi

↓

NestJS Backend

↓

PostgreSQL

↓

Prisma ORM

↓

WebSockets

↓

Manager Dashboard

↓

Cloud Synchronization (Future)

↓

Owner Dashboard

The restaurant must continue operating on local Wi-Fi even if the internet connection is unavailable.

Cloud synchronization exists primarily for remote owner monitoring.

---

# Development Principles

Build only one phase at a time.

Never skip phases.

Never redesign completed work unless instructed.

Never add features outside the current phase.

Write production-quality code.

Keep code modular.

Keep frontend components reusable.

Keep backend business logic organized.

Always prioritize maintainability.

Never over-engineer.

Always choose the simplest solution that solves the business problem.

---

# Success Criteria

A successful MVP should allow a restaurant to:

- Digitize waiter orders
- Manage drink inventory
- Reconcile waiter cash
- Detect discrepancies
- View reports
- Reduce manual work
- Reduce theft opportunities
- Give owners confidence in daily operations
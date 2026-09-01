'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { canAccess, useAuth } from '../context/AuthContext';
import { useHydrated } from '../hooks';
import { useRealtime } from '../hooks/useRealtime';
import { api } from '../services/api';
import {
  REAL_TIME_EVENTS,
  subscribeConnectionStatus,
  type ConnectionStatus,
} from '../services/realtime';
import type { AuthUser, Role, Shift } from '../types';
import { LiveToasts } from './LiveToasts';

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['OWNER', 'MANAGER'] },
  { href: '/pos', label: 'POS', roles: ['WAITER', 'BARMAN', 'CASHIER'] },
  { href: '/history', label: 'History', roles: ['WAITER', 'BARMAN', 'CASHIER'] },
  { href: '/handover', label: 'Stock handover', roles: ['MANAGER', 'OWNER'] },
  { href: '/settlements', label: 'End of day', roles: ['CASHIER', 'MANAGER', 'OWNER'] },
  { href: '/menu', label: 'Products', roles: ['OWNER'] },
  { href: '/tables', label: 'Tables', roles: ['MANAGER', 'OWNER'] },
  { href: '/employees', label: 'Employees', roles: ['MANAGER', 'OWNER'] },
  { href: '/shifts', label: 'Shifts', roles: ['OWNER', 'MANAGER', 'CASHIER', 'BARMAN', 'WAITER'] },
  { href: '/reports', label: 'Reports', roles: ['OWNER', 'MANAGER'] },
];

function SidebarNav({
  items,
  pathname,
  isLocked,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  isLocked?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 p-3">
      {items.map((item) => {
        const active = pathname === item.href;
        const locked = isLocked && item.href !== '/shifts';
        if (locked) {
          return (
            <div
              key={item.href}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 cursor-not-allowed opacity-50 select-none"
              title="Clock in to unlock"
            >
              <span>{item.label}</span>
              <span className="text-xs">🔒</span>
            </div>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserPanel({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  return (
    <div className="border-t border-zinc-200 p-3">
      <div className="px-2 py-2">
        <p className="text-sm font-semibold text-zinc-900">{user.name}</p>
        <p className="text-xs uppercase tracking-wide text-zinc-400">{user.role}</p>
      </div>
      <button
        onClick={onLogout}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
      >
        Log out
      </button>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('connecting');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftLoaded, setShiftLoaded] = useState(false);

  useEffect(() => subscribeConnectionStatus(setWsStatus), []);

  const isFrontline =
    user?.role === 'WAITER' ||
    user?.role === 'BARMAN' ||
    user?.role === 'CASHIER';

  const reloadShifts = useCallback(() => {
    if (!user) return;
    api
      .shifts()
      .then((s) => {
        setShifts(s);
        setShiftLoaded(true);
      })
      .catch(() => setShiftLoaded(true));
  }, [user]);

  useEffect(() => {
    reloadShifts();
    const onShiftChanged = () => reloadShifts();
    window.addEventListener('shift-status-changed', onShiftChanged);
    return () => {
      window.removeEventListener('shift-status-changed', onShiftChanged);
    };
  }, [reloadShifts]);

  useRealtime(
    [
      REAL_TIME_EVENTS.shiftOpened,
      REAL_TIME_EVENTS.shiftClosed,
      REAL_TIME_EVENTS.shiftAccepted,
    ],
    reloadShifts,
  );

  const hasOpenShift = shifts.some((s) => s.status === 'OPEN');
  const isLocked = isFrontline && shiftLoaded && !hasOpenShift;

  const roleHome =
    user?.role === 'MANAGER' || user?.role === 'OWNER'
      ? '/dashboard'
      : hasOpenShift
      ? '/pos'
      : '/shifts';

  const allowedPaths = NAV.filter((n) => canAccess(user?.role, n.roles)).map(
    (n) => n.href,
  );

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!allowedPaths.includes(pathname)) {
      router.replace(roleHome);
      return;
    }
    if (isFrontline && shiftLoaded && !hasOpenShift && pathname !== '/shifts') {
      router.replace('/shifts');
    }
  }, [
    user,
    router,
    hydrated,
    pathname,
    allowedPaths,
    roleHome,
    isFrontline,
    shiftLoaded,
    hasOpenShift,
  ]);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500">
        Redirecting…
      </div>
    );
  }

  const items = NAV.filter((n) => canAccess(user.role, n.roles));

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
        <p className="text-base font-bold text-zinc-900">Restaurant</p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{user.name}</span>
          <button
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-zinc-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <p className="font-bold text-zinc-900">Menu</p>
              <button
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>
            <SidebarNav
              items={items}
              pathname={pathname}
              isLocked={isLocked}
              onNavigate={() => setOpen(false)}
            />
            <UserPanel user={user} onLogout={handleLogout} />
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-zinc-200 bg-white md:flex">
        <div className="border-b border-zinc-200 px-5 py-4">
          <p className="text-base font-bold text-zinc-900">Restaurant</p>
          <p className="text-xs text-zinc-500">Management Suite</p>
        </div>
        <SidebarNav items={items} pathname={pathname} isLocked={isLocked} />
        <UserPanel user={user} onLogout={handleLogout} />
      </aside>

      <main className="p-4 md:ml-60 md:p-6">
        {wsStatus === 'reconnecting' ? (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <span>
              Live connection lost &mdash; reconnecting. You may be seeing
              outdated information.
            </span>
            <span className="text-xs font-medium uppercase tracking-wide">
              Reconnecting&hellip;
            </span>
          </div>
        ) : null}

        {isLocked && pathname === '/shifts' ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3.5 shadow-sm text-sm text-zinc-700">
            <div className="flex items-center gap-2.5">
              <span className="text-base">🔒</span>
              <span>Please <strong>Clock in</strong> below to start your shift and unlock your features.</span>
            </div>
            <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
              Off duty
            </span>
          </div>
        ) : null}

        {children}
      </main>
      <LiveToasts />
    </div>
  );
}
'use client';

/**
 * Returns `false` until hydration completes, then `true`.
 *
 * Because auth user state is only known after hydration (localStorage is not
 * available during SSR), any "logged out?" check / redirect must wait for
 * hydration to complete, otherwise refreshing a logged-in page would instantly
 * redirect to /login.
 */

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
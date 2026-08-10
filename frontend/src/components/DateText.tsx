'use client';

/**
 * Hydration-safe date rendering.
 * Server and browser can disagree on locale formatting, which triggers
 * Next.js hydration errors. We render a placeholder until the client mounts.
 */

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export default function DateText({
  value,
  withTime = true,
}: {
  value?: string | null;
  withTime?: boolean;
}) {
  const mounted = useMounted();

  if (!value || !mounted) {
    return <span>—</span>;
  }

  const d = new Date(value);
  return (
    <span>
      {withTime
        ? d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
        : d.toLocaleDateString()}
    </span>
  );
}
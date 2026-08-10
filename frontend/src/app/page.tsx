'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useHydrated } from '@/hooks';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const hydrated = useHydrated();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    const dest = user.role === 'MANAGER' || user.role === 'OWNER' ? '/dashboard' : '/pos';
    router.replace(dest);
  }, [user, router, hydrated]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500">
      Redirecting…
    </main>
  );
}
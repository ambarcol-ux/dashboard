"use client";
import {createContext, useContext, useState} from 'react';
import {supabase} from '@/lib/supabase';
import {createAccessReader, type VerifiedAccess} from '@/lib/verified-access';
const AccessContext = createContext<ReturnType<typeof createAccessReader> | null>(null);
export function VerifiedAccessProvider({initial, children}: {initial: VerifiedAccess | null; children: React.ReactNode}) {
  const [read] = useState(() => createAccessReader(supabase, initial));
  return <AccessContext.Provider value={read}>{children}</AccessContext.Provider>;
}
export function useVerifiedAccess() {
  const read = useContext(AccessContext);
  const [fallback] = useState(() => createAccessReader(supabase, null));
  return read ?? fallback;
}

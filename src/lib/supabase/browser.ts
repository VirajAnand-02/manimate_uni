import { createBrowserClient } from '@supabase/ssr';

/** Anon-key client for the sign-in UI. Safe to ship to the browser. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseServiceRoleKey, supabaseUrl } from './env';

let cached: SupabaseClient | null = null;

/**
 * Service-role client that bypasses RLS.
 *
 * The render pipeline is a detached promise with no request context and so no
 * user cookie — it cannot use the request-scoped client. Callers are therefore
 * responsible for scoping by user_id themselves.
 */
export function adminClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(supabaseUrl(), supabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

import { headers } from 'next/headers';

/**
 * Carries the authenticated user id from middleware to route handlers.
 *
 * `supabase.auth.getUser()` revalidates the JWT against Supabase over the
 * network. Middleware already does that on every matched request, so calling it
 * again inside the handler doubled the auth round trips on endpoints the Studio
 * page polls every couple of seconds.
 *
 * Spoofing is not a concern: updateSession() strips any inbound copy of this
 * header before setting its own, and the middleware matcher covers every /api
 * path. A request that somehow bypassed middleware arrives with no header and is
 * treated as signed out.
 */
export const USER_ID_HEADER = 'x-manimate-user-id';

/**
 * The signed-in user, or null. Does not hit the network.
 *
 * Shaped `{ id }` so call sites read the same as the `getUser()` result they
 * replaced. Nothing else about the user is needed by any handler.
 */
export async function requestUser(): Promise<{ id: string } | null> {
  const store = await headers();
  const id = store.get(USER_ID_HEADER);
  return id ? { id } : null;
}

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { USER_ID_HEADER } from './requestUser';

const PUBLIC_PATHS = ['/login', '/auth'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and bounces
 * unauthenticated browsers to /login. API routes are left to answer 401
 * themselves so fetch callers get JSON rather than a login page.
 */
const SETUP_MESSAGE =
  'Supabase is not configured.\n\n' +
  'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env\n' +
  '(Supabase dashboard -> Project Settings -> API), then restart the server.\n\n' +
  'These are inlined into the client bundle at build time, so a running dev\n' +
  'server will not pick them up until it restarts.';

export async function updateSession(request: NextRequest) {
  // Any inbound copy of the identity header is discarded before we set our own,
  // so a client cannot present itself as another user.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(USER_ID_HEADER);

  // Cookies are collected rather than written straight onto a response, because
  // the response can only be built once the user id is known — and rebuilding it
  // afterwards would drop the refreshed session cookies on the floor.
  let pendingCookies: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];

  // Referenced as literals, not via a helper: Next inlines NEXT_PUBLIC_* at
  // build time, and dynamic process.env[name] lookups are undefined on the edge.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without this, createServerClient throws and every route — including /login —
  // answers an opaque 500.
  if (!url || !anonKey) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: SETUP_MESSAGE }, { status: 503 });
    }
    return new NextResponse(SETUP_MESSAGE, {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          pendingCookies = pendingCookies.concat(cookiesToSet as typeof pendingCookies);
        },
      },
    },
  );

  // getUser() revalidates against Supabase; getSession() would trust the cookie.
  // If Supabase is unreachable we fail closed (treat as signed out) rather than
  // letting the exception 500 every route in the app.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    console.error('[middleware] session check failed:', error);
  }

  // Route handlers read this instead of making their own getUser() call.
  if (user) requestHeaders.set(USER_ID_HEADER, user.id);

  const { pathname } = request.nextUrl;
  if (!user && !isPublic(pathname) && !pathname.startsWith('/api/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    const redirect = NextResponse.redirect(url);
    for (const { name, value, options } of pendingCookies) {
      redirect.cookies.set(name, value, options as never);
    }
    return redirect;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options as never);
  }
  return response;
}

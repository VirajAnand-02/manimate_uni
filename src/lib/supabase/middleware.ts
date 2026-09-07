import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
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

  const { pathname } = request.nextUrl;
  if (!user && !isPublic(pathname) && !pathname.startsWith('/api/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

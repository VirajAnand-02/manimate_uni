/**
 * Sends the browser to the login page, remembering where it was.
 *
 * middleware.ts guards page navigations, but a session can still lapse while a
 * page is open — API calls then answer 401 and the UI would otherwise just show
 * an empty or "offline" state with no explanation.
 */
export function redirectToLogin() {
  if (typeof window === 'undefined') return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?next=${next}`;
}

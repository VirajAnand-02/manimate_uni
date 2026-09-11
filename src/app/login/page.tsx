"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ArrowRight } from 'lucide-react';
import { createClient } from '@/src/lib/supabase/browser';
import BrandMark from '@/src/components/layout/BrandMark';

type Mode = 'signin' | 'signup';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        // With "Confirm email" on (the Supabase default) there is no session yet.
        if (!data.session) {
          setNotice('Check your inbox to confirm your address, then sign in.');
          setMode('signin');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-ink-700 bg-ink-900/80 px-3.5 py-3 text-sm text-chalk-100 outline-none transition-colors placeholder:text-chalk-500 hover:border-ink-600 focus:border-amber-400/50';

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="text-amber-400">
            <BrandMark className="h-11 w-11" />
          </span>
          <h1 className="mt-4 font-display text-[34px] leading-none text-chalk-100">Manimate</h1>
          <p className="mt-2 text-sm text-chalk-400">
            {mode === 'signin' ? 'Sign in to your lectures' : 'Create an account to get started'}
          </p>
        </div>

        <form onSubmit={submit} className="panel-raised edge-light space-y-4 rounded-[var(--radius-card)] p-6">
          <label className="block space-y-1.5">
            <span className="label block">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="label block">Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>

          {error && (
            <p className="rounded-lg border border-alert-500/30 bg-alert-500/10 px-3 py-2 text-[13px] leading-relaxed text-alert-300">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-lg border border-signal-500/30 bg-signal-500/10 px-3 py-2 text-[13px] leading-relaxed text-signal-300">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="sweep-host flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 text-sm font-semibold text-ink-950 transition-colors hover:bg-amber-300 disabled:pointer-events-none disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null); }}
          className="mt-5 w-full text-[13px] text-chalk-400 transition-colors hover:text-chalk-100"
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already registered? Sign in'}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginForm />
    </Suspense>
  );
}

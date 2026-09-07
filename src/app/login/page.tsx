"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';
import { createClient } from '@/src/lib/supabase/browser';

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

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-black relative">
      <div className="fixed inset-0 bg-grid opacity-[0.2] pointer-events-none" />
      <div className="fixed -top-[10%] -right-[10%] w-[60%] h-[60%] bg-brand-600/10 blur-[150px] rounded-full pointer-events-none" />

      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-sm bg-zinc-950/80 border border-white/10 rounded-2xl p-8 backdrop-blur-xl space-y-6"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-display font-black text-white uppercase tracking-tighter">
            Manimate
          </h1>
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-600">
            {mode === 'signin' ? 'Access your constructs' : 'Create an account'}
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-zinc-900 border border-white/5 focus:border-brand-500/50 outline-none rounded-lg px-4 py-3 text-sm text-white placeholder:text-zinc-700 transition-colors"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-zinc-900 border border-white/5 focus:border-brand-500/50 outline-none rounded-lg px-4 py-3 text-sm text-white placeholder:text-zinc-700 transition-colors"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400 font-mono leading-relaxed">{error}</p>
        )}
        {notice && (
          <p className="text-xs text-brand-400 font-mono leading-relaxed">{notice}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-widest py-3 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null); }}
          className="w-full text-[10px] font-mono uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already registered? Sign in'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <LoginForm />
    </Suspense>
  );
}

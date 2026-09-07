function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in your Supabase project settings.`,
    );
  }
  return value;
}

export function supabaseUrl() {
  return required('NEXT_PUBLIC_SUPABASE_URL');
}

export function supabaseAnonKey() {
  return required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function supabaseServiceRoleKey() {
  return required('SUPABASE_SERVICE_ROLE_KEY');
}

export function storageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET || 'generations';
}

-- Quick Expense: lock down Supabase PostgREST access for internal tables.
-- Safe to run multiple times.

-- 1) Enable RLS on all internal tables.
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fx_rate_backups ENABLE ROW LEVEL SECURITY;

-- 2) Create explicit restrictive deny-all policies (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.polname = 'deny all'
      AND n.nspname = 'public'
      AND c.relname = 'users'
  ) THEN
    CREATE POLICY "deny all" ON public.users AS RESTRICTIVE USING (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.polname = 'deny all'
      AND n.nspname = 'public'
      AND c.relname = 'sessions'
  ) THEN
    CREATE POLICY "deny all" ON public.sessions AS RESTRICTIVE USING (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.polname = 'deny all'
      AND n.nspname = 'public'
      AND c.relname = 'fx_rate_backups'
  ) THEN
    CREATE POLICY "deny all" ON public.fx_rate_backups AS RESTRICTIVE USING (false);
  END IF;
END
$$;

-- 3) Defense in depth: revoke PostgREST role access.
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.fx_rate_backups FROM anon, authenticated;

-- Enable RLS on user_column_visibility to prevent public PostgREST access.
-- Follows the same pattern as 002_enable_rls_and_revoke_postgrest_access.sql.
-- Safe to run multiple times.

-- 1) Enable RLS.
ALTER TABLE IF EXISTS public.user_column_visibility ENABLE ROW LEVEL SECURITY;

-- 2) Create explicit restrictive deny-all policy (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.polname = 'deny all'
      AND n.nspname = 'public'
      AND c.relname = 'user_column_visibility'
  ) THEN
    CREATE POLICY "deny all" ON public.user_column_visibility AS RESTRICTIVE USING (false);
  END IF;
END
$$;

-- 3) Defense in depth: revoke PostgREST role access.
REVOKE ALL ON TABLE public.user_column_visibility FROM anon, authenticated;

/*
# Perfiles de usuario y producciones

Creates the staff profile table that stores each user's role (Admin, Operador, Gerente) and the productions table used to group all control records.

1. New Tables
- `profiles`: one row per signed-in staff member.
  - `id` (uuid, primary key, same as the auth user id)
  - `email` (text)
  - `full_name` (text, optional display name)
  - `role` (text): 'admin', 'operador' or 'gerente'. Defaults to 'operador'.
  - `created_at` (timestamp)
- `productions`: production lines or runs that reoperations are recorded against.
  - `id` (uuid, primary key)
  - `code` (text, unique production code)
  - `name` (text)
  - `description` (text, optional)
  - `status` (text): 'activa' or 'finalizada'
  - `created_by` (uuid, defaults to the signed-in user)
  - `created_at`, `updated_at` (timestamps)

2. Automatic behavior
- A trigger creates a profile whenever a new user signs up. The first user ever registered becomes 'admin'; later users become 'operador'. Roles are never taken from client input.
- Existing auth users without a profile are backfilled the same way.

3. Security
- RLS enabled on both tables.
- profiles: authenticated users can read only their own profile. No client write access, so users cannot change their own role.
- productions: all authenticated staff can read productions. Only 'admin' and 'gerente' can create or edit them; only 'admin' can delete them.
- `current_user_role()` helper reads the caller's role from profiles and is restricted to authenticated users.

4. Important notes
- No existing data is modified or removed.
- All statements are idempotent and safe to re-run.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'operador' CHECK (role IN ('admin', 'operador', 'gerente')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'activa' CHECK (status IN ('activa', 'finalizada')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS productions_created_at_idx ON productions (created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN EXISTS (SELECT 1 FROM public.profiles) THEN 'operador' ELSE 'admin' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

INSERT INTO profiles (id, email, full_name, role)
SELECT u.id,
       COALESCE(u.email, ''),
       NULLIF(u.raw_user_meta_data->>'full_name', ''),
       CASE WHEN EXISTS (SELECT 1 FROM profiles) THEN 'operador' ELSE 'admin' END
FROM auth.users u
ORDER BY u.created_at
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE productions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON productions TO authenticated;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "select_productions" ON productions;
CREATE POLICY "select_productions" ON productions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_productions_managers" ON productions;
CREATE POLICY "insert_productions_managers" ON productions FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'gerente') AND created_by = auth.uid());

DROP POLICY IF EXISTS "update_productions_managers" ON productions;
CREATE POLICY "update_productions_managers" ON productions FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'gerente'))
  WITH CHECK (public.current_user_role() IN ('admin', 'gerente'));

DROP POLICY IF EXISTS "delete_productions_admin" ON productions;
CREATE POLICY "delete_productions_admin" ON productions FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

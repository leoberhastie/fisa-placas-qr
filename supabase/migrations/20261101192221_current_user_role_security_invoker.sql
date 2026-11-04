/*
# Run current_user_role as the caller

Changes the role helper so it runs with the caller's own permissions instead of the function owner's.

1. Modified Functions
- `current_user_role()`: now SECURITY INVOKER. It returns only the signed-in user's role, which the caller can already read through their own profile row policy.

2. Security
- Removes the SECURITY DEFINER exposure flagged for signed-in users.
- Execute permission remains limited to authenticated users.

3. Important notes
- No data is changed. Policies that call this helper behave the same.
*/

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT p.role FROM public.profiles p WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

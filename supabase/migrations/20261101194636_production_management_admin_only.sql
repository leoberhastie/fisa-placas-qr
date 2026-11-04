/*
# Production management limited to administrators

Only administrators can create, edit or change the status of productions. Gerentes and operadores can still read productions and select one to work with.

1. Modified Policies
- productions `insert_productions_managers` renamed to `insert_productions_admin`: WITH CHECK requires role 'admin' and created_by = caller.
- productions `update_productions_managers` renamed to `update_productions_admin`: USING and WITH CHECK require role 'admin'.
- productions `delete_productions_admin` is unchanged.

2. Important notes
- No data is changed or removed.
- Idempotent: old policy names are dropped before the new ones are created.
*/

DROP POLICY IF EXISTS "insert_productions_managers" ON productions;
DROP POLICY IF EXISTS "insert_productions_admin" ON productions;
CREATE POLICY "insert_productions_admin" ON productions FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin' AND created_by = auth.uid());

DROP POLICY IF EXISTS "update_productions_managers" ON productions;
DROP POLICY IF EXISTS "update_productions_admin" ON productions;
CREATE POLICY "update_productions_admin" ON productions FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

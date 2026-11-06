/*
# Allow gerente role to update reoperaciones (mark as recuperada)

1. Purpose
   Gerente users need to be able to mark placas/cajas as completed, just like
   admin and operador. The closure of a reoperation (marking it 'completo') is
   an UPDATE on the reoperaciones table, which was restricted to admin/operador
   only by the existing RLS policy. This adds 'gerente' to that policy.

2. Security changes
   - DROP and recreate the UPDATE policy on reoperaciones so
     current_user_role() in ('admin','operador','gerente').
   - No other table grants or policies are touched. INSERT on recuperaciones
     and historial_operaciones already allow any authenticated user, so the
     rest of the manual-closure flow already works for gerente.
*/

DROP POLICY IF EXISTS "update_reoperaciones" ON reoperaciones;

CREATE POLICY "update_reoperaciones"
ON reoperaciones FOR UPDATE
TO authenticated
USING (current_user_role() = ANY (ARRAY['admin'::text, 'operador'::text, 'gerente'::text]))
WITH CHECK (current_user_role() = ANY (ARRAY['admin'::text, 'operador'::text, 'gerente'::text]));

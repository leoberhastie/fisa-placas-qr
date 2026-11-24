/*
# Permitir al rol 'filtro' actualizar reoperaciones

El rol filtro puede registrar operaciones y marcar reoperaciones como completadas
(desglose de placas fisicas), igual que el operador. Esta migracion extiende la
politica UPDATE de reoperaciones para incluirlo.

Las politicas de INSERT ya lo cubren (with_check true para authenticated).
No se modifica ninguna otra politica.
*/

DROP POLICY IF EXISTS update_reoperaciones ON public.reoperaciones;
CREATE POLICY update_reoperaciones ON public.reoperaciones
FOR UPDATE
TO authenticated
USING (current_user_role() = ANY (ARRAY['admin'::text, 'operador'::text, 'gerente'::text, 'filtro'::text]))
WITH CHECK (current_user_role() = ANY (ARRAY['admin'::text, 'operador'::text, 'gerente'::text, 'filtro'::text]));

/*
# Resolve prior reoperations when a plate is recovered

1. Purpose
- Make recovery state chronological per plate.
- A recovery resolves every earlier pending reoperation for the same plate and production.
- A later reoperation remains pending until a later recovery is registered.

2. Data correction
- Existing pending reoperations that already have a later recovery are marked `completo`.
- No rows are deleted and no recovery or reoperation history is removed.

3. Database behavior
- Add `resolve_prior_reoperations_after_recovery()` as an AFTER INSERT trigger function.
- Add trigger `recuperaciones_resuelven_reoperaciones_anteriores` on `recuperaciones`.
- Resolution uses fecha_hora, created_at, and id to maintain deterministic ordering.

4. Security
- The trigger function is SECURITY DEFINER with a fixed search_path and is not executable by anon or authenticated clients.
- Existing table RLS, grants, and application permissions remain unchanged.

5. Resulting rule
- Plate reoperation at T1, reoperation at T2, recovery at T3: both reoperations become complete.
- The same plate reoperation at T4: only the T4 reoperation is pending.
*/

CREATE OR REPLACE FUNCTION public.resolve_prior_reoperations_after_recovery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.placa_id IS NOT NULL THEN
    UPDATE public.reoperaciones
    SET estado = 'completo'
    WHERE produccion_id = NEW.produccion_id
      AND placa_id = NEW.placa_id
      AND estado = 'pendiente'
      AND (fecha_hora, created_at, id) <= (NEW.fecha_hora, NEW.created_at, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_prior_reoperations_after_recovery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS recuperaciones_resuelven_reoperaciones_anteriores ON public.recuperaciones;
CREATE TRIGGER recuperaciones_resuelven_reoperaciones_anteriores
AFTER INSERT ON public.recuperaciones
FOR EACH ROW
EXECUTE FUNCTION public.resolve_prior_reoperations_after_recovery();

UPDATE public.reoperaciones r
SET estado = 'completo'
WHERE r.estado = 'pendiente'
  AND EXISTS (
    SELECT 1
    FROM public.recuperaciones c
    WHERE c.produccion_id = r.produccion_id
      AND c.placa_id = r.placa_id
      AND (c.fecha_hora, c.created_at, c.id) > (r.fecha_hora, r.created_at, r.id)
  );
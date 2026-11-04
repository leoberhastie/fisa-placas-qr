/*
# Bump production data version on operations

## Plain-English summary
Every production has a counter, `productions.version_datos`, that the app uses to know
whether its data changed. Until now only data imports increased it. Operator actions
(registering reoperaciones, recuperaciones, manual closings) did not, so open screens
could show outdated numbers without any warning.

This migration makes every insert, update or delete on `reoperaciones` and
`recuperaciones` increase the counter of the affected production by one.

## 1. Modified objects
- New function `bump_production_data_version()` (trigger function).
- New triggers `reoperaciones_bump_data_version` and `recuperaciones_bump_data_version`
  (AFTER INSERT/UPDATE/DELETE, FOR EACH ROW).

## 2. Security
- The function is SECURITY DEFINER with a fixed search_path, so an operator can bump the
  counter even though operators cannot update `productions` directly.
- EXECUTE is revoked from PUBLIC, anon and authenticated. Triggers fire without needing
  EXECUTE for the calling role, so only the database can run it.
- No table, policy or grant changes.

## 3. Notes
- Imports already bump the counter per batch; this migration does not change that.
- The statements are idempotent (CREATE OR REPLACE, DROP TRIGGER IF EXISTS), so the
  migration is safe to re-run.
*/

CREATE OR REPLACE FUNCTION public.bump_production_data_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_produccion uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_produccion := OLD.produccion_id;
  ELSE
    target_produccion := NEW.produccion_id;
  END IF;

  UPDATE productions
  SET version_datos = version_datos + 1,
      updated_at = now()
  WHERE id = target_produccion;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_production_data_version() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reoperaciones_bump_data_version ON public.reoperaciones;
CREATE TRIGGER reoperaciones_bump_data_version
AFTER INSERT OR UPDATE OR DELETE ON public.reoperaciones
FOR EACH ROW EXECUTE FUNCTION public.bump_production_data_version();

DROP TRIGGER IF EXISTS recuperaciones_bump_data_version ON public.recuperaciones;
CREATE TRIGGER recuperaciones_bump_data_version
AFTER INSERT OR UPDATE OR DELETE ON public.recuperaciones
FOR EACH ROW EXECUTE FUNCTION public.bump_production_data_version();

/*
# Add reset_production_data function

1. Purpose
   Allows an admin to completely reset the operational data of a production:
   deletes reoperaciones, recuperaciones, historial_operaciones, box_completion,
   service_boxes, production_services, importaciones, and placas for the given
   production, then bumps the data version so all clients refresh.

2. Security
   - SECURITY DEFINER so it can delete from all tables in a single transaction
     regardless of the caller's per-table grants.
   - REVOKE EXECUTE from PUBLIC and anon; GRANT only to authenticated.
   - Checks current_user_role() = 'admin' inside the function body and raises
     if not, so even if grants leak the operation is still protected.
   - search_path set to public.

3. Important notes
   - This is a DESTRUCTIVE operation. It deletes ALL operational data for the
     production. The production row itself is preserved (status, code, etc).
   - The function bumps productions.version_datos so the DataSyncContext on
     every client detects the change and reloads.
*/

CREATE OR REPLACE FUNCTION public.reset_production_data(p_produccion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede reiniciar los datos de una producción.';
  END IF;

  -- Delete child tables that reference placas via placa_id
  DELETE FROM reoperaciones WHERE produccion_id = p_produccion_id;
  DELETE FROM recuperaciones WHERE produccion_id = p_produccion_id;
  DELETE FROM historial_operaciones WHERE produccion_id = p_produccion_id;

  -- Delete box-level data
  DELETE FROM box_completion WHERE produccion_id = p_produccion_id;
  DELETE FROM service_boxes WHERE produccion_id = p_produccion_id;
  DELETE FROM production_services WHERE produccion_id = p_produccion_id;

  -- Delete import logs
  DELETE FROM importaciones WHERE produccion_id = p_produccion_id;

  -- Delete placas
  DELETE FROM placas WHERE produccion_id = p_produccion_id;

  -- Bump version so all clients reload
  UPDATE productions SET version_datos = version_datos + 1 WHERE id = p_produccion_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_production_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_production_data(uuid) TO authenticated;

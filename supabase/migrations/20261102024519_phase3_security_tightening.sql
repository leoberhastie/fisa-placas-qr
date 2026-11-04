-- =========================================================
-- PHASE 3: Security tightening
-- =========================================================

-- 1) Protect historial_operaciones against physical DELETE
--    The historial is an immutable audit log: only SELECT and INSERT allowed.
--    Revoke DELETE and UPDATE from both anon and authenticated.
REVOKE DELETE, UPDATE ON historial_operaciones FROM anon, authenticated;
GRANT SELECT, INSERT ON historial_operaciones TO authenticated;

-- 2) Tighten reoperaciones UPDATE policy
--    Currently USING(true) means any authenticated user can update any reoperation.
--    Replace with: only admin and operador can update (for cierre manual and recovery).
DROP POLICY IF EXISTS "update_reoperaciones" ON reoperaciones;
CREATE POLICY "update_reoperaciones" ON reoperaciones FOR UPDATE
  TO authenticated
  USING (current_user_role() IN ('admin', 'operador'))
  WITH CHECK (current_user_role() IN ('admin', 'operador'));

-- 3) Add unique constraint on placas to prevent duplicates
--    A placa is unique by (produccion_id, serie, posicion)
CREATE UNIQUE INDEX IF NOT EXISTS placas_produccion_serie_posicion_unique
  ON placas (produccion_id, serie, posicion);

-- 4) Protect recuperaciones against UPDATE (only INSERT + SELECT needed)
--    Recuperaciones are audit-like records that should not be modified after creation.
REVOKE UPDATE ON recuperaciones FROM anon, authenticated;
GRANT SELECT, INSERT ON recuperaciones TO authenticated;

-- 5) Remove excess privileges from anon role on operational tables
--    anon should have no access to production data (app requires authentication)
REVOKE ALL ON placas FROM anon;
REVOKE ALL ON reoperaciones FROM anon;
REVOKE ALL ON recuperaciones FROM anon;
REVOKE ALL ON historial_operaciones FROM anon;
REVOKE ALL ON importaciones FROM anon;
REVOKE ALL ON productions FROM anon;
REVOKE ALL ON profiles FROM anon;

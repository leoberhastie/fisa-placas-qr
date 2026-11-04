-- Grant UPDATE on reoperaciones to authenticated so operators can mark incidences as RECUPERADA (cierre manual).
-- The existing schema only granted SELECT, INSERT, DELETE. Cierre manual needs UPDATE to change estado.
GRANT UPDATE ON reoperaciones TO authenticated;

-- Allow UPDATE estado on reoperaciones by authenticated users
DROP POLICY IF EXISTS "update_reoperaciones" ON reoperaciones;
CREATE POLICY "update_reoperaciones" ON reoperaciones FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

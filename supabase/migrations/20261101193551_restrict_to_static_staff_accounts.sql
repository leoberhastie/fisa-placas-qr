/*
# Restrict access to the three static staff accounts

The app no longer allows self-registration. Access is limited to three fixed accounts: admin (Administrador), gerente (Gerente) and operador (Operador de Calidad).

1. Modified Functions
- `handle_new_auth_user()`: a profile is created only when the new auth user's email is one of the three fixed staff emails. The role is assigned from that fixed list, never from client input. Any other sign-up gets no profile.

2. Modified Policies
- productions `select_productions`: now requires the caller to have a profile. An account without a profile cannot read production data.

3. Important notes
- No existing data is removed. The database had no accounts before this change.
- The account passwords are not stored in this migration. The accounts themselves are created separately.
- All statements are idempotent and safe to re-run.
*/

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  SELECT NEW.id, NEW.email, staff.full_name, staff.role
  FROM (VALUES
    ('admin@reoperaciones.app', 'Administrador', 'admin'),
    ('gerente@reoperaciones.app', 'Gerente', 'gerente'),
    ('operador@reoperaciones.app', 'Operador de Calidad', 'operador')
  ) AS staff(email, full_name, role)
  WHERE staff.email = NEW.email
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "select_productions" ON productions;
CREATE POLICY "select_productions" ON productions FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()));

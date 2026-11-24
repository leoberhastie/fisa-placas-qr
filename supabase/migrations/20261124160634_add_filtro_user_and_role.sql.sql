/*
# Crear usuario 'filtro' y actualizar constraint de roles

## Cambios

1. Actualiza el CHECK constraint `profiles_role_check` para incluir el rol 'filtro'.
2. Actualiza la función `handle_new_auth_user()` para incluir el email `filtro@reoperaciones.app`.
3. Crea el usuario de autenticación `filtro@reoperaciones.app` con contraseña `Placas.123`.
4. Garantiza que el perfil exista para el usuario filtro.

## Notas de seguridad
- La restricción de acceso a /lector-qr para el rol 'filtro' se aplica en el router de la aplicación.
- El rol 'filtro' hereda los privilegios de operador excepto el acceso a Lector QR.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. Actualizar CHECK constraint para incluir 'filtro'
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'operador'::text, 'gerente'::text, 'filtro'::text]));

-- ============================================================
-- 2. Actualizar handle_new_auth_user para incluir 'filtro'
-- ============================================================
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
    ('operador@reoperaciones.app', 'Operador de Calidad', 'operador'),
    ('filtro@reoperaciones.app', 'Filtro', 'filtro')
  ) AS staff(email, full_name, role)
  WHERE staff.email = NEW.email
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Crear el usuario filtro@reoperaciones.app
-- ============================================================
DO $$
DECLARE
  v_user_id uuid;
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM auth.users WHERE email = 'filtro@reoperaciones.app';
  IF v_existing IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (v_existing, 'filtro@reoperaciones.app', 'Filtro', 'filtro')
    ON CONFLICT (id) DO NOTHING;
    RETURN;
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    email_change_confirm_status,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    deleted_at,
    banned_until
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'filtro@reoperaciones.app',
    crypt('Placas.123', gen_salt('bf')),
    now(),
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    0,
    '{}'::jsonb,
    '{}'::jsonb,
    false,
    NULL,
    NULL
  );

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (v_user_id, 'filtro@reoperaciones.app', 'Filtro', 'filtro')
  ON CONFLICT (id) DO NOTHING;
END $$;

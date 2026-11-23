/*
# Módulo de Completado QR + Módulo de Auditoría

## Cambios

1. Nueva tabla: `placa_completados`
   - Registra placas marcadas como completadas vía escaneo QR.
   - Campos: id, produccion_id, placa_id, fecha_completado, operador, usuario, servicio, numero_caja, serie, posicion.
   - Unique (produccion_id, placa_id) — una placa solo puede completarse una vez.
   - RLS habilitada, CRUD a authenticated.

2. Nueva tabla: `auditoria_comparaciones`
   - Guarda historial de comparaciones entre archivo Excel y base de datos.
   - Campos: id, produccion_id, usuario, fecha, nombre_archivo, resumen (jsonb), detalles (jsonb).
   - RLS habilitada, CRUD a authenticated.

3. Función RPC `marcar_placa_completada(p_produccion_id, p_placa_id, p_operador, p_usuario)`
   - Marca una placa como completada. Si ya estaba completada, retorna info + fecha existente.
   - Después de marcar, verifica si todas las placas de la caja están completadas.
   - Si todas están completadas, marca la caja como completada automáticamente via box_completion.
   - Retorna jsonb con: placa ya_completada, fecha_completado, caja_completada_automatico, caja_info.

4. Función RPC `contar_placas_completadas_caja(p_produccion_id, p_servicio, p_numero_caja)`
   - Retorna total_placas, placas_completadas, todas_completadas.

5. Función RPC `obtener_avance_produccion(p_produccion_id)`
   - Retorna métricas de avance: total placas, completadas, pendientes, porcentaje.
   - Desglose por servicio y por caja.

6. Función RPC `obtener_avance_caja(p_produccion_id, p_servicio, p_numero_caja)`
   - Retorna placas de una caja con su estado de completado individual.

7. Permisos: GRANT EXECUTE en RPCs a authenticated. RLS + policies en tablas nuevas.
*/

-- ============================================================
-- 1. Tabla placa_completados
-- ============================================================
CREATE TABLE IF NOT EXISTS placa_completados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  placa_id uuid NOT NULL REFERENCES placas(id) ON DELETE CASCADE,
  fecha_completado timestamptz NOT NULL DEFAULT now(),
  operador text NOT NULL DEFAULT '',
  usuario text NOT NULL DEFAULT '',
  servicio text NOT NULL DEFAULT '',
  numero_caja text NOT NULL DEFAULT '',
  serie text NOT NULL DEFAULT '',
  posicion text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_placa_completados_prod_placa
  ON placa_completados (produccion_id, placa_id);

CREATE INDEX IF NOT EXISTS idx_placa_completados_produccion
  ON placa_completados (produccion_id);

CREATE INDEX IF NOT EXISTS idx_placa_completados_caja
  ON placa_completados (produccion_id, servicio, numero_caja);

ALTER TABLE placa_completados ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON placa_completados TO authenticated;

DROP POLICY IF EXISTS "select_placa_completados" ON placa_completados;
CREATE POLICY "select_placa_completados"
ON placa_completados FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_placa_completados" ON placa_completados;
CREATE POLICY "insert_placa_completados"
ON placa_completados FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_placa_completados" ON placa_completados;
CREATE POLICY "delete_placa_completados"
ON placa_completados FOR DELETE
TO authenticated USING (true);

-- ============================================================
-- 2. Tabla auditoria_comparaciones
-- ============================================================
CREATE TABLE IF NOT EXISTS auditoria_comparaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produccion_id uuid NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  usuario text NOT NULL DEFAULT '',
  fecha timestamptz NOT NULL DEFAULT now(),
  nombre_archivo text NOT NULL DEFAULT '',
  resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  detalles jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_produccion
  ON auditoria_comparaciones (produccion_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha
  ON auditoria_comparaciones (fecha DESC);

ALTER TABLE auditoria_comparaciones ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON auditoria_comparaciones TO authenticated;

DROP POLICY IF EXISTS "select_auditoria" ON auditoria_comparaciones;
CREATE POLICY "select_auditoria"
ON auditoria_comparaciones FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_auditoria" ON auditoria_comparaciones;
CREATE POLICY "insert_auditoria"
ON auditoria_comparaciones FOR INSERT
TO authenticated WITH CHECK (true);

-- ============================================================
-- 3. Función marcar_placa_completada
-- ============================================================
CREATE OR REPLACE FUNCTION marcar_placa_completada(
  p_produccion_id uuid,
  p_placa_id uuid,
  p_operador text,
  p_usuario text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placa RECORD;
  v_existente RECORD;
  v_total_placas int;
  v_completadas int;
  v_caja_completada boolean := false;
  v_result jsonb;
BEGIN
  -- Obtener datos de la placa
  SELECT serie, posicion, servicio, numero_caja INTO v_placa
  FROM placas
  WHERE id = p_placa_id AND produccion_id = p_produccion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Placa no encontrada');
  END IF;

  -- Verificar si ya estaba completada
  SELECT id, fecha_completado INTO v_existente
  FROM placa_completados
  WHERE produccion_id = p_produccion_id AND placa_id = p_placa_id;

  IF FOUND THEN
    -- Ya completada, retornar info sin duplicar
    RETURN jsonb_build_object(
      'ya_completada', true,
      'fecha_completado', v_existente.fecha_completado,
      'serie', v_placa.serie,
      'posicion', v_placa.posicion,
      'servicio', v_placa.servicio,
      'numero_caja', v_placa.numero_caja
    );
  END IF;

  -- Insertar registro de completado
  INSERT INTO placa_completados (produccion_id, placa_id, operador, usuario, servicio, numero_caja, serie, posicion)
  VALUES (p_produccion_id, p_placa_id, p_operador, p_usuario, v_placa.servicio, v_placa.numero_caja, v_placa.serie, v_placa.posicion);

  -- Registrar en historial
  INSERT INTO historial_operaciones (produccion_id, placa_id, tipo_operacion, proceso, operador, usuario, estado_anterior, estado_nuevo, observaciones)
  VALUES (p_produccion_id, p_placa_id, 'cambio_estado', '', p_operador, p_usuario, '', 'completado', 'Placa marcada como completada via QR');

  -- Verificar si todas las placas de la caja están completadas
  SELECT count(*) INTO v_total_placas
  FROM placas
  WHERE produccion_id = p_produccion_id
    AND servicio = v_placa.servicio
    AND numero_caja = v_placa.numero_caja
    AND activo = true;

  SELECT count(*) INTO v_completadas
  FROM placa_completados pc
  JOIN placas p ON p.id = pc.placa_id
  WHERE pc.produccion_id = p_produccion_id
    AND p.servicio = v_placa.servicio
    AND p.numero_caja = v_placa.numero_caja
    AND p.activo = true;

  IF v_completadas >= v_total_placas AND v_total_placas > 0 THEN
    -- Marcar caja como completada automáticamente
    INSERT INTO box_completion (produccion_id, servicio, numero_caja, completada_manual, completada_at, completada_by)
    VALUES (p_produccion_id, v_placa.servicio, v_placa.numero_caja, true, now(), NULL)
    ON CONFLICT (produccion_id, servicio, numero_caja)
    DO UPDATE SET completada_manual = true, completada_at = now(), updated_at = now();

    -- Log en historial
    INSERT INTO historial_operaciones (produccion_id, placa_id, tipo_operacion, proceso, operador, usuario, estado_anterior, estado_nuevo, observaciones)
    VALUES (p_produccion_id, NULL, 'cambio_estado', '', p_operador, p_usuario, 'en_proceso', 'completada', 'Caja completada automaticamente al escanear todas las placas');

    v_caja_completada := true;
  END IF;

  -- Bump version
  UPDATE productions SET version_datos = version_datos + 1 WHERE id = p_produccion_id;

  RETURN jsonb_build_object(
    'ya_completada', false,
    'fecha_completado', now(),
    'serie', v_placa.serie,
    'posicion', v_placa.posicion,
    'servicio', v_placa.servicio,
    'numero_caja', v_placa.numero_caja,
    'caja_completada_automatico', v_caja_completada,
    'total_placas_caja', v_total_placas,
    'completadas_caja', v_completadas
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION marcar_placa_completada(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION marcar_placa_completada(uuid, uuid, text, text) TO authenticated;

-- ============================================================
-- 4. Función contar_placas_completadas_caja
-- ============================================================
CREATE OR REPLACE FUNCTION contar_placas_completadas_caja(
  p_produccion_id uuid,
  p_servicio text,
  p_numero_caja text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_completadas int;
BEGIN
  SELECT count(*) INTO v_total
  FROM placas
  WHERE produccion_id = p_produccion_id
    AND servicio = p_servicio
    AND numero_caja = p_numero_caja
    AND activo = true;

  SELECT count(*) INTO v_completadas
  FROM placa_completados pc
  JOIN placas p ON p.id = pc.placa_id
  WHERE pc.produccion_id = p_produccion_id
    AND p.servicio = p_servicio
    AND p.numero_caja = p_numero_caja
    AND p.activo = true;

  RETURN jsonb_build_object(
    'total_placas', v_total,
    'placas_completadas', v_completadas,
    'todas_completadas', v_total > 0 AND v_completadas >= v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION contar_placas_completadas_caja(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION contar_placas_completadas_caja(uuid, text, text) TO authenticated;

-- ============================================================
-- 5. Función obtener_avance_produccion
-- ============================================================
CREATE OR REPLACE FUNCTION obtener_avance_produccion(
  p_produccion_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_completadas int;
  v_porcentaje numeric;
  v_servicios jsonb;
  v_cajas jsonb;
BEGIN
  SELECT count(*) INTO v_total
  FROM placas
  WHERE produccion_id = p_produccion_id AND activo = true;

  SELECT count(*) INTO v_completadas
  FROM placa_completados
  WHERE produccion_id = p_produccion_id;

  v_porcentaje := CASE WHEN v_total > 0 THEN round((v_completadas::numeric / v_total) * 100, 2) ELSE 0 END;

  -- Desglose por servicio
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'servicio', svc.servicio,
    'total_placas', svc.total,
    'completadas', COALESCE(comp.completadas, 0),
    'pendientes', svc.total - COALESCE(comp.completadas, 0),
    'porcentaje', CASE WHEN svc.total > 0 THEN round((COALESCE(comp.completadas, 0)::numeric / svc.total) * 100, 2) ELSE 0 END
  ) ORDER BY svc.servicio), '[]'::jsonb) INTO v_servicios
  FROM (
    SELECT servicio, count(*) as total
    FROM placas
    WHERE produccion_id = p_produccion_id AND activo = true
    GROUP BY servicio
  ) svc
  LEFT JOIN (
    SELECT p.servicio, count(*) as completadas
    FROM placa_completados pc
    JOIN placas p ON p.id = pc.placa_id
    WHERE pc.produccion_id = p_produccion_id AND p.activo = true
    GROUP BY p.servicio
  ) comp ON comp.servicio = svc.servicio;

  -- Desglose por caja
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'servicio', caja.servicio,
    'numero_caja', caja.numero_caja,
    'total_placas', caja.total,
    'completadas', COALESCE(comp.completadas, 0),
    'todas_completadas', caja.total > 0 AND COALESCE(comp.completadas, 0) >= caja.total
  ) ORDER BY caja.servicio, caja.numero_caja), '[]'::jsonb) INTO v_cajas
  FROM (
    SELECT servicio, numero_caja, count(*) as total
    FROM placas
    WHERE produccion_id = p_produccion_id AND activo = true
    GROUP BY servicio, numero_caja
  ) caja
  LEFT JOIN (
    SELECT p.servicio, p.numero_caja, count(*) as completadas
    FROM placa_completados pc
    JOIN placas p ON p.id = pc.placa_id
    WHERE pc.produccion_id = p_produccion_id AND p.activo = true
    GROUP BY p.servicio, p.numero_caja
  ) comp ON comp.servicio = caja.servicio AND comp.numero_caja = caja.numero_caja;

  RETURN jsonb_build_object(
    'total_placas', v_total,
    'placas_completadas', v_completadas,
    'placas_pendientes', v_total - v_completadas,
    'porcentaje_completado', v_porcentaje,
    'servicios', v_servicios,
    'cajas', v_cajas
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION obtener_avance_produccion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION obtener_avance_produccion(uuid) TO authenticated;

-- ============================================================
-- 6. Función obtener_avance_caja
-- ============================================================
CREATE OR REPLACE FUNCTION obtener_avance_caja(
  p_produccion_id uuid,
  p_servicio text,
  p_numero_caja text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placas jsonb;
  v_total int;
  v_completadas int;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'placa_id', p.id,
    'serie', p.serie,
    'posicion', p.posicion,
    'consecutivo', p.consecutivo,
    'completada', COALESCE(pc.fecha_completado IS NOT NULL, false),
    'fecha_completado', pc.fecha_completado
  ) ORDER BY p.consecutivo), '[]'::jsonb) INTO v_placas
  FROM placas p
  LEFT JOIN placa_completados pc ON pc.placa_id = p.id AND pc.produccion_id = p_produccion_id
  WHERE p.produccion_id = p_produccion_id
    AND p.servicio = p_servicio
    AND p.numero_caja = p_numero_caja
    AND p.activo = true;

  SELECT count(*) INTO v_total
  FROM placas
  WHERE produccion_id = p_produccion_id
    AND servicio = p_servicio
    AND numero_caja = p_numero_caja
    AND activo = true;

  SELECT count(*) INTO v_completadas
  FROM placa_completados pc
  JOIN placas p ON p.id = pc.placa_id
  WHERE pc.produccion_id = p_produccion_id
    AND p.servicio = p_servicio
    AND p.numero_caja = p_numero_caja
    AND p.activo = true;

  RETURN jsonb_build_object(
    'total_placas', v_total,
    'placas_completadas', v_completadas,
    'todas_completadas', v_total > 0 AND v_completadas >= v_total,
    'placas', v_placas
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION obtener_avance_caja(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION obtener_avance_caja(uuid, text, text) TO authenticated;

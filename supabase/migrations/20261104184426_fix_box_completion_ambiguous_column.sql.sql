CREATE OR REPLACE FUNCTION public.mark_box_completed(p_produccion_id uuid, p_servicio text, p_numero_caja text)
 RETURNS TABLE(estado text, completada_manual boolean, completada_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_box_exists boolean;
v_pendientes int;
v_reops int;
v_current_manual boolean;
v_estado_anterior text;
v_estado_nuevo text;
v_usuario text;
v_uid uuid := auth.uid();
BEGIN
IF v_uid IS NULL THEN
RAISE EXCEPTION 'Debe iniciar sesión para marcar una caja.';
END IF;

SELECT EXISTS (
SELECT 1 FROM service_boxes sb
WHERE sb.produccion_id = p_produccion_id
AND sb.servicio = p_servicio
AND sb.numero_caja = p_numero_caja
) INTO v_box_exists;
IF NOT v_box_exists THEN
RAISE EXCEPTION 'La caja % del servicio % no existe en esta producción.', p_numero_caja, p_servicio;
END IF;

SELECT count(*), count(*) FILTER (WHERE r.estado = 'pendiente')
INTO v_reops, v_pendientes
FROM reoperaciones r
JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
WHERE r.produccion_id = p_produccion_id
AND p.servicio = p_servicio
AND p.numero_caja = p_numero_caja;

IF v_pendientes > 0 THEN
RAISE EXCEPTION 'No se puede marcar como completada: la caja tiene % reoperacion(es) pendiente(s).', v_pendientes;
END IF;

SELECT bc.completada_manual INTO v_current_manual
FROM box_completion bc
WHERE bc.produccion_id = p_produccion_id
AND bc.servicio = p_servicio
AND bc.numero_caja = p_numero_caja;

v_estado_anterior := CASE
WHEN v_pendientes > 0 THEN 'con_reoperaciones'
WHEN v_reops > 0 THEN 'completada_ro'
WHEN COALESCE(v_current_manual, false) THEN 'completada'
ELSE 'en_proceso'
END;

INSERT INTO box_completion (produccion_id, servicio, numero_caja, completada_manual, completada_at, completada_by)
VALUES (p_produccion_id, p_servicio, p_numero_caja, true, now(), v_uid)
ON CONFLICT (produccion_id, servicio, numero_caja)
DO UPDATE SET
completada_manual = true,
completada_at = now(),
completada_by = EXCLUDED.completada_by,
updated_at = now();

v_estado_nuevo := CASE
WHEN v_pendientes > 0 THEN 'con_reoperaciones'
WHEN v_reops > 0 THEN 'completada_ro'
ELSE 'completada'
END;

SELECT pr.full_name INTO v_usuario FROM profiles pr WHERE pr.id = v_uid;
IF v_usuario IS NULL THEN v_usuario := ''; END IF;

INSERT INTO historial_operaciones (
produccion_id, placa_id, tipo_operacion, proceso,
operador, usuario, estado_anterior, estado_nuevo, observaciones
) VALUES (
p_produccion_id, NULL, 'cambio_estado', '',
'', v_usuario, v_estado_anterior, v_estado_nuevo,
format('Caja %s del servicio %s marcada como completada', p_numero_caja, p_servicio)
);

UPDATE productions
SET version_datos = version_datos + 1, updated_at = now()
WHERE id = p_produccion_id;

RETURN QUERY SELECT v_estado_nuevo, true, now()::timestamptz;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_box(p_produccion_id uuid, p_servicio text, p_numero_caja text)
 RETURNS TABLE(estado text, completada_manual boolean, completada_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_box_exists boolean;
v_pendientes int;
v_reops int;
v_current_manual boolean;
v_estado_anterior text;
v_estado_nuevo text;
v_usuario text;
v_uid uuid := auth.uid();
BEGIN
IF v_uid IS NULL THEN
RAISE EXCEPTION 'Debe iniciar sesión para reabrir una caja.';
END IF;

SELECT EXISTS (
SELECT 1 FROM service_boxes sb
WHERE sb.produccion_id = p_produccion_id
AND sb.servicio = p_servicio
AND sb.numero_caja = p_numero_caja
) INTO v_box_exists;
IF NOT v_box_exists THEN
RAISE EXCEPTION 'La caja % del servicio % no existe en esta producción.', p_numero_caja, p_servicio;
END IF;

SELECT bc.completada_manual INTO v_current_manual
FROM box_completion bc
WHERE bc.produccion_id = p_produccion_id
AND bc.servicio = p_servicio
AND bc.numero_caja = p_numero_caja;

IF NOT COALESCE(v_current_manual, false) THEN
RAISE EXCEPTION 'La caja no está marcada como completada manualmente.';
END IF;

SELECT count(*), count(*) FILTER (WHERE r.estado = 'pendiente')
INTO v_reops, v_pendientes
FROM reoperaciones r
JOIN placas p ON p.id = r.placa_id AND p.produccion_id = r.produccion_id
WHERE r.produccion_id = p_produccion_id
AND p.servicio = p_servicio
AND p.numero_caja = p_numero_caja;

v_estado_anterior := CASE
WHEN v_pendientes > 0 THEN 'con_reoperaciones'
WHEN v_reops > 0 THEN 'completada_ro'
ELSE 'completada'
END;

UPDATE box_completion bc
SET completada_manual = false,
completada_at = null,
completada_by = null,
updated_at = now()
WHERE bc.produccion_id = p_produccion_id
AND bc.servicio = p_servicio
AND bc.numero_caja = p_numero_caja;

v_estado_nuevo := CASE
WHEN v_pendientes > 0 THEN 'con_reoperaciones'
WHEN v_reops > 0 THEN 'completada_ro'
ELSE 'en_proceso'
END;

SELECT pr.full_name INTO v_usuario FROM profiles pr WHERE pr.id = v_uid;
IF v_usuario IS NULL THEN v_usuario := ''; END IF;

INSERT INTO historial_operaciones (
produccion_id, placa_id, tipo_operacion, proceso,
operador, usuario, estado_anterior, estado_nuevo, observaciones
) VALUES (
p_produccion_id, NULL, 'cambio_estado', '',
'', v_usuario, v_estado_anterior, v_estado_nuevo,
format('Caja %s del servicio %s reabierta', p_numero_caja, p_servicio)
);

UPDATE productions
SET version_datos = version_datos + 1, updated_at = now()
WHERE id = p_produccion_id;

RETURN QUERY SELECT v_estado_nuevo, false, NULL::timestamptz;
END;
$function$;

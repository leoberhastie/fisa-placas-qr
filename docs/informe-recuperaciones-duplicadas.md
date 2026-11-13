# Informe: Recuperaciones duplicadas en cierre de caja

## Fecha: 13 de noviembre 2026

## 1. Problema detectado

En tres producciones se observó que el número de recuperaciones superaba al de reoperaciones, lo cual es ilógico: para que exista una recuperación, primero debió existir una reoperación pendiente.

| Producción | Reoperaciones | Recuperaciones | Diferencia |
|---|---|---|---|
| PRIV_ANTIGUO (`29f63455...`) | 22 | 36 | +14 |
| PRIV AUTOMOVIL (`4a42808f...`) | 955 | 951 | -4 (normal) |
| Camiones Priv (`5a3f7578...`) | 2414 | 2394 | -20 (normal) |

Solo PRIV_ANTIGUO presentaba el problema: 14 recuperaciones duplicadas.

## 2. Análisis de la IA externa vs. realidad

La IA externa sugirió tres posibles causas:

1. **Recuperaciones manuales (`es_manual`)** no requieren reoperación → **Descartado**: el campo `es_manual` distingue el origen (QR vs manual), pero ambas rutas requieren una reoperación pendiente previa. No es un mecanismo para crear recuperaciones sin reoperación.

2. **Reoperaciones anuladas** desaparecen del conteo → **Descartado**: PRIV_ANTIGUO tenía 0 reoperaciones anuladas. Las otras dos producciones tenían 2 y 0 respectivamente, insuficiente para explicar la diferencia.

3. **`placa_id` nullable** deja registros huérfanos → **Descartado**: las tres producciones tenían 0 registros con `placa_id IS NULL` en ambas tablas.

## 3. Causa raíz real: duplicación por reintento

### Patrón encontrado

Las 14 placas afectadas en PRIV_ANTIGUO tenían exactamente:
- 1 reoperación (estado: completo)
- 2 recuperaciones (separadas por ~34 segundos)
- 1 entrada de historial de recuperación (solo la segunda)

### Ejemplo: placa NS-8-V TRASERA

| Tabla | Registro 1 | Registro 2 |
|---|---|---|
| recuperaciones | 12/11 17:18:14 (YOEL) | 12/11 17:18:48 (YOEL) |
| historial | (sin entrada) | 12/11 17:18:48 |
| reoperaciones | Blanking, 07/11 (completo) | — |

### Mecanismo del bug

En `BoxClosePanel.tsx`, la función `handleConfirmRecovery` ejecutaba dos operaciones secuenciales:

1. `createRecuperacionesBatch(recupInputs)` — inserta en `recuperaciones`
2. `insertHistorialBatch(histInputs)` — inserta en `historial_operaciones`

Si el paso 1 tenía éxito pero el paso 2 fallaba:
- La recuperación quedaba guardada en la base de datos
- El trigger `resolve_prior_reoperations_after_recovery` marcaba la reoperación como `completo`
- La UI mostraba un error y **mantenía el panel abierto con las mismas placas seleccionadas**
- El operador veía el error y presionaba "Recuperar" de nuevo (34 segundos después)
- Se insertaba una segunda recuperación para las mismas placas
- Esta vez el historial sí se registraba, pero el primer registro quedaba huérfano (sin historial)

### Por qué el duplicado no tenía entrada de historial

El primer intento insertó la recuperación (paso 1 exitoso) pero falló el historial (paso 2). El segundo intento insertó tanto la recuperación como el historial. Por eso solo el segundo registro tiene entrada en `historial_operaciones`.

## 4. Corrección de datos

### Migración aplicada

Se ejecutó la migración `delete_duplicate_recuperaciones_priv_antiguo.sql` que:

1. Identificó las 14 placas con más recuperaciones que reoperaciones
2. Para cada placa, identificó el registro de recuperación que **no tenía entrada correspondiente en el historial**
3. Eliminó solo esos 14 registros duplicados (el primer registro de cada par)

### Consulta de identificación de duplicados

```sql
WITH placas_duplicadas AS (
  SELECT pl.id AS placa_id
  FROM placas pl
  WHERE pl.produccion_id = '29f63455-903c-49b0-b730-83bb1f01d71a'
    AND (SELECT COUNT(*) FROM recuperaciones rc WHERE rc.placa_id = pl.id)
      > (SELECT COUNT(*) FROM reoperaciones r WHERE r.placa_id = pl.id)
),
duplicados_a_eliminar AS (
  SELECT rc.id
  FROM recuperaciones rc
  WHERE rc.placa_id IN (SELECT placa_id FROM placas_duplicadas)
    AND NOT EXISTS (
      SELECT 1 FROM historial_operaciones h
      WHERE h.placa_id = rc.placa_id
        AND h.tipo_operacion = 'recuperacion'
        AND h.fecha_hora >= rc.fecha_hora - interval '2 seconds'
        AND h.fecha_hora <= rc.fecha_hora + interval '2 seconds'
    )
)
DELETE FROM recuperaciones
WHERE id IN (SELECT id FROM duplicados_a_eliminar);
```

### Resultado verificado

| Producción | Reoperaciones | Recuperaciones | Estado |
|---|---|---|---|
| PRIV_ANTIGUO | 22 | 22 | Corregido |
| PRIV AUTOMOVIL | 955 | 951 | Sin cambios (normal) |
| Camiones Priv | 2414 | 2394 | Sin cambios (normal) |

Todas las placas de PRIV_ANTIGUO ahora tienen 1 reoperación, 1 recuperación y 1 entrada de historial. Las reoperaciones anuladas (2 en Camiones Priv) explican la diferencia de 20 en esa producción, y es comportamiento esperado.

## 5. Corrección de código (prevención)

### Archivo: `src/components/qr/BoxClosePanel.tsx`

Se aplicaron tres cambios en `handleConfirmRecovery`:

#### 5.1 Guard de re-entrada con `useRef`

```typescript
const recoverySubmitRef = useRef(false);
// ...
if (!recoveryBox || recoverySelected.size === 0 || recoverySubmitRef.current) return;
recoverySubmitRef.current = true;
```

Impide que el usuario presione "Recuperar" dos veces mientras la primera operación está en curso.

#### 5.2 Limpieza inmediata de selección tras insertar recuperaciones

```typescript
await createRecuperacionesBatch(recupInputs);
recupDone = true;
setRecoverySelected(new Set());  // ← limpiar antes del historial
await insertHistorialBatch(histInputs);
```

Si el historial falla después de que las recuperaciones se insertaron, la selección ya está vacía. El usuario no puede reintentar con las mismas placas.

#### 5.3 Manejo de error parcial

```typescript
} catch (err) {
  if (recupDone) {
    // Las recuperaciones se insertaron pero el historial falló
    setRecoveryError('Las recuperaciones se registraron pero el historial tuvo un error...');
    setConfirmRecovery(false);
    setRecoveryBox(null);
    setRecoveryPlacas([]);
    void refreshBoxes();
    void onCompleted();
  } else {
    // Las recuperaciones no se insertaron — el usuario puede reintentar
    setRecoveryError(err instanceof Error ? err.message : 'No se pudieron recuperar...');
    setConfirmRecovery(false);
  }
}
```

Si las recuperaciones se insertaron pero el historial falló, se cierra el panel y se informa al usuario que los datos ya están guardados. No se permite reintentar.

Si las recuperaciones no se insertaron (error de red, permisos, etc.), el usuario puede reintentar legítimamente.

## 6. Migraciones aplicadas

| Migración | Propósito |
|---|---|
| `20261113141451_delete_duplicate_recuperaciones_priv_antiguo.sql` | Eliminar 14 recuperaciones duplicadas |

## 7. Conclusión

El problema fue causado por un manejo incorrecto de errores parciales en el flujo de recuperación desde el cierre de caja. Cuando la inserción de recuperaciones tenía éxito pero la del historial fallaba, el operador podía reintentar, creando duplicados. La corrección de código previene esto con tres mecanismos: guard de re-entrada, limpieza inmediata de selección, y manejo diferenciado de error parcial vs. error total.

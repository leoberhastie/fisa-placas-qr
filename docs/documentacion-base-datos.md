# Documentación de Base de Datos — Sistema de Producción de Placas

## 1. Visión general

El sistema gestiona la producción de placas (placas vehiculares) a través de procesos industriales. Cada producción agrupa placas que pasan por servicios y cajas, registrando reoperaciones, recuperaciones y un historial completo de operaciones.

La base de datos corre en Supabase (PostgreSQL) con Row Level Security (RLS) activado en todas las tablas.

---

## 2. Tablas y sus relaciones

### Diagrama de relaciones

```
auth.users (Supabase Auth)
  │
  ├──→ profiles (1:1)
  │
  └──→ productions.created_by (1:N)
         │
         ├──→ placas (1:N)
         │      │
         │      ├──→ reoperaciones (1:N)
         │      ├──→ recuperaciones (1:N)
         │      ├──→ historial_operaciones (1:N)
         │      └──→ reoperaciones_anuladas (1:N)
         │
         ├──→ importaciones (1:N)
         ├──→ production_services (1:N)
         ├──→ service_boxes (1:N)
         ├──→ box_completion (1:N)
         └──→ reinicios_produccion (1:N)
```

---

### 2.1 `profiles`

**Propósito:** Información extendida de cada usuario (nombre, rol).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Referencia a `auth.users.id` |
| `email` | text | Correo del usuario |
| `full_name` | text | Nombre completo |
| `role` | text | Rol: `admin`, `operador`, o `gerente` |
| `created_at` | timestamptz | Fecha de creación |

**Relación:** 1:1 con `auth.users` (Supabase Auth).

---

### 2.2 `productions`

**Propósito:** Cada producción es un lote de placas con un nombre único.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `code` | text (unique) | Código de la producción |
| `name` | text | Nombre en formato `CONSECUTIVO-ESTADO-AÑO` |
| `description` | text | Descripción opcional |
| `status` | text | `activa`, `finalizada`, o `archivada` |
| `created_by` | uuid | FK → `auth.users.id` |
| `consecutivo` | int | Número consecutivo |
| `estado` | text | Estado (ej. "Nuevo Leon") |
| `anio` | int | Año de la producción |
| `fecha_ultima_importacion` | timestamptz | Última importación de Excel |
| `version_datos` | int | Versión de datos (incrementa con cada operación) |

**Relación:** 1:N con `placas`, `reoperaciones`, `recuperaciones`, `historial_operaciones`, `importaciones`, `production_services`, `service_boxes`, `box_completion`, `reinicios_produccion`, `reoperaciones_anuladas`.

**Regla de unicidad:** La combinación `(produccion_id, serie, posicion)` en `placas` debe ser única — una serie puede tener una placa FRONTAL y una TRASERA, pero no duplicados.

---

### 2.3 `placas`

**Propósito:** Registro individual de cada placa producida.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `produccion_id` | uuid (FK) | → `productions.id` |
| `consecutivo` | int | Número consecutivo dentro de la producción |
| `serie` | text | Serie de la placa (ej. `D-60699`) |
| `posicion` | text | `FRONTAL` o `TRASERA` |
| `servicio` | text | Nombre del servicio (ej. "Convertidor Dolly") |
| `numero_caja` | text | Número de caja asignada (ej. "01") |
| `fecha_importacion` | timestamptz | Fecha en que se importó |
| `activo` | boolean | Si la placa está activa |
| `created_at` | timestamptz | Fecha de creación |

**Relación:**
- N:1 con `productions`
- 1:N con `reoperaciones`, `recuperaciones`, `historial_operaciones`, `reoperaciones_anuladas`

**Cómo se guardan los registros:** Las placas se crean mediante importación de archivos Excel. Cada fila del Excel genera una placa con su serie, posición (FRONTAL/TRASERA), servicio y número de caja. El tipo de servicio (`JGS` o `PZ`) determina si una placa tiene ambas posiciones (JGS = 2 placas por serie) o solo TRASERA (PZ = 1 placa por serie).

---

### 2.4 `reoperaciones`

**Propósito:** Registra cuando una placa necesita reprocesarse en algún paso (Impresion, Sticker, Brotech, Blanking, Embossing).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `produccion_id` | uuid (FK) | → `productions.id` |
| `placa_id` | uuid (FK, nullable) | → `placas.id` |
| `proceso` | text | Proceso: `Impresion`, `Sticker`, `Brotech`, `Blanking`, `Embossing` |
| `fecha_hora` | timestamptz | Fecha y hora de la reoperación |
| `operador` | text | Nombre del operador |
| `usuario` | text | Email del usuario que registró |
| `estado` | text | `pendiente`, `completo`, `atencion`, `sin_incidencias` |
| `observaciones` | text | Notas del operador |
| `created_at` | timestamptz | Fecha de creación |

**Relación:** N:1 con `productions` y `placas`.

**Cómo se guardan:** Cuando un operador escanea una placa en el Lector QR y marca una reoperación, se inserta un registro aquí con el proceso correspondiente. El estado inicia como `pendiente` y cambia a `completo` cuando se resuelve.

---

### 2.5 `recuperaciones`

**Propósito:** Registra cuando una placa se recupera (se corrige un defecto sin reoperación completa).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `produccion_id` | uuid (FK) | → `productions.id` |
| `placa_id` | uuid (FK, nullable) | → `placas.id` |
| `fecha_hora` | timestamptz | Fecha y hora |
| `operador` | text | Nombre del operador |
| `usuario` | text | Email del usuario |
| `tipo_recuperacion` | text | Tipo de recuperación |
| `observaciones` | text | Notas |
| `es_manual` | boolean | Si se registró manualmente (no por QR) |
| `created_at` | timestamptz | Fecha de creación |

**Relación:** N:1 con `productions` y `placas`.

**Cómo se guardan:** Se insertan cuando un operador marca una placa como recuperada desde el Lector QR o desde el registro manual. El campo `es_manual` distingue si provino de un escaneo QR o de un registro manual.

---

### 2.6 `historial_operaciones`

**Propósito:** Bitácora completa de todas las operaciones que afectan a una placa.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `produccion_id` | uuid (FK) | → `productions.id` |
| `placa_id` | uuid (FK, nullable) | → `placas.id` |
| `tipo_operacion` | text | `reoperacion`, `recuperacion`, `importacion`, `cambio_estado`, `edicion_placa`, `anulacion_reoperacion` |
| `proceso` | text | Proceso relacionado (si aplica) |
| `fecha_hora` | timestamptz | Fecha y hora |
| `operador` | text | Nombre del operador |
| `usuario` | text | Email del usuario |
| `estado_anterior` | text | Estado antes de la operación |
| `estado_nuevo` | text | Estado después de la operación |
| `observaciones` | text | Notas |
| `created_at` | timestamptz | Fecha de creación |

**Relación:** N:1 con `productions` y `placas`.

**Cómo se guardan:** Cada vez que ocurre una reoperación, recuperación, importación, cambio de estado, edición o anulación, se inserta un registro aquí. Es una tabla de auditoría — una placa puede tener múltiples registros que cuentan su historia completa.

---

### 2.7 `importaciones`

**Propósito:** Registro de cada importación de archivos Excel.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `produccion_id` | uuid (FK) | → `productions.id` |
| `nombre_archivo` | text | Nombre del archivo importado |
| `fecha_importacion` | timestamptz | Fecha de importación |
| `usuario` | text | Email del usuario |
| `cantidad_registros` | int | Total de filas procesadas |
| `cantidad_nuevos` | int | Placas nuevas creadas |
| `cantidad_actualizados` | int | Placas actualizadas |
| `cantidad_errores` | int | Filas con error |
| `estado_importacion` | text | `pendiente`, `completada`, `con_errores`, `fallida` |
| `version_datos` | int | Versión de datos al momento de importar |
| `created_at` | timestamptz | Fecha de creación |

**Relación:** N:1 con `productions`.

---

### 2.8 `production_services`

**Propósito:** Define los servicios disponibles para cada producción.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `produccion_id` | uuid (FK) | → `productions.id` |
| `nombre` | text | Nombre del servicio |
| `tipo_servicio` | text | `JGS` (frontal + trasera) o `PZ` (solo trasera) |
| `activo` | boolean | Si el servicio está activo |
| `created_by` | uuid | → `auth.users.id` |
| `created_at` | timestamptz | Fecha de creación |
| `updated_at` | timestamptz | Última actualización |

**Relación:** N:1 con `productions` y `auth.users`.

---

### 2.9 `service_boxes`

**Propósito:** Cajas de placas agrupadas por servicio.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `produccion_id` | uuid (FK) | → `productions.id` |
| `servicio` | text | Nombre del servicio |
| `numero_caja` | text | Número de caja |
| `tipo_servicio` | text | `JGS` o `PZ` |
| `consecutivo_inicial` | int | Consecutivo de la primera placa |
| `consecutivo_final` | int | Consecutivo de la última placa |
| `cantidad_series` | int | Número de series en la caja |
| `cantidad_placas` | int | Número total de placas |
| `nombre_archivo` | text | Archivo de origen |
| `serie_inicial` | text | Serie de la primera placa |
| `serie_final` | text | Serie de la última placa |
| `parcialidad` | int | Número de parcialidad (si es parcial) |
| `es_parcial` | boolean | Si la caja es parcial |
| `created_by` | uuid | → `auth.users.id` |
| `created_at` | timestamptz | Fecha de creación |

**Relación:** N:1 con `productions` y `auth.users`.

**Cómo se guardan:** Al importar un archivo de cajas, se crea un registro aquí por cada caja. El sistema calcula `cantidad_placas` según el `tipo_servicio`: JGS = `cantidad_series × 2` (FRONTAL + TRASERA), PZ = `cantidad_series × 1` (solo TRASERA).

---

### 2.10 `box_completion`

**Propósito:** Registra cuando una caja se marca como completada.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `produccion_id` | uuid (FK) | → `productions.id` |
| `servicio` | text | Nombre del servicio |
| `numero_caja` | text | Número de caja |
| `completada_manual` | boolean | Si se completó manualmente |
| `completada_at` | timestamptz | Fecha de completado |
| `completada_by` | uuid (FK, nullable) | → `auth.users.id` |
| `created_at` | timestamptz | Fecha de creación |
| `updated_at` | timestamptz | Última actualización |

**Relación:** N:1 con `productions` y `auth.users`.

---

### 2.11 `reinicios_produccion`

**Propósito:** Auditoría de reinicios de datos de una producción.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `produccion_id` | uuid (FK) | → `productions.id` |
| `modo` | text | `total` o `movimientos` |
| `estado` | text | `en_curso` o `completado` |
| `usuario_id` | uuid (FK, nullable) | → `auth.users.id` |
| `usuario_email` | text | Email del usuario |
| `resumen` | jsonb | Resumen de lo eliminado |
| `iniciado_at` | timestamptz | Fecha de inicio |
| `completado_at` | timestamptz | Fecha de completado |

**Relación:** N:1 con `productions` y `auth.users`.

---

### 2.12 `reoperaciones_anuladas`

**Propósito:** Registro de reoperaciones que se anulan (se cancelan/dejan sin efecto).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid (PK) | Identificador único |
| `reoperacion_id` | uuid | Referencia a la reoperación original |
| `produccion_id` | uuid (FK) | → `productions.id` |
| `placa_id` | uuid (FK, nullable) | → `placas.id` |
| `proceso` | text | Proceso de la reoperación |
| `fecha_hora` | timestamptz | Fecha original de la reoperación |
| `operador` | text | Operador original |
| `usuario` | text | Usuario original |
| `estado` | text | Estado original |
| `observaciones` | text | Observaciones originales |
| `motivo_anulacion` | text | Motivo de la anulación |
| `anulada_por` | text | Quién anuló |
| `anulada_at` | timestamptz | Fecha de anulación |

**Relación:** N:1 con `productions` y `placas`.

---

## 3. Flujo de datos: cómo se relacionan los registros

### 3.1 Importación inicial

1. Se crea una `productions` con nombre `CONSECUTIVO-ESTADO-AÑO`.
2. Se importan placas desde Excel → se crean registros en `placas` y `importaciones`.
3. Si el archivo define cajas → se crean registros en `service_boxes`.
4. Se crean servicios en `production_services` si es una importación maestra.

### 3.2 Operación diaria (Lector QR)

1. El operador escanea una placa → se busca en `placas` por `serie` + `produccion_id`.
2. Si marca reoperación → se inserta en `reoperaciones` y `historial_operaciones` (tipo = `reoperacion`).
3. Si marca recuperación → se inserta en `recuperaciones` y `historial_operaciones` (tipo = `recuperacion`).
4. Si anula una reoperación → se mueve a `reoperaciones_anuladas` y se registra en `historial_operaciones` (tipo = `anulacion_reoperacion`).

### 3.3 Cierre de caja

1. Cuando todas las placas de una caja tienen estado `completo` → se crea/actualiza `box_completion`.
2. El cierre puede ser automático o manual (`completada_manual = true`).

### 3.4 Reportes y métricas

Las funciones agregadas en la base de datos consultan `placas`, `reoperaciones`, `recuperaciones` y `historial_operaciones` para calcular:
- Métricas de producción por proceso
- Tasas de reoperación y recuperación
- Estado de cajas y cobertura de servicios

---

## 4. Caso práctico: Eliminación de placas FRONTAL erróneas

### 4.1 Contexto del problema

El servicio "Convertidor Dolly" de la producción `76efa2dd-9349-4bd3-b276-c6ae25bb65d5` se cargó con tipo `JGS` (que genera FRONTAL + TRASERA) cuando en realidad es `PZ` (solo TRASERA). Esto provocó que se crearan 50 placas FRONTAL que no deberían existir. La caja del servicio tenía 100 placas (50 FRONTAL + 50 TRASERA) cuando debería tener solo 50 (solo TRASERA).

### 4.2 Tablas afectadas

Eliminar las 50 placas FRONTAL requiere limpiar primero todas las tablas que las referencian, en orden de dependencia:

```
placas (FRONTAL)
  ├── reoperaciones        → placa_id
  ├── recuperaciones       → placa_id
  ├── historial_operaciones → placa_id
  └── reoperaciones_anuladas → placa_id
```

Si se eliminan las placas primero, las foreign keys de las tablas dependientes provocarían errores de violación de restricción.

### 4.3 Paso 1: Inspección — contar registros antes de eliminar

Antes de cualquier eliminación, se consultó cuántos registros existían en cada tabla vinculada a las placas FRONTAL:

```sql
SELECT 
  (SELECT COUNT(*) FROM placas 
   WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
     AND servicio = 'Convertidor Dolly' 
     AND posicion = 'FRONTAL') AS total_frontal,
  (SELECT COUNT(*) FROM placas 
   WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
     AND servicio = 'Convertidor Dolly' 
     AND posicion = 'TRASERA') AS total_trasera,
  (SELECT COUNT(*) FROM reoperaciones r
   WHERE r.produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
     AND r.placa_id IN (SELECT id FROM placas 
       WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
         AND servicio = 'Convertidor Dolly' AND posicion = 'FRONTAL')) AS reoperaciones_frontal,
  (SELECT COUNT(*) FROM recuperaciones r
   WHERE r.produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
     AND r.placa_id IN (SELECT id FROM placas 
       WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
         AND servicio = 'Convertidor Dolly' AND posicion = 'FRONTAL')) AS recuperaciones_frontal,
  (SELECT COUNT(*) FROM historial_operaciones h
   WHERE h.produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
     AND h.placa_id IN (SELECT id FROM placas 
       WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
         AND servicio = 'Convertidor Dolly' AND posicion = 'FRONTAL')) AS historial_frontal,
  (SELECT COUNT(*) FROM reoperaciones_anuladas ra
   WHERE ra.produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
     AND ra.placa_id IN (SELECT id FROM placas 
       WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
         AND servicio = 'Convertidor Dolly' AND posicion = 'FRONTAL')) AS anuladas_frontal;
```

**Resultado de la inspección:**

| Tabla | Registros vinculados a FRONTAL |
|---|---|
| placas (FRONTAL) | 50 |
| placas (TRASERA) | 50 (se conservan) |
| reoperaciones | 50 |
| recuperaciones | 50 |
| historial_operaciones | 100 |
| reoperaciones_anuladas | 0 |

### 4.4 Paso 2: Verificación de tablas secundarias

Se verificó si había registros en `service_boxes` y `box_completion` que pudieran verse afectados:

```sql
SELECT 
  (SELECT COUNT(*) FROM service_boxes 
   WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
     AND servicio = 'Convertidor Dolly') AS service_boxes_count,
  (SELECT COUNT(*) FROM box_completion 
   WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
     AND servicio = 'Convertidor Dolly') AS box_completion_count;
```

**Resultado:** 1 registro en `service_boxes`, 0 en `box_completion`. No fue necesario modificar estas tablas.

### 4.5 Paso 3: Eliminación en orden de dependencias

El orden es crítico: se eliminan primero los registros que referencian a las placas, y al final las placas mismas. Esto evita errores de foreign key constraint.

**Orden de eliminación:**

1. `historial_operaciones` (100 registros) — referencia `placa_id`
2. `recuperaciones` (50 registros) — referencia `placa_id`
3. `reoperaciones_anuladas` (0 registros) — referencia `placa_id`
4. `reoperaciones` (50 registros) — referencia `placa_id`
5. `placas` (50 registros) — tabla principal

**Consultas ejecutadas (en este orden exacto):**

```sql
-- 1. Eliminar historial_operaciones vinculado a las placas FRONTAL
DELETE FROM historial_operaciones
WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
  AND placa_id IN (
    SELECT id FROM placas
    WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
      AND servicio = 'Convertidor Dolly'
      AND posicion = 'FRONTAL'
  );

-- 2. Eliminar recuperaciones vinculadas a las placas FRONTAL
DELETE FROM recuperaciones
WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
  AND placa_id IN (
    SELECT id FROM placas
    WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
      AND servicio = 'Convertidor Dolly'
      AND posicion = 'FRONTAL'
  );

-- 3. Eliminar reoperaciones_anuladas vinculadas a las placas FRONTAL
DELETE FROM reoperaciones_anuladas
WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
  AND placa_id IN (
    SELECT id FROM placas
    WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
      AND servicio = 'Convertidor Dolly'
      AND posicion = 'FRONTAL'
  );

-- 4. Eliminar reoperaciones vinculadas a las placas FRONTAL
DELETE FROM reoperaciones
WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
  AND placa_id IN (
    SELECT id FROM placas
    WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
      AND servicio = 'Convertidor Dolly'
      AND posicion = 'FRONTAL'
  );

-- 5. Eliminar las placas FRONTAL
DELETE FROM placas
WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
  AND servicio = 'Convertidor Dolly'
  AND posicion = 'FRONTAL';
```

### 4.6 Por qué este orden evita errores

Las foreign keys (`placa_id` → `placas.id`) crean una relación de dependencia: no se puede eliminar una placa si otra tabla todavía la referencia. Postgres lanzaría este error si se invirtiera el orden:

```
ERROR: update or delete on table "placas" violates foreign key constraint 
"reoperaciones_placa_id_fkey" on table "reoperaciones"
DETAIL: Key (id)=(... is still referenced from table "reoperaciones".
```

Al eliminar primero los registros dependientes y después las placas, no queda ninguna referencia huérfana y la operación se completa sin errores.

### 4.7 Paso 4: Verificación post-eliminación

Después de ejecutar las eliminaciones, se corrió la misma consulta de conteo del Paso 1 para confirmar que todo quedó limpio:

```sql
SELECT 
  (SELECT COUNT(*) FROM placas 
   WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
     AND servicio = 'Convertidor Dolly' 
     AND posicion = 'FRONTAL') AS frontal_restantes,
  (SELECT COUNT(*) FROM placas 
   WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
     AND servicio = 'Convertidor Dolly' 
     AND posicion = 'TRASERA') AS trasera_restantes,
  (SELECT COUNT(*) FROM reoperaciones r
   WHERE r.produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
     AND r.placa_id IN (SELECT id FROM placas 
       WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
         AND servicio = 'Convertidor Dolly' AND posicion = 'FRONTAL')) AS reoperaciones_frontal,
  (SELECT COUNT(*) FROM recuperaciones r
   WHERE r.produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
     AND r.placa_id IN (SELECT id FROM placas 
       WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
         AND servicio = 'Convertidor Dolly' AND posicion = 'FRONTAL')) AS recuperaciones_frontal,
  (SELECT COUNT(*) FROM historial_operaciones h
   WHERE h.produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5'
     AND h.placa_id IN (SELECT id FROM placas 
       WHERE produccion_id = '76efa2dd-9349-4bd3-b276-c6ae25bb65d5' 
         AND servicio = 'Convertidor Dolly' AND posicion = 'FRONTAL')) AS historial_frontal;
```

**Resultado verificado:**

| Tabla | Registros FRONTAL restantes |
|---|---|
| placas (FRONTAL) | 0 |
| placas (TRASERA) | 50 (conservadas) |
| reoperaciones | 0 |
| recuperaciones | 0 |
| historial_operaciones | 0 |

### 4.8 Migración registrada

La eliminación se ejecutó como una migración formal con el nombre `delete_frontal_convertidor_dolly_76efa2dd.sql`, lo que significa que queda registrada en el historial de migraciones de Supabase y puede auditarse en el futuro.

---

## 5. Reglas de integridad importantes

1. **No eliminar placas con registros dependientes:** Siempre eliminar primero `historial_operaciones`, `recuperaciones`, `reoperaciones_anuladas` y `reoperaciones` antes de eliminar `placas`.

2. **Unicidad de placas:** La combinación `(produccion_id, serie, posicion)` debe ser única. Una serie puede tener una placa FRONTAL y una TRASERA, pero no dos del mismo tipo.

3. **Tipo de servicio y cantidad de placas:** Los servicios `JGS` generan 2 placas por serie (FRONTAL + TRASERA). Los servicios `PZ` generan 1 placa por serie (solo TRASERA). Cargar un servicio PZ como JGS crea placas FRONTAL fantasma que deben eliminarse.

4. **Versión de datos:** Cada operación (reoperación, recuperación, importación) incrementa `productions.version_datos`. Esto permite que el frontend detecte cambios y refresque los datos automáticamente.

5. **RLS activado:** Todas las tablas tienen Row Level Security. Los operadores solo pueden ver y modificar datos de la producción seleccionada. Los gerentes pueden ver pero no modificar. Los administradores tienen acceso completo.

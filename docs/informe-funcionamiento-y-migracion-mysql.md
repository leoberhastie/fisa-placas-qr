# Informe de funcionamiento y propuesta de conexión con MySQL local

## 1. Resumen ejecutivo

FISA-PLACAS Reoperaciones es una aplicación web para controlar producciones, placas, reoperaciones, recuperaciones, cajas, servicios, historial y reportes.

Actualmente utiliza:

- React + TypeScript para la interfaz.
- Vite como herramienta de compilación.
- Supabase para autenticación, base de datos, permisos y funciones de negocio.
- Almacenamiento local del navegador para conservar la producción y el operador seleccionados.
- Importación de archivos Excel.
- Exportación a Excel y PDF.
- Lectura de códigos QR.
- Reoperación por lote (selección múltiple de placas).
- Reinicio de datos de una producción, en dos modos: borrar solo movimientos o eliminar todo.

La aplicación puede prepararse para MySQL local sin reescribir la interfaz. La opción recomendada es añadir un servidor local intermedio entre la aplicación y MySQL.

> No se recomienda conectar el navegador directamente a MySQL. Eso expondría las credenciales de la base de datos, impediría aplicar correctamente los permisos y permitiría que un usuario modificara datos sin pasar por las reglas del sistema.

---

## 2. Cómo funciona la aplicación paso a paso

### Paso 1. Inicio de la aplicación

1. El navegador carga la aplicación.
2. Se muestra la pantalla de carga inicial.
3. Se comprueba si existe una sesión iniciada.
4. Si no existe una sesión válida, se muestra la pantalla de acceso.
5. Si existe una sesión, se carga el perfil del usuario.
6. El perfil determina el rol: administrador, operador o gerente.

Los roles controlan qué pantallas aparecen y qué acciones puede ejecutar cada usuario.

### Paso 2. Inicio de sesión

1. El usuario escribe su nombre de usuario y contraseña.
2. El sistema convierte el nombre de usuario en el identificador interno de acceso.
3. Supabase valida las credenciales.
4. Se recuperan los datos del perfil: nombre, correo y rol.
5. La aplicación muestra la pantalla inicial correspondiente al rol.

No existe un registro público de usuarios. Las cuentas son administradas como cuentas internas del personal.

### Paso 3. Preparación del puesto de trabajo

Después de iniciar sesión, la aplicación comprueba si existen:

- Una producción seleccionada.
- Un nombre de operador.

Si falta alguno de estos datos, se muestra la ventana de preparación inicial.

La producción y el operador se conservan en el navegador para que no sea necesario repetir la selección después de recargar la página.

### Paso 4. Barra lateral y navegación

La barra lateral contiene:

1. Identidad de la aplicación.
2. Producción activa.
3. Menú disponible para el rol actual.
4. Nombre y rol del usuario.
5. Botón para cerrar sesión.
6. Crédito de la aplicación.

La producción se cambia desde la tarjeta de producción activa. Ya no aparece como un elemento independiente del menú.

La navegación utiliza rutas internas basadas en el hash de la dirección del navegador. Esto permite cambiar de pantalla sin recargar toda la aplicación.

### Paso 5. Selección y administración de producciones

En la pantalla de Producciones se puede:

- Consultar las producciones disponibles.
- Seleccionar la producción de trabajo.
- Crear una producción, si el usuario es administrador.
- Editar sus datos, si el usuario es administrador.
- Archivar una producción.
- Restaurar una producción archivada.

Cada producción tiene información como código, consecutivo, estado, año, descripción, fecha de creación y versión de datos.

### Paso 6. Registro mediante código QR

El lector QR es la primera sección que aparece al entrar a la pantalla de lectura, para que el operador tenga la menor distracción posible.

1. El operador abre el lector QR.
2. La cámara trasera principal se selecciona automáticamente (si hay varias, se descartan lentes secundarias como ultra-wide, macro o tele).
3. Se lee el código de la placa.
4. La cámara se pausa automáticamente tras cada lectura.
5. El sistema busca la placa dentro de la producción activa.
6. Se muestra la información de la placa en un modal.
7. El operador elige reoperación o recuperación.
   - El botón "Recuperar" solo se habilita si la placa tiene una reoperación pendiente.
   - El botón "Reoperación" se deshabilita si la placa no se encontró.
8. Al confirmar, el registro se guarda en un solo paso y el modal se cierra.
9. La cámara se reanuda automáticamente para la siguiente lectura.

**Modos de operación:**

- **Automático:** la cámara escanea continuamente. Al leer un código se pausa, muestra el modal, y al confirmar se reanuda.
- **Manual:** el operador escribe la serie y posición (FRONTAL/TRASERA) para buscar la placa sin cámara.

**Botones disponibles:**

- Automático / Manual: alterna entre cámara y búsqueda manual.
- Escanear siguiente: reanuda la cámara manualmente si es necesario.

**Pausa al cambiar de pantalla:** cuando el operador navega a otra pantalla, la cámara se detiene automáticamente al desmontar el componente.

**Información visible:** solo se muestra la tarjeta "Última serie leída". Se eliminaron las tarjetas de operador, totales, última posición y producción activa de esta pantalla para reducir distracciones. La información del operador y la producción activa están disponibles en el menú lateral.

### Paso 7. Reoperación por lote (selección múltiple)

Desde la pantalla del lector QR, el operador puede abrir el panel de "Reoperación por lote" para registrar reoperaciones sobre múltiples placas a la vez.

**Flujo:**

1. Seleccionar un **Servicio** (selector con filtro). Solo se listan los servicios que tienen cajas no completadas.
2. Se cargan las **Cajas** disponibles en ese servicio (selector con filtro). Las cajas completadas no se muestran.
3. Al elegir una caja, se cargan las **placas** de esa caja.
4. Se ofrecen dos modos de selección:
   - **Por rango:** dos selectores con filtro para elegir la placa inicial y la final. Las placas se muestran como "serie-posición".
   - **Manual:** tarjetas seleccionables "serie-posición" con un clic.
5. El botón "Reoperar (N)" muestra el contador de placas seleccionadas.
6. Al pulsarlo, se elige un proceso (Impresión, Sticker, Brotech, Blanking, Embossing) que se aplica a todas las placas.
7. Se registran todas las reoperaciones y sus entradas de historial en lote.

**Reglas:**

- La selección múltiple solo aplica a reoperaciones, no a recuperaciones.
- Las placas de un rango pertenecen a la misma caja.
- Las placas se cargan solo al elegir la caja para evitar consultas innecesarias.
- El servicio y la caja elegidos se guardan en el navegador y se pueden volver a elegir.
- La cámara se pausa mientras el panel de lote está abierto.

### Paso 8. Reoperaciones generales

Esta pantalla muestra las reoperaciones registradas de la producción activa.

Permite:

- Filtrar por serie.
- Filtrar por caja.
- Filtrar por servicio.
- Filtrar por proceso.
- Filtrar por estado.
- Filtrar por operador.
- Filtrar por fecha inicial y final.
- Marcar una reoperación pendiente como recuperada, cuando el rol lo permite.
- Exportar los resultados filtrados.
- Consultar los resultados por páginas de 50 registros.

La pantalla también presenta indicadores de total de reoperaciones, placas afectadas, pendientes y recuperaciones.

### Paso 9. Control de cajas

La pantalla de Cajas tiene un objetivo diferente al listado de reoperaciones.

Permite:

- Consultar cajas agrupadas por servicio.
- Buscar una caja concreta.
- Filtrar por servicio.
- Filtrar por estado.
- Consultar series inicial y final.
- Ver cantidad de placas y reoperaciones.
- Ver pendientes.
- Marcar una caja como completada.
- Reabrir una caja.
- Abrir el detalle de una caja.
- Exportar la información.
- Paginar los resultados desde el servidor.

Por estas diferencias, Reoperaciones generales y Cajas deben continuar como módulos separados.

### Paso 10. Servicios y panel de control

El módulo de Servicios agrupa la información operativa por servicio y muestra cobertura, cajas y estados.

Al abrir el detalle de un servicio aparece el bloque de parcialidades, que indica:

- Cuántas parcialidades tiene el servicio.
- Cuántas cajas están asignadas.
- Cuántas placas están asignadas de las que tiene el servicio.
- Cuántas placas faltan para completar el servicio. El bloque se muestra en verde si el servicio está completo y en ámbar si faltan placas.

El Panel de control presenta una vista resumida para supervisión y gerencia, con métricas de la producción activa.

Las métricas se calculan mediante consultas agrupadas para evitar cargar todos los registros en el navegador.

### Paso 11. Historial

El historial registra las acciones importantes del sistema, como:

- Reoperaciones.
- Recuperaciones.
- Importaciones.
- Cambios de estado.
- Ediciones de placas.

Al hacer clic en "Ver placa" se abre un modal con toda la información de la placa:

- **Tarjetas de resumen:** total de reoperaciones, recuperadas, pendientes y recuperaciones.
- **Ficha de la placa:** serie, posición, servicio, caja, consecutivo y fecha de importación, organizados con iconos.
- **Rango de series de la caja:** serie inicial, serie final y total de placas de la caja a la que pertenece la placa (filtrando por servicio y caja para evitar mezclar cajas con el mismo número en distintos servicios).
- **Detalle de reoperaciones:** proceso, estado, fecha, quien registró la reoperación y quien la confirmó (con fecha).
- **Cronología de movimientos:** línea de tiempo con todas las operaciones de la placa.

### Paso 12. Importaciones

Los administradores pueden importar información maestra desde Excel.

El proceso incluye:

1. Selección del archivo.
2. Lectura de sus hojas y columnas.
3. Validación de los datos.
4. Importación por lotes.
5. Actualización de placas, servicios o cajas.
6. Registro de la importación y sus errores.

Las importaciones de cajas por series incluyen una vista previa antes de aplicar los cambios definitivos.

Después de subir un archivo de cajas, la pantalla muestra el estado de la parcialidad del servicio: si la asignación está completa (aviso verde) o parcial (aviso ámbar), junto con las placas que todavía faltan. Ver la sección 4.

### Paso 13. Reportes y exportaciones

La aplicación permite exportar información visible o filtrada a:

- Excel.
- PDF.

Los archivos incluyen el nombre de la producción, el usuario, los filtros utilizados y los indicadores correspondientes cuando aplica.

### Paso 14. Sincronización

La producción tiene un número de versión de datos.

Cuando se registra una operación o se realiza una importación:

1. Se actualiza la versión de la producción.
2. La aplicación consulta periódicamente las versiones.
3. Si detecta un cambio, actualiza los datos que estén obsoletos.
4. Se evita recargar información que no cambió.

Este mecanismo es independiente de Supabase y puede conservarse con MySQL.

### Paso 15. Ajustes

La pantalla de Ajustes contiene:

- **Tu cuenta:** nombre, usuario, rol y producción activa.
- **Cambiar contraseña.**
- **Gestión de producciones:** crear, editar y seleccionar la producción de trabajo.
- **Importación de Excel** (solo administrador).
- **Cajas por servicio** (solo administrador).
- **Reiniciar datos de la producción** (solo administrador), con dos opciones:
  - **Borrar solo movimientos:** elimina las cajas registradas y completadas, la caja asignada a cada placa, las reoperaciones, las recuperaciones y el historial. Conserva series, servicios e importaciones. Las placas quedan activas y sin caja, como si solo se hubiera subido el archivo de placas maestras.
  - **Eliminar todo:** elimina además placas, servicios, series e importaciones. La producción en sí no se elimina.
  - El proceso se ejecuta por lotes y verifica cada paso. Muestra el progreso en pantalla y cada reinicio queda registrado con fecha y usuario en el registro de reinicios. Requiere confirmación.
- **Configuración del lector QR.**
- **Información del sistema.**
- **Permisos por rol.**

---

## 3. Arquitectura actual

### Interfaz

La interfaz está organizada en páginas, componentes reutilizables, contextos y hooks.

Las pantallas no deberían comunicarse directamente con la base de datos. Actualmente algunas operaciones están concentradas en servicios, que es una buena base para desacoplar el sistema.

### Contextos principales

- **Autenticación:** sesión, perfil, rol y cierre de sesión.
- **Selección de producción:** producción y operador activos.
- **Sincronización:** versiones y caché de datos.
- **Notificaciones:** mensajes de éxito y error.

### Servicios principales

- Autenticación y perfiles.
- Producciones (incluye reinicio de datos por lotes y su registro).
- Operaciones, reoperaciones, recuperaciones e historial.
- Métricas y reportes.
- Importación maestra.
- Importación y asignación de cajas, con seguimiento de parcialidades.
- Lectura de placas mediante QR.

### Dependencias con Supabase

La mayor parte de la dependencia está concentrada en:

- Cliente de Supabase.
- Contexto de autenticación.
- Servicios que consultan tablas.
- Servicios que llaman funciones almacenadas mediante RPC.

La interfaz, la navegación, los tipos de dominio, la selección de producción y la sincronización por versión son reutilizables con MySQL.

---

## 4. Parcialidades en la asignación de cajas

### Qué es una parcialidad

En muchas producciones las cajas no se importan todas a la vez, sino por parcialidades: el administrador carga un primer archivo con las cajas de un servicio y, días después, otro archivo con más cajas del mismo servicio.

Cada archivo subido se considera una parcialidad consecutiva numerada 1, 2, 3, en orden de subida. Un servicio está completo cuando la última serie de su última caja coincide con la última serie del servicio. Si no coincide, la asignación es parcial.

### Cómo funciona hoy

1. Cada archivo de cajas se asigna por series, en lotes (máximo 500 cajas por llamada).
2. Para cada caja se valida que sus series existan en las placas del servicio.
3. Se valida que la caja no se superponga con una caja ya asignada. Si se superpone, la importación se rechaza.
4. La asignación se guarda en `service_boxes` con su número de parcialidad (`parcialidad`) y si la parcialidad es parcial (`es_parcial`).
5. Al terminar la importación, la pantalla muestra el aviso de parcialidad con las placas que faltan.
6. En el detalle del servicio aparecen las métricas de parcialidades, cajas asignadas, placas asignadas y placas faltantes (ver Paso 10).

### Limitaciones actuales

1. **No existe modo "reemplazar" dentro de la importación.** Para reemplazar las cajas de un servicio, el administrador debe limpiar sus asignaciones y volver a importar.
2. **Las cajas faltantes se estiman** a partir de las placas que aún no tienen caja; no se listan caja por caja.

### Próximos pasos propuestos

- Añadir un modo "añadir a las existentes" o "reemplazar todas las cajas del servicio" antes de confirmar la importación.
- Mostrar, en la vista previa, qué cajas del archivo ya están asignadas.
- Reporte de cobertura por parcialidad, con el porcentaje del servicio cubierto por cada una.

---

## 5. Propuesta recomendada para MySQL local

### Opción recomendada: aplicación web + API local + MySQL

La arquitectura quedaría así:

```text
Navegador
   |
   | HTTP local
   v
Servidor de la aplicación
   |
   | conexión protegida
   v
MySQL local
```

El servidor intermedio se encarga de:

- Autenticar usuarios.
- Validar roles.
- Consultar MySQL.
- Ejecutar transacciones.
- Validar importaciones.
- Registrar historial.
- Aplicar reglas que actualmente protege Supabase.

La interfaz conserva la misma experiencia visual y solo cambia la forma de solicitar los datos.

### Tecnología sugerida para el servidor local

Se recomienda:

- Node.js.
- TypeScript.
- Fastify o Express.
- `mysql2` para conectarse a MySQL.
- `bcrypt` para contraseñas.
- JWT de corta duración para sesiones.
- Validación de entradas en cada endpoint.

El servidor puede ejecutarse en el mismo equipo que MySQL o en un servidor local de la red.

---

## 6. Cómo desacoplar la aplicación de Supabase

### Fase 1. Definir contratos de datos

Crear interfaces que describan las operaciones que necesita la aplicación, sin mencionar Supabase ni MySQL.

Ejemplos de contratos:

- Autenticación.
- Producciones.
- Placas.
- Reoperaciones.
- Recuperaciones.
- Historial.
- Métricas.
- Importaciones.
- Cajas.

Cada contrato debe indicar qué recibe y qué devuelve, por ejemplo:

- Listar producciones.
- Crear producción.
- Cambiar estado.
- Buscar placa.
- Registrar reoperación.
- Obtener cajas paginadas.
- Marcar caja completada.
- Reiniciar datos de producción, en modo movimientos o total.

### Fase 2. Separar adaptadores

Organizar los servicios en dos implementaciones:

```text
src/services/
  contracts/
  supabase/
  mysql/
  index.ts
```

- `contracts`: interfaces compartidas.
- `supabase`: implementación actual.
- `mysql`: llamadas a la API local.
- `index.ts`: selección del proveedor activo.

La interfaz y las páginas solo deben importar los contratos o el proveedor seleccionado, no consultar directamente una base de datos concreta.

### Fase 3. Mantener Supabase como proveedor actual

Primero se debe mover la lógica actual a un adaptador Supabase sin cambiar el comportamiento.

Esto permite comprobar que la separación funciona antes de desarrollar MySQL.

### Fase 4. Crear la API local

La API debe ofrecer rutas agrupadas por responsabilidad:

```text
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/change-password
POST   /api/auth/logout

GET    /api/productions
POST   /api/productions
PATCH  /api/productions/:id

GET    /api/productions/:id/reoperations
POST   /api/reoperations
POST   /api/reoperations/:id/close

GET    /api/productions/:id/boxes
POST   /api/boxes/:id/complete
POST   /api/boxes/:id/reopen

POST   /api/productions/:id/resets
POST   /api/productions/:id/resets/:resetId/batches
POST   /api/productions/:id/resets/:resetId/finish
GET    /api/productions/:id/resets

GET    /api/productions/:id/metrics
GET    /api/productions/:id/reports
```

Las rutas deben comprobar el token, el rol y la producción solicitada antes de leer o modificar información.

### Fase 5. Crear el esquema MySQL

Se recomienda iniciar con estas tablas:

- `users`.
- `profiles`.
- `productions`.
- `placas`.
- `reoperaciones`.
- `recuperaciones`.
- `historial_operaciones`.
- `importaciones`.
- `production_services`.
- `service_boxes`.
- `box_completion`.
- `reinicios_produccion`.

La columna `version_datos` debe conservarse en `productions`.

Para una primera versión se puede usar `CHAR(36)` para identificadores UUID porque es sencillo de inspeccionar y compatible con el código actual. Más adelante se puede cambiar a `BINARY(16)` si el volumen de datos lo justifica.

### Fase 6. Trasladar la lógica de las funciones RPC

Las funciones actuales se deben clasificar:

#### Consultas de lectura

Pueden convertirse en consultas SQL del servidor:

- Métricas de producción.
- Métricas por servicio.
- Métricas por caja.
- Reoperaciones con datos de placa.
- Datos de reportes.
- Resúmenes de servicios.
- Movimientos de una caja.
- Listado de cajas por servicio.
- Información de parcialidad por servicio.

#### Operaciones transaccionales

Deben ejecutarse en el servidor dentro de una transacción MySQL:

- Marcar una caja como completada.
- Reabrir una caja.
- Cerrar manualmente una reoperación.
- Importar por lotes.
- Asignar cajas por rangos de series.
- Reiniciar datos de una producción. Se ejecuta por lotes: cada lote es una transacción independiente, se verifica al terminar cada paso y el reinicio queda registrado con usuario y fecha.

Una transacción debe guardar el cambio, el historial y el aumento de versión como una sola operación. Si una parte falla, no debe quedar el sistema en un estado incompleto.

### Fase 7. Cambiar el proveedor desde la interfaz

La selección del proveedor puede realizarse mediante una configuración de compilación:

```text
BACKEND_PROVIDER=supabase
```

o:

```text
BACKEND_PROVIDER=mysql
```

La aplicación no debe contener credenciales de MySQL. La interfaz solo necesita conocer la dirección de la API local.

---

## 7. Equivalencias entre Supabase y MySQL

| Funcionalidad actual | En Supabase | En la solución MySQL |
|---|---|---|
| Inicio de sesión | Supabase Auth | API propia + `bcrypt` + JWT |
| Perfil y rol | `profiles` + Auth | `users` + `profiles` |
| Permisos por fila | RLS | Validación de rol y propiedad en la API |
| Funciones de negocio | RPC PostgreSQL | Servicios TypeScript o procedimientos MySQL |
| UUID | `gen_random_uuid()` | UUID generado por servidor |
| Fecha y hora | `timestamptz` | `DATETIME(3)` en UTC |
| Booleanos | `boolean` | `TINYINT(1)` |
| Upsert | `ON CONFLICT` | `ON DUPLICATE KEY UPDATE` |
| Paginación | `range` | `LIMIT` y `OFFSET`, o cursor |
| Sincronización | `version_datos` | La misma columna consultada por la API |
| Historial | Tabla y funciones SQL | Tabla y transacciones del servidor |
| Reinicio de datos | `start_production_reset`, `reset_production_batch` y `finish_production_reset` (RPC por lotes) | Proceso por lotes en la API, con tabla `reinicios_produccion` |

---

## 8. Reglas de seguridad para MySQL

1. MySQL no debe estar expuesto directamente al navegador.
2. Las credenciales de MySQL deben existir únicamente en el servidor local.
3. Las contraseñas deben guardarse con `bcrypt` o un algoritmo equivalente.
4. El servidor debe validar el rol en cada operación sensible.
5. Nunca se debe confiar en un rol enviado desde el navegador.
6. Las operaciones de caja y recuperaciones deben ser transaccionales.
7. Las importaciones deben validar tamaño, formato, columnas y cantidad de filas.
8. Las consultas deben usar parámetros, nunca concatenar valores recibidos del usuario.
9. Deben existir índices para `produccion_id`, `serie`, `numero_caja`, `estado` y fechas.
10. Se debe conservar el historial de acciones y el usuario que las ejecutó.
11. La API local debe limitar sus orígenes permitidos y no aceptar cualquier origen en producción.
12. Se deben realizar copias de seguridad de MySQL antes de importaciones masivas.
13. El reinicio de datos debe requerir rol de administrador y confirmación explícita, y debe quedar registrado con usuario y fecha.

---

## 9. Plan de implementación recomendado

### Etapa A: preparación

- Definir los contratos de los servicios.
- Separar la autenticación de la implementación Supabase.
- Crear pruebas para operaciones críticas.
- Documentar las consultas y funciones actuales.

### Etapa B: adaptador Supabase

- Mover las consultas actuales a una carpeta Supabase.
- Mantener exactamente los mismos tipos de respuesta.
- Cambiar las páginas para consumir contratos, no el cliente Supabase.
- Verificar que la aplicación siga funcionando igual.

### Etapa C: servidor MySQL

- Crear el servidor local.
- Crear autenticación propia.
- Crear las tablas e índices.
- Implementar producciones y selección.
- Implementar placas y lector QR.

### Etapa D: operaciones críticas

- Implementar reoperaciones (individuales y por lote).
- Implementar recuperaciones.
- Implementar historial.
- Implementar cajas completadas y reabiertas.
- Implementar aumento de versiones.
- Implementar reinicio de datos de producción por lotes, en sus dos modos, con registro de auditoría.

### Etapa E: consultas y módulos avanzados

- Métricas.
- Servicios.
- Panel de control.
- Reportes.
- Importaciones Excel.
- Exportaciones.
- Asignación de cajas por parcialidades, incluido el modo de reemplazo.

### Etapa F: validación y cambio

- Probar la API con una copia de datos.
- Comparar resultados Supabase y MySQL.
- Probar permisos con cada rol.
- Probar fallos a mitad de una transacción.
- Activar MySQL únicamente cuando los módulos críticos coincidan.

---

## 10. Recomendación final

No conviene reemplazar Supabase de una sola vez. La alternativa más segura es desarrollar una capa de contratos y mantener dos proveedores:

1. Supabase como proveedor actual y respaldo.
2. API local con MySQL como nuevo proveedor.

La primera versión de MySQL debería cubrir autenticación, producciones, placas, reoperaciones, recuperaciones e historial. Después se deben trasladar cajas, métricas, importaciones y reportes.

El cambio más importante no es convertir consultas PostgreSQL a MySQL, sino trasladar correctamente la autenticación, los permisos RLS y las transacciones protegidas por las funciones RPC. Si esas reglas se colocan en el servidor local, la interfaz actual puede conservarse casi sin cambios.

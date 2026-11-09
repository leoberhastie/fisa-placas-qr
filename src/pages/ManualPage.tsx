import { useState, type ReactNode } from 'react';
import {
  BookOpen,
  ClipboardList,
  FileBarChart,
  Gauge,
  History,
  Layers,
  LayoutDashboard,
  Package,
  QrCode,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectedProductionBanner } from '@/components/productions/SelectedProductionBanner';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

interface SectionDef {
  id: string;
  title: string;
  icon: LucideIcon;
  body: ReactNode;
}

const ROLES = [
  {
    icon: ShieldCheck,
    tone: 'bg-primary/10 text-primary',
    name: 'Administrador',
    summary: 'Control total del sistema.',
    duties: [
      'Crear, editar, archivar y restaurar producciones.',
      'Importar información maestra desde archivos Excel: placas, servicios y cajas.',
      'Asignar cajas por rangos de series a cada servicio.',
      'Registrar reoperaciones y recuperaciones manuales mediante el lector QR.',
      'Marcar cajas como completadas y reabrir cajas cuando sea necesario.',
      'Consultar y exportar todos los reportes y el historial completo.',
      'Cambiar su propia contraseña y acceder a los ajustes del sistema.',
    ],
  },
  {
    icon: QrCode,
    tone: 'bg-accent/10 text-accent',
    name: 'Operador',
    summary: 'Ejecuta las operaciones en piso.',
    duties: [
      'Seleccionar la producción activa y registrar su nombre de operador.',
      'Escanear el código QR de una placa para ver su información.',
      'Registrar reoperaciones y recuperaciones asociadas a la placa escaneada.',
      'Cerrar manualmente una reoperación pendiente cuando corresponde.',
      'Cerrar y reabrir cajas desde el panel de cierre del lector QR.',
      'Consultar reoperaciones generales, cajas e historial de la producción activa.',
    ],
  },
  {
    icon: Gauge,
    tone: 'bg-success/10 text-success',
    name: 'Gerente',
    summary: 'Supervisa indicadores y resultados.',
    duties: [
      'Consultar el panel de control con métricas globales de la producción.',
      'Revisar reoperaciones, cajas, servicios, historial y reportes.',
      'Exportar reportes a Excel y PDF para análisis o presentaciones.',
      'No puede importar archivos ni crear producciones; su rol es de consulta y seguimiento.',
    ],
  },
];

const SECTIONS: SectionDef[] = [
  {
    id: 'inicio',
    title: 'Inicio y acceso',
    icon: BookOpen,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Al abrir la aplicación se muestra una pantalla de carga breve y luego la pantalla de acceso.
          Escriba su <strong className="text-foreground">nombre de usuario</strong> y su{' '}
          <strong className="text-foreground">contraseña</strong>. No existen registros públicos: las
          cuentas son creadas previamente por el administrador del sistema.
        </p>
        <p>
          Después de iniciar sesión, la aplicación verifica que exista una{' '}
          <strong className="text-foreground">producción seleccionada</strong> y un{' '}
          <strong className="text-foreground">nombre de operador</strong>. Si falta alguno, aparece una
          ventana que le pide elegir ambos antes de continuar. Esta selección se conserva en el navegador,
          así que al recargar la página no tendrá que repetirla.
        </p>
        <p>
          Cada usuario tiene un rol asignado (administrador, operador o gerente). El rol determina qué
          pantallas aparecen en el menú y qué acciones puede ejecutar. Vea la sección{' '}
          <strong className="text-foreground">Roles y permisos</strong> para el detalle.
        </p>
      </div>
    ),
  },
  {
    id: 'roles',
    title: 'Roles y permisos',
    icon: Users,
    body: (
      <div className="grid gap-4 md:grid-cols-3">
        {ROLES.map((role) => (
          <div key={role.name} className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${role.tone}`}>
                <role.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-foreground">{role.name}</p>
                <p className="text-xs text-muted-foreground">{role.summary}</p>
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {role.duties.map((duty) => (
                <li key={duty} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{duty}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'navegacion',
    title: 'Barra lateral y navegación',
    icon: Layers,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          La barra lateral, a la izquierda, contiene la identidad de la aplicación, la producción activa,
          el menú disponible para su rol, su nombre y rol, y el botón para cerrar sesión.
        </p>
        <p>
          Para <strong className="text-foreground">cambiar de producción</strong>, pulse la tarjeta
          "Producción activa" en la parte superior de la barra lateral. Se abre la pantalla de Producciones,
          donde puede elegir otra producción. Esta tarjeta no aparece como un elemento más del menú.
        </p>
        <p>
          La navegación entre pantallas no recarga la página completa. Cada opción del menú cambia
          únicamente el contenido central. En dispositivos móviles, la barra lateral se reemplaza por un
          menú desplegable.
        </p>
      </div>
    ),
  },
  {
    id: 'produccion',
    title: 'Producciones',
    icon: LayoutDashboard,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Una <strong className="text-foreground">producción</strong> agrupa todas las placas, servicios,
          reoperaciones, recuperaciones, cajas e importaciones de un lote de trabajo. Toda la información
          que ve en las demás pantallas pertenece a la producción que tenga seleccionada.
        </p>
        <p>
          En la pantalla de Producciones puede:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Consultar las producciones disponibles y su estado (activa o archivada).</li>
          <li>Seleccionar la producción de trabajo pulsando sobre ella.</li>
          <li>Crear una producción nueva (solo administrador).</li>
          <li>Editar sus datos: código, consecutivo, año, descripción (solo administrador).</li>
          <li>Archivar una producción que ya no está en curso.</li>
          <li>Restaurar una producción archivada.</li>
        </ul>
        <p>
          Cada producción guarda un número de <strong className="text-foreground">versión de datos</strong>
          que aumenta cada vez que se registra una operación o se realiza una importación. La aplicación
          consulta ese número periódicamente y, si cambió, actualiza la información afectada.
        </p>
      </div>
    ),
  },
  {
    id: 'qr',
    title: 'Lector QR',
    icon: QrCode,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          El lector QR es la herramienta principal del operador en piso. Permite identificar una placa
          rápidamente y registrar movimientos sobre ella.
        </p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>Abra la pantalla "Lector QR".</li>
          <li>Permita el uso de la cámara cuando el navegador lo solicite.</li>
          <li>Apunte al código QR impreso en la placa.</li>
          <li>La aplicación busca la placa dentro de la producción activa y muestra su serie, posición, servicio y caja.</li>
          <li>Pulse <strong className="text-foreground">Registrar reoperación</strong> o{' '}
            <strong className="text-foreground">Registrar recuperación</strong> según corresponda.</li>
          <li>Confirme los datos. El sistema guarda el movimiento y lo registra en el historial.</li>
        </ol>
        <p>
          Si una reoperación está pendiente y el operador tiene permiso, puede{' '}
          <strong className="text-foreground">cerrarla manualmente</strong> desde el mismo lector cuando
          la recuperación no se asocia automáticamente a un escaneo.
        </p>
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <p className="font-semibold">Cajas cerradas y reoperaciones</p>
          <p className="mt-1">
            Si escanea una placa cuya caja ya está cerrada, el lector muestra una advertencia y{' '}
            <strong>no permite registrar reoperaciones</strong> sobre esa placa. Esto evita registrar
            movimientos en cajas que ya se dieron por completadas. La verificación se realiza tanto al
            escanear como al buscar manualmente, y se vuelve a comprobar justo antes de guardar.
          </p>
        </div>
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm">
          <p className="font-semibold text-success">Cerrar cajas desde el lector</p>
          <p className="mt-1 text-muted-foreground">
            Junto a los botones de modo (Auto/Manual) y de reoperación por lote, encontrar el botón{' '}
            <strong className="text-foreground">Cerrar cajas</strong>. Al pulsarlo se abre un panel a
            pantalla completa, diseñado para teléfono y tablet, que le permite:
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-1 text-muted-foreground">
            <li>Seleccionar un servicio de la lista de tarjetas.</li>
            <li>Ver todas las cajas del servicio en una cuadrícula de tarjetas compactas, con su número, piezas, reoperaciones y pendientes.</li>
            <li>Cerrar una caja con un solo toque (botón verde <strong className="text-foreground">Cerrar</strong>), siempre que no tenga reoperaciones pendientes.</li>
            <li>Reabrir una caja cerrada con el botón <strong className="text-foreground">Reabrir</strong>.</li>
            <li>Las cajas con reoperaciones pendientes aparecen bloqueadas (en rojo) y no se pueden cerrar hasta resolverlas.</li>
            <li>Un resumen en la parte superior muestra cuántas cajas hay cerradas, bloqueadas y listas para cerrar.</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            Esta función usa la misma lógica de cierre que la sección de Cajas, por lo que el resultado es idéntico: ambas pantallas reflejan los cambios al instante.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Quitar reoperaciones</p>
          <p className="mt-1">
            Si una reoperación se registró por error, puede <strong className="text-foreground">quitarla</strong>{' '}
            desde el lector. Al escanear una placa que tiene reoperaciones, aparece la opcin de anular esas
            reoperaciones. Debe seleccionar un motivo (anotación errónea, proceso incorrecto, duplicado u otro).
            La anulación elimina la reoperación y queda registrada en el historial como{' '}
            <strong className="text-foreground">anulación de reoperación</strong>.
          </p>
          <p className="mt-1">
            Si la placa ya fue recuperada, sus reoperaciones no se pueden quitar, ya que el sistema
            impide anular reoperaciones que ya fueron resueltas.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'reoperaciones',
    title: 'Reoperaciones generales',
    icon: ClipboardList,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Muestra todas las reoperaciones registradas en la producción activa, en orden cronológico. Es la
          vista de detalle para revisar incidencias placa por placa.
        </p>
        <p>Permite filtrar por:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Serie, caja, servicio, proceso, estado y operador.</li>
          <li>Rango de fechas (inicial y final).</li>
        </ul>
        <p>Encima de la tabla aparecen cuatro indicadores. Es importante distinguir entre registros y placas:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong className="text-foreground">Registros de reoperación:</strong> cada vez que una placa fue enviada a reoperar. Si una misma placa se reoperó dos veces, suma dos registros.
          </li>
          <li>
            <strong className="text-foreground">Placas reoperadas:</strong> placas distintas que tienen al menos una reoperación, sin importar cuántas veces.
          </li>
          <li>
            <strong className="text-foreground">Placas pendientes:</strong> placas que tienen una reoperación sin resolver. Cada placa cuenta una sola vez, aunque tenga varios registros pendientes.
          </li>
          <li>
            <strong className="text-foreground">Placas recuperadas:</strong> placas distintas con una recuperación registrada.
          </li>
        </ul>
        <p>
          Los resultados se muestran en páginas de 50 registros. Si su rol lo permite, puede marcar una
          reoperación pendiente como recuperada directamente desde la lista.
        </p>
        <p>
          Los datos filtrados se pueden exportar a Excel y PDF con los botones de la esquina superior.
        </p>
      </div>
    ),
  },
  {
    id: 'cajas',
    title: 'Cajas con reoperaciones',
    icon: Package,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Esta pantalla agrupa las reoperaciones por <strong className="text-foreground">caja</strong>. Su
          objetivo es distinto al de Reoperaciones generales: aquí se trabaja a nivel de caja completa, no
          de placa individual.
        </p>
        <p>Para cada caja se muestra:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Servicio al que pertenece y número de caja.</li>
          <li>Series inicial y final.</li>
          <li>Cantidad de placas y de reoperaciones.</li>
          <li>Pendientes y estado (pendiente o completa).</li>
        </ul>
        <p>
          Puede buscar una caja concreta, filtrar por servicio o estado, abrir el detalle de una caja,
          marcarla como completada y reabrirla si es necesario. La paginación se realiza desde el servidor,
          lo que permite manejar miles de cajas sin lentitud. Toda la información visible se puede exportar.
        </p>
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Cerrar cajas desde el lector QR</p>
          <p className="mt-1">
            Además de esta pantalla, existe un panel de cierre rápido dentro del lector QR (botón{' '}
            <strong className="text-foreground">Cerrar cajas</strong>). Ese panel est optimizado para
            teléfono y tablet: muestra las cajas en tarjetas grandes con su estado y permite cerrar o
            reabrir con un solo toque. Ambas vías usan la misma lógica de cierre, por lo que lo que haga
            en una se refleja inmediatamente en la otra.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'servicios',
    title: 'Servicios',
    icon: Layers,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Agrupa la información operativa por <strong className="text-foreground">servicio</strong>. Cada
          servicio muestra cobertura, cajas implicadas, placas, reoperaciones, recuperadas, pendientes y su
          estado global. Es útil para comparar el comportamiento entre servicios de una misma producción.
        </p>
        <p>
          Los administradores acceden aquí también a las importaciones de cajas por series, incluyendo una
          vista previa del mapeo antes de aplicar los cambios definitivos.
        </p>
      </div>
    ),
  },
  {
    id: 'panel-control',
    title: 'Panel de control',
    icon: Gauge,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Es la vista resumida para supervisión y gerencia. Presenta métricas globales de la producción
          activa en tarjetas e indicadores visuales. Cada tarjeta muestra una explicación breve debajo de su
          número. Las principales son:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li><strong className="text-foreground">Placas con incidencias:</strong> placas con al menos una reoperación pendiente.</li>
          <li><strong className="text-foreground">Placas afectadas (histórico):</strong> placas distintas que alguna vez tuvieron reoperación, incluidas las ya recuperadas.</li>
          <li><strong className="text-foreground">Porcentaje de placas afectadas:</strong> placas afectadas (histórico) entre el total de placas.</li>
          <li><strong className="text-foreground">Reoperaciones pendientes:</strong> registros de reoperación sin resolver. Una placa puede tener más de uno.</li>
          <li><strong className="text-foreground">Cajas y servicios:</strong> cuántas cajas y servicios tienen pendientes o están completos.</li>
        </ul>
        <p>
          Estas cifras cuentan registros y placas de formas distintas; por eso no siempre coinciden con la
          pantalla de Reoperaciones generales, que muestra placas pendientes.
        </p>
        <p>
          Los datos se calculan mediante consultas agrupadas en el servidor, por lo que la pantalla se
          actualiza rápidamente incluso con producciones grandes. Está pensada para seguimiento, no para
          editar registros.
        </p>
      </div>
    ),
  },
  {
    id: 'historial',
    title: 'Historial',
    icon: History,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          El historial registra las acciones importantes del sistema en orden cronológico: reoperaciones,
          recuperaciones normales y manuales, importaciones, cambios de estado y ediciones de placas.
        </p>
        <p>Permite filtrar por tipo, modalidad, servicio, proceso, caja, serie, posición, operador y fechas.</p>
        <p>
          Encima de la tabla hay indicadores de reoperaciones, recuperaciones, manuales, normales y placas
          afectadas. Cada fila tiene un botón <strong className="text-foreground">Ver placa</strong> que abre
          una ventana con el historial completo de esa serie. Los resultados filtrados se pueden exportar.
        </p>
      </div>
    ),
  },
  {
    id: 'reportes',
    title: 'Reportes',
    icon: FileBarChart,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          La pantalla de Reportes presenta análisis calculados a partir de los registros guardados. Las
          tarjetas superiores muestran los indicadores principales. Debajo, cada sección es un acordeón que
          se abre al pulsar sobre su título.
        </p>
        <p>Las secciones disponibles son:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li><strong className="text-foreground">Resumen general por servicio:</strong> cajas, placas, reoperaciones, recuperadas, pendientes y participación de cada servicio.</li>
          <li><strong className="text-foreground">Reoperaciones por servicio y proceso:</strong> cantidad y pendientes por cada combinación.</li>
          <li><strong className="text-foreground">Recuperaciones por servicio:</strong> totales separados en manuales y normales.</li>
          <li><strong className="text-foreground">Estado de servicios:</strong> servicios con reoperaciones, cajas pendientes y completas.</li>
          <li><strong className="text-foreground">Estado de cajas:</strong> cajas con reoperaciones, paginadas de 50 en 50.</li>
          <li><strong className="text-foreground">Placas con más reoperaciones:</strong> las 10 placas con mayor cantidad.</li>
          <li><strong className="text-foreground">Evolución por fecha:</strong> reoperaciones y recuperaciones registradas cada día.</li>
          <li><strong className="text-foreground">Recuperaciones por operador:</strong> totales y manuales por operador.</li>
          <li><strong className="text-foreground">Distribución de incidencias:</strong> recuperaciones agrupadas por motivo.</li>
        </ul>
        <p>
          Cada sección incluye botones para exportar su contenido a Excel y PDF. La exportación incluye
          siempre todos los registros, aunque en pantalla se vea paginado.
        </p>
      </div>
    ),
  },
  {
    id: 'importaciones',
    title: 'Importaciones Excel',
    icon: Wrench,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Los administradores pueden importar información maestra desde archivos Excel. El proceso general es:
        </p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>Seleccione el archivo desde la sección de importaciones.</li>
          <li>El sistema lee sus hojas y columnas y valida el contenido.</li>
          <li>Revise los errores o advertencias antes de confirmar.</li>
          <li>La importación se aplica por lotes para no saturar el sistema.</li>
          <li>Se actualizan placas, servicios o cajas según el tipo de importación.</li>
          <li>Cada importación queda registrada con su fecha, usuario y errores.</li>
        </ol>
        <p>
          La importación de cajas por series incluye una <strong className="text-foreground">vista previa</strong>
          del mapeo de series a cajas antes de aplicar los cambios. Esto permite corregir rangos antes de
          que afecten a la producción.
        </p>
      </div>
    ),
  },
  {
    id: 'ajustes',
    title: 'Ajustes y administrador',
    icon: Settings,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          En Ajustes, el administrador puede cambiar su propia contraseña y configurar el comportamiento del
          lector QR. El Panel de administrador ofrece herramientas adicionales de gestión del sistema.
        </p>
        <p>
          Estas opciones solo están disponibles para el rol administrador. Operadores y gerentes no ven estas
          pantallas en su menú.
        </p>
      </div>
    ),
  },
  {
    id: 'logica',
    title: 'Lógica de negocio',
    icon: BookOpen,
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          El sistema sigue el flujo operativo real de una producción de placas:
        </p>
        <ol className="ml-4 list-decimal space-y-2">
          <li>El administrador crea una producción y define sus servicios.</li>
          <li>Se importa la información maestra: placas, servicios y asignación de cajas por series.</li>
          <li>Durante la producción, el operador escanea placas con el lector QR.</li>
          <li>Cada placa con incidencia genera una <strong className="text-foreground">reoperación</strong> en estado pendiente.</li>
          <li>Cuando la incidencia se resuelve, se registra una <strong className="text-foreground">recuperación</strong>, que cierra la reoperación correspondiente.</li>
          <li>El historial registra cada movimiento con fecha, usuario y detalle.</li>
          <li>Las cajas se siguen a nivel de grupo: una caja se marca completa cuando todas sus reoperaciones están resueltas. Una caja con reoperaciones pendientes no se puede cerrar; el sistema lo bloquea tanto en la pantalla de Cajas como en el panel de cierre del lector QR.</li>
          <li>Una vez cerrada una caja, no se pueden registrar nuevías reoperaciones sobre sus placas. El lector QR muestra una advertencia al escanear una placa de una caja cerrada y bloquea el registro.</li>
          <li>Si una reoperación se registró por error, se puede anular (quitar) seleccionando un motivo. La anulación queda registrada en el historial.</li>
          <li>Los reportes agrupan toda la información para análisis y exportación.</li>
        </ol>
        <p>
          Las relaciones entre pantallas son: la <strong className="text-foreground">producción activa</strong>
          es el alcance de todas las demás; el <strong className="text-foreground">lector QR</strong> alimenta
          las reoperaciones y recuperaciones; estas alimentan las cajas, los servicios, el panel de control,
          el historial y los reportes. Cambiar de producción cambia simultáneamente todos los datos visibles.
        </p>
        <p>
          La sincronización se basa en el número de versión de datos de cada producción. Cada operación o
          importación aumenta ese número. La aplicación lo consulta periódicamente y actualiza solo lo que
          cambió, evitando recargas innecesarias.
        </p>
      </div>
    ),
  },
];

export function ManualPage({ onNavigate }: ScreenProps) {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const active = SECTIONS.find((section) => section.id === activeId) ?? SECTIONS[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documentación"
        title="Manual de usuario"
        description="Guía paso a paso para utilizar el sistema: roles, pantallas, lógica de negocio y mejores prácticas."
      />

      <SelectedProductionBanner onNavigate={onNavigate} />

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Índice del manual" className="lg:sticky lg:top-6 lg:self-start">
          <ul className="space-y-1 rounded-2xl border border-border bg-card p-3 shadow-sm">
            {SECTIONS.map((section) => {
              const isActive = section.id === activeId;
              const Icon = section.icon;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(section.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent' : 'text-muted-foreground'}`} />
                    <span className="truncate">{section.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <header className="mb-6 flex items-center gap-3 border-b border-border pb-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <active.icon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-semibold text-foreground">{active.title}</h2>
              <p className="text-sm text-muted-foreground">Sección {SECTIONS.findIndex((s) => s.id === active.id) + 1} de {SECTIONS.length}</p>
            </div>
          </header>
          <div className="manual-body">{active.body}</div>

          <footer className="mt-8 flex items-center justify-between border-t border-border pt-5">
            <button
              type="button"
              onClick={() => {
                const index = SECTIONS.findIndex((s) => s.id === activeId);
                if (index > 0) setActiveId(SECTIONS[index - 1].id);
              }}
              disabled={SECTIONS.findIndex((s) => s.id === activeId) === 0}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => {
                const index = SECTIONS.findIndex((s) => s.id === activeId);
                if (index < SECTIONS.length - 1) setActiveId(SECTIONS[index + 1].id);
              }}
              disabled={SECTIONS.findIndex((s) => s.id === activeId) === SECTIONS.length - 1}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </footer>
        </article>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Layers, Boxes, Clock, AlertTriangle, CheckCircle2, RotateCcw, FileText, Inbox } from 'lucide-react';
import { SelectedProductionBanner } from '@/components/productions/SelectedProductionBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { DonutChart } from '@/components/metrics/DonutChart';
import { MetricStat } from '@/components/metrics/BoxDetailModal';
import { BoxManagementPanel } from '@/components/metrics/BoxManagementPanel';
import { OperationStatusBadge, SERVICE_STATUS_LABELS } from '@/components/metrics/OperationStatusBadge';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useAuth } from '@/context/AuthContext';
import { useProductions } from '@/hooks/useProductions';
import { ExportMenu } from '@/components/export/ExportMenu';
import { exportExcel, exportPdf, type ExportMeta } from '@/lib/exportFiles';
import { SERVICE_EXPORT_COLUMNS } from '@/lib/operationExportColumns';
import { productionDisplayLabel } from '@/types/domain';
import { useProductionMetrics } from '@/hooks/useProductionMetrics';
import { DataUpdatedAlert } from '@/components/import/DataUpdatedAlert';
import { PageLoader } from '@/components/ui/PageLoader';
import type { MetricStatus, ServiceMetrics } from '@/lib/operationMetrics';
import { getServiceParcialidadInfo, type ServiceParcialidadInfo } from '@/services/operationService';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

type EstadoFilter = 'todos' | 'sin_asignar' | MetricStatus;
type PanelEstadoFilter = 'todos' | MetricStatus;

const ESTADO_OPTIONS: { value: EstadoFilter; label: string }[] = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'con_reoperaciones', label: 'Con reoperaciones' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'completada', label: 'Completada' },
  { value: 'completada_ro', label: 'Completada RO' },
  { value: 'sin_asignar', label: 'Sin asignar' },
];

const KPI_CARDS: { estado: MetricStatus; label: string; Icon: typeof Clock; tone: string }[] = [
  { estado: 'en_proceso', label: 'En proceso', Icon: Clock, tone: 'border-warning/20 bg-warning/5 text-warning' },
  { estado: 'con_reoperaciones', label: 'Con reoperaciones', Icon: AlertTriangle, tone: 'border-destructive/20 bg-destructive/5 text-destructive' },
  { estado: 'completada_ro', label: 'Completadas RO', Icon: RotateCcw, tone: 'border-accent/20 bg-accent/5 text-accent' },
  { estado: 'completada', label: 'Completadas', Icon: CheckCircle2, tone: 'border-success/20 bg-success/5 text-success' },
];

function isSinAsignar(service: ServiceMetrics): boolean {
  return service.boxes.every((box) => !box.caja);
}

export function ServicesPage({ onNavigate }: ScreenProps) {
  const { operatorName, selectedProductionId } = useProductionSelection();
  const { services: serverServices, loading, error, dataVersion, reload } = useProductionMetrics(selectedProductionId);

  const handleRefreshData = () => {
    void reload();
  };
  const { profile, session } = useAuth();
  const { productions } = useProductions();
  const [servicioFilter, setServicioFilter] = useState<string>('todos');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('todos');
  const [openServicio, setOpenServicio] = useState<string | null>(null);
  const [panelService, setPanelService] = useState<string | null>(null);
  const [panelEstado, setPanelEstado] = useState<PanelEstadoFilter>('todos');

  const services = serverServices;

  const visibleServices = services.filter((s) => {
    if (servicioFilter !== 'todos' && s.servicio !== servicioFilter) return false;
    if (estadoFilter === 'sin_asignar') return isSinAsignar(s);
    if (isSinAsignar(s)) return false;
    return estadoFilter === 'todos' || s.estado === estadoFilter;
  });

  const selectedProduction = productions.find((p) => p.id === selectedProductionId) ?? null;
  const produccionLabel = selectedProduction ? productionDisplayLabel(selectedProduction) : '—';
  const usuario = operatorName ?? profile?.full_name ?? session?.user.email ?? '—';
  const serviciosMeta: ExportMeta = {
    title: 'Servicios',
    fileBase: 'servicios',
    produccion: produccionLabel,
    usuario,
    filtros: [
      ...(servicioFilter === 'todos' ? [] : [`Servicio ${servicioFilter}`]),
      ...(estadoFilter === 'todos' ? [] : [`Estado ${ESTADO_OPTIONS.find((o) => o.value === estadoFilter)?.label ?? ''}`]),
    ],
  };

  function openPanel(servicio: string, estado: PanelEstadoFilter) {
    setPanelService(servicio);
    setPanelEstado(estado);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gerencia"
        title="Servicios"
        description="Avance de reoperaciones y recuperaciones por servicio de la producción activa."
        actions={
          <ExportMenu
            disabled={visibleServices.length === 0}
            onExcel={() => exportExcel(serviciosMeta, SERVICE_EXPORT_COLUMNS, visibleServices)}
            onPdf={() => exportPdf(serviciosMeta, SERVICE_EXPORT_COLUMNS, visibleServices)}
          />
        }
      />

      <SelectedProductionBanner onNavigate={onNavigate} />

      <DataUpdatedAlert produccionId={selectedProductionId} loadedVersion={dataVersion} onRefresh={handleRefreshData} />

      <PageLoader loading={loading} error={error} onRetry={handleRefreshData} hasData={services.length > 0}>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Servicio
            <select
              value={servicioFilter}
              onChange={(e) => setServicioFilter(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal normal-case text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              <option value="todos">Todos los servicios</option>
              {services.map((s) => (
                <option key={s.servicio} value={s.servicio}>
                  {s.servicio}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estado
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value as EstadoFilter)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal normal-case text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {ESTADO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {services.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center text-sm text-muted-foreground">
            Esta producción aún no tiene placas importadas.
          </div>
        ) : visibleServices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center text-sm text-muted-foreground">
            Ningún servicio coincide con los filtros seleccionados.
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleServices.map((service) => (
              <ServiceAccordionItem
                key={service.servicio}
                service={service}
                produccionId={selectedProductionId}
                isOpen={openServicio === service.servicio}
                onToggle={() => setOpenServicio((current) => (current === service.servicio ? null : service.servicio))}
                onOpenPanel={openPanel}
              />
            ))}
          </ul>
        )}
      </PageLoader>

      {panelService && selectedProductionId && (
        <BoxManagementPanel
          open={!!panelService}
          onClose={() => setPanelService(null)}
          servicio={panelService}
          produccionId={selectedProductionId}
          initialEstado={panelEstado}
          onChanged={() => void reload()}
        />
      )}
    </div>
  );
}

interface ServiceAccordionItemProps {
  service: ServiceMetrics;
  produccionId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onOpenPanel: (servicio: string, estado: PanelEstadoFilter) => void;
}

function ServiceAccordionItem({ service, produccionId, isOpen, onToggle, onOpenPanel }: ServiceAccordionItemProps) {
  const panelId = `servicio-panel-${service.servicio.replace(/\s+/g, '-')}`;
  const sinAsignar = isSinAsignar(service);
  const [parcialidad, setParcialidad] = useState<ServiceParcialidadInfo | null>(null);
  const counts: Record<MetricStatus, number> = {
    en_proceso: service.cajasEnProceso ?? 0,
    con_reoperaciones: service.cajasConReoperaciones ?? 0,
    completada: (service.cajasCompletas ?? 0) - (service.cajasCompletadasRo ?? 0),
    completada_ro: service.cajasCompletadasRo ?? 0,
  };

  useEffect(() => {
    if (!isOpen || !produccionId) return;
    let active = true;
    getServiceParcialidadInfo(produccionId, service.servicio).then((info) => {
      if (active) setParcialidad(info);
    });
    return () => {
      active = false;
    };
  }, [isOpen, produccionId, service.servicio]);

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full flex-col gap-4 p-5 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-4">
          <DonutChart percent={service.porcentajeRecuperacion} size={64} label={`Recuperación de ${service.servicio}`} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-primary">
              <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{service.servicio}</span>
            </p>
            <div className="mt-1">
              {sinAsignar ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
                  Sin asignar
                </span>
              ) : (
                <OperationStatusBadge status={service.estado} labels={SERVICE_STATUS_LABELS} />
              )}
            </div>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <MetricStat label="Tipo" value={service.tipoServicio} />
          <MetricStat label="Series" value={service.series} />
          <MetricStat label="Placas físicas" value={service.placas} />
          <MetricStat label="Cajas" value={service.cajas} />
          <MetricStat label="Reoperaciones" value={service.reoperaciones} />
          <MetricStat label="Recuperaciones" value={service.recuperaciones} />
          <MetricStat label="Pendientes" value={service.pendientes} />
        </div>
        <ChevronDown
          className={`hidden h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 sm:block ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-5 border-t border-border bg-muted/50 p-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {KPI_CARDS.map(({ estado, label, Icon, tone }) => (
                <button
                  key={estado}
                  type="button"
                  onClick={() => onOpenPanel(service.servicio, estado)}
                  className={`group flex flex-col items-start gap-2 rounded-xl border p-4 text-left shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${tone}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</span>
                  </div>
                  <span className="text-3xl font-bold tabular-nums">{counts[estado]}</span>
                  <span className="text-xs opacity-70 transition-opacity group-hover:opacity-100">Ver cajas →</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <MetricStat label="Total de placas" value={service.placas} />
              <MetricStat label="Total de cajas" value={service.cajas} />
              <MetricStat label="Placas afectadas" value={service.placasAfectadas} />
              <MetricStat label="Porcentaje de recuperación" value={`${service.porcentajeRecuperacion}%`} />
            </div>

            {parcialidad && (
              <div className={`grid grid-cols-2 gap-4 rounded-xl border p-4 text-sm sm:grid-cols-4 ${parcialidad.es_completo ? 'border-success/30 bg-success/10' : 'border-warning/40 bg-warning/10'}`}>
                <MetricStat label="Parcialidades" value={parcialidad.total_parcialidades} />
                <MetricStat label="Cajas asignadas" value={parcialidad.total_cajas_asignadas} />
                <MetricStat label="Placas asignadas" value={`${parcialidad.total_placas_asignadas} de ${parcialidad.total_placas_servicio}`} />
                <MetricStat label="Placas faltantes" value={parcialidad.placas_faltantes} />
              </div>
            )}

            <button
              type="button"
              onClick={() => onOpenPanel(service.servicio, 'todos')}
              className="inline-flex items-center gap-2 text-sm font-semibold text-accent transition-colors hover:text-accent/80"
            >
              <FileText className="h-4 w-4" />
              Informe de estado de todas las cajas
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

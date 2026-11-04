import { AlertCircle, CheckCircle2, Package, RotateCcw, Users, Wrench } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { SelectedProductionBanner } from '@/components/productions/SelectedProductionBanner';
import { DataUpdatedAlert } from '@/components/import/DataUpdatedAlert';
import { ExportMenu } from '@/components/export/ExportMenu';
import { ReportSection } from '@/components/reports/ReportSection';
import { HorizontalBars } from '@/components/reports/HorizontalBars';
import { OperationStatusBadge, BOX_STATUS_LABELS, SERVICE_STATUS_LABELS } from '@/components/metrics/OperationStatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductionMetrics } from '@/hooks/useProductionMetrics';
import { fetchReportData } from '@/services/metricsService';
import { useVersionedData } from '@/hooks/useVersionedData';
import { useProductions } from '@/hooks/useProductions';
import { exportExcel, exportPdf, type ExportChart, type ExportColumn, type ExportMeta } from '@/lib/exportFiles';
import type { EstadoRow, EvolucionRow, MotivoRow, RecupOperadorRow, RecupServicioRow, ReopServicioProcesoRow, ServicioGeneralRow, TopPlacaRow } from '@/lib/reportMetrics';
import type { ServiceMetrics } from '@/lib/operationMetrics';
import { SERVICE_EXPORT_COLUMNS } from '@/lib/operationExportColumns';
import { productionDisplayLabel } from '@/types/domain';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

const REOP_PROCESO_COLUMNS: ExportColumn<ReopServicioProcesoRow>[] = [
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Proceso', value: (r) => r.proceso },
  { header: 'Reoperaciones', value: (r) => r.total },
  { header: 'Pendientes', value: (r) => r.pendientes },
];

const SERVICIO_GENERAL_COLUMNS: ExportColumn<ServicioGeneralRow>[] = [
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Tipo', value: (r) => r.tipoServicio },
  { header: 'Series', value: (r) => r.series },
  { header: 'Cajas', value: (r) => r.cajas },
  { header: 'Placas físicas', value: (r) => r.placas },
  { header: 'Reoperaciones', value: (r) => r.reoperaciones },
  { header: 'Recuperadas', value: (r) => r.recuperadas },
  { header: 'Pendientes', value: (r) => r.pendientes },
  { header: 'Recuperaciones registradas', value: (r) => r.recuperaciones },
  { header: '% del total', value: (r) => `${r.porcentajeTotal}%` },
];

const RECUP_SERVICIO_COLUMNS: ExportColumn<RecupServicioRow>[] = [
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Recuperaciones', value: (r) => r.total },
  { header: 'Manuales', value: (r) => r.manuales },
  { header: 'Normales', value: (r) => r.normales },
];

const CAJA_ESTADO_COLUMNS: ExportColumn<EstadoRow>[] = [
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Caja', value: (r) => r.caja },
  { header: 'Reoperaciones', value: (r) => r.reoperaciones },
  { header: 'Pendientes', value: (r) => r.pendientes },
  { header: 'Estado', value: (r) => BOX_STATUS_LABELS[r.estado] },
];

const TOP_PLACAS_COLUMNS: ExportColumn<TopPlacaRow>[] = [
  { header: 'Serie', value: (r) => r.serie },
  { header: 'Posición', value: (r) => r.posicion },
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Caja', value: (r) => r.caja },
  { header: 'Reoperaciones', value: (r) => r.reoperaciones },
  { header: 'Pendientes', value: (r) => r.pendientes },
];

const EVOLUCION_COLUMNS: ExportColumn<EvolucionRow>[] = [
  { header: 'Fecha', value: (r) => r.fecha },
  { header: 'Reoperaciones', value: (r) => r.reoperaciones },
  { header: 'Recuperaciones', value: (r) => r.recuperaciones },
];

const OPERADOR_COLUMNS: ExportColumn<RecupOperadorRow>[] = [
  { header: 'Operador', value: (r) => r.operador },
  { header: 'Recuperaciones', value: (r) => r.total },
  { header: 'Manuales', value: (r) => r.manuales },
];

const MOTIVO_COLUMNS: ExportColumn<MotivoRow>[] = [
  { header: 'Motivo', value: (r) => r.motivo },
  { header: 'Total', value: (r) => r.total },
];

export function ReportsPage({ onNavigate }: ScreenProps) {
  const { profile, session } = useAuth();
  const { operatorName, selectedProductionId } = useProductionSelection();
  const { productions } = useProductions();
  const { metrics, services, loading: metricsLoading, error: metricsError, dataVersion: metricsVersion, reload: reloadMetrics } = useProductionMetrics(selectedProductionId);
  const { data: reportData, version: reportVersion, loading: reportLoading, error: reportError, reload: reloadReport } = useVersionedData(
    'report',
    selectedProductionId,
    fetchReportData,
    'No se pudieron cargar los reportes.',
  );
  const loadedVersion = metricsVersion !== null && reportVersion !== null ? Math.min(metricsVersion, reportVersion) : null;

  const handleRefreshData = () => {
    void reloadMetrics();
    void reloadReport();
  };

  const servicioGeneralRows = reportData?.servicioGeneral ?? [];
  const reopProceso = reportData?.reopsByServicioProceso ?? [];
  const recupServicio = reportData?.recupsByServicio ?? [];
  const cajas = reportData?.estadoCajas ?? [];
  const top = reportData?.topPlacas ?? [];
  const evolucion = reportData?.evolucion ?? [];
  const operadores = reportData?.recupsPorOperador ?? [];
  const motivos = reportData?.incidenciasPorMotivo ?? [];

  const selected = productions.find((item) => item.id === selectedProductionId) ?? null;
  const produccionLabel = selected ? productionDisplayLabel(selected) : '—';
  const usuario = operatorName ?? profile?.full_name ?? session?.user.email ?? '—';
  const loading = metricsLoading || reportLoading;
  const error = metricsError ?? reportError;
  const hasData = reopProceso.length > 0 || recupServicio.length > 0;

  const buildMeta = (title: string, fileBase: string, charts?: ExportChart[]): ExportMeta => ({
    title,
    fileBase,
    produccion: produccionLabel,
    usuario,
    filtros: [],
    charts,
  });

  const exportMenu = <T,>(
    title: string,
    fileBase: string,
    columns: ExportColumn<T>[],
    rows: T[],
    charts?: ExportChart[],
  ) => (
    <ExportMenu
      disabled={rows.length === 0}
      onExcel={() => exportExcel(buildMeta(title, fileBase), columns, rows)}
      onPdf={() => exportPdf(buildMeta(title, fileBase, charts), columns, rows)}
    />
  );

  const tableEmpty = { emptyTitle: 'Sin registros', emptyDescription: 'No hay datos suficientes para este reporte todavía.' };

  const reopProcesoColumns: DataTableColumn<ReopServicioProcesoRow>[] = [
    { header: 'Servicio', cell: (r) => r.servicio },
    { header: 'Proceso', cell: (r) => r.proceso },
    { header: 'Reoperaciones', cell: (r) => <span className="tabular-nums">{r.total}</span> },
    { header: 'Pendientes', cell: (r) => <span className="tabular-nums">{r.pendientes}</span> },
  ];
  const recupColumns: DataTableColumn<RecupServicioRow>[] = [
    { header: 'Servicio', cell: (r) => r.servicio },
    { header: 'Recuperaciones', cell: (r) => <span className="tabular-nums">{r.total}</span> },
    { header: 'Manuales', cell: (r) => <span className="tabular-nums">{r.manuales}</span> },
    { header: 'Normales', cell: (r) => <span className="tabular-nums">{r.normales}</span> },
  ];
  const servicioColumns: DataTableColumn<ServiceMetrics>[] = [
    { header: 'Servicio', cell: (s) => s.servicio },
    { header: 'Cajas con reoperaciones', cell: (s) => <span className="tabular-nums">{s.cajasConReoperaciones}</span> },
    { header: 'Cajas pendientes', cell: (s) => <span className="tabular-nums">{s.cajasPendientes}</span> },
    { header: 'Cajas completas', cell: (s) => <span className="tabular-nums">{s.cajasCompletas}</span> },
    { header: 'Estado', cell: (s) => <OperationStatusBadge status={s.estado} labels={SERVICE_STATUS_LABELS} /> },
  ];
  const cajaColumns: DataTableColumn<EstadoRow>[] = [
    { header: 'Servicio', cell: (r) => r.servicio },
    { header: 'Caja', cell: (r) => <span className="font-mono">{r.caja}</span> },
    { header: 'Reoperaciones', cell: (r) => <span className="tabular-nums">{r.reoperaciones}</span> },
    { header: 'Pendientes', cell: (r) => <span className="tabular-nums">{r.pendientes}</span> },
    { header: 'Estado', cell: (r) => <OperationStatusBadge status={r.estado} labels={BOX_STATUS_LABELS} /> },
  ];
  const topColumns: DataTableColumn<TopPlacaRow>[] = [
    { header: 'Serie', cell: (r) => <span className="font-mono">{r.serie}</span> },
    { header: 'Posición', cell: (r) => r.posicion },
    { header: 'Servicio', cell: (r) => r.servicio },
    { header: 'Caja', cell: (r) => <span className="font-mono">{r.caja}</span> },
    { header: 'Reoperaciones', cell: (r) => <span className="tabular-nums">{r.reoperaciones}</span> },
    { header: 'Pendientes', cell: (r) => <span className="tabular-nums">{r.pendientes}</span> },
  ];
  const evolucionColumns: DataTableColumn<EvolucionRow>[] = [
    { header: 'Fecha', cell: (r) => r.fecha },
    { header: 'Reoperaciones', cell: (r) => <span className="tabular-nums">{r.reoperaciones}</span> },
    { header: 'Recuperaciones', cell: (r) => <span className="tabular-nums">{r.recuperaciones}</span> },
  ];
  const operadorColumns: DataTableColumn<RecupOperadorRow>[] = [
    { header: 'Operador', cell: (r) => r.operador },
    { header: 'Recuperaciones', cell: (r) => <span className="tabular-nums">{r.total}</span> },
    { header: 'Manuales', cell: (r) => <span className="tabular-nums">{r.manuales}</span> },
  ];
  const motivoColumns: DataTableColumn<MotivoRow>[] = [
    { header: 'Motivo', cell: (r) => r.motivo },
    { header: 'Total', cell: (r) => <span className="tabular-nums">{r.total}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Análisis"
        title="Reportes"
        description="Reportes de la producción seleccionada, calculados a partir de los registros guardados."
      />

      <SelectedProductionBanner onNavigate={onNavigate} />

      <DataUpdatedAlert produccionId={selectedProductionId} loadedVersion={loadedVersion} onRefresh={handleRefreshData} />

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !hasData && (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          Aún no hay reoperaciones ni recuperaciones registradas en esta producción. Los reportes aparecerán cuando existan datos.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={RotateCcw} label="Reoperaciones" value={metrics.totalReoperaciones} tone="amber" />
        <KpiCard icon={AlertCircle} label="Pendientes" value={metrics.reoperacionesPendientes} tone="red" />
        <KpiCard icon={CheckCircle2} label="Recuperaciones" value={metrics.totalRecuperaciones} tone="emerald" />
        <KpiCard icon={Users} label="Placas afectadas" value={metrics.placasAfectadas} tone="navy" />
        <KpiCard icon={Package} label="Cajas pendientes" value={metrics.cajasPendientes} tone="red" />
        <KpiCard icon={Wrench} label="Servicios completos" value={metrics.serviciosCompletos} tone="emerald" />
      </div>

      <ReportSection
        title="Resumen general por servicio"
        description="Cajas, placas, reoperaciones, recuperadas, pendientes y participación de cada servicio."
        actions={exportMenu(
          'Resumen general por servicio',
          'resumen-general-servicios',
          SERVICIO_GENERAL_COLUMNS,
          servicioGeneralRows,
          [{ title: 'Reoperaciones por servicio', items: servicioGeneralRows.map((r) => ({ label: r.servicio, value: r.reoperaciones })) }],
        )}
      >
        <div className="mb-6 rounded-xl border border-border bg-muted/50 p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary">Reoperaciones registradas por servicio</h3>
          <HorizontalBars items={servicioGeneralRows.map((r) => ({ label: r.servicio, value: r.reoperaciones }))} />
        </div>
        <DataTable
          columns={[
            { header: 'Servicio', cell: (r: ServicioGeneralRow) => r.servicio },
            { header: 'Tipo', cell: (r: ServicioGeneralRow) => <span className="font-semibold text-primary">{r.tipoServicio}</span> },
            { header: 'Series', cell: (r: ServicioGeneralRow) => <span className="tabular-nums">{r.series}</span> },
            { header: 'Cajas', cell: (r: ServicioGeneralRow) => <span className="tabular-nums">{r.cajas}</span> },
            { header: 'Placas físicas', cell: (r: ServicioGeneralRow) => <span className="tabular-nums">{r.placas}</span> },
            { header: 'Reoperaciones', cell: (r: ServicioGeneralRow) => <span className="tabular-nums">{r.reoperaciones}</span> },
            { header: 'Recuperadas', cell: (r: ServicioGeneralRow) => <span className="tabular-nums text-success">{r.recuperadas}</span> },
            { header: 'Pendientes', cell: (r: ServicioGeneralRow) => <span className="tabular-nums text-warning">{r.pendientes}</span> },
            { header: 'Recuperaciones', cell: (r: ServicioGeneralRow) => <span className="tabular-nums">{r.recuperaciones}</span> },
            { header: '% del total', cell: (r: ServicioGeneralRow) => <span className="font-semibold tabular-nums">{r.porcentajeTotal}%</span> },
          ]}
          rows={servicioGeneralRows}
          getRowKey={(r) => r.servicio}
          {...tableEmpty}
        />
      </ReportSection>

      <ReportSection
        title="Reoperaciones por servicio y proceso"
        description="Cantidad de reoperaciones y pendientes para cada combinación de servicio y proceso."
        actions={exportMenu('Reoperaciones por servicio y proceso', 'reop-servicio-proceso', REOP_PROCESO_COLUMNS, reopProceso)}
      >
        <DataTable columns={reopProcesoColumns} rows={reopProceso} getRowKey={(r) => `${r.servicio}-${r.proceso}`} {...tableEmpty} />
      </ReportSection>

      <ReportSection
        title="Recuperaciones por servicio"
        description="Recuperaciones registradas por servicio, separando las manuales de las normales."
        actions={exportMenu(
          'Recuperaciones por servicio',
          'recuperaciones-servicio',
          RECUP_SERVICIO_COLUMNS,
          recupServicio,
          [{ title: 'Recuperaciones por servicio', items: recupServicio.map((r) => ({ label: r.servicio, value: r.total })) }],
        )}
      >
        <HorizontalBars items={recupServicio.map((r) => ({ label: r.servicio, value: r.total }))} />
        <DataTable columns={recupColumns} rows={recupServicio} getRowKey={(r) => r.servicio} {...tableEmpty} />
      </ReportSection>

      <ReportSection
        title="Estado de servicios"
        description="Servicios con reoperaciones, cajas pendientes y cajas completas. Se calcula automáticamente."
        actions={exportMenu('Estado de servicios', 'estado-servicios', SERVICE_EXPORT_COLUMNS, services)}
      >
        <DataTable columns={servicioColumns} rows={services} getRowKey={(s) => s.servicio} {...tableEmpty} />
      </ReportSection>

      <ReportSection
        title="Estado de cajas"
        description="Cajas con reoperaciones, indicando si están pendientes o completas."
        actions={exportMenu('Estado de cajas', 'estado-cajas', CAJA_ESTADO_COLUMNS, cajas)}
      >
        <DataTable columns={cajaColumns} rows={cajas} getRowKey={(r) => `${r.servicio}-${r.caja}`} {...tableEmpty} />
      </ReportSection>

      <ReportSection
        title="Placas con más reoperaciones"
        description="Las 10 placas con mayor cantidad de reoperaciones."
        actions={exportMenu(
          'Placas con más reoperaciones',
          'placas-mas-reoperadas',
          TOP_PLACAS_COLUMNS,
          top,
          [{ title: 'Reoperaciones por placa', items: top.map((r) => ({ label: r.serie, value: r.reoperaciones })) }],
        )}
      >
        <DataTable columns={topColumns} rows={top} getRowKey={(r) => r.serie} {...tableEmpty} />
      </ReportSection>

      <ReportSection
        title="Evolución por fecha"
        description="Reoperaciones y recuperaciones registradas cada día."
        actions={exportMenu('Evolución por fecha', 'evolucion-fecha', EVOLUCION_COLUMNS, evolucion)}
      >
        <DataTable columns={evolucionColumns} rows={evolucion} getRowKey={(r) => r.fecha} {...tableEmpty} />
      </ReportSection>

      <ReportSection
        title="Recuperaciones por operador"
        description="Recuperaciones registradas por cada operador, con sus manuales."
        actions={exportMenu(
          'Recuperaciones por operador',
          'recuperaciones-operador',
          OPERADOR_COLUMNS,
          operadores,
          [{ title: 'Recuperaciones por operador', items: operadores.map((r) => ({ label: r.operador, value: r.total })) }],
        )}
      >
        <DataTable columns={operadorColumns} rows={operadores} getRowKey={(r) => r.operador} {...tableEmpty} />
      </ReportSection>

      <ReportSection
        title="Distribución de incidencias"
        description="Recuperaciones agrupadas por motivo registrado."
        actions={exportMenu(
          'Distribución de incidencias',
          'incidencias-motivo',
          MOTIVO_COLUMNS,
          motivos,
          [{ title: 'Incidencias por motivo', items: motivos.map((r) => ({ label: r.motivo, value: r.total })) }],
        )}
      >
        <HorizontalBars items={motivos.map((r) => ({ label: r.motivo, value: r.total }))} />
        <DataTable columns={motivoColumns} rows={motivos} getRowKey={(r) => r.motivo} {...tableEmpty} />
      </ReportSection>
    </div>
  );
}

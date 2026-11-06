import { AlertCircle, CheckCircle2, Layers, Loader2, Package, RotateCcw, Users } from 'lucide-react';
import { useState } from 'react';
import { AnalyticsUpdateAlert } from '@/components/analytics/AnalyticsUpdateAlert';
import { ExportMenu } from '@/components/export/ExportMenu';
import { OperationStatusBadge, BOX_STATUS_LABELS } from '@/components/metrics/OperationStatusBadge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { HorizontalBars } from '@/components/reports/HorizontalBars';
import { ReportSection } from '@/components/reports/ReportSection';
import { useAuth } from '@/context/AuthContext';
import { useActiveProductionsAnalytics } from '@/hooks/useActiveProductionsAnalytics';
import type { ComparisonRow, EstadoCajaGlobal, ProcesoDistribucionRow } from '@/lib/activeAnalytics';
import { exportExcel, exportPdf, type ExportChart, type ExportColumn, type ExportMeta } from '@/lib/exportFiles';
import { formatPercent } from '@/lib/percentFormat';
import type { ReportData } from '@/services/metricsService';

type ServicioRow = ReportData['servicioGeneral'][number];
type ReopProcesoRow = ReportData['reopsByServicioProceso'][number];
type RecupServicioRow = ReportData['recupsByServicio'][number];
type EvolucionRow = ReportData['evolucion'][number];

const CAJAS_PAGE_SIZE = 50;

const COMPARISON_COLUMNS: ExportColumn<ComparisonRow>[] = [
  { header: 'Producción', value: (r) => r.produccion },
  { header: 'Placas', value: (r) => r.totalPlacas },
  { header: 'Placas afectadas', value: (r) => r.placasAfectadas },
  { header: 'Reoperaciones', value: (r) => r.totalReoperaciones },
  { header: 'Pendientes', value: (r) => r.reoperacionesPendientes },
  { header: 'Recuperaciones', value: (r) => r.totalRecuperaciones },
  { header: 'Cajas pendientes', value: (r) => r.cajasPendientes },
  { header: '% de reoperaciones', value: (r) => formatPercent(r.porcentajeReoperaciones) },
];

const PROCESO_COLUMNS: ExportColumn<ProcesoDistribucionRow>[] = [
  { header: 'Proceso', value: (r) => r.proceso },
  { header: 'Reoperaciones', value: (r) => r.total },
  { header: '% de placas con reoperación', value: (r) => formatPercent(r.porcentaje) },
];

const SERVICIO_COLUMNS: ExportColumn<ServicioRow>[] = [
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Tipo', value: (r) => r.tipoServicio },
  { header: 'Series', value: (r) => r.series },
  { header: 'Cajas', value: (r) => r.cajas },
  { header: 'Placas físicas', value: (r) => r.placas },
  { header: 'Reoperaciones', value: (r) => r.reoperaciones },
  { header: 'Recuperadas', value: (r) => r.recuperadas },
  { header: 'Pendientes', value: (r) => r.pendientes },
  { header: 'Recuperaciones registradas', value: (r) => r.recuperaciones },
  { header: '% del total', value: (r) => formatPercent(r.porcentajeTotal) },
];

const REOP_PROCESO_COLUMNS: ExportColumn<ReopProcesoRow>[] = [
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Proceso', value: (r) => r.proceso },
  { header: 'Reoperaciones', value: (r) => r.total },
  { header: 'Pendientes', value: (r) => r.pendientes },
];

const RECUP_SERVICIO_COLUMNS: ExportColumn<RecupServicioRow>[] = [
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Recuperaciones', value: (r) => r.total },
  { header: 'Manuales', value: (r) => r.manuales },
  { header: 'Normales', value: (r) => r.normales },
];

const CAJA_COLUMNS: ExportColumn<EstadoCajaGlobal>[] = [
  { header: 'Producción', value: (r) => r.produccion },
  { header: 'Servicio', value: (r) => r.servicio },
  { header: 'Caja', value: (r) => r.caja },
  { header: 'Reoperaciones', value: (r) => r.reoperaciones },
  { header: 'Pendientes', value: (r) => r.pendientes },
  { header: 'Estado', value: (r) => BOX_STATUS_LABELS[r.estado] },
];

const EVOLUCION_COLUMNS: ExportColumn<EvolucionRow>[] = [
  { header: 'Fecha', value: (r) => r.fecha },
  { header: 'Reoperaciones', value: (r) => r.reoperaciones },
  { header: 'Recuperaciones', value: (r) => r.recuperaciones },
];

const TABLE_EMPTY = { emptyTitle: 'Sin registros', emptyDescription: 'No hay datos suficientes para este reporte todavía.' };

export function ActiveAnalyticsPage() {
  const { profile, session } = useAuth();
  const { data, loading, error, hasNewData, reload } = useActiveProductionsAnalytics();
  const [cajasPage, setCajasPage] = useState(1);

  const totals = data?.totals ?? null;
  const productionCount = data?.productionCount ?? 0;
  const comparison = data?.comparison ?? [];
  const distribucionProcesos = data?.distribucionProcesos ?? [];
  const servicios = data?.servicioGeneral ?? [];
  const reopProceso = data?.reopsByServicioProceso ?? [];
  const recupServicio = data?.recupsByServicio ?? [];
  const cajas = data?.estadoCajas ?? [];
  const evolucion = data?.evolucion ?? [];

  const cajasTotalPages = Math.max(1, Math.ceil(cajas.length / CAJAS_PAGE_SIZE));
  const cajasCurrentPage = Math.min(cajasPage, cajasTotalPages);
  const cajasStart = cajas.length === 0 ? 0 : (cajasCurrentPage - 1) * CAJAS_PAGE_SIZE + 1;
  const cajasEnd = Math.min(cajasCurrentPage * CAJAS_PAGE_SIZE, cajas.length);
  const cajasPageRows = cajas.slice((cajasCurrentPage - 1) * CAJAS_PAGE_SIZE, cajasCurrentPage * CAJAS_PAGE_SIZE);

  const usuario = profile?.full_name ?? session?.user.email ?? '—';
  const produccionLabel = `Análisis global · ${productionCount} ${productionCount === 1 ? 'producción activa' : 'producciones activas'}`;

  const buildMeta = (title: string, fileBase: string, charts?: ExportChart[]): ExportMeta => ({
    title,
    fileBase,
    produccion: produccionLabel,
    usuario,
    filtros: comparison.length > 0 ? [`Producciones: ${comparison.map((c) => c.produccion).join(', ')}`] : [],
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
      onExcel={() => exportExcel(buildMeta(title, fileBase, charts), columns, rows)}
      onPdf={() => exportPdf(buildMeta(title, fileBase, charts), columns, rows)}
    />
  );

  const comparisonColumns: DataTableColumn<ComparisonRow>[] = [
    { header: 'Producción', cell: (r) => <span className="font-semibold text-primary">{r.produccion}</span> },
    { header: 'Placas', cell: (r) => <span className="tabular-nums">{r.totalPlacas}</span> },
    { header: 'Afectadas', cell: (r) => <span className="tabular-nums">{r.placasAfectadas}</span> },
    { header: 'Reoperaciones', cell: (r) => <span className="tabular-nums">{r.totalReoperaciones}</span> },
    { header: 'Pendientes', cell: (r) => <span className="tabular-nums text-warning">{r.reoperacionesPendientes}</span> },
    { header: 'Recuperaciones', cell: (r) => <span className="tabular-nums text-success">{r.totalRecuperaciones}</span> },
    { header: 'Cajas pendientes', cell: (r) => <span className="tabular-nums">{r.cajasPendientes}</span> },
    { header: '% reop.', cell: (r) => <span className="font-semibold tabular-nums">{formatPercent(r.porcentajeReoperaciones)}</span> },
  ];
  const procesoColumns: DataTableColumn<ProcesoDistribucionRow>[] = [
    { header: 'Proceso', cell: (r) => <span className="font-semibold text-primary">{r.proceso}</span> },
    { header: 'Reoperaciones', cell: (r) => <span className="tabular-nums">{r.total}</span> },
    { header: '% de placas con reoperación', cell: (r) => <span className="font-semibold tabular-nums">{formatPercent(r.porcentaje)}</span> },
  ];
  const servicioColumns: DataTableColumn<ServicioRow>[] = [
    { header: 'Servicio', cell: (r) => r.servicio },
    { header: 'Tipo', cell: (r) => <span className="font-semibold text-primary">{r.tipoServicio}</span> },
    { header: 'Series', cell: (r) => <span className="tabular-nums">{r.series}</span> },
    { header: 'Cajas', cell: (r) => <span className="tabular-nums">{r.cajas}</span> },
    { header: 'Placas físicas', cell: (r) => <span className="tabular-nums">{r.placas}</span> },
    { header: 'Reoperaciones', cell: (r) => <span className="tabular-nums">{r.reoperaciones}</span> },
    { header: 'Recuperadas', cell: (r) => <span className="tabular-nums text-success">{r.recuperadas}</span> },
    { header: 'Pendientes', cell: (r) => <span className="tabular-nums text-warning">{r.pendientes}</span> },
    { header: 'Recuperaciones', cell: (r) => <span className="tabular-nums">{r.recuperaciones}</span> },
    { header: '% del total', cell: (r) => <span className="font-semibold tabular-nums">{formatPercent(r.porcentajeTotal)}</span> },
  ];
  const reopProcesoColumns: DataTableColumn<ReopProcesoRow>[] = [
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
  const cajaColumns: DataTableColumn<EstadoCajaGlobal>[] = [
    { header: 'Producción', cell: (r) => r.produccion },
    { header: 'Servicio', cell: (r) => r.servicio },
    { header: 'Caja', cell: (r) => <span className="font-mono">{r.caja}</span> },
    { header: 'Reoperaciones', cell: (r) => <span className="tabular-nums">{r.reoperaciones}</span> },
    { header: 'Pendientes', cell: (r) => <span className="tabular-nums">{r.pendientes}</span> },
    { header: 'Estado', cell: (r) => <OperationStatusBadge status={r.estado} labels={BOX_STATUS_LABELS} /> },
  ];
  const evolucionColumns: DataTableColumn<EvolucionRow>[] = [
    { header: 'Fecha', cell: (r) => r.fecha },
    { header: 'Reoperaciones', cell: (r) => <span className="tabular-nums">{r.reoperaciones}</span> },
    { header: 'Recuperaciones', cell: (r) => <span className="tabular-nums">{r.recuperaciones}</span> },
  ];

  const comparisonCharts = [
    { title: 'Reoperaciones', items: comparison.map((c) => ({ label: c.produccion, value: c.totalReoperaciones })) },
    { title: 'Recuperaciones', items: comparison.map((c) => ({ label: c.produccion, value: c.totalRecuperaciones })) },
    { title: 'Pendientes', items: comparison.map((c) => ({ label: c.produccion, value: c.reoperacionesPendientes })) },
  ];
  const porcentajeProduccionItems = comparison.map((c) => ({ label: c.produccion, value: c.porcentajeReoperaciones }));
  const porcentajeProduccionMax = Math.max(100, ...porcentajeProduccionItems.map((i) => i.value));
  const procesoItems = distribucionProcesos.map((p) => ({ label: p.proceso, value: p.porcentaje }));
  const procesoMax = Math.max(100, ...procesoItems.map((i) => i.value));

  const hasMovement = totals !== null && totals.totalReoperaciones + totals.totalRecuperaciones > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Análisis"
        title="Análisis global"
        description="Métricas combinadas de todas las producciones activas. Las producciones archivadas no se incluyen."
      />

      <AnalyticsUpdateAlert visible={hasNewData} onRefresh={() => void reload()} />

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando análisis de producciones activas...
        </div>
      )}

      {!loading && data && productionCount === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          No hay producciones activas. Las producciones archivadas no se incluyen en este análisis.
        </div>
      )}

      {!loading && data && productionCount > 0 && !hasMovement && (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          Aún no hay reoperaciones ni recuperaciones registradas en las producciones activas.
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 2xl:grid-cols-6">
          <KpiCard icon={Layers} label="Producciones activas" value={productionCount} tone="navy" />
          <KpiCard icon={RotateCcw} label="Reoperaciones" value={totals.totalReoperaciones} tone="amber" />
          <KpiCard icon={AlertCircle} label="Pendientes" value={totals.reoperacionesPendientes} tone="red" />
          <KpiCard icon={CheckCircle2} label="Recuperaciones" value={totals.totalRecuperaciones} tone="emerald" />
          <KpiCard icon={Users} label="Placas afectadas" value={totals.placasAfectadas} tone="navy" />
          <KpiCard icon={Package} label="Cajas pendientes" value={totals.cajasPendientes} tone="red" />
        </div>
      )}

      <ReportSection
        title="Comparativa entre producciones"
        description="Cómo se diferencian las producciones activas en reoperaciones, recuperaciones y pendientes."
        actions={exportMenu(
          'Comparativa entre producciones',
          'comparativa-producciones',
          COMPARISON_COLUMNS,
          comparison,
          comparisonCharts.map((c) => ({ title: c.title, items: c.items })),
        )}
      >
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          {comparisonCharts.map((chart) => (
            <div key={chart.title} className="rounded-xl border border-border bg-muted/50 p-4 sm:p-5">
              <h3 className="mb-4 text-sm font-semibold text-primary">{chart.title}</h3>
              <HorizontalBars items={chart.items} />
            </div>
          ))}
        </div>
        <DataTable columns={comparisonColumns} rows={comparison} getRowKey={(r) => r.produccion} {...TABLE_EMPTY} />
      </ReportSection>

      <ReportSection
        title="Porcentaje de reoperaciones por producción"
        description="Reoperaciones de cada producción frente a las placas con reoperación de todas las producciones activas, que equivalen al 100%."
        actions={exportMenu(
          'Porcentaje de reoperaciones por producción',
          'porcentaje-reoperaciones-producciones',
          COMPARISON_COLUMNS,
          comparison,
          [{ title: '% de reoperaciones por producción', items: porcentajeProduccionItems }],
        )}
      >
        <div className="rounded-xl border border-border bg-muted/50 p-4 sm:p-5">
          <HorizontalBars
            items={porcentajeProduccionItems}
            maxValue={porcentajeProduccionMax}
            formatValue={formatPercent}
            emptyText="Sin producciones activas para graficar."
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Distribución de reoperaciones por proceso"
        description="Reoperaciones de cada proceso frente a las placas con reoperación de todas las producciones activas (100%). Una placa puede repetir proceso, por lo que los porcentajes pueden sumar más de 100%."
        actions={exportMenu(
          'Distribución de reoperaciones por proceso',
          'distribucion-reoperaciones-proceso',
          PROCESO_COLUMNS,
          distribucionProcesos,
          [{ title: '% de reoperaciones por proceso', items: procesoItems }],
        )}
      >
        <div className="mb-6 rounded-xl border border-border bg-muted/50 p-4 sm:p-5">
          <HorizontalBars items={procesoItems} maxValue={procesoMax} formatValue={formatPercent} emptyText="Sin reoperaciones por proceso." />
        </div>
        <DataTable columns={procesoColumns} rows={distribucionProcesos} getRowKey={(r) => r.proceso} {...TABLE_EMPTY} />
      </ReportSection>

      <ReportSection
        title="Resumen general por servicio"
        description="Cajas, placas, reoperaciones, recuperadas, pendientes y participación de cada servicio, sumadas entre producciones activas."
        actions={exportMenu(
          'Resumen general por servicio',
          'resumen-general-servicios-activas',
          SERVICIO_COLUMNS,
          servicios,
          [{ title: 'Reoperaciones por servicio', items: servicios.map((r) => ({ label: r.servicio, value: r.reoperaciones })) }],
        )}
      >
        <div className="mb-6 rounded-xl border border-border bg-muted/50 p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-semibold text-primary">Reoperaciones registradas por servicio</h3>
          <HorizontalBars items={servicios.map((r) => ({ label: r.servicio, value: r.reoperaciones }))} />
        </div>
        <DataTable columns={servicioColumns} rows={servicios} getRowKey={(r) => r.servicio} {...TABLE_EMPTY} />
      </ReportSection>

      <ReportSection
        title="Reoperaciones por servicio y proceso"
        description="Cantidad de reoperaciones y pendientes para cada combinación de servicio y proceso."
        actions={exportMenu('Reoperaciones por servicio y proceso', 'reop-servicio-proceso-activas', REOP_PROCESO_COLUMNS, reopProceso)}
      >
        <DataTable columns={reopProcesoColumns} rows={reopProceso} getRowKey={(r) => `${r.servicio}-${r.proceso}`} {...TABLE_EMPTY} />
      </ReportSection>

      <ReportSection
        title="Recuperaciones por servicio"
        description="Recuperaciones registradas por servicio, separando las manuales de las normales."
        actions={exportMenu(
          'Recuperaciones por servicio',
          'recuperaciones-servicio-activas',
          RECUP_SERVICIO_COLUMNS,
          recupServicio,
          [{ title: 'Recuperaciones por servicio', items: recupServicio.map((r) => ({ label: r.servicio, value: r.total })) }],
        )}
      >
        <HorizontalBars items={recupServicio.map((r) => ({ label: r.servicio, value: r.total }))} />
        <DataTable columns={recupColumns} rows={recupServicio} getRowKey={(r) => r.servicio} {...TABLE_EMPTY} />
      </ReportSection>

      <ReportSection
        title="Estado de cajas"
        description="Cajas con reoperaciones de todas las producciones activas, indicando si están pendientes o completas."
        actions={exportMenu('Estado de cajas', 'estado-cajas-activas', CAJA_COLUMNS, cajas)}
      >
        <Pagination
          page={cajasCurrentPage}
          totalPages={cajasTotalPages}
          onPageChange={setCajasPage}
          summary={cajas.length > 0 ? `Mostrando ${cajasStart}–${cajasEnd} de ${cajas.length} cajas` : undefined}
        />
        <DataTable columns={cajaColumns} rows={cajasPageRows} getRowKey={(r) => `${r.produccion}-${r.servicio}-${r.caja}`} {...TABLE_EMPTY} />
        {cajas.length > CAJAS_PAGE_SIZE && (
          <div className="mt-4 flex justify-end">
            <Pagination page={cajasCurrentPage} totalPages={cajasTotalPages} onPageChange={setCajasPage} />
          </div>
        )}
      </ReportSection>

      <ReportSection
        title="Evolución por fecha"
        description="Reoperaciones y recuperaciones registradas cada día en todas las producciones activas."
        actions={exportMenu('Evolución por fecha', 'evolucion-fecha-activas', EVOLUCION_COLUMNS, evolucion)}
      >
        <DataTable columns={evolucionColumns} rows={evolucion} getRowKey={(r) => r.fecha} {...TABLE_EMPTY} />
      </ReportSection>
    </div>
  );
}

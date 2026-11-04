import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Package,
  PackageCheck,
  Percent,
  Rows3,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { SelectedProductionBanner } from '@/components/productions/SelectedProductionBanner';
import { DataUpdatedAlert } from '@/components/import/DataUpdatedAlert';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { DonutChart } from '@/components/metrics/DonutChart';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductionMetrics } from '@/hooks/useProductionMetrics';
import { useProductions } from '@/hooks/useProductions';
import { exportExcel, exportPdf, type ExportMeta } from '@/lib/exportFiles';
import { SERVICE_EXPORT_COLUMNS } from '@/lib/operationExportColumns';
import { ExportMenu } from '@/components/export/ExportMenu';
import { useAuth } from '@/context/AuthContext';
import { productionDisplayLabel } from '@/types/domain';

interface ScreenProps {
  onNavigate: (path: string) => void;
}

export function ManagerDashboardPage({ onNavigate }: ScreenProps) {
  const { operatorName, selectedProductionId } = useProductionSelection();
  const { metrics, services, loading, error, dataVersion, reload } = useProductionMetrics(selectedProductionId);
  const { productions } = useProductions();
  const { profile, session } = useAuth();

  const selected = productions.find((p) => p.id === selectedProductionId) ?? null;

  const handleRefreshData = () => {
    void reload();
  };
  const exportMeta = (): ExportMeta => ({
    title: 'Panel gerencial',
    fileBase: 'panel-gerencial',
    produccion: selected ? productionDisplayLabel(selected) : '—',
    usuario: operatorName ?? profile?.full_name ?? session?.user.email ?? '—',
    filtros: [],
    kpis: [
      { label: 'Reoperaciones pendientes', value: metrics.reoperacionesPendientes },
      { label: 'Total histórico de reoperaciones', value: metrics.totalReoperaciones },
      { label: 'Total de recuperaciones', value: metrics.totalRecuperaciones },
      { label: 'Porcentaje de recuperación', value: `${metrics.porcentajeRecuperacion}%` },
      { label: 'Cajas pendientes', value: metrics.cajasPendientes },
      { label: 'Cajas completas', value: metrics.cajasCompletas },
      { label: 'Servicios pendientes', value: metrics.serviciosPendientes },
      { label: 'Servicios completos', value: metrics.serviciosCompletos },
    ],
    charts: [
      {
        title: 'Recuperación por servicio (%)',
        items: services.map((s) => ({ label: s.servicio, value: s.porcentajeRecuperacion })),
      },
    ],
  });

  const showValues = !loading && !error && selectedProductionId !== null;
  const value = (n: number) => (showValues ? n : null);
  const pct = (n: number) => (showValues ? `${n}%` : null);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Gerencia"
        title="Panel de control"
        description="Indicadores de reoperaciones, recuperaciones, cajas y servicios de la producción activa."
        actions={
          <ExportMenu
            disabled={loading || services.length === 0}
            onExcel={() => exportExcel(exportMeta(), SERVICE_EXPORT_COLUMNS, services)}
            onPdf={() => exportPdf(exportMeta(), SERVICE_EXPORT_COLUMNS, services)}
          />
        }
      />

      <SelectedProductionBanner onNavigate={onNavigate} />

      <DataUpdatedAlert produccionId={selectedProductionId} loadedVersion={dataVersion} onRefresh={handleRefreshData} />

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {selectedProductionId === null ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center text-sm text-muted-foreground">
          Selecciona una producción para ver sus indicadores.
        </div>
      ) : (
        <>
          <section aria-label="Reoperaciones y recuperaciones" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Reoperaciones pendientes" value={value(metrics.reoperacionesPendientes)} icon={AlertTriangle} tone="red" />
            <KpiCard label="Total histórico de reoperaciones" value={value(metrics.totalReoperaciones)} icon={RotateCcw} tone="navy" />
            <KpiCard label="Total de recuperaciones" value={value(metrics.totalRecuperaciones)} icon={CheckCircle2} tone="emerald" />
            <KpiCard label="Porcentaje de recuperación" value={pct(metrics.porcentajeRecuperacion)} icon={Percent} tone="emerald" />
          </section>

          <section aria-label="Placas" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Cantidad de placas" value={value(metrics.totalPlacas)} icon={Rows3} tone="slate" />
            <KpiCard label="Placas con incidencias" value={value(metrics.placasConPendientes)} icon={Wrench} tone="amber" />
            <KpiCard label="Porcentaje de placas afectadas" value={pct(metrics.porcentajePlacasAfectadas)} icon={Percent} tone="amber" />
            <KpiCard label="Placas afectadas (histórico)" value={value(metrics.placasAfectadas)} icon={Package} tone="slate" />
          </section>

          <section aria-label="Cajas y servicios" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Cajas pendientes" value={value(metrics.cajasPendientes)} icon={Package} tone="red" />
            <KpiCard label="Cajas completas" value={value(metrics.cajasCompletas)} icon={PackageCheck} tone="emerald" />
            <KpiCard label="Servicios pendientes" value={value(metrics.serviciosPendientes)} icon={Gauge} tone="red" />
            <KpiCard label="Servicios completos" value={value(metrics.serviciosCompletos)} icon={ClipboardCheck} tone="emerald" />
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold text-primary">Recuperación por servicio</h2>
            <p className="mb-6 text-sm text-muted-foreground">Porcentaje de movimientos de reoperación ya resueltos.</p>
            {services.length === 0 ? (
              <p className="text-sm text-muted-foreground">{loading ? 'Cargando datos...' : 'Esta producción aún no tiene placas.'}</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {services.map((service) => (
                  <div key={service.servicio} className="flex items-center gap-4 rounded-xl border border-border p-4">
                    <DonutChart percent={service.porcentajeRecuperacion} label={`Recuperación de ${service.servicio}`} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-primary">{service.servicio}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">{service.reoperaciones} reoperaciones</p>
                      <p className="text-sm text-muted-foreground tabular-nums">{service.pendientes} pendientes</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

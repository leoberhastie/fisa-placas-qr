import { Factory, Gauge, Package, Shield } from 'lucide-react';
import { ExcelImportSection } from '@/components/import/ExcelImportSection';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { useProductions } from '@/hooks/useProductions';
import { productionDisplayLabel, ROLE_LABELS } from '@/types/domain';

const ACCESS_ROWS = [
  { role: 'admin', username: 'admin', home: 'Ajustes' },
  { role: 'gerente', username: 'gerente', home: 'Panel de control' },
  { role: 'operador', username: 'operador', home: 'Lector QR' },
] as const;

export function AdminPanelPage() {
  const { selectedProductionId } = useProductionSelection();
  const { productions, loading } = useProductions();

  const total = loading ? null : productions.length;
  const active = loading ? null : productions.filter((item) => item.status === 'activa').length;
  const archived = loading ? null : productions.filter((item) => item.status === 'archivada').length;
  const selected = productions.find((item) => item.id === selectedProductionId) ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administración"
        title="Panel de administrador"
        description="Estado de las producciones registradas, importación de Excel y accesos del sistema."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Producciones" value={total} icon={Factory} hint={total === 0 ? 'Aún no hay producciones creadas' : 'Registradas en el sistema'} />
        <KpiCard label="Activas" value={active} icon={Gauge} tone="emerald" />
        <KpiCard label="Archivadas" value={archived} icon={Package} tone="slate" />
        <KpiCard
          label="Producción seleccionada"
          value={loading ? null : selected ? productionDisplayLabel(selected) : null}
          icon={Shield}
          tone="navy"
          hint={selected ? selected.name : 'Ninguna seleccionada'}
        />
      </section>

      <ExcelImportSection />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-primary">Accesos del sistema</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rol</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usuario</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pantalla inicial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ACCESS_ROWS.map((row) => (
                <tr key={row.role}>
                  <td className="px-4 py-3 font-medium text-primary">{ROLE_LABELS[row.role]}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{row.username}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.home}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

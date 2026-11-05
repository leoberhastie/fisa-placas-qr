import { Factory, FileSpreadsheet, History, Package, Settings as SettingsIcon, QrCode, Database } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChangePasswordForm } from '@/components/settings/ChangePasswordForm';
import { QrReaderConfigSection } from '@/components/settings/QrReaderConfigSection';
import { ResetProductionDataSection } from '@/components/settings/ResetProductionDataSection';
import { ExcelImportSection } from '@/components/import/ExcelImportSection';
import { ServiceBoxImportList } from '@/components/import/ServiceBoxImportList';
import { ProductionsPanel } from '@/components/productions/ProductionsPanel';
import { useAuth } from '@/context/AuthContext';
import { useProductionSelection } from '@/context/ProductionSelectionContext';
import { canImportExcel, ROLE_LABELS, type UserRole } from '@/types/domain';

const ROLE_PERMISSIONS: { role: UserRole; permissions: string }[] = [
  {
    role: 'admin',
    permissions: 'Administra la aplicación, crea producciones e importa Excel. Acceso a todas las pantallas.',
  },
  {
    role: 'gerente',
    permissions: 'Consulta el panel de control, estadísticas, historial y reportes. No importa Excel.',
  },
  {
    role: 'operador',
    permissions: 'Registra reoperaciones y recuperaciones con el lector QR. No importa Excel.',
  },
];

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof FileSpreadsheet;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary/80">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-primary">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { profile, session } = useAuth();
  const { operatorName, selectedProductionId } = useProductionSelection();
  const displayName = operatorName ?? profile?.full_name ?? 'Usuario';
  const username = session?.user.email?.split('@')[0] ?? '';
  const canImport = profile ? canImportExcel(profile.role) : false;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Configuración" title="Ajustes" description="Gestión de producciones, importación, lector QR, contraseña y permisos del sistema." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard icon={SettingsIcon} title="Tu cuenta" description="Datos con los que ingresas al sistema.">
          <dl className="divide-y divide-border text-sm">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Nombre</dt>
              <dd className="font-medium text-primary">{displayName}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Usuario</dt>
              <dd className="font-mono text-primary">{username}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Rol</dt>
              <dd className="font-medium text-accent">{profile ? ROLE_LABELS[profile.role] : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Producción activa</dt>
              <dd className="font-medium text-primary">{selectedProductionId ? 'Seleccionada' : 'Sin selección'}</dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard icon={SettingsIcon} title="Cambiar contraseña" description="La nueva contraseña reemplaza la anterior de inmediato.">
          <ChangePasswordForm />
        </SectionCard>
      </div>

      <SectionCard icon={Factory} title="Gestión de producciones" description="Crea, edita y selecciona la producción de trabajo.">
        <ProductionsPanel />
      </SectionCard>

      {canImport && (
        <>
          <SectionCard icon={FileSpreadsheet} title="Importación de Excel" description="Importa placas a la producción activa con vista previa y validación.">
            <ExcelImportSection />
          </SectionCard>

          <SectionCard icon={Package} title="Cajas por servicio" description="Importa el Excel de cajas de cada servicio de la producción activa.">
            {selectedProductionId ? (
              <ServiceBoxImportList productionId={selectedProductionId} />
            ) : (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">Selecciona una producción para ver sus servicios.</p>
            )}
          </SectionCard>
        </>
      )}

      {!canImport && (
        <SectionCard icon={FileSpreadsheet} title="Importación de Excel" description="Solo el administrador puede importar archivos de Excel.">
          <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            <FileSpreadsheet className="h-5 w-5 shrink-0" />
            <span>Tu rol ({profile ? ROLE_LABELS[profile.role] : '—'}) no tiene permiso para importar Excel. Contacta al administrador.</span>
          </div>
        </SectionCard>
      )}

      <ResetProductionDataSection />

      <QrReaderConfigSection />

      <SectionCard icon={QrCode} title="Configuración general" description="Información del sistema y versión de la aplicación.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/50 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Base de datos</span>
            </div>
            <p className="mt-2 text-sm font-medium text-primary">Supabase (PostgreSQL con RLS)</p>
            <p className="mt-1 text-xs text-muted-foreground">Persistencia en la nube con control de acceso por roles.</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/50 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <History className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Historial</span>
            </div>
            <p className="mt-2 text-sm font-medium text-primary">Registro inmutable de operaciones</p>
            <p className="mt-1 text-xs text-muted-foreground">El historial de operaciones no se puede borrar físicamente.</p>
          </div>
        </div>
      </SectionCard>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-primary">Permisos por rol</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rol</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permisos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ROLE_PERMISSIONS.map((item) => (
                <tr key={item.role}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-primary">{ROLE_LABELS[item.role]}</td>
                  <td className="px-4 py-3 leading-relaxed text-muted-foreground">{item.permissions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

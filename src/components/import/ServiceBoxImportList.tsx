import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ServiceBoxImportPanel } from '@/components/import/ServiceBoxImportPanel';
import { listServiceSummaries, type ServiceSummary } from '@/services/serviceBoxImportService';
import type { ServiceType } from '@/types/domain';

interface ServiceBoxImportListProps {
  productionId: string;
}

interface ListData {
  productionId: string;
  services: ServiceSummary[];
}

const TIPO_LABELS: Record<ServiceType, string> = {
  PZ: 'Pieza (PZ)',
  JGS: 'Juego (JGS)',
};

const TIPO_BADGE_CLASSES: Record<ServiceType, string> = {
  PZ: 'bg-accent/10 text-accent ring-accent/40',
  JGS: 'bg-success/10 text-success ring-success/30',
};

export function ServiceBoxImportList({ productionId }: ServiceBoxImportListProps) {
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    listServiceSummaries(productionId)
      .then((services) => {
        if (active) setData({ productionId, services });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los servicios.');
      });
    return () => {
      active = false;
    };
  }, [productionId, version]);

  const current = data?.productionId === productionId ? data : null;
  const selected = current?.services.find((service) => service.servicio === selectedName) ?? null;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Cada servicio recibe su Excel de cajas con número de caja, serie inicial y serie final. Al subir el archivo, el sistema te pedirá confirmar qué columna corresponde a cada dato y luego verificará que las series existan en las placas del servicio.
      </p>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {!current && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando servicios...
        </p>
      )}

      {current && current.services.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/50 px-6 py-10 text-center text-sm text-muted-foreground">
          Esta producción aún no tiene servicios. Importa primero el archivo maestro.
        </div>
      )}

      {current && current.services.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {current.services.map((service) => (
            <li key={service.servicio} className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/50 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="truncate font-semibold text-primary">{service.servicio}</p>
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TIPO_BADGE_CLASSES[service.tipo]}`}>
                  {TIPO_LABELS[service.tipo]}
                </span>
              </div>

              <dl className="grid grid-cols-3 gap-4 text-sm lg:flex lg:gap-8">
                <div>
                  <dt className="text-xs text-muted-foreground">{service.tipo === 'JGS' ? 'Juegos' : 'Piezas'}</dt>
                  <dd className="font-semibold tabular-nums text-primary">{service.series.toLocaleString('es-MX')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Placas físicas</dt>
                  <dd className="font-semibold tabular-nums text-primary">{service.placas.toLocaleString('es-MX')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cajas</dt>
                  <dd className="font-semibold tabular-nums text-primary">{service.cajas.toLocaleString('es-MX')}</dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={() => setSelectedName(service.servicio)}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary"
              >
                <Upload className="h-4 w-4" />
                {service.cajas > 0 ? 'Reimportar cajas' : 'Importar cajas'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <Modal title={`Cajas de ${selected.servicio}`} onClose={() => setSelectedName(null)} size="wide">
          <div className="p-6">
            <ServiceBoxImportPanel
              productionId={productionId}
              servicio={selected.servicio}
              tipo={selected.tipo}
              onImported={() => setVersion((value) => value + 1)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

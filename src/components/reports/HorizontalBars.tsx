interface HorizontalBarsProps {
  items: { label: string; value: number }[];
  emptyText?: string;
}

export function HorizontalBars({ items, emptyText = 'Sin datos para graficar.' }: HorizontalBarsProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="text-xs truncate text-foreground/80" title={item.label}>
            {item.label}
          </span>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className="min-w-[2.5rem] text-right font-semibold tabular-nums text-primary">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

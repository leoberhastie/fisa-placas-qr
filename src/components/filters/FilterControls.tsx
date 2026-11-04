import type { ReactNode } from 'react';

const CONTROL_CLASS =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal normal-case text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

interface FilterFieldProps {
  label: string;
  children: ReactNode;
}

export function FilterField({ label, children }: FilterFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <FilterField label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={CONTROL_CLASS}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FilterField>
  );
}

interface FilterInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date';
  placeholder?: string;
}

export function FilterInput({ label, value, onChange, type = 'text', placeholder }: FilterInputProps) {
  return (
    <FilterField label={label}>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={CONTROL_CLASS}
      />
    </FilterField>
  );
}

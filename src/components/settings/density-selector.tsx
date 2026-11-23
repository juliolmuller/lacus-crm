'use client';

import { Rows2, Rows3 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

type Density = 'comfortable' | 'compact';
const options = [
  { value: 'comfortable', label: 'Confortável', Icon: Rows2 },
  { value: 'compact', label: 'Compacto', Icon: Rows3 },
] as const;

function saveDensity(d: Density): void {
  document.documentElement.dataset.density = d;

  try {
    localStorage.setItem('density', d);
  } catch {
    // localStorage indisponível (navegação privada ou bloqueado): segue com o padrão
  }
}

/**
 * Densidade das tabelas. O valor efetivo mora em `<html data-density>` (o
 * script do layout aplica o padrão: confortável no celular, compacto no
 * desktop).
 */
export function DensitySelector(): React.JSX.Element {
  const [density, setDensity] = useState<Density>('comfortable');

  useEffect(() => {
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- lê o valor efetivo só no cliente
    setDensity((document.documentElement.dataset.density as Density) || 'comfortable');
  }, []);

  const choose = (d: Density): void => {
    setDensity(d);
    saveDensity(d);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Densidade"
      className="inline-flex rounded-md border border-border-strong bg-surface-3 p-0.5"
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={density === value}
          onClick={() => choose(value)}
          className={cn(
            'flex min-h-9 items-center gap-1.5 rounded-sm px-2.5 text-label transition-colors duration-(--duration-fast)',
            density === value ? 'bg-primary text-primary-fg' : 'text-text-muted hover:text-text',
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

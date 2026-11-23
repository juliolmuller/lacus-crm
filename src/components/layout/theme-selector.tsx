'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

type Theme = 'dark' | 'light' | 'system';
const options = [
  { value: 'system', label: 'Sistema', Icon: Monitor },
  { value: 'dark', label: 'Escuro', Icon: Moon },
  { value: 'light', label: 'Claro', Icon: Sun },
] as const;

const resolve = (t: Theme): 'dark' | 'light' =>
  t === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;

export function ThemeSelector(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    try {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- lê o valor salvo só no cliente
      setTheme((localStorage.getItem('theme') as Theme) || 'system');
    } catch {
      // localStorage indisponível (navegação privada ou bloqueado): segue com o padrão
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolve(theme);

    if (theme !== 'system') return;

    const mq = matchMedia('(prefers-color-scheme: light)');
    const onChange = (): 'dark' | 'light' =>
      (document.documentElement.dataset.theme = resolve('system'));

    mq.addEventListener('change', onChange);

    return (): void => mq.removeEventListener('change', onChange);
  }, [theme]);

  const choose = (t: Theme): void => {
    setTheme(t);

    try {
      localStorage.setItem('theme', t);
    } catch {
      // localStorage indisponível (navegação privada ou bloqueado): segue com o padrão
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex rounded-md border border-border-strong bg-surface-3 p-0.5"
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          className={cn(
            'flex min-h-9 items-center gap-1.5 rounded-sm px-2.5 text-label transition-colors duration-(--duration-fast)',
            theme === value ? 'bg-primary text-primary-fg' : 'text-text-muted hover:text-text',
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

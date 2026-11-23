import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

import { cn } from '@/lib/utils';

interface Common {
  error?: string;
  help?: string;
  label: string;
}

const control =
  'rounded-md border border-border-strong bg-surface-3 px-3 text-body text-text placeholder:text-text-subtle read-only:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Rótulo sempre visível; ajuda e erro ligados por aria-describedby; erro com
 * borda danger e texto.
 */
function Shell({
  id,
  label,
  help,
  error,
  className,
  children,
}: Common & {
  children: (a: object) => ReactNode;
  className?: string;
  id: string;
}): React.JSX.Element {
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-label text-text">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {help && (
        <p id={`${id}-help`} className="text-label font-normal text-text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-label text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Field({
  label,
  help,
  error,
  className,
  id,
  ...props
}: Common & InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  const autoId = useId();

  return (
    <Shell id={id ?? autoId} label={label} help={help} error={error}>
      {(a) => (
        <input
          {...a}
          className={cn(control, 'h-9', error && 'border-danger', className)}
          {...props}
        />
      )}
    </Shell>
  );
}

export function SelectField({
  label,
  help,
  error,
  className,
  id,
  children,
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  const autoId = useId();

  return (
    <Shell id={id ?? autoId} label={label} help={help} error={error}>
      {(a) => (
        <select
          {...a}
          className={cn(control, 'h-9', error && 'border-danger', className)}
          {...props}
        >
          {children}
        </select>
      )}
    </Shell>
  );
}

export function TextareaField({
  label,
  help,
  error,
  className,
  id,
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  const autoId = useId();

  return (
    <Shell id={id ?? autoId} label={label} help={help} error={error}>
      {(a) => (
        <textarea
          rows={3}
          {...a}
          className={cn(control, 'min-h-20 py-2', error && 'border-danger', className)}
          {...props}
        />
      )}
    </Shell>
  );
}

/**
 * Estilo de select/input sem rótulo (células de tabela, filtros com
 * aria-label).
 */
export const bareControl = cn(control, 'h-8 text-table');

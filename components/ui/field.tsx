import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  help?: string;
  error?: string;
};

/** Rótulo sempre visível; ajuda e erro ligados por aria-describedby; erro com borda danger e texto. */
export function Field({ label, help, error, className, id, ...props }: Props) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy = [help && `${inputId}-help`, error && `${inputId}-error`]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-label text-text">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'h-9 rounded-md border border-border-strong bg-surface-3 px-3 text-body text-text placeholder:text-text-subtle read-only:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-danger',
          className,
        )}
        {...props}
      />
      {help && (
        <p id={`${inputId}-help`} className="text-label font-normal text-text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="text-label text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

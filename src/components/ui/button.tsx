import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-body font-medium whitespace-nowrap transition-colors duration-(--duration-fast) disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
        secondary: 'border border-border-strong bg-surface-3 text-text hover:bg-surface-2',
        ghost: 'text-text hover:bg-surface-3',
        destructive: 'bg-danger text-danger-fg hover:brightness-110',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: { sm: 'h-8 px-3', md: 'h-9 px-4', lg: 'h-11 px-5' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type Props = { loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>
  & VariantProps<typeof buttonVariants>;

/**
 * `loading` mantém o texto, mostra o spinner e marca aria-busy (o clique fica
 * bloqueado).
 */
export function Button({
  className,
  variant,
  size,
  loading,
  disabled,
  children,
  ...props
}: Props): React.JSX.Element {
  return (
    // eslint-disable-next-line @eslint-react/dom-no-missing-button-type -- callers pass `type`; forms rely on the native submit default
    <button
      className={cn(buttonVariants({ variant, size }), variant === 'link' && 'px-0', className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

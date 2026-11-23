import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Bloco da tela inicial: título, ação opcional no canto e o conteúdo.
 */
export function Panel({
  title,
  action,
  children,
  className,
}: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  title: string;
}): React.JSX.Element {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex h-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4 shadow-e1',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lead">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const Empty = ({ children }: { children: ReactNode }): React.JSX.Element => (
  <p className="text-body text-text-muted">{children}</p>
);

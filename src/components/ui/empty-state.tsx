import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

/**
 * Estado vazio: ícone, título, explicação e (opcional) a ação que resolve.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  action?: ReactNode;
  children?: ReactNode;
  icon: LucideIcon;
  title: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-1 p-8 text-center">
      <Icon className="size-10 text-text-subtle" aria-hidden />
      <p className="text-lead">{title}</p>
      {children ? <p className="max-w-md text-body text-text-muted">{children}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

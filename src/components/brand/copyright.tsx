import { currentYear } from '@/lib/format';
import { cn } from '@/lib/utils';

export function Copyright({ className }: { className?: string }): React.JSX.Element {
  return (
    <p className={cn('text-label text-text-subtle', className)}>
      © {currentYear()} Lacus Solutions. Todos os direitos reservados.
    </p>
  );
}

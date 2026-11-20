import { cn } from '@/lib/utils';
import { currentYear } from '@/lib/format';

export function Copyright({ className }: { className?: string }) {
  return (
    <p className={cn('text-label text-text-subtle', className)}>
      © {currentYear()} Lacus Solutions. Todos os direitos reservados.
    </p>
  );
}

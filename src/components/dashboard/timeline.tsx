import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatWhen } from '@/lib/format';

export type TimelineEntry = {
  id: string;
  Icon: LucideIcon;
  title: ReactNode;
  detail?: ReactNode;
  at: Date;
};

/** Linha do tempo vertical: ícone, texto e horário; a lista é ordenada por quem chama. */
export function Timeline({ items, label }: { items: TimelineEntry[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {items.map(({ id, Icon, title, detail, at }, i) => (
        <li key={id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-text-muted">
              <Icon className="size-4" aria-hidden />
            </span>
            {i < items.length - 1 && <span aria-hidden className="w-px flex-1 bg-border" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-4">
            <p className="text-body break-words">{title}</p>
            {detail && <p className="text-label break-words text-text-muted">{detail}</p>}
            <time dateTime={at.toISOString()} className="text-label text-text-subtle">
              {formatWhen(at)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}

import Link from 'next/link';
import { ScoreBadge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import type { BestNext } from '@/lib/services/dashboard';
import { Empty, Panel } from './panel';

/** Top 5 para abordar. "Abordar" abre o lead (WhatsApp com modelo e "Registrar como abordado"). */
export function BestNextCard({ leads }: { leads: BestNext }) {
  return (
    <Panel title="Melhores próximos">
      {leads.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {leads.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <ScoreBadge score={l.score} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium">{l.name}</p>
                <p className="truncate text-label text-text-muted">
                  {l.niche} · {l.region}
                  {l.priority != null ? ` · prioridade ${l.priority}` : ''}
                </p>
              </div>
              <Link
                href={`/leads?lead=${l.id}`}
                aria-label={`Abordar ${l.name}`}
                className={buttonVariants({ size: 'sm' })}
              >
                Abordar
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nenhum lead novo ou a abordar com esses filtros.</Empty>
      )}
    </Panel>
  );
}

import { SearchX } from 'lucide-react';
import Link from 'next/link';

import { LeadReminders } from '@/components/reminders/lead-reminders';
import { toReminderView } from '@/components/reminders/view';
import { ScoreBadge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { type DealDetail } from '@/lib/services/deals';

import { DealForm } from './deal-form';
import { InteractionForm } from './interaction-form';
import { SessionLink } from './session-link';
import { DealTimeline } from './timeline';

export const DealNotFound = (): React.JSX.Element => (
  <EmptyState icon={SearchX} title="Negociação não encontrada">
    Ela pode ter sido excluída junto com o lead.
  </EmptyState>
);

const statusLabel = { open: 'Aberta', won: 'Ganha', lost: 'Perdida' } as const;

/**
 * Conteúdo do drawer da negociação: dados, nova interação e linha do tempo
 * unificada.
 */
export function DealDetailView({ d }: { d: DealDetail }): React.JSX.Element {
  const { deal, stage, lead, niche } = d;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ScoreBadge score={lead.score} />
          <StatusBadge status={lead.contactStatus} />
          <span className="text-label text-text-muted">
            {stage.name} · {statusLabel[deal.status]}
            {deal.lostReason ? ` (${deal.lostReason})` : ''}
          </span>
        </div>
        <p className="text-body text-text-muted">
          {niche} ·{' '}
          <Link
            href={`/leads/${lead.id}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Abrir o lead {lead.name}
          </Link>
        </p>
        <SessionLink leadId={lead.id} url={lead.sessionUrl} />
      </header>
      <section aria-labelledby="deal-data" className="flex flex-col gap-3">
        <h3 id="deal-data" className="text-section">
          Dados
        </h3>
        <DealForm key={String(deal.updatedAt)} id={deal.id} deal={deal} />
      </section>
      <section aria-labelledby="deal-new" className="flex flex-col gap-3">
        <h3 id="deal-new" className="text-section">
          Nova interação
        </h3>
        <InteractionForm leadId={lead.id} disabled={lead.doNotContact} />
      </section>
      <section aria-labelledby="deal-reminders" className="flex flex-col gap-3">
        <h3 id="deal-reminders" className="text-section">
          Lembretes
        </h3>
        <LeadReminders
          leadId={lead.id}
          dealId={deal.status === 'open' ? deal.id : null}
          reminders={d.openReminders.map((r) => toReminderView(r, lead.name))}
          disabled={lead.doNotContact}
        />
      </section>
      <section aria-labelledby="deal-timeline" className="flex flex-col gap-3">
        <h3 id="deal-timeline" className="text-section">
          Linha do tempo
        </h3>
        <DealTimeline items={d.timeline} />
      </section>
    </div>
  );
}

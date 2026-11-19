import { AlertTriangle, SearchX } from 'lucide-react';
import Link from 'next/link';
import { ScoreBadge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatWhen, formatMoney } from '@/lib/format';
import { formatDate, leadToRow, spDate } from '@/lib/leads/csv';
import { templateValues } from '@/lib/followups/templates';
import { siteLabel } from '@/lib/leads/labels';
import { formatCityNeighborhood } from '@/lib/normalize';
import type { ScoreBreakdown as Breakdown } from '@/lib/score';
import type { LeadDetail as Detail } from '@/lib/services/lead-detail';
import { CreateDealButton } from '@/components/funnel/create-deal-button';
import { InteractionForm } from '@/components/funnel/interaction-form';
import { InteractionItem } from '@/components/funnel/timeline';
import { LeadReminders } from '@/components/reminders/lead-reminders';
import { toReminderView } from '@/components/reminders/view';
import { LeadDataForm } from './lead-data-form';
import { LeadTabs } from './lead-tabs';
import { QuickActions } from './quick-actions';
import { ScoreBreakdown } from './score-breakdown';

const when = formatWhen;
const money = formatMoney;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label text-text-muted">{label}</dt>
      <dd className="text-body break-words">{children || '—'}</dd>
    </div>
  );
}

const Block = ({ title, text }: { title: string; text: string | null }) =>
  text ? (
    <section className="flex flex-col gap-1">
      <h3 className="text-label text-text-muted">{title}</h3>
      <p className="text-body whitespace-pre-line">{text}</p>
    </section>
  ) : null;

export function LeadNotFound() {
  return (
    <EmptyState icon={SearchX} title="Lead não encontrado">
      Ele pode ter sido excluído.
    </EmptyState>
  );
}

/** Conteúdo do lead (drawer e página cheia): cabeçalho, ações rápidas e as 5 abas. */
export function LeadDetail({
  d,
  niches,
  regions,
}: {
  d: Detail;
  niches: string[];
  regions: string[];
}) {
  const { lead, niche, region } = d;
  const place = formatCityNeighborhood(region);
  const row = leadToRow(lead, niche, place);
  const empty = (t: string) => <p className="text-body text-text-muted">{t}</p>;

  const resumo = (
    <div className="flex flex-col gap-5">
      <ScoreBreakdown
        score={lead.score}
        breakdown={lead.scoreBreakdown as Breakdown | null}
        weights={d.settings.weights}
      />
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Fact label="Telefone">{lead.phone}</Fact>
        <Fact label="WhatsApp">{lead.hasWhatsapp ? 'Sim' : 'Não'}</Fact>
        <Fact label="Site">{siteLabel[lead.websiteStatus ?? 'unknown']}</Fact>
        <Fact label="Instagram">{lead.instagram}</Fact>
        <Fact label="Nota no Maps">
          {lead.mapsRating
            ? `${Number(lead.mapsRating).toFixed(1)} (${lead.mapsReviews ?? 0} avaliações)`
            : null}
        </Fact>
        <Fact label="Próxima ação">{lead.nextAction}</Fact>
        <Fact label="Último contato">
          {lead.lastContactAt ? formatDate(spDate(lead.lastContactAt)) : null}
        </Fact>
        <Fact label="Prioridade">{lead.priority}</Fact>
        <Fact label="Valor da proposta">
          {lead.proposalValue ? money(lead.proposalValue) : null}
        </Fact>
      </dl>
      <Block title="Argumento de abordagem" text={lead.pitch} />
      <Block title="Resumo do negócio" text={lead.businessSummary} />
      <Block title="Sinais de interesse digital" text={lead.digitalSignals} />
      <Block title="Observações" text={lead.notes} />
    </div>
  );

  const interacoes = (
    <div className="flex flex-col gap-4">
      <InteractionForm leadId={lead.id} />
      {d.interactions.length ? (
        <ol className="flex flex-col gap-3">
          {d.interactions.map((i) => (
            <InteractionItem key={i.id} i={i} />
          ))}
        </ol>
      ) : (
        empty('Nenhuma interação registrada ainda.')
      )}
    </div>
  );

  const hasOpenDeal = d.deals.some(({ deal }) => deal.status === 'open');
  const negociacao = (
    <div className="flex flex-col gap-3">
      {d.deals.length ? (
        <ul className="flex flex-col gap-3">
          {d.deals.map(({ deal, stage }) => (
            <li
              key={deal.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 p-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/funil?deal=${deal.id}`}
                  className="truncate text-body font-medium text-primary underline-offset-4 hover:underline"
                >
                  {deal.title}
                </Link>
                <p className="text-label text-text-muted">
                  {stage.name} ·{' '}
                  {deal.status === 'open' ? 'aberta' : deal.status === 'won' ? 'ganha' : 'perdida'}
                  {deal.lostReason ? ` (${deal.lostReason})` : ''}
                </p>
              </div>
              <span className="tabular text-body">{money(deal.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        empty('Sem negociação para este lead.')
      )}
      {!hasOpenDeal && !lead.doNotContact && (
        <div>
          <CreateDealButton leadId={lead.id} />
        </div>
      )}
    </div>
  );

  const closed = d.reminders.filter((r) => r.status !== 'open').slice(0, 10);
  const lembretes = (
    <div className="flex flex-col gap-4">
      <LeadReminders
        leadId={lead.id}
        dealId={d.deals.find(({ deal }) => deal.status === 'open')?.deal.id ?? null}
        reminders={d.reminders
          .filter((r) => r.status === 'open')
          .map((r) => toReminderView(r, lead.name))}
        disabled={lead.doNotContact}
      />
      {closed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-label text-text-muted">Encerrados</h3>
          <ul className="flex flex-col gap-1">
            {closed.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 text-body text-text-muted">
                <span>{r.title}</span>
                <span>
                  {when(r.dueAt)} · {r.status === 'done' ? 'feito' : 'cancelado'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  const dados = (
    <LeadDataForm
      key={String(lead.updatedAt)}
      row={row}
      niches={niches}
      regions={regions}
      origin={[
        { label: 'Origem dos dados', value: lead.dataSource ?? '' },
        { label: 'Planilha de origem', value: lead.sourceSheet ?? '' },
        { label: 'Criado em', value: when(lead.createdAt) },
        { label: 'Atualizado em', value: when(lead.updatedAt) },
        {
          label: 'Score calculado em',
          value: lead.scoreComputedAt ? when(lead.scoreComputedAt) : '',
        },
        { label: 'Prioridade', value: lead.priority?.toString() ?? '' },
      ]}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ScoreBadge score={lead.score} />
          <StatusBadge status={lead.contactStatus} />
        </div>
        <h1 className="text-page break-words">{lead.name}</h1>
        <p className="text-body text-text-muted">
          {niche.name} · {place}
        </p>
      </header>
      {lead.doNotContact && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-body"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <span>
            <strong>Não contatar.</strong> {lead.doNotContactReason}
            {lead.doNotContactAt ? ` (${when(lead.doNotContactAt)})` : ''}
          </span>
        </div>
      )}
      <QuickActions
        lead={{
          id: lead.id,
          name: lead.name,
          mapsUrl: lead.mapsUrl,
          phoneE164: lead.phoneE164,
          instagram: lead.instagram,
          pitch: lead.pitch,
          sessionUrl: lead.sessionUrl,
          doNotContact: lead.doNotContact,
          hasOpenDeal,
          contacted: lead.lastContactAt !== null,
        }}
        templates={d.templates.map((t) => ({ id: t.id, key: t.key, name: t.name, body: t.body }))}
        values={templateValues(lead, niche, region, d.profile)}
      />
      <LeadTabs
        tabs={[
          { id: 'resumo', label: 'Resumo', panel: resumo },
          { id: 'interacoes', label: `Interações (${d.interactions.length})`, panel: interacoes },
          { id: 'negociacao', label: 'Negociação', panel: negociacao },
          { id: 'lembretes', label: 'Lembretes', panel: lembretes },
          { id: 'dados', label: 'Dados', panel: dados },
        ]}
      />
    </div>
  );
}

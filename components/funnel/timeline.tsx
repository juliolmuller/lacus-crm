import { formatWhen } from '@/lib/format';
import { directionLabel, interactionLabel, outcomeLabel } from '@/lib/leads/labels';
import type { TimelineItem } from '@/lib/services/deals';
import type { interactions } from '@/lib/db/schema';

type Interaction = typeof interactions.$inferSelect;

const box = 'flex flex-col gap-0.5 rounded-md border border-border bg-surface-2 p-3';

export function InteractionItem({ i }: { i: Interaction }) {
  return (
    <li className={box}>
      <div className="flex justify-between gap-2 text-label text-text-muted">
        <span>
          {interactionLabel[i.type]} · {directionLabel[i.direction]}
          {i.outcome ? ` · ${outcomeLabel[i.outcome]}` : ''}
          {i.createdBy === 'import' ? ' · importada' : ''}
        </span>
        <time dateTime={i.occurredAt.toISOString()}>{formatWhen(i.occurredAt)}</time>
      </div>
      <p className="text-body">{i.summary}</p>
      {i.body && <p className="text-body whitespace-pre-line text-text-muted">{i.body}</p>}
    </li>
  );
}

const reminderState = { open: 'aberto', done: 'feito', canceled: 'cancelado' } as const;
const sourceLabel = {
  ui: 'por mim',
  mcp: 'pelo MCP',
  rule: 'por regra',
  import: 'importação',
} as const;

/** Linha do tempo unificada da negociação: interações, mudanças de etapa e lembretes. */
export function DealTimeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return <p className="text-body text-text-muted">Nada registrado ainda.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {items.map((it) =>
        it.kind === 'interaction' ? (
          <InteractionItem key={it.id} i={it.row} />
        ) : (
          <li key={it.id} className={box}>
            <div className="flex justify-between gap-2 text-label text-text-muted">
              <span>{it.kind === 'stage' ? 'Etapa' : 'Lembrete'}</span>
              <time dateTime={it.at.toISOString()}>{formatWhen(it.at)}</time>
            </div>
            <p className="text-body">
              {it.kind === 'stage'
                ? `${it.from ? `${it.from} → ` : 'Criada em '}${it.to} (${sourceLabel[it.source]})`
                : `${it.row.title} (${reminderState[it.row.status]})`}
            </p>
          </li>
        ),
      )}
    </ol>
  );
}

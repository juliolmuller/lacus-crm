import { ArrowRightLeft, Bot, MessageSquare } from 'lucide-react';
import Link from 'next/link';

import { directionLabel, interactionLabel } from '@/lib/leads/labels';
import { type ActivityItem } from '@/lib/services/dashboard';

import { Timeline, type TimelineEntry } from './timeline';

const sourceLabel = {
  ui: 'por mim',
  mcp: 'pelo MCP',
  rule: 'por regra',
  import: 'importação',
} as const;

const leadLink = (a: ActivityItem): React.JSX.Element => (
  <Link
    href={`/leads?lead=${a.leadId}`}
    className="text-primary underline-offset-4 hover:underline"
  >
    {a.leadName}
  </Link>
);

/**
 * Últimas interações, movimentações de deal e leads criados pelo MCP.
 */
export function ActivityTimeline({ items }: { items: ActivityItem[] }): React.JSX.Element {
  const entries: TimelineEntry[] = items.map((a, i) => {
    const id = `${a.kind}-${a.leadId}-${a.at.getTime()}-${i}`;

    if (a.kind === 'interaction')
      return {
        id,
        Icon: MessageSquare,
        title: (
          <>
            {interactionLabel[a.type as keyof typeof interactionLabel]} · {leadLink(a)}
          </>
        ),
        detail: `${directionLabel[a.direction as keyof typeof directionLabel]}: ${a.summary}`,
        at: a.at,
      };

    if (a.kind === 'move')
      return {
        id,
        Icon: ArrowRightLeft,
        title: <>{leadLink(a)}</>,
        detail: `${a.from ? `${a.from} → ` : 'Entrou em '}${a.to} (${sourceLabel[a.source as keyof typeof sourceLabel]})`,
        at: a.at,
      };

    return { id, Icon: Bot, title: <>Lead criado pelo MCP: {leadLink(a)}</>, at: a.at };
  });

  return <Timeline items={entries} label="Atividade recente" />;
}

import { AlertTriangle, Check, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  neutral: 'bg-surface-3 text-text-muted border-border',
  primary: 'bg-primary/15 text-primary border-primary/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-label',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export const contactStatusMeta = {
  new: { label: 'Novo', tone: 'neutral' },
  to_contact: { label: 'A abordar', tone: 'primary' },
  contacted: { label: 'Abordado', tone: 'primary' },
  no_response: { label: 'Sem resposta', tone: 'warning' },
  replied: { label: 'Respondeu', tone: 'success' },
  negotiating: { label: 'Em negociação', tone: 'warning' },
  client: { label: 'Cliente', tone: 'success' },
  lost: { label: 'Perdido', tone: 'danger' },
  discarded: { label: 'Descartado', tone: 'neutral' },
} as const satisfies Record<string, { label: string; tone: keyof typeof tones }>;

export function StatusBadge({ status }: { status: keyof typeof contactStatusMeta }) {
  const { label, tone } = contactStatusMeta[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Faixas: >= 70 alto, 40-69 médio, < 40 baixo. O número vai com rótulo acessível, nunca só cor. */
export function ScoreBadge({ score }: { score: number }) {
  const [band, label] =
    score >= 70 ? ['high', 'alto'] : score >= 40 ? ['mid', 'médio'] : ['low', 'baixo'];
  const color = {
    high: 'bg-score-high-bg text-score-high-fg',
    mid: 'bg-score-mid-bg text-score-mid-fg',
    low: 'bg-score-low-bg text-score-low-fg',
  }[band];
  return (
    <span
      aria-label={`Score ${label}: ${score}`}
      className={cn(
        'tabular inline-flex min-w-9 justify-center rounded-md px-2 py-0.5 text-label font-semibold',
        color,
      )}
    >
      {score}
    </span>
  );
}

const sync = {
  synced: { label: 'Sincronizado', tone: 'success', Icon: Check },
  pending: { label: 'Pendente', tone: 'neutral', Icon: Clock },
  error: { label: 'Erro de sincronização', tone: 'danger', Icon: AlertTriangle },
} as const;

export function SyncBadge({ status }: { status: keyof typeof sync }) {
  const { label, tone, Icon } = sync[status];
  return (
    <Badge tone={tone}>
      <Icon className="size-3" aria-hidden />
      {label}
    </Badge>
  );
}

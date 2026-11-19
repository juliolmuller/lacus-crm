import { AlertTriangle, Check, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { contactStatuses, statusLabel, type ContactStatus } from '@/lib/leads/labels';
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

const statusTone = {
  new: 'neutral',
  to_contact: 'primary',
  contacted: 'primary',
  no_response: 'warning',
  replied: 'success',
  negotiating: 'warning',
  client: 'success',
  lost: 'danger',
  discarded: 'neutral',
} as const satisfies Record<ContactStatus, keyof typeof tones>;

export const contactStatusMeta = Object.fromEntries(
  contactStatuses.map((s) => [s, { label: statusLabel[s], tone: statusTone[s] }]),
) as Record<ContactStatus, { label: string; tone: keyof typeof tones }>;

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

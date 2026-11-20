import type { ContactStatus } from '@/lib/leads/labels';

/** PLAN D3: ordem em que o status só avança. */
const ORDER: ContactStatus[] = [
  'new',
  'to_contact',
  'contacted',
  'no_response',
  'replied',
  'negotiating',
  'client',
];
/** Sempre aplicados, em qualquer ordem. */
const ALWAYS: ContactStatus[] = ['lost', 'client', 'discarded'];

/**
 * Status que o lead deve ter ao entrar numa etapa cujo `lead_status` é `target`; null = não muda.
 * `force` (reabrir uma negociação encerrada): o status volta para o da etapa mesmo que retroceda.
 */
export function syncedStatus(
  current: ContactStatus,
  target: ContactStatus | null,
  force = false,
): ContactStatus | null {
  if (!target || target === current) return null;
  if (ALWAYS.includes(target) || force) return target;
  const [from, to] = [ORDER.indexOf(current), ORDER.indexOf(target)];
  return from >= 0 && to > from ? target : null;
}

export const lossReasons = [
  'Sem orçamento',
  'Já tem fornecedor',
  'Sem interesse',
  'Sem resposta',
  'Timing',
  'Não contatar',
  'Outro',
] as const;
export const DNC_REASON = 'Não contatar';

/** Tokens de cor das etapas (globals.css). */
export const stageColors = [
  'stage-1',
  'stage-2',
  'stage-3',
  'stage-4',
  'stage-5',
  'stage-6',
  'stage-won',
  'stage-lost',
] as const;

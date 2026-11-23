import { DealError } from '@/lib/services/deals';
import { LeadError } from '@/lib/services/leads';
import { ReminderError } from '@/lib/services/reminders';

/**
 * Retorno padrão das Server Actions: erros de regra viram mensagem; o resto vai
 * para o log.
 */
export type Result<T = object> = { error: string; ok: false } | ({ ok: true } & T);

export const fail = (e: unknown): { error: string; ok: false } => {
  if (e instanceof LeadError || e instanceof DealError || e instanceof ReminderError)
    return { ok: false, error: e.message };

  console.error(e);

  return { ok: false, error: 'Não foi possível concluir. Tente de novo.' };
};

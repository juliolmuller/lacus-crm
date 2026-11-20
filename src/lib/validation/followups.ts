import { z } from 'zod';

// offsetBusinessDays negativo = dias úteis antes de uma data informada (ex.: reunião marcada).
export const cadenceStep = z.object({
  offsetBusinessDays: z.number().int(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM'),
  title: z.string().min(1),
  templateKey: z.string().optional(),
  // ao concluir este passo sem resposta, sugere mudar o status do lead (ex.: no_response)
  suggestStatus: z.enum(['no_response']).optional(),
});

export const cadence = z.array(cadenceStep).min(1);

export const cancelOn = z.object({
  inboundInteraction: z.boolean().optional(),
  stageLeft: z.boolean().optional(),
});

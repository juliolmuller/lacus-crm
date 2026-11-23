import { type z } from 'zod';

import { type cadenceStep, type cancelOn } from '@/lib/validation/followups';

import { addBusinessDays, type BusinessCalendar, spDateTime, spYmd } from './business-days';

type Step = z.infer<typeof cadenceStep>;
type CancelOn = z.infer<typeof cancelOn>;

export interface RuleRow {
  cadence: Step[];
  cancelOn: CancelOn;
  id: number;
  interactionDirection: null | string;
  interactionOutcome: null | string;
  interactionType: null | string;
  stageId: null | number;
  trigger: 'deal_created' | 'deal_stage_entered' | 'interaction_logged';
}

export type FollowupEvent =
  | {
      /**
       * DealStageHistoryId (ou o id do deal, se não houver)
       */
      anchor: string;
      at: Date;
      dealId: string;
      kind: 'deal_created' | 'deal_stage_entered';
      now?: Date;
      stageId: number;
    }
  | {
      anchor: string;
      at: Date;
      dealId: null | string;
      direction: string;
      kind: 'interaction_logged';
      /**
       * Status do lead depois dos efeitos da interação.
       */
      leadStatus: string;
      /**
       * Data da reunião (AAAA-MM-DD): âncora dos offsets negativos.
       */
      meetingOn?: string;
      /**
       * Instante atual (`at` pode ser retroativo); lembretes não vencem antes
       * dele.
       */
      now?: Date;
      outcome: null | string;
      /**
       * Troca o offset da regra de passo único (ex.: "retomar em N dias úteis")
       */
      resumeInDays?: number;
      type: string;
    };

export interface OpenReminder {
  dealId: null | string;
  id: string;
  ruleId: null | number;
}

export interface PlannedReminder {
  dedupeKey: string;
  dueAt: Date;
  ruleId: number;
  stepIndex: number;
  templateKey?: string;
  title: string;
}

export interface Plan {
  cancel: string[];
  create: PlannedReminder[];
}

const NOT_CONTACT = ['note', 'system'];
// Tipos que têm regra própria; a regra genérica de "sem resposta" não vale para eles.
const OWN_CADENCE_TYPES = ['proposal', 'meeting'];
// Resultados que já são uma resposta: não cabe cobrar "sem resposta".
const SILENT_OUTCOMES = [null, 'no_answer'];

/**
 * Regra genérica de 1º contato: outbound, sem tipo nem resultado (SPEC 11,
 * primeira linha).
 */
const isFirstContact = (r: RuleRow): boolean =>
  r.interactionDirection === 'outbound' && !r.interactionType && !r.interactionOutcome;

export function ruleMatches(r: RuleRow, e: FollowupEvent): boolean {
  if (r.trigger !== e.kind) return false;

  if (e.kind !== 'interaction_logged') return r.stageId === null || r.stageId === e.stageId;

  if (NOT_CONTACT.includes(e.type)) return false;

  if (r.interactionType && r.interactionType !== e.type) return false;

  if (r.interactionDirection && r.interactionDirection !== e.direction) return false;

  if (r.interactionOutcome && r.interactionOutcome !== e.outcome) return false;

  if (isFirstContact(r))
    return (
      !OWN_CADENCE_TYPES.includes(e.type)
      && SILENT_OUTCOMES.includes(e.outcome)
      && ['contacted', 'no_response'].includes(e.leadStatus)
    );

  return true;
}

/**
 * Planeja (sem tocar no banco) os lembretes a criar e a cancelar para um
 * evento. `open`: lembretes abertos de regras do lead; `existingKeys`:
 * `dedupe_key` já gravadas (qualquer status). `replay` (o job reaplica eventos
 * recentes): só cria, nunca cancela.
 */
export function planFollowups(args: {
  calendar?: BusinessCalendar;
  event: FollowupEvent;
  existingKeys: Set<string>;
  open: OpenReminder[];
  replay?: boolean;
  rules: RuleRow[];
  /**
   * Regras que não reancoram neste evento (a interação é a execução de um passo
   * delas)
   */
  skipRuleIds?: number[];
}): Plan {
  const { event, rules, open, existingKeys, calendar, replay, skipRuleIds = [] } = args;
  const byId = new Map(rules.map((r) => [r.id, r]));
  const cancel = new Set<string>();

  if (!replay) {
    for (const o of open) {
      const c = o.ruleId ? byId.get(o.ruleId)?.cancelOn : undefined;

      if (!c) continue;

      const inbound =
        event.kind === 'interaction_logged'
        && event.direction === 'inbound'
        && !NOT_CONTACT.includes(event.type);
      const stageLeft =
        event.kind === 'deal_stage_entered' && o.dealId !== null && o.dealId === event.dealId;

      if ((c.inboundInteraction && inbound) || (c.stageLeft && stageLeft)) cancel.add(o.id);
    }
  }

  const create: PlannedReminder[] = [];
  for (const rule of rules.filter((r) => !skipRuleIds.includes(r.id) && ruleMatches(r, event))) {
    const floor = event.now ?? event.at;
    const today = spYmd(event.at);
    const base = event.kind === 'interaction_logged' ? (event.meetingOn ?? today) : today;
    const planned: PlannedReminder[] = [];

    rule.cadence.forEach((step, i) => {
      const dedupeKey = `rule:${rule.id}:step:${i}:anchor:${event.anchor}`;

      if (existingKeys.has(dedupeKey)) return;

      const resume =
        event.kind === 'interaction_logged' && rule.cadence.length === 1
          ? event.resumeInDays
          : null;
      const offset = resume ?? step.offsetBusinessDays;
      const due = spDateTime(addBusinessDays(base, offset, calendar), step.time);

      planned.push({
        ruleId: rule.id,
        stepIndex: i,
        dedupeKey,
        title: step.title,
        // offset negativo (antes de uma data) perto de hoje pode cair no passado: vence agora
        dueAt: offset < 0 && due < floor ? floor : due,
        templateKey: step.templateKey,
      });
    });

    // uma nova âncora da mesma regra substitui a cadência anterior
    if (planned.length && !replay) for (const o of open) if (o.ruleId === rule.id) cancel.add(o.id);

    create.push(...planned);
  }

  return { create, cancel: [...cancel] };
}

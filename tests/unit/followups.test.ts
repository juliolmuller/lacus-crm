import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  businessDaysBetween,
  easterSunday,
  holidaysOf,
  isBusinessDay,
  spDateTime,
  spYmd,
} from '@/lib/followups/business-days';
import { planFollowups, type RuleRow } from '@/lib/followups/engine';
import { greeting, renderTemplate } from '@/lib/followups/templates';
import { decrypt, encrypt } from '@/lib/crypto';

describe('dias úteis', () => {
  it('Páscoa e feriados móveis de 2026 e 2027', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    const h26 = holidaysOf(2026);
    for (const d of ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04'])
      expect(h26.has(d), d).toBe(true);
    const h27 = holidaysOf(2027);
    for (const d of ['2027-02-08', '2027-02-09', '2027-03-26', '2027-05-27'])
      expect(h27.has(d), d).toBe(true);
  });

  it('feriados fixos, Curitiba (8/set) e extras do calendário', () => {
    expect(isBusinessDay('2026-09-08')).toBe(false); // terça, Curitiba
    expect(isBusinessDay('2026-09-07')).toBe(false); // segunda, Independência
    expect(isBusinessDay('2026-11-20')).toBe(false); // sexta, Consciência Negra
    expect(isBusinessDay('2026-12-24')).toBe(true);
    const cal = { extraHolidays: [{ date: '2026-12-24', name: 'Recesso' }] };
    expect(isBusinessDay('2026-12-24', cal)).toBe(false);
    expect(isBusinessDay('2027-12-24', cal)).toBe(true); // extra de outro ano não vale
  });

  it('pula fim de semana e feriado; zero e negativos', () => {
    expect(addBusinessDays('2026-11-13', 2)).toBe('2026-11-17'); // sex + 2 (15/11 é domingo)
    expect(addBusinessDays('2026-11-16', 5)).toBe('2026-11-24'); // 20/11 pulado
    expect(addBusinessDays('2026-04-02', 1)).toBe('2026-04-06'); // quinta + 1 pula Sexta Santa
    expect(addBusinessDays('2026-02-13', 1)).toBe('2026-02-18'); // Carnaval
    expect(addBusinessDays('2026-11-16', 0)).toBe('2026-11-16');
    expect(addBusinessDays('2026-11-23', -1)).toBe('2026-11-19'); // volta pulando 20/11
    expect(addBusinessDays('2026-05-29', 1)).toBe('2026-06-01');
    expect(addBusinessDays('2027-05-26', 1)).toBe('2027-05-28'); // Corpus Christi 2027
  });

  it('dias úteis entre datas', () => {
    expect(businessDaysBetween('2026-11-16', '2026-11-24')).toBe(5);
  });

  it('data e hora em São Paulo', () => {
    expect(spDateTime('2026-11-19', '09:30').toISOString()).toBe('2026-11-19T12:30:00.000Z');
    expect(spYmd(new Date('2026-11-19T02:00:00Z'))).toBe('2026-11-18');
  });
});

const calendar = { extraHolidays: [] };
const rule = (over: Partial<RuleRow>): RuleRow => ({
  id: 1,
  trigger: 'interaction_logged',
  stageId: null,
  interactionOutcome: null,
  interactionDirection: null,
  interactionType: null,
  cadence: [
    { offsetBusinessDays: 2, time: '10:00', title: 'F1' },
    { offsetBusinessDays: 5, time: '10:00', title: 'F2' },
    { offsetBusinessDays: 10, time: '10:00', title: 'F3' },
  ],
  cancelOn: { inboundInteraction: true, stageLeft: true },
  ...over,
});
const proposal = rule({ id: 2, interactionType: 'proposal' });
const firstContact = rule({ id: 1, interactionDirection: 'outbound' });
const at = new Date('2026-11-16T15:00:00Z'); // segunda
const logged = (over: object = {}) =>
  ({
    kind: 'interaction_logged',
    anchor: 'i1',
    dealId: 'd1',
    type: 'proposal',
    direction: 'outbound',
    outcome: null,
    at,
    leadStatus: 'negotiating',
    ...over,
  }) as const;

describe('motor de regras (planejamento)', () => {
  it('proposta cria 3 lembretes nos dias úteis certos, com feriado no meio', () => {
    const plan = planFollowups({
      event: logged(),
      rules: [firstContact, proposal],
      open: [],
      existingKeys: new Set(),
      calendar,
    });
    expect(plan.create.map((c) => c.dueAt.toISOString())).toEqual([
      '2026-11-18T13:00:00.000Z',
      '2026-11-24T13:00:00.000Z', // 20/11 (feriado) pulado
      '2026-12-01T13:00:00.000Z',
    ]);
    expect(plan.create.map((c) => c.dedupeKey)).toEqual([
      'rule:2:step:0:anchor:i1',
      'rule:2:step:1:anchor:i1',
      'rule:2:step:2:anchor:i1',
    ]);
  });

  it('sem resposta só vale com lead em Abordado, tipo de contato e resultado neutro', () => {
    const plan = (over: object) =>
      planFollowups({
        event: logged({ type: 'whatsapp', leadStatus: 'contacted', ...over }),
        rules: [firstContact],
        open: [],
        existingKeys: new Set(),
      }).create.length;
    expect(plan({})).toBe(3);
    expect(plan({ outcome: 'no_answer' })).toBe(3);
    expect(plan({ leadStatus: 'replied' })).toBe(0);
    expect(plan({ outcome: 'interested' })).toBe(0);
    expect(plan({ type: 'note' })).toBe(0);
    expect(plan({ direction: 'inbound' })).toBe(0);
  });

  it('inbound cancela os abertos das regras com cancel_on; etapa deixada só no mesmo deal', () => {
    const open = [
      { id: 'a', ruleId: 1, dealId: 'd1' },
      { id: 'b', ruleId: 3, dealId: 'd1' }, // regra sem cancel_on
    ];
    const rules = [firstContact, rule({ id: 3, trigger: 'deal_created', cancelOn: {} })];
    const inbound = planFollowups({
      event: logged({ type: 'whatsapp', direction: 'inbound' }),
      rules,
      open,
      existingKeys: new Set(),
    });
    expect(inbound.cancel).toEqual(['a']);
    const moved = (dealId: string) =>
      planFollowups({
        event: { kind: 'deal_stage_entered', anchor: 'h1', dealId, stageId: 3, at },
        rules,
        open,
        existingKeys: new Set(),
      }).cancel;
    expect(moved('d1')).toEqual(['a']);
    expect(moved('d2')).toEqual([]);
  });

  it('dedupe: chaves existentes não recriam; replay não cancela nem substitui', () => {
    const base = { event: logged(), rules: [proposal], calendar };
    const keys = new Set(['rule:2:step:0:anchor:i1', 'rule:2:step:1:anchor:i1']);
    const p = planFollowups({ ...base, open: [], existingKeys: keys });
    expect(p.create.map((c) => c.stepIndex)).toEqual([2]);
    const open = [{ id: 'x', ruleId: 2, dealId: 'd1' }];
    expect(planFollowups({ ...base, open, existingKeys: keys }).cancel).toEqual(['x']);
    expect(planFollowups({ ...base, open, existingKeys: keys, replay: true }).cancel).toEqual([]);
    const all = new Set([...keys, 'rule:2:step:2:anchor:i1']);
    expect(planFollowups({ ...base, open, existingKeys: all }).cancel).toEqual([]);
  });

  it('reunião marcada usa a data informada menos 1 dia útil; retomar aceita offset editável', () => {
    const meeting = rule({
      id: 4,
      interactionOutcome: 'meeting_set',
      cadence: [{ offsetBusinessDays: -1, time: '09:00', title: 'Preparar diagnóstico' }],
      cancelOn: {},
    });
    const p = planFollowups({
      event: logged({ type: 'call', outcome: 'meeting_set', meetingOn: '2026-11-23' }),
      rules: [meeting],
      open: [],
      existingKeys: new Set(),
    });
    expect(p.create[0]!.dueAt.toISOString()).toBe('2026-11-19T12:00:00.000Z'); // 20/11 pulado
    const later = rule({
      id: 5,
      interactionOutcome: 'asked_later',
      cadence: [{ offsetBusinessDays: 20, time: '09:30', title: 'Retomar' }],
    });
    const r = planFollowups({
      event: logged({
        type: 'whatsapp',
        direction: 'inbound',
        outcome: 'asked_later',
        resumeInDays: 3,
      }),
      rules: [later],
      open: [],
      existingKeys: new Set(),
    });
    expect(r.create[0]!.dueAt.toISOString()).toBe('2026-11-19T12:30:00.000Z');
  });

  it('gatilhos de etapa respeitam stage_id', () => {
    const won = rule({
      id: 6,
      trigger: 'deal_stage_entered',
      stageId: 7,
      cadence: [{ offsetBusinessDays: 1, time: '09:30', title: 'Onboarding' }],
      cancelOn: {},
    });
    const ev = (stageId: number) =>
      ({ kind: 'deal_stage_entered', anchor: 'h2', dealId: 'd1', stageId, at }) as const;
    const run = (stageId: number) =>
      planFollowups({ event: ev(stageId), rules: [won], open: [], existingKeys: new Set() }).create;
    expect(run(7)).toHaveLength(1);
    expect(run(4)).toHaveLength(0);
  });
});

describe('modelos de mensagem', () => {
  it('saudacao pela hora de São Paulo', () => {
    expect(greeting(new Date('2026-11-19T12:00:00Z'))).toBe('Bom dia'); // 09h
    expect(greeting(new Date('2026-11-19T15:00:00Z'))).toBe('Boa tarde'); // 12h
    expect(greeting(new Date('2026-11-19T21:00:00Z'))).toBe('Boa noite'); // 18h
    expect(greeting(new Date('2026-11-19T02:00:00Z'))).toBe('Boa noite');
  });

  it('substitui variáveis, avisa as ausentes e bloqueia com {{', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    const ok = renderTemplate('{{saudacao}}, {{ nome_negocio }}!', { nome_negocio: 'Café' }, now);
    expect(ok).toEqual({ text: 'Bom dia, Café!', missing: [], blocked: false });
    const bad = renderTemplate(
      'Oi {{nome_negocio}} {{bairro}} {{xyz}}',
      { nome_negocio: 'Café', bairro: ' ' },
      now,
    );
    expect(bad.missing).toEqual(['bairro', 'xyz']);
    expect(bad.blocked).toBe(true);
    expect(bad.text).toBe('Oi Café {{bairro}} {{xyz}}');
  });
});

describe('cifra AES-256-GCM', () => {
  const keys = { v1: 'a'.repeat(32), v2: 'b'.repeat(32) };
  it('ida e volta com prefixo de versão', () => {
    const blob = encrypt('refresh-token', keys);
    expect(blob.startsWith('v1.')).toBe(true);
    expect(blob).not.toContain('refresh-token');
    expect(decrypt(blob, keys)).toBe('refresh-token');
    expect(encrypt('x', keys) === encrypt('x', keys)).toBe(false); // IV aleatório
  });
  it('rotação: lê a versão antiga e cifra com a nova', () => {
    const old = encrypt('tok', keys, 'v1');
    expect(encrypt('tok', keys, 'v2').startsWith('v2.')).toBe(true);
    expect(decrypt(old, keys)).toBe('tok');
  });
  it('rejeita adulteração, chave errada e formato inválido', () => {
    const blob = encrypt('tok', keys);
    const parts = blob.split('.');
    parts[3] = Buffer.from('zzzz').toString('base64url');
    expect(() => decrypt(parts.join('.'), keys)).toThrow();
    expect(() => decrypt(blob, { v1: 'c'.repeat(32) })).toThrow();
    expect(() => decrypt('lixo', keys)).toThrow();
  });
});

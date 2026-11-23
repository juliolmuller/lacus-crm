// Seeds idempotentes: `bun run db:seed`. Nunca sobrescreve o que o Júlio já editou (ON CONFLICT DO NOTHING).
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type SettingKey } from '@/lib/validation/settings';

config({ path: '.env.local', quiet: true });

const { getDb } = await import('@/lib/db');
const s = await import('@/lib/db/schema');
const { parseSetting, settingDefaults } = await import('@/lib/validation/settings');
const { cadence, cancelOn } = await import('@/lib/validation/followups');
const { parseNichesCsv } = await import('@/lib/niches');

const db = getDb();

// --- Etapas do funil (PLAN D2) ---
const stages = [
  {
    key: 'to_diagnose',
    name: 'A diagnosticar',
    color: 'stage-1',
    prob: 5,
    leadStatus: 'to_contact',
  },
  { key: 'to_contact', name: 'A abordar', color: 'stage-2', prob: 10, leadStatus: 'to_contact' },
  { key: 'contacted', name: 'Abordado', color: 'stage-3', prob: 20, leadStatus: 'contacted' },
  { key: 'talking', name: 'Em conversa', color: 'stage-4', prob: 35, leadStatus: 'replied' },
  {
    key: 'negotiating',
    name: 'Em negociação',
    color: 'stage-5',
    prob: 60,
    leadStatus: 'negotiating',
  },
  { key: 'won', name: 'Ganho', color: 'stage-won', prob: 100, leadStatus: 'client', isWon: true },
  { key: 'lost', name: 'Perdido', color: 'stage-lost', prob: 0, leadStatus: 'lost', isLost: true },
] as const;

await db
  .insert(s.dealStages)
  .values(
    stages.map((st, i) => ({
      key: st.key,
      name: st.name,
      color: st.color,
      sort: i + 1,
      isWon: 'isWon' in st,
      isLost: 'isLost' in st,
      defaultProbability: st.prob,
      leadStatus: st.leadStatus,
    })),
  )
  .onConflictDoNothing({ target: s.dealStages.key });

// --- Settings (cada valor passa pelo Zod antes de gravar) ---
await db
  .insert(s.settings)
  .values(
    (Object.keys(settingDefaults) as SettingKey[]).map((key) => ({
      key,
      value: parseSetting(key, settingDefaults[key]),
    })),
  )
  .onConflictDoNothing({ target: s.settings.key });

// --- Modelos de mensagem (textos genéricos) ---
const OPT_OUT =
  'Se preferir não receber mensagens minhas, é só avisar que não entro mais em contato.';
const templates = [
  {
    key: 'first_contact',
    name: 'Primeiro contato – WhatsApp',
    body: `{{saudacao}}! Aqui é {{meu_nome}}. Encontrei o {{nome_negocio}} no Google, em {{bairro}}, e {{argumento}} Posso te mostrar uma ideia rápida, sem compromisso? ${OPT_OUT}`,
  },
  {
    key: 'followup_1',
    name: 'Follow-up 1',
    body: '{{saudacao}}! Passando para saber se você viu minha mensagem sobre o {{nome_negocio}}. Se fizer sentido, te explico em poucos minutos como funciona.',
  },
  {
    key: 'followup_2',
    name: 'Follow-up 2 (último)',
    body: '{{saudacao}}! Esta é minha última mensagem sobre o assunto, para não incomodar. Se mudar de ideia, é só me chamar. Meu portfólio: {{link_portfolio}}',
  },
  {
    key: 'proposal',
    name: 'Envio de proposta',
    body: '{{saudacao}}! Conforme conversamos, segue a proposta para o {{nome_negocio}}. Qualquer dúvida, estou à disposição. {{meu_nome}}',
  },
  {
    key: 'resume',
    name: 'Retomada',
    body: '{{saudacao}}! Você tinha pedido para falarmos mais para frente sobre o site do {{nome_negocio}}. Podemos retomar a conversa agora?',
  },
].map((t) => ({ ...t, channel: 'whatsapp' as const }));

await db
  .insert(s.messageTemplates)
  .values(templates)
  .onConflictDoNothing({ target: s.messageTemplates.key });

// --- Regras de follow-up (SPEC 11 adaptada ao PLAN D2) ---
// "Negociação parada" roda no job diário (fase 4), sem linha em followup_rules.
const wonStage = await db.query.dealStages.findFirst({ where: eq(s.dealStages.key, 'won') });
const step = (
  offsetBusinessDays: number,
  time: string,
  title: string,
  templateKey?: string,
  suggestStatus?: 'no_response',
): Record<string, number | string> => ({
  offsetBusinessDays,
  time,
  title,
  ...(templateKey && { templateKey }),
  ...(suggestStatus && { suggestStatus }),
});
const rules = [
  {
    name: 'Sem resposta ao 1º contato',
    trigger: 'interaction_logged',
    interactionDirection: 'outbound',
    cadence: [
      step(2, '09:30', 'Follow-up 1', 'followup_1'),
      step(5, '09:30', 'Follow-up 2'),
      step(10, '09:30', 'Follow-up 3', 'followup_2', 'no_response'),
    ],
    cancelOn: { inboundInteraction: true, stageLeft: true },
  },
  {
    name: 'Proposta enviada',
    trigger: 'interaction_logged',
    interactionType: 'proposal',
    cadence: [
      step(2, '10:00', 'Follow-up da proposta 1'),
      step(5, '10:00', 'Follow-up da proposta 2'),
      step(10, '10:00', 'Follow-up da proposta 3'),
    ],
    cancelOn: { inboundInteraction: true, stageLeft: true },
  },
  {
    name: 'Pediu para retomar depois',
    trigger: 'interaction_logged',
    interactionOutcome: 'asked_later',
    cadence: [step(20, '09:30', 'Retomar contato', 'resume')],
    cancelOn: { inboundInteraction: true },
  },
  {
    name: 'Reunião marcada',
    trigger: 'interaction_logged',
    interactionOutcome: 'meeting_set',
    cadence: [step(-1, '09:00', 'Preparar diagnóstico')],
    cancelOn: {},
  },
  {
    name: 'Ganho',
    trigger: 'deal_stage_entered',
    stageId: wonStage?.id,
    cadence: [step(1, '09:30', 'Onboarding: coletar materiais')],
    cancelOn: {},
  },
] as const;

const existing = new Set(
  (await db.select({ name: s.followupRules.name }).from(s.followupRules)).map((r) => r.name),
);
const fresh = rules.filter((r) => !existing.has(r.name));

if (fresh.length) {
  await db.insert(s.followupRules).values(
    fresh.map((r, i) => ({
      ...r,
      cadence: cadence.parse(r.cadence),
      cancelOn: cancelOn.parse(r.cancelOn),
      sort: existing.size + i + 1,
    })),
  );
}

// --- Nichos: só do CSV exportado da aba "Nichos" (.data/ fica fora do git) ---
const csvPath = join(import.meta.dirname, '..', '.data', 'nichos.csv');
let nichesNote = 'PENDENTE: .data/nichos.csv não encontrado, nichos não importados';

if (process.env.SEED_SKIP_NICHES) nichesNote = 'nichos ignorados (SEED_SKIP_NICHES)';
else if (existsSync(csvPath)) {
  const rows = parseNichesCsv(readFileSync(csvPath, 'utf8'));

  await db.insert(s.niches).values(rows).onConflictDoNothing({ target: s.niches.name });
  nichesNote = `${rows.length} nichos lidos de .data/nichos.csv`;
}

console.info(
  `Seed ok: ${stages.length} etapas, settings, ${templates.length} modelos, ${fresh.length} regras novas; ${nichesNote}`,
);
process.exit(0);

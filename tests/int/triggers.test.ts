import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const client = new Client({ connectionString: process.env.DATABASE_URL });

beforeAll(() => client.connect());
afterAll(() => client.end());
// cada teste roda numa transação revertida
beforeEach(() => client.query('BEGIN'));
afterEach(() => client.query('ROLLBACK'));

const one = async <T = { id: string }>(sql: string, params: unknown[] = []) =>
  (await client.query(sql, params)).rows[0] as T;

async function fixtures() {
  const niche = await one('INSERT INTO niches (name) VALUES ($1) RETURNING id', ['Nicho de teste']);
  const region = await one(
    'INSERT INTO regions (state, city, label) VALUES ($1, $2, $3) RETURNING id',
    ['PR', 'Curitiba', 'PR - Curitiba'],
  );
  const stage = await one(
    "INSERT INTO deal_stages (key, name, color, sort) VALUES ('t', 'T', 'stage-1', 1) RETURNING id",
  );
  const lead = (dnc: boolean) =>
    one(
      'INSERT INTO leads (name, niche_id, region_id, do_not_contact) VALUES ($1, $2, $3, $4) RETURNING id',
      ['Lead de teste', niche.id, region.id, dnc],
    );
  const deal = (leadId: string) =>
    one(
      "INSERT INTO deals (lead_id, stage_id, title, position) VALUES ($1, $2, 'D', 'a0') RETURNING id",
      [leadId, stage.id],
    );
  const reminder = (leadId: string, dealId: string | null = null) =>
    one<{ id: string; lead_id: string }>(
      "INSERT INTO reminders (lead_id, deal_id, title, due_at) VALUES ($1, $2, 'R', now()) RETURNING id, lead_id",
      [leadId, dealId],
    );
  return { lead, deal, reminder };
}

// Um SAVEPOINT por falha esperada: depois de um erro a transação fica abortada.
async function rejects(run: () => Promise<unknown>) {
  await client.query('SAVEPOINT s');
  await expect(run()).rejects.toThrow('LEAD_DO_NOT_CONTACT');
  await client.query('ROLLBACK TO s');
}

describe('triggers de do_not_contact', () => {
  it('bloqueia deal novo para lead marcado e aceita para lead normal', async () => {
    const f = await fixtures();
    const blocked = await f.lead(true);
    const ok = await f.lead(false);
    await rejects(() => f.deal(blocked.id));
    await expect(f.deal(ok.id)).resolves.toBeTruthy();
  });

  it('bloqueia lembrete novo para lead marcado, com ou sem deal', async () => {
    const f = await fixtures();
    const ok = await f.lead(false);
    const blocked = await f.lead(true);
    await rejects(() => f.reminder(blocked.id));
    const deal = await f.deal(ok.id);
    await client.query('UPDATE leads SET do_not_contact = true WHERE id = $1', [ok.id]);
    // lead_id enviado é de outro lead, mas o trigger usa o lead do deal (marcado)
    const other = await f.lead(false);
    await rejects(() => f.reminder(other.id, deal.id));
    await expect(f.reminder(other.id)).resolves.toBeTruthy();
  });
});

describe('trigger de lead_id do lembrete', () => {
  it('força lead_id = lead do deal no INSERT e no UPDATE', async () => {
    const f = await fixtures();
    const a = await f.lead(false);
    const b = await f.lead(false);
    const dealA = await f.deal(a.id);
    const dealB = await f.deal(b.id);
    const r = await f.reminder(b.id, dealA.id);
    expect(r.lead_id).toBe(a.id);
    const updated = await one<{ lead_id: string }>(
      'UPDATE reminders SET deal_id = $1 WHERE id = $2 RETURNING lead_id',
      [dealB.id, r.id],
    );
    expect(updated.lead_id).toBe(b.id);
  });
});

describe('updated_at e integridade', () => {
  it('sobrescreve updated_at com now() em qualquer UPDATE', async () => {
    const f = await fixtures();
    const lead = await f.lead(false);
    const row = await one<{ updated_at: Date }>(
      "UPDATE leads SET updated_at = '2000-01-01' WHERE id = $1 RETURNING updated_at",
      [lead.id],
    );
    expect(row.updated_at.getFullYear()).toBeGreaterThan(2000);
  });

  it('permite no máximo uma negociação aberta por lead', async () => {
    const f = await fixtures();
    const lead = await f.lead(false);
    await f.deal(lead.id);
    await client.query('SAVEPOINT s');
    await expect(f.deal(lead.id)).rejects.toThrow('deals_one_open_per_lead_idx');
    await client.query('ROLLBACK TO s');
  });
});

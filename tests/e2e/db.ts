import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { generateKeyBetween } from 'fractional-indexing';
import { Client } from 'pg';

config({ path: '.env.local', quiet: true });

/** Cria um lead (e, se pedido, uma negociação aberta no fim da etapa) direto no banco: rápido e sem depender da UI. */
export async function seedDeals(names: string[], stageKey: string | null) {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows: nr } = await db.query('select id from niches order by id limit 1');
    const { rows: rr } = await db.query('select id from regions order by id limit 1');
    const { rows: st } = stageKey
      ? await db.query('select id from deal_stages where key = $1', [stageKey])
      : { rows: [] };
    const out: { id: string; name: string; dealId?: string }[] = [];
    for (const name of names) {
      const id = randomUUID();
      await db.query(
        `insert into leads (id, name, name_normalized, niche_id, region_id, data_source, contact_status)
         values ($1, $2, lower($2), $3, $4, 'manual', 'to_contact')`,
        [id, name, nr[0].id, rr[0].id],
      );
      let dealId: string | undefined;
      if (st[0]) {
        const { rows: last } = await db.query(
          'select position from deals where stage_id = $1 order by position desc limit 1',
          [st[0].id],
        );
        const r = await db.query(
          `insert into deals (lead_id, stage_id, title, position) values ($1, $2, $3, $4) returning id`,
          [id, st[0].id, name, generateKeyBetween(last[0]?.position ?? null, null)],
        );
        dealId = r.rows[0].id;
      }
      out.push({ id, name, dealId });
    }
    return out;
  } finally {
    await db.end();
  }
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    return (await db.query(sql, params)).rows as T[];
  } finally {
    await db.end();
  }
}

/** Apaga os leads de teste (a cascata leva deals, histórico e interações). */
export const removeLeads = (ids: string[]) =>
  query('delete from leads where id = any($1::uuid[])', [ids]);

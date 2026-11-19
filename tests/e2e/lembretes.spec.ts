import { expect, test, type Page } from '@playwright/test';
import { query, removeLeads, seedDeals } from './db';

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const created: string[] = [];
test.afterEach(async () => {
  await removeLeads(created.splice(0));
});

async function seedLead(name: string, stage: string | null = null) {
  const [row] = await seedDeals([name], stage);
  created.push(row!.id);
  return row!;
}

const addReminder = (leadId: string, title: string, dueSql: string) =>
  query(`insert into reminders (lead_id, title, due_at) values ($1, $2, ${dueSql}) returning id`, [
    leadId,
    title,
  ]);

const item = (page: Page, title: string) => page.getByTestId('reminder').filter({ hasText: title });

test('lembretes: adiar leva para Próximos; concluir leva para Concluídos', async ({ page }) => {
  const tag = stamp();
  const lead = await seedLead(`E2E Lembrete ${tag}`);
  await addReminder(lead.id, `Ligar ${tag}`, "now() - interval '2 hours'");
  await addReminder(lead.id, `Enviar ${tag}`, "now() - interval '1 hour'");

  await page.goto('/api/e2e/login?next=/lembretes?tab=overdue');
  await expect(page.getByRole('heading', { name: 'Lembretes', level: 1 })).toBeVisible();
  await expect(item(page, `Ligar ${tag}`)).toContainText('Atrasado');

  // adiar: amanhã, 9h30
  await item(page, `Ligar ${tag}`).getByRole('button', { name: 'Adiar' }).click();
  await page.getByRole('button', { name: 'Amanhã, 9h30' }).click();
  await expect(item(page, `Ligar ${tag}`)).toHaveCount(0);
  const [moved] = await query<{ due_at: Date; snooze_count: number; sync_status: string }>(
    'select due_at, snooze_count, sync_status from reminders where title = $1',
    [`Ligar ${tag}`],
  );
  expect(moved!.snooze_count).toBe(1);
  expect(moved!.sync_status).not.toBe('error');
  await page.getByRole('link', { name: 'Próximos' }).click();
  await expect(item(page, `Ligar ${tag}`)).toBeVisible();

  // concluir, sem interação
  await page.getByRole('link', { name: /Atrasados/ }).click();
  await item(page, `Enviar ${tag}`).getByRole('button', { name: 'Concluir' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(item(page, `Enviar ${tag}`)).toHaveCount(0);
  await page.getByRole('link', { name: 'Concluídos' }).click();
  await expect(item(page, `Enviar ${tag}`)).toBeVisible();
  const [done] = await query<{ status: string }>('select status from reminders where title = $1', [
    `Enviar ${tag}`,
  ]);
  expect(done!.status).toBe('done');
});

test('concluir registrando uma interação', async ({ page }) => {
  const tag = stamp();
  const lead = await seedLead(`E2E Concluir ${tag}`);
  await addReminder(lead.id, `Retorno ${tag}`, "now() - interval '1 hour'");
  await page.goto('/api/e2e/login?next=/lembretes?tab=overdue');
  await item(page, `Retorno ${tag}`).getByRole('button', { name: 'Concluir' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Registrar uma interação junto').check();
  await dialog.getByLabel('Resumo').fill(`Falei por telefone ${tag}`);
  await dialog.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(item(page, `Retorno ${tag}`)).toHaveCount(0);
  const rows = await query<{ n: string }>(
    "select count(*)::text as n from interactions where lead_id = $1 and summary like 'Falei por telefone%'",
    [lead.id],
  );
  expect(rows[0]!.n).toBe('1');
});

test('interação Proposta no lead cria 3 lembretes e a aba mostra os atalhos de data', async ({
  page,
}) => {
  const tag = stamp();
  const lead = await seedLead(`E2E Proposta ${tag}`, 'negotiating');
  await page.goto(`/api/e2e/login?next=/leads/${lead.id}`);
  await page.getByRole('tab', { name: /Interações/ }).click();
  await page.getByLabel('Tipo').selectOption('proposal');
  await page.getByRole('textbox', { name: 'Resumo', exact: true }).fill(`Proposta enviada ${tag}`);
  await page.getByRole('button', { name: 'Registrar interação' }).click();
  await expect(page.getByText(/3 lembretes criados/)).toBeVisible();
  await page.getByRole('tab', { name: 'Lembretes' }).click();
  for (const n of [1, 2, 3]) await expect(item(page, `Follow-up da proposta ${n}`)).toBeVisible();
  const rows = await query<{ n: string }>(
    "select count(*)::text as n from reminders where lead_id = $1 and source = 'rule'",
    [lead.id],
  );
  expect(rows[0]!.n).toBe('3');

  // lembrete manual por atalho
  await page.getByLabel('Novo lembrete').fill(`Ligar ${tag}`);
  await page.getByRole('button', { name: 'Amanhã, 9h30' }).click();
  await expect(item(page, `Ligar ${tag}`)).toBeVisible();

  // um inbound cancela os pendentes das regras
  await page.getByRole('tab', { name: /Interações/ }).click();
  await page.getByLabel('Direção').selectOption('inbound');
  await page.getByRole('textbox', { name: 'Resumo', exact: true }).fill(`Respondeu ${tag}`);
  await page.getByRole('button', { name: 'Registrar interação' }).click();
  await expect(page.getByText('Interação registrada').last()).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await query<{ n: string }>(
            "select count(*)::text as n from reminders where lead_id = $1 and source = 'rule' and status = 'open'",
            [lead.id],
          )
        )[0]!.n,
    )
    .toBe('0');
});

test('o cartão do funil mostra o próximo follow-up, em vermelho se atrasado', async ({ page }) => {
  const tag = stamp();
  const lead = await seedLead(`E2E Cartão ${tag}`, 'to_contact');
  await addReminder(lead.id, `Atrasado ${tag}`, "now() - interval '3 hours'");
  await page.goto('/api/e2e/login?next=/funil');
  const card = page.getByRole('button', { name: new RegExp(`^E2E Cartão ${tag}`) });
  if ((await card.count()) === 0)
    await page
      .getByRole('navigation', { name: 'Etapas' })
      .getByRole('button', { name: /A abordar/ })
      .click();
  await expect(card.getByText(/Follow-up: \d{2}\/\d{2}/)).toBeVisible();
  await expect(card.getByText(/Follow-up: \d{2}\/\d{2}/)).toHaveClass(/text-danger-text/);
});

test.describe('somente desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'estado global (uma conexão Google; um job por vez)');

  test('invalid_grant: o banner pede para reconectar e some ao conectar', async ({ page }) => {
    const [existing] = await query('select id from google_connections limit 1');
    test.skip(!!existing, 'já existe uma conexão Google real neste banco');
    const [row] = await query<{ id: number }>(
      `insert into google_connections (google_email, refresh_token_enc, status, last_error)
       values ('e2e@example.com', 'v1.x.x.x', 'needs_reauth', 'invalid_grant') returning id`,
    );
    try {
      await page.goto('/api/e2e/login?next=/lembretes');
      const banner = page.getByTestId('google-banner');
      await expect(banner).toContainText('precisa ser reconectado');
      await expect(banner.getByRole('link', { name: 'Reconectar' })).toHaveAttribute(
        'href',
        '/api/google/connect',
      );
    } finally {
      await query('delete from google_connections where id = $1', [row!.id]);
    }
  });

  test('job de follow-ups: exige CRON_SECRET e é idempotente por ce-id', async ({ request }) => {
    const url = '/api/jobs/followups';
    expect((await request.post(url)).status()).toBe(401);
    expect(
      (await request.post(url, { headers: { authorization: 'Bearer errado' } })).status(),
    ).toBe(401);
    const headers = {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      'ce-id': `e2e-${stamp()}`,
    };
    const first = await request.post(url, { headers });
    expect(first.status()).toBe(200);
    expect((await first.json()).duplicate).toBe(false);
    const second = await request.post(url, { headers });
    expect(await second.json()).toEqual({ duplicate: true });
  });
});

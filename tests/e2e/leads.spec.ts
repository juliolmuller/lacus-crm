import { expect, test, type Page } from '@playwright/test';

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const phone = () => `(41) 9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

async function login(page: Page, next = '/leads') {
  await page.goto(`/api/e2e/login?next=${next}`);
  await expect(page).toHaveURL(new RegExp(next.replace('/', '\\/')));
}

async function createLead(page: Page, name: string, tel: string) {
  await page.getByRole('button', { name: 'Novo lead' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo lead' });
  await dialog.getByLabel('Nome do negócio').fill(name);
  await dialog.getByLabel('Nicho').selectOption({ index: 1 });
  await dialog.getByLabel('Cidade / bairro').fill('Xaxim, Curitiba/PR');
  await dialog.getByLabel('Telefone').fill(tel);
  await dialog.getByLabel('Nota no Maps').fill('4,8');
  await dialog.getByLabel('Avaliações no Maps').fill('50');
  return dialog;
}

async function deleteOpenLead(page: Page, name: string, fullPage = false) {
  // no celular, clicar no nome abre a rota cheia /leads/[id]; no desktop, o drawer
  const drawer = fullPage ? page.getByRole('main') : page.getByRole('dialog', { name });
  await drawer.getByRole('button', { name: 'Excluir' }).click();
  const confirm = page.getByRole('dialog', { name: 'Excluir lead' });
  await confirm.getByLabel(`Digite "${name}" para confirmar`).fill(name);
  await confirm.getByRole('button', { name: 'Excluir definitivamente' }).click();
  await expect(page.getByText('Lead excluído')).toBeVisible();
}

test('criar → editar → marcar Não contatar → excluir', async ({ page }) => {
  const name = `Clínica E2E ${stamp()}`;
  await login(page);
  const dialog = await createLead(page, name, phone());
  await dialog.getByRole('button', { name: 'Criar lead' }).click();
  await expect(page.getByText('Lead criado')).toBeVisible();
  await expect(page).toHaveURL(/lead=/);

  // score: site desconhecido (0) + nota 4,8 com 50 avaliações (20) = 20 + ticket do nicho
  const lead = page.getByRole('dialog', { name });
  await expect(lead.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(lead.getByText('Reputação', { exact: false }).first()).toBeVisible();

  // editar na aba Dados
  await lead.getByRole('tab', { name: 'Dados' }).click();
  await lead.getByLabel('Próxima ação').fill('Ligar na segunda');
  await lead.getByLabel('Situação do site').selectOption('Só rede social');
  await lead.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Lead salvo')).toBeVisible();
  await lead.getByRole('tab', { name: 'Resumo' }).click();
  await expect(lead.getByText('Ligar na segunda')).toBeVisible();
  await expect(lead.getByText('Site fraco ou ausente')).toBeVisible();

  // marcar Não contatar
  await lead.getByRole('button', { name: 'Não contatar' }).click();
  const dnc = page.getByRole('dialog', { name: 'Marcar como Não contatar' });
  await dnc.getByRole('textbox', { name: 'Motivo' }).fill('Pediu para parar (teste e2e)');
  await dnc.getByRole('button', { name: 'Marcar como Não contatar' }).click();
  await expect(page.getByText('Lead marcado como Não contatar')).toBeVisible();
  await expect(lead.getByRole('status').getByText('Pediu para parar (teste e2e)')).toBeVisible();
  await expect(lead.getByRole('button', { name: 'Não contatar' })).toHaveCount(0);

  await deleteOpenLead(page, name);
});

test('detecta duplicata e oferece abrir o existente', async ({ page }) => {
  const name = `Duplicada E2E ${stamp()}`;
  await login(page);
  let dialog = await createLead(page, name, phone());
  await dialog.getByRole('button', { name: 'Criar lead' }).click();
  await expect(page.getByText('Lead criado')).toBeVisible();

  await page.goto('/leads');
  dialog = await createLead(page, name, phone()); // mesmo nome + região, outro telefone
  await dialog.getByRole('button', { name: 'Criar lead' }).click();
  await expect(dialog.getByText('Já existe um lead parecido.')).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Leads parecidos' })).toContainText(name);
  await dialog.getByRole('button', { name: 'Abrir existente' }).click();
  await expect(page).toHaveURL(/lead=/);
  const lead = page.getByRole('dialog', { name });
  await expect(lead.getByRole('heading', { name, level: 1 })).toBeVisible();
  await deleteOpenLead(page, name);
});

test('tabela virtualizada, busca e edição inline persistem', async ({ page, isMobile }) => {
  const name = `Inline E2E ${stamp()}`;
  await login(page);
  const dialog = await createLead(page, name, phone());
  await dialog.getByRole('button', { name: 'Criar lead' }).click();
  await expect(page.getByText('Lead criado')).toBeVisible();
  await page.goto('/leads');

  await page.getByRole('searchbox', { name: 'Buscar leads' }).fill(name);
  await expect(page).toHaveURL(/q=/);
  const row = page.getByTestId('lead-row').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  // antes da hidratação a edição não dispara a Server Action: repete até o POST sair
  const saves = (edit: () => Promise<unknown>) =>
    expect(async () => {
      const done = page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 3000 });
      await edit();
      await done;
    }).toPass();
  await saves(() => row.getByLabel(`Status de ${name}`).selectOption('Abordado'));
  await saves(async () => {
    await row.getByLabel(`Prioridade de ${name}`).fill('7');
    await row.getByLabel(`Prioridade de ${name}`).blur();
  });

  await page.reload();
  const again = page.getByTestId('lead-row').filter({ hasText: name });
  await expect(again.getByLabel(`Status de ${name}`)).toHaveValue('contacted');
  await expect(again.getByLabel(`Prioridade de ${name}`)).toHaveValue('7');
  await again.getByRole('button', { name }).click();
  await deleteOpenLead(page, name, isMobile);
});

test('importação mostra a simulação sem gravar e a exportação traz os 39 cabeçalhos', async ({
  page,
}) => {
  await login(page, '/leads/importar');
  await page.getByLabel('Arquivo CSV').setInputFiles('tests/fixtures/leads-e2e.csv');
  await page.getByRole('button', { name: 'Simular importação' }).click();
  await expect(page.getByText('Criar: 2')).toBeVisible();
  await expect(page.getByText('Erros: 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Baixar relatório' })).toBeVisible();

  const res = await page.request.get('/api/leads/export?sep=,');
  expect(res.status()).toBe(200);
  const csv = await res.text();
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv.split('\r\n')[0]!.split('","')).toHaveLength(39);
});

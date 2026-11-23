// O dev server compila cada rota na 1ª visita (lento neste disco); aquecer antes evita timeouts nos testes.
export default async function warmup(): Promise<void> {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
  const login = await fetch(`${base}/api/e2e/login`, { redirect: 'manual' });
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const nil = '00000000-0000-4000-8000-000000000000';
  for (const path of [
    '/login',
    '/',
    '/mais',
    '/leads',
    `/leads?lead=${nil}`,
    `/leads/${nil}`,
    '/leads/importar',
    '/api/leads/export',
    '/api/leads/import',
    '/design-system',
    '/funil',
    `/funil?deal=${nil}`,
    '/configuracoes',
    '/lembretes',
  ]) {
    await fetch(base + path, { headers: { cookie } });
  }
}

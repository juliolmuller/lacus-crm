// O dev server compila cada rota na 1ª visita (lento neste disco); aquecer antes evita timeouts nos testes.
export default async function warmup() {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
  const login = await fetch(`${base}/api/e2e/login`, { redirect: 'manual' });
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  for (const path of ['/login', '/', '/mais', '/leads', '/design-system']) {
    await fetch(base + path, { headers: { cookie } });
  }
}

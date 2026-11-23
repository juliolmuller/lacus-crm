// Regras de cache do service worker (SPEC 8). Funções puras para poder testar fora do worker.

/**
 * Nunca entram em cache de runtime, nem por engano de configuração.
 */
const NEVER = [
  /^\/api\/auth(\/|$)/,
  /^\/api\/mcp/,
  /^\/api\/v1(\/|$)/,
  /^\/api\/jobs(\/|$)/,
  /^\/api\/google(\/|$)/,
  /^\/\.well-known(\/|$)/,
];

export const SNAPSHOT_PATH = '/api/offline/snapshot';

interface Req {
  headers: { has(name: string): boolean };
  method: string;
  url: string;
}

export function neverCache(req: Req): boolean {
  const { pathname } = new URL(req.url);

  return (
    req.method !== 'GET'
    || req.headers.has('next-action') // Server Action
    || NEVER.some((re) => re.test(pathname))
  );
}

/**
 * A única rota de runtime com cache é o snapshot; HTML autenticado e RSC ficam
 * de fora.
 */
export const cacheableAtRuntime = (req: Req): boolean =>
  !neverCache(req) && new URL(req.url).pathname === SNAPSHOT_PATH;

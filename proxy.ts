import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

// Rotas que não exigem cookie de sessão (SPEC 5.3). Cada handler faz a própria checagem.
const PUBLIC = [
  /^\/login(\/|$)/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/mcp(\/|$)/,
  /^\/api\/v1(\/|$)/,
  /^\/api\/jobs(\/|$)/,
  /^\/api\/google\/callback$/,
  /^\/api\/e2e\/login$/, // responde 404 fora do modo E2E
  /^\/~offline$/,
  /^\/serwist(\/|$)/,
  /^\/manifest\.webmanifest$/,
  /^\/\.well-known(\/|$)/,
];

function csp(nonce: string) {
  const dev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Estilos inline (atributos style, Tailwind, sonner) não aceitam nonce; scripts seguem protegidos.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Checagem otimista: só a existência do cookie. A validação real é a DAL (`requireOwner`).
  if (!PUBLIC.some((re) => re.test(pathname)) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = csp(nonce);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  // Fora: assets estáticos, ícones da marca e o service worker.
  matcher: [
    {
      source: '/((?!_next/static|_next/image|brand/|favicon.ico|sw.js|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};

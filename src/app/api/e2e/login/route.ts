import { NextResponse } from 'next/server';

import { isE2EBypassActive } from '@/lib/auth/bypass';

export const runtime = 'nodejs';

/**
 * Login para testes E2E. Responde 404 em qualquer ambiente fora de
 * E2E_AUTH_BYPASS=1 sem produção/Vercel.
 */
export async function GET(request: Request): Promise<NextResponse<unknown>> {
  if (!isE2EBypassActive()) return new NextResponse(null, { status: 404 });

  const { e2eLogin } = await import('@/lib/auth/e2e');
  const { cookies } = await e2eLogin();
  const next = new URL(request.url).searchParams.get('next');
  const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/';
  const response = NextResponse.redirect(new URL(target, request.url));
  for (const c of cookies) {
    response.cookies.set(c.name, c.value, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: c.secure,
    });
  }

  return response;
}

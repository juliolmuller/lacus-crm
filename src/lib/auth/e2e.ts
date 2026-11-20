// Instância só para testes E2E (mesmo secret e banco, mais o plugin testUtils). Nunca importada em produção.
import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { authOptions } from './auth';
import { E2E_EMAIL, E2E_SUB } from './bypass';

async function setup() {
  const options = authOptions();
  // Sem a allowlist do OAuth: o usuário de teste é criado direto no banco.
  const testAuth = betterAuth({
    ...options,
    user: { ...options.user, validateUserInfo: undefined },
    plugins: [...options.plugins, testUtils()],
  });
  const ctx = await testAuth.$context;
  let user = await ctx.internalAdapter.findUserByEmail(E2E_EMAIL).then((r) => r?.user);
  if (!user) {
    user = await ctx.test.saveUser(
      ctx.test.createUser({ email: E2E_EMAIL, name: 'E2E Owner', emailVerified: true }),
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'vercel',
      accountId: E2E_SUB,
    });
  }
  return { ctx, userId: user.id };
}

// Uma preparação por processo: requisições paralelas dos testes não disputam a criação do usuário.
let ready: ReturnType<typeof setup> | undefined;

export async function e2eLogin() {
  const { ctx, userId } = await (ready ??= setup());
  return ctx.test.login({ userId });
}

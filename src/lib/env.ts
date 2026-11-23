import { z } from 'zod';

const optional = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .optional();

const schema = z
  .object({
    DATABASE_URL: z.string().min(1, 'obrigatória (Postgres local: veja .env.example)'),
    DATABASE_URL_UNPOOLED: optional,
    BETTER_AUTH_SECRET: z.string().min(32, 'precisa de 32+ caracteres (openssl rand -base64 32)'),
    BETTER_AUTH_URL: z.url('precisa ser uma URL, ex.: http://localhost:3000'),
    VERCEL_CLIENT_ID: optional,
    VERCEL_CLIENT_SECRET: optional,
    OWNER_VERCEL_USER_ID: optional,
    OWNER_EMAIL: optional,
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    TOKEN_ENCRYPTION_KEY: z.string().min(32, 'precisa de 32+ caracteres (openssl rand -base64 32)'),
    CRON_SECRET: z.string().min(16, 'precisa de 16+ caracteres aleatórios'),
    APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
    NEXT_PUBLIC_APP_URL: z.url('precisa ser uma URL, ex.: http://localhost:3000'),
    E2E_AUTH_BYPASS: z.enum(['0', '1']).default('0'),
  })
  .superRefine((env, ctx) => {
    if (process.env.NODE_ENV !== 'production') return;

    const need = (path: keyof typeof env, ok: unknown): void => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message: 'obrigatória em produção' });
    };

    need('VERCEL_CLIENT_ID', env.VERCEL_CLIENT_ID);
    need('VERCEL_CLIENT_SECRET', env.VERCEL_CLIENT_SECRET);
    need('OWNER_VERCEL_USER_ID', env.OWNER_VERCEL_USER_ID || env.OWNER_EMAIL);
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Valida process.env na primeira chamada e explica o que falta.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const result = schema.safeParse(process.env);

  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Variáveis de ambiente inválidas (veja .env.example):\n${lines.join('\n')}`);
  }

  return (cached = result.data);
}

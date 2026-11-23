import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';

import { getAuth } from '@/lib/auth/auth';

export const dynamic = 'force-dynamic';

// RFC 8414: o issuer é `<url>/api/auth`, então o metadata fica fora do prefixo do Better Auth.
export const GET = (req: Request): Promise<Response> =>
  oauthProviderAuthServerMetadata(getAuth() as never, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })(req);

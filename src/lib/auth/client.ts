import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { createAuthClient } from 'better-auth/react';

// oauthProviderClient: leva o pedido de autorização do MCP (OAuth) pelo login e pelo consentimento.
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });

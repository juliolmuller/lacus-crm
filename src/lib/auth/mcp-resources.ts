// Identificadores (RFC 8707/9728) dos dois servidores MCP e os escopos do app. Sem imports do servidor.
export const mcpResources = (baseUrl: string): { main: string; prospecting: string } => {
  const base = baseUrl.replace(/\/$/, '');

  return { main: `${base}/api/mcp`, prospecting: `${base}/api/mcp/prospecting` };
};

/**
 * Escopos de PAT e de OAuth: os mesmos, para o mesmo `hasScope` valer nos dois.
 */
export const SCOPES = ['read', 'write', 'prospecting'] as const;
export type Scope = (typeof SCOPES)[number];

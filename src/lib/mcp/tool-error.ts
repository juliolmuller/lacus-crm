import { type ApiError } from '@/lib/api/errors';

/**
 * Resultado de erro de ferramenta: `código: mensagem` e, só em
 * `validation_error`, as issues (com `path`) em JSON e em `structuredContent`.
 */
export function toolError(err: ApiError): {
  content: Array<{ text: string; type: 'text' }>;
  isError: true;
  structuredContent: { error: { code: string; details?: unknown; message: string } };
} {
  const details = err.code === 'validation_error' ? err.details : undefined;
  const head = `${err.code}: ${err.message}`;
  const text = details === undefined ? head : `${head}\n${JSON.stringify(details)}`;

  return {
    isError: true,
    content: [{ type: 'text', text }],
    structuredContent: {
      error: {
        code: err.code,
        message: err.message,
        ...(details === undefined ? {} : { details }),
      },
    },
  };
}

import { DealError } from '@/lib/services/deals';
import { LeadError } from '@/lib/services/leads';
import { ReminderError } from '@/lib/services/reminders';
import { UpsertError } from '@/lib/services/upsert-leads';
import { ZodError } from 'zod';

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error';

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 422,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
};

/** Erro de aplicação com o formato público `{error: {code, message, details?}}` (SPEC 9.3). */
export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
  body() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

/** Erros dos serviços e do Zod → ApiError; o resto vira 500 sem vazar detalhes. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof ZodError) return new ApiError('validation_error', 'Entrada inválida', e.issues);
  if (e instanceof LeadError)
    return new ApiError(
      e.code === 'NOT_FOUND'
        ? 'not_found'
        : e.code === 'NAME_MISMATCH'
          ? 'validation_error'
          : 'conflict',
      e.message,
    );
  if (e instanceof DealError || e instanceof ReminderError)
    return new ApiError(
      e.code === 'NOT_FOUND' || e.code === 'STAGE_NOT_FOUND'
        ? 'not_found'
        : e.code === 'USE_CLOSE'
          ? 'validation_error'
          : 'conflict',
      e.message,
    );
  if (e instanceof UpsertError) return new ApiError('validation_error', e.message);
  console.error('api error', e);
  return new ApiError('internal_error', 'Erro interno');
}

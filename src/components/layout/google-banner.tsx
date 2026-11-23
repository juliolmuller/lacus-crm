import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

import { getDb } from '@/lib/db';
import { syncOverview } from '@/lib/services/calendar-sync';

/**
 * Aviso no shell: Google precisa reconectar (invalid_grant) ou há lembretes que
 * não sincronizaram.
 */
export async function GoogleBanner(): Promise<null | React.JSX.Element> {
  const o = await syncOverview(getDb());
  const reauth = o.status === 'needs_reauth';

  if (!reauth && !(o.status === 'active' && o.errors > 0)) return null;

  return (
    <div
      role="status"
      data-testid="google-banner"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-body"
    >
      <AlertTriangle className="size-4 shrink-0 text-warning-text" aria-hidden />
      <span className="min-w-0 flex-1">
        {reauth
          ? 'O Google Calendar precisa ser reconectado. Seus lembretes continuam salvos e sincronizam de novo depois.'
          : `${o.errors} ${o.errors === 1 ? 'lembrete não sincronizou' : 'lembretes não sincronizaram'} com o Google Calendar.`}
      </span>
      {reauth ? (
        <a href="/api/google/connect" className="text-primary underline-offset-4 hover:underline">
          Reconectar
        </a>
      ) : (
        <Link
          href="/configuracoes#google"
          className="text-primary underline-offset-4 hover:underline"
        >
          Ver detalhes
        </Link>
      )}
    </div>
  );
}

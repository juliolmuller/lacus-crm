'use client';

import { ExternalLink, Pencil, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { setSessionUrl } from '@/app/(app)/leads/actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { safeUrl } from '@/lib/leads/links';

/**
 * Link da sessão do Claude (assistente de vendas) do lead, dentro da
 * negociação: abre a sessão e permite trocar o link sem sair do painel.
 */
export function SessionLink({
  leadId,
  url,
}: {
  leadId: string;
  url: null | string;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? '');
  const href = url ? safeUrl(url) : null;

  if (editing)
    return (
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await setSessionUrl(leadId, value);

            if (!r.ok) {
              toast.error(r.error);

              return;
            }

            toast.success('Link da sessão salvo');
            setEditing(false);
            router.refresh();
          });
        }}
      >
        <Field
          label="Link da sessão do Claude"
          type="url"
          inputMode="url"
          placeholder="https://claude.ai/…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-64"
        />
        <Button type="submit" size="sm" disabled={pending}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </form>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 text-body text-primary underline-offset-4 hover:underline"
        >
          <Sparkles className="size-4" aria-hidden />
          Sessão do Claude
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : (
        <span className="text-body text-text-muted">Sem link da sessão</span>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
        <Pencil className="size-4" aria-hidden />
        {href ? 'Editar link' : 'Adicionar link'}
      </Button>
    </div>
  );
}

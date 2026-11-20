'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { saveProfileAction } from '@/app/(app)/configuracoes/actions';
import { Button } from '@/components/ui/button';
import { Field, TextareaField } from '@/components/ui/field';

/** Perfil: alimenta {{meu_nome}} e {{link_portfolio}} dos modelos. */
export function ProfileSettings({
  profile,
}: {
  profile: { name?: string; signature?: string; portfolioUrl?: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveProfileAction({
            name: String(f.get('name')).trim(),
            signature: String(f.get('signature')).trim(),
            portfolioUrl: String(f.get('portfolioUrl')).trim(),
          });
          if (!r.ok) return void toast.error(r.error);
          toast.success('Perfil salvo');
          router.refresh();
        });
      }}
    >
      <Field label="Nome" name="name" defaultValue={profile.name ?? ''} />
      <Field
        label="Link do portfólio"
        name="portfolioUrl"
        type="url"
        defaultValue={profile.portfolioUrl ?? ''}
        placeholder="https://"
      />
      <TextareaField
        label="Assinatura"
        name="signature"
        defaultValue={profile.signature ?? ''}
        className="sm:col-span-2"
      />
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={pending}>
          Salvar perfil
        </Button>
      </div>
    </form>
  );
}

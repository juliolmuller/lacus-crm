'use client';

import { Handshake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { createDealAction } from '@/app/(app)/funil/actions';
import { Button } from '@/components/ui/button';

/** "Criar negociação": abre em A diagnosticar e leva para o drawer da negociação no funil. */
export function CreateDealButton({
  leadId,
  variant = 'secondary',
}: {
  leadId: string;
  variant?: 'secondary' | 'primary';
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await createDealAction(leadId);
          if (!r.ok) return void toast.error(r.error);
          toast.success('Negociação criada em A diagnosticar');
          router.push(`/funil?deal=${r.id}`);
        })
      }
    >
      <Handshake className="size-4" aria-hidden />
      Criar negociação
    </Button>
  );
}

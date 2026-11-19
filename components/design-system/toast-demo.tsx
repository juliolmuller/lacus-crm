'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => toast.success('Lead salvo')}>
        Sucesso
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast.error('Este lead está marcado como Não contatar.')}
      >
        Erro
      </Button>
      <Button variant="secondary" onClick={() => toast.info('Nova versão disponível')}>
        Info
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast('Lembretes criados', {
            duration: 8000,
            action: { label: 'Desfazer', onClick: () => toast.info('Desfeito') },
          })
        }
      >
        Com ação (8 s)
      </Button>
    </div>
  );
}

'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from './button';
import { EmptyState } from './empty-state';

/** Estado de erro de rota (`error.tsx`): mensagem curta e "Tentar novamente". */
export function RouteError({ what, reset }: { what: string; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title={`Não foi possível carregar ${what}`}
      action={<Button onClick={reset}>Tentar novamente</Button>}
    >
      Verifique a conexão com o banco e tente novamente.
    </EmptyState>
  );
}

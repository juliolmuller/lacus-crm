'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar esta tela"
      action={<Button onClick={reset}>Tentar de novo</Button>}
    >
      Verifique a conexão com o banco e tente de novo.
    </EmptyState>
  );
}

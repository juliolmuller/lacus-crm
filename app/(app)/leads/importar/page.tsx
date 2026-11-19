import type { Metadata } from 'next';
import { ImportWizard } from '@/components/leads/import-wizard';

export const metadata: Metadata = { title: 'Importar leads' };

export default function Page() {
  // Em produção o padrão é "somente novos" (SPEC 6.2): reimportar não sobrescreve edições.
  return <ImportWizard defaultInsertOnly={process.env.NODE_ENV === 'production'} />;
}

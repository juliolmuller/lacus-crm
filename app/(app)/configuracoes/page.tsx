import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Configurações' };

export default function Page() {
  return <Placeholder title="Configurações" phase={2} />;
}

import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Fila' };

export default function Page() {
  return <Placeholder title="Fila" phase={7} />;
}

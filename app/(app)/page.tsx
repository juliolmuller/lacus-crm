import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Início' };

export default function Page() {
  return <Placeholder title="Início" phase={5} />;
}

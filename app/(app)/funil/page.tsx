import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Funil' };

export default function Page() {
  return <Placeholder title="Funil" phase={3} />;
}

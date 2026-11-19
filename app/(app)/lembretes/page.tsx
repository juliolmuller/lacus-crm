import type { Metadata } from 'next';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'Lembretes' };

export default function Page() {
  return <Placeholder title="Lembretes" phase={4} />;
}

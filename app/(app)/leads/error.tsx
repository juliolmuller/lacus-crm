'use client';

import { RouteError } from '@/components/ui/route-error';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <RouteError what="os leads" reset={reset} />;
}

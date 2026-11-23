'use client';

import { RouteError } from '@/components/ui/route-error';

export default function ErrorPage({ reset }: { reset: () => void }): React.JSX.Element {
  return <RouteError what="os leads" reset={reset} />;
}

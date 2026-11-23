import { type Metadata } from 'next';
import { Suspense } from 'react';

import { FunnelBoard } from '@/components/funnel/board';
import { DealDetailView, DealNotFound } from '@/components/funnel/deal-detail';
import { UrlDrawer } from '@/components/ui/url-drawer';
import { getDb } from '@/lib/db';
import { getDealDetail, listBoard } from '@/lib/services/deals';

export const metadata: Metadata = { title: 'Funil' };

type SP = Promise<Record<string, string | string[] | undefined>>;

async function Drawer({ id }: { id: string }): Promise<React.JSX.Element> {
  const d = await getDealDetail(getDb(), id);

  return (
    <UrlDrawer param="deal" title={d?.deal.title ?? 'Negociação'}>
      {d ? <DealDetailView d={d} /> : <DealNotFound />}
    </UrlDrawer>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: SP;
}): Promise<React.JSX.Element> {
  const { deal } = await searchParams;
  const { stages, cards } = await listBoard(getDb());

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <h1 className="text-page">Funil</h1>
      <FunnelBoard stages={stages} cards={cards} />
      {typeof deal === 'string' && (
        <Suspense>
          <Drawer id={deal} />
        </Suspense>
      )}
    </section>
  );
}

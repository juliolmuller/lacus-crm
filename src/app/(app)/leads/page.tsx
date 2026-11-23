import { eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { Suspense } from 'react';

import { LeadDetail, LeadNotFound } from '@/components/leads/lead-detail';
import { LeadsView } from '@/components/leads/leads-view';
import { UrlDrawer } from '@/components/ui/url-drawer';
import { getDb, schema } from '@/lib/db';
import { parseFilters } from '@/lib/leads/filters-server';
import { getCatalog } from '@/lib/services/catalog';
import { getLeadDetail } from '@/lib/services/lead-detail';
import { countLeads, listLeads } from '@/lib/services/lead-list';
import { getScoreSettings } from '@/lib/services/leads';

export const metadata: Metadata = { title: 'Leads' };

type SP = Promise<Record<string, string | string[] | undefined>>;

async function Drawer({ id }: { id: string }): Promise<React.JSX.Element> {
  const db = getDb();
  const [d, cat] = await Promise.all([getLeadDetail(db, id), getCatalog(db)]);

  return (
    <UrlDrawer param="lead" title={d?.lead.name ?? 'Lead'}>
      {d ? (
        <LeadDetail
          d={d}
          niches={cat.niches.map((n) => n.name)}
          regions={cat.regions.map((r) => r.place)}
        />
      ) : (
        <LeadNotFound />
      )}
    </UrlDrawer>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: SP;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const filters = parseFilters(params);
  const db = getDb();
  const [list, total, cat, views, settings] = await Promise.all([
    listLeads(db, filters),
    countLeads(db, filters),
    getCatalog(db),
    db
      .select()
      .from(schema.savedViews)
      .where(eq(schema.savedViews.scope, 'leads'))
      .orderBy(schema.savedViews.sort),
    getScoreSettings(db),
  ]);
  const leadId = typeof params.lead === 'string' ? params.lead : null;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-page">Leads</h1>
      <LeadsView
        rows={list.rows}
        cursor={list.nextCursor}
        total={total}
        niches={cat.niches}
        regions={cat.regions}
        sources={cat.sources}
        views={views.map((v) => ({
          id: v.id,
          name: v.name,
          qs: (v.params as { qs?: string }).qs ?? '',
        }))}
        thresholds={settings.thresholds}
      />
      {leadId && (
        <Suspense>
          <Drawer id={leadId} />
        </Suspense>
      )}
    </section>
  );
}

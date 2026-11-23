import { ArrowLeft } from 'lucide-react';
import { type Metadata } from 'next';
import Link from 'next/link';

import { LeadDetail, LeadNotFound } from '@/components/leads/lead-detail';
import { getDb } from '@/lib/db';
import { getCatalog } from '@/lib/services/catalog';
import { getLeadDetail } from '@/lib/services/lead-detail';

export const metadata: Metadata = { title: 'Lead' };

/**
 * Rota cheia do lead (usada no celular; no desktop o mesmo conteúdo abre no
 * drawer).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const db = getDb();
  const [d, cat] = await Promise.all([
    /^[0-9a-f-]{36}$/i.test(id) ? getLeadDetail(db, id) : null,
    getCatalog(db),
  ]);

  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <Link
        href="/leads"
        className="inline-flex items-center gap-1 text-body text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden /> Leads
      </Link>
      {d ? (
        <LeadDetail
          d={d}
          niches={cat.niches.map((n) => n.name)}
          regions={cat.regions.map((r) => r.place)}
        />
      ) : (
        <LeadNotFound />
      )}
    </section>
  );
}

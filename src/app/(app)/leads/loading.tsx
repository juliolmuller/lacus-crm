import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <section className="flex flex-col gap-4" aria-busy>
      <h1 className="text-page">Leads</h1>
      <Skeleton className="h-9 w-full" />
      <TableSkeleton rows={10} />
    </section>
  );
}

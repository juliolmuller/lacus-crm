import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <section className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando a fila">
      <h1 className="text-page">Fila</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <TableSkeleton rows={8} />
        <Skeleton className="h-64" />
      </div>
    </section>
  );
}

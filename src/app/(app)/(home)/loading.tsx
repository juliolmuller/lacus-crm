import { Skeleton } from '@/components/ui/skeleton';

export default function Loading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando o painel">
      <h1 className="text-page">Início</h1>
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-72 w-full lg:col-span-8" />
        <Skeleton className="h-72 w-full lg:col-span-4" />
        <Skeleton className="h-72 w-full lg:col-span-8" />
        <Skeleton className="h-72 w-full lg:col-span-4" />
      </div>
    </section>
  );
}

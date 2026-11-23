import { Skeleton } from '@/components/ui/skeleton';

export default function Loading(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando o funil">
      <h1 className="text-page">Funil</h1>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-72 w-72 shrink-0" />
        ))}
      </div>
    </section>
  );
}

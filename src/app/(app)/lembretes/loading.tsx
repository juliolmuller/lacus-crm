import { Skeleton } from '@/components/ui/skeleton';

export default function Loading(): React.JSX.Element {
  return (
    <section
      className="flex max-w-4xl flex-col gap-4"
      aria-busy="true"
      aria-label="Carregando os lembretes"
    >
      <h1 className="text-page">Lembretes</h1>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </section>
  );
}

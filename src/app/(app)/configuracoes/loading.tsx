import { Skeleton } from '@/components/ui/skeleton';

export default function Loading(): React.JSX.Element {
  return (
    <section
      className="flex max-w-4xl flex-col gap-6"
      aria-busy="true"
      aria-label="Carregando as configurações"
    >
      <h1 className="text-page">Configurações</h1>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </section>
  );
}

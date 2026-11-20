import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <section
      className="flex max-w-3xl flex-col gap-4"
      aria-busy="true"
      aria-label="Carregando o lead"
    >
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-64 w-full" />
    </section>
  );
}

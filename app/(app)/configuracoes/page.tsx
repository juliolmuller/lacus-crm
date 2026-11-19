import type { Metadata } from 'next';
import { StageSettings } from '@/components/funnel/stage-settings';
import { getDb } from '@/lib/db';
import { listStages } from '@/lib/services/stages';

export const metadata: Metadata = { title: 'Configurações' };

export default async function Page() {
  const rows = await listStages(getDb());
  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-page">Configurações</h1>
      <div className="flex flex-col gap-3">
        <h2 className="text-section">Funil</h2>
        <p className="text-body text-text-muted">
          Etapas do quadro, na ordem de exibição. Entrar numa etapa define o status do lead, mas só
          para frente. Ganho e Perdido ficam sempre disponíveis.
        </p>
        <StageSettings
          stages={rows.map(({ stage: s, open }) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            defaultProbability: s.defaultProbability,
            leadStatus: s.leadStatus,
            isWon: s.isWon,
            isLost: s.isLost,
            archived: s.archivedAt !== null,
            open,
          }))}
        />
      </div>
      <p className="text-body text-text-muted">
        Score, follow-ups, modelos, Google Calendar, tokens, perfil e dados chegam nas fases 4 a 8.
      </p>
    </section>
  );
}

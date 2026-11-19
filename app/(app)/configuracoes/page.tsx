import { desc } from 'drizzle-orm';
import type { Metadata } from 'next';
import { StageSettings } from '@/components/funnel/stage-settings';
import { FollowupSettings } from '@/components/settings/followup-settings';
import { GoogleSettings } from '@/components/settings/google-settings';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { TemplateSettings } from '@/components/settings/template-settings';
import { getDb, schema } from '@/lib/db';
import { spYmd } from '@/lib/followups/business-days';
import { googleAvailable, googleConfigured } from '@/lib/google/oauth';
import { syncOverview } from '@/lib/services/calendar-sync';
import { getSetting, listRules, listTemplates } from '@/lib/services/followup-settings';
import { listStages } from '@/lib/services/stages';
import { cadence, cancelOn } from '@/lib/validation/followups';
import { eq } from 'drizzle-orm';

export const metadata: Metadata = { title: 'Configurações' };

const { leads, niches, regions } = schema;

const H = ({ id, children }: { id: string; children: string }) => (
  <h2 id={id} className="text-section scroll-mt-4">
    {children}
  </h2>
);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const { google } = await searchParams;
  const db = getDb();
  const [rows, rules, templates, profile, calendar, popup, overview, previewLeads] =
    await Promise.all([
      listStages(db),
      listRules(db),
      listTemplates(db),
      getSetting(db, 'owner_profile'),
      getSetting(db, 'business_calendar'),
      getSetting(db, 'calendar_defaults'),
      syncOverview(db),
      db
        .select({
          id: leads.id,
          name: leads.name,
          mapsRating: leads.mapsRating,
          mapsReviews: leads.mapsReviews,
          websiteStatus: leads.websiteStatus,
          pitch: leads.pitch,
          niche: niches.name,
          city: regions.city,
          neighborhood: regions.neighborhood,
        })
        .from(leads)
        .innerJoin(niches, eq(niches.id, leads.nicheId))
        .innerJoin(regions, eq(regions.id, leads.regionId))
        .orderBy(desc(leads.score))
        .limit(30),
    ]);
  const stages = rows.map(({ stage }) => ({ id: stage.id, name: stage.name }));
  const validRules = rules.flatMap((r) => {
    const c = cadence.safeParse(r.cadence);
    const o = cancelOn.safeParse(r.cancelOn);
    return c.success && o.success
      ? [
          {
            id: r.id,
            name: r.name,
            active: r.active,
            trigger: r.trigger,
            stageId: r.stageId,
            interactionOutcome: r.interactionOutcome,
            interactionDirection: r.interactionDirection,
            interactionType: r.interactionType,
            cadence: c.data,
            cancelOn: o.data,
          },
        ]
      : [];
  });
  const lede = 'text-body text-text-muted';

  return (
    <section className="flex max-w-4xl flex-col gap-8">
      <h1 className="text-page">Configurações</h1>

      <div className="flex flex-col gap-3">
        <H id="funil">Funil</H>
        <p className={lede}>
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

      <div className="flex flex-col gap-3">
        <H id="followups">Follow-ups</H>
        <p className={lede}>
          Regras criam lembretes nos dias úteis (sem fins de semana, feriados nacionais e de
          Curitiba). Elas nunca enviam mensagens.
        </p>
        <FollowupSettings
          rules={validRules}
          stages={stages}
          templates={templates.map((t) => ({ key: t.key, name: t.name }))}
          calendar={calendar}
          today={spYmd(new Date())}
        />
      </div>

      <div className="flex flex-col gap-3">
        <H id="modelos">Modelos de mensagem</H>
        <p className={lede}>
          Use as variáveis para personalizar. Se faltar algum dado do lead, o botão do WhatsApp fica
          bloqueado até completar.
        </p>
        <TemplateSettings
          templates={templates.map((t) => ({
            id: t.id,
            key: t.key,
            name: t.name,
            channel: t.channel,
            body: t.body,
            active: t.active,
          }))}
          leads={previewLeads}
          profile={profile}
        />
      </div>

      <div className="flex flex-col gap-3">
        <H id="google">Google Calendar</H>
        <p className={lede}>
          Cada lembrete aberto vira um evento no calendário “Lacus CRM – Follow-ups”. Concluir ou
          cancelar apaga o evento.
        </p>
        <GoogleSettings
          configured={googleConfigured()}
          available={googleAvailable()}
          status={overview.status}
          email={overview.email}
          calendarId={overview.calendarId}
          lastError={overview.lastError}
          errors={overview.errors}
          pending={overview.pending}
          popupMinutes={popup.popupReminderMinutes}
          flash={google ?? null}
        />
      </div>

      <div className="flex flex-col gap-3">
        <H id="perfil">Perfil</H>
        <p className={lede}>Nome, assinatura e portfólio usados nas variáveis dos modelos.</p>
        <ProfileSettings profile={profile} />
      </div>

      <p className={lede}>Score, tokens de API, dados e aparência chegam nas fases 5 a 8.</p>
    </section>
  );
}

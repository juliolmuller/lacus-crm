import { pgEnum } from 'drizzle-orm/pg-core';

export const nicheTicket = pgEnum('niche_ticket', ['high', 'medium', 'low']);
export const nicheOpenness = pgEnum('niche_openness', ['high', 'medium', 'low']);
export const websiteStatus = pgEnum('website_status', [
  'none',
  'social_only',
  'bad',
  'good',
  'unknown',
]);
export const contactStatus = pgEnum('contact_status', [
  'new',
  'to_contact',
  'contacted',
  'no_response',
  'replied',
  'negotiating',
  'client',
  'lost',
  'discarded',
]);
export const queueStatus = pgEnum('queue_status', ['pending', 'done', 'error']);
export const dealStatus = pgEnum('deal_status', ['open', 'won', 'lost']);
export const actorSource = pgEnum('actor_source', ['ui', 'mcp', 'rule', 'import']);
export const interactionType = pgEnum('interaction_type', [
  'whatsapp',
  'call',
  'email',
  'instagram_dm',
  'in_person',
  'meeting',
  'proposal',
  'note',
  'system',
]);
export const interactionDirection = pgEnum('interaction_direction', [
  'outbound',
  'inbound',
  'internal',
]);
export const interactionOutcome = pgEnum('interaction_outcome', [
  'no_answer',
  'replied',
  'interested',
  'not_interested',
  'asked_later',
  'meeting_set',
  'proposal_requested',
  'opt_out',
]);
export const interactionCreatedBy = pgEnum('interaction_created_by', [
  'user',
  'mcp',
  'rule',
  'import',
]);
export const reminderStatus = pgEnum('reminder_status', ['open', 'done', 'canceled']);
export const reminderSource = pgEnum('reminder_source', ['manual', 'rule', 'mcp']);
export const syncStatus = pgEnum('sync_status', ['pending', 'synced', 'error', 'disabled']);
export const followupTrigger = pgEnum('followup_trigger', [
  'deal_created',
  'deal_stage_entered',
  'interaction_logged',
]);
export const templateChannel = pgEnum('template_channel', ['whatsapp', 'email', 'instagram']);
export const googleStatus = pgEnum('google_status', ['active', 'needs_reauth', 'revoked']);
export const viewScope = pgEnum('view_scope', ['leads', 'deals']);

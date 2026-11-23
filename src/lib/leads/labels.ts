/**
 * Rótulos pt-BR dos enums de lead (SPEC 4.2 e planilha).
 */
export const statusLabel = {
  new: 'Novo',
  to_contact: 'A abordar',
  contacted: 'Abordado',
  no_response: 'Sem resposta',
  replied: 'Respondeu',
  negotiating: 'Em negociação',
  client: 'Cliente',
  lost: 'Perdido',
  discarded: 'Descartado',
} as const;
export type ContactStatus = keyof typeof statusLabel;
export const contactStatuses = Object.keys(statusLabel) as ContactStatus[];

export const siteLabel = {
  none: 'Não tem',
  social_only: 'Só rede social',
  bad: 'Ruim',
  good: 'Bom',
  unknown: 'Não avaliado',
} as const;
export type WebsiteStatus = keyof typeof siteLabel;
export const websiteStatuses = Object.keys(siteLabel) as WebsiteStatus[];

export const ticketLabel = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' } as const;

export const interactionTypes = [
  'whatsapp',
  'call',
  'email',
  'instagram_dm',
  'in_person',
  'meeting',
  'proposal',
  'note',
] as const;
export const interactionLabel = {
  whatsapp: 'WhatsApp',
  call: 'Ligação',
  email: 'E-mail',
  instagram_dm: 'Instagram',
  in_person: 'Presencial',
  meeting: 'Reunião',
  proposal: 'Proposta',
  note: 'Nota',
  system: 'Sistema',
} as const;
export const directionLabel = {
  outbound: 'Enviada por mim',
  inbound: 'Recebida',
  internal: 'Interna',
} as const;
export const outcomeLabel = {
  no_answer: 'Sem resposta',
  replied: 'Respondeu',
  interested: 'Interessado',
  not_interested: 'Sem interesse',
  asked_later: 'Pediu para retomar depois',
  meeting_set: 'Reunião marcada',
  proposal_requested: 'Pediu proposta',
  opt_out: 'Pediu para não ser contatado',
} as const;

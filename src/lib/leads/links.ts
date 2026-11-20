/** Links das ações rápidas. Só http(s) vira link; o resto é descartado (valores vêm de planilha e de IA). */
export function safeUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "@perfil", "perfil" ou URL → https://instagram.com/perfil. */
export function instagramUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (/instagram\.com/i.test(v)) return safeUrl(v);
  const handle = v.replace(/^@/, '').trim();
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://instagram.com/${handle}` : null;
}

/** E.164 (+5541...) → wa.me sem o "+". */
export const whatsappUrl = (e164: string | null | undefined, text?: string) =>
  e164
    ? `https://wa.me/${e164.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`
    : null;

export const telUrl = (e164: string | null | undefined) => (e164 ? `tel:${e164}` : null);

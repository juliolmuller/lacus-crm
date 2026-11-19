import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Chaves por versão ({ v1: segredo }); a cifra nova usa a versão pedida, a decifra lê o prefixo. */
export type KeyRing = Record<string, string>;

const keyOf = (secret: string) => createHash('sha256').update(secret).digest();

/** AES-256-GCM. Formato: `v1.<iv>.<tag>.<texto>` (base64url). */
export function encrypt(plain: string, keys: KeyRing, version = 'v1'): string {
  const secret = keys[version];
  if (!secret) throw new Error(`chave ${version} ausente`);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [version, iv, c.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function decrypt(blob: string, keys: KeyRing): string {
  const [version, iv, tag, data] = blob.split('.');
  const secret = version ? keys[version] : undefined;
  if (!secret || !iv || !tag || data === undefined) throw new Error('texto cifrado inválido');
  const d = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

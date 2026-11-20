export type OwnerConfig = { sub?: string; email?: string };
export type Identity = {
  sub?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
};

/**
 * Allowlist do dono (SPEC 5.1). Com OWNER_VERCEL_USER_ID definido, só o `sub` vale.
 * Sem ele, vale o e-mail verificado igual a OWNER_EMAIL. Sem nenhum dos dois, ninguém entra.
 */
export function isOwner(identity: Identity, owner: OwnerConfig): boolean {
  if (owner.sub) return identity.sub === owner.sub;
  if (owner.email) {
    return !!identity.emailVerified && identity.email?.toLowerCase() === owner.email.toLowerCase();
  }
  return false;
}

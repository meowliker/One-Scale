export const ONE_SCALE_SESSION_COOKIE = 'onescale_session';

export type AppSessionRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface AppSessionClaims {
  userId: string;
  email: string;
  role: AppSessionRole;
  workspaceId: string;
  expiresAt: number;
}

export function getDashboardPassword(): string {
  return (process.env.APP_DASHBOARD_PASSWORD || '').trim();
}

export function getDashboardSessionToken(): string {
  const explicit = (process.env.APP_DASHBOARD_TOKEN || '').trim();
  if (explicit) return explicit;
  // Fallback for local/dev usage only.
  return getDashboardPassword();
}

export function isDashboardAuthEnabled(): boolean {
  const explicitEnable = (process.env.APP_REQUIRE_LOGIN || '').trim().toLowerCase() === 'true';
  if (explicitEnable) return true;
  return getDashboardPassword().length > 0;
}

function getSessionSecret(): string {
  return (
    (process.env.APP_SESSION_SECRET || '').trim() ||
    (process.env.APP_DASHBOARD_TOKEN || '').trim() ||
    getDashboardPassword() ||
    'local-dev-session-secret'
  );
}

function b64UrlEncode(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSignedSessionToken(claims: AppSessionClaims): Promise<string> {
  const payloadJson = JSON.stringify(claims);
  const payload = b64UrlEncode(new TextEncoder().encode(payloadJson));
  const key = await importSigningKey(getSessionSecret());
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  );
  const signature = b64UrlEncode(new Uint8Array(signatureBytes));
  return `${payload}.${signature}`;
}

export async function verifySignedSessionToken(token: string): Promise<AppSessionClaims | null> {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  try {
    const key = await importSigningKey(getSessionSecret());
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64UrlDecode(signature),
      new TextEncoder().encode(payload)
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(b64UrlDecode(payload))) as AppSessionClaims;
    if (!claims?.userId || !claims?.workspaceId || !claims?.email || !claims?.role || !claims?.expiresAt) {
      return null;
    }
    if (Date.now() >= claims.expiresAt) return null;
    return claims;
  } catch {
    return null;
  }
}

import crypto from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';

function getEncryptionSecret(): string {
  return process.env.APP_ENCRYPTION_KEY
    || process.env.TOKEN_ENCRYPTION_SECRET
    || '';
}

function getKey(): Buffer | null {
  const secret = getEncryptionSecret().trim();
  if (!secret) return null;
  // Derive a stable 32-byte key from the provided secret.
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  const key = getKey();
  if (!key) return plain;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

export function decryptSecret(cipherText: string): string {
  if (!cipherText) return cipherText;
  if (!cipherText.startsWith(ENCRYPTED_PREFIX)) return cipherText;

  const key = getKey();
  if (!key) return cipherText;

  try {
    const body = cipherText.slice(ENCRYPTED_PREFIX.length);
    const [ivB64, payloadB64, tagB64] = body.split(':');
    if (!ivB64 || !payloadB64 || !tagB64) return cipherText;

    const iv = Buffer.from(ivB64, 'base64');
    const payload = Buffer.from(payloadB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return cipherText;
  }
}

export function isEncryptionConfigured(): boolean {
  return !!getKey();
}

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION_PREFIX = 'enc:v1';

function getKey(): Buffer {
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
    );
  }
  return key;
}

/** Encrypt plaintext with AES-256-GCM. Returns `enc:v1:iv:tag:ciphertext` (hex). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION_PREFIX,
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/** Decrypt a value produced by `encrypt`. */
export function decrypt(payload: string): string {
  const parts = payload.split(':');
  if (
    parts.length !== 5 ||
    parts[0] !== 'enc' ||
    parts[1] !== 'v1' ||
    !parts[2] ||
    !parts[3] ||
    !parts[4]
  ) {
    throw new Error('Invalid encrypted payload format');
  }

  const [, , ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

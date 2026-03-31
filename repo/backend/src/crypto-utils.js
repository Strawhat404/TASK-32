import crypto from 'crypto';

function getKey() {
  const raw = process.env.APP_AES_KEY;
  if (!raw) {
    throw new Error('APP_AES_KEY is required');
  }
  if (raw.length === 64) {
    return Buffer.from(raw, 'hex');
  }
  const key = Buffer.from(raw, 'utf8');
  if (key.length === 32) {
    return key;
  }
  throw new Error('APP_AES_KEY must be 32 UTF-8 bytes or 64 hex characters');
}

const ENCRYPTION_KEY = getKey();

export function encryptSensitive(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSensitive(payload) {
  if (!payload) return '';
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

export function maskPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D+/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `***-***-${digits.slice(-4)}`;
}

export function normalizePhone(phone) {
  return (phone || '').replace(/\D+/g, '');
}
